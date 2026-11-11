import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.events import EventBus
from app.execution_ledger import ExecutionLedger
from app.models import AppendCall, EventRecord, Profile, TaskDefinition
from app.runner import MaaRunnerService


class CallbackAdapter:
    def __init__(self, events):
        self.events = events
        self.calls = []
        self.queue = []
        self.starts = 0
        self.is_connected = False
        self.task_chain_status = "Completed"
        self.depot_ok = True
        self.depot_data = True
        self.fight_drops = 0
        self.stop_calls = 0

    async def connect(self, profile):
        self.is_connected = True
        return True

    async def append_task(self, call):
        self.calls.append(call)
        core_id = len(self.calls)
        self.queue.append((core_id, call))
        return core_id

    def emit(self, message, core_id, **outer):
        self.events.publish(EventRecord.now("maa.callback", "", detail={"message": message, "details": {"taskid": core_id, **outer}}))

    async def start(self, wait=True):
        self.starts += 1
        self.task_chain_status = "Completed"
        for core_id, call in self.queue:
            self.emit(10001, core_id)
            if call.type == "Depot":
                if self.depot_data:
                    self.emit(20003, core_id, what="DepotInfo", details={"done": True, "data": {"30011": 2, "30012": 1}})
                self.emit(10002 if self.depot_ok else 10000, core_id)
                if not self.depot_ok:
                    self.task_chain_status = "Failed"
            elif call.type == "Fight":
                item_id = next(iter(call.params.get("drops", {"30011": 1})))
                self.emit(20003, core_id, what="StageDrops", details={
                    "stage": {"stageCode": call.params.get("stage", "1-7")},
                    "drops": [{"itemId": item_id, "quantity": self.fight_drops}],
                    "stats": [{"itemId": item_id, "quantity": 999, "addQuantity": self.fight_drops}],
                })
                self.emit(10002, core_id)
            else:
                self.emit(10002, core_id)
        self.queue.clear()
        return True

    async def stop(self):
        self.stop_calls += 1
        self.queue.clear()
        return True


CONTEXT = {"items": {}, "known_stages": {"1-7", "CE-6"}, "open_stages": {"1-7"},
           "activity_open": False, "resource_open": False}


class TrackedRunnerTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.events = EventBus()
        self.ledger = ExecutionLedger(Path(self.temp.name) / "ledger.json", self.events)
        self.adapter = CallbackAdapter(self.events)
        self.runner = MaaRunnerService(self.adapter, self.events, ledger=self.ledger)

    async def run_profile(self, tasks):
        with patch("app.runner.inventory_context", return_value=CONTEXT):
            await self.runner.run(Profile(name="daily", tasks=tasks))
            return await self.runner.wait_for_completion()

    def inventory_task(self, **params):
        return TaskDefinition(id="stock", type="DepotMaintain", params={
            "targets": [{"item_id": "30011", "quantity": 10, "stage": "1-7"},
                        {"item_id": "30012", "quantity": 8, "stage": "1-7", "use_medicine": True, "medicine": 2, "use_stone": True, "stone": 3}],
            **params,
        })

    async def test_ordinary_profile_preserves_one_native_queue(self):
        status = await self.run_profile([TaskDefinition(id="award", type="Award"), TaskDefinition(id="recruit", type="Recruit")])
        self.assertEqual(status.state, "Completed")
        self.assertEqual(self.adapter.starts, 1)
        self.assertEqual([call.type for call in self.adapter.calls], ["Award", "Recruit"])

    async def test_inventory_uses_real_deficits_and_independent_budgets_even_if_first_incomplete(self):
        status = await self.run_profile([self.inventory_task(use_medicine=True, use_stone=False, use_auto_series=True, use_expiring_medicine=True)])
        self.assertEqual(status.state, "Completed")
        self.assertEqual([call.type for call in self.adapter.calls], ["Depot", "Fight", "Fight"])
        first, second = self.adapter.calls[1:]
        self.assertEqual(first.params["drops"], {"30011": 8})
        self.assertEqual(second.params["drops"], {"30012": 7})
        self.assertEqual((first.params["medicine"], second.params["medicine"], second.params["stone"]), (0, 2, 0))
        self.assertEqual(first.params["series"], 0)
        self.assertEqual(first.params["medicine_expire_days"], 2)
        self.assertEqual(first.params["times"], 2147483647)

    async def test_only_first_stops_after_first_dispatch(self):
        await self.run_profile([self.inventory_task(only_first=True)])
        self.assertEqual([call.type for call in self.adapter.calls], ["Depot", "Fight"])

    async def test_failed_or_missing_depot_never_dispatches_fight(self):
        for failed, missing in ((True, False), (False, True)):
            self.adapter.calls.clear()
            self.adapter.depot_ok = not failed
            self.adapter.depot_data = not missing
            status = await self.run_profile([self.inventory_task()])
            self.assertEqual(status.state, "Failed")
            self.assertEqual([call.type for call in self.adapter.calls], ["Depot"])

    async def test_no_baseline_and_closed_stage_do_not_farm(self):
        status = await self.run_profile([self.inventory_task(update_depot=False)])
        self.assertEqual(status.state, "Failed")
        self.assertEqual(self.adapter.calls, [])
        status = await self.run_profile([self.inventory_task(targets=[{"item_id": "30011", "quantity": 10, "stage": "CE-6"}])])
        self.assertEqual(status.state, "Completed")
        self.assertEqual([call.type for call in self.adapter.calls], ["Depot"])

    async def test_external_ownership_covers_connect_cancel_and_stop_failure(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def connect(profile):
            entered.set()
            await release.wait()
            return True
        async def stop():
            raise RuntimeError("stop failed")
        self.adapter.connect = connect
        self.adapter.stop = stop
        job = asyncio.create_task(self.runner.run_external(Profile(name="daily"), AppendCall(task_id="tool", type="Award", params={})))
        await entered.wait()
        with self.assertRaises(RuntimeError):
            await self.runner.run(Profile(name="other"))
        job.cancel()
        await asyncio.sleep(0)
        self.assertTrue(self.runner.is_running())
        release.set()
        with self.assertRaises(asyncio.CancelledError):
            await job
        self.assertFalse(self.runner.is_running())
        self.assertEqual(self.adapter.calls, [])

    async def test_stop_during_external_connect_prevents_late_start(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def connect(profile):
            entered.set()
            await release.wait()
            return True
        self.adapter.connect = connect
        job = asyncio.create_task(self.runner.run_external(Profile(name="daily"), AppendCall(task_id="copilot-test", type="Copilot", params={})))
        await entered.wait()
        await self.runner.stop()
        release.set()
        with self.assertRaises(RuntimeError):
            await job
        self.assertEqual(self.adapter.starts, 0)
        self.assertFalse(self.runner.is_running())

    async def test_stop_during_last_append_never_starts_late_task(self):
        entered, release = asyncio.Event(), asyncio.Event()
        original = self.adapter.append_task
        async def append(call):
            entered.set()
            await release.wait()
            return await original(call)
        self.adapter.append_task = append
        await self.runner.run(Profile(name="daily", tasks=[TaskDefinition(id="award", type="Award")]))
        await entered.wait()
        await self.runner.stop()
        release.set()
        status = await self.runner.wait_for_completion()
        self.assertEqual(status.state, "Stopped")
        self.assertEqual(self.adapter.starts, 0)
        self.assertEqual(self.adapter.queue, [])

    async def test_only_startup_retries_cannot_turn_failure_into_success(self):
        async def failed_start(wait=True):
            self.adapter.queue.clear()
            self.adapter.task_chain_status = "Failed"
            return True
        self.adapter.start = failed_start
        self.runner._sleep = lambda seconds: None
        status = await self.run_profile([TaskDefinition(id="startup", type="StartUp", params={"startup_retry_times": 2, "startup_retry_wait_a_seconds": 0, "startup_retry_wait_b_seconds": 0})])
        self.assertEqual(status.state, "Failed")

    async def test_userdata_success_is_independent_of_later_task_failure(self):
        original = self.adapter.start
        async def failing_batch(wait=True):
            await original(wait)
            self.adapter.task_chain_status = "Failed"
            return True
        self.adapter.start = failing_batch
        status = await self.run_profile([TaskDefinition(id="data", type="UserDataUpdate", params={"trigger_interval": "Daily"}), TaskDefinition(id="fight", type="Fight")])
        self.assertEqual(status.state, "Failed")
        self.assertIn("data", self.ledger.snapshot(Profile(name="daily"))["userdata"])

    async def test_userdata_without_complete_depot_data_is_not_recorded(self):
        self.adapter.depot_data = False
        await self.run_profile([TaskDefinition(id="data", type="UserDataUpdate", params={"trigger_interval": "Daily"})])
        self.assertNotIn("data", self.ledger.snapshot(Profile(name="daily")).get("userdata", {}))

    async def test_single_task_context_uses_full_profile_identity(self):
        full = Profile(name="daily", tasks=[TaskDefinition(id="startup", type="StartUp", params={"account_name": "named-account"}), TaskDefinition(id="fight", type="Fight", params={"stage": "1-7"})])
        single = full.model_copy(deep=True)
        single.tasks = [single.tasks[-1]]
        await self.runner.run(single, context_profile=full)
        await self.runner.wait_for_completion()
        self.assertEqual(len(self.ledger.snapshot(full)["reports"]), 1)
        self.assertEqual([call.type for call in self.adapter.calls], ["Fight"])

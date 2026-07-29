import unittest
from unittest.mock import MagicMock

from app.events import EventBus
from app.logs import MaaLogService
from app.maa_adapter import (
    _parse_depot_items,
    _parse_recruit_combinations,
    _split_oper_box,
)
from app.models import Profile
from app.runner import DryRunMaaAdapter, MaaRunnerService


class RunnerStopTest(unittest.IsolatedAsyncioTestCase):
    async def test_stop_without_active_run_keeps_idle_state(self):
        """小工具点 Stop! 不应把 runner 永久钉死在 Stopping（会锁死一键长草）。"""
        events = EventBus()
        runner = MaaRunnerService(DryRunMaaAdapter(), events, MaaLogService(events))

        status = await runner.stop()

        self.assertEqual(status.state, "Idle")
        self.assertFalse(runner.is_running())

    async def test_stop_during_run_marks_stopping(self):
        import asyncio

        class BlockingAdapter(DryRunMaaAdapter):
            """connect 一直挂起，保证 stop() 执行时任务确实在运行中。"""

            async def connect(self, profile):
                await asyncio.Event().wait()
                return True

            async def stop(self):
                return True

        events = EventBus()
        runner = MaaRunnerService(BlockingAdapter(), events, MaaLogService(events))
        await runner.run(Profile(name="daily"))
        await asyncio.sleep(0)

        status = await runner.stop()

        self.assertEqual(status.state, "Stopping")
        self.assertTrue(runner.is_running())


class ToolConnectionTest(unittest.IsolatedAsyncioTestCase):
    async def test_ensure_connected_connects_when_adapter_idle(self):
        from app.api import ensure_adapter_connected

        events = EventBus()
        adapter = DryRunMaaAdapter()
        runner = MaaRunnerService(adapter, events, MaaLogService(events))
        profile = Profile(name="daily")

        self.assertFalse(adapter.is_connected)
        await ensure_adapter_connected(runner, profile)

        self.assertTrue(adapter.is_connected)

    async def test_ensure_connected_rejects_while_profile_running(self):
        from app.api import ensure_adapter_connected

        events = EventBus()
        runner = MaaRunnerService(DryRunMaaAdapter(), events, MaaLogService(events))
        await runner.run(Profile(name="daily"))

        with self.assertRaises(RuntimeError):
            await ensure_adapter_connected(runner, Profile(name="daily"))
        await runner.shutdown()


class AppendTaskGuardTest(unittest.IsolatedAsyncioTestCase):
    async def test_append_task_rejects_zero_task_id(self):
        """AsstAppendTask 参数校验失败时返回 0，必须报错而不是静默丢弃。"""
        from app.maa_adapter import OfficialMaaAdapter
        from app.models import AppendCall
        from pathlib import Path

        adapter = OfficialMaaAdapter(core_dir=Path("."), user_dir=Path("."))
        adapter._asst = MagicMock()
        adapter._asst.append_task.return_value = 0

        with self.assertRaisesRegex(RuntimeError, "拒绝"):
            await adapter.append_task(AppendCall(task_id="rg", type="Roguelike", params={}))


class CallbackParsingTest(unittest.TestCase):
    def test_depot_data_is_a_json_string(self):
        """MaaCore DepotInfo.details = {done, data: "{itemId: count}"}。"""
        items = _parse_depot_items({"done": True, "data": '{"30011": 5, "30012": 0}'})

        self.assertEqual([(item["itemId"], item["count"]) for item in items], [("30011", 5), ("30012", 0)])
        self.assertIn("itemName", items[0])

    def test_depot_handles_broken_payload(self):
        self.assertEqual(_parse_depot_items({"data": "not-json"}), [])
        self.assertEqual(_parse_depot_items({}), [])

    def test_operbox_not_owned_is_derived_from_all_opers(self):
        own, not_own = _split_oper_box({
            "done": True,
            "own_opers": [{"id": "char_002_amiya", "name": "阿米娅", "rarity": 5, "own": True}],
            "all_opers": [
                {"id": "char_002_amiya", "name": "阿米娅", "rarity": 5, "own": True},
                {"id": "char_003_kalts", "name": "凯尔希", "rarity": 6, "own": False},
            ],
        })

        self.assertEqual([item["name"] for item in own], ["阿米娅"])
        self.assertEqual([item["name"] for item in not_own], ["凯尔希"])

    def test_recruit_result_combinations_are_parsed(self):
        combinations = _parse_recruit_combinations({
            "level": 4,
            "result": [
                {
                    "tags": ["资深干员", "输出"],
                    "level": 5,
                    "opers": [{"name": "夜莺", "id": "char_179_cgbird", "level": 5}],
                }
            ],
        })

        self.assertEqual(combinations[0]["tags"], ["资深干员", "输出"])
        self.assertEqual(combinations[0]["level"], 5)
        self.assertEqual(combinations[0]["opers"][0]["name"], "夜莺")


class AdapterConnectionStateTest(unittest.IsolatedAsyncioTestCase):
    async def test_is_connected_stays_false_when_connect_fails(self):
        """连接失败后 _asst 仍非 None，不能因此认为「已连接」而跳过重连。"""
        from app.maa_adapter import OfficialMaaAdapter
        from pathlib import Path

        adapter = OfficialMaaAdapter(core_dir=Path("."), user_dir=Path("."))
        adapter._resolve_asst_cls = lambda: MagicMock()
        adapter._load_resources = lambda cls, profile: True
        adapter._build_callback = lambda cls: None
        adapter._set_connection_extras = lambda profile, cls: None
        adapter._set_instance_options = lambda profile: None
        adapter._connect_with_retry = lambda profile: False

        connected = await adapter.connect(Profile(name="daily"))

        self.assertFalse(connected)
        self.assertIsNotNone(adapter._asst)
        self.assertFalse(adapter.is_connected)


if __name__ == "__main__":
    unittest.main()

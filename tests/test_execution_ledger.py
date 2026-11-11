import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from app.events import EventBus
from app.execution_ledger import ExecutionLedger, profile_identity
from app.inventory import stock_with_dual_chips
from app.models import AdbConfig, AppendCall, EventRecord, Profile, TaskDefinition


class ExecutionLedgerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "ledger.json"
        self.events = EventBus()
        self.clock = datetime(2026, 11, 10, 19, 59, tzinfo=timezone.utc)
        self.ledger = ExecutionLedger(self.path, self.events, now=lambda: self.clock)
        self.profile = Profile(name="daily")
        self.ledger.begin(self.profile)

    def emit(self, message, core_id=1, **outer):
        self.events.publish(EventRecord.now("maa.callback", "", detail={
            "message": message, "details": {"taskid": core_id, **outer},
        }))

    def start(self, kind, core_id=1, **params):
        self.ledger.bind(core_id, AppendCall(task_id=f"test-{core_id}", type=kind, params=params))
        self.emit(10001, core_id)

    def depot(self, core_id=1, items=None, terminal=10002):
        self.start("Depot", core_id)
        self.emit(20003, core_id, what="DepotInfo", details={"done": True, "data": items or {"30011": 10}})
        self.emit(terminal, core_id)

    def test_depot_requires_done_and_same_task_success(self):
        self.start("Depot")
        self.emit(20003, what="DepotInfo", details={"done": True, "data": {"30011": 10}})
        with self.assertRaises(RuntimeError):
            self.ledger.stock("30011")
        self.emit(10002, 2)
        with self.assertRaises(RuntimeError):
            self.ledger.stock("30011")
        self.emit(10002)
        self.assertEqual(self.ledger.stock("30011"), 10)
        self.depot(2, terminal=10000)
        with self.assertRaises(RuntimeError):
            self.ledger.stock("30011")

    def test_two_depots_bound_before_first_run_do_not_restore_failed_snapshot(self):
        for core_id in (1, 2):
            self.ledger.bind(core_id, AppendCall(task_id=str(core_id), type="Depot", params={}))
        self.emit(10001)
        self.emit(20003, what="DepotInfo", details={"done": True, "data": {"30011": 12}})
        self.emit(10002)
        self.assertEqual(self.ledger.stock("30011"), 12)
        self.emit(10001, 2)
        self.emit(10000, 2)
        self.assertFalse(self.ledger.snapshot(self.profile)["inventory"]["trusted"])

    def test_missing_or_empty_depot_data_never_becomes_trusted(self):
        for data in (None, {}, {"30011": -1}, {"30011": True}):
            with self.subTest(data=data):
                self.ledger.begin(self.profile)
                self.start("Depot")
                self.emit(20003, what="DepotInfo", details={"done": True, "data": data})
                self.emit(10002)
                with self.assertRaises(RuntimeError):
                    self.ledger.inventory()

    def test_account_alias_disabled_startup_and_unknown_login(self):
        self.profile.tasks = [TaskDefinition(id="startup", type="StartUp", enabled=False, params={"account_name": "account-a"})]
        identity = profile_identity(self.profile)
        self.profile.tasks[0].enabled = True
        self.assertEqual(identity, profile_identity(self.profile))
        self.ledger.begin(self.profile)
        self.depot()
        with self.assertRaisesRegex(RuntimeError, "账号"):
            self.ledger.stock("30011")
        self.start("StartUp", 2, account_name="account-a")
        self.emit(10002, 2)
        self.depot(3)
        self.assertEqual(self.ledger.stock("30011"), 10)
        other = self.profile.model_copy(deep=True)
        other.adb.address = "other:5555"
        self.assertEqual(self.ledger.snapshot(other), {})

    def test_disabled_startup_does_not_verify_account_or_pollute_old_stock(self):
        self.profile.tasks = [TaskDefinition(id="startup", type="StartUp", params={"account_name": "account-b"})]
        self.ledger.begin(self.profile, account_verified=True)
        self.depot()
        self.ledger.begin(self.profile)
        self.start("StartUp", 2, account_name="account-b", enable=False)
        self.emit(10002, 2)
        self.assertFalse(self.ledger.account_verified)
        self.start("Fight", 3)
        self.emit(20003, 3, what="StageDrops", details={"stats": [{"itemId": "30011", "addQuantity": 100}]})
        self.assertEqual(self.ledger.snapshot(self.profile)["inventory"]["items"]["30011"], 10)
        self.start("StartUp", 4, account_name="account-b")
        self.emit(10002, 4)
        self.assertTrue(self.ledger.account_verified)
        self.start("StartUp", 5, account_name="account-a")
        self.assertFalse(self.ledger.account_verified)

    def test_credit_once_requires_success_callback_and_resets_at_server_four(self):
        call = AppendCall(task_id="mall", type="Mall", params={"visit_friends": True, "visit_friends_once": True, "credit_fight": True, "credit_fight_once": True})
        self.start("Mall")
        self.emit(10002)
        self.assertTrue(self.ledger.prepare(call).params["credit_fight"])
        self.emit(20002, subtask="ProcessTask", details={"task": "StageDrops-Stars-3"})
        self.emit(20002, subtask="ProcessTask", details={"task": "VisitLimited"})
        self.assertFalse(self.ledger.prepare(call).params["credit_fight"])
        self.assertFalse(self.ledger.prepare(call).params["visit_friends"])
        self.clock = datetime(2026, 11, 10, 20, 0, tzinfo=timezone.utc)
        self.assertTrue(self.ledger.prepare(call).params["visit_friends"])
        reloaded = ExecutionLedger(self.path, EventBus(), now=lambda: self.clock)
        reloaded.begin(self.profile)
        self.assertTrue(reloaded.prepare(call).params["credit_fight"])

    def test_fight_counts_per_round_not_cumulative_and_consumes_multiplier(self):
        self.depot()
        self.start("Fight", 2)
        self.emit(20003, 2, what="FightTimes", details={"series": 6, "sanity_cost": 37})
        self.emit(20003, 2, what="UseMedicine", details={"count": 2})
        self.emit(20003, 2, what="UseMedicine", details={"count": 1, "is_expiring": True})
        self.emit(20001, 2, subtask="ProcessTask", details={"task": "StoneConfirm"})
        details = {"stage": {"stageCode": "1-7"}, "cur_times": 6,
                   "drops": [{"itemId": "30011", "quantity": 7}],
                   "stats": [{"itemId": "30011", "quantity": 999, "addQuantity": 7}]}
        self.emit(20003, 2, what="StageDrops", details=details)
        self.emit(20003, 2, what="StageDrops", details={"drops": [{"itemId": "30011", "quantity": 1}]})
        self.emit(10002, 2)
        report = self.ledger.snapshot(self.profile)["reports"][0]
        self.assertEqual((report["battles"], report["rounds"], report["sanity"]), (7, 2, 37))
        self.assertFalse(report["sanity_known"])
        self.assertEqual((report["medicine"], report["expiring_medicine"], report["stone"]), (2, 1, 1))
        self.assertEqual(report["drops"]["30011"]["quantity"], 8)
        self.assertEqual(self.ledger.stock("30011"), 17)

    def test_unstarted_callbacks_ignored_and_report_day_change_closes_previous(self):
        self.ledger.bind(1, AppendCall(task_id="fight", type="Fight", params={}))
        self.emit(20003, what="StageDrops", details={})
        self.assertNotIn("reports", self.ledger.snapshot(self.profile))
        self.emit(10001)
        self.emit(20003, what="StageDrops", details={"stage": {"stageCode": "1-7"}})
        self.clock = datetime(2026, 11, 10, 20, 0, tzinfo=timezone.utc)
        self.emit(20003, what="StageDrops", details={"stage": {"stageCode": "1-7"}})
        self.emit(10000)
        self.emit(10004)
        reports = self.ledger.snapshot(self.profile)["reports"]
        self.assertEqual([r["status"] for r in reports], ["continued", "failed"])
        self.assertEqual([r["day"] for r in reports], ["2026-11-10", "2026-11-11"])

    def test_progress_aggregates_actions_and_separates_roles(self):
        self.start("OperProgress")
        for detail in ({"elite": 2}, {"skill_level": 7}, {"skill_mastery": [1, 0, 0]}, {"skill_mastery": [0, 3, 0]}, {"result": "Failed"}):
            self.emit(20003, what="OperProgressDetail", details={"name": "阿米娅", "role": "Caster", "result": "Success", **detail})
        self.emit(20003, what="OperProgressDetail", details={"name": "阿米娅", "role": "Warrior", "elite": 1})
        progress = self.ledger.snapshot(self.profile)["progress"]
        self.assertEqual(progress["Caster:阿米娅"]["skill_mastery"], [1, 3, 0])
        self.assertEqual(progress["Caster:阿米娅"]["elite"], 2)
        self.assertEqual(progress["Caster:阿米娅"]["skill_level"], 7)
        self.assertEqual(progress["Warrior:阿米娅"]["elite"], 1)

    def test_corrupt_ledger_is_preserved_and_optional(self):
        self.path.write_text("{broken", encoding="utf-8")
        ledger = ExecutionLedger(self.path, self.events)
        self.assertFalse(ledger.available)
        self.assertEqual(self.path.read_text(encoding="utf-8"), "{broken")

    def test_dual_chip_formula_is_counted_without_consuming_materials(self):
        items = {"3212": 3, "3213": 2, "32001": 99}
        definitions = {"3213": {"formula": {"3212": 2, "32001": 1}}, "other": {"formula": {"3212": 3}}}
        self.assertEqual(stock_with_dual_chips("3212", items, definitions, True), 7)
        self.assertEqual(stock_with_dual_chips("3212", items, definitions, False), 3)
        self.assertEqual(items["32001"], 99)

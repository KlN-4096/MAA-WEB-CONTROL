import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch

import app.mapper as mapper
from app.mapper import (
    TaskMappingError,
    _select_stage_from_plan,
    profile_to_append_calls,
    task_to_append_call,
)
from app.models import Profile, TaskDefinition


class TaskMapperTest(unittest.TestCase):
    def test_disabled_task_is_skipped(self):
        task = TaskDefinition(id="fight", type="Fight", enabled=False)

        self.assertIsNone(task_to_append_call(task))

    def test_supported_task_becomes_append_call(self):
        task = TaskDefinition(id="fight", type="Fight", params={"stage": "1-7"})

        call = task_to_append_call(task)

        self.assertEqual(call.type, "Fight")
        self.assertEqual(call.params["stage"], "1-7")
        self.assertTrue(call.params["enable"])

    def test_current_stage_resource_value_maps_to_empty_stage(self):
        task = TaskDefinition(id="fight", type="Fight", params={"stage": "CurrentStage"})

        call = task_to_append_call(task)

        self.assertEqual(call.params["stage"], "")

    def test_startup_maps_client_type_and_account_name(self):
        task = TaskDefinition(
            id="startup",
            type="StartUp",
            params={"client_type": "官服", "account": "Doctor", "start_game_enabled": True},
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["client_type"], "Official")
        self.assertEqual(call.params["account_name"], "Doctor")
        self.assertTrue(call.params["start_game_enabled"])

    def test_stage_plan_selects_first_open_candidate(self):
        task = TaskDefinition(
            id="fight",
            type="Fight",
            params={"stage": "CE-6", "stage_plan": ["CE-6", "1-7"]},
        )

        call = task_to_append_call(task)

        self.assertIn(call.params["stage"], {"CE-6", "1-7"})
        self.assertEqual(call.params["stage_plan"], ["CE-6", "1-7"])

    def test_stage_plan_falls_back_when_resource_stage_closed(self):
        self.assertEqual(_select_stage_from_plan(["CE-6", "1-7"], weekday=0), "1-7")
        self.assertEqual(_select_stage_from_plan(["CE-6", "1-7"], weekday=1), "CE-6")

    def test_legacy_stage_labels_normalize_to_resource_values(self):
        task = TaskDefinition(
            id="fight",
            type="Fight",
            params={"stage": "龙门币-6/5", "stage_plan": ["龙门币-6/5", "当期剿灭", "当前/上次"]},
        )

        call = task_to_append_call(task)

        self.assertIn(call.params["stage"], {"CE-6", "Annihilation", ""})
        self.assertEqual(call.params["stage_plan"], ["CE-6", "Annihilation", ""])

    def test_fixed_annihilation_label_maps_to_core_value(self):
        task = TaskDefinition(id="fight", type="Fight", params={"stage": "切尔诺伯格"})

        call = task_to_append_call(task)

        self.assertEqual(call.params["stage"], "Chernobog@Annihilation")

    def test_custom_task_preserves_official_task_names(self):
        task = TaskDefinition(id="custom", type="Custom", params={"task_names": "GachaOnce;MiniGame@PV"})

        call = task_to_append_call(task)

        self.assertEqual(call.type, "Custom")
        self.assertEqual(call.params["task_names"], ["GachaOnce", "MiniGame@PV"])

    def test_custom_task_requires_task_names(self):
        task = TaskDefinition(id="custom", type="Custom", params={})

        with self.assertRaisesRegex(TaskMappingError, "task_names"):
            task_to_append_call(task)

    def test_fight_preserves_official_resource_fields_without_ui_switches(self):
        task = TaskDefinition(
            id="fight",
            type="Fight",
            params={"stage": "1-7", "medicine": 2, "stone": 1, "times": 3},
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["medicine"], 2)
        self.assertEqual(call.params["stone"], 1)
        self.assertEqual(call.params["times"], 3)

    def test_fight_drop_item_id_passes_through(self):
        task = TaskDefinition(id="fight", type="Fight", params={"use_drops": True, "drop": "30011", "drop_count": 2})

        call = task_to_append_call(task)

        self.assertEqual(call.params["drops"], {"30011": 2})

    def test_fight_legacy_drop_name_uses_configured_resource(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            item_index = root / "resource" / "item_index.json"
            item_index.parent.mkdir(parents=True)
            item_index.write_text('{"30011": {"name": "源岩"}}', encoding="utf-8")
            mapper._drop_map_cache = None
            mapper._drop_map_mtime = 0.0
            mapper._drop_map_path = None
            task = TaskDefinition(id="fight", type="Fight", params={"use_drops": True, "drop": "源岩"})

            with patch("app.mapper.resolve_maa_root", return_value=root):
                call = task_to_append_call(task)

        self.assertEqual(call.params["drops"], {"30011": 1})

    def test_recruit_maps_confirmation_and_times(self):
        task = TaskDefinition(
            id="recruit",
            type="Recruit",
            params={
                "refresh": True,
                "force_refresh": False,
                "auto_expedited": True,
                "skip_robot": False,
                "max_times": 12,
                "confirm_3": True,
                "confirm_5": True,
                "extra_tags": "高级资深干员;近卫干员",
                "time3": "05:00",
                "time5": "07:30",
            },
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["select"], [5, 3])
        self.assertEqual(call.params["confirm"], [5, 3])
        self.assertEqual(call.params["first_tags"], ["高级资深干员", "近卫干员"])
        self.assertEqual(call.params["times"], 12)
        self.assertTrue(call.params["expedite"])
        self.assertFalse(call.params["skip_robot"])
        self.assertEqual(call.params["recruitment_time"]["3"], 300)
        self.assertEqual(call.params["recruitment_time"]["5"], 450)

    def test_recruit_preserves_official_select_and_confirm_independently(self):
        task = TaskDefinition(
            id="recruit",
            type="Recruit",
            params={"select": [4], "confirm": [3, 4], "times": 4},
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["select"], [4])
        self.assertEqual(call.params["confirm"], [3, 4])
        self.assertNotEqual(call.params["select"], call.params["confirm"])
        self.assertEqual(call.params["times"], 4)

    def test_infrast_maps_facilities_and_drone(self):
        task = TaskDefinition(
            id="infrast",
            type="Infrast",
            params={
                "mode": "队列轮换",
                "facilities": ["制造站", "贸易站", "控制中枢"],
                "drone": "贸易站-龙门币",
                "mood": 45,
                "dorm_trust": True,
                "skip_entered": False,
                "collect_credit": False,
                "clue_exchange": True,
                "send_clue": False,
            },
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["mode"], 20000)
        self.assertEqual(call.params["facility"], ["Mfg", "Trade", "Control"])
        self.assertEqual(call.params["drones"], "Money")
        self.assertEqual(call.params["threshold"], 0.45)
        self.assertTrue(call.params["dorm_trust_enabled"])
        self.assertFalse(call.params["dorm_notstationed_enabled"])
        self.assertFalse(call.params["reception_message_board"])
        self.assertTrue(call.params["reception_clue_exchange"])
        self.assertFalse(call.params["reception_send_clue"])

    def test_infrast_maps_custom_plan_fields(self):
        task = TaskDefinition(
            id="infrast",
            type="Infrast",
            params={"mode": "自定义基建配置", "custom_infrast_file": "plan.json", "plan_index": "2"},
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["mode"], 10000)
        self.assertEqual(call.params["filename"], "plan.json")
        self.assertEqual(call.params["plan_index"], 2)

    def test_mall_maps_sale_flags(self):
        task = TaskDefinition(
            id="mall",
            type="Mall",
            params={
                "visit_friends": True,
                "shopping": True,
                "buy_first": ["招聘许可"],
                "blacklist": ["家具零件"],
                "overflow_blacklist": True,
                "discount_only": True,
                "stop_if_low": True,
                "credit_fight": True,
                "credit_fight_once": True,
                "formation_index": 3,
            },
        )

        call = task_to_append_call(task)

        self.assertTrue(call.params["force_shopping_if_credit_full"])
        self.assertTrue(call.params["only_buy_discount"])
        self.assertTrue(call.params["reserve_max_credit"])
        self.assertTrue(call.params["credit_fight"])
        self.assertTrue(call.params["credit_fight_once"])
        self.assertEqual(call.params["formation_index"], 3)

    def test_award_maps_official_flags(self):
        task = TaskDefinition(
            id="award",
            type="Award",
            params={
                "daily": True,
                "mail": True,
                "free_gacha": True,
                "orundum": True,
                "limited_orundum": True,
                "monthly_card": True,
            },
        )

        call = task_to_append_call(task)

        self.assertTrue(call.params["award"])
        self.assertTrue(call.params["mail"])
        self.assertTrue(call.params["recruit"])
        self.assertTrue(call.params["orundum"])
        self.assertTrue(call.params["mining"])
        self.assertTrue(call.params["specialaccess"])

    def test_roguelike_maps_ui_fields_to_official_values(self):
        task = TaskDefinition(
            id="roguelike",
            type="Roguelike",
            params={
                "theme": "界园",
                "difficulty": "MAX (18)",
                "strategy": "刷源石锭，投资完成后自动退出",
                "starts_count": 7,
            },
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["theme"], "JieGarden")
        self.assertEqual(call.params["difficulty"], 18)
        self.assertEqual(call.params["mode"], 1)
        self.assertEqual(call.params["starts_count"], 7)

    def test_roguelike_preserves_existing_official_mode(self):
        task = TaskDefinition(
            id="roguelike",
            type="Roguelike",
            params={"theme": "Sarkaz", "difficulty": "-1", "mode": 4, "strategy": "刷等级，尽可能稳定地打更多层数"},
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["theme"], "Sarkaz")
        self.assertEqual(call.params["difficulty"], -1)
        self.assertEqual(call.params["mode"], 4)

    def test_reclamation_maps_ui_fields_to_official_values(self):
        task = TaskDefinition(
            id="reclamation",
            type="Reclamation",
            params={
                "theme": "沙洲遗闻",
                "strategy": "有存档，通过组装支援道具刷生息点数",
                "tool_to_craft": "荧光棒",
                "max_craft_count": "16",
                "increment_mode": "长按",
                "clear_store": True,
            },
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["theme"], "Tales")
        self.assertEqual(call.params["mode"], 1)
        self.assertEqual(call.params["tools_to_craft"], ["荧光棒"])
        self.assertEqual(call.params["num_craft_batches"], 16)
        self.assertEqual(call.params["increment_mode"], 1)
        self.assertTrue(call.params["clear_store"])

    def test_reclamation_preserves_existing_official_fields(self):
        task = TaskDefinition(
            id="reclamation",
            type="Reclamation",
            params={
                "theme": "Tales",
                "mode": 0,
                "tools_to_craft": ["荧光棒", "采集实习站"],
                "num_craft_batches": 2,
                "increment_mode": 0,
                "strategy": "有存档，通过组装支援道具刷生息点数",
            },
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["theme"], "Tales")
        self.assertEqual(call.params["mode"], 0)
        self.assertEqual(call.params["tools_to_craft"], ["荧光棒", "采集实习站"])
        self.assertEqual(call.params["num_craft_batches"], 2)
        self.assertEqual(call.params["increment_mode"], 0)

    def test_unknown_task_type_raises(self):
        task = TaskDefinition(id="bad", type="Unknown")

        with self.assertRaises(TaskMappingError):
            task_to_append_call(task)

    def test_profile_maps_enabled_tasks_in_order(self):
        profile = Profile(
            name="daily",
            tasks=[
                TaskDefinition(id="startup", type="StartUp"),
                TaskDefinition(id="skip", type="Fight", enabled=False),
                TaskDefinition(id="award", type="Award"),
            ],
        )

        calls = profile_to_append_calls(profile)

        self.assertEqual([call.task_id for call in calls], ["startup", "award"])


if __name__ == "__main__":
    unittest.main()

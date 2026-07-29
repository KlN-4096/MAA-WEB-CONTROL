import unittest
import tempfile
from datetime import datetime
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

    def test_startup_retry_web_fields_are_preserved_for_runner(self):
        task = TaskDefinition(
            id="startup",
            type="StartUp",
            params={
                "startup_retry_times": 3,
                "startup_retry_command_a": "docker stop redroid",
                "startup_retry_wait_a_seconds": 60,
                "startup_retry_command_b": "docker start redroid",
                "startup_retry_wait_b_seconds": 60,
            },
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["startup_retry_times"], 3)
        self.assertEqual(call.params["startup_retry_command_a"], "docker stop redroid")

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

        self.assertEqual(call.params["select"], [5])
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
            params={"select": [4], "confirm": [3, 4], "times": 4, "skip_robot": False},
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


    def test_roguelike_invest_with_more_score_outputs_correct_field(self):
        """invest_with_more_score (UI alias) must be renamed to investment_with_more_score for MaaCore."""
        task_alias = TaskDefinition(
            id="roguelike",
            type="Roguelike",
            params={"invest_with_more_score": True},
        )
        task_official = TaskDefinition(
            id="roguelike",
            type="Roguelike",
            params={"investment_with_more_score": True},
        )

        call_alias = task_to_append_call(task_alias)
        call_official = task_to_append_call(task_official)

        self.assertIn("investment_with_more_score", call_alias.params)
        self.assertNotIn("invest_with_more_score", call_alias.params)
        self.assertTrue(call_alias.params["investment_with_more_score"])
        self.assertIn("investment_with_more_score", call_official.params)
        self.assertTrue(call_official.params["investment_with_more_score"])

    def test_roguelike_expected_collapsal_paradigms_passes_through(self):
        task = TaskDefinition(
            id="roguelike",
            type="Roguelike",
            params={"expected_collapsal_paradigms": ["深化坚守", "领域"]},
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["expected_collapsal_paradigms"], ["深化坚守", "领域"])

    def test_recruit_skip_robot_confirms_level_one(self):
        """原版 NotChooseLevel1 = skip_robot=true + ConfirmList.Add(1)。"""
        task = TaskDefinition(
            id="recruit",
            type="Recruit",
            params={
                "select": [1, 3, 4],
                "confirm": [3, 4, 5],
                "skip_robot": True,
            },
        )

        call = task_to_append_call(task)

        self.assertNotIn(1, call.params["select"])
        self.assertIn(1, call.params["confirm"])
        self.assertTrue(call.params["skip_robot"])

    def test_recruit_legacy_reserve_level_1_maps_to_skip_robot(self):
        task = TaskDefinition(
            id="recruit",
            type="Recruit",
            params={"confirm": [3, 4], "reserve_level_1": False},
        )

        call = task_to_append_call(task)

        self.assertFalse(call.params["skip_robot"])
        self.assertNotIn(1, call.params["confirm"])
        self.assertNotIn("reserve_level_1", call.params)

    def test_recruit_select_excludes_three_star(self):
        """原版只把 4/5 星加入 SelectList，3 星仅确认。"""
        task = TaskDefinition(
            id="recruit",
            type="Recruit",
            params={"confirm_3": True, "confirm_4": True, "skip_robot": False},
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["confirm"], [4, 3])
        self.assertEqual(call.params["select"], [4])

    def test_recruit_force_refresh_is_independent_of_refresh(self):
        task = TaskDefinition(
            id="recruit",
            type="Recruit",
            params={"refresh": False, "force_refresh": False},
        )

        call = task_to_append_call(task)

        self.assertFalse(call.params["refresh"])
        self.assertFalse(call.params["force_refresh"])

    def test_closedown_drops_unrelated_params(self):
        task = TaskDefinition(
            id="closedown",
            type="CloseDown",
            params={
                "auto_expedited": True,
                "max_times": 99,
                "refresh": True,
                "client_type": "官服",
            },
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params, {"client_type": "Official", "enable": True})

    def test_recruit_yituliu_reporting_passes_through(self):
        task = TaskDefinition(
            id="recruit",
            type="Recruit",
            params={
                "report_to_penguin": True,
                "penguin_id": "abc",
                "report_to_yituliu": True,
                "yituliu_id": "xyz",
            },
        )

        call = task_to_append_call(task)

        self.assertTrue(call.params["report_to_penguin"])
        self.assertEqual(call.params["penguin_id"], "abc")
        self.assertTrue(call.params["report_to_yituliu"])
        self.assertEqual(call.params["yituliu_id"], "xyz")

    def test_fight_yituliu_reporting_passes_through(self):
        task = TaskDefinition(
            id="fight",
            type="Fight",
            params={
                "stage": "1-7",
                "report_to_yituliu": True,
                "yituliu_id": "lol",
            },
        )

        call = task_to_append_call(task)

        self.assertTrue(call.params["report_to_yituliu"])
        self.assertEqual(call.params["yituliu_id"], "lol")

    def test_fight_emits_only_medicine_expire_days(self):
        """MaaCore 优先读 medicine_expire_days，expiring_medicine 已废弃且会被忽略。"""
        task = TaskDefinition(
            id="fight",
            type="Fight",
            params={
                "stage": "1-7",
                "use_expiring_medicine": True,
                "medicine_expire_hours": "72h",
                "expiring_medicine": 5,
            },
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["medicine_expire_days"], 3)
        self.assertNotIn("expiring_medicine", call.params)

    def test_reclamation_fire_theme_maps(self):
        task = TaskDefinition(
            id="recl",
            type="Reclamation",
            params={"theme": "沙中之火", "strategy": "无存档，通过进出关卡刷生息点数"},
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["theme"], "Fire")

    def test_roguelike_collectible_mode_fields_pass_through(self):
        task = TaskDefinition(
            id="roguelike",
            type="Roguelike",
            params={
                "theme": "萨米",
                "mode": 4,
                "use_foldartal": True,
                "check_collapsal_paradigms": True,
                "double_check_collapsal_paradigms": True,
                "collectible_mode_shopping": True,
                "collectible_mode_squad": "矛头分队",
                "collectible_mode_start_list": {"热水壶": True, "源石锭": True},
            },
        )

        call = task_to_append_call(task)

        self.assertTrue(call.params["use_foldartal"])
        self.assertTrue(call.params["check_collapsal_paradigms"])
        self.assertTrue(call.params["double_check_collapsal_paradigms"])
        self.assertTrue(call.params["collectible_mode_shopping"])
        self.assertEqual(call.params["collectible_mode_squad"], "矛头分队")
        self.assertEqual(call.params["collectible_mode_start_list"], {"hot_water": True, "ingot": True})

    # ---- MaaCore 参数契约回归（对照 MaaCore 源码，防止任务被静默丢弃）----

    def test_roguelike_strategy_maps_to_valid_core_modes(self):
        """MaaCore is_valid_mode 只接受 0/1/4/5/6/7/10001/20001；旧映射的 2/3 会让任务被丢弃。"""
        cases = {
            "刷等级，尽可能稳定地打更多层数": 0,
            "刷源石锭，投资完成后自动退出": 1,
            "刷开局，刷取热水壶或精二干员开局": 4,
            "刷月度小队，尽可能稳定地打更多层数": 6,
            "刷深入调查，尽可能稳定地打更多层数": 7,
        }
        for strategy, expected in cases.items():
            with self.subTest(strategy=strategy):
                task = TaskDefinition(
                    id="roguelike",
                    type="Roguelike",
                    params={"theme": "萨卡兹", "strategy": strategy},
                )
                self.assertEqual(task_to_append_call(task).params["mode"], expected)

    def test_roguelike_theme_only_strategies_map(self):
        sami = TaskDefinition(
            id="rg",
            type="Roguelike",
            params={"theme": "萨米", "strategy": "刷坍缩范式，遇到非稀有坍缩范式后直接重开"},
        )
        jie = TaskDefinition(
            id="rg",
            type="Roguelike",
            params={"theme": "界园", "strategy": "刷常乐节点，第一层进洞，找不到需要的节点就重开"},
        )

        self.assertEqual(task_to_append_call(sami).params["mode"], 5)
        self.assertEqual(task_to_append_call(jie).params["mode"], 20001)

    def test_roguelike_rejects_mode_theme_mismatch(self):
        task = TaskDefinition(id="rg", type="Roguelike", params={"theme": "萨卡兹", "mode": 5})

        with self.assertRaisesRegex(TaskMappingError, "Sami"):
            task_to_append_call(task)

    def test_roguelike_rejects_removed_mode(self):
        task = TaskDefinition(id="rg", type="Roguelike", params={"theme": "萨卡兹", "mode": 2})

        with self.assertRaises(TaskMappingError):
            task_to_append_call(task)

    def test_roguelike_roles_use_short_ocr_names(self):
        task = TaskDefinition(
            id="rg",
            type="Roguelike",
            params={"theme": "萨卡兹", "roles": "稳扎稳打（重装、术师、狙击）"},
        )

        self.assertEqual(task_to_append_call(task).params["roles"], "稳扎稳打")

    def test_roguelike_seed_is_sent_as_string(self):
        enabled = TaskDefinition(
            id="rg",
            type="Roguelike",
            params={"theme": "萨卡兹", "start_with_seed": True, "seed": "abc123"},
        )
        disabled = TaskDefinition(
            id="rg",
            type="Roguelike",
            params={"theme": "萨卡兹", "start_with_seed": False, "seed": "abc123"},
        )

        call_enabled = task_to_append_call(enabled)
        call_disabled = task_to_append_call(disabled)

        self.assertEqual(call_enabled.params["start_with_seed"], "abc123")
        self.assertNotIn("seed", call_enabled.params)
        self.assertNotIn("start_with_seed", call_disabled.params)
        self.assertNotIn("seed", call_disabled.params)

    def test_roguelike_investments_count_zero_is_omitted(self):
        zero = TaskDefinition(
            id="rg",
            type="Roguelike",
            params={"theme": "萨卡兹", "investment_enabled": True, "investments_count": 0},
        )
        limited = TaskDefinition(
            id="rg",
            type="Roguelike",
            params={"theme": "萨卡兹", "investments_count": 30},
        )

        self.assertNotIn("investments_count", task_to_append_call(zero).params)
        self.assertEqual(task_to_append_call(limited).params["investments_count"], 30)

    def test_roguelike_elite_two_only_sent_in_collectible_mode(self):
        wrong_mode = TaskDefinition(
            id="rg",
            type="Roguelike",
            params={"theme": "萨卡兹", "mode": 0, "start_with_elite_two": True},
        )
        collectible = TaskDefinition(
            id="rg",
            type="Roguelike",
            params={
                "theme": "萨卡兹",
                "mode": 4,
                "start_with_elite_two": True,
                "only_start_with_elite_two": True,
            },
        )
        orphan_only = TaskDefinition(
            id="rg",
            type="Roguelike",
            params={"theme": "萨卡兹", "mode": 4, "only_start_with_elite_two": True},
        )

        self.assertNotIn("start_with_elite_two", task_to_append_call(wrong_mode).params)
        self.assertTrue(task_to_append_call(collectible).params["only_start_with_elite_two"])
        self.assertFalse(task_to_append_call(orphan_only).params["only_start_with_elite_two"])

    def test_roguelike_foldartal_uses_official_keys(self):
        task = TaskDefinition(
            id="rg",
            type="Roguelike",
            params={
                "theme": "萨米",
                "mode": 4,
                "first_floor_foldartal": True,
                "first_floor_foldartal_name": "生命",
                "first_floor_foldartals": "风声,感知",
            },
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["first_floor_foldartal"], "生命")
        self.assertEqual(call.params["start_foldartal_list"], ["风声", "感知"])
        self.assertNotIn("first_floor_foldartals", call.params)

    def test_roguelike_find_playtime_target_requires_mode(self):
        jie = TaskDefinition(
            id="rg",
            type="Roguelike",
            params={"theme": "界园", "mode": 20001, "find_playTime_target": True},
        )
        other = TaskDefinition(
            id="rg",
            type="Roguelike",
            params={"theme": "界园", "mode": 0, "find_playTime_target": True},
        )

        self.assertEqual(task_to_append_call(jie).params["find_playTime_target"], 1)
        self.assertNotIn("find_playTime_target", task_to_append_call(other).params)

    def test_userdata_update_expands_to_depot_and_operbox(self):
        """MaaCore 没有 UserDataUpdate 任务类型，必须展开成 Depot / OperBox。"""
        profile = Profile(
            name="daily",
            tasks=[
                TaskDefinition(
                    id="udu",
                    type="UserDataUpdate",
                    params={"update_depot": True, "update_oper_box": True},
                )
            ],
        )

        calls = profile_to_append_calls(profile)

        self.assertEqual([call.type for call in calls], ["Depot", "OperBox"])

    def test_userdata_update_respects_toggles(self):
        profile = Profile(
            name="daily",
            tasks=[
                TaskDefinition(
                    id="udu",
                    type="UserDataUpdate",
                    params={"update_depot": False, "update_oper_box": True},
                )
            ],
        )

        calls = profile_to_append_calls(profile)

        self.assertEqual([call.type for call in calls], ["OperBox"])

    def test_stage_plan_uses_maa_four_am_daycut(self):
        """凌晨 0-4 点应按前一天判断关卡开放（与 options.py 一致）。"""
        monday_2am = datetime(2026, 5, 11, 2, 0)  # 周一凌晨 = 游戏内周日
        with patch("app.mapper.datetime") as fake_datetime:
            fake_datetime.now.return_value = monday_2am
            fake_datetime.side_effect = datetime
            self.assertEqual(mapper._maa_weekday(), 6)

    def test_userdata_update_never_emits_unknown_core_task(self):
        task = TaskDefinition(id="udu", type="UserDataUpdate", params={})

        calls = mapper.task_to_append_calls(task)

        self.assertEqual([call.type for call in calls], ["Depot", "OperBox"])
        self.assertNotIn("UserDataUpdate", [call.type for call in calls])

    def test_userdata_update_invalid_interval_falls_back(self):
        self.assertEqual(mapper._userdata_interval({"trigger_interval": "Hourly"}), "EveryTime")
        self.assertEqual(mapper._userdata_interval({"trigger_interval": "Weekly"}), "Weekly")

    def test_profile_skips_userdata_update_within_daily_interval(self):
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "userdata.json"
            profile = Profile(
                name="daily",
                tasks=[
                    TaskDefinition(
                        id="udu",
                        type="UserDataUpdate",
                        params={"trigger_interval": "Daily"},
                    ),
                ],
            )

            first = profile_to_append_calls(profile, state_path=state_path)
            second = profile_to_append_calls(profile, state_path=state_path)

            self.assertEqual([call.type for call in first], ["Depot", "OperBox"])
            self.assertEqual(second, [])

    def test_fight_custom_annihilation_replaces_stage(self):
        task = TaskDefinition(
            id="fight",
            type="Fight",
            params={
                "stage": "Annihilation",
                "stage_plan": ["Annihilation", "1-7"],
                "custom_annihilation": True,
                "annihilation_stage": "LungmenOutskirts@Annihilation",
            },
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["stage"], "LungmenOutskirts@Annihilation")
        self.assertEqual(call.params["stage_plan"], ["LungmenOutskirts@Annihilation", "1-7"])
        self.assertNotIn("custom_annihilation", call.params)
        self.assertNotIn("annihilation_stage", call.params)

    def test_fight_custom_annihilation_disabled_drops_overrides(self):
        task = TaskDefinition(
            id="fight",
            type="Fight",
            params={
                "stage": "Annihilation",
                "custom_annihilation": False,
                "annihilation_stage": "LungmenOutskirts@Annihilation",
            },
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["stage"], "Annihilation")
        self.assertNotIn("custom_annihilation", call.params)
        self.assertNotIn("annihilation_stage", call.params)

    def test_fight_server_passes_through(self):
        task = TaskDefinition(
            id="fight",
            type="Fight",
            params={"stage": "1-7", "server": "JP"},
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["server"], "JP")

    def test_recruit_server_passes_through(self):
        task = TaskDefinition(
            id="recruit",
            type="Recruit",
            params={"server": "US"},
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["server"], "US")

    def test_profile_runs_userdata_update_every_time_when_set(self):
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "userdata.json"
            profile = Profile(
                name="daily",
                tasks=[
                    TaskDefinition(
                        id="udu",
                        type="UserDataUpdate",
                        params={"trigger_interval": "EveryTime"},
                    ),
                ],
            )

            first = profile_to_append_calls(profile, state_path=state_path)
            second = profile_to_append_calls(profile, state_path=state_path)

            self.assertEqual([call.type for call in first], ["Depot", "OperBox"])
            self.assertEqual([call.type for call in second], ["Depot", "OperBox"])


    def test_roguelike_find_playtime_target_is_always_sent_in_that_mode(self):
        """界园「刷常乐节点」若不下发 1~3 的 target，MaaCore 会拒掉整个任务链。"""
        task = TaskDefinition(
            id="rg",
            type="Roguelike",
            params={"theme": "界园", "strategy": "刷常乐节点，第一层进洞，找不到需要的节点就重开"},
        )

        call = task_to_append_call(task)

        self.assertEqual(call.params["mode"], 20001)
        self.assertEqual(call.params["find_playTime_target"], 1)


if __name__ == "__main__":
    unittest.main()

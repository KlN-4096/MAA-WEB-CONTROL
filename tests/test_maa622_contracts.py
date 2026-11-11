import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from app.mapper import TaskMappingError, profile_to_append_calls, task_to_append_call
from app.models import AdbConfig, Profile, TaskDefinition, ToolRequest
from app.tool_tasks import tool_append_call


def mapped(kind, **params):
    return task_to_append_call(TaskDefinition(id="test", type=kind, params=params)).params


class Maa622ContractTest(unittest.TestCase):
    def test_progress_targets_omit_unselected_fields(self):
        plans = [{"name": "阿米娅", "role": "Caster", "skill_mastery": [0, 3, 0]}, {"name": "能天使", "elite": 2, "skill_level": 7}]
        result = mapped("OperProgress", plans=plans)
        self.assertEqual(result["plans"], plans)
        self.assertNotIn("elite", result["plans"][0])
        self.assertNotIn("skill_mastery", result["plans"][1])

    def test_progress_rejects_invalid_goals(self):
        for plan in ({"name": ""}, {"name": "a", "elite": 0}, {"name": "a", "elite": None},
                     {"name": "a", "elite": True}, {"name": "a", "skill_level": 8},
                     {"name": "a", "skill_mastery": [1, 2]}, {"name": "a", "skill_mastery": [4, 0, 0]}):
            with self.subTest(plan=plan), self.assertRaises(TaskMappingError):
                mapped("OperProgress", plans=[plan])

    def test_blackflow_defaults_explicit_empty_animals_and_inherited_preparation(self):
        result = mapped("Roguelike", theme="黑流树海", mode=30003, difficulty="MAX (16)",
                        collectible_mode_squad="", collectible_mode_roles="", collectible_mode_core_char_list=None,
                        start_with_elite_two=True, only_start_with_elite_two=True)
        self.assertEqual(result["blackflow_start_animals"], [])
        self.assertEqual(result["blackflow_start_rewards"], 0)
        self.assertEqual(result["difficulty"], 2147483647)
        for field in ("start_with_elite_two", "only_start_with_elite_two", "collectible_mode_squad", "collectible_mode_roles", "collectible_mode_core_char_list"):
            self.assertNotIn(field, result)

    def test_blackflow_mode_and_reward_constraints(self):
        invalid = [
            {"mode": 4}, {"mode": 30003, "blackflow_start_animals": ["swaddled_feathered_serpent"] * 2},
            {"mode": 30003, "blackflow_start_rewards": 4096},
            {"mode": 30003, "difficulty": 5, "blackflow_start_utopia": True},
            {"mode": 30003, "difficulty": 6, "blackflow_start_utopia": True, "blackflow_start_reward_priority": []},
        ]
        for params in invalid:
            with self.subTest(params=params), self.assertRaises(TaskMappingError):
                mapped("Roguelike", theme="BlackFlow", **params)
        result = mapped("Roguelike", theme="BlackFlow", mode=30003, difficulty=6, blackflow_start_utopia=True,
                        blackflow_start_reward_priority=["pegasus"], blackflow_start_animals=["swaddled_cat"] * 2)
        self.assertEqual(result["blackflow_start_animals"], ["swaddled_cat"] * 2)
        self.assertEqual(mapped("Roguelike", theme="BlackFlow", mode=30001)["blackflow_strategy"], "baby_animal")

    def test_blackflow_fast_pass_sets_native_opening(self):
        for mode in (0, 30003):
            result = mapped("Roguelike", theme="BlackFlow", mode=mode, blackflow_fast_pass=True)
            prefix = "collectible_mode_" if mode == 30003 else ""
            self.assertEqual(result[prefix + "squad"], "特勤分队")
            self.assertEqual(result[prefix + "core_char_list"], [{"name": "机械师", "use_support": False}])
            self.assertNotIn("blackflow_strategy", result)

    def test_reclamation_anchor_strips_tales_configuration(self):
        result = mapped("Reclamation", theme="RelaunchAnchor", mode=48, tools_to_craft=["荧光棒"], num_craft_batches=16, clear_store=True)
        self.assertEqual(result["mode"], 48)
        self.assertNotIn("tools_to_craft", result)
        self.assertNotIn("clear_store", result)
        self.assertEqual(mapped("Reclamation", theme="Tales", mode=1)["tools_to_craft"], [])
        with self.assertRaises(TaskMappingError):
            mapped("Reclamation", theme="RelaunchAnchor", mode=1)

    def test_preserve_tags_explicit_empty_wins_over_legacy_robot_switch(self):
        result = mapped("Recruit", preserve_tags=[], skip_robot=True, confirm=[3, 4], level3_recruitment_permit_reserve=8)
        self.assertEqual(result["preserve_tags"], [])
        self.assertEqual(result["level3_recruitment_permit_reserve"], 8)
        self.assertNotIn(1, result["confirm"])

    def test_inventory_rejects_current_stage_after_normalization(self):
        for stage in ("", "CurrentStage", "当前/上次"):
            with self.subTest(stage=stage), self.assertRaises(TaskMappingError):
                mapped("DepotMaintain", targets=[{"item_id": "30011", "quantity": 1, "stage": stage}])
        result = mapped("DepotMaintain", targets=[{"item_id": "30011", "quantity": 1, "stage": "1-7"}])
        self.assertEqual(result["max_times"], 2147483647)
        self.assertTrue(result["update_depot"])
        self.assertFalse(result["use_medicine"])

    def test_profile_client_restrictions_are_not_bypassed_by_raw_params(self):
        for kind, params, client in (
            ("Roguelike", {"theme": "BlackFlow", "mode": 0}, "YoStarEN"),
            ("Reclamation", {"theme": "RelaunchAnchor", "mode": 16}, "txwy"),
        ):
            with self.subTest(kind=kind), self.assertRaises(TaskMappingError):
                profile_to_append_calls(Profile(name="p", adb=AdbConfig(client_type=client), tasks=[TaskDefinition(id="t", type=kind, params=params)]))

    def test_weekly_plan_uses_same_server_weekday_for_fallback(self):
        class Clock(datetime):
            @classmethod
            def now(cls, tz=None):
                value = datetime(2026, 11, 8, 20, 1, tzinfo=timezone.utc)
                return value if tz else value.replace(tzinfo=None)
        profile = Profile(name="p", tasks=[TaskDefinition(id="fight", type="Fight", params={
            "weekly_schedule": True, "weekly_plan": {"0": ["CE-6", "1-7"], "6": ["CA-5"]},
        })])
        with patch("app.mapper.datetime", Clock):
            params = profile_to_append_calls(profile)[0].params
        self.assertEqual(params["stage"], "1-7")
        self.assertNotIn("__server_weekday", params)

    def test_modern_custom_tools_use_plugin_parameters(self):
        result = tool_append_call(ToolRequest(tool="auto_potential", params={"use_normal_token": False}))
        self.assertEqual(result.type, "Custom")
        self.assertEqual(result.params, {"task_names": ["MiniGame@AutoRaisePotential@Begin"], "params": {"auto_raise_potential": {"use_normal_token": False}}})
        result = tool_append_call(ToolRequest(tool="material_synthesis", params={"task_names": ["arbitrary"]}))
        self.assertEqual(result.params["task_names"], ["MiniGame@MaterialSynthesis@Begin"])

    def test_pixel_paint_rejects_duplicate_or_invalid_coordinates(self):
        for points in ([[0, 0], [0, 0]], [[24, 0]], [[True, 0]]):
            with self.subTest(points=points), self.assertRaises(ValueError):
                tool_append_call(ToolRequest(tool="pixel_paint", params={"groups": [{"color": 1, "points": points}]}))

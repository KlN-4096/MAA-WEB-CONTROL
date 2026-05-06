import unittest

from app.default_profiles import build_default_profiles, complete_profile_tasks
from app.models import Profile, TaskDefinition


class DefaultProfilesTest(unittest.TestCase):
    def test_build_default_profiles_returns_expected_profiles(self):
        profiles = build_default_profiles()

        self.assertEqual([profile.name for profile in profiles], ["daily-shoucai", "daily-shualizhi"])
        self.assertEqual(
            [task.id for task in profiles[0].tasks],
            ["startup", "recruit", "infrast", "fight", "remaining-sanity", "mall", "award", "roguelike", "reclamation"],
        )
        self.assertEqual(
            [task.id for task in profiles[1].tasks],
            ["startup", "recruit", "infrast", "fight", "remaining-sanity", "mall", "award", "roguelike", "reclamation"],
        )
        self.assertEqual(
            [task.id for task in profiles[0].tasks if task.enabled],
            ["startup", "recruit", "infrast", "mall", "award"],
        )
        self.assertEqual(
            [task.id for task in profiles[1].tasks if task.enabled],
            ["startup", "fight", "award"],
        )

        fight_params = next(task for task in profiles[1].tasks if task.id == "fight").params
        self.assertEqual(fight_params["stage_plan"], ["CE-6", "1-7"])
        self.assertEqual(fight_params["stage"], "CE-6")
        self.assertTrue(fight_params["use_remaining_sanity_stage"])
        self.assertEqual(fight_params["medicine"], 0)
        self.assertEqual(fight_params["stone"], 0)
        self.assertTrue(fight_params["report_to_penguin"])
        self.assertEqual(fight_params["penguin_id"], "614858333")
        self.assertEqual(fight_params["server"], "CN")

    def test_complete_profile_tasks_adds_missing_builtin_tasks_disabled(self):
        profile = Profile(
            name="daily",
            tasks=[
                TaskDefinition(id="startup", type="StartUp", enabled=True, name="开始唤醒"),
                TaskDefinition(id="award", type="Award", enabled=True, name="领取奖励"),
            ],
        )

        completed = complete_profile_tasks(profile)

        self.assertEqual(
            [task.id for task in completed.tasks],
            ["startup", "recruit", "infrast", "fight", "remaining-sanity", "mall", "award", "roguelike", "reclamation"],
        )
        self.assertEqual([task.id for task in completed.tasks if task.enabled], ["startup", "award"])
        self.assertEqual(next(task for task in completed.tasks if task.id == "fight").name, "理智作战")

    def test_complete_profile_tasks_preserves_extra_tasks(self):
        profile = Profile(
            name="daily",
            tasks=[TaskDefinition(id="custom-1", type="Custom", enabled=False, name="额外任务")],
        )

        completed = complete_profile_tasks(profile)

        self.assertEqual(completed.tasks[-1].id, "custom-1")
        self.assertFalse(completed.tasks[-1].enabled)

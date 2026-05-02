import unittest

from app.default_profiles import build_default_profiles


class DefaultProfilesTest(unittest.TestCase):
    def test_build_default_profiles_returns_expected_profiles(self):
        profiles = build_default_profiles()

        self.assertEqual([profile.name for profile in profiles], ["daily-shoucai", "daily-shualizhi"])
        self.assertEqual([task.type for task in profiles[0].tasks], ["StartUp", "Recruit", "Infrast", "Mall", "Award"])
        self.assertEqual([task.type for task in profiles[1].tasks], ["StartUp", "Fight", "Award"])

        fight_params = profiles[1].tasks[1].params
        self.assertEqual(fight_params["stage_plan"], ["CE-6", "1-7"])
        self.assertEqual(fight_params["stage"], "CE-6")
        self.assertTrue(fight_params["use_remaining_sanity_stage"])
        self.assertEqual(fight_params["medicine"], 0)
        self.assertEqual(fight_params["stone"], 0)
        self.assertTrue(fight_params["report_to_penguin"])
        self.assertEqual(fight_params["penguin_id"], "614858333")
        self.assertEqual(fight_params["server"], "CN")

import unittest

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

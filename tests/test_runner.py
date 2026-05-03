import asyncio
import unittest

from app.events import EventBus
from app.models import AppendCall, Profile, TaskDefinition
from app.runner import MaaRunnerService


class FakeRunnerAdapter:
    def __init__(self, final_status="Completed", append_error=None, wait_for_stop=False):
        self._task_chain_status = final_status
        self.append_error = append_error
        self.wait_for_stop = wait_for_stop
        self.started = asyncio.Event()
        self.stop_called = False

    @property
    def task_chain_status(self):
        return self._task_chain_status

    async def connect(self, profile):
        return True

    async def append_task(self, call: AppendCall):
        if self.append_error:
            raise self.append_error
        return 100

    async def start(self):
        self.started.set()
        while self.wait_for_stop and not self.stop_called:
            await asyncio.sleep(0)
        return True

    async def stop(self):
        self.stop_called = True
        self._task_chain_status = "Stopped"
        return True


def profile_with_task():
    return Profile(name="daily", tasks=[TaskDefinition(id="award", type="Award")])


class RunnerStateTest(unittest.IsolatedAsyncioTestCase):
    async def test_completed_callback_status_finishes_completed(self):
        events = EventBus()
        runner = MaaRunnerService(FakeRunnerAdapter("Completed"), events)

        await runner.run(profile_with_task())
        await runner._task

        self.assertEqual(runner.status().state, "Completed")
        self.assertEqual(events.recent()[-1].type, "runner.completed")

    async def test_error_callback_status_finishes_failed(self):
        events = EventBus()
        runner = MaaRunnerService(FakeRunnerAdapter("Failed"), events)

        await runner.run(profile_with_task())
        await runner._task

        self.assertEqual(runner.status().state, "Failed")
        self.assertEqual(events.recent()[-1].type, "runner.failed")

    async def test_stopped_callback_status_finishes_stopped(self):
        events = EventBus()
        runner = MaaRunnerService(FakeRunnerAdapter("Stopped"), events)

        await runner.run(profile_with_task())
        await runner._task

        self.assertEqual(runner.status().state, "Stopped")
        self.assertEqual(events.recent()[-1].type, "runner.stopped")

    async def test_stop_after_start_does_not_publish_completed(self):
        events = EventBus()
        adapter = FakeRunnerAdapter(wait_for_stop=True)
        runner = MaaRunnerService(adapter, events)

        await runner.run(profile_with_task())
        await adapter.started.wait()
        await runner.stop()
        await runner._task

        event_types = [event.type for event in events.recent()]
        self.assertEqual(runner.status().state, "Stopped")
        self.assertIn("runner.stopped", event_types)
        self.assertNotIn("runner.completed", event_types)

    async def test_append_failure_publishes_error_log(self):
        events = EventBus()
        runner = MaaRunnerService(FakeRunnerAdapter(append_error=RuntimeError("append failed")), events)

        await runner.run(profile_with_task())
        await runner._task

        self.assertEqual(runner.status().state, "Failed")
        self.assertEqual(events.recent()[-1].type, "runner.failed")
        self.assertIn("append failed", events.recent()[-1].message)


if __name__ == "__main__":
    unittest.main()

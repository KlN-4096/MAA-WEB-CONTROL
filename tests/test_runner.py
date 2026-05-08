import asyncio
import platform
import unittest

from app.events import EventBus
from app.models import AppendCall, PostAction, Profile, TaskDefinition
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


def _extract_card_text(card) -> str:
    if not isinstance(card, dict):
        return ""
    return "\n".join(item.get("content", "") for item in card.get("items", []))


class RunnerStateTest(unittest.IsolatedAsyncioTestCase):
    async def test_completed_callback_status_finishes_completed(self):
        events = EventBus()
        runner = MaaRunnerService(FakeRunnerAdapter("Completed"), events)

        await runner.run(profile_with_task())
        await runner._task

        self.assertEqual(runner.status().state, "Completed")
        self.assertEqual(events.recent()[-1].type, "runner.completed")

    async def test_run_event_callback_fires_on_complete(self):
        events = EventBus()
        captured: list[tuple[str, dict]] = []

        async def callback(event_type: str, payload: dict) -> None:
            captured.append((event_type, payload))

        runner = MaaRunnerService(FakeRunnerAdapter("Completed"), events, run_event_callback=callback)
        await runner.run(profile_with_task())
        await runner._task

        self.assertEqual(captured, [("complete", captured[0][1])])
        self.assertEqual(captured[0][1]["profile"], "daily")
        self.assertEqual(captured[0][1]["state"], "Completed")

    async def test_run_event_callback_fires_on_timeout(self):
        events = EventBus()
        captured: list[tuple[str, dict]] = []

        async def callback(event_type: str, payload: dict) -> None:
            captured.append((event_type, payload))

        class HangingAdapter(FakeRunnerAdapter):
            async def start(self):
                await asyncio.sleep(60)
                return True

        runner = MaaRunnerService(HangingAdapter("Completed"), events, run_event_callback=callback)
        runner.set_task_timeout_minutes(0)
        runner._task_timeout_minutes = 0
        # Force the timeout window short by patching internal field
        runner._task_timeout_minutes = 1 / 600  # ~100ms in minutes for test purposes

        await runner.run(profile_with_task())
        await runner._task

        self.assertEqual([event for event, _ in captured], ["timeout"])
        self.assertEqual(runner.status().state, "Failed")

    async def test_post_action_run_command_executes_shell(self):
        events = EventBus()
        runner = MaaRunnerService(FakeRunnerAdapter("Completed"), events)
        if platform.system() == "Windows":
            command = 'cmd /c "echo hello-from-post-action"'
        else:
            command = "echo hello-from-post-action"
        runner.set_post_action(PostAction(type="run_command", command=command, command_timeout_seconds=10))

        await runner.run(profile_with_task())
        await runner._task

        log_text = "\n".join(_extract_card_text(card) for card in runner.log_service.cards("current"))
        self.assertIn("hello-from-post-action", log_text)
        event_types = [event.type for event in events.recent()]
        self.assertNotIn("runner.post_action.error", event_types)

    async def test_post_action_run_command_reports_failure(self):
        events = EventBus()
        runner = MaaRunnerService(FakeRunnerAdapter("Completed"), events)
        if platform.system() == "Windows":
            command = "cmd /c exit 7"
        else:
            command = "sh -c 'exit 7'"
        runner.set_post_action(PostAction(type="run_command", command=command, command_timeout_seconds=10))

        await runner.run(profile_with_task())
        await runner._task

        event_types = [event.type for event in events.recent()]
        self.assertIn("runner.post_action.error", event_types)

    async def test_post_action_run_command_skips_when_empty(self):
        events = EventBus()
        runner = MaaRunnerService(FakeRunnerAdapter("Completed"), events)
        runner.set_post_action(PostAction(type="run_command", command="   "))

        await runner.run(profile_with_task())
        await runner._task

        event_types = [event.type for event in events.recent()]
        self.assertNotIn("runner.post_action.error", event_types)

    async def test_run_event_callback_fires_on_chain_failure(self):
        events = EventBus()
        captured: list[tuple[str, dict]] = []

        async def callback(event_type: str, payload: dict) -> None:
            captured.append((event_type, payload))

        runner = MaaRunnerService(FakeRunnerAdapter("Failed"), events, run_event_callback=callback)
        await runner.run(profile_with_task())
        await runner._task

        self.assertEqual([event for event, _ in captured], ["error"])
        self.assertEqual(captured[0][1]["state"], "Failed")

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

    async def test_shutdown_stops_running_task_before_returning(self):
        events = EventBus()
        adapter = FakeRunnerAdapter(wait_for_stop=True)
        runner = MaaRunnerService(adapter, events)

        await runner.run(profile_with_task())
        await adapter.started.wait()
        await runner.shutdown()

        self.assertTrue(adapter.stop_called)
        self.assertTrue(runner._task.done())
        self.assertEqual(runner.status().state, "Stopped")

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

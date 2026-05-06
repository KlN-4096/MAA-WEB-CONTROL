import tempfile
import unittest
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import create_api_router
from app.events import EventBus
from app.runner import DryRunMaaAdapter, MaaRunnerService
from app.scheduler import SchedulerService
from app.storage import ProfileStore


class SchedulerServiceTest(unittest.IsolatedAsyncioTestCase):
    async def test_stop_waits_for_background_loop_to_finish(self):
        with tempfile.TemporaryDirectory() as directory:
            scheduler = SchedulerService(EventBus(), Path(directory) / "scheduler.json")
            scheduler.start()

            self.assertIsNotNone(scheduler._task)
            task = scheduler._task
            self.assertFalse(task.done())

            await scheduler.stop()

            self.assertTrue(task.done())
            self.assertIsNone(scheduler._task)


class SchedulerApiConfigTest(unittest.TestCase):
    def test_post_action_endpoint_persists_in_scheduler_config(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config_path = root / "data" / "scheduler.json"
            events = EventBus()
            scheduler = SchedulerService(events, config_path)
            runner = MaaRunnerService(DryRunMaaAdapter(), events)
            app = FastAPI()
            app.include_router(create_api_router(
                ProfileStore(root / "profiles"),
                runner,
                events,
                scheduler=scheduler,
                project_root=root,
            ))

            response = TestClient(app).put(
                "/api/post-action",
                json={"type": "sleep", "only_if_no_other_maa": True},
            )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(runner.post_action.type, "sleep")
            data = json.loads(config_path.read_text(encoding="utf-8"))
            self.assertEqual(data["post_action"]["type"], "sleep")
            self.assertTrue(data["post_action"]["only_if_no_other_maa"])
            self.assertEqual(SchedulerService(events, config_path).config.post_action.type, "sleep")

    def test_scheduler_update_keeps_runner_post_action_in_sync(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            events = EventBus()
            scheduler = SchedulerService(events, root / "data" / "scheduler.json")
            runner = MaaRunnerService(DryRunMaaAdapter(), events)
            app = FastAPI()
            app.include_router(create_api_router(
                ProfileStore(root / "profiles"),
                runner,
                events,
                scheduler=scheduler,
                project_root=root,
            ))

            response = TestClient(app).put("/api/scheduler", json={
                "enabled": True,
                "slots": [],
                "post_action": {"type": "hibernate", "only_if_no_other_maa": False},
            })

            self.assertEqual(response.status_code, 200)
            self.assertEqual(runner.post_action.type, "hibernate")

    def test_router_initializes_runner_post_action_from_scheduler_config(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config_path = root / "data" / "scheduler.json"
            config_path.parent.mkdir(parents=True)
            config_path.write_text(json.dumps({
                "enabled": False,
                "slots": [],
                "post_action": {"type": "shutdown", "only_if_no_other_maa": False},
            }), encoding="utf-8")
            events = EventBus()
            scheduler = SchedulerService(events, config_path)
            runner = MaaRunnerService(DryRunMaaAdapter(), events)

            app = FastAPI()
            app.include_router(create_api_router(
                ProfileStore(root / "profiles"),
                runner,
                events,
                scheduler=scheduler,
                project_root=root,
            ))

            self.assertEqual(runner.post_action.type, "shutdown")


if __name__ == "__main__":
    unittest.main()

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import create_api_router
from app.events import EventBus
from app.logs import MaaLogService
from app.models import AdbConfig, Profile
from app.runner import DryRunMaaAdapter, MaaRunnerService
from app.storage import ProfileStore


class RedroidApiTest(unittest.TestCase):
    def test_redroid_status_reports_running_container(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ProfileStore(Path(directory))
            events = EventBus()
            logs = MaaLogService(events)
            runner = MaaRunnerService(DryRunMaaAdapter(), events, logs)
            app = FastAPI()
            app.include_router(create_api_router(store, runner, events, logs))

            with patch("app.api.subprocess.run") as run:
                run.return_value.stdout = "running|true\n"
                run.return_value.stderr = ""
                run.return_value.returncode = 0
                response = TestClient(app).get("/api/redroid/status")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["available"])
        self.assertEqual(payload["container"], "redroid")
        self.assertIn("running", payload["message"])

    def test_redroid_status_handles_missing_container(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ProfileStore(Path(directory))
            events = EventBus()
            logs = MaaLogService(events)
            runner = MaaRunnerService(DryRunMaaAdapter(), events, logs)
            app = FastAPI()
            app.include_router(create_api_router(store, runner, events, logs))

            with patch("app.api.subprocess.run") as run:
                run.return_value.stdout = ""
                run.return_value.stderr = "Error: No such object: redroid\n"
                run.return_value.returncode = 1
                response = TestClient(app).get("/api/redroid/status")

        payload = response.json()
        self.assertFalse(payload["available"])
        self.assertIn("不存在", payload["message"])

    def test_redroid_status_handles_missing_docker_command(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ProfileStore(Path(directory))
            events = EventBus()
            logs = MaaLogService(events)
            runner = MaaRunnerService(DryRunMaaAdapter(), events, logs)
            app = FastAPI()
            app.include_router(create_api_router(store, runner, events, logs))

            with patch("app.api.subprocess.run", side_effect=FileNotFoundError()):
                response = TestClient(app).get("/api/redroid/status")

        payload = response.json()
        self.assertFalse(payload["available"])
        self.assertIn("docker", payload["message"])


class AdbApiTest(unittest.TestCase):
    def test_adb_devices_reports_configured_profile_device(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ProfileStore(Path(directory))
            events = EventBus()
            logs = MaaLogService(events)
            runner = MaaRunnerService(DryRunMaaAdapter(), events, logs)
            profile = Profile(name="daily", adb=AdbConfig(address="127.0.0.1:5555", adb_path="adb"))
            store.save(profile)
            runner._profile = profile
            app = FastAPI()
            app.include_router(create_api_router(store, runner, events, logs))
            output = "List of devices attached\n127.0.0.1:5555\tdevice\n"

            with patch("app.api.subprocess.run") as run:
                run.return_value.stdout = output
                run.return_value.stderr = ""
                run.return_value.returncode = 0
                response = TestClient(app).get("/api/adb/devices")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["available"])
        self.assertEqual(payload["message"], "ADB 已连接：127.0.0.1:5555")
        self.assertEqual(payload["devices"], ["127.0.0.1:5555 (device)"])

    def test_adb_test_screenshot_includes_connection_benchmark(self):
        class ScreenshotAdapter:
            screenshot_benchmark = {
                "kind": "screenshot",
                "method": "LDExtras",
                "cost": 41,
                "alternatives": [{"method": "RawByNc", "cost": "931"}],
            }

            async def get_image(self):
                return b"png"

        with tempfile.TemporaryDirectory() as directory:
            store = ProfileStore(Path(directory))
            events = EventBus()
            logs = MaaLogService(events)
            runner = MaaRunnerService(ScreenshotAdapter(), events, logs)
            app = FastAPI()
            app.include_router(create_api_router(store, runner, events, logs))
            response = TestClient(app).post("/api/adb/test-screenshot")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["size"], 3)
        self.assertEqual(payload["benchmark"]["method"], "LDExtras")
        self.assertEqual(payload["benchmark"]["alternatives"][0]["cost"], "931")


if __name__ == "__main__":
    unittest.main()

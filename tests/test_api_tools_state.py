import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import create_api_router
from app.events import EventBus
from app.runner import DryRunMaaAdapter, MaaRunnerService
from app.storage import ProfileStore


def build_client(root: Path):
    events = EventBus()
    runner = MaaRunnerService(DryRunMaaAdapter(), events)
    store = ProfileStore(root / "data" / "profiles")
    app = FastAPI()
    app.include_router(create_api_router(store, runner, events, project_root=root))
    return TestClient(app)


class ToolsStateApiTest(unittest.TestCase):
    def test_state_round_trips_and_merges(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            client = build_client(root)

            self.assertEqual(client.get("/api/tools/state").json(), {})

            client.put("/api/tools/state", json={"depot": {"items": [{"itemId": "30011", "count": 5}]}})
            client.put("/api/tools/state", json={"operbox": {"own": [{"name": "阿米娅"}]}})
            state = client.get("/api/tools/state").json()

            self.assertEqual(state["depot"]["items"][0]["itemId"], "30011")
            self.assertEqual(state["operbox"]["own"][0]["name"], "阿米娅")
            self.assertTrue((root / "data" / "tools_state.json").exists())

    def test_unknown_keys_are_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            client = build_client(Path(directory))

            client.put("/api/tools/state", json={"evil": {"x": 1}, "depot": {"items": []}})

            self.assertEqual(set(client.get("/api/tools/state").json()), {"depot"})


class CopilotUploadTest(unittest.TestCase):
    def test_upload_writes_json_to_server(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            client = build_client(root)

            response = client.post(
                "/api/copilot/upload",
                json={"name": "CV-EX-1.json", "content": json.dumps({"stage_name": "CV-EX-1"})},
            )
            payload = response.json()

            self.assertTrue(payload["ok"])
            written = Path(payload["path"])
            self.assertTrue(written.exists())
            self.assertEqual(json.loads(written.read_text(encoding="utf-8"))["stage_name"], "CV-EX-1")

    def test_upload_rejects_invalid_json(self):
        with tempfile.TemporaryDirectory() as directory:
            client = build_client(Path(directory))

            response = client.post("/api/copilot/upload", json={"name": "x.json", "content": "not json"})

            self.assertEqual(response.status_code, 400)

    def test_upload_strips_directory_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            client = build_client(root)

            payload = client.post(
                "/api/copilot/upload",
                json={"name": "../../evil.json", "content": "{}"},
            ).json()

            self.assertEqual(Path(payload["path"]).parent, root / "data" / "copilot_upload")
            self.assertEqual(payload["name"], "evil.json")


class AdbDetectTest(unittest.TestCase):
    def test_detect_reports_online_devices(self):
        with tempfile.TemporaryDirectory() as directory:
            client = build_client(Path(directory))

            class Result:
                def __init__(self, stdout="", stderr=""):
                    self.stdout = stdout
                    self.stderr = stderr
                    self.returncode = 0

            def fake_run(args, **kwargs):
                if args[1] == "devices":
                    return Result("List of devices attached\n127.0.0.1:5555\tdevice\n")
                return Result("")

            with patch("app.api.subprocess.run", side_effect=fake_run):
                payload = client.post("/api/adb/detect").json()

            self.assertTrue(payload["ok"])
            self.assertEqual(payload["address"], "127.0.0.1:5555")

    def test_detect_reports_failure_without_devices(self):
        with tempfile.TemporaryDirectory() as directory:
            client = build_client(Path(directory))

            class Empty:
                stdout = "List of devices attached\n"
                stderr = ""
                returncode = 0

            with patch("app.api.subprocess.run", return_value=Empty()):
                payload = client.post("/api/adb/detect").json()

            self.assertFalse(payload["ok"])
            self.assertIn("未检测到", payload["message"])


if __name__ == "__main__":
    unittest.main()

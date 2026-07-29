import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import create_api_router
from app.events import EventBus
from app.models import AppendCall, Profile
from app.runner import MaaRunnerService
from app.storage import ProfileStore


class RecordingAdapter:
    def __init__(self, connected=True):
        self.append_calls = []
        self.start_calls = 0
        self.stop_calls = 0
        self.connect_calls = 0
        self._connected = connected

    @property
    def task_chain_status(self):
        return "Completed"

    @property
    def is_connected(self):
        return self._connected

    async def connect(self, profile):
        self.connect_calls += 1
        self._connected = True
        return True

    async def append_task(self, call: AppendCall):
        self.append_calls.append(call)
        return len(self.append_calls)

    async def start(self, wait: bool = True):
        self.start_calls += 1
        self.last_start_wait = wait
        return True

    async def stop(self):
        self.stop_calls += 1
        return True


class CopilotApiTest(unittest.TestCase):
    def test_start_copilot_single_file_sends_full_params(self):
        adapter, client = self._client()

        response = client.post("/api/copilot/start", json={
            "name": "cv-ex-1",
            "task_type": "Copilot",
            "filename": "CV-EX-1.json",
            "loop_times": 3,
            "formation": True,
            "formation_index": 2,
            "add_trust": True,
            "ignore_requirements": True,
            "support_unit_usage": 3,
            "support_unit_name": "棘刺",
            "user_additional": [{"name": "史尔特尔", "skill": 3}],
        })

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["task_type"], "Copilot")
        self.assertEqual(adapter.start_calls, 1)
        call = adapter.append_calls[0]
        self.assertEqual(call.type, "Copilot")
        self.assertEqual(call.params, {
            "filename": "CV-EX-1.json",
            "loop_times": 3,
            "formation": True,
            "formation_index": 2,
            "add_trust": True,
            "ignore_requirements": True,
            "support_unit_usage": 3,
            "support_unit_name": "棘刺",
            "user_additional": [{"name": "史尔特尔", "skill": 3}],
        })

    def test_start_copilot_list_sends_copilot_list(self):
        adapter, client = self._client()

        response = client.post("/api/copilot/start", json={
            "name": "multi",
            "task_type": "Copilot",
            "use_sanity_potion": True,
            "copilot_list": [
                {"filename": "a.json", "stage_name": "CV-EX-1", "is_raid": False},
                {"filename": "b.json", "stage_name": "CV-EX-2", "is_raid": True},
            ],
        })

        self.assertEqual(response.status_code, 200)
        call = adapter.append_calls[0]
        self.assertEqual(call.type, "Copilot")
        self.assertEqual(call.params, {
            "copilot_list": [
                {"filename": "a.json", "stage_name": "CV-EX-1", "is_raid": False},
                {"filename": "b.json", "stage_name": "CV-EX-2", "is_raid": True},
            ],
            "use_sanity_potion": True,
        })

    def test_start_sss_copilot_filters_unsupported_fields(self):
        adapter, client = self._client()

        response = client.post("/api/copilot/start", json={
            "name": "sss",
            "task_type": "SSSCopilot",
            "filename": "sss.json",
            "loop_times": 2,
            "formation": True,
            "ignore_requirements": True,
        })

        self.assertEqual(response.status_code, 200)
        call = adapter.append_calls[0]
        self.assertEqual(call.type, "SSSCopilot")
        self.assertEqual(call.params, {"filename": "sss.json", "loop_times": 2})

    def test_start_paradox_copilot_supports_single_file_and_list(self):
        adapter, client = self._client()

        single = client.post("/api/copilot/start", json={
            "name": "paradox-one",
            "task_type": "ParadoxCopilot",
            "filename": "amiya.json",
        })
        batch = client.post("/api/copilot/start", json={
            "name": "paradox-list",
            "task_type": "ParadoxCopilot",
            "list": ["chen.json", "texas.json"],
        })

        self.assertEqual(single.status_code, 200)
        self.assertEqual(batch.status_code, 200)
        self.assertEqual(adapter.append_calls[0].type, "ParadoxCopilot")
        self.assertEqual(adapter.append_calls[0].params, {"filename": "amiya.json"})
        self.assertEqual(adapter.append_calls[1].type, "ParadoxCopilot")
        self.assertEqual(adapter.append_calls[1].params, {"list": ["chen.json", "texas.json"]})

    def test_legacy_run_endpoint_uses_new_start_logic(self):
        adapter, client = self._client()

        response = client.post("/api/copilot/run", json={
            "name": "legacy",
            "path": "legacy.json",
            "formation": 2,
            "loop_times": 4,
        })

        self.assertEqual(response.status_code, 200)
        call = adapter.append_calls[0]
        self.assertEqual(call.type, "Copilot")
        self.assertEqual(call.params, {
            "filename": "legacy.json",
            "loop_times": 4,
            "formation": True,
            "formation_index": 2,
        })

    def test_resolve_local_file_returns_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            project_root = Path(directory)
            store = ProfileStore(project_root / "profiles")
            adapter = RecordingAdapter()
            app = FastAPI()
            app.include_router(create_api_router(
                store,
                MaaRunnerService(adapter, EventBus()),
                EventBus(),
                project_root=project_root,
            ))
            local = project_root / "x.json"
            local.write_text(json.dumps({
                "stage_name": "1-7",
                "doc": {"title": "demo"},
                "opers": [{"name": "山", "skill": 2}],
                "actions": [{}, {}],
            }, ensure_ascii=False), encoding="utf-8")

            client = TestClient(app)
            response = client.post("/api/copilot/resolve", json={"code": str(local)})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["info"]["stage_name"], "1-7")
        self.assertEqual(payload["info"]["title"], "demo")
        self.assertEqual(payload["info"]["source"], "local")
        self.assertEqual(len(payload["info"]["opers"]), 1)

    def test_resolve_mystery_code_downloads_and_returns_path(self):
        with tempfile.TemporaryDirectory() as directory:
            project_root = Path(directory)
            store = ProfileStore(project_root / "profiles")
            adapter = RecordingAdapter()
            app = FastAPI()
            app.include_router(create_api_router(
                store,
                MaaRunnerService(adapter, EventBus()),
                EventBus(),
                project_root=project_root,
            ))
            wrapper = {
                "data": {
                    "id": 24680,
                    "uploader": "boss",
                    "rating_level": 5,
                    "stage_name": "CV-EX-1",
                    "content": json.dumps({
                        "stage_name": "CV-EX-1",
                        "doc": {"title": "CV-EX-1 三星"},
                        "opers": [{"name": "山", "skill": 2}, {"name": "讯使", "skill": 1}],
                        "groups": [{"name": "盾"}],
                        "actions": [{}, {}, {}],
                    }),
                }
            }

            class _Response:
                def read(self):
                    return json.dumps(wrapper).encode("utf-8")

                def __enter__(self):
                    return self

                def __exit__(self, exc_type, exc, tb):
                    return False

            with patch("app.copilot_resolver.urlrequest.urlopen", return_value=_Response()):
                client = TestClient(app)
                response = client.post("/api/copilot/resolve", json={"code": "maa://24680"})

            self.assertEqual(response.status_code, 200)
            payload = response.json()
            self.assertTrue(payload["ok"])
            self.assertEqual(payload["info"]["upstream_id"], 24680)
            self.assertEqual(payload["info"]["source"], "prts.plus")
            self.assertEqual(payload["info"]["rating_level"], 5)
            self.assertTrue(payload["path"].endswith("maa-prts-24680.json"))
            self.assertTrue(Path(payload["path"]).exists())

    def test_resolve_returns_error_for_invalid_code(self):
        with tempfile.TemporaryDirectory() as directory:
            project_root = Path(directory)
            store = ProfileStore(project_root / "profiles")
            adapter = RecordingAdapter()
            app = FastAPI()
            app.include_router(create_api_router(
                store,
                MaaRunnerService(adapter, EventBus()),
                EventBus(),
                project_root=project_root,
            ))

            client = TestClient(app)
            response = client.post("/api/copilot/resolve", json={"code": "/no/such/file.json"})

        payload = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertFalse(payload["ok"])
        self.assertIn("不存在", payload["message"])

    def _client(self):
        adapter = RecordingAdapter()
        events = EventBus()
        with tempfile.TemporaryDirectory() as directory:
            store = ProfileStore(Path(directory))
            app = FastAPI()
            app.include_router(create_api_router(store, MaaRunnerService(adapter, events), events))
            return adapter, TestClient(app)



class CopilotRuntimeContractTest(unittest.TestCase):
    """这些断言是为了让「非阻塞启动」「自动连接」两条修复一旦回退就变红。"""

    def _client(self, connected=True):
        adapter = RecordingAdapter(connected=connected)
        events = EventBus()
        runner = MaaRunnerService(adapter, events)
        directory = tempfile.mkdtemp()
        store = ProfileStore(Path(directory) / "profiles")
        store.save(Profile(name="daily"))
        app = FastAPI()
        app.include_router(create_api_router(store, runner, events, project_root=Path(directory)))
        return adapter, TestClient(app)

    def test_start_does_not_block_on_task_chain(self):
        adapter, client = self._client()

        client.post("/api/copilot/start", json={"name": "x", "filename": "a.json"})

        self.assertIs(adapter.last_start_wait, False)

    def test_start_connects_when_adapter_not_connected(self):
        adapter, client = self._client(connected=False)

        payload = client.post(
            "/api/copilot/start",
            json={"name": "x", "filename": "a.json", "profile_name": "daily"},
        ).json()

        self.assertTrue(payload["ok"])
        self.assertEqual(adapter.connect_calls, 1)

    def test_tools_run_uses_core_task_types_only(self):
        adapter, client = self._client()
        core_types = {
            "Fight", "StartUp", "CloseDown", "Award", "Mall", "Infrast", "Recruit", "Roguelike",
            "Copilot", "SSSCopilot", "ParadoxCopilot", "SingleStep", "VideoRecognition",
            "Depot", "OperBox", "Reclamation", "Custom",
        }

        for tool in ("recruit_calc", "depot", "operbox", "gacha_once"):
            client.post("/api/tools/run", json={"tool": tool, "profile_name": "daily"})

        self.assertTrue(adapter.append_calls)
        for call in adapter.append_calls:
            self.assertIn(call.type, core_types, f"{call.type} 不是 MaaCore 支持的任务类型")
        self.assertIs(adapter.last_start_wait, False)


if __name__ == "__main__":
    unittest.main()

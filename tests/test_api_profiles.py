import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import create_api_router
from app.events import EventBus
from app.models import Profile, TaskDefinition
from app.runner import DryRunMaaAdapter, MaaRunnerService
from app.storage import ProfileStore


class ProfileApiTest(unittest.TestCase):
    def test_get_profile_keeps_builtin_disabled_tasks_visible(self):
        with tempfile.TemporaryDirectory() as directory:
            store, client = self._client(Path(directory))
            store.save(Profile(
                name="daily",
                tasks=[
                    TaskDefinition(id="startup", type="StartUp", enabled=True),
                    TaskDefinition(id="award", type="Award", enabled=True),
                ],
            ))

            response = client.get("/api/profiles/daily")

        self.assertEqual(response.status_code, 200)
        tasks = response.json()["tasks"]
        self.assertEqual([task["id"] for task in tasks[:9]], [
            "startup",
            "recruit",
            "infrast",
            "fight",
            "remaining-sanity",
            "mall",
            "award",
            "roguelike",
            "reclamation",
        ])
        self.assertEqual([task["id"] for task in tasks if task["enabled"]], ["startup", "award"])

    def test_put_profile_persists_builtin_disabled_tasks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store, client = self._client(root)
            response = client.put("/api/profiles/daily", json={
                "name": "daily",
                "tasks": [{"id": "award", "type": "Award", "enabled": True}],
            })

            saved = store.load("daily")

        self.assertEqual(response.status_code, 200)
        self.assertIn("roguelike", [task.id for task in saved.tasks])
        self.assertFalse(next(task for task in saved.tasks if task.id == "roguelike").enabled)

    def _client(self, root: Path):
        events = EventBus()
        store = ProfileStore(root / "profiles")
        app = FastAPI()
        app.include_router(create_api_router(
            store,
            MaaRunnerService(DryRunMaaAdapter(), events),
            events,
            project_root=root,
        ))
        return store, TestClient(app)


if __name__ == "__main__":
    unittest.main()

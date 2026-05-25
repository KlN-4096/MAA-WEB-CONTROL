import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import create_api_router
from app.capabilities import build_capabilities
from app.events import EventBus
from app.runner import DryRunMaaAdapter, MaaRunnerService
from app.storage import ProfileStore


class CapabilitiesTest(unittest.TestCase):
    def test_build_capabilities_exposes_features_and_defaults(self):
        capabilities = build_capabilities()

        self.assertEqual(capabilities["version"], 1)
        self.assertTrue(capabilities["features"]["basement"]["enabled"])
        self.assertTrue(capabilities["features"]["copilot"]["enabled"])
        self.assertEqual(capabilities["profiles"]["defaults"], ["daily-shoucai", "daily-shualizhi"])
        self.assertTrue(capabilities["supports_visit_as_mall_subtask"])
        self.assertIn("Fight", capabilities["tasks"])
        self.assertTrue(capabilities["tasks"]["Fight"]["supports_advanced"])
        self.assertTrue(capabilities["tasks"]["StartUp"]["supports_advanced"])

    def test_api_capabilities_route_returns_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ProfileStore(Path(directory))
            events = EventBus()
            runner = MaaRunnerService(DryRunMaaAdapter(), events)
            app = FastAPI()
            app.include_router(create_api_router(store, runner, events))

            with TestClient(app) as client:
                response = client.get("/api/capabilities")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["profiles"]["defaults"], ["daily-shoucai", "daily-shualizhi"])

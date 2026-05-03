import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import create_api_router
from app.events import EventBus
from app.logs import MaaLogService
from app.runner import DryRunMaaAdapter, MaaRunnerService
from app.storage import ProfileStore


class LogApiTest(unittest.TestCase):
    def test_log_card_routes_expose_current_run_shape(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ProfileStore(Path(directory))
            events = EventBus()
            logs = MaaLogService(events)
            runner = MaaRunnerService(DryRunMaaAdapter(), events, logs)
            app = FastAPI()
            app.include_router(create_api_router(store, runner, events, logs))
            logs.clear()
            logs.append("hello", color_key="InfoLogBrush")

            with TestClient(app) as client:
                cards = client.get("/api/logs/cards?run_id=current")
                cleared = client.post("/api/logs/clear")
                missing_thumbnail = client.get("/api/logs/thumbnails/missing")

        self.assertEqual(cards.status_code, 200)
        self.assertEqual(cards.json()["cards"][0]["items"][0]["content"], "hello")
        self.assertEqual(cleared.status_code, 200)
        self.assertEqual(missing_thumbnail.status_code, 404)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import create_api_router
from app.events import EventBus
from app.runner import DryRunMaaAdapter, MaaRunnerService
from app.storage import ProfileStore
from app.update_service import UpdateService


class CoreUpdateBackgroundTest(unittest.TestCase):
    def test_core_update_starts_in_background_and_joins_duplicate_work(self):
        async def run() -> tuple[dict, dict, dict, int]:
            with tempfile.TemporaryDirectory() as directory:
                service = make_service(Path(directory))
                release = asyncio.Event()
                started = 0

                async def run_core_update(_client_type: str, _checked: dict | None, _manual: bool) -> None:
                    nonlocal started
                    started += 1
                    await release.wait()

                service._run_core_update = run_core_update

                accepted = service.start_core_update("Official")
                await asyncio.sleep(0)
                running = service.state["core_action"]
                duplicate = service.start_core_update("Official")

                release.set()
                await service._core_update_task
                return accepted, running, duplicate, started

        accepted, running, duplicate, started = asyncio.run(run())

        self.assertTrue(accepted["accepted"])
        self.assertEqual(running["state"], "running")
        self.assertTrue(duplicate["accepted"])
        self.assertTrue(duplicate["existing"])
        self.assertEqual(started, 1)

    def test_core_update_failure_is_exposed_in_state(self):
        async def run() -> dict:
            with tempfile.TemporaryDirectory() as directory:
                service = make_service(Path(directory))

                def update_core(_client_type: str, _checked: dict | None, _manual: bool) -> dict:
                    raise KeyError("unexpected failure")

                service._update_core_sync = update_core
                service.start_core_update("Official")
                await asyncio.gather(service._core_update_task, return_exceptions=True)
                return service.state["core_action"]

        action = asyncio.run(run())

        self.assertFalse(action["ok"])
        self.assertEqual(action["state"], "failed")
        self.assertIn("unexpected failure", action["message"])

    def test_automatic_update_joins_existing_manual_update(self):
        async def run() -> tuple[int, dict]:
            with tempfile.TemporaryDirectory() as directory:
                service = make_service(Path(directory))
                release = asyncio.Event()
                started = 0

                async def run_core_update(_client_type: str, _checked: dict | None, _manual: bool) -> None:
                    nonlocal started
                    started += 1
                    await release.wait()
                    service._set_core_action({"ok": True, "state": "completed", "message": "done"})

                service._run_core_update = run_core_update
                service.start_core_update("Official")
                automatic = asyncio.create_task(service.update_core("Official", checked={"core": {}}, manual=False))
                await asyncio.sleep(0)
                release.set()
                result = await automatic
                return started, result

        started, result = asyncio.run(run())

        self.assertEqual(started, 1)
        self.assertEqual(result["state"], "completed")

    def test_stop_waits_for_active_core_update(self):
        async def run() -> tuple[bool, bool]:
            with tempfile.TemporaryDirectory() as directory:
                service = make_service(Path(directory))
                release = asyncio.Event()

                async def run_core_update(_client_type: str, _checked: dict | None, _manual: bool) -> None:
                    await release.wait()

                service._run_core_update = run_core_update
                service.start_core_update("Official")
                stopping = asyncio.create_task(service.stop())
                await asyncio.sleep(0)
                waited = not stopping.done()
                release.set()
                await stopping
                return waited, service._core_update_task.done()

        waited, completed = asyncio.run(run())

        self.assertTrue(waited)
        self.assertTrue(completed)

    def test_stop_cancels_startup_update_before_it_can_create_core_work(self):
        async def run() -> tuple[bool, dict]:
            with tempfile.TemporaryDirectory() as directory:
                service = make_service(Path(directory))
                service._config.startup_update_check = True
                started = asyncio.Event()
                attempted: dict = {}

                async def startup_update(_client_type: str, *, reason: str) -> dict:
                    started.set()
                    try:
                        await asyncio.Event().wait()
                    except asyncio.CancelledError:
                        attempted.update(service.start_core_update("Official"))
                        raise

                service.check_and_auto_update = startup_update
                service.start()
                await started.wait()
                await service.stop()
                return service._startup_task is None, attempted

        producer_stopped, attempted = asyncio.run(run())

        self.assertTrue(producer_stopped)
        self.assertFalse(attempted["accepted"])
        self.assertIn("服务正在停止", attempted["message"])

    def test_core_update_api_returns_accepted_without_waiting_for_completion(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            service = make_service(root)
            service.start_core_update = Mock(return_value={
                "ok": True,
                "accepted": True,
                "state": "running",
                "message": "核心更新已开始",
            })
            app = FastAPI()
            app.include_router(create_api_router(
                ProfileStore(root / "profiles"),
                service._runner,
                EventBus(),
                project_root=root,
                update_service=service,
            ))

            response = TestClient(app).post("/api/update/core", json={"client_type": "Official"})

        self.assertEqual(response.status_code, 202)
        self.assertTrue(response.json()["accepted"])


def make_service(root: Path) -> UpdateService:
    events = EventBus()
    runner = MaaRunnerService(DryRunMaaAdapter(), events)
    return UpdateService(root / "data" / "update_config.json", root / "cache", runner, events)


if __name__ == "__main__":
    unittest.main()

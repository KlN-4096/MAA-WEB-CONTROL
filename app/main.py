from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles

from .api import create_api_router, events_socket, peep_socket
from .default_profiles import build_default_profiles
from .events import EventBus
from .logs import MaaLogService
from .maa_adapter import create_maa_adapter
from .runner import MaaRunnerService
from .scheduler import SchedulerService
from .storage import ProfileStore


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PROFILE_DIR = PROJECT_ROOT / "data" / "profiles"
WEB_DIR = PROJECT_ROOT / "web"
SCHEDULER_CONFIG = PROJECT_ROOT / "data" / "scheduler.json"

event_bus = EventBus()
log_service = MaaLogService(event_bus)
profile_store = ProfileStore(PROFILE_DIR)
profile_store.ensure_defaults(build_default_profiles())
runner = MaaRunnerService(create_maa_adapter(PROJECT_ROOT, event_bus, log_service=log_service), event_bus, log_service)


async def _scheduler_run_callback(profile_name: str) -> None:
    try:
        profile = profile_store.load(profile_name)
        await runner.run(profile)
    except (FileNotFoundError, RuntimeError):
        pass


scheduler = SchedulerService(event_bus, SCHEDULER_CONFIG, run_callback=_scheduler_run_callback)

app = FastAPI(title="MAA Web Control", version="0.2.0")
app.include_router(create_api_router(profile_store, runner, event_bus, log_service, scheduler, project_root=PROJECT_ROOT))


@app.on_event("startup")
async def on_startup() -> None:
    scheduler.start()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await scheduler.stop()


@app.websocket("/api/events")
async def websocket_events(websocket: WebSocket) -> None:
    await events_socket(websocket, event_bus)


@app.websocket("/api/peep")
async def websocket_peep(websocket: WebSocket) -> None:
    await peep_socket(websocket, runner)


app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")

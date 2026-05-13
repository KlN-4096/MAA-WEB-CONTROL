from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles

from .api import create_api_router, events_socket, peep_socket
from .default_profiles import build_default_profiles
from .events import EventBus
from .logs import MaaLogService
from .maa_adapter import create_maa_adapter
from .notifications import NotificationService
from .runner import MaaRunnerService
from .scheduler import SchedulerService
from .storage import ProfileStore
from .update_service import UpdateService
from .version import WEB_VERSION


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PROFILE_DIR = PROJECT_ROOT / "data" / "profiles"
WEB_DIR = PROJECT_ROOT / "web"
SCHEDULER_CONFIG = PROJECT_ROOT / "data" / "scheduler.json"
USERDATA_STATE_PATH = PROJECT_ROOT / "data" / "userdata_state.json"
NOTIFICATION_CONFIG = PROJECT_ROOT / "data" / "notifications.json"
RUNNER_CONFIG = PROJECT_ROOT / "data" / "runner_config.json"
UPDATE_CONFIG = PROJECT_ROOT / "data" / "update_config.json"
UPDATE_CACHE = PROJECT_ROOT / "data" / "update_cache"


def _initial_task_timeout_minutes() -> int:
    try:
        data = json.loads(RUNNER_CONFIG.read_text(encoding="utf-8"))
    except (OSError, FileNotFoundError, json.JSONDecodeError):
        return 0
    return int(data.get("task_timeout_minutes", 0)) if isinstance(data, dict) else 0


event_bus = EventBus()
log_service = MaaLogService(event_bus)
profile_store = ProfileStore(PROFILE_DIR)
profile_store.ensure_defaults(build_default_profiles())
notification_service = NotificationService(NOTIFICATION_CONFIG, event_bus)
runner = MaaRunnerService(
    create_maa_adapter(PROJECT_ROOT, event_bus, log_service=log_service),
    event_bus,
    log_service,
    userdata_state_path=USERDATA_STATE_PATH,
    run_event_callback=notification_service.dispatch_run_event,
    task_timeout_minutes=_initial_task_timeout_minutes(),
)


async def _scheduler_run_callback(profile_name: str) -> None:
    try:
        profile = profile_store.load(profile_name)
        await runner.run(profile)
    except (FileNotFoundError, RuntimeError):
        pass


scheduler = SchedulerService(event_bus, SCHEDULER_CONFIG, run_callback=_scheduler_run_callback)
update_service = UpdateService(UPDATE_CONFIG, UPDATE_CACHE, runner, event_bus)

app = FastAPI(title="MAA Web Control", version=WEB_VERSION)
app.include_router(create_api_router(
    profile_store,
    runner,
    event_bus,
    log_service,
    scheduler,
    project_root=PROJECT_ROOT,
    notifications=notification_service,
    update_service=update_service,
))


@app.on_event("startup")
async def on_startup() -> None:
    scheduler.start()
    update_service.start()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await update_service.stop()
    await scheduler.stop()
    await runner.shutdown()


@app.websocket("/api/events")
async def websocket_events(websocket: WebSocket) -> None:
    await events_socket(websocket, event_bus)


@app.websocket("/api/peep")
async def websocket_peep(websocket: WebSocket) -> None:
    await peep_socket(websocket, runner)


app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles

from .api import create_api_router, events_socket
from .default_profiles import build_default_profiles
from .events import EventBus
from .maa_adapter import create_maa_adapter
from .runner import MaaRunnerService
from .storage import ProfileStore


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PROFILE_DIR = PROJECT_ROOT / "data" / "profiles"
WEB_DIR = PROJECT_ROOT / "web"

event_bus = EventBus()
profile_store = ProfileStore(PROFILE_DIR)
profile_store.ensure_defaults(build_default_profiles())
runner = MaaRunnerService(create_maa_adapter(PROJECT_ROOT, event_bus), event_bus)

app = FastAPI(title="MAA Web Control", version="0.1.0")
app.include_router(create_api_router(profile_store, runner, event_bus))


@app.websocket("/api/events")
async def websocket_events(websocket: WebSocket) -> None:
    await events_socket(websocket, event_bus)


app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles

from .api import create_api_router, events_socket
from .events import EventBus
from .runner import DryRunMaaAdapter, MaaRunnerService
from .storage import ProfileStore


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PROFILE_DIR = PROJECT_ROOT / "data" / "profiles"
WEB_DIR = PROJECT_ROOT / "web"

event_bus = EventBus()
profile_store = ProfileStore(PROFILE_DIR)
runner = MaaRunnerService(DryRunMaaAdapter(), event_bus)

app = FastAPI(title="MAA Web Control", version="0.1.0")
app.include_router(create_api_router(profile_store, runner, event_bus))


@app.websocket("/api/events")
async def websocket_events(websocket: WebSocket) -> None:
    await events_socket(websocket, event_bus)


app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")


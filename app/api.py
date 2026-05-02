from __future__ import annotations

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from .events import EventBus
from .models import AdbStatus, Profile, RedroidStatus, RunRequest
from .options import build_ui_options
from .runner import MaaRunnerService
from .storage import ProfileStore


def create_api_router(store: ProfileStore, runner: MaaRunnerService, events: EventBus) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/status")
    async def get_status():
        return runner.status()

    @router.get("/profiles")
    async def list_profiles():
        return {"profiles": store.list_names()}

    @router.get("/options")
    async def get_options():
        return build_ui_options()

    @router.get("/profiles/{name}")
    async def get_profile(name: str):
        try:
            return store.load(name)
        except (FileNotFoundError, ValueError) as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.put("/profiles/{name}")
    async def put_profile(name: str, profile: Profile):
        try:
            return store.save(profile.model_copy(update={"name": name}))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post("/profiles/{name}/run")
    async def run_profile(name: str):
        try:
            profile = store.load(name)
            return await runner.run(profile)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @router.post("/run")
    async def run_request(request: RunRequest):
        try:
            profile = _resolve_run_profile(request, store)
            return await runner.run(profile)
        except (FileNotFoundError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @router.post("/stop")
    async def stop_runner():
        return await runner.stop()

    @router.get("/logs/recent")
    async def recent_logs(limit: int = 100):
        return {"events": events.recent(limit)}

    @router.get("/adb/devices")
    async def adb_devices():
        return AdbStatus()

    @router.post("/adb/test-screenshot")
    async def adb_test_screenshot():
        return {"ok": False, "message": "Screenshot adapter is not configured yet."}

    @router.get("/redroid/status")
    async def redroid_status():
        return RedroidStatus()

    return router


def _resolve_run_profile(request: RunRequest, store: ProfileStore) -> Profile:
    if request.profile is not None:
        return request.profile
    if request.profile_name:
        return store.load(request.profile_name)
    raise ValueError("Either profile or profile_name is required.")


async def events_socket(websocket: WebSocket, events: EventBus) -> None:
    await websocket.accept()
    queue = events.add_subscriber()
    try:
        for event in events.recent(20):
            await websocket.send_json(event.model_dump(mode="json"))
        while True:
            event = await queue.get()
            await websocket.send_json(event.model_dump(mode="json"))
    except WebSocketDisconnect:
        pass
    finally:
        events.remove_subscriber(queue)

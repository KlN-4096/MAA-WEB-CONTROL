from __future__ import annotations

import asyncio
import base64
import json
import subprocess
from typing import Any

from fastapi import APIRouter, HTTPException, Response, WebSocket, WebSocketDisconnect

from .capabilities import build_capabilities
from .events import EventBus
from .logs import MaaLogService
from .models import (
    AdbStatus,
    AppendCall,
    CopilotJob,
    PostAction,
    Profile,
    RedroidStatus,
    RunRequest,
    SchedulerConfig,
    ToolRequest,
)
from .options import build_ui_options
from .runner import MaaRunnerService
from .scheduler import SchedulerService
from .storage import ProfileStore


def create_api_router(
    store: ProfileStore,
    runner: MaaRunnerService,
    events: EventBus,
    log_service: MaaLogService | None = None,
    scheduler: SchedulerService | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/api")
    logs = log_service or runner.log_service

    # ── Status & Profiles ──────────────────────────────────────────

    @router.get("/status")
    async def get_status():
        return runner.status()

    @router.get("/profiles")
    async def list_profiles():
        return {"profiles": store.list_names()}

    @router.get("/options")
    async def get_options():
        return build_ui_options()

    @router.get("/capabilities")
    async def get_capabilities():
        return build_capabilities()

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

    @router.delete("/profiles/{name}")
    async def delete_profile(name: str):
        try:
            path = store._path_for(name)
            if not path.exists():
                raise HTTPException(status_code=404, detail=f"Profile not found: {name}")
            path.unlink()
            return {"ok": True}
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    # ── Run & Stop ─────────────────────────────────────────────────

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

    # ── Logs ───────────────────────────────────────────────────────

    @router.get("/logs/recent")
    async def recent_logs(limit: int = 100):
        return {"events": events.recent(limit)}

    @router.get("/logs/cards")
    async def log_cards(run_id: str = "current"):
        return {"run_id": run_id or "current", "cards": logs.cards(run_id)}

    @router.post("/logs/clear")
    async def clear_logs():
        logs.clear()
        return {"ok": True}

    @router.get("/logs/thumbnails/{thumbnail_id}")
    async def log_thumbnail(thumbnail_id: str):
        return logs.thumbnail_response(thumbnail_id)

    # ── ADB & Device ───────────────────────────────────────────────

    @router.get("/adb/devices")
    async def adb_devices():
        profile = _resolve_status_profile(store, runner)
        return await asyncio.to_thread(_inspect_adb_status, profile)

    @router.post("/adb/test-screenshot")
    async def adb_test_screenshot():
        adapter = runner.adapter
        get_image = getattr(adapter, "get_image", None)
        if not callable(get_image):
            return {"ok": False, "message": "截图接口不可用（当前为 DryRun 模式或未连接）"}
        try:
            image_data = await get_image()
            if image_data:
                return {
                    "ok": True,
                    "message": "截图成功",
                    "size": len(image_data),
                }
            return {"ok": False, "message": "截图返回空数据，请检查连接"}
        except Exception as exc:
            return {"ok": False, "message": f"截图失败: {exc}"}

    @router.get("/redroid/status")
    async def redroid_status():
        return RedroidStatus()

    # ── Screenshot ─────────────────────────────────────────────────

    @router.get("/screenshot")
    async def get_screenshot():
        adapter = runner.adapter
        get_image = getattr(adapter, "get_image", None)
        if not callable(get_image):
            raise HTTPException(status_code=501, detail="截图接口不可用")
        image_data = await get_image()
        if not image_data:
            raise HTTPException(status_code=503, detail="截图返回空数据")
        return Response(content=image_data, media_type="image/png")

    @router.get("/screenshot/base64")
    async def get_screenshot_base64():
        adapter = runner.adapter
        get_image = getattr(adapter, "get_image", None)
        if not callable(get_image):
            return {"ok": False, "data": None, "message": "截图接口不可用"}
        image_data = await get_image()
        if not image_data:
            return {"ok": False, "data": None, "message": "截图返回空数据"}
        return {
            "ok": True,
            "data": base64.b64encode(image_data).decode("ascii"),
            "size": len(image_data),
        }

    # ── Tools ──────────────────────────────────────────────────────

    @router.post("/tools/run")
    async def run_tool(request: ToolRequest):
        adapter = runner.adapter
        tool = request.tool
        params = request.params

        TOOL_TASK_MAP = {
            "recruit_calc": ("RecruitCalc", {}),
            "depot": ("Depot", {}),
            "operbox": ("OperBox", {}),
            "gacha_once": ("Custom", {"task_names": ["GachaOnce"]}),
            "gacha_ten": ("Custom", {"task_names": ["GachaTenTimes"]}),
            "custom": ("Custom", {}),
        }

        if tool not in TOOL_TASK_MAP:
            raise HTTPException(status_code=400, detail=f"Unknown tool: {tool}")

        task_type, default_params = TOOL_TASK_MAP[tool]
        merged = {**default_params, **params}

        try:
            task_id = await adapter.append_task(AppendCall(
                task_id=f"tool-{tool}",
                type=task_type,
                params=merged,
            ))
            started = await adapter.start()
            return {"ok": started, "task_id": task_id, "tool": tool}
        except Exception as exc:
            return {"ok": False, "message": str(exc), "tool": tool}

    # ── Copilot ────────────────────────────────────────────────────

    @router.post("/copilot/run")
    async def run_copilot(job: CopilotJob):
        adapter = runner.adapter
        copilot_params: dict[str, Any] = {"filename": job.path}
        if job.formation:
            copilot_params["formation"] = job.formation

        try:
            for _ in range(max(1, job.loop_times)):
                task_id = await adapter.append_task(AppendCall(
                    task_id=f"copilot-{job.name}",
                    type="Copilot",
                    params=copilot_params,
                ))
            started = await adapter.start()
            return {"ok": started, "name": job.name, "loop_times": job.loop_times}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    @router.post("/copilot/stop")
    async def stop_copilot():
        await adapter_stop_safe(runner)
        return {"ok": True}

    # ── Scheduler ──────────────────────────────────────────────────

    @router.get("/scheduler")
    async def get_scheduler_config():
        if scheduler is None:
            return SchedulerConfig()
        return scheduler.config

    @router.put("/scheduler")
    async def update_scheduler_config(config: SchedulerConfig):
        if scheduler is None:
            raise HTTPException(status_code=501, detail="Scheduler not initialized")
        return scheduler.update_config(config)

    # ── Post Action ────────────────────────────────────────────────

    @router.get("/post-action")
    async def get_post_action():
        return runner.post_action

    @router.put("/post-action")
    async def set_post_action(action: PostAction):
        return runner.set_post_action(action)

    return router


async def adapter_stop_safe(runner: MaaRunnerService) -> None:
    try:
        await runner.adapter.stop()
    except Exception:
        pass


def _resolve_run_profile(request: RunRequest, store: ProfileStore) -> Profile:
    if request.profile is not None:
        return request.profile
    if request.profile_name:
        return store.load(request.profile_name)
    raise ValueError("Either profile or profile_name is required.")


def _resolve_status_profile(store: ProfileStore, runner: MaaRunnerService) -> Profile | None:
    profile = runner.profile()
    if profile is not None:
        return profile
    current_name = runner.status().current_profile
    if current_name:
        try:
            return store.load(current_name)
        except (FileNotFoundError, ValueError):
            pass
    names = store.list_names()
    if len(names) != 1:
        return None
    try:
        return store.load(names[0])
    except (FileNotFoundError, ValueError):
        return None


def _inspect_adb_status(profile: Profile | None) -> AdbStatus:
    if profile is None:
        return AdbStatus(message="ADB 未配置")
    adb_path = (profile.adb.adb_path or "adb").strip()
    address = (profile.adb.address or "").strip()
    if not address:
        return AdbStatus(message="ADB 未配置")
    try:
        result = subprocess.run(
            [adb_path, "devices"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            check=False,
        )
    except FileNotFoundError:
        return AdbStatus(message=f"ADB 不可用：找不到 {adb_path}")
    except subprocess.TimeoutExpired:
        return AdbStatus(message="ADB 检测超时")
    return _adb_status_from_output(address, result.stdout or "", result.stderr or "", result.returncode)


def _adb_status_from_output(address: str, stdout: str, stderr: str, returncode: int) -> AdbStatus:
    devices = _parse_adb_devices(stdout)
    device_labels = [f"{serial} ({state})" for serial, state in devices]
    online = [serial for serial, state in devices if state == "device"]
    if address in online:
        return AdbStatus(available=True, devices=device_labels, message=f"ADB 已连接：{address}")
    if online:
        return AdbStatus(available=True, devices=device_labels, message=f"ADB 可用：{online[0]}")
    if devices:
        return AdbStatus(available=False, devices=device_labels, message="ADB 已发现设备，但没有在线设备")
    error_text = stderr.strip()
    if returncode != 0 and error_text:
        return AdbStatus(message=f"ADB 检测失败：{error_text}")
    return AdbStatus(message="ADB 未连接")


def _parse_adb_devices(output: str) -> list[tuple[str, str]]:
    devices: list[tuple[str, str]] = []
    for line in output.splitlines():
        text = line.strip()
        if not text or text.startswith("List of devices attached") or text.startswith("* "):
            continue
        parts = text.split()
        if len(parts) >= 2:
            devices.append((parts[0], parts[1]))
    return devices


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


async def peep_socket(websocket: WebSocket, runner: MaaRunnerService) -> None:
    """WebSocket endpoint that streams screenshots as base64 frames."""
    await websocket.accept()
    try:
        while True:
            msg = await websocket.receive_json()
            fps = max(1, min(30, int(msg.get("fps", 2))))
            interval = 1.0 / fps

            adapter = runner.adapter
            get_image = getattr(adapter, "get_image", None)
            if not callable(get_image):
                await websocket.send_json({"ok": False, "message": "截图接口不可用"})
                continue

            image_data = await get_image()
            if image_data:
                await websocket.send_json({
                    "ok": True,
                    "data": base64.b64encode(image_data).decode("ascii"),
                    "size": len(image_data),
                })
            else:
                await websocket.send_json({"ok": False, "message": "截图返回空数据"})

            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        pass

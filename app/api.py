from __future__ import annotations

import asyncio
import base64
import json
import subprocess
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Response, WebSocket, WebSocketDisconnect

from .capabilities import build_capabilities
from .default_profiles import complete_profile_tasks
from .events import EventBus
from .image_codec import encode_peep_frame
from .logs import MaaLogService
from .models import (
    AdbStatus,
    AdapterConfig,
    AppendCall,
    CopilotJob,
    CopilotStartRequest,
    NotificationConfig,
    NotificationTestRequest,
    PostAction,
    Profile,
    RedroidStatus,
    RunRequest,
    SchedulerConfig,
    ToolRequest,
)
from .notifications import NotificationService
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
    project_root: Path | None = None,
    notifications: NotificationService | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/api")
    logs = log_service or runner.log_service
    if scheduler is not None:
        runner.set_post_action(scheduler.config.post_action)

    # ── Status & Profiles ──────────────────────────────────────────

    @router.get("/status")
    async def get_status():
        return runner.status()

    @router.get("/profiles")
    async def list_profiles():
        return {"profiles": store.list_names()}

    @router.get("/options")
    async def get_options():
        return await asyncio.to_thread(
            build_ui_options,
            adapter=runner.adapter,
            project_root=project_root,
        )

    @router.get("/capabilities")
    async def get_capabilities():
        return build_capabilities()

    @router.get("/version")
    async def get_version():
        return await asyncio.to_thread(_get_maa_version, runner)

    @router.get("/adapter")
    async def get_adapter_config():
        active_type = "official" if hasattr(runner.adapter, "_core_dir") else "dry-run"
        saved: dict[str, Any] = {}
        if project_root is not None:
            config_file = project_root / "data" / "adapter.json"
            if config_file.exists():
                try:
                    saved = json.loads(config_file.read_text(encoding="utf-8"))
                except Exception:
                    pass
        return {
            "active_type": active_type,
            "adapter": saved.get("adapter", ""),
            "core_dir": saved.get("core_dir", ""),
        }

    @router.put("/adapter")
    async def update_adapter_config(config: AdapterConfig):
        if project_root is None:
            raise HTTPException(status_code=501, detail="Project root not configured")
        if config.adapter in {"official", "real"} and not config.core_dir.strip():
            raise HTTPException(status_code=400, detail="MAA_CORE_DIR 不能为空（adapter 为 official 时必须填写）")
        config_file = project_root / "data" / "adapter.json"
        config_file.parent.mkdir(parents=True, exist_ok=True)
        config_file.write_text(
            json.dumps({"adapter": config.adapter, "core_dir": config.core_dir}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        from .maa_adapter import create_maa_adapter as _create_adapter
        try:
            new_adapter = _create_adapter(
                project_root,
                runner.events,
                env={"MAA_ADAPTER": config.adapter, "MAA_CORE_DIR": config.core_dir},
                log_service=runner.log_service,
            )
            runner.set_adapter(new_adapter)
            active = "official" if config.adapter in {"official", "real"} else "dry-run"
            return {"ok": True, "active_type": active, "hot_swapped": True}
        except RuntimeError as exc:
            return {"ok": True, "active_type": "pending", "hot_swapped": False, "note": str(exc)}

    @router.get("/profiles/{name}")
    async def get_profile(name: str):
        try:
            return complete_profile_tasks(store.load(name))
        except (FileNotFoundError, ValueError) as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.put("/profiles/{name}")
    async def put_profile(name: str, profile: Profile):
        try:
            return store.save(complete_profile_tasks(profile.model_copy(update={"name": name})))
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

    @router.get("/logs/thumbnails/{thumbnail_id}/original")
    async def log_thumbnail_original(thumbnail_id: str):
        return logs.thumbnail_original_response(thumbnail_id)

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
                result = {
                    "ok": True,
                    "message": "截图成功",
                    "size": len(image_data),
                }
                benchmark = getattr(adapter, "screenshot_benchmark", None)
                if isinstance(benchmark, dict):
                    result["benchmark"] = benchmark
                return result
            image_error = getattr(adapter, "last_image_error", None)
            if image_error:
                return {"ok": False, "message": f"截图失败: {image_error}"}
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

    @router.post("/copilot/start")
    async def start_copilot(request: CopilotStartRequest):
        return await _start_copilot(runner, request)

    @router.post("/copilot/run")
    async def run_copilot(job: CopilotJob):
        return await _start_copilot(runner, _legacy_copilot_request(job))

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
        updated = scheduler.update_config(config)
        runner.set_post_action(updated.post_action)
        return updated

    # ── Notifications ──────────────────────────────────────────────

    @router.get("/notifications")
    async def get_notifications():
        if notifications is None:
            return NotificationConfig()
        return notifications.config

    @router.put("/notifications")
    async def put_notifications(config: NotificationConfig):
        if notifications is None:
            raise HTTPException(status_code=501, detail="Notifications not initialized")
        return notifications.update_config(config)

    @router.post("/notifications/test")
    async def post_notifications_test(request: NotificationTestRequest | None = None):
        if notifications is None:
            raise HTTPException(status_code=501, detail="Notifications not initialized")
        override = request.config if request is not None else None
        return await notifications.dispatch_test(override)

    # ── Post Action ────────────────────────────────────────────────

    @router.get("/post-action")
    async def get_post_action():
        return runner.post_action

    @router.put("/post-action")
    async def set_post_action(action: PostAction):
        if scheduler is not None:
            config = scheduler.config
            scheduler.update_config(config.model_copy(update={"post_action": action}, deep=True))
        return runner.set_post_action(action)

    return router


async def adapter_stop_safe(runner: MaaRunnerService) -> None:
    try:
        await runner.adapter.stop()
    except Exception:
        pass


async def _start_copilot(runner: MaaRunnerService, request: CopilotStartRequest) -> dict[str, Any]:
    try:
        call = _copilot_append_call(request)
        task_id = await runner.adapter.append_task(call)
        started = await runner.adapter.start()
        return {
            "ok": started,
            "name": request.name,
            "task_type": call.type,
            "task_id": task_id,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        return {"ok": False, "message": str(exc), "task_type": request.task_type}


def _legacy_copilot_request(job: CopilotJob) -> CopilotStartRequest:
    return CopilotStartRequest(
        name=job.name,
        filename=job.path,
        loop_times=max(1, job.loop_times),
        formation=job.formation > 0,
        formation_index=job.formation if job.formation > 0 else 0,
    )


def _copilot_append_call(request: CopilotStartRequest) -> AppendCall:
    params = _copilot_params(request)
    task_name = request.name or request.filename or request.task_type
    return AppendCall(task_id=f"copilot-{task_name}", type=request.task_type, params=params)


def _copilot_params(request: CopilotStartRequest) -> dict[str, Any]:
    if request.task_type == "Copilot":
        return _regular_copilot_params(request)
    if request.task_type == "SSSCopilot":
        return _sss_copilot_params(request)
    if request.task_type == "ParadoxCopilot":
        return _paradox_copilot_params(request)
    raise ValueError(f"Unsupported copilot task type: {request.task_type}")


def _regular_copilot_params(request: CopilotStartRequest) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if request.copilot_list:
        params["copilot_list"] = [_compact_dict(item.model_dump(mode="json")) for item in request.copilot_list]
    elif request.filename:
        params["filename"] = request.filename
    else:
        raise ValueError("Copilot requires filename or copilot_list.")
    _add_loop_times(params, request.loop_times)
    if request.use_sanity_potion:
        params["use_sanity_potion"] = True
    if request.formation:
        params["formation"] = True
        _add_positive_int(params, "formation_index", request.formation_index)
    if request.add_trust:
        params["add_trust"] = True
    if request.ignore_requirements:
        params["ignore_requirements"] = True
    _add_positive_int(params, "support_unit_usage", request.support_unit_usage)
    if request.support_unit_name:
        params["support_unit_name"] = request.support_unit_name
    if request.user_additional:
        params["user_additional"] = [
            _compact_dict(item.model_dump(mode="json")) for item in request.user_additional
        ]
    return params


def _sss_copilot_params(request: CopilotStartRequest) -> dict[str, Any]:
    if not request.filename:
        raise ValueError("SSSCopilot requires filename.")
    params: dict[str, Any] = {"filename": request.filename}
    _add_loop_times(params, request.loop_times)
    return params


def _paradox_copilot_params(request: CopilotStartRequest) -> dict[str, Any]:
    if request.paradox_list:
        return {"list": request.paradox_list}
    if request.filename:
        return {"filename": request.filename}
    raise ValueError("ParadoxCopilot requires filename or list.")


def _add_positive_int(params: dict[str, Any], key: str, value: int) -> None:
    if value > 0:
        params[key] = value


def _add_loop_times(params: dict[str, Any], value: int) -> None:
    if value > 1:
        params["loop_times"] = value


def _compact_dict(value: dict[str, Any]) -> dict[str, Any]:
    return {key: item for key, item in value.items() if item not in ("", None, [], {})}


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


def _get_maa_version(runner: "MaaRunnerService") -> dict:
    maa_version = "—"
    resource_version = "—"
    adapter = runner.adapter
    asst_cls = getattr(adapter, "_asst_cls", None)
    if asst_cls is None:
        resolve = getattr(adapter, "_resolve_asst_cls", None)
        if callable(resolve):
            try:
                asst_cls = resolve()
            except Exception:
                pass
    if asst_cls is not None:
        get_ver = getattr(asst_cls, "get_version", None)
        if callable(get_ver):
            try:
                maa_version = get_ver() or "—"
            except Exception:
                pass
    core_dir = getattr(adapter, "_core_dir", None)
    if core_dir is not None:
        import json as _json
        for candidate in ["resource/version.json", "cache/version.json", "version.json"]:
            ver_path = core_dir / candidate
            if ver_path.exists():
                try:
                    data = _json.loads(ver_path.read_text(encoding="utf-8"))
                    resource_version = data.get("activity", {}).get("DateTime", None) or data.get("version", None) or "—"
                except Exception:
                    pass
                break
    return {"maa_version": maa_version, "resource_version": resource_version}


async def events_socket(websocket: WebSocket, events: EventBus) -> None:
    await websocket.accept()
    queue = events.add_subscriber()
    receive_task = asyncio.create_task(websocket.receive())
    event_task = asyncio.create_task(queue.get())
    try:
        for event in events.recent(20):
            await websocket.send_json(event.model_dump(mode="json"))
        while True:
            done, _ = await asyncio.wait(
                {receive_task, event_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if receive_task in done:
                message = receive_task.result()
                if message.get("type") == "websocket.disconnect":
                    break
                receive_task = asyncio.create_task(websocket.receive())
            if event_task in done:
                event = event_task.result()
                await websocket.send_json(event.model_dump(mode="json"))
                event_task = asyncio.create_task(queue.get())
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        await _cancel_tasks(receive_task, event_task)
        events.remove_subscriber(queue)


async def _cancel_tasks(*tasks: asyncio.Task[Any]) -> None:
    for task in tasks:
        if not task.done():
            task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


async def peep_socket(websocket: WebSocket, runner: MaaRunnerService) -> None:
    """WebSocket endpoint that streams screenshots as base64 frames.

    Client may send {"fps": N} at any time to adjust the capture rate (1–30).
    The stream runs continuously; the client does not need to send a message
    per frame — only when it wants to change the fps.
    """
    await websocket.accept()
    fps = 2

    async def _receive_fps_updates() -> None:
        nonlocal fps
        while True:
            try:
                msg = await websocket.receive_json()
                new_fps = msg.get("fps")
                if new_fps is not None:
                    fps = max(1, min(30, int(new_fps)))
            except Exception:
                break

    receive_task = asyncio.create_task(_receive_fps_updates())
    try:
        while True:
            interval = 1.0 / fps
            adapter = runner.adapter
            get_image = getattr(adapter, "get_image", None)
            if callable(get_image):
                image_data = await get_image()
                if image_data:
                    frame = await asyncio.to_thread(encode_peep_frame, image_data)
                    await websocket.send_json({
                        "ok": True,
                        "data": base64.b64encode(frame.data).decode("ascii"),
                        "media_type": frame.media_type,
                        "size": len(frame.data),
                        "original_size": len(image_data),
                    })
                else:
                    await websocket.send_json({"ok": False, "message": "截图返回空数据"})
            else:
                await websocket.send_json({"ok": False, "message": "截图接口不可用"})
            await asyncio.sleep(interval)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        if not receive_task.done():
            receive_task.cancel()
        await asyncio.gather(receive_task, return_exceptions=True)

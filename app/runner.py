from __future__ import annotations

import asyncio
import platform
import subprocess
from contextlib import suppress
from datetime import datetime
from pathlib import Path
from typing import Any, Awaitable, Callable, Protocol

from .events import EventBus
from .logs import MaaLogService
from .mapper import TaskMappingError, profile_to_append_calls
from .models import AppendCall, EventRecord, PostAction, Profile, RunnerStatus


RunEventCallback = Callable[[str, dict[str, Any]], Awaitable[None]]


class MaaAdapter(Protocol):
    @property
    def task_chain_status(self) -> str | None: ...

    async def connect(self, profile: Profile) -> bool: ...

    async def append_task(self, call: AppendCall) -> int: ...

    async def start(self) -> bool: ...

    async def stop(self) -> bool: ...


class DryRunMaaAdapter:
    @property
    def task_chain_status(self) -> str | None:
        return "Completed"

    async def connect(self, profile: Profile) -> bool:
        await asyncio.sleep(0.05)
        return True

    async def append_task(self, call: AppendCall) -> int:
        await asyncio.sleep(0.02)
        return abs(hash((call.task_id, call.type))) % 100000 + 1

    async def start(self) -> bool:
        await asyncio.sleep(0.1)
        return True

    async def stop(self) -> bool:
        await asyncio.sleep(0.02)
        return True


class MaaRunnerService:
    def __init__(
        self,
        adapter: MaaAdapter,
        events: EventBus,
        log_service: MaaLogService | None = None,
        *,
        userdata_state_path: Path | None = None,
        run_event_callback: RunEventCallback | None = None,
        task_timeout_minutes: int = 0,
    ) -> None:
        self._adapter = adapter
        self._events = events
        self._logs = log_service or MaaLogService(events)
        self._status = RunnerStatus()
        self._profile: Profile | None = None
        self._task: asyncio.Task[None] | None = None
        self._stop_requested = False
        self._post_action: PostAction = PostAction()
        self._userdata_state_path = userdata_state_path
        self._run_event_callback = run_event_callback
        self._task_timeout_minutes = max(0, int(task_timeout_minutes))
        self._timed_out = False

    def set_run_event_callback(self, callback: RunEventCallback | None) -> None:
        self._run_event_callback = callback

    def set_task_timeout_minutes(self, minutes: int) -> None:
        self._task_timeout_minutes = max(0, int(minutes))

    @property
    def task_timeout_minutes(self) -> int:
        return self._task_timeout_minutes

    def status(self) -> RunnerStatus:
        return self._status.model_copy()

    def profile(self) -> Profile | None:
        return self._profile.model_copy(deep=True) if self._profile is not None else None

    @property
    def log_service(self) -> MaaLogService:
        return self._logs

    @property
    def adapter(self) -> MaaAdapter:
        return self._adapter

    @property
    def events(self) -> EventBus:
        return self._events

    def set_adapter(self, adapter: MaaAdapter) -> None:
        if self._task and not self._task.done():
            raise RuntimeError("Cannot change adapter while a run is in progress.")
        self._adapter = adapter

    @property
    def post_action(self) -> PostAction:
        return self._post_action.model_copy()

    def set_post_action(self, action: PostAction) -> PostAction:
        self._post_action = action.model_copy()
        return self.post_action

    async def run(self, profile: Profile) -> RunnerStatus:
        if self._task and not self._task.done():
            raise RuntimeError("Runner is busy.")
        self._stop_requested = False
        self._timed_out = False
        self._profile = profile.model_copy(deep=True)
        self._status = RunnerStatus(state="Connecting", current_profile=profile.name)
        self._logs.clear()
        self._logs.append(_build_resource_log(), color_key="TraceLogBrush")
        self._task = asyncio.create_task(self._run_profile(profile))
        return self.status()

    async def stop(self) -> RunnerStatus:
        self._stop_requested = True
        self._status.state = "Stopping"
        self._logs.append("正在停止……", color_key="WarningLogBrush", split_mode="Before")
        self._events.publish(EventRecord.now("runner.stopping", "Stop requested."))
        await self._adapter.stop()
        return self.status()

    async def shutdown(self) -> None:
        task = self._task
        if task is None or task.done():
            return
        if self._status.state != "Stopping":
            await self.stop()
        with suppress(Exception):
            await task

    async def _run_profile(self, profile: Profile) -> None:
        try:
            calls = profile_to_append_calls(profile, state_path=self._userdata_state_path)
            await self._connect(profile)
            await self._append_tasks(calls)
            if self._task_timeout_minutes > 0:
                try:
                    await asyncio.wait_for(
                        self._start_and_finish(),
                        timeout=self._task_timeout_minutes * 60,
                    )
                except asyncio.TimeoutError:
                    self._timed_out = True
                    await self._handle_timeout()
            else:
                await self._start_and_finish()
        except RunStopped as exc:
            self._stop(str(exc))
            await self._fire_run_event("stopped", str(exc))
        except (RuntimeError, TaskMappingError) as exc:
            self._fail(str(exc))
            await self._fire_run_event("error", str(exc))
        finally:
            await self._execute_post_action()

    async def _handle_timeout(self) -> None:
        message = f"任务执行超过 {self._task_timeout_minutes} 分钟，自动停止。"
        try:
            await self._adapter.stop()
        except Exception:
            pass
        self._fail(message)
        self._events.publish(EventRecord.now("runner.timeout", message, level="error"))
        await self._fire_run_event("timeout", message)

    async def _connect(self, profile: Profile) -> None:
        self._logs.append("正在连接模拟器……", color_key="MessageLogBrush")
        self._events.publish(EventRecord.now("runner.connecting", "Connecting to emulator."))
        if not await self._adapter.connect(profile):
            raise RuntimeError("MaaCore connect failed.")

    async def _append_tasks(self, calls: list[AppendCall]) -> None:
        if not calls:
            raise RunStopped("No enabled tasks selected.")
        self._status.state = "AppendingTasks"
        self._status.total_tasks = len(calls)
        self._events.publish(EventRecord.now("runner.appending", f"Appending {len(calls)} tasks."))
        for call in calls:
            if self._stop_requested:
                raise RunStopped("Run stopped before start.")
            self._status.current_task = call.task_id
            task_id = await self._adapter.append_task(call)
            self._status.appended_tasks += 1
            detail = {"task_id": call.task_id, "maa_task_id": task_id, "type": call.type}
            self._events.publish(EventRecord.now("task.appended", f"Appended {call.type}.", detail=detail))

    async def _start_and_finish(self) -> None:
        self._status.state = "Running"
        self._logs.append("正在运行中……", color_key="MessageLogBrush")
        self._events.publish(EventRecord.now("runner.running", "MaaCore start requested."))
        if not await self._adapter.start():
            raise RuntimeError("MaaCore start failed.")
        if self._stop_requested:
            self._stop("Run stopped.")
            await self._fire_run_event("stopped", "Run stopped.")
            return
        final_status = self._adapter.task_chain_status or "Completed"
        if final_status == "Failed":
            self._fail("MaaCore task chain failed.")
            await self._fire_run_event("error", "MaaCore task chain failed.")
            return
        if final_status == "Stopped":
            self._stop("MaaCore task chain stopped.")
            await self._fire_run_event("stopped", "MaaCore task chain stopped.")
            return
        self._status.state = "Completed"
        self._status.current_task = None
        self._logs.complete_run(f"任务已全部完成！\n(用时 {self._logs.elapsed_text()})")
        self._events.publish(EventRecord.now("runner.completed", "Run completed."))
        await self._fire_run_event("complete", "Run completed.")

    def _stop(self, message: str) -> None:
        self._status.state = "Stopped"
        self._status.current_task = None
        if not self._logs.has_last_content_prefix("已停止"):
            self._logs.append("已停止", color_key="WarningLogBrush", split_mode="After")
        self._events.publish(EventRecord.now("runner.stopped", message, detail={"stopped": True}))

    def _fail(self, message: str) -> None:
        self._status.state = "Failed"
        self._status.last_error = message
        if not self._logs.has_last_content_prefix("任务出错"):
            self._logs.append(f"任务出错: {message}", color_key="ErrorLogBrush", weight="Bold", split_mode="Both")
        self._events.publish(EventRecord.now("runner.failed", message, level="error"))

    async def _fire_run_event(self, event_type: str, message: str) -> None:
        callback = self._run_event_callback
        if callback is None:
            return
        payload = {
            "profile": self._profile.name if self._profile else None,
            "message": message,
            "state": self._status.state,
            "total_tasks": self._status.total_tasks,
            "appended_tasks": self._status.appended_tasks,
            "current_task": self._status.current_task,
            "last_error": self._status.last_error,
        }
        try:
            await callback(event_type, payload)
        except Exception as exc:
            self._events.publish(
                EventRecord.now(
                    "runner.notification.error",
                    f"Notification callback failed: {exc}",
                    level="error",
                )
            )


    async def _execute_post_action(self) -> None:
        action = self._post_action
        if action.type == "none":
            return
        self._events.publish(EventRecord.now(
            "runner.post_action",
            f"Executing post-action: {action.type}",
            detail={"action": action.type},
        ))
        try:
            if action.type == "exit_game":
                await self._adapter.stop()
            elif action.type == "exit_emulator":
                await self._adapter.stop()
                self._logs.append("后置动作: 已请求关闭模拟器（通过 ADB stop）", color_key="WarningLogBrush")
            elif action.type == "shutdown":
                await self._run_power_action("shutdown")
            elif action.type == "sleep":
                await self._run_power_action("sleep")
            elif action.type == "hibernate":
                await self._run_power_action("hibernate")
            elif action.type == "run_command":
                await self._run_post_command(action.command, action.command_timeout_seconds)
        except Exception as exc:
            self._events.publish(EventRecord.now(
                "runner.post_action.error",
                f"Post-action failed: {exc}",
                level="error",
            ))

    async def _run_post_command(self, command: str, timeout_seconds: int) -> None:
        command = (command or "").strip()
        if not command:
            self._logs.append("后置动作: 自定义命令为空，已跳过", color_key="WarningLogBrush")
            return
        timeout = max(1, int(timeout_seconds or 60))
        self._logs.append(f"后置动作: 执行自定义命令 → {command}", color_key="WarningLogBrush")
        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            except asyncio.TimeoutError:
                proc.kill()
                with suppress(Exception):
                    await proc.wait()
                raise RuntimeError(f"自定义命令超时（>{timeout}s）")
        except FileNotFoundError as exc:
            raise RuntimeError(f"自定义命令找不到可执行：{exc}") from exc
        stdout = stdout_b.decode("utf-8", errors="replace").strip() if stdout_b else ""
        stderr = stderr_b.decode("utf-8", errors="replace").strip() if stderr_b else ""
        rc = proc.returncode or 0
        if stdout:
            self._logs.append(f"  ↳ stdout: {stdout[:512]}", color_key="MessageLogBrush")
        if stderr:
            self._logs.append(f"  ↳ stderr: {stderr[:512]}", color_key="ErrorLogBrush" if rc else "TraceLogBrush")
        if rc != 0:
            raise RuntimeError(f"自定义命令退出码 {rc}")

    async def _run_power_action(self, action: str) -> None:
        system = platform.system()
        LINUX_COMMANDS = {
            "shutdown": ["shutdown", "-h", "now"],
            "sleep": ["systemctl", "suspend"],
            "hibernate": ["systemctl", "hibernate"],
        }
        WINDOWS_COMMANDS = {
            "shutdown": ["shutdown", "/s", "/t", "0"],
            "sleep": ["rundll32.exe", "powrprof.dll,SetSuspendState", "0", "1", "0"],
            "hibernate": ["shutdown", "/h"],
        }
        if system == "Linux" and action in LINUX_COMMANDS:
            self._logs.append(f"后置动作: {action}…", color_key="WarningLogBrush")
            await asyncio.to_thread(subprocess.Popen, LINUX_COMMANDS[action])
        elif system == "Windows" and action in WINDOWS_COMMANDS:
            self._logs.append(f"后置动作: {action}…", color_key="WarningLogBrush")
            await asyncio.to_thread(subprocess.Popen, WINDOWS_COMMANDS[action])
        else:
            self._logs.append(
                f"后置动作: {action}（当前平台 {system} 暂不支持，请手动执行）",
                color_key="WarningLogBrush",
            )


def _build_resource_log() -> str:
    now = datetime.now()
    stamp = f"{now.year}/{now.month}/{now.day} {now:%H:%M:%S}"
    return f"Build Time:\n{stamp}\nResource Time:\n{stamp}"


class RunStopped(RuntimeError):
    """Raised when the run should finish as Stopped instead of Failed."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Protocol

from .events import EventBus
from .logs import MaaLogService
from .mapper import TaskMappingError, profile_to_append_calls
from .models import AppendCall, EventRecord, PostAction, Profile, RunnerStatus


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
    def __init__(self, adapter: MaaAdapter, events: EventBus, log_service: MaaLogService | None = None) -> None:
        self._adapter = adapter
        self._events = events
        self._logs = log_service or MaaLogService(events)
        self._status = RunnerStatus()
        self._profile: Profile | None = None
        self._task: asyncio.Task[None] | None = None
        self._stop_requested = False
        self._post_action: PostAction = PostAction()

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

    async def _run_profile(self, profile: Profile) -> None:
        try:
            calls = profile_to_append_calls(profile)
            await self._connect(profile)
            await self._append_tasks(calls)
            await self._start_and_finish()
        except RunStopped as exc:
            self._stop(str(exc))
        except (RuntimeError, TaskMappingError) as exc:
            self._fail(str(exc))
        finally:
            await self._execute_post_action()

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
            return
        final_status = self._adapter.task_chain_status or "Completed"
        if final_status == "Failed":
            self._fail("MaaCore task chain failed.")
            return
        if final_status == "Stopped":
            self._stop("MaaCore task chain stopped.")
            return
        self._status.state = "Completed"
        self._status.current_task = None
        self._logs.complete_run(f"任务已全部完成！\n(用时 {self._logs.elapsed_text()})")
        self._events.publish(EventRecord.now("runner.completed", "Run completed."))

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
            elif action.type in {"hibernate", "shutdown", "sleep"}:
                self._logs.append(
                    f"后置动作: {action.type} (需手动执行，Web 端不直接控制主机电源)",
                    color_key="WarningLogBrush",
                )
        except Exception as exc:
            self._events.publish(EventRecord.now(
                "runner.post_action.error",
                f"Post-action failed: {exc}",
                level="error",
            ))


def _build_resource_log() -> str:
    now = datetime.now()
    stamp = f"{now.year}/{now.month}/{now.day} {now:%H:%M:%S}"
    return f"Build Time:\n{stamp}\nResource Time:\n{stamp}"


class RunStopped(RuntimeError):
    """Raised when the run should finish as Stopped instead of Failed."""

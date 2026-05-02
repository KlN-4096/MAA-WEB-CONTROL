from __future__ import annotations

import asyncio
from typing import Protocol

from .events import EventBus
from .mapper import TaskMappingError, profile_to_append_calls
from .models import AppendCall, EventRecord, Profile, RunnerStatus


class MaaAdapter(Protocol):
    async def connect(self, profile: Profile) -> bool: ...

    async def append_task(self, call: AppendCall) -> int: ...

    async def start(self) -> bool: ...

    async def stop(self) -> bool: ...


class DryRunMaaAdapter:
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
    def __init__(self, adapter: MaaAdapter, events: EventBus) -> None:
        self._adapter = adapter
        self._events = events
        self._status = RunnerStatus()
        self._task: asyncio.Task[None] | None = None
        self._stop_requested = False

    def status(self) -> RunnerStatus:
        return self._status.model_copy()

    async def run(self, profile: Profile) -> RunnerStatus:
        if self._task and not self._task.done():
            raise RuntimeError("Runner is busy.")
        self._stop_requested = False
        self._status = RunnerStatus(state="Connecting", current_profile=profile.name)
        self._task = asyncio.create_task(self._run_profile(profile))
        return self.status()

    async def stop(self) -> RunnerStatus:
        self._stop_requested = True
        self._status.state = "Stopping"
        self._events.publish(EventRecord.now("runner.stop", "Stop requested."))
        await self._adapter.stop()
        return self.status()

    async def _run_profile(self, profile: Profile) -> None:
        try:
            await self._connect(profile)
            calls = profile_to_append_calls(profile)
            await self._append_tasks(calls)
            await self._start_and_finish()
        except (RuntimeError, TaskMappingError) as exc:
            self._fail(str(exc))

    async def _connect(self, profile: Profile) -> None:
        self._events.publish(EventRecord.now("runner.connecting", "Connecting to emulator."))
        if not await self._adapter.connect(profile):
            raise RuntimeError("MaaCore connect failed.")

    async def _append_tasks(self, calls: list[AppendCall]) -> None:
        self._status.state = "AppendingTasks"
        self._status.total_tasks = len(calls)
        self._events.publish(EventRecord.now("runner.appending", f"Appending {len(calls)} tasks."))
        for call in calls:
            if self._stop_requested:
                raise RuntimeError("Run stopped before start.")
            self._status.current_task = call.task_id
            task_id = await self._adapter.append_task(call)
            self._status.appended_tasks += 1
            detail = {"task_id": call.task_id, "maa_task_id": task_id, "type": call.type}
            self._events.publish(EventRecord.now("task.appended", f"Appended {call.type}.", detail=detail))

    async def _start_and_finish(self) -> None:
        self._status.state = "Running"
        self._events.publish(EventRecord.now("runner.running", "MaaCore start requested."))
        if not await self._adapter.start():
            raise RuntimeError("MaaCore start failed.")
        self._status.state = "Completed"
        self._status.current_task = None
        self._events.publish(EventRecord.now("runner.completed", "Dry-run completed."))

    def _fail(self, message: str) -> None:
        self._status.state = "Failed"
        self._status.last_error = message
        self._events.publish(EventRecord.now("runner.failed", message, level="error"))


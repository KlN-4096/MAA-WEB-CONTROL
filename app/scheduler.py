from __future__ import annotations

import asyncio
import json
from datetime import datetime, time as dt_time
from pathlib import Path
from typing import Any

from .events import EventBus
from .models import EventRecord, SchedulerConfig, TimerSlot


class SchedulerService:
    """Cron-like timer that triggers profile runs at configured times."""

    def __init__(
        self,
        events: EventBus,
        config_path: Path,
        run_callback: Any = None,
    ) -> None:
        self._events = events
        self._config_path = config_path
        self._run_callback = run_callback
        self._config = SchedulerConfig()
        self._task: asyncio.Task[None] | None = None
        self._fired_today: set[int] = set()
        self._last_date: str = ""
        self.load_config()

    @property
    def config(self) -> SchedulerConfig:
        return self._config.model_copy(deep=True)

    def update_config(self, config: SchedulerConfig) -> SchedulerConfig:
        self._config = config.model_copy(deep=True)
        self._save_config()
        self._fired_today.clear()
        self._events.publish(EventRecord.now("scheduler.config.updated", "Scheduler config updated."))
        return self.config

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._tick_loop())
        self._events.publish(EventRecord.now("scheduler.started", "Scheduler started."))

    async def stop(self) -> None:
        task = self._task
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._task = None
        self._events.publish(EventRecord.now("scheduler.stopped", "Scheduler stopped."))

    def load_config(self) -> None:
        if not self._config_path.exists():
            return
        try:
            data = json.loads(self._config_path.read_text(encoding="utf-8"))
            self._config = SchedulerConfig.model_validate(data)
        except (OSError, json.JSONDecodeError, ValueError):
            pass

    def _save_config(self) -> None:
        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        payload = self._config.model_dump(mode="json")
        self._config_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    async def _tick_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(30)
                if not self._config.enabled:
                    continue
                now = datetime.now()
                today = now.strftime("%Y-%m-%d")
                if today != self._last_date:
                    self._fired_today.clear()
                    self._last_date = today
                for index, slot in enumerate(self._config.slots):
                    if not slot.enabled or index in self._fired_today:
                        continue
                    target = _parse_time(slot.time)
                    if target is None:
                        continue
                    if now.hour == target.hour and now.minute == target.minute:
                        self._fired_today.add(index)
                        await self._fire_slot(index, slot)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                self._events.publish(
                    EventRecord.now("scheduler.error", f"Scheduler error: {exc}", level="error")
                )

    async def _fire_slot(self, index: int, slot: TimerSlot) -> None:
        self._events.publish(
            EventRecord.now(
                "scheduler.fire",
                f"Timer slot {index} fired for profile: {slot.profile_name}",
                detail={"slot_index": index, "profile_name": slot.profile_name},
            )
        )
        if self._run_callback and slot.profile_name:
            try:
                await self._run_callback(slot.profile_name)
            except Exception as exc:
                self._events.publish(
                    EventRecord.now(
                        "scheduler.fire.error",
                        f"Timer slot {index} run failed: {exc}",
                        level="error",
                    )
                )


def _parse_time(value: str) -> dt_time | None:
    try:
        parts = value.strip().split(":")
        return dt_time(hour=int(parts[0]), minute=int(parts[1]) if len(parts) > 1 else 0)
    except (ValueError, IndexError):
        return None

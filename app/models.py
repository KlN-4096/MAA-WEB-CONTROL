from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


RunnerStateName = Literal[
    "Idle",
    "Connecting",
    "AppendingTasks",
    "Running",
    "Stopping",
    "Completed",
    "Failed",
]


class AdbConfig(BaseModel):
    address: str = "127.0.0.1:5555"
    adb_path: str = "adb"
    client_type: str = "Official"
    connect_config: dict[str, Any] = Field(default_factory=dict)


class TaskDefinition(BaseModel):
    id: str
    type: str
    enabled: bool = True
    name: str = ""
    params: dict[str, Any] = Field(default_factory=dict)
    strategy: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="allow")


class Profile(BaseModel):
    name: str
    description: str = ""
    adb: AdbConfig = Field(default_factory=AdbConfig)
    tasks: list[TaskDefinition] = Field(default_factory=list)


class AppendCall(BaseModel):
    task_id: str
    type: str
    params: dict[str, Any]


class RunnerStatus(BaseModel):
    state: RunnerStateName = "Idle"
    current_profile: str | None = None
    current_task: str | None = None
    total_tasks: int = 0
    appended_tasks: int = 0
    last_error: str | None = None


class EventRecord(BaseModel):
    ts: str
    level: Literal["debug", "info", "warning", "error"] = "info"
    type: str
    message: str
    detail: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def now(
        cls,
        event_type: str,
        message: str,
        level: Literal["debug", "info", "warning", "error"] = "info",
        detail: dict[str, Any] | None = None,
    ) -> "EventRecord":
        ts = datetime.now(timezone.utc).isoformat()
        return cls(ts=ts, level=level, type=event_type, message=message, detail=detail or {})


class RunRequest(BaseModel):
    profile: Profile | None = None
    profile_name: str | None = None


class AdbStatus(BaseModel):
    available: bool = False
    devices: list[str] = Field(default_factory=list)
    message: str = "ADB status adapter is not configured yet."


class RedroidStatus(BaseModel):
    available: bool = False
    container: str = "redroid"
    message: str = "redroid status adapter is not configured yet."


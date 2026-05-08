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
    "Stopped",
    "Completed",
    "Failed",
]


class LdPlayerExtras(BaseModel):
    enabled: bool = False
    path: str = ""
    manual_index: bool = False
    index: int = 0


class AdbConfig(BaseModel):
    address: str = "127.0.0.1:5555"
    adb_path: str = "adb"
    client_type: str = "Official"
    touch_mode: str = "minitouch"
    deployment_with_pause: bool = False
    adb_lite_enabled: bool = False
    kill_adb_on_exit: bool = False
    allow_adb_restart: bool = True
    allow_adb_hard_restart: bool = False
    connect_config: dict[str, Any] = Field(default_factory=dict)
    ld_player_extras: LdPlayerExtras = Field(default_factory=LdPlayerExtras)


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
    message: str = "ADB 未配置"


class RedroidStatus(BaseModel):
    available: bool = False
    container: str = "redroid"
    message: str = "redroid 未启用"


class PostAction(BaseModel):
    type: Literal[
        "none", "exit_game", "exit_emulator", "exit_maa",
        "hibernate", "shutdown", "sleep", "run_command",
    ] = "none"
    only_if_no_other_maa: bool = False
    command: str = ""
    command_timeout_seconds: int = 60


class TimerSlot(BaseModel):
    enabled: bool = False
    time: str = "00:00"
    profile_name: str = ""
    force_start: bool = False
    start_emulator: bool = True


class EmulatorLaunchConfig(BaseModel):
    enabled: bool = False
    command: str = ""
    wait_seconds: int = 60


class SchedulerConfig(BaseModel):
    enabled: bool = False
    slots: list[TimerSlot] = Field(default_factory=list)
    post_action: PostAction = Field(default_factory=PostAction)
    emulator_launch: EmulatorLaunchConfig = Field(default_factory=EmulatorLaunchConfig)


class CopilotJob(BaseModel):
    name: str = ""
    path: str = ""
    formation: int = 0
    loop_times: int = 1


class CopilotListItem(BaseModel):
    filename: str
    stage_name: str = ""
    is_raid: bool = False


class UserAdditionalOperator(BaseModel):
    name: str
    skill: int = 1


class CopilotStartRequest(BaseModel):
    name: str = ""
    task_type: Literal["Copilot", "SSSCopilot", "ParadoxCopilot"] = "Copilot"
    filename: str = ""
    copilot_list: list[CopilotListItem] = Field(default_factory=list)
    paradox_list: list[str] = Field(default_factory=list, alias="list")
    loop_times: int = 1
    use_sanity_potion: bool = False
    formation: bool = False
    formation_index: int = 0
    add_trust: bool = False
    ignore_requirements: bool = False
    support_unit_usage: int = 0
    support_unit_name: str = ""
    user_additional: list[UserAdditionalOperator] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class CopilotOperatorInfo(BaseModel):
    name: str = ""
    skill: int = 1


class CopilotInfo(BaseModel):
    stage_name: str = ""
    title: str = ""
    details: str = ""
    opers: list[CopilotOperatorInfo] = Field(default_factory=list)
    group_count: int = 0
    action_count: int = 0
    difficulty: int = 0
    minimum_required: str = ""
    source: Literal["local", "prts.plus"] = "local"
    upstream_id: int | None = None
    rating_level: int | None = None
    uploader: str = ""


class CopilotResolveRequest(BaseModel):
    code: str


class CopilotResolveResponse(BaseModel):
    ok: bool
    path: str = ""
    info: CopilotInfo | None = None
    message: str = ""


class ToolRequest(BaseModel):
    tool: str
    params: dict[str, Any] = Field(default_factory=dict)


class AdapterConfig(BaseModel):
    adapter: str = ""
    core_dir: str = ""


class WebhookNotificationConfig(BaseModel):
    enabled: bool = False
    url: str = ""
    method: Literal["POST", "PUT"] = "POST"
    headers: dict[str, str] = Field(default_factory=dict)


class NotificationConfig(BaseModel):
    enabled: bool = False
    send_on_complete: bool = True
    send_on_error: bool = True
    send_on_stopped: bool = False
    send_on_timeout: bool = True
    include_details: bool = True
    webhook: WebhookNotificationConfig = Field(default_factory=WebhookNotificationConfig)


class NotificationTestRequest(BaseModel):
    config: NotificationConfig | None = None


class RunnerConfig(BaseModel):
    task_timeout_minutes: int = 0

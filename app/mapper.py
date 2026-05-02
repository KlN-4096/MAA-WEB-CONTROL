from __future__ import annotations

from copy import deepcopy
from datetime import datetime

from .models import AppendCall, Profile, TaskDefinition


SUPPORTED_TASK_TYPES = {
    "StartUp",
    "Fight",
    "Infrast",
    "Recruit",
    "Mall",
    "Award",
    "Roguelike",
    "Copilot",
    "SSSCopilot",
    "CloseDown",
    "Depot",
    "OperBox",
    "Reclamation",
    "Custom",
}

FIGHT_LIKE_TASK_TYPES = {"Fight", "Custom"}

STAGE_OPEN_WEEKDAYS = {
    "CE-6": {1, 3, 5, 6},
    "AP-5": {0, 3, 5, 6},
    "CA-5": {1, 2, 4, 6},
    "SK-5": {0, 2, 4, 5},
    "PR-A-1": {0, 3, 4, 6},
    "PR-A-2": {0, 3, 4, 6},
    "PR-B-1": {0, 1, 4, 5},
    "PR-B-2": {0, 1, 4, 5},
    "PR-C-1": {2, 3, 5, 6},
    "PR-C-2": {2, 3, 5, 6},
    "PR-D-1": {1, 2, 5, 6},
    "PR-D-2": {1, 2, 5, 6},
}


class TaskMappingError(ValueError):
    """Raised when a web task cannot be translated to a MaaCore append call."""


def task_to_append_call(task: TaskDefinition) -> AppendCall | None:
    if not task.enabled:
        return None

    if task.type not in SUPPORTED_TASK_TYPES:
        raise TaskMappingError(f"Unsupported task type: {task.type}")

    params = deepcopy(task.params)
    if task.type in FIGHT_LIKE_TASK_TYPES:
        _normalize_stage_plan(params)
    params.setdefault("enable", True)
    return AppendCall(task_id=task.id, type=task.type, params=params)


def profile_to_append_calls(profile: Profile) -> list[AppendCall]:
    calls: list[AppendCall] = []
    for task in profile.tasks:
        call = task_to_append_call(task)
        if call is not None:
            calls.append(call)
    return calls


def _normalize_stage_plan(params: dict) -> None:
    stage_plan = params.get("stage_plan")
    if not isinstance(stage_plan, list):
        return
    stage = _select_stage_from_plan(stage_plan)
    if stage:
        params["stage"] = stage


def _select_stage_from_plan(stage_plan: list, weekday: int | None = None) -> str:
    candidates = [str(stage) for stage in stage_plan if stage]
    if not candidates:
        return ""
    current_weekday = datetime.now().weekday() if weekday is None else weekday
    for stage in candidates:
        if _is_stage_open(stage, current_weekday):
            return stage
    return candidates[0]


def _is_stage_open(stage: str, weekday: int) -> bool:
    open_days = STAGE_OPEN_WEEKDAYS.get(stage)
    return open_days is None or weekday in open_days

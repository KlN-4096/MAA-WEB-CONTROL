from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from threading import Lock
from typing import Any, Mapping

from .events import EventBus
from .logs import MaaLogService
from .models import AppendCall, EventRecord, Profile
from .runner import DryRunMaaAdapter, MaaAdapter


DEFAULT_MAA_PYTHON_DIR = Path(r"E:\Project\C\MaaAssistantArknights\src\Python")
CLIENT_TYPE_OPTION = 6
CLIENT_TYPE_ALIASES = {
    "官服": "Official",
    "B服": "Bilibili",
    "Bilibili服": "Bilibili",
    "国际服 (YostarEN)": "YoStarEN",
    "日服 (YostarJP)": "YoStarJP",
    "韩服 (YostarKR)": "YoStarKR",
    "繁中服 (txwy)": "txwy",
}
TASK_CHAIN_EVENTS = {
    "TaskChainStart": ("maa.task_chain.start", None, "Task chain started.", "info"),
    "TaskChainCompleted": ("maa.task_chain.completed", "Completed", "Task chain completed.", "info"),
    "TaskChainError": ("maa.task_chain.error", "Failed", "Task chain failed.", "error"),
    "TaskChainStopped": ("maa.task_chain.stopped", "Stopped", "Task chain stopped.", "warning"),
    "AllTasksCompleted": ("maa.task_chain.completed", "Completed", "All tasks completed.", "info"),
}
SUB_TASK_EVENTS = {
    "SubTaskStart": ("maa.sub_task.start", "Sub task started.", "info"),
    "SubTaskCompleted": ("maa.sub_task.completed", "Sub task completed.", "info"),
    "SubTaskError": ("maa.sub_task.error", "Sub task failed.", "error"),
    "SubTaskExtraInfo": ("maa.sub_task.extra", "Sub task info.", "debug"),
}


class OfficialMaaAdapter:
    def __init__(
        self,
        core_dir: Path,
        user_dir: Path,
        connect_config: str = "General",
        python_dir: Path | None = DEFAULT_MAA_PYTHON_DIR,
        asst_cls: type[Any] | None = None,
        events: EventBus | None = None,
        log_service: MaaLogService | None = None,
        poll_interval: float = 0.5,
    ) -> None:
        self._core_dir = core_dir
        self._python_dir = python_dir
        self._user_dir = user_dir
        self._connect_config = connect_config
        self._asst_cls = asst_cls
        self._asst: Any | None = None
        self._callback: Any | None = None
        self._events = events
        self._log_service = log_service
        self._callback_events: list[EventRecord] = []
        self._task_chain_status: str | None = None
        self._status_lock = Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._poll_interval = poll_interval

    @property
    def callback_events(self) -> list[EventRecord]:
        return list(self._callback_events)

    @property
    def task_chain_status(self) -> str | None:
        with self._status_lock:
            return self._task_chain_status

    async def connect(self, profile: Profile) -> bool:
        self._loop = asyncio.get_running_loop()
        return await asyncio.to_thread(self._connect_sync, profile)

    async def append_task(self, call: AppendCall) -> int:
        asst = self._require_asst()
        try:
            return await asyncio.to_thread(asst.append_task, call.type, call.params)
        except Exception as exc:
            raise RuntimeError(f"MaaCore append_task failed for {call.type}.") from exc

    async def start(self) -> bool:
        asst = self._require_asst()
        try:
            return await asyncio.to_thread(self._start_and_wait_sync, asst)
        except Exception as exc:
            raise RuntimeError("MaaCore start failed.") from exc

    async def stop(self) -> bool:
        if self._asst is None:
            return True
        try:
            return await asyncio.to_thread(self._asst.stop)
        except Exception as exc:
            raise RuntimeError("MaaCore stop failed.") from exc

    async def get_image(self) -> bytes | None:
        """Capture current screen image from MaaCore."""
        asst = self._require_asst()
        get_img = getattr(asst, "get_image", None)
        if not callable(get_img):
            return None
        try:
            return await asyncio.to_thread(get_img)
        except Exception:
            return None

    def _connect_sync(self, profile: Profile) -> bool:
        asst_cls = self._resolve_asst_cls()
        self._user_dir.mkdir(parents=True, exist_ok=True)
        try:
            if not asst_cls.load(self._core_dir, user_dir=self._user_dir):
                return False
        except Exception as exc:
            raise RuntimeError(f"Failed to load MaaCore from MAA_CORE_DIR: {self._core_dir}") from exc
        self._callback = self._build_callback(asst_cls)
        self._asst = asst_cls(callback=self._callback)
        try:
            self._set_client_type_option(profile)
            return bool(
                self._asst.connect(
                    profile.adb.adb_path,
                    profile.adb.address,
                    _profile_connect_config(profile, self._connect_config),
                )
            )
        except Exception as exc:
            raise RuntimeError(f"MaaCore connect failed for ADB address: {profile.adb.address}") from exc

    def _set_client_type_option(self, profile: Profile) -> None:
        client_type = _normalize_client_type(profile.adb.client_type)
        setter = getattr(self._asst, "set_instance_option", None)
        if not callable(setter):
            raise RuntimeError("MaaCore set_instance_option is not available.")
        if setter(CLIENT_TYPE_OPTION, client_type) is False:
            raise RuntimeError(f"MaaCore rejected client type: {client_type}")

    def _resolve_asst_cls(self) -> type[Any]:
        if self._asst_cls is not None:
            return self._asst_cls
        if self._python_dir is not None:
            python_dir = str(self._python_dir)
            if python_dir not in sys.path:
                sys.path.insert(0, python_dir)
        try:
            from asst.asst import Asst
        except ImportError as exc:
            raise RuntimeError(
                "Failed to import official MAA Python wrapper. "
                "Set MAA_PYTHON_DIR to the directory containing asst/asst.py."
            ) from exc
        self._asst_cls = Asst
        return Asst

    def _build_callback(self, asst_cls: type[Any]) -> Any:
        callback_type = getattr(asst_cls, "CallBackType", None)
        if callback_type is None:
            return self._handle_callback
        return callback_type(self._handle_callback)

    def _handle_callback(self, message: int, details: Any, arg: Any = None) -> None:
        decoded_details = _decode_callback_details(details)
        event = EventRecord.now(
            "maa.callback",
            f"MAA callback {message}",
            detail={"message": message, "details": decoded_details},
        )
        self._callback_events.append(event)
        self._publish_callback_event(event)
        for semantic_event in self._semantic_callback_events(message, decoded_details):
            self._publish_callback_event(semantic_event)

    def _semantic_callback_events(self, message: int, details: Any) -> list[EventRecord]:
        what = _callback_what(details)
        detail = {"message": message, "details": details, "what": what}
        self._append_log_event(what, details, detail)
        if what in TASK_CHAIN_EVENTS:
            event_type, final_status, text, level = TASK_CHAIN_EVENTS[what]
            if final_status is not None:
                with self._status_lock:
                    self._task_chain_status = final_status
            return [EventRecord.now(event_type, text, level=level, detail=detail)]
        if what in SUB_TASK_EVENTS:
            event_type, text, level = SUB_TASK_EVENTS[what]
            return [EventRecord.now(event_type, text, level=level, detail=detail)]
        return []

    def _append_log_event(self, what: str, details: Any, raw_detail: dict[str, Any]) -> None:
        if self._log_service is None:
            return
        if what in {"ConnectionInfo", "FastestWayToScreencap"}:
            self._append_connection_log(what, details, raw_detail)
            return
        if what in TASK_CHAIN_EVENTS:
            self._append_task_chain_log(what, details, raw_detail)
            return
        if what in SUB_TASK_EVENTS:
            self._append_sub_task_log(what, details, raw_detail)

    def _append_connection_log(self, what: str, details: Any, raw_detail: dict[str, Any]) -> None:
        cost = _nested_value(details, "cost", "ms", "time") or _nested_value(details, "details", "cost")
        if cost is None:
            return
        method = _nested_value(details, "method", "way", "screencap", "name") or "Unknown"
        text = f"最快截图耗时: {cost}ms ({method})" if cost is not None else f"最快截图耗时: ({method})"
        self._log_service.append(
            text,
            color_key="LdSpecialScreenshot",
            tooltip={"kind": "screenshot", "method": method, "cost": cost},
            raw=raw_detail,
        )

    def _append_task_chain_log(self, what: str, details: Any, raw_detail: dict[str, Any]) -> None:
        task_name = _task_name(details)
        if what == "TaskChainStart":
            self._log_service.append(
                f"开始任务: {task_name}",
                color_key="MessageLogBrush",
                split_mode="Before",
                raw=raw_detail,
            )
            return
        if what == "TaskChainCompleted":
            message = f"完成任务: {task_name}"
            sanity = _sanity_suffix(details)
            if sanity:
                message = f"{message}\n{sanity}"
            self._log_service.append(message, color_key="SuccessLogBrush", raw=raw_detail)
            return
        if what == "TaskChainError":
            self._log_service.append(
                f"任务出错: {task_name}",
                color_key="ErrorLogBrush",
                weight="Bold",
                split_mode="Both",
                thumbnail={"capture": True, "placeholder": True},
                raw=raw_detail,
            )
            return
        if what == "TaskChainStopped":
            self._log_service.append("已停止", color_key="WarningLogBrush", split_mode="Both", raw=raw_detail)
            return
        if what == "AllTasksCompleted":
            return

    def _append_sub_task_log(self, what: str, details: Any, raw_detail: dict[str, Any]) -> None:
        if what == "SubTaskStart":
            self._log_service.append(_sub_task_message(details, "开始任务"), color_key="MessageLogBrush", raw=raw_detail)
            return
        if what == "SubTaskCompleted":
            self._log_service.append(_sub_task_message(details, "完成任务"), color_key="SuccessLogBrush", raw=raw_detail)
            return
        if what == "SubTaskExtraInfo":
            extra_what = _nested_what(details)
            self._append_extra_info_log(extra_what, details, raw_detail)
            return
        if what == "SubTaskError":
            text = _sub_task_message(details, "任务出错")
            self._log_service.append(text, color_key="ErrorLogBrush", weight="Bold", raw=raw_detail)

    def _append_extra_info_log(self, extra_what: str, details: Any, raw_detail: dict[str, Any]) -> None:
        if extra_what == "RecruitTagsDetected":
            tags = _string_lines(_nested_value(details, "tags", "data", "items"))
            self._log_service.append(
                "公招识别结果:\n" + "\n".join(tags),
                color_key="InfoLogBrush",
                split_mode="Before",
                thumbnail={"capture": True, "placeholder": True},
                tooltip={"kind": "recruit_tags", "tags": tags, "raw": raw_detail},
                raw=raw_detail,
            )
            return
        if extra_what == "RecruitResult":
            level = int(_nested_value(details, "level", "star", "rarity") or 0)
            color_key = "RareOperatorLogBrush" if level >= 5 else "InfoLogBrush"
            self._log_service.append(
                f"{level} ★ Tags",
                color_key=color_key,
                weight="Bold" if level >= 5 else "Regular",
                tooltip={"kind": "recruit_result", "level": level, "raw": raw_detail},
                raw=raw_detail,
            )
            return
        if extra_what == "RecruitTagsSelected":
            selected = _string_lines(_nested_value(details, "selected", "tags", "items"))
            self._log_service.append("选择 Tags:\n" + "\n".join(selected), color_key="MessageLogBrush", raw=raw_detail)
            return
        if extra_what == "RecruitConfirm":
            self._log_service.append("已确认招募", color_key="SuccessLogBrush", raw=raw_detail)
            return
        if extra_what == "RecruitTagsRefreshed":
            count = _nested_value(details, "count", "times", "refresh_times") or 0
            self._log_service.append(f"已刷新 {count} 次", color_key="MessageLogBrush", raw=raw_detail)
            return
        if extra_what == "EnterFacility":
            facility = _facility_name(details)
            index = int(_nested_value(details, "index", "facility_index") or 0) + 1
            self._log_service.append(
                f"当前设施: {facility} {index:02d}",
                color_key="MessageLogBrush",
                split_mode="Before",
                thumbnail={"capture": True, "placeholder": True},
                tooltip={"kind": "facility", "facility": facility, "index": index, "raw": raw_detail},
                raw=raw_detail,
            )
            return
        if extra_what == "StageDrops":
            stage_code = _nested_value(details, "stage_code", "stage", "code") or "未知关卡"
            drops = _string_lines(_nested_value(details, "drops", "items", "data"))
            current = _nested_value(details, "cur_times", "current_times", "times") or 0
            self._log_service.append(
                f"{stage_code} 掉落统计:\n" + "\n".join(drops) + f"\n当前次数 : {current}",
                color_key="InfoLogBrush",
                split_mode="Before",
                thumbnail={"capture": True, "placeholder": True},
                tooltip={"kind": "stage_drops", "stage": stage_code, "drops": drops, "current_times": current, "raw": raw_detail},
                raw=raw_detail,
            )
            return
        if extra_what == "ConnectionInfo":
            self._log_service.append("正在连接模拟器……", color_key="MessageLogBrush", raw=raw_detail)
            return
        if extra_what == "FastestWayToScreencap":
            self._append_connection_log(extra_what, details, raw_detail)

    def _publish_callback_event(self, event: EventRecord) -> None:
        if self._events is None:
            return
        loop = self._loop
        try:
            if loop is not None and loop.is_running():
                loop.call_soon_threadsafe(self._events.publish, event)
            else:
                self._events.publish(event)
        except RuntimeError:
            self._events.publish(event)

    def _start_and_wait_sync(self, asst: Any) -> bool:
        with self._status_lock:
            self._task_chain_status = None
        if not asst.start():
            return False
        # AsstStart is asynchronous; wait until the C++ thread actually sets running=True
        # before entering the completion poll, otherwise the loop exits immediately.
        deadline = time.time() + 10.0
        while not asst.running():
            if time.time() > deadline:
                break
            time.sleep(0.1)
        while asst.running():
            time.sleep(self._poll_interval)
        return True

    def _require_asst(self) -> Any:
        if self._asst is None:
            raise RuntimeError("MaaCore is not connected.")
        return self._asst


def create_maa_adapter(
    project_root: Path,
    events: EventBus,
    env: Mapping[str, str] | None = None,
    asst_cls: type[Any] | None = None,
    log_service: MaaLogService | None = None,
) -> MaaAdapter:
    source_env = os.environ if env is None else env
    adapter_name = source_env.get("MAA_ADAPTER", "").strip().lower()
    core_dir_str = source_env.get("MAA_CORE_DIR", "").strip()

    # Fall back to persisted config file when using real environment
    if env is None and (not adapter_name or not core_dir_str):
        config_file = project_root / "data" / "adapter.json"
        if config_file.exists():
            try:
                file_cfg = json.loads(config_file.read_text(encoding="utf-8"))
                if not adapter_name:
                    adapter_name = str(file_cfg.get("adapter", "")).strip().lower()
                if not core_dir_str:
                    core_dir_str = str(file_cfg.get("core_dir", "")).strip()
            except Exception:
                pass

    if adapter_name not in {"official", "real"}:
        return DryRunMaaAdapter()

    if not core_dir_str:
        raise RuntimeError("MAA_CORE_DIR is required when MAA_ADAPTER=official or real.")

    core_path = Path(core_dir_str)
    python_dir = _resolve_python_dir(source_env.get("MAA_PYTHON_DIR"), core_path)
    user_dir = _optional_path(source_env.get("MAA_USER_DIR"), project_root / "data" / "runtime" / "maa")
    return OfficialMaaAdapter(
        core_dir=core_path,
        python_dir=python_dir,
        user_dir=user_dir,
        connect_config=source_env.get("MAA_CONNECT_CONFIG", "General"),
        asst_cls=asst_cls,
        events=events,
        log_service=log_service,
    )


def _optional_path(value: str | None, default: Path) -> Path:
    if value is None or not value.strip():
        return default
    return Path(value)


def _resolve_python_dir(value: str | None, core_dir: Path) -> Path:
    if value is not None and value.strip():
        return Path(value)
    bundled_python_dir = core_dir / "Python"
    if bundled_python_dir.exists():
        return bundled_python_dir
    return DEFAULT_MAA_PYTHON_DIR


def _profile_connect_config(profile: Profile, default: str) -> str:
    config = profile.adb.connect_config
    if isinstance(config, str) and config.strip():
        return config
    if isinstance(config, dict):
        for key in ("name", "config", "preset"):
            value = config.get(key)
            if isinstance(value, str) and value.strip():
                return value
    return default


def _decode_callback_details(details: Any) -> Any:
    if details is None:
        return None
    if isinstance(details, bytes):
        text = details.decode("utf-8", errors="replace")
    else:
        text = str(details)
    if not text:
        return ""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def _normalize_client_type(value: Any) -> str:
    text = str(value or "Official")
    return CLIENT_TYPE_ALIASES.get(text, text)


def _callback_what(details: Any) -> str:
    if isinstance(details, dict):
        value = details.get("what") or details.get("type") or details.get("event")
        return str(value or "")
    return ""


TASK_DISPLAY_NAMES = {
    "StartUp": "开始唤醒",
    "Fight": "理智作战",
    "Infrast": "基建换班",
    "Recruit": "自动公招",
    "Mall": "信用收支",
    "Award": "领取奖励",
    "Copilot": "自动战斗",
    "Roguelike": "肉鸽",
    "Reclamation": "生息演算",
    "CloseDown": "关闭游戏",
}

FACILITY_DISPLAY_NAMES = {
    "Mfg": "制造站",
    "Manufacture": "制造站",
    "Trade": "贸易站",
    "Power": "发电站",
    "Control": "控制中枢",
    "Reception": "会客室",
    "Office": "办公室",
    "Dorm": "宿舍",
    "Dormitory": "宿舍",
    "Training": "训练室",
}


def _nested_what(details: Any) -> str:
    if isinstance(details, dict):
        for key in ("details", "detail", "data", "info"):
            nested = details.get(key)
            if isinstance(nested, dict):
                what = _callback_what(nested)
                if what:
                    return what
    return _callback_what(details)


def _task_name(details: Any) -> str:
    value = _nested_value(details, "taskchain", "task_chain", "task", "name", "task_id", "id")
    text = str(value or "未知任务")
    return TASK_DISPLAY_NAMES.get(text, text)


def _facility_name(details: Any) -> str:
    value = _nested_value(details, "facility", "facility_type", "name", "type")
    text = str(value or "设施")
    return FACILITY_DISPLAY_NAMES.get(text, text)


def _sub_task_message(details: Any, prefix: str) -> str:
    value = _nested_value(details, "subtask", "task", "name", "what") or "子任务"
    return f"{prefix}: {value}"


def _sanity_suffix(details: Any) -> str:
    current = _nested_value(details, "current_sanity", "sanity_current", "current")
    maximum = _nested_value(details, "max_sanity", "sanity_max", "max")
    if current is None or maximum is None:
        return ""
    return f"理智: {current}/{maximum}"


def _nested_value(details: Any, *keys: str) -> Any:
    if not isinstance(details, dict):
        return None
    for key in keys:
        found = _find_key(details, key)
        if found is not None:
            return found
    return None


def _find_key(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        if key in value and value[key] not in (None, ""):
            return value[key]
        for nested in value.values():
            found = _find_key(nested, key)
            if found is not None:
                return found
    if isinstance(value, list):
        for nested in value:
            found = _find_key(nested, key)
            if found is not None:
                return found
    return None


def _string_lines(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, dict):
        return [_drop_line(key, item) for key, item in value.items()]
    if isinstance(value, list):
        return [_line_from_value(item) for item in value]
    text = str(value)
    return [line for line in text.splitlines() if line]


def _drop_line(key: Any, value: Any) -> str:
    if isinstance(value, dict):
        total = value.get("quantity") or value.get("count") or value.get("total") or value.get("number") or 0
        delta = value.get("add") or value.get("increment") or value.get("delta") or value.get("new") or 0
        return f"{value.get('name') or key} : {total} (+{delta})"
    return f"{key} : {value}"


def _line_from_value(value: Any) -> str:
    if isinstance(value, dict):
        name = value.get("name") or value.get("itemName") or value.get("id") or "物品"
        total = value.get("quantity") or value.get("count") or value.get("total") or value.get("number")
        delta = value.get("add") or value.get("increment") or value.get("delta") or value.get("new")
        if total is not None:
            suffix = f" (+{delta or 0})" if delta is not None else ""
            return f"{name} : {total}{suffix}"
        return str(name)
    return str(value)

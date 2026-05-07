from __future__ import annotations

import asyncio
from copy import deepcopy
import json
import os
import sys
import time
from pathlib import Path
from threading import Lock
from typing import Any, Mapping

from .events import EventBus
from .image_codec import encode_log_preview
from .logs import MaaLogService
from .models import AppendCall, EventRecord, Profile
from .resource_paths import normalize_client_type, resource_incremental_roots
from .runner import DryRunMaaAdapter, MaaAdapter


DEFAULT_MAA_PYTHON_DIR = Path(r"E:\Project\C\MaaAssistantArknights\src\Python")
TOUCH_MODE_OPTION = 2
DEPLOYMENT_WITH_PAUSE_OPTION = 3
ADB_LITE_ENABLED_OPTION = 4
KILL_ADB_ON_EXIT_OPTION = 5
CLIENT_TYPE_OPTION = 6
SCREENSHOT_BUFFER_SIZE = 32 * 1024 * 1024
LOG_THUMBNAIL_CAPTURE_DELAY = 0.4
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
}

# AsstMsg integer values → logical event name (from AsstMsg C++ enum)
# TaskChain JSON has no "what" field — must dispatch by message number.
_MSG_EVENT_MAP: dict[int, str] = {
    3: "AllTasksCompleted",
    10000: "TaskChainError",
    10001: "TaskChainStart",
    10002: "TaskChainCompleted",
    10004: "TaskChainStopped",
    20000: "SubTaskError",
    20001: "SubTaskStart",
    20002: "SubTaskCompleted",
}
_MSG_CONNECTION_INFO = 2
_MSG_SUB_TASK_EXTRA_INFO = 20003


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
        self._last_image_error: str | None = None
        self._screenshot_benchmark: dict[str, Any] | None = None

    @property
    def callback_events(self) -> list[EventRecord]:
        return list(self._callback_events)

    @property
    def task_chain_status(self) -> str | None:
        with self._status_lock:
            return self._task_chain_status

    @property
    def screenshot_benchmark(self) -> dict[str, Any] | None:
        if self._screenshot_benchmark is None:
            return None
        return deepcopy(self._screenshot_benchmark)

    @property
    def last_image_error(self) -> str | None:
        return self._last_image_error

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
        """Capture current screen image from MaaCore (returns PNG bytes).

        AsstGetImage writes cv::imencode(".png") output into a caller-supplied
        buffer.  The buffer needs to cover high-DPI emulator frames too; 5 MB
        is not enough for some 4K PNG captures.
        """
        asst = self._require_asst()
        get_img = getattr(asst, "get_image", None)
        self._last_image_error = None
        if not callable(get_img):
            self._last_image_error = "MaaCore get_image is not available."
            return None
        try:
            data = await asyncio.to_thread(get_img, SCREENSHOT_BUFFER_SIZE)
            return _normalize_image_data(data)
        except Exception as exc:
            self._last_image_error = f"{type(exc).__name__}: {exc}"
            return None

    def _connect_sync(self, profile: Profile) -> bool:
        asst_cls = self._resolve_asst_cls()
        self._user_dir.mkdir(parents=True, exist_ok=True)
        self._screenshot_benchmark = None
        try:
            if not self._load_resources(asst_cls, profile):
                return False
        except Exception as exc:
            raise RuntimeError(f"Failed to load MaaCore from MAA_CORE_DIR: {self._core_dir}") from exc
        self._callback = self._build_callback(asst_cls)
        self._asst = asst_cls(callback=self._callback)
        if self._log_service is not None:
            self._log_service.set_thumbnail_callback(self._schedule_thumbnail_capture)
        try:
            self._set_connection_extras(profile, asst_cls)
            self._set_instance_options(profile)
            return bool(
                self._asst.connect(
                    profile.adb.adb_path,
                    profile.adb.address,
                    _profile_connect_config(profile, self._connect_config),
                )
            )
        except Exception as exc:
            raise RuntimeError(f"MaaCore connect failed for ADB address: {profile.adb.address}") from exc

    def _set_connection_extras(self, profile: Profile, asst_cls: type[Any]) -> None:
        ld = profile.adb.ld_player_extras
        if not ld.enabled or not ld.path:
            return
        set_extras = getattr(asst_cls, "set_connection_extras", None)
        if not callable(set_extras):
            return
        index = ld.index if ld.manual_index else _ld_index_from_address(profile.adb.address)
        pid = _ld_player_pid(ld.path, index)
        extras: dict[str, Any] = {"path": ld.path, "index": index, "pid": pid}
        set_extras("LDPlayer", extras)

    def _set_instance_options(self, profile: Profile) -> None:
        setter = getattr(self._asst, "set_instance_option", None)
        if not callable(setter):
            raise RuntimeError("MaaCore set_instance_option is not available.")
        options = [
            (TOUCH_MODE_OPTION, _normalize_touch_mode(profile.adb.touch_mode), "touch mode"),
            (DEPLOYMENT_WITH_PAUSE_OPTION, _bool_option(profile.adb.deployment_with_pause), "deployment with pause"),
            (ADB_LITE_ENABLED_OPTION, _bool_option(profile.adb.adb_lite_enabled), "ADB Lite"),
            (KILL_ADB_ON_EXIT_OPTION, _bool_option(profile.adb.kill_adb_on_exit), "kill ADB on exit"),
            (CLIENT_TYPE_OPTION, _normalize_client_type(profile.adb.client_type), "client type"),
        ]
        for key, value, label in options:
            if setter(key, value) is False:
                raise RuntimeError(f"MaaCore rejected {label}: {value}")

    def _load_resources(self, asst_cls: type[Any], profile: Profile) -> bool:
        if not asst_cls.load(self._core_dir, user_dir=self._user_dir):
            return False
        for root in resource_incremental_roots(self._core_dir, profile.adb.client_type):
            if not asst_cls.load(self._core_dir, incremental_path=root):
                return False
        return True

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
        # "what" is meaningful only for ConnectionInfo (msg=2) and SubTaskExtraInfo (msg=20003).
        # TaskChain messages carry NO "what" field in JSON — dispatch MUST use the int.
        sub_what = _callback_what(details)
        detail = {"message": message, "details": details, "what": sub_what}

        # ── ConnectionInfo (msg=2): screencap method, connection state, etc. ──
        if message == _MSG_CONNECTION_INFO:
            if sub_what == "FastestWayToScreencap":
                self._record_screenshot_benchmark(details, detail)
            return []

        # ── TaskChain events (10001 / 10002 / 10000 / 10004 / 3) ──────────────
        msg_name = _MSG_EVENT_MAP.get(message, "")
        if msg_name in TASK_CHAIN_EVENTS:
            if self._log_service is not None:
                self._append_task_chain_log(msg_name, details, detail)
            event_type, final_status, text, level = TASK_CHAIN_EVENTS[msg_name]
            if final_status is not None:
                with self._status_lock:
                    self._task_chain_status = final_status
            return [EventRecord.now(event_type, text, level=level, detail=detail)]

        # ── SubTask Start / Completed / Error (20001 / 20002 / 20000) ─────────
        if msg_name in SUB_TASK_EVENTS:
            if self._log_service is not None:
                self._append_sub_task_log(msg_name, details, detail)
            event_type, text, level = SUB_TASK_EVENTS[msg_name]
            return [EventRecord.now(event_type, text, level=level, detail=detail)]

        # ── SubTaskExtraInfo (20003): "what" in JSON is the actual sub-type ───
        if message == _MSG_SUB_TASK_EXTRA_INFO:
            if self._log_service is not None:
                self._append_extra_info_log(sub_what, details, detail)
            return [EventRecord.now("maa.sub_task.extra", sub_what or "extra", level="debug", detail=detail)]

        return []

    def _record_screenshot_benchmark(self, details: Any, raw_detail: dict[str, Any]) -> None:
        benchmark = _screenshot_benchmark(details)
        if benchmark is None:
            return
        self._screenshot_benchmark = benchmark
        if self._log_service is not None:
            self._append_connection_log(benchmark, raw_detail)

    def _append_connection_log(self, benchmark: dict[str, Any], raw_detail: dict[str, Any]) -> None:
        cost = benchmark.get("cost")
        if cost is None:
            return
        method = benchmark.get("method") or "Unknown"
        text = f"最快截图耗时: {cost}ms ({method})"
        self._log_service.append(
            text,
            color_key="LdSpecialScreenshot",
            tooltip=benchmark,
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
        if what == "SubTaskError":
            if _sub_task_name(details) == "ProcessTask":
                return
            text = _sub_task_message(details, "任务出错")
            self._log_service.append(text, color_key="ErrorLogBrush", weight="Bold", raw=raw_detail)

    def _append_extra_info_log(self, extra_what: str, details: Any, raw_detail: dict[str, Any]) -> None:  # noqa: C901
        # SubTaskExtraInfo JSON: {"taskchain":..., "what":"StageDrops", "details":{...}}
        # Actual event payload lives in details["details"].
        d = _sub_details(details)
        ls = self._log_service

        # ── 作战 ──────────────────────────────────────────────────────────────
        if extra_what == "StageDrops":
            stage_obj = d.get("stage") or {}
            stage_code = (stage_obj.get("stageCode") if isinstance(stage_obj, dict) else None) or "未知关卡"
            stats = d.get("stats") or []
            cur_times = int(d.get("cur_times") or 0)
            lines: list[str] = []
            if isinstance(stats, list):
                sorted_stats = sorted(
                    (s for s in stats if isinstance(s, dict)),
                    key=lambda s: (-(s.get("addQuantity") or 0), -(s.get("quantity") or 0)),
                )
                for s in sorted_stats:
                    name = s.get("itemName") or s.get("itemId") or "未知"
                    if name == "furni":
                        name = "家具"
                    total = s.get("quantity") or 0
                    add = s.get("addQuantity") or 0
                    lines.append(f"{name} : {total} (+{add})" if add > 0 else f"{name} : {total}")
            drop_text = "\n".join(lines) if lines else "无掉落"
            text = f"{stage_code} 掉落统计:\n{drop_text}"
            if cur_times > 0:
                text += f"\n当前次数 : {cur_times}"
            ls.append(text, color_key="InfoLogBrush", split_mode="Before",
                      thumbnail={"capture": True, "placeholder": True},
                      tooltip={"kind": "stage_drops", "stage": stage_code, "cur_times": cur_times},
                      raw=raw_detail)
            return

        if extra_what == "StageInfo":
            ls.append(f"开始战斗: {d.get('name', '')}", color_key="MessageLogBrush", raw=raw_detail)
            return

        if extra_what == "StageInfoError":
            ls.append("关卡识别错误", color_key="ErrorLogBrush", weight="Bold",
                      split_mode="Both", thumbnail={"capture": True, "placeholder": True}, raw=raw_detail)
            return

        if extra_what == "UseMedicine":
            is_expiring = bool(d.get("is_expiring"))
            count = int(d.get("count") or 0)
            label = "临期理智药" if is_expiring else "理智药"
            ls.append(f"已使用{label} +{count}", color_key="InfoLogBrush", raw=raw_detail)
            return

        if extra_what == "StageQueueUnableToAgent":
            ls.append(f"关卡队列 {d.get('stage_code', '')} 无法代理", color_key="InfoLogBrush", raw=raw_detail)
            return

        if extra_what == "StageQueueMissionCompleted":
            ls.append(f"关卡队列 {d.get('stage_code', '')} - {d.get('stars', 0)} ★",
                      color_key="InfoLogBrush", raw=raw_detail)
            return

        if extra_what in {"SanityBeforeStage", "FightTimes", "PenguinId"}:
            return  # data-only, no log entry

        if extra_what == "Depot":
            items = d.get("items") or []
            done = bool(d.get("done", False))
            if items:
                lines = [
                    f"{item.get('itemName') or item.get('itemId') or '未知'} × {item.get('count', 0)}"
                    for item in items
                ]
                preview = lines[:30]
                text = "仓库识别完成:\n" + "\n".join(preview)
                if len(items) > 30:
                    text += f"\n...共 {len(items)} 种"
            else:
                text = "仓库识别完成（无物品）" if done else "仓库识别中…"
            ls.append(text, color_key="InfoLogBrush", split_mode="Before",
                      tooltip={"kind": "depot", "items": items, "done": done}, raw=raw_detail)
            self._publish_callback_event(EventRecord.now(
                "maa.tools.depot", "仓库识别完成", level="info",
                detail={"done": done, "items": items},
            ))
            return

        if extra_what == "OperBox":
            own = d.get("own_oper") or []
            not_own = d.get("not_own_oper") or []
            done = bool(d.get("done", False))
            text = f"干员识别完成: 已拥有 {len(own)} 人，未拥有 {len(not_own)} 人" if done else "干员识别中…"
            ls.append(text, color_key="InfoLogBrush", split_mode="Before",
                      tooltip={"kind": "operbox", "own_count": len(own), "not_own_count": len(not_own), "done": done},
                      raw=raw_detail)
            self._publish_callback_event(EventRecord.now(
                "maa.tools.operbox", "干员识别完成", level="info",
                detail={"done": done, "own_oper": own, "not_own_oper": not_own},
            ))
            return

        # ── 公招 ──────────────────────────────────────────────────────────────
        if extra_what == "RecruitTagsDetected":
            tags = d.get("tags") or []
            tag_text = "\n".join(str(t) for t in tags) if tags else "无"
            ls.append(f"公招识别结果:\n{tag_text}", color_key="InfoLogBrush", split_mode="Before",
                      thumbnail={"capture": True, "placeholder": True},
                      tooltip={"kind": "recruit_tags", "tags": tags}, raw=raw_detail)
            self._publish_callback_event(EventRecord.now(
                "maa.tools.recruit_calc", "公招识别", level="info",
                detail={"what": "tags_detected", "tags": tags},
            ))
            return

        if extra_what == "RecruitResult":
            level = int(d.get("level") or 0)
            color_key = "RareOperatorLogBrush" if level >= 5 else "InfoLogBrush"
            ls.append(f"{level} ★ Tags", color_key=color_key,
                      weight="Bold" if level >= 5 else "Regular",
                      tooltip={"kind": "recruit_result", "level": level}, raw=raw_detail)
            return

        if extra_what == "RecruitTagsSelected":
            tags = d.get("tags") or []
            tag_text = "\n".join(str(t) for t in tags) if tags else "无"
            ls.append(f"选择 Tags:\n{tag_text}", color_key="MessageLogBrush", raw=raw_detail)
            return

        if extra_what == "RecruitTagsRefreshed":
            ls.append(f"已刷新 {int(d.get('count') or 0)} 次", color_key="MessageLogBrush", raw=raw_detail)
            return

        if extra_what == "RecruitConfirm":
            ls.append("已确认招募", color_key="SuccessLogBrush", raw=raw_detail)
            return

        if extra_what == "RecruitSpecialTag":
            tag = d.get("tag", "")
            ls.append(f"高稀有度 Tag: {tag}", color_key="RareOperatorLogBrush",
                      weight="Bold", raw=raw_detail)
            self._publish_callback_event(EventRecord.now(
                "maa.tools.recruit_calc", "高稀有度Tag", level="info",
                detail={"what": "special_tag", "tag": tag},
            ))
            return

        if extra_what == "RecruitRobotTag":
            ls.append(f"支援机械 Tag: {d.get('tag', '')}", color_key="InfoLogBrush", raw=raw_detail)
            return

        if extra_what == "RecruitSupportOperator":
            ls.append(f"使用助战干员: {d.get('name', '')}", color_key="InfoLogBrush", raw=raw_detail)
            return

        if extra_what == "RecruitNoPermit":
            msg = "继续刷新" if bool(d.get("continue")) else "招募许可证不足"
            ls.append(msg, color_key="MessageLogBrush", raw=raw_detail)
            return

        if extra_what == "RecruitSlotCompleted":
            ls.append("当前公招位完成", color_key="SuccessLogBrush", raw=raw_detail)
            return

        # ── 基建 ──────────────────────────────────────────────────────────────
        if extra_what == "EnterFacility":
            facility = _facility_name(d)
            index = _index_one_based(d.get("index"))
            ls.append(f"当前设施: {facility} {index:02d}", color_key="MessageLogBrush",
                      split_mode="Before",
                      tooltip={"kind": "facility", "facility": facility, "index": index},
                      raw=raw_detail)
            return

        if extra_what == "ProductIncorrect":
            ls.append("产品识别错误", color_key="ErrorLogBrush", raw=raw_detail)
            return

        if extra_what == "ProductUnknown":
            ls.append("未知产品类型", color_key="ErrorLogBrush", raw=raw_detail)
            return

        if extra_what == "ProductChanged":
            ls.append("产品已更换", color_key="InfoLogBrush", raw=raw_detail)
            return

        if extra_what == "ProductOfFacility":
            ls.append(f"产品: {d.get('product', '')}", color_key="MessageLogBrush", raw=raw_detail)
            return

        if extra_what == "InfrastConfirmButton":
            # No text; only signals a screenshot update.
            ls.append("", color_key="MessageLogBrush", show_time=False,
                      thumbnail={"capture": True, "placeholder": True}, raw=raw_detail)
            return

        if extra_what == "NotEnoughStaff":
            facility = _facility_name(d)
            index = _index_one_based(d.get("index"))
            ls.append(f"可用干员不足: {facility} {index:02d}", color_key="ErrorLogBrush", raw=raw_detail)
            return

        if extra_what == "CustomInfrastRoomGroupsMatch":
            ls.append(f"选用编组: {d.get('group', '')}", color_key="MessageLogBrush", raw=raw_detail)
            return

        if extra_what == "CustomInfrastRoomGroupsMatchFailed":
            groups = d.get("groups") or []
            groups_text = ", ".join(str(g) for g in groups) if isinstance(groups, list) else str(groups)
            ls.append(f"编组匹配失败: {groups_text}", color_key="WarningLogBrush", raw=raw_detail)
            return

        if extra_what == "CustomInfrastRoomOperators":
            names = d.get("names") or []
            names_text = ", ".join(str(n) for n in names) if isinstance(names, list) else str(names)
            ls.append(f"上班干员: {names_text}", color_key="MessageLogBrush", raw=raw_detail)
            return

        if extra_what == "InfrastTrainingIdle":
            ls.append("当前无技能训练中", color_key="MessageLogBrush", raw=raw_detail)
            return

        if extra_what == "InfrastTrainingCompleted":
            op = d.get("operator", "")
            skill = d.get("skill", "")
            level = d.get("level", 0)
            ls.append(f"[{op}] {skill}\n训练等级: {level} 训练完成", color_key="InfoLogBrush", raw=raw_detail)
            return

        if extra_what == "InfrastTrainingTimeLeft":
            op = d.get("operator", "")
            skill = d.get("skill", "")
            level = d.get("level", 0)
            time_left = d.get("time", "")
            ls.append(f"[{op}] {skill}\n训练等级: {level}\n剩余时间: {time_left}",
                      color_key="InfoLogBrush", raw=raw_detail)
            return

        if extra_what == "CreditFullOnlyBuyDiscount":
            ls.append(f"信用已满，仅购买折扣品 ({d.get('credit', 0)})",
                      color_key="MessageLogBrush", raw=raw_detail)
            return

        # ── 作战指挥 (Copilot) ────────────────────────────────────────────────
        if extra_what == "BattleFormation":
            formation = d.get("formation") or []
            opers = ", ".join(str(o) for o in formation) if isinstance(formation, list) else str(formation)
            ls.append(f"编队阵容:\n[{opers}]", color_key="MessageLogBrush", raw=raw_detail)
            return

        if extra_what == "BattleFormationParseFailed":
            ls.append("编队文件解析失败", color_key="ErrorLogBrush", raw=raw_detail)
            return

        if extra_what == "BattleFormationSelected":
            selected = d.get("selected", "")
            group = d.get("group_name", "")
            text = f"{group} => {selected}" if group and group != selected else selected
            ls.append(f"已选干员: {text}", color_key="MessageLogBrush", raw=raw_detail)
            return

        if extra_what == "BattleFormationOperUnavailable":
            oper = d.get("oper_name", "")
            req_type = d.get("requirement_type", "")
            _TYPE_NAMES = {"elite": "精英化", "level": "等级", "skill_level": "技能等级", "module": "模组"}
            req_label = _TYPE_NAMES.get(req_type, req_type)
            color = "ErrorLogBrush" if req_type == "elite" else "WarningLogBrush"
            ls.append(f"干员条件不满足: {oper} ({req_label})", color_key=color, raw=raw_detail)
            return

        if extra_what == "CopilotAction":
            doc = d.get("doc", "")
            if doc:
                doc_color = d.get("doc_color") or "MessageLogBrush"
                ls.append(doc, color_key=doc_color, raw=raw_detail)
            action = d.get("action", "")
            target = d.get("target", "")
            step_text = f"当前步骤: {action}" + (f" ({target})" if target else "")
            ls.append(step_text, color_key="MessageLogBrush", raw=raw_detail)
            elapsed = d.get("elapsed_time")
            if elapsed is not None:
                try:
                    t = int(elapsed)
                    if t >= 0:
                        ls.append(f"已用时: {t}s", color_key="MessageLogBrush", raw=raw_detail)
                except (ValueError, TypeError):
                    pass
            return

        if extra_what == "CopilotListLoadTaskFileSuccess":
            ls.append(f"解析 {d.get('file_name', '')}[{d.get('stage_name', '')}] 成功",
                      color_key="MessageLogBrush", raw=raw_detail)
            return

        # ── 保全导航 (SSS) ────────────────────────────────────────────────────
        if extra_what == "SSSStage":
            ls.append(f"当前关卡: {d.get('stage', '')}", color_key="InfoLogBrush", raw=raw_detail)
            return

        if extra_what == "SSSSettlement":
            why = d.get("why", "")
            ls.append(why or "保全导航结算", color_key="InfoLogBrush", raw=raw_detail)
            return

        if extra_what == "SSSGamePass":
            ls.append("保全导航通过！", color_key="RareOperatorLogBrush", weight="Bold", raw=raw_detail)
            return

        if extra_what == "UnsupportedLevel":
            ls.append(f"不支持的关卡: {d.get('level', '')}", color_key="ErrorLogBrush", raw=raw_detail)
            return

        # ── 生息演算 ──────────────────────────────────────────────────────────
        if extra_what == "ReclamationReport":
            ls.append(
                f"演算完成\n勋章: {d.get('total_badges', 0)}(+{d.get('badges', 0)})"
                f"\n建设点: {d.get('total_construction_points', 0)}(+{d.get('construction_points', 0)})",
                color_key="MessageLogBrush", raw=raw_detail)
            return

        if extra_what == "ReclamationProcedureStart":
            ls.append(f"任务开始 {int(d.get('times') or 0)} 次", color_key="InfoLogBrush", raw=raw_detail)
            return

        if extra_what == "ReclamationSmeltGold":
            ls.append(f"黄金提炼 {int(d.get('times') or 0)} 次", color_key="MessageLogBrush", raw=raw_detail)
            return

        # ── 截图时序 ──────────────────────────────────────────────────────────
        if extra_what == "FastestWayToScreencap":
            self._record_screenshot_benchmark(details, raw_detail)
            return

    def _schedule_thumbnail_capture(self, card_id: str) -> None:
        """Called from MaaLogService (on MaaCore callback thread) when a placeholder thumbnail is attached.

        Schedules an async coroutine on the main event loop to capture a real
        screenshot and replace the placeholder via attach_real_thumbnail().
        """
        loop = self._loop
        if loop is not None and loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self._capture_and_attach_thumbnail(card_id), loop
            )

    async def _capture_and_attach_thumbnail(self, card_id: str) -> None:
        """Capture a real screenshot and replace the placeholder on the given card."""
        if self._log_service is None or self._asst is None:
            return
        try:
            await asyncio.sleep(LOG_THUMBNAIL_CAPTURE_DELAY)
            image_data = await self.get_image()
            if image_data:
                preview_image = await asyncio.to_thread(encode_log_preview, image_data)
                self._log_service.attach_real_thumbnail(card_id, image_data, preview_image)
        except Exception:
            pass

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
    adapter_name = ""
    core_dir_str = ""

    if env is None:
        config_file = project_root / "data" / "adapter.json"
        if config_file.exists():
            try:
                file_cfg = json.loads(config_file.read_text(encoding="utf-8"))
                adapter_name = str(file_cfg.get("adapter", "")).strip().lower()
                core_dir_str = str(file_cfg.get("core_dir", "")).strip()
            except Exception:
                pass

    if not adapter_name:
        adapter_name = source_env.get("MAA_ADAPTER", "").strip().lower()
    if not core_dir_str:
        core_dir_str = source_env.get("MAA_CORE_DIR", "").strip()

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
    return normalize_client_type(value)


TOUCH_MODE_ALIASES = {
    "Minitouch（默认）": "minitouch",
    "MaaTouch（实验功能）": "maatouch",
    "ADB Input（不推荐使用）": "adb",
    "MaaFramework（实验功能）": "MaaFwAdb",
    "maaframework": "MaaFwAdb",
    "maafwadb": "MaaFwAdb",
}


def _normalize_touch_mode(value: Any) -> str:
    text = str(value or "minitouch").strip()
    return TOUCH_MODE_ALIASES.get(text, TOUCH_MODE_ALIASES.get(text.lower(), text or "minitouch"))


def _bool_option(value: Any) -> str:
    return "1" if bool(value) else "0"


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
    return f"{prefix}: {_sub_task_name(details)}"


def _sub_task_name(details: Any) -> str:
    value = _nested_value(details, "subtask", "task", "name", "what") or "子任务"
    return str(value)


def _sanity_suffix(details: Any) -> str:
    current = _nested_value(details, "current_sanity", "sanity_current", "current")
    maximum = _nested_value(details, "max_sanity", "sanity_max", "max")
    if current is None or maximum is None:
        return ""
    return f"理智: {current}/{maximum}"


def _sub_details(details: Any) -> Any:
    """Extract inner 'details' dict from a SubTaskExtraInfo callback payload.

    SubTaskExtraInfo JSON: {"taskchain":..., "what":"StageDrops", "details":{actual data}}
    """
    if isinstance(details, dict):
        inner = details.get("details")
        if isinstance(inner, dict):
            return inner
    return {}


def _normalize_image_data(data: Any) -> bytes | None:
    if not data:
        return None
    if isinstance(data, bytes):
        image = data
    elif isinstance(data, bytearray):
        image = bytes(data)
    elif isinstance(data, memoryview):
        image = data.tobytes()
    else:
        return None
    if not any(image):
        return None
    return _trim_png_buffer(image)


def _trim_png_buffer(image: bytes) -> bytes:
    if not image.startswith(b"\x89PNG\r\n\x1a\n"):
        return image
    offset = 8
    while offset + 8 <= len(image):
        chunk_len = int.from_bytes(image[offset:offset + 4], "big")
        chunk_type = image[offset + 4:offset + 8]
        chunk_end = offset + 12 + chunk_len
        if chunk_end > len(image):
            return image
        if chunk_type == b"IEND":
            return image[:chunk_end]
        offset = chunk_end
    return image


def _index_one_based(value: Any) -> int:
    try:
        return int(value) + 1
    except (TypeError, ValueError):
        return 0


def _screenshot_benchmark(details: Any) -> dict[str, Any] | None:
    payload = _screenshot_details(details)
    if not payload:
        return None
    cost = _nested_value(payload, "cost", "ms", "time")
    if cost is None:
        return None
    method = _nested_value(payload, "method", "way", "screencap", "name") or "Unknown"
    benchmark: dict[str, Any] = {"kind": "screenshot", "method": method, "cost": cost}
    alternatives = _screenshot_alternatives(payload.get("alternatives"))
    if alternatives:
        benchmark["alternatives"] = alternatives
    return benchmark


def _screenshot_details(details: Any) -> dict[str, Any]:
    if not isinstance(details, dict):
        return {}
    inner = details.get("details")
    if isinstance(inner, dict):
        return inner
    return details


def _screenshot_alternatives(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    alternatives: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        method = _nested_value(item, "method", "way", "screencap", "name") or "Unknown"
        entry = {"method": method}
        cost = _nested_value(item, "cost", "ms", "time")
        if cost is not None:
            entry["cost"] = cost
        alternatives.append(entry)
    return alternatives


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


def _ld_index_from_address(address: str) -> int:
    """Derive LDPlayer instance index from ADB address (mirrors WPF GetEmulatorIndex)."""
    if not address:
        return 0
    try:
        if address.startswith("emulator-"):
            return (int(address[9:]) - 5554) // 2
        if address.startswith("127.0.0.1:"):
            return (int(address[10:]) - 5555) // 2
    except (ValueError, IndexError):
        pass
    return 0


def _ld_player_pid(ld_path: str, index: int) -> int:
    """Call ldconsole.exe list2 to get the PID of the LDPlayer instance (mirrors WPF GetEmulatorPid)."""
    import subprocess
    ldconsole = os.path.join(ld_path, "ldconsole.exe")
    if not os.path.exists(ldconsole):
        return 0
    try:
        result = subprocess.run(
            [ldconsole, "list2"],
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=0x08000000 if sys.platform == "win32" else 0,  # CREATE_NO_WINDOW
        )
        for line in result.stdout.splitlines():
            parts = line.split(",")
            if len(parts) >= 6 and parts[0].strip().isdigit() and int(parts[0].strip()) == index:
                pid_str = parts[5].strip()
                if pid_str.isdigit():
                    return int(pid_str)
    except Exception:
        pass
    return 0

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Callable
from uuid import uuid4

from .events import EventBus
from .models import AppendCall, EventRecord, Profile
from .storage import _replace_with_retry


CLIENT_UTC_OFFSETS = {"Official": 8, "Bilibili": 8, "txwy": 8, "YoStarEN": -7, "YoStarJP": 9, "YoStarKR": 9}
GAME_DAY_START_HOUR = 4
MAX_REPORT_SESSIONS = 1000


def configured_account(profile: Profile) -> str:
    return next((str(t.params.get("account_name", t.params.get("account", ""))) for t in profile.tasks if t.type == "StartUp"), "")


def profile_identity(profile: Profile) -> str:
    account = configured_account(profile)
    identity = [profile.name, profile.adb.address, profile.adb.client_type, account]
    return hashlib.sha256(json.dumps(identity, ensure_ascii=False).encode()).hexdigest()


class ExecutionLedger:
    """单一原始回调入口；库存、限次、培养和日报按配置/设备/区服/账号隔离。"""

    def __init__(self, path: Path, events: EventBus, *, now: Callable[[], datetime] | None = None) -> None:
        self.path = path
        self._events = events
        self._now = now or (lambda: datetime.now(timezone.utc))
        self._lock = Lock()
        self._data: dict[str, Any] = {"profiles": {}}
        self.available = True
        if path.exists():
            try:
                loaded = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(loaded, dict) or not isinstance(loaded.get("profiles"), dict):
                    raise ValueError("invalid ledger")
                self._data = loaded
            except (OSError, ValueError, TypeError):
                self.available = False
                events.publish(EventRecord.now("ledger.error", "执行记录无法读取，已保留原文件并停用账本功能；普通任务仍可运行。", level="error"))
        self._profile: Profile | None = None
        self._run = ""
        self._bindings: dict[int, AppendCall] = {}
        self._started: set[int] = set()
        self._succeeded: dict[str, bool] = {}
        self._complete_depots: set[int] = set()
        self._depot_pending: dict[int, dict[str, int]] = {}
        self._pending_fights: dict[int, dict[str, Any]] = {}
        self._sessions: dict[int, dict[str, Any]] = {}
        self._error: str | None = None
        self.account_verified = False
        events.add_listener(self._on_event)

    def begin(self, profile: Profile, *, account_verified: bool = False) -> None:
        self._profile = profile.model_copy(deep=True)
        self._run = uuid4().hex
        self._bindings.clear()
        self._started.clear()
        self._succeeded.clear()
        self._complete_depots.clear()
        self._depot_pending.clear()
        self._pending_fights.clear()
        self._sessions.clear()
        self._error = None
        self.account_verified = account_verified or not configured_account(profile)

    def end(self) -> None:
        self._profile = None
        self._bindings.clear()
        self._depot_pending.clear()

    def bind(self, core_id: int, call: AppendCall) -> None:
        self._bindings[core_id] = call.model_copy(deep=True)

    def snapshot(self, profile: Profile) -> dict[str, Any]:
        return deepcopy(self._data["profiles"].get(profile_identity(profile), {}))

    def stock(self, item_id: str) -> int:
        self.check()
        if not self.account_verified:
            raise RuntimeError("尚未确认当前登录账号，请先成功运行该配置的启动唤醒，再执行库存保持。")
        inventory = self._state().get("inventory", {})
        if not inventory.get("trusted"):
            raise RuntimeError("没有成功识别的可信完整仓库，已停止库存保持。")
        return int(inventory.get("items", {}).get(item_id, 0))

    def inventory(self) -> dict[str, int]:
        self.stock("")
        return dict(self._state()["inventory"]["items"])

    def check(self) -> None:
        if self._error:
            raise RuntimeError(self._error)

    def prepare(self, call: AppendCall) -> AppendCall:
        self.check()
        result = call.model_copy(deep=True)
        if call.type == "Mall":
            daily = self._state().get("daily", {}).get(self._day(), {})
            for flag in ("visit_friends", "credit_fight"):
                once = bool(result.params.pop(f"{flag}_once", False))
                if once and daily.get(flag):
                    result.params[flag] = False
        return result

    def userdata_due(self, task_id: str, interval: str) -> bool:
        last = self._state().get("userdata", {}).get(task_id)
        if not last or interval == "EveryTime":
            return True
        last_date, today = datetime.fromisoformat(last).date(), datetime.fromisoformat(self._day()).date()
        if interval == "Daily":
            return last_date != today
        if interval == "Weekly":
            return last_date.isocalendar()[:2] != today.isocalendar()[:2]
        return True

    def mark_userdata(self, task_id: str) -> None:
        self._state().setdefault("userdata", {})[task_id] = self._day()
        self._save()

    def task_succeeded(self, task_id: str) -> bool:
        return self._succeeded.get(task_id, False)

    def _state(self) -> dict[str, Any]:
        if self._profile is None:
            raise RuntimeError("执行记录没有活动配置。")
        return self._data["profiles"].setdefault(profile_identity(self._profile), {})

    def _day(self) -> str:
        client = self._profile.adb.client_type if self._profile else "Official"
        local = self._now().astimezone(timezone(timedelta(hours=CLIENT_UTC_OFFSETS.get(client, 8))))
        return (local - timedelta(hours=GAME_DAY_START_HOUR)).date().isoformat()

    def _save(self) -> None:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(self._data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            _replace_with_retry(tmp, self.path)

    def _on_event(self, event: EventRecord) -> None:
        if event.type != "maa.callback" or self._profile is None:
            return
        try:
            self._consume(event.detail)
        except (OSError, ValueError, TypeError, KeyError) as exc:
            self._error = f"执行记录更新失败：{exc}"
            self._state().setdefault("inventory", {})["trusted"] = False
            self._events.publish(EventRecord.now("ledger.error", self._error, level="error"))

    def _consume(self, raw: dict[str, Any]) -> None:
        outer = raw.get("details")
        if not isinstance(outer, dict):
            return
        core_id = outer.get("taskid")
        call = self._bindings.get(core_id)
        if call is None:
            return
        message = raw.get("message")
        detail = outer.get("details", {})
        if not isinstance(detail, dict):
            raise ValueError("核心回调 details 必须为对象")
        if raw.get("message") == 10001:
            self._started.add(core_id)
        if core_id not in self._started:
            return
        what = outer.get("what", "")
        state = self._state()
        changed = False
        if call.type == "StartUp" and call.params.get("enable", True):
            if message == 10001:
                self.account_verified = False
            elif message == 10002:
                self.account_verified = str(call.params.get("account_name", "")) == configured_account(self._profile)
        if call.type == "Depot":
            if message == 10001:
                state["inventory"] = {"trusted": False, "items": {}}
                changed = True
            elif message == 20003 and what == "DepotInfo" and detail.get("done") is True:
                items = detail.get("data")
                if isinstance(items, str):
                    items = json.loads(items)
                if not isinstance(items, dict) or not items or any(type(v) is not int or v < 0 for v in items.values()):
                    raise ValueError("仓库识别缺少完整物品映射或数量不是非负整数")
                self._depot_pending[core_id] = dict(items)
            elif message == 10002 and core_id in self._depot_pending:
                items = self._depot_pending.pop(core_id)
                self._complete_depots.add(core_id)
                state["inventory"] = {"trusted": self.account_verified, "items": items if self.account_verified else {},
                                      "updated_at": self._now().isoformat() if self.account_verified else None}
                changed = True
            elif message in (10000, 10004):
                self._depot_pending.pop(core_id, None)
                state["inventory"] = {"trusted": False, "items": {}}
                changed = True
        if call.type == "Mall" and message == 20002 and outer.get("subtask") == "ProcessTask":
            task = str(detail.get("task", "")).split("@")[-1]
            flag = "credit_fight" if task == "StageDrops-Stars-3" else "visit_friends" if task in {"VisitLimited", "VisitNextBlack"} else ""
            if flag:
                state.setdefault("daily", {}).setdefault(self._day(), {})[flag] = True
                # 只保留最近 8 个游戏日，不影响每日限次。
                state["daily"] = dict(sorted(state["daily"].items())[-8:])
                changed = True
        if call.type == "OperProgress" and message == 20003 and what == "OperProgressDetail":
            progress = state.setdefault("progress", {})
            name = str(detail.get("name", ""))
            key = f"{detail.get('role', '')}:{name}"
            item = progress.setdefault(key, {"name": name, "role": detail.get("role", ""), "actions": []})
            item.update(result=detail.get("result"), result_detail=detail.get("result_detail"), updated_at=self._now().isoformat())
            for field in ("elite", "skill_level"):
                if type(detail.get(field)) is int:
                    item[field] = max(item.get(field, 0), detail[field])
            if isinstance(detail.get("skill_mastery"), list) and len(detail["skill_mastery"]) == 3:
                item["skill_mastery"] = [max(old, new) for old, new in zip(item.get("skill_mastery", [0, 0, 0]), detail["skill_mastery"])]
            item["actions"] = [*item.get("actions", []), detail][-30:]
            changed = True
        if call.type == "Fight":
            changed = self._consume_fight(core_id, message, outer, detail) or changed
        if message in (10000, 10002, 10004):
            self._succeeded[call.task_id] = message == 10002 and (call.type != "Depot" or core_id in self._complete_depots)
        if changed:
            self._save()

    def _consume_fight(self, core_id: int, message: int, outer: dict[str, Any], detail: dict[str, Any]) -> bool:
        pending = self._pending_fights.setdefault(core_id, {"medicine": 0, "expiring_medicine": 0, "stone": 0})
        what = outer.get("what")
        if message == 20003 and what == "FightTimes":
            if isinstance(detail.get("sanity_cost"), int) and detail["sanity_cost"] >= 0:
                pending["sanity_cost"] = detail["sanity_cost"]
                pending["series"] = max(1, int(detail.get("series", 1)))
            return False
        if message == 20003 and what == "UseMedicine":
            key = "expiring_medicine" if detail.get("is_expiring") else "medicine"
            pending[key] += max(0, int(detail.get("count", 0)))
            return False
        if message == 20001 and outer.get("subtask") == "ProcessTask" and str(detail.get("task", "")).split("@")[-1] == "StoneConfirm":
            pending["stone"] += 1
            return False
        if message in (10000, 10002, 10004):
            session = self._sessions.get(core_id)
            if session is None and any(pending[key] for key in ("medicine", "expiring_medicine", "stone")):
                session = self._report_session(core_id, str(self._bindings[core_id].params.get("stage") or "未结算"))
            if session:
                self._flush_consumables(session, pending)
                if session.get("status") != "failed":
                    session["status"] = {10000: "failed", 10002: "completed", 10004: "stopped"}[message]
                return True
            return False
        if message != 20003 or what != "StageDrops":
            return False
        stage_info = detail.get("stage", {})
        previous = self._sessions.get(core_id, {})
        stage = str(stage_info.get("stageCode") or stage_info.get("stageId") or previous.get("stage") or "未知关卡") if isinstance(stage_info, dict) else str(stage_info)
        state = self._state()
        session = self._report_session(core_id, stage)
        series = pending.pop("series", 1)
        actual = max(1, int(detail.get("cur_times", series)))
        session["battles"] += actual
        session["rounds"] += 1
        cost = pending.pop("sanity_cost", None)
        if cost is not None:
            session["sanity"] += cost if actual == series else cost // series * actual
        else:
            session["sanity_known"] = False
        self._flush_consumables(session, pending)
        # drops 是单次结算；stats.quantity 是整段累计，绝不能相加。
        for drop in detail.get("drops", []):
            item_id = str(drop.get("itemId", ""))
            count = max(0, int(drop.get("quantity", 0)))
            if item_id:
                old = session["drops"].setdefault(item_id, {"name": drop.get("itemName", item_id), "quantity": 0})
                old["quantity"] += count
        inventory = state.get("inventory", {})
        if inventory.get("trusted") and self.account_verified:
            for stat in detail.get("stats", []):
                item_id = str(stat.get("itemId", ""))
                if item_id:
                    items = inventory["items"]
                    items[item_id] = items.get(item_id, 0) + max(0, int(stat.get("addQuantity", 0)))
        return True

    def _report_session(self, core_id: int, stage: str) -> dict[str, Any]:
        session = self._sessions.get(core_id)
        if session is None or session["stage"] != stage or session["day"] != self._day():
            if session is not None:
                session["status"] = "continued"
            reports = self._state().setdefault("reports", [])
            session = {
                "id": uuid4().hex, "day": self._day(),
                "stage": stage, "started_at": self._now().isoformat(), "battles": 0, "rounds": 0,
                "sanity": 0, "sanity_known": True, "medicine": 0, "expiring_medicine": 0,
                "stone": 0, "drops": {}, "status": "running",
            }
            self._sessions[core_id] = session
            reports.append(session)
            del reports[:-MAX_REPORT_SESSIONS]
        return session

    @staticmethod
    def _flush_consumables(session: dict[str, Any], pending: dict[str, Any]) -> None:
        for key in ("medicine", "expiring_medicine", "stone"):
            session[key] += pending[key]
            pending[key] = 0

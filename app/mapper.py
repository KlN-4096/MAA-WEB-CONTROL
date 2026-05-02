from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime
from functools import lru_cache
from typing import Any

from .models import AppendCall, Profile, TaskDefinition
from .options import DEFAULT_MAA_SOURCE_DIR, EXCLUDED_DROP_IDS


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
UNLIMITED_TASK_TIMES = 99999
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

STARTUP_CLIENT_TYPES = {
    "官服": "Official",
    "B服": "Bilibili",
    "Bilibili服": "Bilibili",
    "国际服 (YostarEN)": "YoStarEN",
    "日服 (YostarJP)": "YoStarJP",
    "韩服 (YostarKR)": "YoStarKR",
    "繁中服 (txwy)": "txwy",
}

INFRAST_MODE_VALUES = {
    "常规模式": 0,
    "自定义基建配置": 10000,
    "队列轮换": 20000,
}

INFRAST_FACILITY_VALUES = {
    "制造站": "Mfg",
    "贸易站": "Trade",
    "控制中枢": "Control",
    "发电站": "Power",
    "会客室": "Reception",
    "办公室": "Office",
    "宿舍": "Dorm",
    "加工站": "Processing",
    "训练室": "Training",
}

INFRAST_DRONE_VALUES = {
    "不使用无人机": "_NotUse",
    "_NotUse": "_NotUse",
    "贸易站-龙门币": "Money",
    "贸易站-合成玉": "SyntheticJade",
    "制造站-经验书": "CombatRecord",
    "制造站-赤金": "PureGold",
    "制造站-源石碎片": "OriginStone",
    "制造站-芯片组": "Chip",
}

MALL_DROP_FALLBACK = "不选择"
ROGUELIKE_THEME_VALUES = {
    "傀影": "Phantom",
    "水月": "Mizuki",
    "萨米": "Sami",
    "萨卡兹": "Sarkaz",
    "界园": "JieGarden",
}
ROGUELIKE_STRATEGY_MODE_VALUES = {
    "刷等级": 0,
    "刷源石锭": 1,
    "刷开局": 2,
    "刷月度小队": 3,
    "刷深入调查": 4,
}
RECLAMATION_THEME_VALUES = {
    "沙洲遗闻": "Tales",
}
RECLAMATION_STRATEGY_MODE_VALUES = {
    "无存档": 0,
    "有存档": 1,
}
RECLAMATION_INCREMENT_MODE_VALUES = {
    "连点": 0,
    "长按": 1,
}


class TaskMappingError(ValueError):
    """Raised when a web task cannot be translated to a MaaCore append call."""


def task_to_append_call(task: TaskDefinition) -> AppendCall | None:
    if not task.enabled:
        return None
    if task.type not in SUPPORTED_TASK_TYPES:
        raise TaskMappingError(f"Unsupported task type: {task.type}")

    params = deepcopy(task.params)
    _normalize_common_fields(params)

    mapped_type = "Fight" if task.type == "Custom" else task.type
    if task.type in FIGHT_LIKE_TASK_TYPES:
        _map_fight(params)
    elif task.type == "StartUp":
        _map_startup(params)
    elif task.type == "Recruit":
        _map_recruit(params)
    elif task.type == "Infrast":
        _map_infrast(params)
    elif task.type == "Mall":
        _map_mall(params)
    elif task.type == "Award":
        _map_award(params)
    elif task.type == "Roguelike":
        _map_roguelike(params)
    elif task.type == "Reclamation":
        _map_reclamation(params)

    params.setdefault("enable", True)
    return AppendCall(task_id=task.id, type=mapped_type, params=params)


def profile_to_append_calls(profile: Profile) -> list[AppendCall]:
    calls: list[AppendCall] = []
    for task in profile.tasks:
        call = task_to_append_call(task)
        if call is not None:
            calls.append(call)
    return calls


def _normalize_common_fields(params: dict[str, Any]) -> None:
    if "account_name" not in params and isinstance(params.get("account"), str):
        params["account_name"] = params["account"]
    if "client_type" in params:
        params["client_type"] = _normalize_client_type(params.get("client_type"))


def _map_startup(params: dict[str, Any]) -> None:
    _normalize_common_fields(params)


def _map_fight(params: dict[str, Any]) -> None:
    _normalize_stage_plan(params)
    _map_fight_resources(params)
    _map_fight_reporting(params)


def _map_fight_resources(params: dict[str, Any]) -> None:
    if "use_medicine" in params:
        params["medicine"] = _int_or_default(params.get("medicine"), 0) if params.get("use_medicine") else 0
    if "use_stone" in params:
        params["stone"] = _int_or_default(params.get("stone"), 0) if params.get("use_stone") else 0
    if "has_times_limited" in params:
        params["times"] = (
            _int_or_default(params.get("times"), UNLIMITED_TASK_TIMES)
            if params.get("has_times_limited")
            else UNLIMITED_TASK_TIMES
        )
    params["series"] = int(params.get("series", 0))
    params["DrGrandet"] = bool(params.get("DrGrandet", params.get("dr_grandet", False)))
    params["medicine_expire_days"] = _medicine_expire_days(params)

    drops = _build_drops(params)
    if drops:
        params["drops"] = drops


def _map_fight_reporting(params: dict[str, Any]) -> None:
    if "report_to_penguin" in params:
        params["report_to_penguin"] = bool(params.get("report_to_penguin", False))
    if "penguin_id" in params:
        params["penguin_id"] = str(params.get("penguin_id", ""))
    if "server" in params:
        params["server"] = str(params.get("server", "CN"))
    if "client_type" in params:
        params["client_type"] = _normalize_client_type(params.get("client_type"))
    if "use_remaining_sanity_stage" in params:
        params["use_remaining_sanity_stage"] = bool(params.get("use_remaining_sanity_stage", False))


def _map_recruit(params: dict[str, Any]) -> None:
    select = _recruit_levels_from_list(params.get("select"))
    confirm = _recruit_levels_from_list(params.get("confirm"))
    if confirm is None:
        confirm = _recruit_confirm_levels(params)
    if select is None:
        select = list(confirm)
    params["select"] = select
    params["confirm"] = confirm
    params["first_tags"] = _split_tags(params.get("extra_tags", params.get("first_tags", [])))
    params["extra_tags_mode"] = int(params.get("extra_tags_mode", 0))
    params["times"] = int(params.get("max_times", params.get("times", 0)))
    params["set_time"] = bool(params.get("set_time", True))
    params["expedite"] = bool(params.get("expedite", params.get("auto_expedited", False)))
    params["skip_robot"] = bool(params.get("skip_robot", True))
    params["refresh"] = bool(params.get("refresh", False))
    params["force_refresh"] = bool(params.get("force_refresh", params.get("refresh", True)))
    params["recruitment_time"] = {
        str(level): _recruitment_minutes(params.get(f"time{level}", "09:00"))
        for level in (3, 4, 5, 6)
    }


def _map_infrast(params: dict[str, Any]) -> None:
    params["mode"] = _normalize_infrast_mode(params.get("mode", 0))
    params["facility"] = _normalize_facilities(params.get("facilities", params.get("facility", [])))
    params["drones"] = _normalize_drone(params.get("drone", params.get("drones", "_NotUse")))
    params["threshold"] = _normalize_threshold(params.get("mood", params.get("threshold", 30)))
    params["dorm_trust_enabled"] = bool(params.get("dorm_trust_enabled", params.get("dorm_trust", False)))
    params["dorm_notstationed_enabled"] = bool(params.get("dorm_notstationed_enabled", params.get("skip_entered", False)))
    params["reception_message_board"] = bool(params.get("reception_message_board", params.get("collect_credit", True)))
    params["reception_clue_exchange"] = bool(params.get("reception_clue_exchange", params.get("clue_exchange", True)))
    params["reception_send_clue"] = bool(params.get("reception_send_clue", params.get("send_clue", True)))
    params["replenish"] = bool(params.get("replenish", params.get("stone_fragment", False)))
    params["continue_training"] = bool(params.get("continue_training", False))


def _map_mall(params: dict[str, Any]) -> None:
    params["visit_friends"] = bool(params.get("visit_friends", True))
    params["shopping"] = bool(params.get("shopping", True))
    params["buy_first"] = _split_tags(params.get("buy_first", []))
    params["blacklist"] = _split_tags(params.get("blacklist", []))
    params["force_shopping_if_credit_full"] = bool(params.get("force_shopping_if_credit_full", params.get("overflow_blacklist", False)))
    params["only_buy_discount"] = bool(params.get("only_buy_discount", params.get("discount_only", False)))
    params["reserve_max_credit"] = bool(params.get("reserve_max_credit", params.get("stop_if_low", False)))
    params["credit_fight"] = bool(params.get("credit_fight", False))
    params["formation_index"] = int(params.get("formation_index", 0))


def _map_award(params: dict[str, Any]) -> None:
    params["award"] = bool(params.get("award", params.get("daily", True)))
    params["mail"] = bool(params.get("mail", False))
    params["recruit"] = bool(params.get("recruit", params.get("free_gacha", False)))
    params["orundum"] = bool(params.get("orundum", False))
    params["mining"] = bool(params.get("mining", params.get("limited_orundum", False)))
    params["specialaccess"] = bool(params.get("specialaccess", params.get("monthly_card", False)))


def _map_roguelike(params: dict[str, Any]) -> None:
    if "theme" in params:
        theme = str(params.get("theme", ""))
        params["theme"] = ROGUELIKE_THEME_VALUES.get(theme, theme)
    if "difficulty" in params:
        params["difficulty"] = _normalize_int_choice(params.get("difficulty"))
    if "mode" in params:
        params["mode"] = _normalize_int_choice(params.get("mode"))
    elif "strategy" in params:
        mode = _mode_from_prefix(params.get("strategy"), ROGUELIKE_STRATEGY_MODE_VALUES)
        if mode is not None:
            params["mode"] = mode


def _map_reclamation(params: dict[str, Any]) -> None:
    if "theme" in params:
        theme = str(params.get("theme", ""))
        params["theme"] = RECLAMATION_THEME_VALUES.get(theme, theme)
    if "mode" in params:
        params["mode"] = _normalize_int_choice(params.get("mode"))
    elif "strategy" in params:
        mode = _mode_from_prefix(params.get("strategy"), RECLAMATION_STRATEGY_MODE_VALUES)
        if mode is not None:
            params["mode"] = mode
    if "tools_to_craft" in params:
        params["tools_to_craft"] = _normalize_string_list(params.get("tools_to_craft"))
    elif "tool_to_craft" in params:
        params["tools_to_craft"] = _normalize_string_list(params.get("tool_to_craft"))
    if "num_craft_batches" in params:
        params["num_craft_batches"] = _int_or_default(params.get("num_craft_batches"), 0)
    elif "max_craft_count" in params:
        params["num_craft_batches"] = _int_or_default(params.get("max_craft_count"), 0)
    if "increment_mode" in params:
        params["increment_mode"] = _normalize_increment_mode(params.get("increment_mode"))


def _normalize_stage_plan(params: dict[str, Any]) -> None:
    stage_plan = params.get("stage_plan")
    if not isinstance(stage_plan, list):
        return
    stage = _select_stage_from_plan(stage_plan)
    if stage:
        params["stage"] = stage


def _select_stage_from_plan(stage_plan: list[Any], weekday: int | None = None) -> str:
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


def _normalize_client_type(value: Any) -> str:
    text = str(value or "")
    return STARTUP_CLIENT_TYPES.get(text, text)


def _normalize_infrast_mode(value: Any) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return INFRAST_MODE_VALUES.get(str(value), 0)


def _normalize_facilities(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    facilities: list[str] = []
    for value in values:
        mapped = INFRAST_FACILITY_VALUES.get(str(value), str(value))
        if mapped:
            facilities.append(mapped)
    return facilities


def _normalize_drone(value: Any) -> str:
    return INFRAST_DRONE_VALUES.get(str(value), str(value or "_NotUse"))


def _normalize_threshold(value: Any) -> float:
    try:
        threshold = float(value)
    except (TypeError, ValueError):
        threshold = 30.0
    return threshold / 100 if threshold > 1 else threshold


def _recruit_confirm_levels(params: dict[str, Any]) -> list[int]:
    return [level for level in (6, 5, 4, 3) if params.get(f"confirm_{level}", False)]


def _recruit_levels_from_list(value: Any) -> list[int] | None:
    if not isinstance(value, list):
        return None
    return [_int_or_default(item, 0) for item in value if str(item).isdigit()]


def _normalize_int_choice(value: Any) -> Any:
    if isinstance(value, int):
        return value
    text = str(value).strip()
    if text.lstrip("-").isdigit():
        return int(text)
    start = text.rfind("(")
    end = text.rfind(")")
    if start != -1 and end > start:
        inner = text[start + 1 : end].strip()
        if inner.lstrip("-").isdigit():
            return int(inner)
    return value


def _mode_from_prefix(value: Any, mapping: dict[str, int]) -> int | None:
    text = str(value)
    for prefix, mode in mapping.items():
        if text.startswith(prefix):
            return mode
    return None


def _normalize_string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item)]
    if value:
        return [str(value)]
    return []


def _normalize_increment_mode(value: Any) -> Any:
    normalized = _normalize_int_choice(value)
    if isinstance(normalized, int):
        return normalized
    return RECLAMATION_INCREMENT_MODE_VALUES.get(str(value), value)


def _int_or_default(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _split_tags(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if not isinstance(value, str):
        return []
    return [part.strip() for part in value.replace("；", ";").replace("，", ";").split(";") if part.strip()]


def _recruitment_minutes(value: Any) -> int:
    text = str(value or "09:00")
    if ":" in text:
        hours, minutes = text.split(":", 1)
        try:
            return int(hours) * 60 + int(minutes)
        except ValueError:
            return 540
    try:
        return int(text)
    except ValueError:
        return 540


def _medicine_expire_days(params: dict[str, Any]) -> int:
    if not bool(params.get("use_expiring_medicine", True)):
        return 0
    value = params.get("medicine_expire_days")
    if isinstance(value, int):
        return value
    raw = str(params.get("medicine_expire_hours", "48h")).lower().replace("小时", "h")
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        return 2
    hours = int(digits)
    return max(hours // 24, 0)


@lru_cache(maxsize=1)
def _drop_name_to_id_map() -> dict[str, str]:
    path = DEFAULT_MAA_SOURCE_DIR / "resource" / "item_index.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}

    result: dict[str, str] = {}
    for item_id, item in data.items():
        if not str(item_id).isdigit() or str(item_id) in EXCLUDED_DROP_IDS:
            continue
        name = item.get("name") if isinstance(item, dict) else None
        if name:
            result[str(name)] = str(item_id)
    return result


def _build_drops(params: dict[str, Any]) -> dict[str, int]:
    if isinstance(params.get("drops"), dict):
        return {str(key): int(value) for key, value in params["drops"].items()}
    if not bool(params.get("use_drops", False)):
        return {}

    drop = params.get("drop", MALL_DROP_FALLBACK)
    if isinstance(drop, list):
        return {}
    drop_name = str(drop or MALL_DROP_FALLBACK)
    if drop_name == MALL_DROP_FALLBACK:
        return {}

    item_id = _drop_name_to_id_map().get(drop_name, drop_name if drop_name.isdigit() else "")
    if not item_id:
        return {}
    return {item_id: 1}

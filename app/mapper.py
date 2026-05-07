from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any

from .models import AppendCall, Profile, TaskDefinition
from .options import EXCLUDED_DROP_IDS
from .resource_paths import resolve_maa_root


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
    "UserDataUpdate",
}

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

STAGE_VALUE_ALIASES = {
    "当前/上次": "",
    "当前": "",
    "上次": "",
    "CurrentStage": "",
    "CE": "CE-6",
    "龙门币": "CE-6",
    "龙门币-6/5": "CE-6",
    "LS": "LS-6",
    "经验": "LS-6",
    "经验-6/5": "LS-6",
    "狗粮": "LS-6",
    "CA": "CA-5",
    "技能": "CA-5",
    "技能-5": "CA-5",
    "AP": "AP-5",
    "红票": "AP-5",
    "红票-5": "AP-5",
    "SK": "SK-5",
    "碳": "SK-5",
    "碳-5": "SK-5",
    "炭": "SK-5",
    "AN": "Annihilation",
    "剿灭": "Annihilation",
    "剿灭模式": "Annihilation",
    "当期剿灭": "Annihilation",
    "Chernobog": "Chernobog@Annihilation",
    "切尔诺伯格": "Chernobog@Annihilation",
    "LungmenOutskirts": "LungmenOutskirts@Annihilation",
    "龙门外环": "LungmenOutskirts@Annihilation",
    "LungmenDowntown": "LungmenDowntown@Annihilation",
    "龙门市区": "LungmenDowntown@Annihilation",
    "奶/盾芯片": "PR-A-1",
    "奶/盾芯片组": "PR-A-2",
    "术/狙芯片": "PR-B-1",
    "术/狙芯片组": "PR-B-2",
    "先/辅芯片": "PR-C-1",
    "先/辅芯片组": "PR-C-2",
    "近/特芯片": "PR-D-1",
    "近/特芯片组": "PR-D-2",
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

TOUCH_MODE_VALUES = {
    "Minitouch（默认）": "minitouch",
    "MaaTouch（实验功能）": "maatouch",
    "ADB Input（不推荐使用）": "adb",
    "MaaFramework（实验功能）": "maaframework",
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

    mapped_type = task.type
    if task.type == "Fight":
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
    elif task.type == "Custom":
        _map_custom(params)
    elif task.type == "CloseDown":
        _map_closedown(params)
    elif task.type == "UserDataUpdate":
        _map_userdata_update(params)

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
    if "touch_mode" in params:
        mode = str(params.get("touch_mode", ""))
        params["touch_mode"] = TOUCH_MODE_VALUES.get(mode, mode)


def _map_fight(params: dict[str, Any]) -> None:
    _normalize_stage_plan(params)
    if "stage" in params:
        params["stage"] = _normalize_stage_str(str(params.get("stage", "")))
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
    params["expedite_times"] = int(params.get("expedite_times", params.get("times", params["times"])))
    params["skip_robot"] = bool(params.get("skip_robot", True))
    params["refresh"] = bool(params.get("refresh", False))
    params["force_refresh"] = bool(params.get("force_refresh", params.get("refresh", True)))
    if "server" in params:
        params["server"] = str(params.get("server", "CN"))
    if "report_to_penguin" in params:
        params["report_to_penguin"] = bool(params.get("report_to_penguin", False))
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
    if "filename" in params:
        params["filename"] = str(params.get("filename", ""))
    elif "custom_infrast_file" in params:
        params["filename"] = str(params.get("custom_infrast_file", ""))
    if "plan_index" in params:
        params["plan_index"] = _int_or_default(params.get("plan_index"), 0)


def _map_mall(params: dict[str, Any]) -> None:
    params["visit_friends"] = bool(params.get("visit_friends", True))
    params["visit_friends_once"] = bool(params.get("visit_friends_once", params.get("visit_once", False)))
    params["shopping"] = bool(params.get("shopping", True))
    params["buy_first"] = _split_tags(params.get("buy_first", []))
    params["blacklist"] = _split_tags(params.get("blacklist", []))
    params["force_shopping_if_credit_full"] = bool(params.get("force_shopping_if_credit_full", params.get("overflow_blacklist", False)))
    params["only_buy_discount"] = bool(params.get("only_buy_discount", params.get("discount_only", False)))
    params["reserve_max_credit"] = bool(params.get("reserve_max_credit", params.get("stop_if_low", False)))
    params["credit_fight"] = bool(params.get("credit_fight", False))
    params["credit_fight_once"] = bool(params.get("credit_fight_once", params.get("mall_fight_once", False)))
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

    # Squad and roles
    if "squad" in params:
        params["squad"] = str(params.get("squad", ""))
    if "roles" in params:
        params["roles"] = str(params.get("roles", ""))
    if "core_char" in params or "operator" in params:
        params["core_char"] = str(params.get("core_char", params.get("operator", "")))

    # Run count
    if "starts_count" in params:
        params["starts_count"] = _int_or_default(params.get("starts_count"), 999999)

    # Investment
    if "investment_enabled" in params:
        params["investment_enabled"] = bool(params.get("investment_enabled", True))
    if "investments_count" in params or "invest_count" in params:
        params["investments_count"] = _int_or_default(
            params.get("investments_count", params.get("invest_count")), 999
        )
    if "investment_with_more_score" in params or "invest_with_more_score" in params:
        params["investment_with_more_score"] = bool(
            params.get("investment_with_more_score", params.get("invest_with_more_score", False))
        )
        params.pop("invest_with_more_score", None)
    if "stop_when_investment_full" in params or "stop_when_deposit_full" in params:
        params["stop_when_investment_full"] = bool(
            params.get("stop_when_investment_full", params.get("stop_when_deposit_full", False))
        )

    # Stop conditions
    if "stop_at_final_boss" in params:
        params["stop_at_final_boss"] = bool(params.get("stop_at_final_boss", False))
    if "stop_at_max_level" in params or "stop_when_level_max" in params:
        params["stop_at_max_level"] = bool(
            params.get("stop_at_max_level", params.get("stop_when_level_max", False))
        )

    # Support
    if "use_support" in params or "use_support_unit" in params:
        params["use_support"] = bool(params.get("use_support", params.get("use_support_unit", False)))
    if "use_nonfriend_support" in params:
        params["use_nonfriend_support"] = bool(params.get("use_nonfriend_support", False))

    # Seed
    if "start_with_seed" in params:
        params["start_with_seed"] = bool(params.get("start_with_seed", False))
    if "seed" in params:
        params["seed"] = str(params.get("seed", ""))

    # Monthly squad
    if "monthly_squad_auto_iterate" in params:
        params["monthly_squad_auto_iterate"] = bool(params.get("monthly_squad_auto_iterate", True))
    if "monthly_squad_check_comms" in params:
        params["monthly_squad_check_comms"] = bool(params.get("monthly_squad_check_comms", True))

    # Deep exploration
    if "deep_exploration_auto_iterate" in params:
        params["deep_exploration_auto_iterate"] = bool(params.get("deep_exploration_auto_iterate", True))

    # Sami foldartal
    if "first_floor_foldartal" in params or "sami_first_floor_foldartal" in params:
        params["first_floor_foldartal"] = bool(
            params.get("first_floor_foldartal", params.get("sami_first_floor_foldartal", False))
        )
    if "first_floor_foldartals" in params or "sami_first_floor_foldartals" in params:
        val = params.get("first_floor_foldartals", params.get("sami_first_floor_foldartals", ""))
        params["first_floor_foldartals"] = _split_tags(val) if isinstance(val, str) else _normalize_string_list(val)

    # Collectible mode
    if "start_with_elite_two" in params:
        params["start_with_elite_two"] = bool(params.get("start_with_elite_two", False))
    if "only_start_with_elite_two" in params:
        params["only_start_with_elite_two"] = bool(params.get("only_start_with_elite_two", False))

    # CLP_PDS paradigms
    if "expected_collapsal_paradigms" in params:
        val = params.get("expected_collapsal_paradigms", "")
        params["expected_collapsal_paradigms"] = (
            _split_tags(val) if isinstance(val, str) else _normalize_string_list(val)
        )

    # Refresh shop with dice
    if "refresh_trader_with_dice" in params:
        params["refresh_trader_with_dice"] = bool(params.get("refresh_trader_with_dice", False))


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
    if "clear_store" in params:
        params["clear_store"] = bool(params.get("clear_store", True))


def _map_closedown(params: dict[str, Any]) -> None:
    if "client_type" in params:
        params["client_type"] = _normalize_client_type(params.get("client_type"))


def _map_userdata_update(params: dict[str, Any]) -> None:
    params.setdefault("update_oper_box", bool(params.get("update_oper_box", True)))
    params.setdefault("update_depot", bool(params.get("update_depot", True)))


def _map_custom(params: dict[str, Any]) -> None:
    task_names = params.get("task_names", params.get("custom_tasks", []))
    params["task_names"] = _split_tags(task_names) if isinstance(task_names, str) else _normalize_string_list(task_names)
    if not params["task_names"]:
        raise TaskMappingError("Custom 任务未填写任务名（task_names），请在任务配置中填写至少一个任务名。")


def _normalize_stage_plan(params: dict[str, Any]) -> None:
    stage_plan = params.get("stage_plan")
    if not isinstance(stage_plan, list):
        return
    normalized = [_normalize_stage_str(str(stage)) for stage in stage_plan if stage is not None]
    params["stage_plan"] = normalized
    stage = _select_stage_from_plan(normalized)
    if stage or normalized[:1] == [""]:
        params["stage"] = stage


def _select_stage_from_plan(stage_plan: list[Any], weekday: int | None = None) -> str:
    candidates = [_normalize_stage_str(str(stage)) for stage in stage_plan if stage is not None]
    if not candidates:
        return ""
    current_weekday = datetime.now().weekday() if weekday is None else weekday
    for stage in candidates:
        if not stage or _is_stage_open(stage, current_weekday):
            return stage
    return candidates[0]


def _is_stage_open(stage: str, weekday: int) -> bool:
    open_days = STAGE_OPEN_WEEKDAYS.get(stage)
    return open_days is None or weekday in open_days


def _normalize_stage_str(stage: str) -> str:
    return STAGE_VALUE_ALIASES.get(stage, stage)


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


_drop_map_cache: dict[str, str] | None = None
_drop_map_mtime: float = 0.0
_drop_map_path: Path | None = None
_drop_map_lock = Lock()


def _drop_name_to_id_map() -> dict[str, str]:
    global _drop_map_cache, _drop_map_mtime, _drop_map_path
    path = resolve_maa_root() / "resource" / "item_index.json"
    try:
        current_mtime = path.stat().st_mtime
    except OSError:
        return _drop_map_cache or {}
    with _drop_map_lock:
        if _drop_map_cache is not None and current_mtime == _drop_map_mtime and path == _drop_map_path:
            return _drop_map_cache
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return _drop_map_cache or {}
        if not isinstance(data, dict):
            return _drop_map_cache or {}
        result: dict[str, str] = {}
        for item_id, item in data.items():
            if not str(item_id).isdigit() or str(item_id) in EXCLUDED_DROP_IDS:
                continue
            name = item.get("name") if isinstance(item, dict) else None
            if name:
                result[str(name)] = str(item_id)
        _drop_map_cache = result
        _drop_map_mtime = current_mtime
        _drop_map_path = path
        return result


def _build_drops(params: dict[str, Any]) -> dict[str, int]:
    if isinstance(params.get("drops"), dict):
        return {str(key): int(value) for key, value in params["drops"].items()}
    if not bool(params.get("use_drops", False)):
        return {}

    drop = params.get("drop", MALL_DROP_FALLBACK)
    drop_count = _int_or_default(params.get("drop_count", params.get("drop_quantity", 1)), 1)

    # Support list of drops
    if isinstance(drop, list):
        result: dict[str, int] = {}
        name_map = _drop_name_to_id_map()
        for item in drop:
            if isinstance(item, dict):
                name = str(item.get("name", ""))
                count = _int_or_default(item.get("count", item.get("quantity", 1)), 1)
            else:
                name = str(item)
                count = drop_count
            if name and name != MALL_DROP_FALLBACK:
                item_id = name_map.get(name, name if name.isdigit() else "")
                if item_id:
                    result[item_id] = count
        return result

    drop_name = str(drop or MALL_DROP_FALLBACK)
    if drop_name == MALL_DROP_FALLBACK:
        return {}

    item_id = _drop_name_to_id_map().get(drop_name, drop_name if drop_name.isdigit() else "")
    if not item_id:
        return {}
    return {item_id: drop_count}

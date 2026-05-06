from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .resource_paths import (
    CLIENT_OPTIONS,
    DEFAULT_CLIENT_TYPE,
    normalize_client_type,
    resolve_maa_root,
    resource_client_type,
)

PERMANENT_STAGES = [
    {"label": "当前/上次", "value": "CurrentStage"},
    {"label": "1-7", "value": "1-7"},
    {"label": "R8-11", "value": "R8-11"},
    {"label": "12-17-HARD", "value": "12-17-HARD"},
    {"label": "龙门币-6/5", "value": "CE-6"},
    {"label": "红票-5", "value": "AP-5"},
    {"label": "技能-5", "value": "CA-5"},
    {"label": "经验-6/5", "value": "LS-6"},
    {"label": "碳-5", "value": "SK-5"},
    {"label": "当期剿灭", "value": "Annihilation"},
    {"label": "切尔诺伯格", "value": "Chernobog@Annihilation"},
    {"label": "龙门外环", "value": "LungmenOutskirts@Annihilation"},
    {"label": "龙门市区", "value": "LungmenDowntown@Annihilation"},
    {"label": "奶/盾芯片", "value": "PR-A-1"},
    {"label": "奶/盾芯片组", "value": "PR-A-2"},
    {"label": "术/狙芯片", "value": "PR-B-1"},
    {"label": "术/狙芯片组", "value": "PR-B-2"},
    {"label": "先/辅芯片", "value": "PR-C-1"},
    {"label": "先/辅芯片组", "value": "PR-C-2"},
    {"label": "近/特芯片", "value": "PR-D-1"},
    {"label": "近/特芯片组", "value": "PR-D-2"},
]

EXCLUDED_DROP_IDS = {
    "3213", "3223", "3233", "3243",
    "3253", "3263", "3273", "3283",
    "7001", "7002", "7003", "7004",
    "4004", "4005",
    "3105", "3131", "3132", "3133",
    "6001",
    "3141", "4002",
    "32001",
    "30115", "30125", "30135", "30145", "30155", "30165",
}

ROGUELIKE_THEME_DIRS = {
    "傀影": "Phantom",
    "水月": "Mizuki",
    "萨米": "Sami",
    "萨卡兹": "Sarkaz",
    "界园": "JieGarden",
}

YJ_DAY_START_HOUR = 4
CLIENT_TIMEZONE_OFFSETS = {
    "Official": 8,
    "Bilibili": 8,
    "txwy": 8,
    "YoStarEN": -7,
    "YoStarJP": 9,
    "YoStarKR": 9,
}
TODAY_STAGE_TITLE = "今日关卡小提示:"
PERMANENT_STAGE_TIPS = [
    {"days": [1], "tip": "周一了，可以打剿灭了~"},
    {"days": [0], "tip": "周日了，记得打剿灭哦~"},
    {"days": [2, 4, 6, 0], "tip": "CE-6: 龙门币"},
    {"days": [1, 4, 6, 0], "tip": "AP-5: 红票"},
    {"days": [2, 3, 5, 0], "tip": "CA-5: 技能"},
    {"days": [], "tip": "LS-6: 经验"},
    {"days": [1, 3, 5, 6], "tip": "SK-5: 碳"},
    {"days": [1, 4, 5, 0], "tip": "PR-A-1/2: 奶&盾芯片"},
    {"days": [1, 2, 5, 6], "tip": "PR-B-1/2: 术&狙芯片"},
    {"days": [3, 4, 6, 0], "tip": "PR-C-1/2: 先&辅芯片"},
    {"days": [2, 3, 6, 0], "tip": "PR-D-1/2: 近&特芯片"},
]


def build_ui_options(
    source_dir: Path | None = None,
    *,
    adapter: Any | None = None,
    project_root: Path | None = None,
    now_utc: datetime | None = None,
) -> dict[str, Any]:
    source = source_dir or resolve_maa_root(adapter=adapter, project_root=project_root)
    by_client = {
        client["value"]: _build_client_options(source, client["value"], now_utc=now_utc)
        for client in CLIENT_OPTIONS
    }
    fallback = by_client[DEFAULT_CLIENT_TYPE]
    return {
        **fallback,
        "resource": {
            "root": str(source),
            "clients": [dict(client) for client in CLIENT_OPTIONS],
            "default_client": DEFAULT_CLIENT_TYPE,
        },
        "by_client": by_client,
    }


def _build_client_options(source: Path, client_type: str, *, now_utc: datetime | None = None) -> dict[str, Any]:
    resource_client = resource_client_type(client_type)
    return {
        "stages": _load_stage_options(source, resource_client),
        "stage_tips": _load_stage_tips(source, resource_client, now_utc=now_utc),
        "drops": _load_drop_options(source, resource_client),
        "copilot": {"files": _load_copilot_files(source)},
        "roguelike": {"operators": _load_roguelike_operators(source)},
        "infrast": {"custom_files": _load_custom_infrast_files(source)},
    }


def _load_drop_options(source: Path, client_type: str) -> list[dict[str, str]]:
    data = _read_json(_client_resource_dir(source, client_type) / "item_index.json")
    label_data = _read_json(source / "resource" / "item_index.json")
    if not isinstance(data, dict):
        return [{"label": "不选择", "value": ""}]
    if not isinstance(label_data, dict):
        label_data = data

    items: list[tuple[int, dict[str, str]]] = []
    for item_id, item in data.items():
        item_id = str(item_id)
        if not item_id.isdigit() or item_id in EXCLUDED_DROP_IDS:
            continue
        label_item = label_data.get(item_id)
        name = label_item.get("name") if isinstance(label_item, dict) else None
        if not name:
            name = item.get("name") if isinstance(item, dict) else None
        if name:
            items.append((int(item_id), {"label": str(name), "value": item_id}))

    drops = [item for _, item in sorted(items)]
    return [{"label": "不选择", "value": ""}, *_unique_options(drops)]


def _load_roguelike_operators(source: Path) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for theme, directory in ROGUELIKE_THEME_DIRS.items():
        data = _read_json(source / "resource" / "roguelike" / directory / "recruitment.json")
        names = _collect_start_operators(data)
        if names:
            result[theme] = ["", *_unique(names)]
    return result


def _collect_start_operators(value: Any) -> list[str]:
    if isinstance(value, dict):
        name = value.get("name")
        if value.get("is_start") is True and isinstance(name, str):
            return [name]
        names: list[str] = []
        for child in value.values():
            names.extend(_collect_start_operators(child))
        return names
    if isinstance(value, list):
        names: list[str] = []
        for child in value:
            names.extend(_collect_start_operators(child))
        return names
    return []


def _load_stage_options(source: Path, client_type: str) -> list[dict[str, str]]:
    return _unique_options([
        *[dict(stage) for stage in PERMANENT_STAGES],
        *_load_activity_stages(source, client_type),
    ])


def _load_activity_stages(source: Path, client_type: str) -> list[dict[str, str]]:
    data = _read_first_json(
        [
            source / "cache" / "gui" / "StageActivityV2.json",
            source / "resource" / "gui" / "StageActivityV2.json",
            source / "cache" / "StageActivityV2.json",
        ]
    )
    if not isinstance(data, dict):
        return []

    client_data = data.get(normalize_client_type(client_type))
    if not isinstance(client_data, dict):
        return []
    side_story = client_data.get("sideStoryStage")
    if not isinstance(side_story, dict):
        return []

    stages: list[dict[str, str]] = []
    for group in side_story.values():
        if not isinstance(group, dict) or not isinstance(group.get("Stages"), list):
            continue
        for stage in group["Stages"]:
            if not isinstance(stage, dict):
                continue
            value = stage.get("Value") or stage.get("Display")
            label = stage.get("Display") or value
            if value and label:
                stages.append({"label": str(label), "value": str(value)})
    return stages


def _load_stage_tips(source: Path, client_type: str, *, now_utc: datetime | None = None) -> dict[str, Any]:
    now = _aware_utc(now_utc)
    client = normalize_client_type(client_type)
    data = _read_stage_activity_data(source)
    client_data = data.get(client) if isinstance(data, dict) else None
    if not isinstance(client_data, dict):
        client_data = {}
    lines = _activity_tip_lines(source, client_data, now)
    lines.extend(_permanent_stage_tip_lines(_maa_day_of_week(client, now)))
    resource_line = _resource_collection_tip_line(client_data.get("resourceCollection"), now)
    if resource_line:
        lines.insert(0, resource_line)
    return {"title": TODAY_STAGE_TITLE, "lines": lines, "text": "\n".join([TODAY_STAGE_TITLE, *lines])}


def _read_stage_activity_data(source: Path) -> Any:
    return _read_first_json(
        [
            source / "cache" / "gui" / "StageActivityV2.json",
            source / "resource" / "gui" / "StageActivityV2.json",
            source / "cache" / "StageActivityV2.json",
        ]
    )


def _activity_tip_lines(source: Path, client_data: dict[str, Any], now: datetime) -> list[str]:
    side_story = client_data.get("sideStoryStage")
    if not isinstance(side_story, dict):
        return []
    item_names = _item_names(source)
    lines: list[str] = []
    shown_activities: set[str] = set()
    for group in side_story.values():
        if not isinstance(group, dict):
            continue
        activity = group.get("Activity")
        if not _activity_is_open(activity, now):
            continue
        stage_name = str(activity.get("StageName") or "") if isinstance(activity, dict) else ""
        expire_time = _parse_activity_time(activity, "UtcExpireTime") if isinstance(activity, dict) else None
        if stage_name and stage_name not in shown_activities:
            shown_activities.add(stage_name)
            lines.append(f"[{stage_name}] 剩余天数: {_days_left_text(expire_time, now)}")
        lines.extend(_activity_stage_drop_lines(group.get("Stages"), item_names))
    return lines


def _activity_stage_drop_lines(stages: Any, item_names: dict[str, str]) -> list[str]:
    if not isinstance(stages, list):
        return []
    lines: list[str] = []
    for stage in stages:
        if not isinstance(stage, dict):
            continue
        value = stage.get("Value") or stage.get("Display")
        drop = stage.get("Drop")
        if value and drop:
            lines.append(f"{value}: {item_names.get(str(drop), str(drop))}")
    return lines


def _resource_collection_tip_line(value: Any, now: datetime) -> str:
    if not _activity_is_open(value, now):
        return ""
    tip = str(value.get("Tip") or "资源收集") if isinstance(value, dict) else "资源收集"
    expire_time = _parse_activity_time(value, "UtcExpireTime") if isinstance(value, dict) else None
    return f"[{tip}] 剩余天数: {_days_left_text(expire_time, now)}"


def _permanent_stage_tip_lines(day_of_week: int) -> list[str]:
    return [
        str(item["tip"])
        for item in PERMANENT_STAGE_TIPS
        if not item["days"] or day_of_week in item["days"]
    ]


def _activity_is_open(value: Any, now: datetime) -> bool:
    if not isinstance(value, dict):
        return False
    start = _parse_activity_time(value, "UtcStartTime")
    expire = _parse_activity_time(value, "UtcExpireTime")
    return start is not None and expire is not None and now > start and now < expire


def _parse_activity_time(value: dict[str, Any], key: str) -> datetime | None:
    text = str(value.get(key) or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.strptime(text, "%Y/%m/%d %H:%M:%S")
    except ValueError:
        return None
    offset = int(value.get("TimeZone") or 0)
    return (parsed - timedelta(hours=offset)).replace(tzinfo=timezone.utc)


def _days_left_text(expire_time: datetime | None, now: datetime) -> str:
    if expire_time is None:
        return "不到 1 天"
    days_left = (expire_time - now).days
    return str(days_left) if days_left > 0 else "不到 1 天"


def _maa_day_of_week(client_type: str, now: datetime) -> int:
    offset = CLIENT_TIMEZONE_OFFSETS.get(normalize_client_type(client_type), 8)
    yj_time = now + timedelta(hours=offset - YJ_DAY_START_HOUR)
    return yj_time.isoweekday() % 7


def _aware_utc(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _item_names(source: Path) -> dict[str, str]:
    data = _read_json(source / "resource" / "item_index.json")
    if not isinstance(data, dict):
        return {}
    return {
        str(item_id): str(item.get("name"))
        for item_id, item in data.items()
        if isinstance(item, dict) and item.get("name")
    }


def _load_copilot_files(source: Path) -> list[dict[str, Any]]:
    root = source / "resource" / "copilot"
    if not root.exists():
        return []
    return _scan_copilot_dir(root, root)


def _load_custom_infrast_files(source: Path) -> list[dict[str, str]]:
    root = source / "resource" / "custom_infrast"
    if not root.exists():
        return []
    return [
        {"label": str(path.relative_to(root)), "value": str(path.relative_to(root))}
        for path in sorted(root.rglob("*.json"), key=lambda item: str(item).lower())
    ]


def _client_resource_dir(source: Path, client_type: str) -> Path:
    resource_client = resource_client_type(client_type)
    if resource_client != "Official":
        global_dir = source / "resource" / "global" / resource_client / "resource"
        if global_dir.exists():
            return global_dir
    return source / "resource"


def _scan_copilot_dir(directory: Path, root: Path) -> list[dict[str, Any]]:
    files = [
        _copilot_file_item(path, root)
        for path in sorted(directory.glob("*.json"), key=lambda item: item.name.lower())
    ]
    folders: list[dict[str, Any]] = []
    old_folder: dict[str, Any] | None = None
    for child in sorted((item for item in directory.iterdir() if item.is_dir()), key=lambda item: item.name.lower()):
        item = _copilot_folder_item(child, root)
        if item is None:
            continue
        if child.name.lower() == "old":
            old_folder = item
        else:
            folders.append(item)
    if old_folder is not None:
        folders.append(old_folder)
    return [*files, *folders]


def _copilot_file_item(path: Path, root: Path) -> dict[str, Any]:
    return {
        "name": path.name,
        "path": str(path),
        "relative_path": str(path.relative_to(root)),
        "is_folder": False,
        "children": [],
    }


def _copilot_folder_item(path: Path, root: Path) -> dict[str, Any] | None:
    children = _scan_copilot_dir(path, root)
    if not children:
        return None
    return {
        "name": path.name,
        "path": str(path),
        "relative_path": str(path.relative_to(root)),
        "is_folder": True,
        "children": children,
    }


def _read_first_json(paths: list[Path]) -> Any:
    for path in paths:
        data = _read_json(path)
        if data is not None:
            return data
    return None


def _read_json(path: Path) -> Any:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return None


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _unique_options(values: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[str] = set()
    result: list[dict[str, str]] = []
    for item in values:
        value = item.get("value", "")
        if value in seen:
            continue
        seen.add(value)
        result.append(item)
    return result

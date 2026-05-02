from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


DEFAULT_MAA_SOURCE_DIR = Path(
    os.environ.get("MAA_SOURCE_DIR", r"E:\Project\C\MaaAssistantArknights")
)

PERMANENT_STAGES = [
    "当前/上次",
    "1-7",
    "R8-11",
    "12-17-HARD",
    "CE-6",
    "AP-5",
    "CA-5",
    "LS-6",
    "SK-5",
    "Annihilation",
    "PR-A-1",
    "PR-A-2",
    "PR-B-1",
    "PR-B-2",
    "PR-C-1",
    "PR-C-2",
    "PR-D-1",
    "PR-D-2",
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


def build_ui_options(source_dir: Path | None = None) -> dict[str, Any]:
    source = source_dir or DEFAULT_MAA_SOURCE_DIR
    return {
        "stages": _unique([*PERMANENT_STAGES, *_load_activity_stages(source)]),
        "drops": _load_drop_names(source),
        "copilot": {"files": _load_copilot_files(source)},
        "roguelike": {"operators": _load_roguelike_operators(source)},
    }


def _load_drop_names(source: Path) -> list[str]:
    data = _read_json(source / "resource" / "item_index.json")
    if not isinstance(data, dict):
        return []

    items: list[tuple[int, str]] = []
    for item_id, item in data.items():
        if not item_id.isdigit() or item_id in EXCLUDED_DROP_IDS:
            continue
        name = item.get("name") if isinstance(item, dict) else None
        if name:
            items.append((int(item_id), str(name)))

    names = [name for _, name in sorted(items)]
    return _unique(["不选择", *names])


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


def _load_activity_stages(source: Path) -> list[str]:
    data = _read_first_json(
        [
            source / "resource" / "gui" / "StageActivityV2.json",
            source / "cache" / "StageActivityV2.json",
        ]
    )
    if not isinstance(data, dict):
        return []

    stages: list[str] = []
    for client_data in data.values():
        if not isinstance(client_data, dict):
            continue
        side_story = client_data.get("sideStoryStage")
        if not isinstance(side_story, dict):
            continue
        for group in side_story.values():
            if not isinstance(group, dict) or not isinstance(group.get("Stages"), list):
                continue
            for stage in group["Stages"]:
                if isinstance(stage, dict):
                    value = stage.get("Value") or stage.get("Display")
                    if value:
                        stages.append(str(value))
    return stages


def _load_copilot_files(source: Path) -> list[dict[str, Any]]:
    root = source / "resource" / "copilot"
    if not root.exists():
        return []
    return _scan_copilot_dir(root, root)


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

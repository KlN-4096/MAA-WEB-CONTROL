from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


MAA_API_BASE = "https://api.maa.plus/MaaAssistantArknights/api"
MIRROR_CHYAN_CORE = "https://mirrorchyan.com/api/resources/MAA/latest"
MIRROR_CHYAN_RESOURCE = "https://mirrorchyan.com/api/resources/MaaResource/latest"
GITHUB_RESOURCE_ZIP = "https://github.com/MaaAssistantArknights/MaaResource/archive/refs/heads/main.zip"
MIRROR_USER_AGENT = "MaaWpfGui"
MIRROR_SP_ID = "maa-web-control"
FULL_PACKAGE_KEEP = {"cache", "config", "data", "debug", "MAA.Updater.exe"}


def semver_less(current: str, latest: str) -> bool:
    return semver_key(current) < semver_key(latest)


def semver_key(value: str) -> tuple[tuple[int, int, int, int], int, str]:
    text = value.lower().strip().lstrip("v").lstrip(".")
    main, _, pre = text.partition("-")
    nums = [int(part) if part.isdigit() else 0 for part in main.split(".")[:4]]
    nums += [0] * (4 - len(nums))
    return (tuple(nums), 1 if not pre else 0, pre)


def mirror_time(timestamp: int) -> str:
    if timestamp <= 0:
        return "1970-01-01+00:00:00.000"
    return datetime.fromtimestamp(timestamp, timezone.utc).strftime("%Y-%m-%d+%H:%M:%S.000")


def parse_mirror_time(value: str) -> int:
    try:
        return int(datetime.strptime(value, "%Y-%m-%d %H:%M:%S.%f").replace(tzinfo=timezone.utc).timestamp())
    except ValueError:
        return 0


def select_windows_asset(assets: Any, current: str, latest: str) -> dict[str, Any]:
    if not isinstance(assets, list):
        return {}
    arch = "arm64" if "arm" in platform.machine().lower() else "x64"
    current_lower = current.lower()
    latest_lower = latest.lower()
    full: dict[str, Any] = {}
    for asset in assets:
        name = str(asset.get("name", "")).lower() if isinstance(asset, dict) else ""
        if "win" not in name or arch not in name:
            continue
        if "ota" in name and f"{current_lower}_{latest_lower}" in name:
            return asset
        if f"maa-{latest_lower}-" in name:
            full = asset
    return full


def clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def merge_dir(source: Path, target: Path) -> None:
    for item in source.rglob("*"):
        if item.name == ".gitignore":
            continue
        relative = item.relative_to(source)
        destination = target / relative
        if item.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, destination)


def extract_zip(zip_path: Path, extract_dir: Path) -> None:
    clean_dir(extract_dir)
    with zipfile.ZipFile(zip_path) as package:
        package.extractall(extract_dir)


def github_resource_root(extract_dir: Path) -> Path:
    source = extract_dir / "MaaResource-main" / "resource"
    if not source.is_dir():
        raise RuntimeError("资源更新包格式不正确：缺少 resource 目录")
    return source


def mirror_resource_root(extract_dir: Path) -> Path:
    return extract_dir


def start_updater(core_dir: Path, package_path: Path, package_name: str, *, show_console: bool) -> dict[str, Any]:
    updater = core_dir / "MAA.Updater.exe"
    if not updater.exists():
        return {"updater_started": False, "message": "缺少 MAA.Updater.exe，无法自动安装"}

    extract_dir = core_dir / f"maa-update-extract-{uuid4().hex}"
    extract_zip(package_path, extract_dir)
    payload_root = payload_root_from_extract(extract_dir)
    plan_path = core_dir / f"maa-pending-update-{uuid4().hex}.json"
    plan_path.write_text(
        json.dumps(update_plan(core_dir, payload_root, package_name), ensure_ascii=False),
        encoding="utf-8",
    )
    backup_dir = core_dir / f"backup-{datetime.now():%Y%m%d%H%M%S}"
    args = [
        str(os.getpid()),
        str(core_dir),
        str(payload_root),
        str(backup_dir),
        str(package_path),
        str(core_dir / "pending-update-success.txt"),
        str(core_dir / "pending-update-failure.txt"),
        str(core_dir / "MAA.exe"),
        str(plan_path),
    ]
    if show_console:
        args.append("--show-console")
    subprocess.Popen([str(updater), *args], cwd=str(core_dir))
    return {"updater_started": True, "message": "核心更新器已启动；退出当前 Web 服务后会应用更新"}


def payload_root_from_extract(extract_dir: Path) -> Path:
    entries = [entry for entry in extract_dir.iterdir()]
    if len(entries) == 1 and entries[0].is_dir() and (entries[0] / "MAA.exe").exists():
        return entries[0]
    return extract_dir


def update_plan(core_dir: Path, payload_root: Path, package_name: str) -> dict[str, Any]:
    if package_name.lower().startswith("maacomponent-ota-"):
        return {
            "packageType": "ota",
            "removeList": ota_remove_list(payload_root),
            "moveList": payload_files(payload_root),
        }
    remove = [entry.name for entry in core_dir.iterdir() if entry.name not in FULL_PACKAGE_KEEP]
    move = [entry.name for entry in payload_root.iterdir() if entry.name not in FULL_PACKAGE_KEEP]
    return {"packageType": "full", "removeList": remove, "moveList": move}


def ota_remove_list(payload_root: Path) -> list[str]:
    values: list[str] = []
    remove_file = payload_root / "removelist.txt"
    if remove_file.exists():
        values.extend(line.strip() for line in remove_file.read_text(encoding="utf-8").splitlines())
    changes = payload_root / "changes.json"
    if changes.exists():
        data = json.loads(changes.read_text(encoding="utf-8"))
        values.extend(data.get("deleted", []) if isinstance(data, dict) else [])
    return [value for value in values if value and not value.endswith(("/", "\\"))]


def payload_files(payload_root: Path) -> list[str]:
    return [
        str(path.relative_to(payload_root)).replace("/", "\\")
        for path in payload_root.rglob("*")
        if path.is_file() and path.name.lower() not in {"removelist.txt", "changes.json"}
    ]

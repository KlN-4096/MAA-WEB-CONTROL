from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import tarfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


MAA_API_BASE = "https://api.maa.plus/MaaAssistantArknights/api"
MAA_API_FALLBACK_BASE = "https://api2.maa.plus/MaaAssistantArknights/api"
MIRROR_CHYAN_CORE = "https://mirrorchyan.com/api/resources/MAA/latest"
MIRROR_CHYAN_RESOURCE = "https://mirrorchyan.com/api/resources/MaaResource/latest"
GITHUB_RESOURCE_ZIP = "https://github.com/MaaAssistantArknights/MaaResource/archive/refs/heads/main.zip"
GUI_STAGE_ACTIVITY_API = "gui/StageActivityV2.json"
GUI_STAGE_ACTIVITY_URLS = (
    f"{MAA_API_BASE}/{GUI_STAGE_ACTIVITY_API}",
    f"{MAA_API_FALLBACK_BASE}/{GUI_STAGE_ACTIVITY_API}",
)
MIRROR_USER_AGENT = "MaaWpfGui"
MIRROR_SP_ID = "maa-web-control"
FULL_PACKAGE_KEEP = {"cache", "config", "data", "debug", "MAA.Updater.exe"}
MAA_CLI_UPDATE_TIMEOUT_SECONDS = 1800
PROCESS_OUTPUT_LIMIT = 4000


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


def select_platform_asset(assets: Any, current: str, latest: str) -> dict[str, Any]:
    return _select_matching_asset(assets, current, latest, package_os_tokens(), package_arch_tokens())


def select_windows_asset(assets: Any, current: str, latest: str) -> dict[str, Any]:
    return _select_matching_asset(assets, current, latest, ("win", "windows"), package_arch_tokens())


def _select_matching_asset(
    assets: Any,
    current: str,
    latest: str,
    os_tokens: tuple[str, ...],
    arch_tokens: tuple[str, ...],
) -> dict[str, Any]:
    if not isinstance(assets, list):
        return {}
    current_lower = current.lower()
    latest_lower = latest.lower()
    full: dict[str, Any] = {}
    for asset in assets:
        name = str(asset.get("name", "")).lower() if isinstance(asset, dict) else ""
        if not any(token in name for token in os_tokens):
            continue
        if not any(token in name for token in arch_tokens):
            continue
        if "ota" in name and f"{current_lower}_{latest_lower}" in name:
            return asset
        if f"maa-{latest_lower}-" in name:
            full = asset
    return full


def package_os() -> str:
    system = platform.system().lower()
    if system == "windows":
        return "win"
    if system == "darwin":
        return "macos"
    if system == "linux":
        return "linux"
    return system or "unknown"


def package_arch() -> str:
    machine = platform.machine().lower()
    if machine in {"x86_64", "amd64"}:
        return "x64"
    if machine in {"aarch64", "arm64"}:
        return "arm64"
    return machine or "x64"


def package_os_tokens() -> tuple[str, ...]:
    os_name = package_os()
    if os_name == "win":
        return ("win", "windows")
    if os_name == "macos":
        return ("macos", "darwin", "osx")
    return (os_name,)


def package_arch_tokens() -> tuple[str, ...]:
    arch = package_arch()
    if arch == "x64":
        return ("x64", "x86_64", "amd64")
    if arch == "arm64":
        return ("arm64", "aarch64")
    return (arch,)


def run_maa_cli_update(core_dir: Path, channel: str) -> dict[str, Any]:
    response = _run_maa_cli(core_dir, ["update", "--batch", "-t", "0", channel], "maa-cli 更新完成")
    if _needs_force_install(response):
        forced = _run_maa_cli(core_dir, ["install", "--force", "--batch", "-t", "0", channel], "maa-cli 强制安装完成")
        forced["fallback_from_update"] = response
        return _with_synced_maa_cli_install(core_dir, forced)
    return _with_synced_maa_cli_install(core_dir, response) if response.get("ok") else response


def _with_synced_maa_cli_install(core_dir: Path, response: dict[str, Any]) -> dict[str, Any]:
    sync = sync_maa_cli_install(core_dir)
    response["sync"] = sync
    if not sync.get("ok"):
        return {**response, "ok": False, "message": sync["message"]}
    return response


def _run_maa_cli(core_dir: Path, args: list[str], success_message: str) -> dict[str, Any]:
    maa_cli = core_dir / ("maa.exe" if platform.system() == "Windows" else "maa")
    command = [str(maa_cli), *args]
    try:
        result = subprocess.run(
            command,
            cwd=str(core_dir),
            capture_output=True,
            text=True,
            timeout=MAA_CLI_UPDATE_TIMEOUT_SECONDS,
            check=False,
        )
    except FileNotFoundError:
        return {"ok": False, "message": f"未找到 maa-cli：{maa_cli}", "command": command}
    except subprocess.TimeoutExpired as exc:
        output = _process_output(exc.stdout, exc.stderr)
        return {"ok": False, "message": "maa-cli 更新超时", "command": command, "output": output}
    output = _process_output(result.stdout, result.stderr)
    return {
        "ok": result.returncode == 0,
        "message": success_message if result.returncode == 0 else "maa-cli 更新失败",
        "command": command,
        "returncode": result.returncode,
        "output": output,
    }


def _needs_force_install(response: dict[str, Any]) -> bool:
    output = str(response.get("output") or "")
    return not response.get("ok") and "not installed by maa" in output


def sync_maa_cli_install(core_dir: Path) -> dict[str, Any]:
    library_dir = _maa_cli_dir(core_dir, "library")
    resource_dir = _maa_cli_dir(core_dir, "resource")
    if library_dir is None or resource_dir is None:
        return {"ok": False, "message": "maa-cli 更新完成，但无法读取安装目录"}
    if not (library_dir / "libMaaCore.so").exists():
        return {"ok": False, "message": f"maa-cli library 目录缺少 libMaaCore.so：{library_dir}"}
    if library_dir.resolve() != core_dir.resolve():
        merge_dir(library_dir, core_dir)
    target_resource = core_dir / "resource"
    if resource_dir.is_dir() and resource_dir.resolve() != target_resource.resolve():
        merge_dir(resource_dir, core_dir / "resource")
    return {
        "ok": True,
        "message": "maa-cli 安装产物已同步到 MaaCore 目录",
        "library_dir": str(library_dir),
        "resource_dir": str(resource_dir),
    }


def _maa_cli_dir(core_dir: Path, name: str) -> Path | None:
    maa_cli = core_dir / ("maa.exe" if platform.system() == "Windows" else "maa")
    try:
        result = subprocess.run(
            [str(maa_cli), "dir", name],
            cwd=str(core_dir),
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    value = result.stdout.strip()
    return Path(value) if value else None


def _process_output(stdout: Any, stderr: Any) -> str:
    text = "\n".join(str(part or "").strip() for part in (stdout, stderr) if part)
    if len(text) <= PROCESS_OUTPUT_LIMIT:
        return text
    return text[-PROCESS_OUTPUT_LIMIT:]


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


def extract_archive(package_path: Path, extract_dir: Path) -> None:
    clean_dir(extract_dir)
    name = package_path.name.lower()
    if name.endswith(".zip"):
        extract_zip(package_path, extract_dir)
        return
    if name.endswith((".tar.gz", ".tgz")):
        with tarfile.open(package_path) as package:
            package.extractall(extract_dir, filter="data")
        return
    raise RuntimeError(f"不支持的核心更新包格式：{package_path.name}")


def full_package_root(extract_dir: Path) -> Path:
    if _looks_like_full_package_root(extract_dir):
        return extract_dir
    entries = [entry for entry in extract_dir.iterdir()]
    if len(entries) == 1 and entries[0].is_dir() and _looks_like_full_package_root(entries[0]):
        return entries[0]
    raise RuntimeError("核心更新包格式不正确：缺少 MaaCore 文件")


def install_full_package(payload_root: Path, core_dir: Path) -> None:
    core_dir.mkdir(parents=True, exist_ok=True)
    for item in payload_root.iterdir():
        if item.name in FULL_PACKAGE_KEEP:
            continue
        destination = core_dir / item.name
        if destination.is_dir():
            shutil.rmtree(destination)
        elif destination.exists():
            destination.unlink()
        if item.is_dir():
            shutil.copytree(item, destination)
        else:
            shutil.copy2(item, destination)


def _looks_like_full_package_root(path: Path) -> bool:
    return any((path / name).exists() for name in ("libMaaCore.so", "MaaCore.dll", "libMaaCore.dylib"))


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

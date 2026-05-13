from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .resource_paths import DEFAULT_CLIENT_TYPE, normalize_client_type, resolve_maa_root
from .runner import MaaRunnerService
from .version import WEB_VERSION


MISSING_VERSION = "—"
DEFAULT_RESOURCE_CLIENTS = {"Official", "Bilibili"}
RESOURCE_TIME_FORMAT = "%Y-%m-%d %H:%M:%S.%f"


def get_maa_version_info(
    runner: MaaRunnerService,
    *,
    project_root: Path | None = None,
    client_type: str = DEFAULT_CLIENT_TYPE,
) -> dict[str, Any]:
    adapter = runner.adapter
    core_version = read_core_version(adapter)
    resource = read_resource_version(
        resolve_maa_root(adapter=adapter, project_root=project_root),
        client_type,
    )
    return {
        "web_version": WEB_VERSION,
        "core_version": core_version,
        "maa_version": core_version,
        "resource_version": resource["version"],
        "resource_time": resource["time"],
        "resource_timestamp": resource["timestamp"],
        "client_type": normalize_client_type(client_type),
    }


def read_core_version(adapter: Any) -> str:
    asst_cls = _resolve_asst_cls(adapter)
    if asst_cls is None:
        return MISSING_VERSION
    version = _call_get_version(asst_cls)
    if version:
        return version
    _load_core(adapter, asst_cls)
    return _call_get_version(asst_cls) or MISSING_VERSION


def read_resource_version(core_dir: Path, client_type: str) -> dict[str, Any]:
    client = normalize_client_type(client_type)
    default_path = core_dir / "resource" / "version.json"
    version_path = default_path if client in DEFAULT_RESOURCE_CLIENTS else (
        core_dir / "resource" / "global" / client / "resource" / "version.json"
    )
    if not default_path.exists() or not version_path.exists():
        return _resource_payload(MISSING_VERSION, None)
    try:
        version_json = _load_json(version_path)
        default_json = version_json if version_path == default_path else _load_json(default_path)
    except (OSError, json.JSONDecodeError):
        return _resource_payload(MISSING_VERSION, None)
    version_name = _resource_display_name(version_json)
    last_updated = default_json.get("last_updated")
    return _resource_payload(version_name or MISSING_VERSION, _parse_resource_time(last_updated))


def _resolve_asst_cls(adapter: Any) -> type[Any] | None:
    asst_cls = getattr(adapter, "_asst_cls", None)
    if asst_cls is not None:
        return asst_cls
    resolve = getattr(adapter, "_resolve_asst_cls", None)
    if not callable(resolve):
        return None
    try:
        return resolve()
    except Exception:
        return None


def _call_get_version(asst_cls: type[Any]) -> str:
    get_version = getattr(asst_cls, "get_version", None)
    if not callable(get_version):
        return ""
    for args in ((), (None,)):
        try:
            value = get_version(*args)
        except Exception:
            continue
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _load_core(adapter: Any, asst_cls: type[Any]) -> None:
    load = getattr(asst_cls, "load", None)
    core_dir = getattr(adapter, "_core_dir", None)
    if not callable(load) or core_dir is None:
        return
    try:
        load(Path(core_dir), user_dir=getattr(adapter, "_user_dir", None))
    except Exception:
        return


def _load_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def _resource_display_name(data: dict[str, Any]) -> str:
    now = int(datetime.now(timezone.utc).timestamp())
    gacha = data.get("gacha") if isinstance(data.get("gacha"), dict) else {}
    activity = data.get("activity") if isinstance(data.get("activity"), dict) else {}
    pool_time = _int_or_zero(gacha.get("time"))
    activity_time = _int_or_zero(activity.get("time"))
    if now < pool_time and now < activity_time:
        return ""
    if now >= pool_time and now < activity_time:
        return str(gacha.get("pool") or "")
    if now < pool_time and now >= activity_time:
        return str(activity.get("name") or "")
    if pool_time > activity_time:
        return str(gacha.get("pool") or "")
    return str(activity.get("name") or "")


def _parse_resource_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.strptime(value.strip(), RESOURCE_TIME_FORMAT).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _resource_payload(version: str, dt: datetime | None) -> dict[str, Any]:
    return {
        "version": version,
        "time": dt.astimezone().strftime("%Y-%m-%d %H:%M:%S") if dt else "",
        "timestamp": int(dt.timestamp()) if dt else 0,
    }


def _int_or_zero(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0

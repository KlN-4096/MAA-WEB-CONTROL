from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Mapping


FALLBACK_MAA_SOURCE_DIR = Path(r"E:\Project\C\MaaAssistantArknights")
DEFAULT_MAA_SOURCE_DIR = Path(os.environ.get("MAA_SOURCE_DIR", str(FALLBACK_MAA_SOURCE_DIR)))
DEFAULT_CLIENT_TYPE = "Official"

CLIENT_OPTIONS = [
    {"label": "官服", "value": "Official"},
    {"label": "Bilibili服", "value": "Bilibili"},
    {"label": "国际服 (YostarEN)", "value": "YoStarEN"},
    {"label": "日服 (YostarJP)", "value": "YoStarJP"},
    {"label": "韩服 (YostarKR)", "value": "YoStarKR"},
    {"label": "繁中服 (txwy)", "value": "txwy"},
]

CLIENT_TYPE_ALIASES = {
    "": DEFAULT_CLIENT_TYPE,
    "官服": "Official",
    "Bilibili": "Bilibili",
    "B服": "Bilibili",
    "Bilibili服": "Bilibili",
    "国际服 (YostarEN)": "YoStarEN",
    "日服 (YostarJP)": "YoStarJP",
    "韩服 (YostarKR)": "YoStarKR",
    "繁中服 (txwy)": "txwy",
}


def normalize_client_type(value: Any) -> str:
    text = str(value or DEFAULT_CLIENT_TYPE)
    return CLIENT_TYPE_ALIASES.get(text, text)


def resource_client_type(value: Any) -> str:
    client_type = normalize_client_type(value)
    return "Official" if client_type == "Bilibili" else client_type


def resolve_maa_root(
    adapter: Any | None = None,
    project_root: Path | None = None,
    env: Mapping[str, str] | None = None,
) -> Path:
    adapter_root = getattr(adapter, "_core_dir", None)
    if adapter_root:
        return Path(adapter_root)

    configured_root = _configured_core_dir(project_root)
    if configured_root is not None:
        return configured_root

    source_env = os.environ if env is None else env
    for key in ("MAA_CORE_DIR", "MAA_SOURCE_DIR"):
        value = source_env.get(key, "").strip()
        if value:
            return Path(value)
    return DEFAULT_MAA_SOURCE_DIR


def resource_incremental_roots(core_dir: Path, client_type: Any) -> list[Path]:
    roots: list[Path] = []
    cache_root = core_dir / "cache"
    if _has_resource_dir(cache_root):
        roots.append(cache_root)

    resource_client = resource_client_type(client_type)
    if resource_client not in {"Official", "Bilibili"}:
        global_root = core_dir / "resource" / "global" / resource_client
        global_cache_root = core_dir / "cache" / "resource" / "global" / resource_client
        if _has_resource_dir(global_root):
            roots.append(global_root)
        if _has_resource_dir(global_cache_root):
            roots.append(global_cache_root)
    return roots


def _configured_core_dir(project_root: Path | None) -> Path | None:
    root = project_root or Path(__file__).resolve().parents[1]
    config_file = root / "data" / "adapter.json"
    if not config_file.exists():
        return None
    try:
        data = json.loads(config_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    value = str(data.get("core_dir", "")).strip() if isinstance(data, dict) else ""
    return Path(value) if value else None


def _has_resource_dir(path: Path) -> bool:
    return (path / "resource").is_dir()

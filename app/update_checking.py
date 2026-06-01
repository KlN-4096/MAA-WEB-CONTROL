from __future__ import annotations

import urllib.parse
from collections.abc import Callable
from typing import Any

from .maa_versions import MISSING_VERSION
from .models import UpdateConfig
from .update_helpers import (
    MAA_API_BASE,
    MIRROR_CHYAN_CORE,
    MIRROR_CHYAN_RESOURCE,
    MIRROR_SP_ID,
    MIRROR_USER_AGENT,
    mirror_time,
    package_arch,
    package_os,
    parse_mirror_time,
    select_platform_asset,
    semver_less,
)


class UpdateChecker:
    def __init__(self, config: UpdateConfig, fetch_json: Callable[[str], dict[str, Any]]) -> None:
        self._config = config
        self._fetch_json = fetch_json

    def check_core(self, current_version: str) -> dict[str, Any]:
        if current_version == MISSING_VERSION:
            return {"has_update": False, "current": current_version, "message": "核心版本不可用"}
        if self._config.update_source == "MirrorChyan":
            mirror = self._check_core_mirror(current_version)
            if mirror.get("source") == "MirrorChyan" and not mirror.get("fallback"):
                return mirror
        return self._check_core_maa_api(current_version)

    def check_resource(self, versions: dict[str, Any]) -> dict[str, Any]:
        timestamp = int(versions.get("resource_timestamp") or 0)
        data = self._fetch_json(mirror_resource_url(timestamp, self._config))
        body = data.get("data", {}) if isinstance(data.get("data"), dict) else {}
        latest = str(body.get("version_name") or "")
        latest_ts = parse_mirror_time(latest)
        has_update = bool(latest_ts and timestamp and timestamp < latest_ts)
        note = str(body.get("release_note") or "")
        return {
            "source": "MirrorChyan",
            "has_update": has_update,
            "current": versions.get("resource_time", ""),
            "current_version": versions.get("resource_version", MISSING_VERSION),
            "latest": latest,
            "release_note": note,
            "url": str(body.get("url") or ""),
            "requires_cdk": has_update and not bool(self._config.mirror_chyan_cdk.strip()),
            "message": f"发现新资源版本: {note or latest}" if has_update else "资源已是最新",
        }

    def _check_core_mirror(self, current_version: str) -> dict[str, Any]:
        data = self._fetch_json(mirror_core_url(current_version, self._config))
        body = data.get("data", {}) if isinstance(data.get("data"), dict) else {}
        latest = str(body.get("version_name") or "")
        if int(data.get("code") or -1) != 0 or not latest:
            return {"source": "MirrorChyan", "fallback": True}
        has_update = semver_less(current_version, latest)
        url = str(body.get("url") or "")
        return {
            "source": "MirrorChyan",
            "has_update": has_update,
            "current": current_version,
            "latest": latest,
            "url": "https://mirrorchyan.com/",
            "body": str(body.get("release_note") or ""),
            "asset": {"name": f"MirrorChyanApp{latest}.zip", "browser_download_url": url} if url else {},
            "message": f"发现新核心版本: {latest}" if has_update else "核心已是最新",
            "requires_cdk": has_update and not bool(self._config.mirror_chyan_cdk.strip()),
        }

    def _check_core_maa_api(self, current_version: str) -> dict[str, Any]:
        detail = self._fetch_json(f"{MAA_API_BASE}/version/{self._config.update_channel}.json")
        latest = str(detail.get("version") or "")
        has_update = bool(latest) and semver_less(current_version, latest)
        details = detail.get("details", {}) if isinstance(detail.get("details"), dict) else {}
        asset = select_platform_asset(details.get("assets", []), current_version, latest)
        if asset and not self._config.force_github_global_source:
            asset = _prefer_mirror_asset(asset)
        return {
            "source": "MaaApi",
            "has_update": has_update,
            "current": current_version,
            "latest": latest,
            "url": details.get("html_url", ""),
            "body": details.get("body", ""),
            "asset": asset,
            "message": f"发现新核心版本: {latest}" if has_update else "核心已是最新",
        }


def mirror_core_url(current_version: str, config: UpdateConfig) -> str:
    params = {
        "current_version": current_version,
        "cdk": config.mirror_chyan_cdk.strip(),
        "user_agent": MIRROR_USER_AGENT,
        "os": package_os(),
        "arch": package_arch(),
        "channel": config.update_channel,
        "sp_id": MIRROR_SP_ID,
    }
    return f"{MIRROR_CHYAN_CORE}?{urllib.parse.urlencode(params)}"


def mirror_resource_url(timestamp: int, config: UpdateConfig) -> str:
    params = {
        "current_version": mirror_time(timestamp),
        "cdk": config.mirror_chyan_cdk.strip(),
        "user_agent": MIRROR_USER_AGENT,
        "sp_id": MIRROR_SP_ID,
    }
    return f"{MIRROR_CHYAN_RESOURCE}?{urllib.parse.urlencode(params)}"


def _prefer_mirror_asset(asset: dict[str, Any]) -> dict[str, Any]:
    mirrors = asset.get("mirrors")
    if isinstance(mirrors, list):
        first = next((str(url) for url in mirrors if url), "")
        if first:
            return {**asset, "browser_download_url": first, "github_download_url": asset.get("browser_download_url", "")}
    return asset

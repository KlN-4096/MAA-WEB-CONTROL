from __future__ import annotations

import asyncio
import json
import os
import platform
import shutil
import urllib.request
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from .events import EventBus
from .maa_versions import get_maa_version_info
from .models import AdbConfig, EventRecord, Profile, UpdateConfig
from .resource_paths import DEFAULT_CLIENT_TYPE, resolve_maa_root
from .runner import MaaRunnerService
from .update_checking import UpdateChecker
from .update_helpers import (
    GITHUB_RESOURCE_ZIP,
    GUI_STAGE_ACTIVITY_URLS,
    MIRROR_USER_AGENT,
    extract_archive,
    extract_zip,
    full_package_root,
    github_resource_root,
    install_full_package,
    merge_dir,
    mirror_resource_root,
    run_maa_cli_update,
    start_updater,
)


CHECK_INTERVAL_SECONDS = 30
CORE_UPDATE_BUSY_STATES = {"Connecting", "AppendingTasks", "Running", "Stopping"}
YJ_CLIENT_TIMEZONE = {"Official": 8, "Bilibili": 8, "txwy": 8, "YoStarEN": -7, "YoStarJP": 9, "YoStarKR": 9}


class UpdateService:
    def __init__(
        self,
        config_path: Path,
        cache_dir: Path,
        runner: MaaRunnerService,
        events: EventBus,
        restart_callback: Callable[[], None] | None = None,
    ) -> None:
        self._config_path = config_path
        self._cache_dir = cache_dir
        self._runner = runner
        self._events = events
        self._restart_callback = restart_callback
        self._config = UpdateConfig()
        self._task: asyncio.Task[None] | None = None
        self._checking = False
        self._last_yj_key = ""
        self._last_result: dict[str, Any] = {}
        self.load_config()

    @property
    def config(self) -> UpdateConfig:
        return self._config.model_copy(deep=True)

    @property
    def state(self) -> dict[str, Any]:
        return dict(self._last_result)

    def update_config(self, config: UpdateConfig) -> UpdateConfig:
        self._config = config.model_copy(deep=True)
        self._save_config()
        self._events.publish(EventRecord.now("update.config.updated", "Update config updated."))
        return self.config

    def version_info(self, client_type: str = DEFAULT_CLIENT_TYPE) -> dict[str, Any]:
        info = get_maa_version_info(self._runner, project_root=self._project_root, client_type=client_type)
        info["update"] = self.state
        return info

    def load_config(self) -> None:
        if not self._config_path.exists():
            return
        try:
            self._config = UpdateConfig.model_validate_json(self._config_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._tick_loop())
        if self._config.startup_update_check:
            asyncio.create_task(self.check_and_auto_update(self._current_client_type(), reason="startup"))

    async def stop(self) -> None:
        task = self._task
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._task = None

    async def check_updates(self, client_type: str = DEFAULT_CLIENT_TYPE) -> dict[str, Any]:
        if self._checking:
            return {**self.state, "checking": True}
        self._checking = True
        try:
            result = await asyncio.to_thread(self._check_updates_sync, client_type)
            self._last_result = result
            self._publish_result(result)
            return result
        finally:
            self._checking = False

    async def check_and_auto_update(self, client_type: str, *, reason: str = "manual") -> dict[str, Any]:
        result = await self.check_updates(client_type)
        if result.get("core", {}).get("has_update") and self._config.auto_download_update_package:
            result["core_action"] = await self.update_core(client_type, checked=result, manual=False)
        if self._should_auto_update_resource(result):
            result["resource_action"] = await self.update_resource(client_type, checked=result)
        result["reason"] = reason
        self._last_result = result
        return result

    async def update_resource(
        self,
        client_type: str = DEFAULT_CLIENT_TYPE,
        *,
        checked: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        result = await asyncio.to_thread(self._update_resource_sync, client_type, checked)
        refreshed = await self.check_updates(client_type)
        self._last_result = {**refreshed, "resource_action": result}
        return result

    async def update_core(
        self,
        client_type: str = DEFAULT_CLIENT_TYPE,
        *,
        checked: dict[str, Any] | None = None,
        manual: bool = True,
    ) -> dict[str, Any]:
        result = await asyncio.to_thread(self._update_core_sync, client_type, checked, manual)
        self._last_result = {**self.state, "core_action": result}
        return result

    @property
    def _project_root(self) -> Path:
        return self._config_path.parents[1]

    def _save_config(self) -> None:
        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        self._config_path.write_text(
            json.dumps(self._config.model_dump(mode="json"), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    async def _tick_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(CHECK_INTERVAL_SECONDS)
                client_type = self._current_client_type()
                if self._config.scheduled_update_check and self._need_scheduled_check(client_type):
                    await self.check_and_auto_update(client_type, reason="scheduled")
            except asyncio.CancelledError:
                break
            except Exception as exc:
                self._events.publish(EventRecord.now("update.error", f"Update check failed: {exc}", level="error"))

    def _check_updates_sync(self, client_type: str) -> dict[str, Any]:
        versions = get_maa_version_info(self._runner, project_root=self._project_root, client_type=client_type)
        checker = UpdateChecker(self._config, self._fetch_json)
        return {
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "core": checker.check_core(versions["core_version"]),
            "resource": checker.check_resource(versions),
        }

    def _update_resource_sync(self, client_type: str, checked: dict[str, Any] | None) -> dict[str, Any]:
        core_dir = _require_core_dir(self._runner, self._project_root)
        resource = (checked or {}).get("resource", {})
        if self._config.update_source == "MirrorChyan":
            if not resource:
                versions = get_maa_version_info(self._runner, project_root=self._project_root, client_type=client_type)
                resource = UpdateChecker(self._config, self._fetch_json).check_resource(versions)
            if not resource.get("url"):
                return {"ok": False, "message": "发现资源更新，但 MirrorChyan 未返回下载链接"}
            return self._install_mirror_resource(core_dir, resource["url"], client_type)
        return self._install_github_resource(core_dir, client_type)

    def _update_core_sync(self, client_type: str, checked: dict[str, Any] | None, manual: bool) -> dict[str, Any]:
        result = checked or self._check_updates_sync(client_type)
        core = result.get("core", {})
        if not core.get("has_update"):
            return {"ok": True, "message": core.get("message", "核心已是最新")}
        if self._runner.status().state in CORE_UPDATE_BUSY_STATES:
            return {"ok": False, "message": "任务正在运行，无法更新核心"}
        core_dir = _require_core_dir(self._runner, self._project_root)
        if platform.system() != "Windows" and (core.get("asset") or {}).get("browser_download_url"):
            return self._install_core_package(core_dir, core)
        if _can_update_with_maa_cli(core_dir):
            if not manual and not self._config.auto_install_update_package:
                return {"ok": True, "message": "发现核心更新，等待手动点击核心更新安装", "version": core.get("latest")}
            return self._update_core_with_maa_cli(core_dir, core)
        return self._download_core_package(core_dir, core)

    def _install_core_package(self, core_dir: Path, core: dict[str, Any]) -> dict[str, Any]:
        asset = core.get("asset") or {}
        package_name = Path(str(asset.get("name") or "MaaCorePackage")).name
        package_path = self._cache_dir / package_name
        extract_dir = self._cache_dir / f"core-update-{uuid4().hex}"
        self._download_file(asset["browser_download_url"], package_path)
        extract_archive(package_path, extract_dir)
        install_full_package(full_package_root(extract_dir), core_dir)
        shutil.rmtree(extract_dir, ignore_errors=True)
        response = {
            "ok": True,
            "message": f"核心已更新到 {core.get('latest') or '最新版本'}；服务将自动重启以加载新核心",
            "package": str(package_path),
            "version": core.get("latest"),
            "core_dir": str(core_dir),
            "restart_required": True,
            "restart_scheduled": self._schedule_restart(),
        }
        self._events.publish(EventRecord.now("update.core.updated", response["message"], detail=response))
        return response

    def _update_core_with_maa_cli(self, core_dir: Path, core: dict[str, Any]) -> dict[str, Any]:
        response = run_maa_cli_update(core_dir, self._config.update_channel)
        response.update({"version": core.get("latest"), "core_dir": str(core_dir)})
        if not response.get("ok"):
            self._events.publish(EventRecord.now("update.core.failed", response["message"], level="error", detail=response))
            return response
        action_message = response.get("message") or "核心更新完成"
        response["message"] = f"{action_message}，核心已更新到 {core.get('latest') or '最新版本'}；服务将自动重启以加载新核心"
        response["restart_required"] = True
        response["restart_scheduled"] = self._schedule_restart()
        self._events.publish(EventRecord.now("update.core.updated", response["message"], detail=response))
        return response

    def _download_core_package(self, core_dir: Path, core: dict[str, Any]) -> dict[str, Any]:
        asset = core.get("asset") or {}
        if not asset.get("browser_download_url") or not asset.get("name"):
            return {"ok": False, "message": "发现核心更新，但没有可用的下载包", "url": core.get("url", "")}
        package_path = core_dir / asset["name"]
        self._download_file(asset["browser_download_url"], package_path)
        response = {"ok": True, "message": "核心更新包已下载", "package": str(package_path), "version": core.get("latest")}
        if self._config.auto_install_update_package:
            response.update(start_updater(core_dir, package_path, asset["name"], show_console=self._config.show_updater_console))
        self._events.publish(EventRecord.now("update.core.downloaded", response["message"], detail=response))
        return response

    def _schedule_restart(self) -> bool:
        if self._restart_callback is None:
            return False
        try:
            self._restart_callback()
        except Exception as exc:
            detail = {"error": str(exc)}
            self._events.publish(EventRecord.now("update.core.restart_failed", "核心更新后自动重启失败。", level="error", detail=detail))
            return False
        return True

    def _install_github_resource(self, core_dir: Path, client_type: str) -> dict[str, Any]:
        package_path = self._cache_dir / "MaaResourceGithub.zip"
        extract_dir = self._cache_dir / "MaaResourceGithub"
        self._download_file(GITHUB_RESOURCE_ZIP, package_path)
        extract_zip(package_path, extract_dir)
        merge_dir(github_resource_root(extract_dir), core_dir / "resource")
        stage_activity = self._sync_stage_activity_metadata(core_dir)
        return self._resource_updated(client_type, stage_activity=stage_activity)

    def _install_mirror_resource(self, core_dir: Path, url: str, client_type: str) -> dict[str, Any]:
        package_path = self._cache_dir / "MaaResourceMirrorchyan.zip"
        extract_dir = self._cache_dir / "MaaResourceMirrorchyan"
        self._download_file(url, package_path)
        extract_zip(package_path, extract_dir)
        merge_dir(mirror_resource_root(extract_dir), core_dir)
        shutil.rmtree(extract_dir, ignore_errors=True)
        package_path.unlink(missing_ok=True)
        stage_activity = self._sync_stage_activity_metadata(core_dir)
        return self._resource_updated(client_type, stage_activity=stage_activity)

    def _sync_stage_activity_metadata(self, core_dir: Path) -> dict[str, Any]:
        target = core_dir / "cache" / "gui" / "StageActivityV2.json"
        errors: list[str] = []
        for url in GUI_STAGE_ACTIVITY_URLS:
            temp = self._cache_dir / f"StageActivityV2-{uuid4().hex}.json"
            try:
                self._download_file(url, temp)
                data = json.loads(temp.read_text(encoding="utf-8"))
                if not isinstance(data, dict) or not data:
                    raise RuntimeError("响应不是有效的关卡元数据 JSON")
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(temp, target)
                return {"ok": True, "source": url, "path": str(target)}
            except Exception as exc:
                errors.append(f"{url}: {exc}")
            finally:
                temp.unlink(missing_ok=True)
        return {"ok": False, "path": str(target), "message": "关卡列表元数据同步失败", "errors": errors}

    def _resource_updated(self, client_type: str, *, stage_activity: dict[str, Any] | None = None) -> dict[str, Any]:
        info = get_maa_version_info(self._runner, project_root=self._project_root, client_type=client_type)
        detail = {"version": info.get("resource_version"), "resource_time": info.get("resource_time")}
        if stage_activity is not None:
            detail["stage_activity"] = stage_activity
        if stage_activity is not None and not stage_activity.get("ok"):
            self._events.publish(EventRecord.now(
                "update.resource.stage_activity_failed",
                "关卡列表元数据同步失败。",
                level="warning",
                detail=stage_activity,
            ))
        self._events.publish(EventRecord.now("update.resource.updated", "资源已更新。", detail=detail))
        self._reload_resources_when_possible(client_type)
        message = "资源已更新" if not stage_activity or stage_activity.get("ok") else "资源已更新，但关卡列表元数据同步失败"
        return {"ok": True, "message": message, **detail}

    def _reload_resources_when_possible(self, client_type: str) -> None:
        adapter = self._runner.adapter
        asst_cls = getattr(adapter, "_asst_cls", None)
        profile = self._runner.profile() or Profile(name="resource-reload", adb=AdbConfig(client_type=client_type))
        profile.adb.client_type = client_type
        load_resources = getattr(adapter, "_load_resources", None)
        if callable(load_resources) and asst_cls is not None:
            load_resources(asst_cls, profile)

    def _download_file(self, url: str, target: Path) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        opener = urllib.request.build_opener()
        proxy = self._proxy_url()
        if proxy:
            opener.add_handler(urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
        request = urllib.request.Request(url, headers={"User-Agent": MIRROR_USER_AGENT})
        with opener.open(request, timeout=60) as response, target.open("wb") as output:
            shutil.copyfileobj(response, output)

    def _fetch_json(self, url: str) -> dict[str, Any]:
        target = self._cache_dir / f"fetch-{uuid4().hex}.json"
        self._download_file(url, target)
        try:
            data = json.loads(target.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        finally:
            target.unlink(missing_ok=True)

    def _need_scheduled_check(self, client_type: str) -> bool:
        offset = YJ_CLIENT_TIMEZONE.get(client_type, 8) - 4
        yj = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() + offset * 3600, timezone.utc)
        key = f"{yj:%Y-%m-%d-%H-%M}"
        if yj.minute == 0 and yj.hour in {0, 18} and key != self._last_yj_key:
            self._last_yj_key = key
            return True
        return False

    def _publish_result(self, result: dict[str, Any]) -> None:
        for key in ("core", "resource"):
            item = result.get(key, {})
            if item.get("has_update"):
                self._events.publish(EventRecord.now(f"update.{key}.found", item.get("message", "发现更新"), detail=item))

    def _current_client_type(self) -> str:
        return self._runner.profile().adb.client_type if self._runner.profile() else DEFAULT_CLIENT_TYPE

    def _should_auto_update_resource(self, result: dict[str, Any]) -> bool:
        resource = result.get("resource", {})
        return (
            resource.get("has_update")
            and self._config.auto_install_update_package
            and self._config.update_source == "MirrorChyan"
            and bool(resource.get("url"))
        )

    def _proxy_url(self) -> str:
        proxy = self._config.proxy.strip()
        if not proxy:
            return ""
        proxy_type = self._config.proxy_type.strip() or "http"
        return proxy if "://" in proxy else f"{proxy_type}://{proxy}"


def _require_core_dir(runner: MaaRunnerService, project_root: Path) -> Path:
    core_dir = resolve_maa_root(adapter=runner.adapter, project_root=project_root)
    if not (core_dir / "resource").is_dir():
        raise RuntimeError(f"MAA_CORE_DIR 无效或缺少 resource 目录：{core_dir}")
    return core_dir


def _can_update_with_maa_cli(core_dir: Path) -> bool:
    if platform.system() == "Windows":
        return False
    maa_cli = core_dir / "maa"
    return maa_cli.is_file() and os.access(maa_cli, os.X_OK)

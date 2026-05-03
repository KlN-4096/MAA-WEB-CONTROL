from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Mapping

from .events import EventBus
from .models import AppendCall, EventRecord, Profile
from .runner import DryRunMaaAdapter, MaaAdapter


DEFAULT_MAA_PYTHON_DIR = Path(r"E:\Project\C\MaaAssistantArknights\src\Python")


class OfficialMaaAdapter:
    def __init__(
        self,
        core_dir: Path,
        user_dir: Path,
        connect_config: str = "General",
        python_dir: Path | None = DEFAULT_MAA_PYTHON_DIR,
        asst_cls: type[Any] | None = None,
        events: EventBus | None = None,
        poll_interval: float = 0.5,
    ) -> None:
        self._core_dir = core_dir
        self._python_dir = python_dir
        self._user_dir = user_dir
        self._connect_config = connect_config
        self._asst_cls = asst_cls
        self._asst: Any | None = None
        self._callback: Any | None = None
        self._events = events
        self._callback_events: list[EventRecord] = []
        self._loop: asyncio.AbstractEventLoop | None = None
        self._poll_interval = poll_interval

    @property
    def callback_events(self) -> list[EventRecord]:
        return list(self._callback_events)

    async def connect(self, profile: Profile) -> bool:
        self._loop = asyncio.get_running_loop()
        return await asyncio.to_thread(self._connect_sync, profile)

    async def append_task(self, call: AppendCall) -> int:
        asst = self._require_asst()
        try:
            return await asyncio.to_thread(asst.append_task, call.type, call.params)
        except Exception as exc:
            raise RuntimeError(f"MaaCore append_task failed for {call.type}.") from exc

    async def start(self) -> bool:
        asst = self._require_asst()
        try:
            return await asyncio.to_thread(self._start_and_wait_sync, asst)
        except Exception as exc:
            raise RuntimeError("MaaCore start failed.") from exc

    async def stop(self) -> bool:
        if self._asst is None:
            return True
        try:
            return await asyncio.to_thread(self._asst.stop)
        except Exception as exc:
            raise RuntimeError("MaaCore stop failed.") from exc

    def _connect_sync(self, profile: Profile) -> bool:
        asst_cls = self._resolve_asst_cls()
        self._user_dir.mkdir(parents=True, exist_ok=True)
        try:
            if not asst_cls.load(self._core_dir, user_dir=self._user_dir):
                return False
        except Exception as exc:
            raise RuntimeError(f"Failed to load MaaCore from MAA_CORE_DIR: {self._core_dir}") from exc
        self._callback = self._build_callback(asst_cls)
        self._asst = asst_cls(callback=self._callback)
        try:
            return bool(
                self._asst.connect(
                    profile.adb.adb_path,
                    profile.adb.address,
                    _profile_connect_config(profile, self._connect_config),
                )
            )
        except Exception as exc:
            raise RuntimeError(f"MaaCore connect failed for ADB address: {profile.adb.address}") from exc

    def _resolve_asst_cls(self) -> type[Any]:
        if self._asst_cls is not None:
            return self._asst_cls
        if self._python_dir is not None:
            python_dir = str(self._python_dir)
            if python_dir not in sys.path:
                sys.path.insert(0, python_dir)
        try:
            from asst.asst import Asst
        except ImportError as exc:
            raise RuntimeError(
                "Failed to import official MAA Python wrapper. "
                "Set MAA_PYTHON_DIR to the directory containing asst/asst.py."
            ) from exc
        self._asst_cls = Asst
        return Asst

    def _build_callback(self, asst_cls: type[Any]) -> Any:
        callback_type = getattr(asst_cls, "CallBackType", None)
        if callback_type is None:
            return self._handle_callback
        return callback_type(self._handle_callback)

    def _handle_callback(self, message: int, details: Any, arg: Any = None) -> None:
        event = EventRecord.now(
            "maa.callback",
            f"MAA callback {message}",
            detail={"message": message, "details": _decode_callback_details(details)},
        )
        self._callback_events.append(event)
        self._publish_callback_event(event)

    def _publish_callback_event(self, event: EventRecord) -> None:
        if self._events is None:
            return
        loop = self._loop
        try:
            if loop is not None and loop.is_running():
                loop.call_soon_threadsafe(self._events.publish, event)
            else:
                self._events.publish(event)
        except RuntimeError:
            self._events.publish(event)

    def _start_and_wait_sync(self, asst: Any) -> bool:
        if not asst.start():
            return False
        while asst.running():
            time.sleep(self._poll_interval)
        return True

    def _require_asst(self) -> Any:
        if self._asst is None:
            raise RuntimeError("MaaCore is not connected.")
        return self._asst


def create_maa_adapter(
    project_root: Path,
    events: EventBus,
    env: Mapping[str, str] | None = None,
    asst_cls: type[Any] | None = None,
) -> MaaAdapter:
    source_env = os.environ if env is None else env
    adapter_name = source_env.get("MAA_ADAPTER", "").strip().lower()
    if adapter_name not in {"official", "real"}:
        return DryRunMaaAdapter()

    core_dir = source_env.get("MAA_CORE_DIR", "").strip()
    if not core_dir:
        raise RuntimeError("MAA_CORE_DIR is required when MAA_ADAPTER=official or real.")

    core_path = Path(core_dir)
    python_dir = _resolve_python_dir(source_env.get("MAA_PYTHON_DIR"), core_path)
    user_dir = _optional_path(source_env.get("MAA_USER_DIR"), project_root / "data" / "runtime" / "maa")
    return OfficialMaaAdapter(
        core_dir=core_path,
        python_dir=python_dir,
        user_dir=user_dir,
        connect_config=source_env.get("MAA_CONNECT_CONFIG", "General"),
        asst_cls=asst_cls,
        events=events,
    )


def _optional_path(value: str | None, default: Path) -> Path:
    if value is None or not value.strip():
        return default
    return Path(value)


def _resolve_python_dir(value: str | None, core_dir: Path) -> Path:
    if value is not None and value.strip():
        return Path(value)
    bundled_python_dir = core_dir / "Python"
    if bundled_python_dir.exists():
        return bundled_python_dir
    return DEFAULT_MAA_PYTHON_DIR


def _profile_connect_config(profile: Profile, default: str) -> str:
    config = profile.adb.connect_config
    if isinstance(config, str) and config.strip():
        return config
    if isinstance(config, dict):
        for key in ("name", "config", "preset"):
            value = config.get(key)
            if isinstance(value, str) and value.strip():
                return value
    return default


def _decode_callback_details(details: Any) -> Any:
    if details is None:
        return None
    if isinstance(details, bytes):
        text = details.decode("utf-8", errors="replace")
    else:
        text = str(details)
    if not text:
        return ""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text

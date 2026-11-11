from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import re
import time
from collections import deque
from contextlib import suppress
from pathlib import Path
from threading import Lock
from typing import Any
from urllib import request
from urllib.error import URLError
from uuid import uuid4

from .events import EventBus
from .models import AppendCall, EventRecord, RemoteControlConfig
from .notification_channels import STORED_SECRET, open_without_redirect, post_json, validate_http_url
from .runner import MaaRunnerService
from .storage import ProfileStore, _replace_with_retry


LINK_TASK_TYPES = {"Base": "Infrast", "WakeUp": "StartUp", "Combat": "Fight", "Recruiting": "Recruit", "Mall": "Mall", "Mission": "Award", "AutoRoguelike": "Roguelike", "Reclamation": "Reclamation"}
IMMEDIATE_COMMANDS = {"HeartBeat", "StopTask", "CaptureImageNow"}
MAX_REMOTE_QUEUE = 100
MAX_ACKNOWLEDGED_READ_ONLY_RECORDS = 1000
MAX_REPORT_BATCH = 8
READ_ONLY_COMMANDS = {"HeartBeat", "CaptureImage", "CaptureImageNow"}


class RemoteControlService:
    """可选出站协议客户端；远端仅能选择固定功能，不能传任意 Core 参数或命令。"""

    def __init__(self, path: Path, store: ProfileStore, runner: MaaRunnerService, events: EventBus) -> None:
        self.path, self.store, self.runner, self.events = path, store, runner, events
        self._config = RemoteControlConfig(device=str(uuid4()))
        self._records: dict[str, dict[str, Any]] = {}
        self._last_error = ""
        self._generation = 0
        self._write_lock = Lock()
        self._write_revision = 0
        self._written_revision = 0
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(data, dict) or not isinstance(data.get("records", {}), dict):
                    raise ValueError("invalid remote data")
                self._config = RemoteControlConfig.model_validate(data.get("config", {}))
                self._records = data.get("records", {})
                if any(not isinstance(record, dict) or record.get("status") not in {"PENDING", "SUCCESS", "FAILED"} for record in self._records.values()):
                    raise ValueError("invalid remote records")
            except (OSError, ValueError, TypeError):
                self._config = RemoteControlConfig(device=str(uuid4()))
                self._records = {}
                self._last_error = "远控配置无法读取，已停用远控并保留原文件，请检查后重新保存。"
                events.publish(EventRecord.now("remote.config_error", self._last_error, level="error"))
        if not self._config.device:
            self._config.device = str(uuid4())
        # 中断中的游戏操作绝不自动重放。
        for record in self._records.values():
            if record.get("status") == "PENDING":
                record.update(status="FAILED", payload="服务重启，任务未重放", reported=False)
        self._queue: deque[dict[str, Any]] = deque()
        self._worker: asyncio.Task[None] | None = None
        self._reporter: asyncio.Task[None] | None = None
        self._stop_requests: set[asyncio.Task[Any]] = set()
        self._loop: asyncio.Task[None] | None = None
        self._active_id = ""

    @property
    def config(self) -> RemoteControlConfig:
        return self._config.model_copy(deep=True)

    @property
    def state(self) -> dict[str, Any]:
        return {"active_task": self._active_id, "queued": len(self._queue), "last_error": self._last_error}

    def public_config(self) -> dict[str, Any]:
        result = self._config.model_dump()
        for key in ("poll_url", "report_url", "user"):
            if result[key]:
                result[key] = STORED_SECRET
        return result

    def update_config(self, config: RemoteControlConfig) -> RemoteControlConfig:
        config = config.model_copy(deep=True)
        old = self._config
        changes_endpoint = any(key in config.model_fields_set and getattr(config, key) not in {STORED_SECRET, getattr(old, key)} for key in ("poll_url", "report_url"))
        if changes_endpoint and old.user and ("user" not in config.model_fields_set or config.user == STORED_SECRET):
            raise ValueError("更换远控服务地址时，请重新填写或清空用户标识，不能将已保存标识带到新服务。")
        for key in ("poll_url", "report_url", "user"):
            if key not in config.model_fields_set or getattr(config, key) == STORED_SECRET:
                setattr(config, key, getattr(self._config, key))
        if config.enabled and (self._active_id or self._queue):
            raise RuntimeError("远控队列运行中，请先停止远控任务再修改配置。")
        if config.enabled:
            validate_http_url(config.poll_url)
            validate_http_url(config.report_url)
            self.store.load(config.profile_name)
        config = config.model_copy(update={"device": self._config.device}, deep=True)
        records = dict(self._records)
        if not config.enabled:
            for task in self._queue:
                records[task["_record_key"]] = {**records[task["_record_key"]], "status": "FAILED", "payload": "远控已禁用，任务未执行"}
        # 持久化成功后才允许新配置执行，不能出现“保存失败但远控已启用”。
        self._write_revision += 1
        text = json.dumps({"config": config.model_dump(), "records": records}, ensure_ascii=False) + "\n"
        self._write(text, self._write_revision)
        self._config, self._records = config, records
        self._generation += 1
        self._last_error = ""
        if not config.enabled:
            self._queue.clear()
        return self.config

    def start(self) -> None:
        self._loop = asyncio.create_task(self._poll_loop())
        self._reporter = asyncio.create_task(self._report_loop())

    async def shutdown(self) -> None:
        if self._loop:
            self._loop.cancel()
            with suppress(asyncio.CancelledError):
                await self._loop
        if self._worker:
            self._worker.cancel()
            with suppress(asyncio.CancelledError):
                await self._worker
        if self._reporter:
            self._reporter.cancel()
            with suppress(asyncio.CancelledError):
                await self._reporter
        if self._stop_requests:
            await asyncio.gather(*self._stop_requests, return_exceptions=True)

    async def _poll_loop(self) -> None:
        while True:
            if self._config.enabled:
                try:
                    await self.poll_once()
                    self._last_error = ""
                except (URLError, OSError, ValueError, TypeError, RuntimeError) as exc:
                    error = f"远控轮询失败（{type(exc).__name__}）"
                    if error != self._last_error:
                        self.events.publish(EventRecord.now("remote.error", error, level="warning"))
                    self._last_error = error
            await asyncio.sleep(self._config.interval_ms / 1000)

    async def poll_once(self) -> None:
        config = self.config
        generation = self._generation
        if not config.enabled:
            return
        result = await asyncio.to_thread(post_json, config.poll_url, {"user": config.user, "device": config.device})
        if generation != self._generation or not self._config.enabled:
            return
        if not isinstance(result.get("tasks"), list):
            raise ValueError("远控响应缺少 tasks 数组")
        for task in result["tasks"][:MAX_REMOTE_QUEUE]:
            if generation != self._generation:
                break
            if not isinstance(task, dict):
                continue
            task_id, kind = task.get("id"), task.get("type")
            if not isinstance(task_id, str) or not task_id or len(task_id) > 256 or not isinstance(kind, str):
                continue
            scope = hashlib.sha256(json.dumps([config.poll_url, config.user, config.device]).encode()).hexdigest()
            record_key = f"{scope}:{task_id}"
            if record_key in self._records:
                continue
            if len(self._queue) >= MAX_REMOTE_QUEUE and kind not in IMMEDIATE_COMMANDS:
                break
            if task.get("params") is not None and (not isinstance(task["params"], str) or len(task["params"]) > 1024):
                status, payload = "FAILED", "参数必须是短字符串"
            else:
                status, payload = "PENDING", ""
            self._records[record_key] = {
                "task": task_id, "status": status, "payload": payload, "reported": False,
                "report_url": config.report_url, "user": config.user, "device": config.device,
                "kind": kind,
            }
            try:
                await self._persist()
            except OSError:
                self._records.pop(record_key, None)
                raise
            if generation != self._generation:
                self._records[record_key].update(status="FAILED", payload="远控配置已变更，任务未执行")
                await self._persist()
                break
            if status == "FAILED":
                continue
            task = {**task, "_record_key": record_key, "_config": config, "_generation": generation}
            if kind in IMMEDIATE_COMMANDS:
                await self._execute(task)
            else:
                self._queue.append(task)
        if self._queue and (self._worker is None or self._worker.done()):
            self._worker = asyncio.create_task(self._run_queue())

    async def _run_queue(self) -> None:
        while self._queue and self._config.enabled:
            task = self._queue.popleft()
            self._active_id = task["id"]
            try:
                while self.runner.is_running() and task["_generation"] == self._generation:
                    await asyncio.sleep(0.2)
                if task["_generation"] != self._generation:
                    self._records[task["_record_key"]].update(status="FAILED", payload="远控配置已变更，任务未执行")
                    await self._persist()
                else:
                    await self._execute(task)
            finally:
                self._active_id = ""

    async def _execute(self, task: dict[str, Any]) -> None:
        record = self._records[task["_record_key"]]
        try:
            payload = await self._command(task["type"], task.get("params") or "", task["_config"])
            record.update(status="SUCCESS", payload=payload)
        except (RuntimeError, ValueError, OSError) as exc:
            record.update(status="FAILED", payload=str(exc)[:500])
        finally:
            await self._persist()

    async def _command(self, kind: str, value: str, config: RemoteControlConfig | None = None) -> str:
        config = config or self.config
        if kind == "HeartBeat":
            return self._active_id
        if kind == "StopTask":
            task = asyncio.create_task(self.runner.stop())
            self._stop_requests.add(task)
            task.add_done_callback(self._stop_finished)
            return ""
        profile = self.store.load(config.profile_name)
        context_profile = profile.model_copy(deep=True)
        if kind in {"CaptureImage", "CaptureImageNow"}:
            image = await self.runner.capture_image(profile)
            if not image:
                raise RuntimeError("截图不可用")
            return base64.b64encode(image).decode()
        if kind.startswith("Settings-"):
            if self.runner.is_running():
                raise RuntimeError("任务运行中，不能修改配置")
            if kind == "Settings-ConnectAddress":
                if not re.fullmatch(r"[A-Za-z0-9_.:\[\]-]{1,255}", value):
                    raise ValueError("连接地址格式无效")
                profile.adb.address = value
            elif kind == "Settings-Stage1":
                if not re.fullmatch(r"[A-Za-z0-9@_-]{1,100}", value):
                    raise ValueError("关卡代码格式无效")
                fights = [t for t in profile.tasks if t.type == "Fight" and t.id != "remaining-sanity"]
                if len(fights) != 1:
                    raise ValueError("无法唯一定位理智作战任务")
                fights[0].params.update(stage=value, stage_plan=[value])
            else:
                raise ValueError("不支持的远控设置")
            self.store.save(profile)
            return ""
        if kind in {"Toolbox-GachaOnce", "Toolbox-GachaTenTimes"}:
            task = kind.removeprefix("Toolbox-")
            await self.runner.run_external(profile, AppendCall(task_id=f"remote-{task}", type="Custom", params={"task_names": [task]}))
        else:
            if kind == "LinkStart":
                pass
            elif kind.startswith("LinkStart-") or kind == "Toolbox-Reclamation":
                key = "Reclamation" if kind == "Toolbox-Reclamation" else kind.removeprefix("LinkStart-")
                task_type = LINK_TASK_TYPES.get(key)
                if not task_type:
                    raise ValueError("不支持的远控任务")
                selected = [t for t in profile.tasks if t.type == task_type and t.id != "remaining-sanity"]
                if len(selected) != 1:
                    raise ValueError("无法唯一定位对应任务")
                selected[0].enabled = True
                profile.tasks = selected
            else:
                raise ValueError("不支持的远控命令")
            # 不从远端接收配置/系统命令，只选择本机已经保存的任务配置。
            await self.runner.run(profile, context_profile=context_profile)
        status = await self.runner.wait_for_completion()
        if status.state != "Completed":
            raise RuntimeError(status.last_error or f"任务未完成：{status.state}")
        return ""

    async def _report_loop(self) -> None:
        while True:
            try:
                await self._report_pending(self.config)
            except (OSError, ValueError) as exc:
                self.events.publish(EventRecord.now("remote.report_failed", f"远控汇报状态保存失败（{type(exc).__name__}）。", level="error"))
            await asyncio.sleep(1)

    async def _report_pending(self, config: RemoteControlConfig) -> None:
        pending = [(key, record) for key, record in self._records.items()
                   if record["status"] != "PENDING" and not record.get("reported") and record.get("retry_at", 0) <= time.time()]
        await asyncio.gather(*(self._report_one(key, record, config) for key, record in pending[:MAX_REPORT_BATCH]))

    async def _report_one(self, key: str, record: dict[str, Any], config: RemoteControlConfig) -> None:
        body = {"user": record.get("user", config.user), "device": record.get("device", config.device),
                "task": record.get("task", key), "status": record["status"], "payload": record.get("payload", "")}
        try:
            await asyncio.to_thread(_report, record.get("report_url", config.report_url), body)
            self._records[key] = {"task": body["task"], "status": record["status"], "reported": True, "kind": record.get("kind", "")}
        except (URLError, OSError, ValueError) as exc:
            attempts = min(record.get("attempts", 0) + 1, 8)
            record.update(attempts=attempts, retry_at=time.time() + 2 ** attempts)
            self.events.publish(EventRecord.now("remote.report_failed", f"远控汇报失败（{type(exc).__name__}），将重试汇报但不重放任务。", level="warning"))
        await self._persist()

    def _stop_finished(self, task: asyncio.Task[Any]) -> None:
        self._stop_requests.discard(task)
        if not task.cancelled() and task.exception() is not None:
            self.events.publish(EventRecord.now("remote.stop_failed", "远控停止请求失败。", level="error"))

    def _save(self) -> None:
        self._write(*self._serialized())

    async def _persist(self) -> None:
        await asyncio.to_thread(self._write, *self._serialized())

    def _serialized(self) -> tuple[str, int]:
        acknowledged = [key for key, record in self._records.items() if record.get("reported") and record.get("kind") in READ_ONLY_COMMANDS]
        for key in acknowledged[:-MAX_ACKNOWLEDGED_READ_ONLY_RECORDS]:
            del self._records[key]
        self._write_revision += 1
        return json.dumps({"config": self._config.model_dump(), "records": self._records}, ensure_ascii=False) + "\n", self._write_revision

    def _write(self, text: str, revision: int) -> None:
        with self._write_lock:
            if revision <= self._written_revision:
                return
            self._write_locked(text)
            self._written_revision = revision

    def _write_locked(self, text: str) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(text, encoding="utf-8")
        _replace_with_retry(tmp, self.path)


def _report(url: str, body: dict[str, Any]) -> None:
    validate_http_url(url)
    req = request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with open_without_redirect(req):
        pass

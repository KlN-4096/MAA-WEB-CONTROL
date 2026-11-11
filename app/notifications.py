from __future__ import annotations

import asyncio
import json
import regex
import smtplib
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any
from urllib import request as urlrequest
from urllib.error import URLError

from .events import EventBus
from .models import EventRecord, NotificationConfig
from .notification_channels import SECRET_OPTION_KEYS, STORED_SECRET, open_without_redirect, send_channel, validate_http_url
from .storage import _replace_with_retry


REGEX_TIMEOUT_SECONDS = 0.05
MAX_PENDING_NOTIFICATIONS = 4


class NotificationService:
    """Persists notification config and dispatches webhooks for runner events.

    Uses urllib in a thread to avoid adding an httpx/aiohttp dep just for
    one POST per run completion.
    """

    def __init__(self, config_path: Path, events: EventBus | None = None) -> None:
        self._config_path = config_path
        self._events = events
        self._lock = Lock()
        self._config = self._load_config()
        self._history: deque[str] = deque(maxlen=100)
        self._log_count = 0
        self._pending: set[asyncio.Task[Any]] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._regex_disabled = False
        if events:
            events.add_listener(self._on_event)

    def start(self) -> None:
        self._loop = asyncio.get_running_loop()

    @property
    def config(self) -> NotificationConfig:
        return self._config.model_copy(deep=True)

    def public_config(self) -> dict[str, Any]:
        config = self._config.model_dump()
        webhook = config["webhook"]
        if webhook["url"]:
            webhook["url"] = STORED_SECRET
        webhook["headers"] = {key: STORED_SECRET for key in webhook["headers"]}
        for channel in config["channels"]:
            for key, value in channel["options"].items():
                if value and (key in SECRET_OPTION_KEYS or key == "server" and channel["type"] != "smtp"):
                    channel["options"][key] = STORED_SECRET
        return config

    def resolve_config(self, config: NotificationConfig) -> NotificationConfig:
        result = config.model_copy(deep=True)
        old = self._config
        reuses_headers = "headers" not in config.webhook.model_fields_set or any(value == STORED_SECRET for value in config.webhook.headers.values())
        if config.webhook.url not in {STORED_SECRET, old.webhook.url} and "url" in config.webhook.model_fields_set and old.webhook.headers and reuses_headers:
            raise ValueError("更换 Webhook 地址时，请重新填写或清空请求头，不能向新地址复用已保存凭据。")
        if "url" not in config.webhook.model_fields_set or result.webhook.url == STORED_SECRET:
            result.webhook.url = old.webhook.url
        if "headers" not in config.webhook.model_fields_set:
            result.webhook.headers = dict(old.webhook.headers)
        else:
            result.webhook.headers = {key: old.webhook.headers.get(key, "") if value == STORED_SECRET else value for key, value in result.webhook.headers.items()}
        existing = {channel.id: channel for channel in old.channels}
        if len({channel.id for channel in result.channels}) != len(result.channels):
            raise ValueError("通知渠道 ID 不能重复")
        for channel in result.channels:
            previous = existing.get(channel.id)
            if previous is not None and previous.type == channel.type:
                old_server = previous.options.get("server", "")
                new_server = channel.options.get("server", old_server)
                reuse_secret = any(previous.options.get(key) and (key not in channel.options or channel.options[key] == STORED_SECRET) for key in SECRET_OPTION_KEYS)
                if new_server not in (old_server, STORED_SECRET) and reuse_secret:
                    raise ValueError("更换通知服务地址时，请重新填写或清空认证凭据。")
                for key, value in previous.options.items():
                    if (key in SECRET_OPTION_KEYS | {"server"} and key not in channel.options) or channel.options.get(key) == STORED_SECRET:
                        channel.options[key] = value
            if any(value == STORED_SECRET for value in channel.options.values()):
                raise ValueError("通知渠道没有对应的已保存凭据，请重新填写")
        return result

    def update_config(self, config: NotificationConfig) -> NotificationConfig:
        config = self.resolve_config(config)
        if config.webhook.url:
            validate_http_url(config.webhook.url)
        with self._lock:
            self._save_config(config)
            self._config = config.model_copy(deep=True)
            self._regex_disabled = False
            self._log_count = 0
        return self.config

    async def dispatch_run_event(self, event_type: str, payload: dict[str, Any]) -> bool:
        config = self._config
        if not config.enabled:
            return False
        if event_type == "start" and not config.send_on_start:
            return False
        if event_type == "complete" and not config.send_on_complete:
            return False
        if event_type == "error" and not config.send_on_error:
            return False
        if event_type == "stopped" and not config.send_on_stopped:
            return False
        if event_type == "timeout" and not config.send_on_timeout:
            return False
        self._log_count = 0
        body = self._build_body(event_type, payload, include_details=config.include_details)
        if config.history_lines:
            body["history"] = list(self._history)[-config.history_lines:]
        return await self._send(config, body)

    def _on_event(self, event: EventRecord) -> None:
        if event.type != "maa.log.item":
            return
        content = str(event.detail.get("item", {}).get("content", event.message))[:4096]
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = self._loop
            if loop is not None and loop.is_running():
                loop.call_soon_threadsafe(self._consume_log, content)
            return
        self._consume_log(content)

    def _consume_log(self, content: str) -> None:
        if any(word and word in content for word in self._config.blacklist):
            return
        self._history.append(content)
        config = self._config
        if not config.enabled or not (config.webhook.enabled and config.webhook.url or any(channel.enabled for channel in config.channels)):
            self._log_count = 0
            return
        self._log_count += 1
        if len(self._pending) >= MAX_PENDING_NOTIFICATIONS:
            return
        try:
            matched = bool(config.log_pattern and not self._regex_disabled and regex.search(config.log_pattern, content, timeout=REGEX_TIMEOUT_SECONDS))
        except TimeoutError:
            self._regex_disabled = True
            matched = False
            self._publish("notification.pattern_timeout", "日志正则匹配超时，已停用该正则触发；重新保存配置可恢复。", level="warning")
        counted = config.log_count > 0 and self._log_count >= config.log_count
        if config.enabled and (matched or counted):
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                return
            self._log_count = 0
            task = loop.create_task(self.dispatch_run_event("log", {"message": content}))
            self._pending.add(task)
            task.add_done_callback(self._pending.discard)

    async def shutdown(self) -> None:
        if self._pending:
            await asyncio.gather(*self._pending)

    async def dispatch_test(self, override: NotificationConfig | None = None) -> dict[str, Any]:
        config = self.resolve_config(override) if override is not None else self._config
        self._log_count = 0
        body = self._build_body(
            "test",
            {"profile": "test", "message": "MAA Web Control 通知测试。"},
            include_details=True,
        )
        ok = await self._send(config, body, force=True)
        return {"ok": ok}

    async def _send(self, config: NotificationConfig, body: dict[str, Any], *, force: bool = False) -> bool:
        webhook = config.webhook
        title = f"MAA {body.get('event', '')}"
        content = "\n".join([str(body.get("profile") or ""), str(body.get("message") or ""), *body.get("history", [])]).strip()
        if any(word and word in content for word in config.blacklist):
            return False
        results = []
        if (force or webhook.enabled) and webhook.url.strip():
            try:
                payload = body
                if webhook.body_template:
                    template = webhook.body_template
                    for key, value in {"title": title, "content": content, "time": str(body.get("timestamp", ""))}.items():
                        template = template.replace("{" + key + "}", json.dumps(value, ensure_ascii=False)[1:-1])
                    payload = json.loads(template)
                await asyncio.to_thread(self._post_sync, webhook.url, webhook.method, webhook.headers, payload)
                results.append(True)
                self._publish("notification.sent", "Webhook 已发送。")
            except (URLError, OSError, ValueError, TypeError) as exc:
                self._publish("notification.failed", f"Webhook 推送失败（{type(exc).__name__}）", level="error")
                results.append(False)
        for channel in config.channels:
            if not channel.enabled:
                continue
            try:
                await asyncio.to_thread(send_channel, channel, title, content)
                results.append(True)
                self._publish("notification.sent", f"{channel.type} 已发送。")
            except (URLError, OSError, ValueError, TypeError, smtplib.SMTPException) as exc:
                self._publish("notification.failed", f"{channel.type} 推送失败（{type(exc).__name__}）", level="error")
                results.append(False)
        if not results:
            self._publish("notification.skipped", "没有配置可用通知渠道。", level="warning")
        return bool(results) and all(results)

    def _post_sync(
        self,
        url: str,
        method: str,
        headers: dict[str, str],
        body: dict[str, Any],
    ) -> None:
        validate_http_url(url)
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = urlrequest.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json; charset=utf-8")
        for key, value in headers.items():
            if key and value:
                req.add_header(str(key), str(value))
        with open_without_redirect(req):
            pass

    def _build_body(
        self,
        event_type: str,
        payload: dict[str, Any],
        *,
        include_details: bool,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "event": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "maa-web-control",
        }
        if "profile" in payload:
            body["profile"] = payload["profile"]
        message = payload.get("message")
        if message is not None:
            body["message"] = str(message)
        if include_details:
            body["details"] = {k: v for k, v in payload.items() if k not in {"profile", "message"}}
        return body

    def _publish(self, event_type: str, message: str, *, level: str = "info", detail: dict[str, Any] | None = None) -> None:
        if self._events is None:
            return
        self._events.publish(EventRecord.now(event_type, message, level=level, detail=detail or {}))  # type: ignore[arg-type]

    def _load_config(self) -> NotificationConfig:
        try:
            text = self._config_path.read_text(encoding="utf-8")
        except (OSError, FileNotFoundError):
            return NotificationConfig()
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return NotificationConfig()
        try:
            return NotificationConfig.model_validate(data)
        except ValueError:
            return NotificationConfig()

    def _save_config(self, config: NotificationConfig) -> None:
        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(config.model_dump(mode="json"), ensure_ascii=False, indent=2)
        tmp = self._config_path.with_suffix(".json.tmp")
        tmp.write_text(text + "\n", encoding="utf-8")
        _replace_with_retry(tmp, self._config_path)

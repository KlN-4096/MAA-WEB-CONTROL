from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any
from urllib import request as urlrequest
from urllib.error import URLError

from .events import EventBus
from .models import EventRecord, NotificationConfig


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

    @property
    def config(self) -> NotificationConfig:
        return self._config.model_copy(deep=True)

    def update_config(self, config: NotificationConfig) -> NotificationConfig:
        with self._lock:
            self._config = config.model_copy(deep=True)
            self._save_config(self._config)
        return self.config

    async def dispatch_run_event(self, event_type: str, payload: dict[str, Any]) -> bool:
        config = self._config
        if not config.enabled:
            return False
        if event_type == "complete" and not config.send_on_complete:
            return False
        if event_type == "error" and not config.send_on_error:
            return False
        if event_type == "stopped" and not config.send_on_stopped:
            return False
        if event_type == "timeout" and not config.send_on_timeout:
            return False
        body = self._build_body(event_type, payload, include_details=config.include_details)
        return await self._send(config, body)

    async def dispatch_test(self, override: NotificationConfig | None = None) -> dict[str, Any]:
        config = override or self._config
        body = self._build_body(
            "test",
            {"profile": "test", "message": "MAA Web Control 通知测试。"},
            include_details=True,
        )
        ok = await self._send(config, body, force=True)
        return {"ok": ok, "endpoint": config.webhook.url}

    async def _send(self, config: NotificationConfig, body: dict[str, Any], *, force: bool = False) -> bool:
        webhook = config.webhook
        if not (force or webhook.enabled):
            return False
        if not webhook.url.strip():
            self._publish("notification.skipped", "Webhook URL 未配置。", level="warning")
            return False
        try:
            await asyncio.to_thread(self._post_sync, webhook.url, webhook.method, webhook.headers, body)
        except URLError as exc:
            self._publish(
                "notification.failed",
                f"Webhook 推送失败: {exc.reason}",
                level="error",
                detail={"event": body.get("event")},
            )
            return False
        except Exception as exc:
            self._publish(
                "notification.failed",
                f"Webhook 推送出错: {exc}",
                level="error",
                detail={"event": body.get("event")},
            )
            return False
        self._publish("notification.sent", "Webhook 已发送。", detail={"event": body.get("event")})
        return True

    def _post_sync(
        self,
        url: str,
        method: str,
        headers: dict[str, str],
        body: dict[str, Any],
    ) -> None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = urlrequest.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json; charset=utf-8")
        for key, value in headers.items():
            if key and value:
                req.add_header(str(key), str(value))
        with urlrequest.urlopen(req, timeout=10):
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
        except Exception:
            return NotificationConfig()

    def _save_config(self, config: NotificationConfig) -> None:
        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(config.model_dump(mode="json"), ensure_ascii=False, indent=2)
        self._config_path.write_text(text, encoding="utf-8")

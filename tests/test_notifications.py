import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.events import EventBus
from app.models import NotificationConfig, WebhookNotificationConfig
from app.notifications import NotificationService


class NotificationServiceTest(unittest.TestCase):
    def test_default_config_persists_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "notifications.json"
            service = NotificationService(path, EventBus())

            config = NotificationConfig(
                enabled=True,
                send_on_complete=True,
                send_on_error=True,
                send_on_stopped=True,
                webhook=WebhookNotificationConfig(
                    enabled=True,
                    url="https://example.org/hook",
                    method="POST",
                    headers={"X-Token": "abc"},
                ),
            )
            service.update_config(config)

            reloaded = NotificationService(path, EventBus())
            self.assertTrue(reloaded.config.enabled)
            self.assertTrue(reloaded.config.webhook.enabled)
            self.assertEqual(reloaded.config.webhook.url, "https://example.org/hook")
            self.assertEqual(reloaded.config.webhook.headers, {"X-Token": "abc"})

    def test_dispatch_skips_when_disabled(self):
        async def run() -> bool:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "n.json"
                service = NotificationService(path, EventBus())
                return await service.dispatch_run_event("complete", {"profile": "p"})

        self.assertFalse(asyncio.run(run()))

    def test_dispatch_skips_event_specific_flags(self):
        async def run() -> tuple[bool, bool, bool]:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "n.json"
                service = NotificationService(path, EventBus())
                service.update_config(
                    NotificationConfig(
                        enabled=True,
                        send_on_complete=False,
                        send_on_error=True,
                        send_on_stopped=False,
                        webhook=WebhookNotificationConfig(enabled=True, url="https://example.org/hook"),
                    )
                )
                with patch.object(service, "_post_sync") as post:
                    completed = await service.dispatch_run_event("complete", {"profile": "p"})
                    error = await service.dispatch_run_event("error", {"profile": "p", "message": "boom"})
                    stopped = await service.dispatch_run_event("stopped", {"profile": "p"})
                return completed, error, stopped, post.call_count

        completed, error, stopped, calls = asyncio.run(run())
        self.assertFalse(completed)
        self.assertTrue(error)
        self.assertFalse(stopped)
        self.assertEqual(calls, 1)

    def test_dispatch_test_uses_override_config(self):
        async def run() -> dict:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "n.json"
                service = NotificationService(path, EventBus())
                override = NotificationConfig(
                    enabled=True,
                    webhook=WebhookNotificationConfig(enabled=False, url="https://override.example.com/hook"),
                )
                with patch.object(service, "_post_sync") as post:
                    result = await service.dispatch_test(override)
                    return {"ok": result["ok"], "calls": post.call_count, "url": result["endpoint"]}

        outcome = asyncio.run(run())
        self.assertTrue(outcome["ok"])
        self.assertEqual(outcome["calls"], 1)
        self.assertEqual(outcome["url"], "https://override.example.com/hook")

    def test_dispatch_records_post_payload_with_details(self):
        async def run() -> dict:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "n.json"
                service = NotificationService(path, EventBus())
                service.update_config(
                    NotificationConfig(
                        enabled=True,
                        include_details=True,
                        webhook=WebhookNotificationConfig(enabled=True, url="https://hook.example.com/x"),
                    )
                )
                captured: dict = {}

                def fake_post(url, method, headers, body):
                    captured["url"] = url
                    captured["method"] = method
                    captured["headers"] = headers
                    captured["body"] = body

                with patch.object(service, "_post_sync", side_effect=fake_post):
                    await service.dispatch_run_event(
                        "error",
                        {"profile": "daily", "message": "fail", "appended_tasks": 2},
                    )
                return captured

        captured = asyncio.run(run())
        self.assertEqual(captured["url"], "https://hook.example.com/x")
        self.assertEqual(captured["method"], "POST")
        self.assertEqual(captured["body"]["event"], "error")
        self.assertEqual(captured["body"]["profile"], "daily")
        self.assertEqual(captured["body"]["message"], "fail")
        self.assertEqual(captured["body"]["details"]["appended_tasks"], 2)

    def test_dispatch_drops_details_when_include_disabled(self):
        async def run() -> dict:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "n.json"
                service = NotificationService(path, EventBus())
                service.update_config(
                    NotificationConfig(
                        enabled=True,
                        include_details=False,
                        webhook=WebhookNotificationConfig(enabled=True, url="https://hook.example.com/x"),
                    )
                )
                captured: dict = {}

                def fake_post(url, method, headers, body):
                    captured["body"] = body

                with patch.object(service, "_post_sync", side_effect=fake_post):
                    await service.dispatch_run_event("complete", {"profile": "p", "message": "done", "extra": 42})
                return captured["body"]

        body = asyncio.run(run())
        self.assertNotIn("details", body)
        self.assertEqual(body["message"], "done")

    def test_corrupt_config_file_falls_back_to_default(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "n.json"
            path.write_text("not-json", encoding="utf-8")
            service = NotificationService(path, EventBus())
            self.assertFalse(service.config.enabled)


if __name__ == "__main__":
    unittest.main()

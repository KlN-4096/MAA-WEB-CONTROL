import asyncio
import base64
import io
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch
from urllib.error import URLError
from zipfile import ZipFile

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.api import create_api_router
from app.diagnostics import build_log_archive
from app.events import EventBus
from app.image_tools import background_image, pixel_paint
from app.inference import inference_config_error, prepare_inference, read_inference_config
from app.models import InferenceConfig, NotificationChannel, NotificationConfig, Profile, RemoteControlConfig, RunnerStatus, WebhookNotificationConfig
from app.notification_channels import NoRedirect, STORED_SECRET, send_channel
from app.notifications import MAX_PENDING_NOTIFICATIONS, NotificationService
from app.remote_control import RemoteControlService
from app.runner import DryRunMaaAdapter, MaaRunnerService
from app.storage import ProfileStore


class NotificationContractTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.events = EventBus()
        self.service = NotificationService(Path(self.temp.name) / "notifications.json", self.events)

    async def test_channel_failure_does_not_prevent_other_channels(self):
        config = NotificationConfig(enabled=True, channels=[
            NotificationChannel(type="telegram", enabled=True, options={"bot_token": "private"}),
            NotificationChannel(type="gotify", enabled=True, options={"token": "private-2"}),
        ])
        self.service.update_config(config)
        with patch("app.notifications.send_channel", side_effect=[ValueError("https://secret/ignored"), None]) as send:
            self.assertFalse(await self.service.dispatch_run_event("complete", {}))
        self.assertEqual(send.call_count, 2)
        self.assertNotIn("private", str(self.events.recent()))
        self.assertNotIn("https://secret", str(self.events.recent()))

    async def test_disabled_and_timed_out_regex_does_not_block_or_repeat(self):
        self.service.update_config(NotificationConfig(log_pattern="(a+)+$"))
        with patch("app.notifications.regex.search") as search:
            self.service._consume_log("aaa")
            search.assert_not_called()
        self.service.update_config(NotificationConfig(enabled=True, log_pattern="(a+)+$", webhook=WebhookNotificationConfig(enabled=True, url="https://example.test")))
        with patch("app.notifications.regex.search", side_effect=TimeoutError) as search:
            self.service._consume_log("a" * 4096 + "!")
            self.service._consume_log("again")
            self.assertEqual(search.call_count, 1)
        self.assertTrue(any(event.type == "notification.pattern_timeout" for event in self.events.recent()))

    async def test_log_dispatch_is_bounded_and_all_triggers_reset_count(self):
        self.service.update_config(NotificationConfig(enabled=True, log_count=1, webhook=WebhookNotificationConfig(enabled=True, url="https://example.test")))
        release = asyncio.Event()
        async def delayed(*args, **kwargs):
            await release.wait()
            return True
        with patch.object(self.service, "_send", side_effect=delayed):
            for index in range(100):
                self.service._consume_log(str(index))
            self.assertEqual(len(self.service._pending), MAX_PENDING_NOTIFICATIONS)
            release.set()
            await self.service.shutdown()
            self.service._log_count = 5
            await self.service.dispatch_run_event("complete", {})
            self.assertEqual(self.service._log_count, 0)

    async def test_secret_masks_resolve_by_stable_id_after_removing_another_channel(self):
        self.service.update_config(NotificationConfig(channels=[
            NotificationChannel(id="first", type="gotify", options={"server": "https://one", "token": "one-secret"}),
            NotificationChannel(id="second", type="gotify", options={"server": "https://two", "token": "two-secret"}),
        ], webhook=WebhookNotificationConfig(url="https://secret-hook/path", headers={"Authorization": "Bearer secret"})))
        public = self.service.public_config()
        self.assertNotIn("two-secret", json.dumps(public))
        public["channels"].pop(0)
        self.service.update_config(NotificationConfig.model_validate(public))
        self.assertEqual(self.service.config.channels[0].options["token"], "two-secret")
        self.assertEqual(self.service.config.webhook.headers["Authorization"], "Bearer secret")
        public["channels"][0]["options"]["token"] = ""
        self.service.update_config(NotificationConfig.model_validate(public))
        self.assertEqual(self.service.config.channels[0].options["token"], "")

    async def test_changed_destination_cannot_reuse_saved_credentials(self):
        self.service.update_config(NotificationConfig(channels=[
            NotificationChannel(id="gotify", type="gotify", options={"server": "HTTPS://one/secret-url", "token": "secret-token"}),
        ], webhook=WebhookNotificationConfig(url="https://one", headers={"Authorization": "secret-header"})))
        public = self.service.public_config()
        self.assertNotIn("secret-url", json.dumps(public))
        public["webhook"]["url"] = "https://other"
        with self.assertRaises(ValueError):
            await self.service.dispatch_test(NotificationConfig.model_validate(public))
        public = self.service.public_config()
        public["channels"][0]["options"]["server"] = "https://other"
        with self.assertRaises(ValueError):
            self.service.update_config(NotificationConfig.model_validate(public))


class ChannelRequestTest(unittest.TestCase):
    def test_provider_wire_contracts(self):
        cases = [
            ("telegram", {"bot_token": "t", "chat_id": "c", "topic_id": "9"}, {"ok": True}, "api.telegram.org", "text"),
            ("bark", {"send_key": "k"}, {"code": 200}, "/push", "device_key"),
            ("gotify", {"server": "https://gotify.test", "token": "t"}, {"id": 1}, "/message", "message"),
            ("qmsg", {"key": "k", "user": "u", "bot": "b"}, {"success": True}, "/jsend/k", "qq"),
            ("serverchan", {"send_key": "sctp123tkey"}, {"code": 0}, "123.push.ft07.com/send/", "desp"),
            ("dingtalk", {"access_token": "t", "secret": "s"}, {"errcode": 0}, "sign=", "msgtype"),
        ]
        for kind, options, response, url_part, body_key in cases:
            with self.subTest(kind=kind), patch("app.notification_channels.post_json", return_value=response) as post:
                send_channel(NotificationChannel(type=kind, options=options), "title", "content")
                self.assertIn(url_part, post.call_args.args[0])
                self.assertIn(body_key, post.call_args.args[1])
        with patch("app.notification_channels.post_json", side_effect=[{"id": "123"}, {"id": "456"}]) as post:
            send_channel(NotificationChannel(type="discord", options={"bot_token": "t", "user_id": "u"}), "title", "content")
            self.assertEqual(post.call_count, 2)
            self.assertEqual(post.call_args_list[0].args[1], {"recipient_id": "u"})
            self.assertIn("/channels/123/messages", post.call_args_list[1].args[0])

    def test_smtp_respects_auth_and_tls_switches(self):
        options = {"server": "smtp.test", "from": "a@test", "to": "b@test;c@test", "use_ssl": False, "starttls": False, "requires_authentication": False}
        with patch("app.notification_channels.smtplib.SMTP") as smtp:
            send_channel(NotificationChannel(type="smtp", options=options), "title", "content")
            connection = smtp.return_value.__enter__.return_value
            connection.login.assert_not_called()
            connection.starttls.assert_not_called()
            self.assertEqual(connection.send_message.call_args.kwargs["to_addrs"], ["b@test", "c@test"])

    def test_http_redirects_are_never_forwarded(self):
        self.assertIsNone(NoRedirect().redirect_request(None, None, 302, "", {}, "https://different.test"))


class SecretApiTest(unittest.TestCase):
    def test_normal_and_validation_responses_do_not_echo_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            events = EventBus()
            store = ProfileStore(root / "profiles")
            runner = MaaRunnerService(DryRunMaaAdapter(), events)
            service = NotificationService(root / "notifications.json", events)
            remote = RemoteControlService(root / "remote.json", store, runner, events)
            app = FastAPI()
            app.include_router(create_api_router(store, runner, events, notifications=service, remote=remote))
            with TestClient(app) as client:
                response = client.put("/api/notifications", json={"channels": [{"type": "telegram", "options": {"bot_token": "never-echo"}}]})
                self.assertEqual(response.status_code, 200)
                self.assertNotIn("never-echo", response.text)
                self.assertNotIn("never-echo", client.get("/api/notifications").text)
                response = client.put("/api/notifications", json={"channels": [{"options": {"bot_token": "never-echo"}}]})
                self.assertEqual(response.status_code, 422)
                self.assertNotIn("never-echo", response.text)
                response = client.put("/api/remote", json={"user": "never-echo" * 100})
                self.assertEqual(response.status_code, 422)
                self.assertNotIn("never-echo", response.text)


class RemoteContractTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.events = EventBus()
        self.store = ProfileStore(self.root / "profiles")
        self.store.save(Profile(name="daily"))
        self.store.save(Profile(name="other"))
        self.runner = Mock()
        self.runner.is_running.return_value = False
        self.runner.run_external = AsyncMock(return_value={"ok": True})
        self.runner.run = AsyncMock()
        self.runner.wait_for_completion = AsyncMock(return_value=RunnerStatus(state="Completed"))
        self.runner.stop = AsyncMock()
        self.runner.capture_image = AsyncMock(return_value=b"png")
        self.service = RemoteControlService(self.root / "remote.json", self.store, self.runner, self.events)
        self.config = RemoteControlConfig(enabled=True, poll_url="https://poll.test", report_url="https://report.test", user="private-user", profile_name="daily")
        self.service.update_config(self.config)

    async def poll(self, tasks):
        with patch("app.remote_control.post_json", return_value={"tasks": tasks}):
            await self.service.poll_once()
        if self.service._worker:
            await self.service._worker

    async def test_inflight_poll_is_discarded_after_disable(self):
        entered, release = threading.Event(), threading.Event()
        def slow_post(*args):
            entered.set()
            release.wait(2)
            return {"tasks": [{"id": "late-stop", "type": "StopTask"}]}
        with patch("app.remote_control.post_json", side_effect=slow_post):
            job = asyncio.create_task(self.service.poll_once())
            await asyncio.to_thread(entered.wait, 1)
            self.service.update_config(RemoteControlConfig(enabled=False))
            release.set()
            await job
        self.runner.stop.assert_not_awaited()
        self.assertEqual(self.service.state["queued"], 0)
        self.service.update_config(self.config)

    async def test_mutating_task_dedup_survives_profile_or_report_changes(self):
        tasks = [{"id": "gacha-1", "type": "Toolbox-GachaOnce"}]
        await self.poll(tasks)
        config = self.service.config
        config.profile_name = "other"
        config.report_url = "https://other-report.test"
        self.service.update_config(config)
        await self.poll(tasks)
        self.assertEqual(self.runner.run_external.await_count, 1)
        self.assertEqual(self.runner.run_external.call_args.args[0].name, "daily")

    async def test_report_failure_does_not_block_other_reports_or_reexecute(self):
        await self.poll([{"id": "one", "type": "HeartBeat"}, {"id": "two", "type": "CaptureImageNow"}])
        def report(url, body):
            if body["task"] == "one":
                raise URLError("offline")
        with patch("app.remote_control._report", side_effect=report):
            await self.service._report_pending(self.service.config)
        records = {record["task"]: record for record in self.service._records.values()}
        self.assertFalse(records["one"]["reported"])
        self.assertTrue(records["two"]["reported"])
        self.assertGreater(records["one"]["retry_at"], 0)
        await self.poll([{"id": "two", "type": "CaptureImageNow"}])
        self.runner.capture_image.assert_awaited_once()

    async def test_fixed_allowlist_rejects_arbitrary_command_and_masks_config(self):
        await self.poll([{"id": "evil", "type": "Custom", "params": "rm -rf /"}])
        record = next(iter(self.service._records.values()))
        self.assertEqual(record["status"], "FAILED")
        self.runner.run.assert_not_awaited()
        public = self.service.public_config()
        self.assertEqual(public["user"], STORED_SECRET)
        self.service.update_config(RemoteControlConfig.model_validate(public))
        self.assertEqual(self.service.config.user, "private-user")

    async def test_corrupt_optional_configuration_does_not_overwrite_or_start(self):
        path = self.root / "broken.json"
        path.write_text("{broken", encoding="utf-8")
        service = RemoteControlService(path, self.store, self.runner, self.events)
        self.assertFalse(service.config.enabled)
        self.assertTrue(service.state["last_error"])
        self.assertEqual(path.read_text(encoding="utf-8"), "{broken")

    async def test_out_of_order_disk_writes_cannot_rollback_new_state(self):
        old_text, old_rev = self.service._serialized()
        self.service._records["new"] = {"task": "new", "status": "SUCCESS", "reported": True}
        new_text, new_rev = self.service._serialized()
        self.service._write(new_text, new_rev)
        self.service._write(old_text, old_rev)
        self.assertIn("new", json.loads(self.service.path.read_text(encoding="utf-8"))["records"])

    async def test_failed_config_save_is_not_applied_in_memory(self):
        self.service.update_config(RemoteControlConfig(enabled=False))
        with patch.object(self.service, "_write", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                self.service.update_config(self.config)
        self.assertFalse(self.service.config.enabled)

    async def test_null_setting_fails_without_killing_worker(self):
        await self.poll([{"id": "null", "type": "Settings-Stage1", "params": None},
                         {"id": "ok", "type": "CaptureImage"}])
        records = {record["task"]: record for record in self.service._records.values()}
        self.assertEqual(records["null"]["status"], "FAILED")
        self.assertEqual(records["ok"]["status"], "SUCCESS")

    async def test_acceptance_write_failure_does_not_execute_or_leave_stuck_pending(self):
        with patch.object(self.service, "_persist", new_callable=AsyncMock, side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                await self.poll([{"id": "not-accepted", "type": "Toolbox-GachaOnce"}])
        self.runner.run_external.assert_not_awaited()
        self.assertEqual(self.service._records, {})

    async def test_changed_endpoint_cannot_reuse_masked_user(self):
        public = self.service.public_config()
        public["poll_url"] = "https://other-poll"
        with self.assertRaises(ValueError):
            self.service.update_config(RemoteControlConfig.model_validate(public))


class ImageInferenceDiagnosticsTest(unittest.TestCase):
    def test_image_quantization_matches_palette_and_covers_grid(self):
        image = Image.new("RGB", (20, 30), (34, 34, 34))
        raw = io.BytesIO()
        image.save(raw, "PNG")
        encoded = base64.b64encode(raw.getvalue()).decode()
        result = pixel_paint(encoded)
        self.assertEqual(len(result["groups"]), 1)
        self.assertEqual(result["groups"][0]["color"], 0)
        self.assertEqual(len(result["groups"][0]["points"]), 576)
        self.assertTrue(result["preview"].startswith("data:image/png;base64,"))
        self.assertEqual(Image.open(io.BytesIO(background_image(encoded))).format, "JPEG")
        with self.assertRaises(ValueError):
            pixel_paint("not-an-image")

    def test_inference_sets_user_directory_before_static_options(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            order = []
            library = Mock()
            library.AsstSetUserDir.side_effect = lambda *args: order.append("user") or True
            library.AsstSetStaticOption.side_effect = lambda *args: order.append("static") or True
            with patch("app.inference.platform.system", return_value="Linux"), patch("app.inference.ctypes.CDLL", return_value=library):
                prepare_inference(root, InferenceConfig(backend="webgpu", device=2), root / "user")
                self.assertEqual(order, ["user", "static"])
                self.assertEqual(library.AsstSetStaticOption.call_args.args, (2, b"webgpu:2"))
                prepare_inference(root, InferenceConfig(backend="webgpu", device=2), root / "user")
                self.assertEqual(order, ["user", "static"])
                with self.assertRaises(RuntimeError):
                    prepare_inference(root, InferenceConfig(backend="cpu"), root / "user")

    def test_corrupt_inference_config_uses_default_and_preserves_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "data" / "inference.json"
            path.parent.mkdir()
            path.write_text("{broken", encoding="utf-8")
            self.assertEqual(read_inference_config(root).backend, "default")
            self.assertTrue(inference_config_error(root))
            self.assertEqual(path.read_text(encoding="utf-8"), "{broken")

    def test_log_zip_excludes_raw_core_logs_and_redacts_urls_and_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "debug").mkdir()
            (root / "debug" / "asst.log").write_text("never-share-core", encoding="utf-8")
            archive = build_log_archive([], [{"message": 'Authorization: Bearer never-share-auth',
                                            "details": {"password": "never-share-pass"},
                                            "url": "https://api.telegram.org/botnever-share-url/sendMessage"}], root)
        with ZipFile(io.BytesIO(archive)) as zipped:
            self.assertNotIn("core/asst.log", zipped.namelist())
            content = zipped.read("web-logs.json").decode()
            self.assertNotIn("never-share", content)

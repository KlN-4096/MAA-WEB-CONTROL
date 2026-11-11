import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

from app.events import EventBus
from app.maa_adapter import OfficialMaaAdapter


class NativeIdle:
    def start(self):
        return True

    def running(self):
        return False

    def stop(self):
        return True


class CallbackBarrierTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.events = EventBus()
        self.adapter = OfficialMaaAdapter(Path(self.temp.name), Path(self.temp.name), python_dir=None, events=self.events, poll_interval=0)
        self.adapter._asst = NativeIdle()
        self.adapter._queued_ids = {17}

    async def test_native_idle_does_not_finish_before_matching_callbacks_are_consumed(self):
        job = asyncio.create_task(self.adapter.start())
        await asyncio.sleep(.02)
        self.assertFalse(job.done())
        self.adapter._handle_callback(3, json.dumps({"finished_tasks": [16]}))
        await asyncio.sleep(.02)
        self.assertFalse(job.done())
        self.adapter._handle_callback(10000, json.dumps({"taskid": 17}))
        self.adapter._handle_callback(3, json.dumps({"finished_tasks": [17]}))
        self.assertTrue(await asyncio.wait_for(job, 1))
        self.assertEqual(self.adapter.task_chain_status, "Failed")
        self.assertEqual(self.events.recent()[-2].detail["details"]["finished_tasks"], [17])

    async def test_missing_terminal_is_failure_not_success(self):
        with patch("app.maa_adapter.CALLBACK_DRAIN_TIMEOUT_SECONDS", .03):
            with self.assertRaises(RuntimeError):
                await self.adapter.start()

    async def test_native_fatal_error_followed_by_stopped_keeps_failure(self):
        await self.adapter.start(wait=False)
        self.adapter._handle_callback(10000, json.dumps({"taskid": 17, "details": {"error": "OutOfMemory"}}))
        self.adapter._handle_callback(10004, json.dumps({"taskid": 17}))
        await asyncio.wait_for(self.adapter.wait_until_idle(), 1)
        self.assertEqual(self.adapter.task_chain_status, "Failed")

    async def test_stop_clears_unstarted_ids_before_next_native_queue(self):
        await self.adapter.stop()
        self.assertEqual(self.adapter._queued_ids, set())
        self.adapter._queued_ids = {18}
        await self.adapter.start(wait=False)
        self.adapter._handle_callback(3, json.dumps({"taskid": 18, "finished_tasks": [18]}))
        await asyncio.wait_for(self.adapter.wait_until_idle(), 1)
        self.assertEqual(self.adapter._active_ids, {18})

    async def test_explicit_stop_before_native_task_start_does_not_require_nonexistent_callback(self):
        await self.adapter.start(wait=False)
        await self.adapter.stop()
        await asyncio.wait_for(self.adapter.wait_until_idle(), 1)
        self.assertEqual(self.adapter.task_chain_status, "Stopped")
        self.assertFalse(self.adapter._faulted)

    async def test_capture_requires_success_callback_and_never_reads_a_new_instance(self):
        class CaptureNative(NativeIdle):
            _Asst__lib = Mock()
            _Asst__ptr = 123
        native = CaptureNative()
        self.adapter._asst = native
        self.adapter._loop = asyncio.get_running_loop()
        self.adapter.connection_target = ("adb", "one", "Official")
        native._Asst__lib.AsstAsyncScreencap.return_value = 99
        with patch.object(self.adapter, "_read_image", new_callable=AsyncMock) as read:
            job = asyncio.create_task(self.adapter.capture_image())
            await asyncio.sleep(.02)
            self.adapter._handle_callback(4, json.dumps({"what": "Screencap", "async_call_id": 99, "details": {"ret": False}}))
            with self.assertRaisesRegex(RuntimeError, "未发送缓存"):
                await job
            read.assert_not_awaited()
            job = asyncio.create_task(self.adapter.capture_image())
            await asyncio.sleep(.02)
            self.adapter._asst = NativeIdle()
            self.adapter._handle_callback(4, json.dumps({"what": "Screencap", "async_call_id": 99, "details": {"ret": True}}))
            with self.assertRaisesRegex(RuntimeError, "连接已改变"):
                await job
            read.assert_not_awaited()
        self.assertEqual(native._Asst__lib.AsstAsyncScreencap.call_args.args, (123, False))

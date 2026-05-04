import asyncio
import tempfile
import unittest
from pathlib import Path

from app.events import EventBus
from app.logs import MaaLogService, PLACEHOLDER_PNG
from app.maa_adapter import OfficialMaaAdapter, SCREENSHOT_BUFFER_SIZE, create_maa_adapter
from app.models import AdbConfig, AppendCall, Profile
from app.runner import DryRunMaaAdapter


class FakeAsst:
    load_calls = []
    instances = []
    image_error = None
    image_payload = b"png"

    @classmethod
    def reset(cls):
        cls.load_calls = []
        cls.instances = []
        cls.image_error = None
        cls.image_payload = b"png"

    @staticmethod
    def load(path, incremental_path=None, user_dir=None):
        FakeAsst.load_calls.append((path, incremental_path, user_dir))
        return True

    def __init__(self, callback=None, arg=None):
        self.callback = callback
        self.instance_option_calls = []
        self.connect_calls = []
        self.append_calls = []
        self.start_calls = 0
        self.running_calls = 0
        self.stop_calls = 0
        self.image_sizes = []
        self.running_values = [True, False]
        FakeAsst.instances.append(self)

    def connect(self, adb_path, address, config="General"):
        self.connect_calls.append((adb_path, address, config))
        return True

    def set_instance_option(self, key, value):
        self.instance_option_calls.append((key, value))
        return True

    def append_task(self, type_name, params):
        self.append_calls.append((type_name, params))
        return 123

    def start(self):
        self.start_calls += 1
        if self.callback is not None:
            self.callback(10001, b'{"what":"started"}', None)
        return True

    def running(self):
        self.running_calls += 1
        return self.running_values.pop(0) if self.running_values else False

    def stop(self):
        self.stop_calls += 1
        return True

    def get_image(self, size):
        self.image_sizes.append(size)
        if FakeAsst.image_error is not None:
            raise FakeAsst.image_error
        return FakeAsst.image_payload


class MaaAdapterFactoryTest(unittest.TestCase):
    def test_factory_defaults_to_dry_run(self):
        adapter = create_maa_adapter(Path("E:/Project/Python/maa-web-control"), EventBus(), env={})

        self.assertIsInstance(adapter, DryRunMaaAdapter)

    def test_official_mode_requires_core_dir(self):
        with self.assertRaisesRegex(RuntimeError, "MAA_CORE_DIR is required"):
            create_maa_adapter(
                Path("E:/Project/Python/maa-web-control"),
                EventBus(),
                env={"MAA_ADAPTER": "official"},
            )

    def test_official_mode_prefers_core_dir_python_wrapper(self):
        with tempfile.TemporaryDirectory() as directory:
            core_dir = Path(directory) / "MAA"
            python_dir = core_dir / "Python"
            python_dir.mkdir(parents=True)

            adapter = create_maa_adapter(
                Path("E:/Project/Python/maa-web-control"),
                EventBus(),
                env={"MAA_ADAPTER": "official", "MAA_CORE_DIR": str(core_dir)},
                asst_cls=FakeAsst,
            )

        self.assertIsInstance(adapter, OfficialMaaAdapter)
        self.assertEqual(adapter._python_dir, python_dir)


class OfficialMaaAdapterTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        FakeAsst.reset()

    async def test_fake_asst_loads_connects_appends_starts_waits_and_stops(self):
        with tempfile.TemporaryDirectory() as directory:
            events = EventBus()
            adapter = OfficialMaaAdapter(
                core_dir=Path("D:/MAA"),
                python_dir=None,
                user_dir=Path(directory) / "maa-user",
                connect_config="EnvConfig",
                asst_cls=FakeAsst,
                events=events,
                poll_interval=0,
            )
            profile = Profile(
                name="daily",
                adb=AdbConfig(
                    address="127.0.0.1:5555",
                    adb_path="adb",
                    connect_config={"preset": "ProfileConfig"},
                ),
            )

            connected = await adapter.connect(profile)
            task_id = await adapter.append_task(AppendCall(task_id="award", type="Award", params={"enable": True}))
            started = await adapter.start()
            stopped = await adapter.stop()
            await asyncio.sleep(0)

        fake = FakeAsst.instances[0]
        self.assertTrue(connected)
        self.assertEqual(task_id, 123)
        self.assertTrue(started)
        self.assertTrue(stopped)
        self.assertEqual(FakeAsst.load_calls[0][0], Path("D:/MAA"))
        self.assertEqual(fake.instance_option_calls, [(6, "Official")])
        self.assertEqual(fake.connect_calls, [("adb", "127.0.0.1:5555", "ProfileConfig")])
        self.assertEqual(fake.append_calls, [("Award", {"enable": True})])
        self.assertEqual(fake.start_calls, 1)
        self.assertEqual(fake.running_calls, 2)
        self.assertEqual(fake.stop_calls, 1)

    async def test_get_image_passes_wrapper_buffer_size(self):
        FakeAsst.image_payload = PLACEHOLDER_PNG + (b"\x00" * 16)
        with tempfile.TemporaryDirectory() as directory:
            adapter = OfficialMaaAdapter(
                core_dir=Path("D:/MAA"),
                python_dir=None,
                user_dir=Path(directory),
                asst_cls=FakeAsst,
                events=EventBus(),
                poll_interval=0,
            )

            await adapter.connect(Profile(name="daily"))
            image = await adapter.get_image()

        fake = FakeAsst.instances[0]
        self.assertEqual(image, PLACEHOLDER_PNG)
        self.assertEqual(fake.image_sizes, [SCREENSHOT_BUFFER_SIZE])
        self.assertIsNone(adapter.last_image_error)

    async def test_get_image_records_wrapper_errors(self):
        FakeAsst.image_error = TypeError("missing required positional argument: 'size'")
        with tempfile.TemporaryDirectory() as directory:
            adapter = OfficialMaaAdapter(
                core_dir=Path("D:/MAA"),
                python_dir=None,
                user_dir=Path(directory),
                asst_cls=FakeAsst,
                events=EventBus(),
                poll_interval=0,
            )

            await adapter.connect(Profile(name="daily"))
            image = await adapter.get_image()

        self.assertIsNone(image)
        self.assertIn("TypeError", adapter.last_image_error or "")

    async def test_callback_is_published_to_event_bus(self):
        with tempfile.TemporaryDirectory() as directory:
            events = EventBus()
            adapter = OfficialMaaAdapter(
                core_dir=Path("D:/MAA"),
                python_dir=None,
                user_dir=Path(directory),
                asst_cls=FakeAsst,
                events=events,
                poll_interval=0,
            )
            profile = Profile(name="daily")

            await adapter.connect(profile)
            await adapter.start()
            await asyncio.sleep(0)

        recent = events.recent()
        callback_event = [event for event in recent if event.type == "maa.callback"][-1]
        self.assertEqual(callback_event.detail["message"], 10001)
        self.assertEqual(callback_event.detail["details"], {"what": "started"})

    async def test_task_chain_callbacks_publish_semantic_events_and_status(self):
        with tempfile.TemporaryDirectory() as directory:
            events = EventBus()
            logs = MaaLogService(events)
            adapter = OfficialMaaAdapter(
                core_dir=Path("D:/MAA"),
                python_dir=None,
                user_dir=Path(directory),
                asst_cls=FakeAsst,
                events=events,
                log_service=logs,
                poll_interval=0,
            )

            await adapter.connect(Profile(name="daily"))
            FakeAsst.instances[0].callback(10000, b'{"taskchain":"Fight"}', None)
            await asyncio.sleep(0)

        recent = events.recent()
        self.assertEqual(recent[-1].type, "maa.task_chain.error")
        self.assertEqual(recent[-1].level, "error")
        self.assertEqual(adapter.task_chain_status, "Failed")
        log_event = [event for event in recent if event.type == "maa.log.item"][-1]
        self.assertEqual(log_event.detail["color_key"], "ErrorLogBrush")
        self.assertEqual(log_event.detail["split_mode"], "Both")

    async def test_callback_maps_common_subtask_extra_info_to_log_item(self):
        with tempfile.TemporaryDirectory() as directory:
            events = EventBus()
            logs = MaaLogService(events)
            adapter = OfficialMaaAdapter(
                core_dir=Path("D:/MAA"),
                python_dir=None,
                user_dir=Path(directory),
                asst_cls=FakeAsst,
                events=events,
                log_service=logs,
                poll_interval=0,
            )

            await adapter.connect(Profile(name="daily"))
            details = b'{"what":"EnterFacility","details":{"facility":"Manufacture","index":0}}'
            FakeAsst.instances[0].callback(20003, details, None)
            await asyncio.sleep(0)

        log_event = [event for event in events.recent() if event.type == "maa.log.item"][-1]
        self.assertEqual(log_event.message, "当前设施: 制造站 01")
        self.assertEqual(log_event.detail["split_mode"], "Before")
        self.assertEqual(log_event.detail["raw"]["what"], "EnterFacility")


if __name__ == "__main__":
    unittest.main()

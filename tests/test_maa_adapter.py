import asyncio
import tempfile
import unittest
from pathlib import Path

from app.events import EventBus
from app.maa_adapter import OfficialMaaAdapter, create_maa_adapter
from app.models import AdbConfig, AppendCall, Profile
from app.runner import DryRunMaaAdapter


class FakeAsst:
    load_calls = []
    instances = []

    @classmethod
    def reset(cls):
        cls.load_calls = []
        cls.instances = []

    @staticmethod
    def load(path, incremental_path=None, user_dir=None):
        FakeAsst.load_calls.append((path, incremental_path, user_dir))
        return True

    def __init__(self, callback=None, arg=None):
        self.callback = callback
        self.connect_calls = []
        self.append_calls = []
        self.start_calls = 0
        self.running_calls = 0
        self.stop_calls = 0
        self.running_values = [True, False]
        FakeAsst.instances.append(self)

    def connect(self, adb_path, address, config="General"):
        self.connect_calls.append((adb_path, address, config))
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
        self.assertEqual(fake.connect_calls, [("adb", "127.0.0.1:5555", "ProfileConfig")])
        self.assertEqual(fake.append_calls, [("Award", {"enable": True})])
        self.assertEqual(fake.start_calls, 1)
        self.assertEqual(fake.running_calls, 2)
        self.assertEqual(fake.stop_calls, 1)

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
        self.assertEqual(recent[-1].type, "maa.callback")
        self.assertEqual(recent[-1].detail["message"], 10001)
        self.assertEqual(recent[-1].detail["details"], {"what": "started"})


if __name__ == "__main__":
    unittest.main()

import tempfile
import unittest
from pathlib import Path

from app.events import EventBus
from app.scheduler import SchedulerService


class SchedulerServiceTest(unittest.IsolatedAsyncioTestCase):
    async def test_stop_waits_for_background_loop_to_finish(self):
        with tempfile.TemporaryDirectory() as directory:
            scheduler = SchedulerService(EventBus(), Path(directory) / "scheduler.json")
            scheduler.start()

            self.assertIsNotNone(scheduler._task)
            task = scheduler._task
            self.assertFalse(task.done())

            await scheduler.stop()

            self.assertTrue(task.done())
            self.assertIsNone(scheduler._task)


if __name__ == "__main__":
    unittest.main()

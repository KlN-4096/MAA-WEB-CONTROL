import tempfile
import unittest
from pathlib import Path

from app.models import Profile, TaskDefinition
from app.storage import ProfileStore


class ProfileStoreTest(unittest.TestCase):
    def test_save_and_load_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ProfileStore(Path(directory))
            profile = Profile(name="daily", tasks=[TaskDefinition(id="award", type="Award")])

            store.save(profile)
            loaded = store.load("daily")

            self.assertEqual(loaded.name, "daily")
            self.assertEqual(loaded.tasks[0].type, "Award")

    def test_rejects_path_like_name(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ProfileStore(Path(directory))

            with self.assertRaises(ValueError):
                store.load("../bad")

    def test_ensure_defaults_creates_missing_profiles_without_overwriting(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ProfileStore(Path(directory))
            existing = Profile(
                name="daily-shoucai",
                description="custom",
                tasks=[TaskDefinition(id="award", type="Award")],
            )
            store.save(existing)

            created = store.ensure_defaults(
                [
                    Profile(
                        name="daily-shoucai",
                        description="default",
                        tasks=[TaskDefinition(id="award", type="Award")],
                    ),
                    Profile(name="daily-shualizhi", tasks=[TaskDefinition(id="fight", type="Fight")]),
                ]
            )

            self.assertEqual(created, ["daily-shualizhi"])
            self.assertEqual(store.load("daily-shoucai").description, "custom")
            self.assertEqual(store.list_names(), ["daily-shoucai", "daily-shualizhi"])


if __name__ == "__main__":
    unittest.main()

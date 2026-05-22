import asyncio
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import create_api_router
from app.events import EventBus
from app.maa_versions import read_core_version, read_resource_version
from app.models import UpdateConfig
from app.runner import MaaRunnerService
from app.storage import ProfileStore
from app.update_checking import UpdateChecker
from app.update_service import UpdateService
from app.version import WEB_VERSION


class VersionAsst:
    @staticmethod
    def get_version(_self):
        return "v6.9.5"


class FakeAdapter:
    task_chain_status = "Completed"

    def __init__(self, core_dir: Path) -> None:
        self._core_dir = core_dir
        self._asst_cls = VersionAsst

    async def connect(self, profile):
        return True

    async def append_task(self, call):
        return 1

    async def start(self):
        return True

    async def stop(self):
        return True


class VersionUpdateTest(unittest.TestCase):
    def test_core_version_accepts_official_wrapper_instance_signature(self):
        self.assertEqual(read_core_version(FakeAdapter(Path("."))), "v6.9.5")

    def test_resource_version_uses_default_client_version_json(self):
        with tempfile.TemporaryDirectory() as directory:
            core_dir = Path(directory)
            version_path = core_dir / "resource" / "version.json"
            write_json(version_path, resource_json("CN Activity", "CN Pool", "2026-05-12 01:02:03.456"))

            info = read_resource_version(core_dir, "Official")

        self.assertEqual(info["version"], "CN Activity")
        self.assertEqual(info["timestamp"], 1778547723)

    def test_resource_version_uses_global_client_name_and_default_time(self):
        with tempfile.TemporaryDirectory() as directory:
            core_dir = Path(directory)
            write_json(core_dir / "resource" / "version.json", resource_json("CN", "CN Pool", "2026-05-12 01:02:03.456"))
            write_json(
                core_dir / "resource" / "global" / "YoStarEN" / "resource" / "version.json",
                resource_json("EN Activity", "EN Pool", "2026-05-13 01:02:03.456"),
            )

            info = read_resource_version(core_dir, "YoStarEN")

        self.assertEqual(info["version"], "EN Activity")
        self.assertEqual(info["timestamp"], 1778547723)

    def test_mirror_core_check_falls_back_to_maa_api_on_error(self):
        seen_urls: list[str] = []

        def fetch(url: str) -> dict:
            seen_urls.append(url)
            if "mirrorchyan.com" in url:
                return {"code": 1, "msg": "bad"}
            return {"version": "v6.9.6", "details": {"assets": [], "html_url": "https://example.test"}}

        checker = UpdateChecker(UpdateConfig(update_source="MirrorChyan"), fetch)
        result = checker.check_core("v6.9.5")

        self.assertEqual(result["source"], "MaaApi")
        self.assertTrue(result["has_update"])
        self.assertTrue(any("mirrorchyan.com" in url for url in seen_urls))
        self.assertTrue(any("api.maa.plus" in url for url in seen_urls))

    def test_update_resource_from_github_merges_resource_package(self):
        async def run() -> dict:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                core_dir = root / "MAA"
                write_json(core_dir / "resource" / "version.json", resource_json("Old", "Old Pool", "2026-05-12 01:02:03.456"))
                package = root / "resource.zip"
                make_github_resource_zip(package, resource_json("New", "New Pool", "2026-05-13 01:02:03.456"))
                service = make_service(root, core_dir)

                def download(_url: str, target: Path) -> None:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if "StageActivityV2.json" in _url:
                        write_json(target, stage_activity_json())
                        return
                    target.write_bytes(package.read_bytes())

                service._download_file = download
                service._fetch_json = lambda _url: {"version": "v6.9.5", "data": {"version_name": "2026-05-13 01:02:03.456"}}
                result = await service.update_resource("Official")
                result["stage_activity"] = json.loads((core_dir / "cache" / "gui" / "StageActivityV2.json").read_text(encoding="utf-8"))
                return result

        result = asyncio.run(run())

        self.assertTrue(result["ok"])
        self.assertEqual(result["version"], "New")
        self.assertEqual(result["stage_activity"]["Official"]["sideStoryStage"]["Act"]["Stages"][0]["Value"], "EA-8")

    def test_update_config_round_trip_and_version_api(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            core_dir = root / "MAA"
            write_json(core_dir / "resource" / "version.json", resource_json("CN", "Pool", "2026-05-12 01:02:03.456"))
            service = make_service(root, core_dir)
            app = FastAPI()
            app.include_router(create_api_router(
                ProfileStore(root / "profiles"),
                service._runner,
                EventBus(),
                project_root=root,
                update_service=service,
            ))
            client = TestClient(app)

            put = client.put("/api/update/config", json={"update_source": "MirrorChyan", "mirror_chyan_cdk": "x" * 24})
            version = client.get("/api/version?client_type=Official")

        self.assertEqual(put.status_code, 200)
        self.assertEqual(put.json()["update_source"], "MirrorChyan")
        self.assertEqual(version.status_code, 200)
        self.assertEqual(version.json()["web_version"], WEB_VERSION)
        self.assertEqual(version.json()["core_version"], "v6.9.5")
        self.assertEqual(version.json()["resource_version"], "CN")


def make_service(root: Path, core_dir: Path) -> UpdateService:
    events = EventBus()
    runner = MaaRunnerService(FakeAdapter(core_dir), events)
    return UpdateService(root / "data" / "update_config.json", root / "cache", runner, events)


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


def resource_json(activity: str, pool: str, last_updated: str) -> dict:
    return {
        "activity": {"name": activity, "time": 1},
        "gacha": {"pool": pool, "time": 1},
        "last_updated": last_updated,
    }


def stage_activity_json() -> dict:
    return {
        "Official": {
            "sideStoryStage": {
                "Act": {"Stages": [{"Display": "EA-8", "Value": "EA-8"}]},
            },
        },
    }


def make_github_resource_zip(path: Path, version: dict) -> None:
    with zipfile.ZipFile(path, "w") as package:
        package.writestr("MaaResource-main/resource/version.json", json.dumps(version))


if __name__ == "__main__":
    unittest.main()

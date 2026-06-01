import asyncio
import json
import subprocess
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

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

    def test_linux_core_check_selects_linux_asset(self):
        assets = [
            {"name": "MAA-v6.10.7-win-x64.zip", "browser_download_url": "https://example.test/win.zip"},
            {"name": "MAA-v6.10.7-linux-x86_64.tar.gz", "browser_download_url": "https://example.test/linux.tar.gz"},
        ]

        def fetch(_url: str) -> dict:
            return {"version": "v6.10.7", "details": {"assets": assets, "html_url": "https://example.test"}}

        with patch("app.update_helpers.platform.system", return_value="Linux"), \
                patch("app.update_helpers.platform.machine", return_value="x86_64"):
            result = UpdateChecker(UpdateConfig(), fetch).check_core("v6.9.5")

        self.assertTrue(result["has_update"])
        self.assertEqual(result["asset"]["name"], "MAA-v6.10.7-linux-x86_64.tar.gz")

    def test_linux_core_update_runs_maa_cli_and_schedules_restart(self):
        async def run() -> dict:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                core_dir = root / "MAA"
                write_json(core_dir / "resource" / "version.json", resource_json("CN", "Pool", "2026-05-12 01:02:03.456"))
                maa_cli = core_dir / "maa"
                maa_cli.write_text("#!/bin/sh\n", encoding="utf-8")
                maa_cli.chmod(0o755)
                (core_dir / "libMaaCore.so").write_text("core", encoding="utf-8")
                restarted: list[bool] = []
                service = make_service(root, core_dir, restart_callback=lambda: restarted.append(True))
                checked = {"core": {"has_update": True, "latest": "v6.10.7"}}
                completed = subprocess.CompletedProcess(
                    [str(maa_cli), "update"],
                    0,
                    stdout="updated",
                    stderr="",
                )
                library_dir = subprocess.CompletedProcess([str(maa_cli), "dir", "library"], 0, stdout=str(core_dir), stderr="")
                resource_dir = subprocess.CompletedProcess([str(maa_cli), "dir", "resource"], 0, stdout=str(core_dir / "resource"), stderr="")
                with patch("app.update_service.platform.system", return_value="Linux"), \
                        patch("app.update_helpers.subprocess.run", side_effect=[completed, library_dir, resource_dir]) as run_mock:
                    result = await service.update_core("Official", checked=checked)
                result["called_args"] = run_mock.call_args_list[0].args[0]
                result["restarted"] = restarted
                return result

        result = asyncio.run(run())

        self.assertTrue(result["ok"])
        self.assertEqual(result["called_args"], [
            str(Path(result["core_dir"]) / "maa"),
            "update",
            "--batch",
            "-t",
            "0",
            "stable",
        ])
        self.assertEqual(result["restarted"], [True])
        self.assertTrue(result["restart_scheduled"])

    def test_linux_core_update_installs_full_package_asset(self):
        async def run() -> dict:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                core_dir = root / "MAA"
                write_json(core_dir / "resource" / "tasks" / "stale.json", {"old": True})
                package_root = root / "package"
                (package_root / "resource").mkdir(parents=True)
                (package_root / "Python").mkdir()
                (package_root / "libMaaCore.so").write_text("new core", encoding="utf-8")
                (package_root / "Python" / "asst.py").write_text("wrapper", encoding="utf-8")
                write_json(package_root / "resource" / "version.json", resource_json("New", "Pool", "2026-05-13 01:02:03.456"))
                package = root / "MAA-v6.10.7-linux-x86_64.tar.gz"
                with tarfile.open(package, "w:gz") as archive:
                    for item in package_root.rglob("*"):
                        archive.add(item, arcname=item.relative_to(package_root))
                service = make_service(root, core_dir, restart_callback=lambda: None)
                checked = {
                    "core": {
                        "has_update": True,
                        "latest": "v6.10.7",
                        "asset": {
                            "name": package.name,
                            "browser_download_url": "https://example.test/linux.tar.gz",
                        },
                    },
                }

                def download(_url: str, target: Path) -> None:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(package.read_bytes())

                service._download_file = download
                with patch("app.update_service.platform.system", return_value="Linux"):
                    result = await service.update_core("Official", checked=checked)
                result["core_text"] = (core_dir / "libMaaCore.so").read_text(encoding="utf-8")
                result["wrapper_exists"] = (core_dir / "Python" / "asst.py").exists()
                result["stale_exists"] = (core_dir / "resource" / "tasks" / "stale.json").exists()
                return result

        result = asyncio.run(run())

        self.assertTrue(result["ok"])
        self.assertEqual(result["core_text"], "new core")
        self.assertTrue(result["wrapper_exists"])
        self.assertFalse(result["stale_exists"])

    def test_linux_core_update_force_installs_when_core_was_not_installed_by_maa_cli(self):
        async def run() -> dict:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                core_dir = root / "MAA"
                write_json(core_dir / "resource" / "version.json", resource_json("CN", "Pool", "2026-05-12 01:02:03.456"))
                maa_cli = core_dir / "maa"
                maa_cli.write_text("#!/bin/sh\n", encoding="utf-8")
                maa_cli.chmod(0o755)
                service = make_service(root, core_dir, restart_callback=lambda: None)
                checked = {"core": {"has_update": True, "latest": "v6.10.7"}}
                failed_update = subprocess.CompletedProcess(
                    [str(maa_cli), "update"],
                    1,
                    stdout="",
                    stderr=f"Error: MaaCore found at {core_dir} but not installed by maa, aborting",
                )
                forced_install = subprocess.CompletedProcess(
                    [str(maa_cli), "install"],
                    0,
                    stdout="installed",
                    stderr="",
                )
                managed_lib = root / "managed" / "lib"
                managed_resource = root / "managed" / "resource"
                (managed_lib / "libMaaCore.so").parent.mkdir(parents=True, exist_ok=True)
                (managed_lib / "libMaaCore.so").write_text("new core", encoding="utf-8")
                write_json(managed_resource / "version.json", resource_json("New", "Pool", "2026-05-13 01:02:03.456"))
                library_dir = subprocess.CompletedProcess(
                    [str(maa_cli), "dir", "library"],
                    0,
                    stdout=str(managed_lib),
                    stderr="",
                )
                resource_dir = subprocess.CompletedProcess(
                    [str(maa_cli), "dir", "resource"],
                    0,
                    stdout=str(managed_resource),
                    stderr="",
                )
                with patch("app.update_service.platform.system", return_value="Linux"), \
                        patch("app.update_helpers.subprocess.run", side_effect=[
                            failed_update,
                            forced_install,
                            library_dir,
                            resource_dir,
                        ]) as run_mock:
                    result = await service.update_core("Official", checked=checked)
                result["commands"] = [call.args[0] for call in run_mock.call_args_list]
                result["synced_core"] = (core_dir / "libMaaCore.so").read_text(encoding="utf-8")
                result["synced_resource"] = json.loads((core_dir / "resource" / "version.json").read_text(encoding="utf-8"))
                return result

        result = asyncio.run(run())

        self.assertTrue(result["ok"])
        self.assertEqual(result["commands"][1][1:], ["install", "--force", "--batch", "-t", "0", "stable"])
        self.assertIn("maa-cli 强制安装完成", result["message"])
        self.assertEqual(result["synced_core"], "new core")
        self.assertEqual(result["synced_resource"]["activity"]["name"], "New")

    def test_core_update_rejects_while_runner_is_active(self):
        async def run() -> dict:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                core_dir = root / "MAA"
                write_json(core_dir / "resource" / "version.json", resource_json("CN", "Pool", "2026-05-12 01:02:03.456"))
                service = make_service(root, core_dir)
                service._runner._status.state = "Running"
                return await service.update_core("Official", checked={"core": {"has_update": True, "latest": "v6.10.7"}})

        result = asyncio.run(run())

        self.assertFalse(result["ok"])
        self.assertIn("任务正在运行", result["message"])

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


def make_service(root: Path, core_dir: Path, restart_callback=None) -> UpdateService:
    events = EventBus()
    runner = MaaRunnerService(FakeAdapter(core_dir), events)
    return UpdateService(root / "data" / "update_config.json", root / "cache", runner, events, restart_callback=restart_callback)


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

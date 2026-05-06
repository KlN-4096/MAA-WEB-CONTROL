import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import create_api_router
from app.events import EventBus
from app.options import build_ui_options
from app.resource_paths import resolve_maa_root
from app.runner import DryRunMaaAdapter, MaaRunnerService
from app.storage import ProfileStore


class ResourceOptionsTest(unittest.TestCase):
    def test_resolve_maa_root_prefers_adapter_then_config_then_env(self):
        with tempfile.TemporaryDirectory() as directory:
            project_root = Path(directory)
            configured = project_root / "configured-maa"
            (project_root / "data").mkdir()
            (project_root / "data" / "adapter.json").write_text(
                json.dumps({"adapter": "official", "core_dir": str(configured)}),
                encoding="utf-8",
            )

            adapter = type("Adapter", (), {"_core_dir": project_root / "adapter-maa"})()
            self.assertEqual(resolve_maa_root(adapter=adapter, project_root=project_root), project_root / "adapter-maa")
            self.assertEqual(resolve_maa_root(project_root=project_root, env={"MAA_CORE_DIR": "env-maa"}), configured)

        with tempfile.TemporaryDirectory() as directory:
            project_root = Path(directory)
            self.assertEqual(
                resolve_maa_root(project_root=project_root, env={"MAA_CORE_DIR": "env-core", "MAA_SOURCE_DIR": "env-source"}),
                Path("env-core"),
            )
            self.assertEqual(resolve_maa_root(project_root=project_root, env={"MAA_SOURCE_DIR": "env-source"}), Path("env-source"))

    def test_build_ui_options_returns_client_scoped_resource_values(self):
        with tempfile.TemporaryDirectory() as directory:
            core = Path(directory)
            self._write_resource_fixture(core)

            options = build_ui_options(core, now_utc=datetime(2026, 5, 5, 12, tzinfo=timezone.utc))

        self.assertEqual(options["resource"]["root"], str(core))
        self.assertIn("Bilibili", options["by_client"])
        self.assertIn({"label": "Bilibili服", "value": "Bilibili"}, options["resource"]["clients"])
        self.assertIn({"label": "龙门币-6/5", "value": "CE-6"}, options["by_client"]["Official"]["stages"])
        self.assertIn({"label": "当期剿灭", "value": "Annihilation"}, options["by_client"]["Official"]["stages"])
        self.assertIn(
            {"label": "切尔诺伯格", "value": "Chernobog@Annihilation"},
            options["by_client"]["Official"]["stages"],
        )
        self.assertNotIn({"label": "CE-6", "value": "CE-6"}, options["by_client"]["Official"]["stages"])
        self.assertIn({"label": "EA-8", "value": "EA-8"}, options["by_client"]["Official"]["stages"])
        self.assertIn({"label": "EA-8", "value": "EA-8"}, options["by_client"]["Bilibili"]["stages"])
        self.assertIn({"label": "OS-9", "value": "OS-9"}, options["by_client"]["YoStarEN"]["stages"])
        self.assertIn({"label": "源岩", "value": "30011"}, options["by_client"]["Official"]["drops"])
        self.assertIn({"label": "源岩", "value": "30011"}, options["by_client"]["YoStarEN"]["drops"])
        self.assertNotIn({"label": "双芯片", "value": "3213"}, options["by_client"]["Official"]["drops"])
        self.assertEqual(options["by_client"]["Official"]["drops"][0], {"label": "不选择", "value": ""})
        self.assertEqual(options["by_client"]["Official"]["copilot"]["files"][0]["relative_path"], "demo.json")
        self.assertEqual(options["by_client"]["Official"]["infrast"]["custom_files"][0]["value"], "plan.json")
        self.assertIn("萨卡兹", options["by_client"]["Official"]["roguelike"]["operators"])
        self.assertEqual(
            options["by_client"]["Official"]["stage_tips"]["text"],
            "\n".join([
                "今日关卡小提示:",
                "[相变临界] 剩余天数: 9",
                "17-11: 电极单元",
                "17-5: 液化高能气体",
                "CE-6: 龙门币",
                "CA-5: 技能",
                "LS-6: 经验",
                "PR-B-1/2: 术&狙芯片",
                "PR-D-1/2: 近&特芯片",
            ]),
        )

    def test_api_options_uses_project_adapter_config_path(self):
        with tempfile.TemporaryDirectory() as directory:
            project_root = Path(directory)
            core = project_root / "maa"
            self._write_resource_fixture(core)
            (project_root / "data").mkdir()
            (project_root / "data" / "adapter.json").write_text(
                json.dumps({"adapter": "official", "core_dir": str(core)}),
                encoding="utf-8",
            )
            events = EventBus()
            runner = MaaRunnerService(DryRunMaaAdapter(), events)
            store = ProfileStore(project_root / "profiles")
            app = FastAPI()
            app.include_router(create_api_router(store, runner, events, project_root=project_root))

            with TestClient(app) as client:
                response = client.get("/api/options")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["resource"]["root"], str(core))

    def _write_resource_fixture(self, core: Path) -> None:
        self._write_json(core / "resource" / "item_index.json", {
            "30011": {"name": "源岩"},
            "31103": {"name": "液化高能气体"},
            "31113": {"name": "电极单元"},
            "3213": {"name": "双芯片"},
        })
        self._write_json(core / "resource" / "global" / "YoStarEN" / "resource" / "item_index.json", {
            "30011": {"name": "Orirock"},
        })
        self._write_json(core / "cache" / "gui" / "StageActivityV2.json", {
            "Official": {
                "sideStoryStage": {
                    "Act": {"Stages": [{"Display": "EA-8", "Value": "EA-8"}]},
                    "Main17": {
                        "Activity": {
                            "StageName": "相变临界",
                            "UtcStartTime": "2026/05/01 07:00:00",
                            "UtcExpireTime": "2026/05/15 03:59:59",
                            "TimeZone": 8,
                        },
                        "Stages": [
                            {"Display": "17-11", "Value": "17-11", "Drop": "31113"},
                            {"Display": "17-5", "Value": "17-5", "Drop": "31103"},
                        ],
                    },
                },
            },
            "YoStarEN": {"sideStoryStage": {"Act": {"Stages": [{"Display": "OS-9", "Value": "OS-9"}]}}},
        })
        self._write_json(core / "resource" / "roguelike" / "Sarkaz" / "recruitment.json", {
            "priority": [{"opers": [{"name": "维什戴尔", "is_start": True}]}],
        })
        self._write_json(core / "resource" / "copilot" / "demo.json", {})
        self._write_json(core / "resource" / "custom_infrast" / "plan.json", {})

    def _write_json(self, path: Path, data: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    unittest.main()

import json
import shutil
import subprocess
import textwrap
import unittest
from pathlib import Path


HARNESS = r"""
const fs = require("fs");
const vm = require("vm");

// 极简 DOM：按 id 提供 checkbox / input，$ 与 document.querySelectorAll 均由此驱动。
function makeElement(id, value) {
  const isBool = typeof value === "boolean";
  return {
    id,
    type: isBool ? "checkbox" : "text",
    checked: isBool ? value : false,
    value: isBool ? "" : String(value),
  };
}

const FIELDS = __FIELDS__;
const elements = Object.fromEntries(
  Object.entries(FIELDS).map(([id, value]) => [id, makeElement(id, value)])
);

const context = {
  console,
  state: { profile: { adb: { client_type: "Official" }, tasks: [] } },
  document: { querySelectorAll: () => [], getElementById: (id) => elements[id] || null },
};
context.$ = (id) => elements[id] || null;
vm.createContext(context);
for (const file of ["web/tasks/index.js", "web/tasks/fight.js", "web/tasks/recruit.js", "web/tasks/roguelike.js"]) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}
vm.runInContext("$ = (id) => __elements[id] || null;", Object.assign(context, { __elements: elements }));
const result = vm.runInContext("__CALL__", context);
console.log(JSON.stringify(result));
"""


def run_collect(fields: dict, call: str):
    script = HARNESS.replace("__FIELDS__", json.dumps(fields, ensure_ascii=False)).replace("__CALL__", call)
    completed = subprocess.run(
        ["node", "-e", textwrap.dedent(script)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=Path(__file__).resolve().parents[1],
        timeout=30,
    )
    if completed.returncode != 0:
        raise AssertionError(completed.stderr)
    return json.loads(completed.stdout.strip().splitlines()[-1])


class FrontendTaskFormTest(unittest.TestCase):
    def setUp(self):
        if shutil.which("node") is None:
            self.skipTest("node is not available")

    def test_roguelike_collects_official_award_keys(self):
        params = run_collect(
            {
                "paramRoguelikeTheme": "水月",
                "collectibleAward_hot_water": True,
                "collectibleAward_shield": False,
                "collectibleAward_ingot": True,
                "collectibleAward_hope": False,
                "collectibleAward_random": False,
                "collectibleAward_key": True,
                "collectibleAward_dice": False,
            },
            "collectRoguelikeParams()",
        )

        self.assertEqual(
            params["collectible_mode_start_list"],
            {"hot_water": True, "shield": False, "ingot": True, "hope": False, "random": False, "key": True, "dice": False},
        )

    def test_roguelike_no_longer_collects_dead_fields(self):
        params = run_collect({"paramRoguelikeTheme": "萨卡兹", "delay_abort": True}, "collectRoguelikeParams()")

        self.assertNotIn("delay_abort", params)

    def test_roguelike_collects_foldartal_name_and_list(self):
        params = run_collect(
            {
                "paramRoguelikeTheme": "萨米",
                "first_floor_foldartal": True,
                "paramRoguelikeFoldartalName": "生命",
                "paramRoguelikeFoldartals": "风声,感知",
            },
            "collectRoguelikeParams()",
        )

        self.assertTrue(params["first_floor_foldartal"])
        self.assertEqual(params["first_floor_foldartal_name"], "生命")
        self.assertEqual(params["first_floor_foldartals"], ["风声", "感知"])

    def test_fight_auto_restart_drives_client_type(self):
        enabled = run_collect({"auto_restart": True}, "collectFightParams()")
        disabled = run_collect({"auto_restart": False}, "collectFightParams()")

        self.assertEqual(enabled["client_type"], "Official")
        self.assertEqual(disabled["client_type"], "")

    def test_fight_no_longer_collects_dead_fields(self):
        params = run_collect(
            {
                "use_activity_expire": True,
                "hide_series": True,
                "allow_stone_save": True,
                "weekly_schedule": True,
                "use_remaining_sanity_stage": True,
                "paramExpiringMedicineCount": "5",
                "paramStageReset": "CurrentStage",
                "paramRemainingSanityStage": "1-7",
            },
            "collectFightParams()",
        )

        for dead in (
            "use_activity_expire",
            "hide_series",
            "allow_stone_save",
            "weekly_schedule",
            "use_remaining_sanity_stage",
            "expiring_medicine_count",
            "stage_reset",
        ):
            self.assertNotIn(dead, params)

    def test_recruit_collects_force_refresh_separately(self):
        params = run_collect(
            {
                "refresh": True,
                "force_refresh": False,
                "skip_robot": True,
                "reserve_level_1": True,
                "paramExpediteTimes": "3",
            },
            "collectRecruitParams()",
        )

        self.assertTrue(params["refresh"])
        self.assertFalse(params["force_refresh"])
        self.assertTrue(params["skip_robot"])
        self.assertNotIn("reserve_level_1", params)
        self.assertNotIn("expedite_times", params)


if __name__ == "__main__":
    unittest.main()

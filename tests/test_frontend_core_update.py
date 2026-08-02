from __future__ import annotations

import shutil
import subprocess
import textwrap
import unittest
from pathlib import Path


class FrontendCoreUpdateTest(unittest.TestCase):
    def setUp(self) -> None:
        if shutil.which("node") is None:
            self.skipTest("node is not available")

    def test_polling_stops_when_background_update_fails(self):
        script = frontend_harness("""
            apiResponses.push({
              core_version: "v1",
              update: { core_action: { state: "failed", message: "download failed" } }
            });
            try {
              await waitForCoreUpdate("v1");
              throw new Error("polling did not reject");
            } catch (error) {
              if (error.message !== "download failed") throw error;
            }
        """)

        result = run_node(script)

        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)

    def test_polling_survives_restart_and_finishes_on_new_version(self):
        script = frontend_harness("""
            apiResponses.push(new Error("service restarting"));
            apiResponses.push({ core_version: "v2", update: {} });
            await waitForCoreUpdate("v1");
            if (SETTINGS_STATE.updateStatus !== "核心已更新到 v2") {
              throw new Error("unexpected status: " + SETTINGS_STATE.updateStatus);
            }
            if (SETTINGS_STATE.updateStatusLevel !== "ok") {
              throw new Error("unexpected level: " + SETTINGS_STATE.updateStatusLevel);
            }
        """)

        result = run_node(script)

        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)


def frontend_harness(body: str) -> str:
    harness = textwrap.dedent("""
        const fs = require("fs");
        const vm = require("vm");

        const apiResponses = [];
        const context = {
          console,
          SETTINGS_STATE: {
            coreVersion: "v1",
            maaVersion: "v1",
            updateStatus: "",
            updateStatusLevel: "",
            updateState: null,
          },
          api: async () => {
            const value = apiResponses.shift();
            if (value instanceof Error) throw value;
            return value;
          },
          updateClientType: () => "Official",
          refreshUpdateStatusLine: () => {},
          setTimeout: (callback) => { callback(); return 1; },
          clearTimeout: () => {},
          encodeURIComponent,
          Promise,
          Error,
          process,
        };
        vm.createContext(context);
        const source = fs.readFileSync("web/views/settings/sections/update.js", "utf8");
        const pollLimit = source.match(/const CORE_UPDATE_POLL_LIMIT = [^;]+;/)[0];
        const applyStart = source.indexOf("function applyVersionInfo");
        const applyEnd = source.indexOf("function applyUpdateConfig", applyStart);
        const waitStart = source.indexOf("async function waitForCoreUpdate");
        const waitEnd = source.indexOf("function applyVersionInfo", waitStart);
        vm.runInContext(
          `${pollLimit}\nconst CORE_UPDATE_POLL_INTERVAL_MS = 0;\n${source.slice(waitStart, waitEnd)}\n${source.slice(applyStart, applyEnd)}`,
          context
        );

        vm.runInContext(`
          (async () => {
            __BODY__
          })().catch((error) => {
            console.error(error.stack || error.message || String(error));
            process.exitCode = 1;
          });
        `, Object.assign(context, { apiResponses }));
    """)
    return harness.replace("__BODY__", textwrap.dedent(body))


def run_node(script: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["node", "-e", script],
        cwd=Path(__file__).resolve().parents[1],
        text=True,
        capture_output=True,
        timeout=30,
    )


if __name__ == "__main__":
    unittest.main()

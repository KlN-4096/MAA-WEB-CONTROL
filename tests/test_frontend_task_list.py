import shutil
import subprocess
import textwrap
import unittest
from pathlib import Path


class FrontendTaskListTest(unittest.TestCase):
    def test_drop_reorders_original_dragged_task_after_index_shift(self):
        if shutil.which("node") is None:
            self.skipTest("node is not available")

        script = textwrap.dedent(
            r"""
            const fs = require("fs");
            const vm = require("vm");

            const context = {
              console,
              state: {
                profile: {
                  tasks: [
                    { id: "a", type: "StartUp", enabled: true },
                    { id: "b", type: "Fight", enabled: true },
                    { id: "c", type: "CloseDown", enabled: true }
                  ]
                },
                selectedTask: 2
              },
              document: { querySelectorAll: () => [] },
              isProfileEditingLocked: () => false,
              persistSelectedTask: () => {},
              scheduleSave: () => {},
              renderEditor: () => {},
              renderTasks: () => {},
              closeTaskContextMenu: () => {},
              escapeHtml: (value) => String(value),
              $: () => null,
            };
            vm.createContext(context);
            for (const file of ["web/views/basement/taskEditor.js", "web/views/basement/taskList.js"]) {
              vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
            }
            vm.runInContext("renderTasks = () => {}; renderEditor = () => {}; scheduleSave = () => {};", context);

            const classList = { add() {}, remove() {}, toggle() {} };
            const source = {
              dataset: { taskIndex: "2", taskId: "c" },
              classList,
              closest: () => source,
            };
            context.onTaskDragStart({
              target: source,
              dataTransfer: { effectAllowed: "", setData() {} },
            });

            context.state.profile.tasks.splice(1, 0, { id: "x", type: "Award", enabled: true });

            const target = {
              dataset: { taskIndex: "0", taskId: "a" },
              classList,
              closest: () => target,
              getBoundingClientRect: () => ({ top: 0, height: 20 }),
            };
            context.onTaskDrop({
              target,
              clientY: 0,
              preventDefault() {},
              stopPropagation() {},
            });

            const actual = context.state.profile.tasks.map((task) => task.id).join(",");
            if (actual !== "c,a,x,b") {
              throw new Error(`unexpected order: ${actual}`);
            }
            """
        )

        result = subprocess.run(
            ["node", "-e", script],
            cwd=Path(__file__).resolve().parents[1],
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)


if __name__ == "__main__":
    unittest.main()

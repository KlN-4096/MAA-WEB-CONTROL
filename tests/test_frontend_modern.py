import shutil
import subprocess
import unittest
from pathlib import Path


class ModernFrontendTest(unittest.TestCase):
    def test_scripts_parse_and_new_task_settings_and_tool_views_render(self):
        if shutil.which("node") is None:
            self.skipTest("node is not available")
        script = r"""
        const fs = require("fs"), vm = require("vm"), assert = require("node:assert/strict");
        const html = fs.readFileSync("web/index.html", "utf8");
        const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => "web/" + m[1].replace(/^\//, ""));
        for (const file of scripts) new vm.Script(fs.readFileSync(file, "utf8"), {filename:file});
        const context = {
          console, assert, window:{}, document:{getElementById:()=>null,querySelectorAll:()=>[]},
          MaaStorage:{get:()=>null,readObject:()=>null,isObject:v=>v && typeof v==="object"},
        };
        vm.createContext(context);
        const files = ["web/core/state.js",...fs.readdirSync("web/tasks").filter(f=>f.endsWith(".js")).map(f=>"web/tasks/"+f),
          "web/views/settings/state.js","web/views/settings/helpers.js","web/views/settings/appearance.js",
          ...["notification","remote","performance","background","ui"].map(f=>"web/views/settings/sections/"+f+".js"),
          "web/views/tools/index.js","web/views/tools/modern.js","web/views/tools/records.js"];
        for (const file of files) vm.runInContext(fs.readFileSync(file,"utf8"),context,{filename:file});
        vm.runInContext(`
          state.profile={name:"daily",adb:{client_type:"Official"},tasks:[]};
          state.profiles=["daily"];
          for (const type of TASK_TYPES) {
            const task=defaultTask(type);
            assert.ok(renderTaskEditor(task,escapeHtml,"general").length>30, type);
            assert.ok(renderTaskEditor(task,escapeHtml,"advanced").length>30, type);
          }
          for (const theme of ["傀影","水月","萨米","萨卡兹","界园","黑流树海"]) {
            assert.ok(renderRoguelikeGeneral({theme},escapeHtml).length>30);
            const view=renderRoguelikeAdvanced({theme},escapeHtml);
            assert.ok(view.length>30);
            if(theme==="黑流树海") {
              assert.ok(view.includes("准备局分队"));
              assert.ok(!view.includes('id="start_with_elite_two"'));
            }
          }
          assert.equal(defaultTask("OperProgress").enabled,false);
          assert.equal(defaultTask("DepotMaintain").enabled,false);
          assert.ok(renderOperProgressGeneral({plans:[{name:"阿米娅",skill_mastery:[0,0,0]}]},escapeHtml).includes('<option value="0" selected>不指定</option>'));
          assert.ok(renderRecruitAdvanced({reserve_level_1:false},escapeHtml).includes('id="paramPreserveTags" value=""'));
          SETTINGS_STATE.notification=defaultNotificationState();
          SETTINGS_STATE.notification.channels=[{type:"smtp",enabled:false,options:{}}];
          for(const render of [renderNotificationSection,renderRemoteSection,renderPerformanceSection,renderBackgroundSection,renderUiSection,renderModernTools,renderPixelPaint,renderExecutionRecords]) assert.ok(render().length>30);
          assert.ok(renderNotificationSection().includes('data-settings-field="notification.channels.0.options.use_ssl" checked'));
          assert.ok(renderRemoteSection().includes('<option value="" selected>请选择配置</option>'));
        `,context);
        """
        result = subprocess.run(["node", "-e", script], cwd=Path(__file__).resolve().parents[1],
                                capture_output=True, text=True, encoding="utf-8", timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_stale_pixel_conversion_cannot_reenable_old_paint(self):
        if shutil.which("node") is None:
            self.skipTest("node is not available")
        script = r"""
        const fs=require("fs"),vm=require("vm"),assert=require("node:assert/strict");
        let finish;
        const context={assert,renderToolsView:()=>{},api:()=>new Promise(resolve=>finish=resolve)};
        vm.createContext(context);
        vm.runInContext(fs.readFileSync("web/views/tools/modern.js","utf8"),context);
        (async()=>{
          const pending=vm.runInContext("PIXEL_STATE.image='one'; convertPixelPaint()",context);
          vm.runInContext("PIXEL_STATE.image='two'; PIXEL_STATE.generation++;",context);
          finish({groups:[{color:1,points:[[0,0]]}],preview:"old"});
          await pending;
          assert.equal(vm.runInContext("PIXEL_STATE.groups",context),null);
          assert.equal(vm.runInContext("PIXEL_STATE.preview",context),"");
        })().catch(error=>{console.error(error);process.exitCode=1;});
        """
        result = subprocess.run(["node", "-e", script], cwd=Path(__file__).resolve().parents[1],
                                capture_output=True, text=True, encoding="utf-8", timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)

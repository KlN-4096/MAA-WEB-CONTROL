function renderConnectionSection() {
  const disabledAuto = SETTINGS_STATE.autoDetectConnection ? " disabled" : "";
  const isLd = SETTINGS_STATE.connectConfig === "LDPlayer";
  const isMumu = SETTINGS_STATE.connectConfig === "MuMuEmulator12";
  return settingsColumn(`
    ${checkLine("自动检测连接", false, "自动寻找可用模拟器连接。", "autoDetectConnection")}
    ${checkLine("每次重新检测", true, "端口经常变化时再启用。", "detectEveryTime")}
    ${fieldRow("连接配置", selectBox([
      { label: "雷电模拟器", value: "LDPlayer" },
      { label: "MuMu 模拟器", value: "MuMuEmulator12" },
      { label: "通用", value: "General" }
    ], SETTINGS_STATE.connectConfig, "connectConfig"), "", "settingsControlXL")}
    ${fieldRow("连接地址", textBox(SETTINGS_STATE.adbAddress, "settingsControlXL", "adbAddress", disabledAuto), "写入当前 profile.adb.address")}
    ${fieldRow("ADB 路径", textBox(SETTINGS_STATE.adbPath, "settingsControlXL", "adbPath", disabledAuto))}
    ${isLd ? checkLine("启用 LD 截图增强模式", true, "启用后可解锁 LDExtras 高速截图。", "ldExtrasEnabled") : ""}
    ${isLd && SETTINGS_STATE.ldExtrasEnabled ? fieldRow("LD 安装路径", textBox(SETTINGS_STATE.ldExtrasPath, "settingsControlXXL", "ldExtrasPath"), "雷电模拟器安装目录，含 ldopengl64.dll") : ""}
    ${isLd && SETTINGS_STATE.ldExtrasEnabled ? checkLine("手动填写「实例编号」", false, "", "ldManualIndex") : ""}
    ${isLd && SETTINGS_STATE.ldExtrasEnabled && SETTINGS_STATE.ldManualIndex ? fieldRow("实例编号", numberBox(String(SETTINGS_STATE.ldExtrasIndex), "settingsControlS", "ldExtrasIndex")) : ""}
    ${isMumu ? checkLine("启用 MuMu 截图增强模式", true, "", "mumuExtrasEnabled", true) : ""}
    ${isMumu ? fieldRow("MuMu 安装路径", textBox("C:\\\\Program Files\\\\Netease\\\\MuMuPlayer-12.0", "settingsControlXXL", "", " disabled")) : ""}
    ${isMumu ? checkLine("MuMu 网络桥接模式", false, "", "mumuBridge", true) : ""}
    ${isMumu && SETTINGS_STATE.mumuBridge ? fieldRow("MuMu 实例编号", numberBox("0", "settingsControlS", "", " disabled")) : ""}
    ${fieldRow("触控模式", selectBox(["Minitouch（默认）", "MaaTouch（实验功能）", "ADB Input（不推荐使用）", "MaaFramework（实验功能）"], SETTINGS_STATE.touchMode, "touchMode"))}
    <div class="settingsInlinePair">${checkLine("退出时释放 ADB", false, "", "killAdbOnExit")}${checkLine("使用 ADB Lite（实验性功能）", false, "", "adbLiteEnabled")}</div>
    ${checkLine("连接失败后重启 ADB Server", true, "MaaCore 第一次连接失败时自动执行 adb kill-server 后重试。", "allowAdbRestart")}
    ${checkLine("连接失败后强制结束 ADB 进程", false, "Windows 上执行 taskkill /F /IM adb.exe，Linux 上执行 pkill -9 adb，作为最后的兜底。", "allowAdbHardRestart")}
    <p class="settingsGlobalTip">以下选项暂未接入 Web 版：</p>
    ${checkLine("ADB 连接失败时尝试启动模拟器", true, "连接失败后自动启动模拟器。", "", true)}
    <button class="settingsButtonSmall" type="button" data-settings-action="screenshotTest">截图测试</button>
    <p class="settingsLineText" id="screenshotTestResult">点击「截图测试」以验证当前 ADB 连接的截图能力。</p>
  `);
}

async function runSettingsScreenshotTest() {
  if (typeof api !== "function") return;
  const resultEl = document.getElementById("screenshotTestResult");
  if (resultEl) resultEl.textContent = "截图测试中……";
  try {
    const t0 = Date.now();
    const result = await api("/api/adb/test-screenshot", { method: "POST" });
    const elapsed = Date.now() - t0;
    if (resultEl) {
      const benchmark = formatScreenshotBenchmark(result.benchmark);
      resultEl.textContent = result.ok
        ? `截图成功 (${elapsed} ms)${benchmark ? " · " + benchmark : ""}`
        : `截图失败: ${result.message || "未知错误"}`;
    }
  } catch (error) {
    if (resultEl) resultEl.textContent = `截图失败: ${error.message || "请求错误"}`;
  }
}

function formatScreenshotBenchmark(benchmark) {
  if (!benchmark || typeof benchmark !== "object") return "";
  const method = benchmark.method ? String(benchmark.method) : "";
  const cost = benchmark.cost !== undefined && benchmark.cost !== null && benchmark.cost !== "" ? `${benchmark.cost} ms` : "";
  if (method && cost) return `最快方式: ${method} ${cost}`;
  if (method) return `最快方式: ${method}`;
  if (cost) return `最快方式: ${cost}`;
  return "";
}

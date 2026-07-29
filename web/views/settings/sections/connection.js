function renderConnectionSection() {
  const isLd = SETTINGS_STATE.connectConfig === "LDPlayer";
  const isMumu = SETTINGS_STATE.connectConfig === "MuMuEmulator12";
  const detectResult = SETTINGS_STATE.adbDetectResult || "";
  return settingsColumn(`
    <div class="settingsInlinePair">
      <button class="settingsButtonSmall" type="button" data-settings-action="detectAdb">自动检测连接</button>
      <button class="settingsButtonSmall" type="button" data-settings-action="redroidStatus">检查 redroid 容器</button>
    </div>
    ${detectResult ? `<p class="settingsLineText ${SETTINGS_STATE.adbDetectLevel || ""}">${escapeHtml(detectResult)}</p>` : ""}
    ${fieldRow("连接配置", selectBox([
      { label: "雷电模拟器", value: "LDPlayer" },
      { label: "MuMu 模拟器", value: "MuMuEmulator12" },
      { label: "通用", value: "General" }
    ], SETTINGS_STATE.connectConfig, "connectConfig"), "", "settingsControlXL")}
    ${fieldRow("连接地址", textBox(SETTINGS_STATE.adbAddress, "settingsControlXL", "adbAddress"), "写入当前 profile.adb.address")}
    ${fieldRow("ADB 路径", textBox(SETTINGS_STATE.adbPath, "settingsControlXL", "adbPath"))}
    ${isLd ? checkLine("启用 LD 截图增强模式", true, "启用后可解锁 LDExtras 高速截图。", "ldExtrasEnabled") : ""}
    ${isLd && SETTINGS_STATE.ldExtrasEnabled ? fieldRow("LD 安装路径", textBox(SETTINGS_STATE.ldExtrasPath, "settingsControlXXL", "ldExtrasPath"), "雷电模拟器安装目录，含 ldopengl64.dll") : ""}
    ${isLd && SETTINGS_STATE.ldExtrasEnabled ? checkLine("手动填写「实例编号」", false, "", "ldManualIndex") : ""}
    ${isLd && SETTINGS_STATE.ldExtrasEnabled && SETTINGS_STATE.ldManualIndex ? fieldRow("实例编号", numberBox(String(SETTINGS_STATE.ldExtrasIndex), "settingsControlS", "ldExtrasIndex")) : ""}
    ${isMumu ? `<p class="settingsGlobalTip">MuMu 截图增强 / 网络桥接依赖 Windows 原生 DLL，Web 版<span class="unsupportedBadge">暂未接入</span></p>` : ""}
    ${fieldRow("触控模式", selectBox(["Minitouch（默认）", "MaaTouch（实验功能）", "ADB Input（不推荐使用）", "MaaFramework（实验功能）"], SETTINGS_STATE.touchMode, "touchMode"))}
    <div class="settingsInlinePair">${checkLine("退出时释放 ADB", false, "", "killAdbOnExit")}${checkLine("使用 ADB Lite（实验性功能）", false, "", "adbLiteEnabled")}</div>
    ${checkLine("连接失败后重启 ADB Server", true, "MaaCore 第一次连接失败时自动执行 adb kill-server 后重试。", "allowAdbRestart")}
    ${checkLine("连接失败后强制结束 ADB 进程", false, "Windows 上执行 taskkill /F /IM adb.exe，Linux 上执行 pkill -9 adb，作为最后的兜底。", "allowAdbHardRestart")}
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

// 「自动检测连接」以前只是写进 StartUp 参数（MaaCore 根本不认），现在真正扫描设备。
async function runSettingsAdbDetect() {
  if (typeof api !== "function") return;
  SETTINGS_STATE.adbDetectResult = "正在扫描可用设备……";
  SETTINGS_STATE.adbDetectLevel = "";
  renderSettingsView();
  try {
    const result = await api("/api/adb/detect", { method: "POST" });
    if (result.ok && result.address) {
      SETTINGS_STATE.adbAddress = result.address;
      SETTINGS_STATE.adbDetectResult = `${result.message}：${result.devices.join("、")}，已填入连接地址`;
      SETTINGS_STATE.adbDetectLevel = "ok";
      saveSettingsProfile({ immediate: true });
      if (typeof showToast === "function") showToast(SETTINGS_STATE.adbDetectResult, "success");
    } else {
      SETTINGS_STATE.adbDetectResult = result.message || "未检测到设备";
      SETTINGS_STATE.adbDetectLevel = "err";
      if (typeof showToast === "function") showToast(SETTINGS_STATE.adbDetectResult, "warning");
    }
  } catch (error) {
    SETTINGS_STATE.adbDetectResult = `检测失败：${error.message || "请求错误"}`;
    SETTINGS_STATE.adbDetectLevel = "err";
    showError(error);
  }
  renderSettingsView();
}

async function runSettingsRedroidStatus() {
  if (typeof api !== "function") return;
  try {
    const result = await api("/api/redroid/status");
    SETTINGS_STATE.adbDetectResult = result.message || "";
    SETTINGS_STATE.adbDetectLevel = result.available ? "ok" : "err";
    if (typeof showToast === "function") showToast(result.message || "已查询容器状态", result.available ? "success" : "warning");
  } catch (error) {
    SETTINGS_STATE.adbDetectResult = `查询失败：${error.message || "请求错误"}`;
    SETTINGS_STATE.adbDetectLevel = "err";
    showError(error);
  }
  renderSettingsView();
}

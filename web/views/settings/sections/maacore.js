function renderMaaCoreSection() {
  const isOfficial = SETTINGS_STATE.maaAdapterType === "official";
  return settingsColumn(`
    <p class="settingsGlobalTip">配置 MAA 核心适配器。当前运行中：<strong>${escapeHtml(SETTINGS_STATE.maaActiveType)}</strong></p>
    ${fieldRow("适配器类型", selectBox([
      { label: "DryRun（模拟运行，不实际操作）", value: "" },
      { label: "Official（使用本地 MaaCore DLL）", value: "official" }
    ], SETTINGS_STATE.maaAdapterType, "maaAdapterType"))}
    ${isOfficial ? fieldRow("MaaCore 目录", textBox(SETTINGS_STATE.maaCoreDir, "settingsControlXXL", "maaCoreDir"), "MAA 安装目录，包含 MaaCore.dll 的文件夹") : ""}
    <div class="settingsInlinePair">
      <button class="settingsButtonSmall" type="button" data-settings-action="applyAdapter">应用并切换</button>
      <span id="maaAdapterStatus" class="settingsLineText"></span>
    </div>
  `);
}

async function loadAdapterConfig() {
  if (typeof api !== "function") return;
  try {
    const data = await api("/api/adapter");
    if (data.adapter !== undefined) SETTINGS_STATE.maaAdapterType = data.adapter;
    if (data.core_dir !== undefined) SETTINGS_STATE.maaCoreDir = data.core_dir;
    SETTINGS_STATE.maaActiveType = data.active_type || "dry-run";
    if (typeof state !== "undefined" && state.currentView === "settings") renderSettingsView();
  } catch (e) { /* ignore */ }
}

async function applyAdapterConfig() {
  if (typeof api !== "function") return;
  const statusEl = document.getElementById("maaAdapterStatus");
  if (statusEl) statusEl.textContent = "正在应用……";
  try {
    const result = await api("/api/adapter", {
      method: "PUT",
      body: JSON.stringify({
        adapter: SETTINGS_STATE.maaAdapterType,
        core_dir: SETTINGS_STATE.maaCoreDir,
      })
    });
    if (result && result.detail) {
      if (statusEl) statusEl.textContent = `失败：${result.detail}`;
      return;
    }
    SETTINGS_STATE.maaActiveType = result.active_type || "dry-run";
    const note = result.hot_swapped ? "已生效" : (result.note || "重启后生效");
    if (statusEl) statusEl.textContent = `已保存（${note}），当前：${SETTINGS_STATE.maaActiveType}`;
    persistSettingsState();
    renderSettingsView();
  } catch (e) {
    if (statusEl) statusEl.textContent = `失败：${e.message}`;
  }
}

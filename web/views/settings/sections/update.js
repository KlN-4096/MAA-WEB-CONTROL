function renderUpdateSection() {
  const isGithub = SETTINGS_STATE.updateSource === "Github";
  const isMirror = SETTINGS_STATE.updateSource === "MirrorChyan";
  const busy = Boolean(SETTINGS_STATE.updateBusy);
  const status = updateStatusText();
  return settingsColumn(`
    <p class="settingsGlobalTip">此选项页为全局配置。核心与资源更新沿用原版 MAA 更新逻辑。</p>
    <div class="settingsSplit settingsUpdateGrid">
      <div class="settingsColumn">
        ${checkLine("启动时检查更新", true, "", "startupUpdateCheck")}
        ${checkLine("定时检查更新", false, "鹰角历 0:00 / 18:00 检查更新。", "scheduledUpdateCheck")}
        ${checkLine("自动下载更新包", true, "", "autoDownloadUpdatePackage")}
        ${checkLine("自动安装更新包", false, "", "autoInstallUpdatePackage")}
        ${checkLine("显示 MAA.Updater 控制台输出", false, "", "showUpdaterConsole")}
        ${isGithub ? checkLine("强制使用 GitHub", false, "忽略 Maa API 返回的镜像下载地址。", "forceGithubGlobalSource") : ""}
        ${fieldRow("更新渠道", selectBox([
          { label: "稳定版", value: "stable" },
          { label: "公测版", value: "beta" },
          { label: "内测版", value: "alpha" }
        ], SETTINGS_STATE.updateChannel, "updateChannel", "settingsControlL"))}
        ${fieldRow("更新源", selectBox([
          { label: "GitHub", value: "Github" },
          { label: "Mirror酱", value: "MirrorChyan" }
        ], SETTINGS_STATE.updateSource, "updateSource", "settingsControlL"))}
        ${isMirror ? fieldRow("Mirror酱 CDK", textBox(SETTINGS_STATE.mirrorChyanCdk, "settingsControlL", "mirrorChyanCdk")) : ""}
        ${fieldRow("Proxy 类型", selectBox([
          { label: "不使用", value: "" },
          { label: "HTTP Proxy", value: "http" },
          { label: "SOCKS5 Proxy", value: "socks5" }
        ], SETTINGS_STATE.proxyType, "proxyType"))}
        ${SETTINGS_STATE.proxyType ? fieldRow("Proxy 地址", textBox(SETTINGS_STATE.proxyAddress, "settingsControlL", "proxyAddress")) : ""}
      </div>
      <div class="settingsColumn">
        ${badgeRow("Web 版本", SETTINGS_STATE.webVersion)}
        ${badgeRow("核心版本", SETTINGS_STATE.coreVersion || SETTINGS_STATE.maaVersion)}
        ${badgeRow("资源版本", SETTINGS_STATE.resourceVersion)}
        ${SETTINGS_STATE.resourceTime ? `<p class="settingsLineText">资源时间：${escapeHtml(SETTINGS_STATE.resourceTime)}</p>` : ""}
        ${status ? `<p class="settingsLineText updateStatusLine">${escapeHtml(status)}</p>` : ""}
        <div class="settingsInlinePair">
          <button class="settingsButtonSmall" type="button" data-settings-action="checkUpdate"${busy ? " disabled" : ""}>检查更新</button>
          <button class="settingsButtonSmall" type="button" data-settings-action="coreUpdate"${busy ? " disabled" : ""}>核心更新</button>
        </div>
        <button class="settingsButtonSmall" type="button" data-settings-action="resourceUpdate"${busy ? " disabled" : ""}>资源更新</button>
      </div>
    </div>
  `);
}

async function loadVersionInfo() {
  if (typeof api !== "function") return;
  try {
    const data = await api(`/api/version?client_type=${encodeURIComponent(updateClientType())}`);
    applyVersionInfo(data);
    renderSettingsView();
  } catch (e) { /* ignore */ }
}

async function loadUpdateConfig() {
  if (typeof api !== "function") return;
  try {
    const data = await api("/api/update/config");
    applyUpdateConfig(data);
    renderSettingsView();
  } catch (e) { /* ignore */ }
}

async function saveUpdateConfig() {
  if (typeof api !== "function") return;
  try {
    const result = await api("/api/update/config", {
      method: "PUT",
      body: JSON.stringify(updateConfigPayload())
    });
    applyUpdateConfig(result);
    SETTINGS_STATE.updateStatus = "更新设置已保存";
  } catch (e) {
    SETTINGS_STATE.updateStatus = `更新设置保存失败：${e.message || "请求错误"}`;
  }
  renderSettingsView();
}

async function checkUpdateNow() {
  return runUpdateRequest("check", "/api/update/check", "正在检查更新……");
}

async function updateCoreNow() {
  return runUpdateRequest("core", "/api/update/core", "正在处理核心更新……");
}

async function updateResourceNow() {
  return runUpdateRequest("resource", "/api/update/resource", "正在处理资源更新……");
}

async function runUpdateRequest(kind, path, busyText) {
  if (typeof api !== "function" || SETTINGS_STATE.updateBusy) return;
  SETTINGS_STATE.updateBusy = kind;
  SETTINGS_STATE.updateStatus = busyText;
  renderSettingsView();
  try {
    const result = await api(path, {
      method: "POST",
      body: JSON.stringify({ client_type: updateClientType() })
    });
    applyUpdateResult(kind, result);
    if (result?.restart_scheduled) {
      refreshVersionAfterRestart();
    } else {
      await loadVersionInfo();
      await refreshOptionsAfterResourceUpdate(kind, result);
    }
  } catch (e) {
    SETTINGS_STATE.updateStatus = `更新失败：${e.message || "请求错误"}`;
  }
  SETTINGS_STATE.updateBusy = "";
  renderSettingsView();
}

function refreshVersionAfterRestart() {
  setTimeout(() => loadVersionInfo(), 8000);
}

async function refreshOptionsAfterResourceUpdate(kind, result) {
  if (kind !== "resource" || result?.ok === false || typeof loadOptions !== "function") return;
  await loadOptions();
  if (typeof renderAll === "function") renderAll();
}

function applyVersionInfo(data) {
  if (!data || typeof data !== "object") return;
  if (data.web_version) SETTINGS_STATE.webVersion = data.web_version;
  if (data.core_version) SETTINGS_STATE.coreVersion = data.core_version;
  if (data.maa_version) SETTINGS_STATE.maaVersion = data.maa_version;
  if (data.resource_version) SETTINGS_STATE.resourceVersion = data.resource_version;
  if (data.resource_time) SETTINGS_STATE.resourceTime = data.resource_time;
  if (data.update && typeof data.update === "object") SETTINGS_STATE.updateState = data.update;
}

function applyUpdateConfig(data) {
  if (!data || typeof data !== "object") return;
  SETTINGS_STATE.startupUpdateCheck = Boolean(data.startup_update_check);
  SETTINGS_STATE.scheduledUpdateCheck = Boolean(data.scheduled_update_check);
  SETTINGS_STATE.autoDownloadUpdatePackage = data.auto_download_update_package !== false;
  SETTINGS_STATE.autoInstallUpdatePackage = Boolean(data.auto_install_update_package);
  SETTINGS_STATE.showUpdaterConsole = Boolean(data.show_updater_console);
  SETTINGS_STATE.updateChannel = data.update_channel || "stable";
  SETTINGS_STATE.updateSource = data.update_source === "MirrorChyan" ? "MirrorChyan" : "Github";
  SETTINGS_STATE.forceGithubGlobalSource = Boolean(data.force_github_global_source);
  SETTINGS_STATE.forceGithub = SETTINGS_STATE.forceGithubGlobalSource;
  SETTINGS_STATE.mirrorChyanCdk = data.mirror_chyan_cdk || "";
  SETTINGS_STATE.proxyType = data.proxy_type || "";
  SETTINGS_STATE.proxyAddress = data.proxy || "";
  persistSettingsState();
}

function updateConfigPayload() {
  return {
    startup_update_check: Boolean(SETTINGS_STATE.startupUpdateCheck),
    scheduled_update_check: Boolean(SETTINGS_STATE.scheduledUpdateCheck),
    auto_download_update_package: Boolean(SETTINGS_STATE.autoDownloadUpdatePackage),
    auto_install_update_package: Boolean(SETTINGS_STATE.autoInstallUpdatePackage),
    show_updater_console: Boolean(SETTINGS_STATE.showUpdaterConsole),
    update_channel: SETTINGS_STATE.updateChannel || "stable",
    update_source: SETTINGS_STATE.updateSource === "MirrorChyan" ? "MirrorChyan" : "Github",
    force_github_global_source: Boolean(SETTINGS_STATE.forceGithubGlobalSource || SETTINGS_STATE.forceGithub),
    mirror_chyan_cdk: SETTINGS_STATE.mirrorChyanCdk || "",
    proxy_type: SETTINGS_STATE.proxyType || "",
    proxy: SETTINGS_STATE.proxyAddress || ""
  };
}

function applyUpdateResult(kind, result) {
  if (kind === "check") {
    SETTINGS_STATE.updateState = result;
    SETTINGS_STATE.updateStatus = updateCheckSummary(result);
    return;
  }
  if (result && typeof result === "object") {
    SETTINGS_STATE.updateStatus = result.message || "更新请求已完成";
  }
}

function updateCheckSummary(result) {
  const core = result?.core;
  const resource = result?.resource;
  if (!core && !resource) return "";
  const parts = [];
  if (core?.has_update) parts.push(`新核心：${core.latest || ""}`.trim());
  if (resource?.has_update) parts.push(`新资源：${resource.release_note || resource.latest || ""}`.trim());
  return parts.length ? parts.join("；") : "核心和资源均为最新";
}

function updateStatusText() {
  if (SETTINGS_STATE.updateStatus) return SETTINGS_STATE.updateStatus;
  return updateCheckSummary(SETTINGS_STATE.updateState);
}

function updateClientType() {
  return typeof canonicalClientType === "function" ? canonicalClientType(SETTINGS_STATE.clientType) : SETTINGS_STATE.clientType;
}

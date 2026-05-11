function renderUpdateSection() {
  const isGithub = SETTINGS_STATE.updateSource === "Github";
  const isMirror = SETTINGS_STATE.updateSource === "MirrorChyan";
  return settingsColumn(`
    <p class="settingsGlobalTip">此选项页为全局配置。自动更新功能仅桌面版可用，Web 版由部署方维护更新。</p>
    <div class="settingsSplit settingsUpdateGrid">
      <div class="settingsColumn">
        ${checkLine("启动时检查更新", true, "", "", true)}
        ${checkLine("定时检查更新", true, "定期检查更新。", "", true)}
        ${checkLine("自动下载更新包", true, "", "", true)}
        ${checkLine("自动安装更新包", true, "", "", true)}
        ${checkLine("显示 MAA.Updater 控制台输出", false, "", "", true)}
        ${isGithub ? checkLine("强制使用 GitHub", true, "忽略代理源配置。", "forceGithub", true) : ""}
        ${fieldRow("更新渠道", selectBox(["公测版", "稳定版", "内测版"], 0, "", "settingsControlL", " disabled"))}
        ${fieldRow("更新源", selectBox([
          { label: "海外源", value: "Overseas" },
          { label: "GitHub", value: "Github" },
          { label: "Mirror酱", value: "MirrorChyan" }
        ], SETTINGS_STATE.updateSource, "updateSource", "settingsControlL", " disabled"))}
        ${isMirror ? fieldRow("Mirror酱 CDK", inputButton("", "复制", "settingsControlL", " disabled")) : ""}
        ${fieldRow("HTTP Proxy", selectBox(["", "HTTP Proxy"], SETTINGS_STATE.proxyType, "proxyType"))}
        ${SETTINGS_STATE.proxyType ? textBox("", "settingsControlL", "proxyAddress") : ""}
      </div>
      <div class="settingsColumn">
        ${badgeRow("软件版本", SETTINGS_STATE.maaVersion)}
        ${badgeRow("资源版本", SETTINGS_STATE.resourceVersion)}
        <div class="settingsInlinePair">
          <button class="settingsButtonSmall" type="button" disabled>软件更新</button>
          <button class="settingsButtonSmall" type="button" disabled>更新日志</button>
        </div>
        <button class="settingsButtonSmall" type="button" disabled>资源更新</button>
      </div>
    </div>
  `);
}

async function loadVersionInfo() {
  if (typeof api !== "function") return;
  try {
    const data = await api("/api/version");
    if (data.maa_version) SETTINGS_STATE.maaVersion = data.maa_version;
    if (data.resource_version) SETTINGS_STATE.resourceVersion = data.resource_version;
    renderSettingsView();
  } catch (e) { /* ignore */ }
}

function renderConfigSection() {
  const options = configOptions(SETTINGS_STATE.currentConfig);
  return `<div class="configReplica">
    <label class="settingsField">
      <span>配置名称</span>
      <span class="settingsComboLine">
        <select data-settings-current-config>${options}</select>
        <button class="settingsIconButton" type="button" title="删除配置" data-settings-delete-config>×</button>
      </span>
    </label>
    <div class="settingsAddLine">
      <input data-settings-new-config value="${escapeHtml(SETTINGS_STATE.newConfigName)}" autocomplete="off" />
      <button type="button" data-settings-add-config>添加</button>
    </div>
  </div>`;
}

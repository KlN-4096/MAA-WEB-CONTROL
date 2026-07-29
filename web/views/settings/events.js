function onSettingsClick(event) {
  const nav = event.target.closest("[data-settings-nav]");
  if (nav) {
    runSettingsAction("selectSection", { index: Number(nav.dataset.settingsNav) });
    return;
  }
  const toggle = event.target.closest("[data-settings-toggle]");
  if (toggle) {
    runSettingsAction("toggleSection", { key: toggle.dataset.settingsToggle });
    return;
  }
  if (isSettingsEditingLocked() && (event.target.closest("[data-settings-add-config]") || event.target.closest("[data-settings-delete-config]"))) {
    return;
  }
  if (event.target.closest("[data-settings-add-config]")) {
    runSettingsAction("addConfig")?.catch(showError);
    return;
  }
  if (event.target.closest("[data-settings-delete-config]")) {
    runSettingsAction("deleteConfig")?.catch(showError);
    return;
  }
  if (event.target.closest("[data-settings-action='screenshotTest']")) {
    runSettingsScreenshotTest();
    return;
  }
  if (event.target.closest("[data-settings-action='clearLogCache']")) {
    clearLogs().then(() => showNotice("已清空日志与图片缓存", "success")).catch(showError);
    return;
  }
  if (event.target.closest("[data-settings-action='detectAdb']")) {
    runSettingsAdbDetect();
    return;
  }
  if (event.target.closest("[data-settings-action='redroidStatus']")) {
    runSettingsRedroidStatus();
    return;
  }
  if (event.target.closest("[data-settings-action='applyAdapter']")) {
    if (isSettingsEditingLocked()) {
      showNotice("任务运行中，无法切换 MAA 核心", "warning");
      return;
    }
    applyAdapterConfig();
    return;
  }
  if (event.target.closest("[data-settings-action='saveNotification']")) {
    saveNotificationConfig();
    return;
  }
  if (event.target.closest("[data-settings-action='testNotification']")) {
    testNotificationConfig();
    return;
  }
  if (event.target.closest("[data-settings-action='checkUpdate']")) {
    checkUpdateNow();
    return;
  }
  if (event.target.closest("[data-settings-action='coreUpdate']")) {
    updateCoreNow();
    return;
  }
  if (event.target.closest("[data-settings-action='resourceUpdate']")) {
    updateResourceNow();
  }
}

function onSettingsChange(event) {
  if (isSettingsEditingLocked() && isSettingsWriteTarget(event.target)) {
    syncSettingsEditingLock();
    return;
  }
  if (event.target.matches("[data-settings-current-config]")) {
    SETTINGS_STATE.currentConfig = event.target.value;
    persistSettingsState();
    if (typeof switchProfileConfig === "function") {
      switchProfileConfig(event.target.value).catch(showError);
    }
    return;
  }
  const flag = event.target.closest("[data-settings-flag]");
  if (flag) {
    SETTINGS_STATE[flag.dataset.settingsFlag] = flag.checked;
    persistSettingsState();
    saveSettingsProfile();
    if (["forceStart", "emulatorLaunchEnabled"].includes(flag.dataset.settingsFlag)) syncTimersToScheduler();
    renderSettingsView();
    return;
  }
  if (updateSettingsField(event.target)) {
    const field = event.target.dataset.settingsField;
    if (field && field.startsWith("emulatorLaunch")) syncTimersToScheduler();
    return;
  }
  if (updateTimerField(event.target)) {
    persistSettingsState();
    syncTimersToScheduler();
    renderSettingsView();
  }
}

function onSettingsInput(event) {
  if (isSettingsEditingLocked() && isSettingsWriteTarget(event.target)) {
    syncSettingsEditingLock();
    return;
  }
  if (event.target.matches("[data-settings-new-config]")) {
    SETTINGS_STATE.newConfigName = event.target.value;
    return;
  }
  // 输入过程中只更新本地状态：逐字符落库会整页重渲染，输入框会掉焦点。
  if (updateSettingsField(event.target, { commit: false })) return;
  if (updateTimerField(event.target)) persistSettingsState();
}

function runSettingsAction(action, payload = {}) {
  const value = payload && typeof payload === "object" ? payload : { value: payload };
  if (action === "selectSection") return selectSettingsSection(Number(value.index ?? value.value));
  if (action === "toggleSection") return toggleSettingsSection(value.key ?? value.value);
  if (action === "addConfig") return addLocalConfig();
  if (action === "deleteConfig") return deleteLocalConfig();
  if (action === "persist") return persistSettingsState();
  return undefined;
}

function selectSettingsSection(index) {
  if (!Number.isInteger(index) || !SETTINGS_SECTIONS[index]) return;
  SETTINGS_STATE.selected = index;
  persistSettingsState();
  syncSettingsNavActive();
  requestAnimationFrame(() => scrollSettingsSection(SETTINGS_STATE.selected));
}

function toggleSettingsSection(key) {
  if (!Object.hasOwn(SETTINGS_STATE.expanded, key)) return;
  SETTINGS_STATE.expanded[key] = !SETTINGS_STATE.expanded[key];
  persistSettingsState();
  renderSettingsView();
}

function updateTimerField(target) {
  const timerKey = Object.keys(target.dataset).find((key) => key.startsWith("timer"));
  if (!timerKey) return false;
  const index = Number(target.dataset[timerKey]);
  const field = timerKey.replace("timer", "").toLowerCase();
  if (!SETTINGS_STATE.timers[index]) return false;
  SETTINGS_STATE.timers[index][field] = target.type === "checkbox" ? target.checked : target.value;
  return true;
}

const SETTINGS_NUMBER_RANGES = {
  logThumbnailMax: [1, 9999],
  taskTimeoutMinutes: [0, 999],
  emulatorLaunchWait: [0, 300],
  ldExtrasIndex: [0, 99]
};

function settingsFieldValue(field, target) {
  if (target.type === "checkbox") return target.checked;
  const range = SETTINGS_NUMBER_RANGES[field];
  // 数字字段必须存成 number：存字符串会让 localStorage 回读时的类型校验直接丢弃。
  if (range) return clampNumber(target.value, range[0], range[1], Number(SETTINGS_STATE[field]) || range[0]);
  return target.value;
}

function updateSettingsField(target, { commit = true } = {}) {
  const field = target.dataset.settingsField;
  if (!field) return false;
  if (isSettingsEditingLocked()) return true;
  if (field.startsWith("notification.")) {
    return updateNotificationField(field, target);
  }
  SETTINGS_STATE[field] = settingsFieldValue(field, target);
  if (field === "forceGithubGlobalSource") SETTINGS_STATE.forceGithub = SETTINGS_STATE.forceGithubGlobalSource;
  persistSettingsState();
  if (!commit) return true;
  if (isUpdateSettingsField(field)) {
    saveUpdateConfig();
    if (SETTINGS_CONDITIONAL_FIELDS.has(field)) renderSettingsView();
    return true;
  }
  if (field === "taskTimeoutMinutes") {
    saveRunnerConfig();
    return true;
  }
  saveSettingsProfile();
  if (SETTINGS_CONDITIONAL_FIELDS.has(field)) renderSettingsView();
  return true;
}

function isUpdateSettingsField(field) {
  return [
    "startupUpdateCheck",
    "scheduledUpdateCheck",
    "autoDownloadUpdatePackage",
    "autoInstallUpdatePackage",
    "showUpdaterConsole",
    "updateChannel",
    "updateSource",
    "forceGithubGlobalSource",
    "mirrorChyanCdk",
    "proxyType",
    "proxyAddress"
  ].includes(field);
}

function updateNotificationField(field, target) {
  if (!SETTINGS_STATE.notification) SETTINGS_STATE.notification = defaultNotificationState();
  const path = field.split(".").slice(1);
  let node = SETTINGS_STATE.notification;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!node[key] || typeof node[key] !== "object") node[key] = {};
    node = node[key];
  }
  const leaf = path[path.length - 1];
  if (leaf === "headers") {
    node.headers = parseHeadersFromInput(target.value);
  } else if (target.type === "checkbox") {
    node[leaf] = target.checked;
  } else {
    node[leaf] = target.value;
  }
  persistSettingsState();
  return true;
}

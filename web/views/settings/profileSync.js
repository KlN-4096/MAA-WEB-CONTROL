function syncSettingsConfigs() {
  const source = state.profiles.join("\n") || state.profile?.name || "Default";
  if (SETTINGS_STATE.configsDirty) return;
  if (SETTINGS_STATE.configsSource !== source) {
    SETTINGS_STATE.configs = state.profiles.length ? [...state.profiles] : [source];
    SETTINGS_STATE.configsSource = source;
    SETTINGS_STATE.timers.forEach((timer) => {
      if (!SETTINGS_STATE.configs.includes(timer.config)) timer.config = state.profile?.name || SETTINGS_STATE.configs[0];
    });
  }
  SETTINGS_STATE.currentConfig = state.profile?.name || SETTINGS_STATE.currentConfig || SETTINGS_STATE.configs[0];
}

function syncSettingsFromProfile() {
  const profile = typeof state !== "undefined" ? state.profile : null;
  if (!profile) return;
  const adb = profile.adb || {};
  SETTINGS_STATE.clientType = typeof canonicalClientType === "function"
    ? canonicalClientType(adb.client_type || SETTINGS_STATE.clientType)
    : (adb.client_type || SETTINGS_STATE.clientType);
  SETTINGS_STATE.adbAddress = adb.address || SETTINGS_STATE.adbAddress;
  SETTINGS_STATE.adbPath = adb.adb_path || SETTINGS_STATE.adbPath;
  SETTINGS_STATE.touchMode = adb.touch_mode || SETTINGS_STATE.touchMode;
  SETTINGS_STATE.deploymentWithPause = Boolean(adb.deployment_with_pause);
  SETTINGS_STATE.adbLiteEnabled = Boolean(adb.adb_lite_enabled);
  SETTINGS_STATE.killAdbOnExit = Boolean(adb.kill_adb_on_exit);
  if (typeof adb.allow_adb_restart === "boolean") SETTINGS_STATE.allowAdbRestart = adb.allow_adb_restart;
  if (typeof adb.allow_adb_hard_restart === "boolean") SETTINGS_STATE.allowAdbHardRestart = adb.allow_adb_hard_restart;
  SETTINGS_STATE.connectConfig = profileConnectPreset(adb.connect_config) || SETTINGS_STATE.connectConfig;
  const ld = adb.ld_player_extras;
  if (ld && typeof ld === "object") {
    if (typeof ld.enabled === "boolean") SETTINGS_STATE.ldExtrasEnabled = ld.enabled;
    if (typeof ld.path === "string" && ld.path) SETTINGS_STATE.ldExtrasPath = ld.path;
    if (Number.isInteger(ld.index)) SETTINGS_STATE.ldExtrasIndex = Math.max(0, ld.index);
  }
  const startup = firstTaskParams("StartUp");
  if (startup) {
    SETTINGS_STATE.autoDetectConnection = startup.auto_detect ?? SETTINGS_STATE.autoDetectConnection;
    SETTINGS_STATE.detectEveryTime = startup.detect_every_time ?? SETTINGS_STATE.detectEveryTime;
    if (!adb.touch_mode) SETTINGS_STATE.touchMode = startup.touch_mode || SETTINGS_STATE.touchMode;
  }
}

function profileConnectPreset(connectConfig) {
  if (typeof connectConfig === "string") return connectConfig;
  if (!connectConfig || typeof connectConfig !== "object" || Array.isArray(connectConfig)) return "";
  return connectConfig.preset || connectConfig.name || connectConfig.config || "";
}

function firstTaskParams(type) {
  return state.profile?.tasks?.find((task) => task.type === type)?.params || null;
}

function applySettingsToProfile() {
  if (typeof state === "undefined" || !state.profile || isSettingsEditingLocked()) return;
  const clientType = typeof canonicalClientType === "function" ? canonicalClientType(SETTINGS_STATE.clientType) : SETTINGS_STATE.clientType;
  SETTINGS_STATE.clientType = clientType;
  state.profile.adb = state.profile.adb || {};
  state.profile.adb.client_type = clientType;
  state.profile.adb.address = SETTINGS_STATE.adbAddress;
  state.profile.adb.adb_path = SETTINGS_STATE.adbPath;
  state.profile.adb.touch_mode = SETTINGS_STATE.touchMode;
  state.profile.adb.deployment_with_pause = Boolean(SETTINGS_STATE.deploymentWithPause);
  state.profile.adb.adb_lite_enabled = Boolean(SETTINGS_STATE.adbLiteEnabled);
  state.profile.adb.kill_adb_on_exit = Boolean(SETTINGS_STATE.killAdbOnExit);
  state.profile.adb.allow_adb_restart = Boolean(SETTINGS_STATE.allowAdbRestart);
  state.profile.adb.allow_adb_hard_restart = Boolean(SETTINGS_STATE.allowAdbHardRestart);
  state.profile.adb.connect_config = { preset: SETTINGS_STATE.connectConfig };
  state.profile.adb.ld_player_extras = {
    enabled: SETTINGS_STATE.ldExtrasEnabled,
    path: SETTINGS_STATE.ldExtrasPath,
    manual_index: SETTINGS_STATE.ldManualIndex,
    index: Number.parseInt(SETTINGS_STATE.ldExtrasIndex, 10) || 0,
  };
  const startup = firstTaskParams("StartUp");
  if (startup) {
    startup.client_type = clientType;
    startup.connection = SETTINGS_STATE.connectConfig;
    startup.auto_detect = SETTINGS_STATE.autoDetectConnection;
    startup.detect_every_time = SETTINGS_STATE.detectEveryTime;
    startup.touch_mode = SETTINGS_STATE.touchMode;
  }
}

function saveSettingsProfile() {
  if (isSettingsEditingLocked()) return;
  applySettingsToProfile();
  if (typeof persistProfile === "function") {
    persistProfile(false).catch(showError);
  }
}

async function addLocalConfig() {
  if (isSettingsEditingLocked()) return;
  const name = SETTINGS_STATE.newConfigName.trim() || `profile-${Date.now().toString().slice(-5)}`;
  SETTINGS_STATE.newConfigName = "";
  if (SETTINGS_STATE.configs.includes(name)) {
    SETTINGS_STATE.currentConfig = name;
    persistSettingsState();
    if (typeof switchProfileConfig === "function") await switchProfileConfig(name);
    renderSettingsView();
    return;
  }
  SETTINGS_STATE.currentConfig = name;
  SETTINGS_STATE.configsDirty = false;
  if (typeof createProfile === "function") {
    await createProfile(name);
  } else {
    SETTINGS_STATE.configs = [...SETTINGS_STATE.configs, name];
    SETTINGS_STATE.configsDirty = true;
  }
  persistSettingsState();
  renderSettingsView();
}

async function deleteLocalConfig() {
  if (isSettingsEditingLocked()) return;
  if (SETTINGS_STATE.configs.length <= 1) return;
  const name = SETTINGS_STATE.currentConfig;
  if (!confirm(`删除配置「${name}」？`)) return;
  if (typeof deleteProfile === "function") {
    await deleteProfile(name);
    SETTINGS_STATE.configsDirty = false;
    SETTINGS_STATE.configsSource = "";
    SETTINGS_STATE.currentConfig = state.profile?.name || state.profiles[0] || "";
  } else {
    SETTINGS_STATE.configs = SETTINGS_STATE.configs.filter((config) => config !== name);
    SETTINGS_STATE.configsDirty = true;
    SETTINGS_STATE.currentConfig = SETTINGS_STATE.configs[0];
  }
  persistSettingsState();
  renderSettingsView();
}

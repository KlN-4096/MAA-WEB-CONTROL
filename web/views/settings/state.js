const SETTINGS_STORAGE_KEY = "maa-web.settingsState";
const SETTINGS_CONDITIONAL_FIELDS = new Set([
  "forceStart",
  "customConfig",
  "autoDetectConnection",
  "connectConfig",
  "useCardLog",
  "proxyType",
  "maaAdapterType",
  "ldExtrasEnabled",
  "ldManualIndex",
  "mumuExtrasEnabled",
  "mumuBridge",
  "emulatorLaunchEnabled"
]);
const SETTINGS_PERSISTED_FIELDS = [
  "selected",
  "expanded",
  "customConfig",
  "forceStart",
  "showBeforeForce",
  "clientType",
  "blockSleep",
  "blockSleepScreenOn",
  "enablePenguin",
  "connectConfig",
  "adbAddress",
  "adbPath",
  "touchMode",
  "deploymentWithPause",
  "adbLiteEnabled",
  "killAdbOnExit",
  "allowAdbRestart",
  "allowAdbHardRestart",
  "autoDetectConnection",
  "detectEveryTime",
  "ldExtrasEnabled",
  "ldManualIndex",
  "ldExtrasPath",
  "ldExtrasIndex",
  "mumuExtrasEnabled",
  "mumuBridge",
  "useTray",
  "useCardLog",
  "updateSource",
  "forceGithub",
  "proxyType",
  "achievementPopupDisabled",
  "achievementPopupAutoClose",
  "logThumbnailMax",
  "maaAdapterType",
  "maaCoreDir",
  "timers",
  "emulatorLaunchEnabled",
  "emulatorLaunchCommand",
  "emulatorLaunchWait",
  "notification",
  "taskTimeoutMinutes"
];
const SETTINGS_AUTO_SCROLL_SUPPRESS_MS = 120;
const SETTINGS_SMOOTH_SCROLL_SUPPRESS_MS = 1200;

// Section keys, render functions resolved by name at render time
// to avoid load-order issues with sections/*.js files.
const SETTINGS_SECTION_KEYS = [
  { key: "config", title: "切换配置", renderName: "renderConfigSection" },
  { key: "timer", title: "定时执行", renderName: "renderTimerSection" },
  { key: "game", title: "运行设置", renderName: "renderGameSection" },
  { key: "performance", title: "性能设置", renderName: "renderPerformanceSection" },
  { key: "connection", title: "连接设置", renderName: "renderConnectionSection" },
  { key: "maacore", title: "MAA 核心", renderName: "renderMaaCoreSection" },
  { key: "startup", title: "启动设置", renderName: "renderStartupSection" },
  { key: "ui", title: "界面设置", renderName: "renderUiSection" },
  { key: "background", title: "背景设置", renderName: "renderBackgroundSection" },
  { key: "remote", title: "远程控制", renderName: "renderRemoteSection" },
  { key: "notification", title: "外部通知", renderName: "renderNotificationSection" },
  { key: "update", title: "更新设置", renderName: "renderUpdateSection" },
  { key: "issue", title: "问题反馈", renderName: "renderIssueSection" },
  { key: "about", title: "关于我们", renderName: "renderAboutSection" }
];

const SETTINGS_SECTIONS = SETTINGS_SECTION_KEYS.map((section) => ({
  ...section,
  render: () => (typeof window[section.renderName] === "function" ? window[section.renderName]() : "")
}));

const SETTINGS_STATE = {
  selected: 0,
  expanded: Object.fromEntries(SETTINGS_SECTIONS.map((section) => [section.key, true])),
  customConfig: true,
  forceStart: true,
  showBeforeForce: false,
  clientType: "Official",
  blockSleep: true,
  blockSleepScreenOn: true,
  enablePenguin: true,
  connectConfig: "LDPlayer",
  adbAddress: "127.0.0.1:5555",
  adbPath: "adb",
  touchMode: "Minitouch（默认）",
  deploymentWithPause: false,
  adbLiteEnabled: false,
  killAdbOnExit: false,
  allowAdbRestart: true,
  allowAdbHardRestart: false,
  autoDetectConnection: false,
  detectEveryTime: true,
  ldExtrasEnabled: true,
  ldManualIndex: false,
  ldExtrasPath: "",
  ldExtrasIndex: 0,
  mumuExtrasEnabled: true,
  mumuBridge: false,
  useTray: true,
  useCardLog: true,
  logThumbnailMax: 100,
  updateSource: "Overseas",
  forceGithub: true,
  proxyType: "",
  achievementPopupDisabled: true,
  achievementPopupAutoClose: true,
  maaVersion: "—",
  resourceVersion: "—",
  maaAdapterType: "",
  maaCoreDir: "",
  maaActiveType: "dry-run",
  newConfigName: "",
  configs: [],
  currentConfig: "",
  configsDirty: false,
  configsSource: "",
  timers: Array.from({ length: 8 }, (_, index) => ({
    enabled: index >= 6,
    hour: index * 3,
    minute: 0,
    config: ""
  })),
  emulatorLaunchEnabled: false,
  emulatorLaunchCommand: "",
  emulatorLaunchWait: 60,
  notification: null,
  notificationStatus: "",
  taskTimeoutMinutes: 0,
  taskTimeoutStatus: ""
};

Object.assign(SETTINGS_STATE, restoreSettingsState());

let settingsWired = false;
let settingsScrollRaf = 0;
let settingsProgrammaticScrollUntil = 0;
let settingsProgrammaticScrollTimer = 0;

function restoreSettingsState() {
  const parsed = readSettingsStorage();
  if (!parsed) return {};
  const restored = {};
  if (Number.isInteger(parsed.selected)) {
    restored.selected = Math.max(0, Math.min(parsed.selected, SETTINGS_SECTIONS.length - 1));
  }
  if (MaaStorage.isObject(parsed.expanded)) {
    restored.expanded = Object.fromEntries(SETTINGS_SECTIONS.map((section) => [
      section.key,
      typeof parsed.expanded[section.key] === "boolean" ? parsed.expanded[section.key] : true
    ]));
  }
  [
    "customConfig",
    "forceStart",
    "showBeforeForce",
    "blockSleep",
    "blockSleepScreenOn",
    "enablePenguin",
    "autoDetectConnection",
    "detectEveryTime",
    "deploymentWithPause",
    "adbLiteEnabled",
    "killAdbOnExit",
    "allowAdbRestart",
    "allowAdbHardRestart",
    "ldExtrasEnabled",
    "ldManualIndex",
    "mumuExtrasEnabled",
    "mumuBridge",
    "useTray",
    "useCardLog",
    "forceGithub",
    "achievementPopupDisabled",
    "achievementPopupAutoClose"
  ].forEach((field) => MaaStorage.copyBoolean(parsed, restored, field));
  ["clientType", "connectConfig", "adbAddress", "adbPath", "touchMode", "updateSource", "proxyType", "maaAdapterType", "maaCoreDir", "ldExtrasPath"].forEach((field) => MaaStorage.copyString(parsed, restored, field));
  if (Number.isInteger(parsed.ldExtrasIndex)) restored.ldExtrasIndex = Math.max(0, parsed.ldExtrasIndex);
  if (parsed?.logThumbnailMax !== undefined) restored.logThumbnailMax = clampNumber(parsed.logThumbnailMax, 1, 9999, SETTINGS_STATE.logThumbnailMax);
  if (Array.isArray(parsed.timers)) restored.timers = restoreTimers(parsed.timers);
  MaaStorage.copyBoolean(parsed, restored, "emulatorLaunchEnabled");
  MaaStorage.copyString(parsed, restored, "emulatorLaunchCommand");
  if (Number.isFinite(parsed.emulatorLaunchWait)) {
    restored.emulatorLaunchWait = Math.max(0, Math.min(300, Math.round(parsed.emulatorLaunchWait)));
  }
  if (parsed.notification && typeof parsed.notification === "object" && !Array.isArray(parsed.notification)) {
    restored.notification = mergeNotificationState(parsed.notification);
  }
  if (Number.isFinite(Number(parsed.taskTimeoutMinutes))) {
    restored.taskTimeoutMinutes = Math.max(0, Math.min(999, Math.round(Number(parsed.taskTimeoutMinutes))));
  }
  return restored;
}

function readSettingsStorage() {
  return MaaStorage.readObject(SETTINGS_STORAGE_KEY, null);
}

function persistSettingsState() {
  MaaStorage.writeObject(SETTINGS_STORAGE_KEY, MaaStorage.pick(SETTINGS_STATE, SETTINGS_PERSISTED_FIELDS));
}

function restoreTimers(timers) {
  return SETTINGS_STATE.timers.map((timer, index) => {
    const value = timers[index];
    if (!value || typeof value !== "object" || Array.isArray(value)) return timer;
    return {
      enabled: typeof value.enabled === "boolean" ? value.enabled : timer.enabled,
      hour: clampNumber(value.hour, 0, 23, timer.hour),
      minute: clampNumber(value.minute, 0, 59, timer.minute),
      config: typeof value.config === "string" ? value.config : timer.config
    };
  });
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function isSettingsEditingLocked() {
  return typeof isProfileEditingLocked === "function"
    ? isProfileEditingLocked()
    : typeof isRunnerBusy === "function" && isRunnerBusy();
}

function isSettingsWriteTarget(target) {
  return Boolean(target.closest(
    "[data-settings-field], [data-settings-flag], [data-timer-enabled], [data-timer-hour], [data-timer-minute], [data-timer-config], [data-settings-current-config], [data-settings-new-config], [data-settings-add-config], [data-settings-delete-config]"
  ));
}

function syncSettingsEditingLock() {
  const root = $("settingsViewRoot");
  if (!root) return;
  const locked = isSettingsEditingLocked();
  root.classList.toggle("settingsLocked", locked);
  root.querySelectorAll(
    "[data-settings-field], [data-settings-flag], [data-timer-enabled], [data-timer-hour], [data-timer-minute], [data-timer-config], [data-settings-current-config], [data-settings-new-config], [data-settings-add-config], [data-settings-delete-config]"
  ).forEach((control) => {
    setSettingsLockDisabled(control, locked);
  });
}

function setSettingsLockDisabled(element, locked) {
  if (!element) return;
  const key = "lockDisabled";
  if (locked) {
    if (!(key in element.dataset)) {
      element.dataset[key] = element.disabled ? "1" : "0";
    }
    element.disabled = true;
    return;
  }
  if (element.dataset[key] === "1") {
    element.disabled = true;
  } else if (element.dataset[key] === "0") {
    element.disabled = false;
  }
  delete element.dataset[key];
}

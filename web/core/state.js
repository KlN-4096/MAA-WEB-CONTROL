const CURRENT_VIEW_KEY = "maa-web.currentView";
const SELECTED_TASK_KEY = "maa-web.selectedTaskByProfile";
const SETTING_MODE_KEY = "maa-web.settingMode";
const DEFAULT_VIEW = "basement";
const FALLBACK_PROFILE_KEY = "__default__";
const PROFILE_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;
const ADD_TASK_TYPES = ["StartUp", "Fight", "Infrast", "Recruit", "Mall", "Award", "Custom", "Roguelike", "Reclamation", "CloseDown", "UserDataUpdate"];
const BUILTIN_PROFILE_TASKS = [
  ["startup", "StartUp", "开始唤醒"],
  ["recruit", "Recruit", "自动公招"],
  ["infrast", "Infrast", "基建换班"],
  ["fight", "Fight", "理智作战"],
  ["remaining-sanity", "Fight", "剩余理智"],
  ["mall", "Mall", "信用收支"],
  ["award", "Award", "领取奖励"],
  ["roguelike", "Roguelike", "自动肉鸽"],
  ["reclamation", "Reclamation", "生息演算"]
];
const DEFAULT_ENABLED_PROFILE_TASKS = new Set(["startup", "recruit", "infrast", "mall", "award"]);
const BUSY_RUNNER_STATES = new Set(["Connecting", "AppendingTasks", "Running", "Stopping"]);
const VISIBLE_LOG_DETAILS = ["what", "taskchain", "subtask", "task_id", "type", "maa_id", "message"];

function restoreCurrentView() {
  const value = MaaStorage.get(CURRENT_VIEW_KEY, DEFAULT_VIEW);
  return typeof value === "string" && value ? value : DEFAULT_VIEW;
}

function persistCurrentView() {
  MaaStorage.set(CURRENT_VIEW_KEY, state.currentView);
}

function restoreSettingMode() {
  const value = MaaStorage.get(SETTING_MODE_KEY);
  return value === "advanced" ? "advanced" : "general";
}

function persistSettingMode() {
  MaaStorage.set(SETTING_MODE_KEY, state.settingMode);
}

const state = {
  profiles: [],
  profile: null,
  selectedTask: 0,
  currentView: restoreCurrentView(),
  settingMode: restoreSettingMode(),
  options: null,
  capabilities: null,
  saveTimer: null,
  postAction: { type: "none", only_if_no_other_maa: false },
  runnerState: "Idle",
  logs: [],
  logCards: []
};

const $ = (id) => document.getElementById(id);
const wiredFeatureIds = new Set();

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function showError(error) {
  addLocalLog("error", "ui.error", error.message || String(error), {
    what: error.name || "Error"
  });
}

function runFeatureAction(featureId, actionName, payload = {}) {
  return window.MaaFeatures?.action(featureId, actionName, payload, FEATURE_CONTEXT);
}

const FEATURE_CONTEXT = {
  state,
  features: window.MaaFeatures,
  getCapabilities: () => state.capabilities,
  api: (...args) => api(...args),
  runFeatureAction,
  renderAll: () => renderAll(),
  renderView: () => renderView(),
  refreshStatus: () => refreshStatus(),
  showError
};

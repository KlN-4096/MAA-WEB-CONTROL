const CURRENT_VIEW_KEY = "maa-web.currentView";
const SELECTED_TASK_KEY = "maa-web.selectedTaskByProfile";
const SETTING_MODE_KEY = "maa-web.settingMode";
const DEFAULT_VIEW = "basement";
const FALLBACK_PROFILE_KEY = "__default__";
const PROFILE_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;
const ADD_TASK_TYPES = ["StartUp", "Fight", "Infrast", "Recruit", "Mall", "Award", "Custom", "Roguelike", "Reclamation", "CloseDown", "UserDataUpdate"];
const POST_ACTION_OPTIONS = [
  { label: "无动作", value: "none" },
  { label: "退出游戏", value: "exit_game" },
  { label: "关闭模拟器", value: "exit_emulator" },
  { label: "睡眠", value: "sleep" },
  { label: "休眠", value: "hibernate" },
  { label: "关机", value: "shutdown" },
  { label: "自定义命令…", value: "run_command" }
];
const POST_ACTION_VALUES = new Set(POST_ACTION_OPTIONS.map((option) => option.value));
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
let basementWired = false;
let draggedTaskIndex = null;
let runRequestPending = false;
let stopRequestPending = false;
let rawLogExpanded = false;
let maaLogViewLoadPromise = null;
let refreshStatusTimer = null;
const wiredFeatureIds = new Set();
const BUSY_RUNNER_STATES = new Set(["Connecting", "AppendingTasks", "Running", "Stopping"]);
const VISIBLE_LOG_DETAILS = ["what", "taskchain", "subtask", "task_id", "type", "maa_id", "message"];

const FEATURE_CONTEXT = {
  state,
  features: window.MaaFeatures,
  getCapabilities: () => state.capabilities,
  api,
  runFeatureAction,
  renderAll,
  renderView,
  refreshStatus,
  showError
};

function restoreCurrentView() {
  const value = MaaStorage.get(CURRENT_VIEW_KEY, DEFAULT_VIEW);
  return typeof value === "string" && value ? value : DEFAULT_VIEW;
}

function persistCurrentView() {
  MaaStorage.set(CURRENT_VIEW_KEY, state.currentView);
}

function profileStorageKey(profile = state.profile) {
  return profile?.name || FALLBACK_PROFILE_KEY;
}

function restoreSelectedTask(profile) {
  const values = MaaStorage.readObject(SELECTED_TASK_KEY, {});
  const value = values[profileStorageKey(profile)] ?? values[FALLBACK_PROFILE_KEY];
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function persistSelectedTask() {
  const values = MaaStorage.readObject(SELECTED_TASK_KEY, {});
  values[profileStorageKey()] = state.selectedTask;
  MaaStorage.writeObject(SELECTED_TASK_KEY, values);
}

function restoreSettingMode() {
  const value = MaaStorage.get(SETTING_MODE_KEY);
  return value === "advanced" ? "advanced" : "general";
}

function persistSettingMode() {
  MaaStorage.set(SETTING_MODE_KEY, state.settingMode);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!response.ok) throw new Error(await response.text() || response.statusText);
  return response.json();
}

function runFeatureAction(featureId, actionName, payload = {}) {
  return window.MaaFeatures?.action(featureId, actionName, payload, FEATURE_CONTEXT);
}

function syncTaskFormOptions() {
  if (typeof setTaskFormOptions === "function") {
    setTaskFormOptions({ ...(state.options || {}), capabilities: state.capabilities });
  }
}

function wireEnabledFeatures() {
  window.MaaFeatures?.list().forEach((feature) => {
    if (wiredFeatureIds.has(feature.id)) return;
    window.MaaFeatures.wire(feature.id, FEATURE_CONTEXT);
    wiredFeatureIds.add(feature.id);
  });
}

async function loadCapabilities() {
  try {
    const result = await api("/api/capabilities");
    state.capabilities = result && typeof result === "object" && !Array.isArray(result) ? result : null;
    if (!state.capabilities) throw new Error("无效的 capabilities 响应");
    window.MaaFeatures?.configure(state.capabilities);
    if (!window.MaaFeatures?.isEnabled(state.currentView)) {
      state.currentView = window.MaaFeatures?.firstId() || DEFAULT_VIEW;
      persistCurrentView();
    }
  } catch (error) {
    state.capabilities = null;
    window.MaaFeatures?.configure(null);
    addLocalLog("warning", "ui.capabilities", "能力配置加载失败，已回退到内置功能。");
  }
  syncTaskFormOptions();
  wireEnabledFeatures();
}

async function loadProfiles() {
  const result = await api("/api/profiles");
  state.profiles = Array.isArray(result.profiles) ? result.profiles : [];
  if (!state.profile && state.profiles.length) await loadProfile(state.profiles[0]);
  renderProfiles();
}

async function loadOptions() {
  try {
    state.options = await api("/api/options");
  } catch (error) {
    state.options = null;
    addLocalLog("warning", "ui.options", "动态选项加载失败，已使用内置选项。");
  }
  syncTaskFormOptions();
  window.MaaFeatures?.call("copilot", "setOptions", state.options);
}

async function loadLogCards() {
  try {
    const logView = getMaaLogView();
    if (!logView) return;
    const result = await api("/api/logs/cards?run_id=current");
    const cards = Array.isArray(result.cards) ? result.cards : [];
    cards.forEach((card) => logView.upsertLogCard(state.logCards, card));
  } catch (error) {
    state.logCards = [];
    addLocalLog("warning", "ui.logs", "卡片日志加载失败，已回退到事件列表。");
  }
}

async function loadProfile(name) {
  state.profile = await api(`/api/profiles/${encodeURIComponent(name)}`);
  state.selectedTask = preferredTaskIndex(state.profile.tasks, restoreSelectedTask(state.profile));
  persistSelectedTask();
  renderAll();
}

async function switchProfileConfig(name) {
  if (isProfileEditingLocked() || !name || state.profile?.name === name) return;
  await flushProfileSave();
  await loadProfile(name);
}

async function flushProfileSave() {
  if (isProfileEditingLocked() || !state.profile) return;
  clearTimeout(state.saveTimer);
  collectProfileForm();
  collectTaskForm();
  await persistProfile(false);
}

function buildProfile(name) {
  return {
    name,
    description: "",
    adb: { address: "127.0.0.1:5555", adb_path: "adb", client_type: "Official", connect_config: {} },
    tasks: BUILTIN_PROFILE_TASKS.map(([id]) => builtInProfileTask(id))
  };
}

function builtInProfileTask(id) {
  const [, type, name] = BUILTIN_PROFILE_TASKS.find((task) => task[0] === id);
  const params = defaultParams(type);
  if (id === "remaining-sanity") {
    Object.assign(params, {
      stage: "1-7",
      stage_plan: ["1-7", "CurrentStage"],
      medicine: 0,
      stone: 0,
      times: 999
    });
  }
  return {
    id,
    type,
    enabled: DEFAULT_ENABLED_PROFILE_TASKS.has(id),
    name,
    params,
    strategy: {}
  };
}

async function deleteProfile(name) {
  if (isProfileEditingLocked() || !name || state.profiles.length <= 1) return false;
  await api(`/api/profiles/${encodeURIComponent(name)}`, { method: "DELETE" });
  const nextProfiles = state.profiles.filter((profileName) => profileName !== name);
  state.profiles = nextProfiles;
  if (state.profile?.name === name) {
    state.profile = null;
    if (nextProfiles.length) await loadProfile(nextProfiles[0]);
  } else {
    await loadProfiles();
  }
  renderAll();
  return true;
}

function scheduleRefreshStatus() {
  if (refreshStatusTimer) return;
  refreshStatusTimer = setTimeout(() => {
    refreshStatusTimer = null;
    refreshStatus().catch(showError);
  }, 600);
}

async function refreshStatus() {
  const [status, adb] = await Promise.all([
    api("/api/status"),
    api("/api/adb/devices")
  ]);
  state.runnerState = status.state || "Idle";
  setText("runnerState", status.state);
  setText("sideRunnerState", status.state);
  setText("taskProgress", `${status.appended_tasks} / ${status.total_tasks}`);
  setText("sideTaskProgress", `${status.appended_tasks} / ${status.total_tasks}`);
  setText("adbStatus", statusMessage(adb, "未配置"));
  setText("toolsAdbStatus", statusMessage(adb, "未配置"));
  syncRunnerControls();
}

function statusMessage(status, unavailableText) {
  if (status?.message) return status.message;
  return status?.available ? "可用" : unavailableText;
}

function renderAll() {
  renderView();
}

function renderMainNav() {
  const nav = document.querySelector(".mainNav");
  if (!nav) return;
  nav.innerHTML = window.MaaFeatures?.list().map((feature) => {
    const active = feature.id === state.currentView ? " active" : "";
    return `<button class="navButton${active}" type="button" data-view="${escapeHtml(feature.id)}">${escapeHtml(feature.title)}</button>`;
  }).join("") || "";
}

function renderBasementView() {
  renderProfileForm();
  renderProfiles();
  renderTasks();
  renderEditor();
  renderPostActionControl();
  syncRunnerControls();
  renderStageTips();
}

function normalizePostAction(action = {}) {
  const source = action && typeof action === "object" ? action : {};
  const type = POST_ACTION_VALUES.has(source.type) ? source.type : "none";
  const timeout = Number(source.command_timeout_seconds);
  return {
    type,
    only_if_no_other_maa: Boolean(source.only_if_no_other_maa),
    command: typeof source.command === "string" ? source.command : "",
    command_timeout_seconds: Number.isFinite(timeout) ? Math.max(1, Math.min(3600, Math.round(timeout))) : 60
  };
}

function renderPostActionControl() {
  const root = document.querySelector(".afterRun");
  if (!root) return;
  const action = normalizePostAction(state.postAction);
  const current = action.type;
  const disabled = isRunnerBusy() ? " disabled" : "";
  const showCommand = current === "run_command";
  root.innerHTML = `<label class="afterRunLabel" for="postActionInput">完成后</label>
    <select id="postActionInput" class="afterRunSelect"${disabled}>
      ${POST_ACTION_OPTIONS.map((option) => {
        const selected = option.value === current ? " selected" : "";
        return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
      }).join("")}
    </select>
    ${showCommand ? `<input id="postActionCommandInput" class="afterRunCommand" placeholder="docker stop redroid" value="${escapeHtml(action.command)}"${disabled} />
    <input id="postActionTimeoutInput" class="afterRunTimeout" type="number" min="1" max="3600" value="${action.command_timeout_seconds}"${disabled} title="超时（秒）" />` : ""}`;
}

async function loadPostActionConfig() {
  try {
    state.postAction = normalizePostAction(await api("/api/post-action"));
    renderPostActionControl();
  } catch (error) {
    addLocalLog("warning", "ui.post_action", "后置动作配置加载失败，已使用无动作。");
  }
}

async function savePostAction(type) {
  if (isRunnerBusy()) return;
  state.postAction = normalizePostAction({ ...state.postAction, type });
  // Re-render first so the command/timeout inputs become visible when switching
  // to run_command, then sync with backend.
  renderPostActionControl();
  state.postAction = normalizePostAction(await api("/api/post-action", {
    method: "PUT",
    body: JSON.stringify(state.postAction)
  }));
  renderPostActionControl();
}

// Stage open schedule: JS getDay() values (0=Sun, 1=Mon, ..., 6=Sat)
const CLIENT_TIMEZONE_OFFSETS = {
  Official: 8,
  Bilibili: 8,
  txwy: 8,
  YoStarEN: -7,
  YoStarJP: 9,
  YoStarKR: 9
};
const STAGE_SCHEDULE = [
  { days: new Set([2,4,6,0]), tip: "CE-6: 龙门币" },
  { days: new Set([1,4,6,0]), tip: "AP-5: 红票" },
  { days: new Set([2,3,5,0]), tip: "CA-5: 技能" },
  { days: new Set([1,3,5,6]), tip: "SK-5: 碳" },
  { days: null,               tip: "LS-6: 经验" },
  { days: new Set([1,4,5,0]), tip: "PR-A-1/2: 奶&盾芯片" },
  { days: new Set([1,2,5,6]), tip: "PR-B-1/2: 术&狙芯片" },
  { days: new Set([3,4,6,0]), tip: "PR-C-1/2: 先&辅芯片" },
  { days: new Set([2,3,6,0]), tip: "PR-D-1/2: 近&特芯片" },
];

function renderStageTips() {
  const block = document.getElementById("stageTipsBlock");
  if (!block) return;
  block.textContent = activeStageTipText() || fallbackStageTipText();
}

function activeStageTipText() {
  const tips = (typeof activeClientOptions === "function" ? activeClientOptions() : null)?.stage_tips
    || state.options?.stage_tips;
  const text = tips && typeof tips.text === "string" ? tips.text.trim() : "";
  return text || "";
}

function fallbackStageTipText() {
  const today = maaStageDay();
  const lines = STAGE_SCHEDULE
    .filter((g) => g.days === null || g.days.has(today))
    .map((g) => g.tip);
  return ["今日关卡小提示:", ...lines].join("\n");
}

function maaStageDay() {
  const client = typeof activeClientType === "function" ? activeClientType() : "Official";
  const offset = CLIENT_TIMEZONE_OFFSETS[client] ?? 8;
  return new Date(Date.now() + (offset - 4) * 60 * 60 * 1000).getUTCDay();
}

function renderView() {
  if (!window.MaaFeatures?.isEnabled(state.currentView) || !window.MaaFeatures?.has(state.currentView) || !$(`view-${state.currentView}`)) {
    state.currentView = window.MaaFeatures?.firstId() || DEFAULT_VIEW;
    persistCurrentView();
  }
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelectorAll(".navButton").forEach((button) => button.classList.remove("active"));
  $(`view-${state.currentView}`).classList.add("active");
  document.querySelector(`[data-view="${state.currentView}"]`)?.classList.add("active");
  setText("viewTitle", window.MaaFeatures?.title(state.currentView) || state.currentView);
  setText("viewSubtitle", state.profile?.name || "");
  window.MaaFeatures?.render(state.currentView, FEATURE_CONTEXT);
}

function renderProfiles() {
  if (!$("profileList")) return;
  const locked = isProfileEditingLocked();
  $("profileList").innerHTML = state.profiles.map((name) => {
    const active = state.profile?.name === name ? " active" : "";
    const lockedClass = locked ? " locked" : "";
    return `<button class="profileItem${active}${lockedClass}" data-profile="${escapeHtml(name)}">
      <strong>${escapeHtml(name)}</strong>
    </button>`;
  }).join("");
  syncProfileEditingControls();
}

function renderProfileForm() {
  if (!state.profile || !$("profileNameInput")) return;
  $("profileDescription").textContent = state.profile.description || state.profile.name;
  $("profileNameInput").value = state.profile.name;
  $("adbAddressInput").value = state.profile.adb?.address || "";
  $("clientTypeInput").value = state.profile.adb?.client_type || "";
  $("descriptionInput").value = state.profile.description || "";
  syncProfileEditingControls();
}

function renderTasks() {
  const tasks = state.profile?.tasks || [];
  closeTaskContextMenu();
  $("taskList").innerHTML = tasks.map((task, index) => taskListItem(task, index)).join("");
}

function taskListItem(task, index) {
  const active = index === state.selectedTask ? " active" : "";
  const disabled = task.enabled ? "" : " disabled";
  const locked = isProfileEditingLocked();
  const lockedClass = locked ? " locked" : "";
  const draggable = locked ? "false" : "true";
  const title = task.name || task.id;
  const checked = task.enabled ? " checked" : "";
  return `<div class="taskItem${active}${disabled}${lockedClass}" data-task-index="${index}" draggable="${draggable}">
    <input class="taskEnable" type="checkbox" data-task-enable="${index}"${checked} />
    <button class="taskNameButton" type="button" data-task-select="${index}">
      <strong>${escapeHtml(title)}</strong>
      <span class="meta">${escapeHtml(task.type)} · ${escapeHtml(task.id)}</span>
    </button>
    <button class="taskConfigButton" type="button" data-task-select="${index}" title="任务设置">⚙</button>
  </div>`;
}

function renderEditor() {
  const task = selectedTask();
  if (task && state.settingMode === "advanced" && !taskSupportsAdvanced(task.type)) {
    state.settingMode = "general";
    persistSettingMode();
  }
  $("taskEditor").className = task ? "taskEditor" : "taskEditor empty";
  $("taskEditor").innerHTML = renderTaskEditor(task, escapeHtml, state.settingMode);
  renderSettingModeButtons();
  syncProfileEditingControls();
}

function selectedTask() {
  return state.profile?.tasks?.[state.selectedTask] || null;
}

function preferredTaskIndex(tasks, index = state.selectedTask) {
  if (!tasks?.length) return 0;
  return Math.max(0, Math.min(index, tasks.length - 1));
}

function collectProfileForm() {
  if (isProfileEditingLocked() || !$("profileNameInput")) return;
  state.profile.name = $("profileNameInput").value.trim() || "daily";
  state.profile.description = $("descriptionInput").value.trim();
  state.profile.adb = state.profile.adb || {};
  state.profile.adb.address = $("adbAddressInput").value.trim();
  state.profile.adb.client_type = $("clientTypeInput").value.trim();
}

function collectTaskForm() {
  const task = selectedTask();
  if (isProfileEditingLocked() || !task || !$("taskIdInput")) return;
  collectTaskEditor(task);
}

function parseJsonField(id) {
  const text = $(id).value.trim();
  return text ? JSON.parse(text) : {};
}

function moveTask(offset) {
  if (isProfileEditingLocked()) return;
  const tasks = state.profile?.tasks || [];
  const from = state.selectedTask;
  const to = from + offset;
  if (to < 0 || to >= tasks.length) return;
  [tasks[from], tasks[to]] = [tasks[to], tasks[from]];
  state.selectedTask = to;
  persistSelectedTask();
  renderTasks();
  renderEditor();
}

async function saveProfile() {
  if (isProfileEditingLocked()) return state.profile;
  collectProfileForm();
  collectTaskForm();
  await persistProfile(true);
}

async function persistProfile(withFeedback) {
  const name = state.profile.name;
  state.profile = await api(`/api/profiles/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(state.profile)
  });
  if (withFeedback) {
    await loadProfiles();
    addLocalLog("info", "profile.saved", `已保存 ${name}`);
  }
}

function scheduleSave() {
  if (isProfileEditingLocked()) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    if (isProfileEditingLocked()) return;
    collectTaskForm();
    persistProfile(false).catch(showError);
  }, 500);
}

async function runProfile() {
  if (isRunnerBusy() || runRequestPending || !state.profile) return;
  runRequestPending = true;
  syncRunnerControls();
  try {
    await saveProfile();
    await api(`/api/profiles/${encodeURIComponent(state.profile.name)}/run`, { method: "POST" });
    await refreshStatus();
  } finally {
    runRequestPending = false;
    syncRunnerControls();
  }
}

async function stopRun() {
  if (!isRunnerBusy() || stopRequestPending) return;
  stopRequestPending = true;
  syncRunnerControls();
  try {
    await api("/api/stop", { method: "POST" });
    await refreshStatus();
  } finally {
    stopRequestPending = false;
    syncRunnerControls();
  }
}

function isRunnerBusy(value = state.runnerState) {
  return BUSY_RUNNER_STATES.has(value);
}

function isProfileEditingLocked(value = state.runnerState) {
  return isRunnerBusy(value);
}

function syncRunnerControls() {
  const runButton = $("runButton");
  const stopButton = $("stopButton");
  const busy = isRunnerBusy();
  if (runButton) {
    runButton.classList.toggle("stopStart", busy);
    runButton.disabled = runRequestPending || stopRequestPending || state.runnerState === "Stopping";
    runButton.textContent = state.runnerState === "Stopping" ? "停止中" : (busy ? "停止" : "Link Start!");
  }
  if (stopButton) {
    stopButton.classList.add("ghost");
    stopButton.disabled = true;
  }
  syncProfileEditingControls();
  if (typeof syncSettingsEditingLock === "function") syncSettingsEditingLock();
}

function syncProfileEditingControls() {
  const locked = isProfileEditingLocked();
  setDisabledByIds([
    "saveButton",
    "addTaskButton",
    "deleteTaskButton",
    "moveUpButton",
    "profileNameInput",
    "descriptionInput",
    "adbAddressInput",
    "clientTypeInput",
    "newProfileButton",
    "postActionInput"
  ], locked);
  document.querySelectorAll("#profileList .profileItem").forEach((button) => {
    setLockDisabled(button, locked);
  });
  document.querySelectorAll("#taskList [data-task-index]").forEach((item) => {
    item.classList.toggle("locked", locked);
    item.draggable = !locked;
  });
  document.querySelectorAll("[data-task-enable]").forEach((checkbox) => {
    setLockDisabled(checkbox, locked);
  });
  const editor = $("taskEditor");
  if (editor) {
    editor.classList.toggle("locked", locked);
    editor.querySelectorAll("input, select, textarea, button").forEach((control) => {
      setLockDisabled(control, locked);
    });
  }
  if (locked) closeTaskMenus();
  renderSettingModeButtons();
}

function setDisabledByIds(ids, disabled) {
  ids.forEach((id) => {
    const element = $(id);
    if (element) setLockDisabled(element, disabled);
  });
}

function setLockDisabled(element, locked) {
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

function addLocalLog(level, type, message, detail = {}) {
  addLogItem({ ts: new Date().toISOString(), level, type, message, detail });
}

function addLogItem(item) {
  const event = normalizeLogItem(item);
  state.logs.push(event);
  state.logs = state.logs.slice(-1000);
  if (rawLogExpanded) renderRawLogs();
  if (event.type?.startsWith("maa.log.")) {
    handleMaaLogEvent(event);
  } else if (event.type?.startsWith("maa.tools.") && typeof handleToolEvent === "function") {
    handleToolEvent(event);
  } else if (!shouldUseCardLog()) {
    renderLogs();
  }
}

function renderLogs() {
  const list = $("logList");
  if (!list) return;
  const logView = getMaaLogView();
  if (shouldUseCardLog()) {
    if (logView && state.logCards.length) {
      list.innerHTML = logView.renderLogCards(state.logCards);
      scrollLogListToBottom();
    } else {
      list.innerHTML = `<div class="logEmpty">等待事件</div>`;
    }
    return;
  }
  list.innerHTML = logView ? logView.renderLegacyLogItems(state.logs) : renderLegacyLogItemsFallback(state.logs);
  scrollLogListToBottom();
}

function renderRawLogs() {
  const list = $("rawLogList");
  if (!list) return;
  const logView = getMaaLogView();
  list.innerHTML = logView
    ? logView.renderLegacyLogItems(state.logs)
    : renderLegacyLogItemsFallback(state.logs);
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
}

function toggleRawLog() {
  rawLogExpanded = !rawLogExpanded;
  const list = $("rawLogList");
  const btn = $("rawLogToggle");
  if (list) list.hidden = !rawLogExpanded;
  if (btn) btn.textContent = rawLogExpanded ? "收起" : "展开";
  if (rawLogExpanded) renderRawLogs();
}

function handleMaaLogEvent(event) {
  if (event.type === "maa.log.clear") {
    state.logCards = [];
    // Only strip MAA card log entries; keep runner/scheduler/ui DEV events
    state.logs = state.logs.filter((e) => !e.type?.startsWith("maa.log."));
    renderLogs();
    if (rawLogExpanded) renderRawLogs();
    return;
  }
  const logView = getMaaLogView();
  const detail = event.detail || {};
  if (detail.card && logView) {
    logView.upsertLogCard(state.logCards, detail.card);
    renderLogs();
    return;
  }
  if (event.type === "maa.log.run.completed") {
    renderLogs();
  }
}

function shouldUseCardLog() {
  return typeof SETTINGS_STATE === "undefined" || SETTINGS_STATE.useCardLog !== false;
}

function getMaaLogView() {
  const view = window.MaaLogView;
  return view && typeof view.renderLogCards === "function" && typeof view.upsertLogCard === "function" ? view : null;
}

async function ensureMaaLogView() {
  if (getMaaLogView()) return;
  if (!maaLogViewLoadPromise) {
    maaLogViewLoadPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = `/maaCards.js?v=${Date.now()}`;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.body.appendChild(script);
    });
  }
  await maaLogViewLoadPromise;
}

function renderLegacyLogItemsFallback(items = []) {
  if (!items.length) return `<div class="logEmpty">等待事件</div>`;
  return items.map((item) => {
    const details = renderLogDetails(item.detail);
    return `<div class="logItem ${escapeHtml(item.level)}">
      <time class="logTime">${escapeHtml(formatLogTime(item.ts))}</time>
      <div class="logBody">
        <strong class="logMessage">${escapeHtml(item.message)}</strong>
        <span class="logType">${escapeHtml(item.type)}</span>
        ${details}
      </div>
    </div>`;
  }).join("");
}

function scrollLogListToBottom() {
  const list = $("logList");
  if (!list) return;
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
}

function normalizeLogItem(item = {}) {
  const detail = item.detail && typeof item.detail === "object" && !Array.isArray(item.detail) ? item.detail : {};
  const level = ["debug", "info", "warning", "error"].includes(item.level) ? item.level : "info";
  return {
    ts: item.ts || new Date().toISOString(),
    level,
    type: item.type || "ui.event",
    message: item.message || item.type || "事件",
    detail
  };
}

function formatLogTime(value) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return "--:--:--";
  return time.toLocaleTimeString("zh-CN", { hour12: false });
}

function renderLogDetails(detail) {
  const entries = logDetailEntries(detail);
  if (!entries.length) return "";
  return `<dl class="logDetails">${entries.map(([key, value]) => `
    <div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>
  `).join("")}</dl>`;
}

function logDetailEntries(detail) {
  const sources = [detail];
  if (detail.details && typeof detail.details === "object" && !Array.isArray(detail.details)) sources.push(detail.details);
  const entries = [];
  VISIBLE_LOG_DETAILS.forEach((key) => {
    const value = sources.map((source) => source[key]).find((candidate) => candidate !== undefined && candidate !== null && candidate !== "");
    if (value !== undefined) entries.push([key, stringifyLogDetail(value)]);
  });
  return entries.slice(0, 4);
}

function stringifyLogDetail(value) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function wireEvents() {
  document.querySelector(".mainNav").addEventListener("click", switchView);
  $("refreshButton").addEventListener("click", () => boot().catch(showError));
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeyDown);
  wireSettingsContentScroll();
}

function wireBasementView() {
  if (basementWired) return;
  addListener(".modeTabs", "click", switchSettingMode);
  addListener("#profileList", "click", onProfileClick);
  addListener("#taskList", "click", onTaskClick);
  addListener("#taskList", "change", onTaskEnableChange);
  addListener("#taskList", "contextmenu", onTaskContextMenu);
  addListener("#taskList", "dragstart", onTaskDragStart);
  addListener("#taskList", "dragover", onTaskDragOver);
  addListener("#taskList", "dragleave", onTaskDragLeave);
  addListener("#taskList", "drop", onTaskDrop);
  addListener("#taskList", "dragend", onTaskDragEnd);
  addListener("#saveButton", "click", () => runFeatureAction("basement", "save")?.catch(showError));
  addListener("#runButton", "click", () => {
    (isRunnerBusy() ? stopRun() : runProfile()).catch(showError);
  });
  addListener("#stopButton", "click", () => stopRun().catch(showError));
  addListener("#addTaskButton", "click", onAddTaskButtonClick);
  addListener("#deleteTaskButton", "click", () => runFeatureAction("basement", "clearTasks"));
  addListener("#moveUpButton", "click", () => runFeatureAction("basement", "selectAllTasks"));
  addListener("#clearLogsButton", "click", () => runFeatureAction("basement", "clearLogs"));
  addListener("#rawLogToggle", "click", toggleRawLog);
  addListener("#newProfileButton", "click", () => runFeatureAction("basement", "createProfile")?.catch(showError));
  addListener(".afterRun", "change", onPostActionChange);
  addListener("#taskEditor", "change", onTaskEditorChange);
  addListener("#taskEditor", "click", onTaskEditorClick);
  basementWired = true;
}

function addListener(selector, type, listener) {
  const element = document.querySelector(selector);
  if (element) element.addEventListener(type, listener);
}

function switchView(event) {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  closeTaskMenus();
  state.currentView = button.dataset.view;
  persistCurrentView();
  renderView();
}

function switchSettingMode(event) {
  const button = event.target.closest("[data-setting-mode]");
  if (!button || button.disabled) return;
  setSettingMode(button.dataset.settingMode);
}

function setSettingMode(mode) {
  if (mode !== "general" && mode !== "advanced") return;
  if (isProfileEditingLocked()) return;
  collectTaskForm();
  state.settingMode = mode;
  persistSettingMode();
  renderEditor();
  scheduleSave();
}

function renderSettingModeButtons() {
  const task = selectedTask();
  const supportsAdvanced = task ? taskSupportsAdvanced(task.type) : false;
  const locked = isProfileEditingLocked();
  document.querySelectorAll("[data-setting-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.settingMode === state.settingMode);
    button.disabled = locked || (button.dataset.settingMode === "advanced" && !supportsAdvanced);
  });
}

function onProfileClick(event) {
  if (isProfileEditingLocked()) return;
  const button = event.target.closest("[data-profile]");
  if (button) loadProfile(button.dataset.profile).catch(showError);
}

function onTaskClick(event) {
  const target = event.target.closest("[data-task-select]");
  if (!target) return;
  selectTaskIndex(Number(target.dataset.taskSelect));
}

function selectTaskIndex(index) {
  if (!state.profile?.tasks?.[index]) return;
  if (!isProfileEditingLocked()) collectTaskForm();
  state.selectedTask = index;
  persistSelectedTask();
  renderTasks();
  renderEditor();
}

function onTaskEnableChange(event) {
  const checkbox = event.target.closest("[data-task-enable]");
  if (!checkbox) return;
  if (isProfileEditingLocked()) {
    const task = state.profile?.tasks?.[Number(checkbox.dataset.taskEnable)];
    checkbox.checked = Boolean(task?.enabled);
    return;
  }
  setTaskEnabled(Number(checkbox.dataset.taskEnable), checkbox.checked);
}

function setTaskEnabled(index, enabled) {
  if (isProfileEditingLocked()) return;
  if (!state.profile?.tasks?.[index]) return;
  state.profile.tasks[index].enabled = Boolean(enabled);
  renderTasks();
  if (index === state.selectedTask) renderEditor();
  scheduleSave();
}

function addTask(type) {
  if (isProfileEditingLocked()) return;
  state.profile.tasks.push(defaultTask(type));
  state.selectedTask = state.profile.tasks.length - 1;
  persistSelectedTask();
  renderTasks();
  renderEditor();
  scheduleSave();
}

function deleteTask(index) {
  if (isProfileEditingLocked()) return;
  const tasks = state.profile?.tasks || [];
  if (!tasks[index]) return;
  collectTaskForm();
  tasks.splice(index, 1);
  state.selectedTask = preferredTaskIndex(tasks, Math.min(state.selectedTask, tasks.length - 1));
  persistSelectedTask();
  renderTasks();
  renderEditor();
  scheduleSave();
}

function renameTask(index) {
  if (isProfileEditingLocked()) return;
  const task = state.profile?.tasks?.[index];
  if (!task) return;
  collectTaskForm();
  const currentName = task.name || task.id;
  const nextName = prompt("重命名任务", currentName);
  if (nextName === null) return;
  const trimmed = nextName.trim();
  if (!trimmed || trimmed === currentName) return;
  task.name = trimmed;
  renderTasks();
  renderEditor();
  scheduleSave();
}

async function runTaskOnce(index) {
  const task = state.profile?.tasks?.[index];
  if (!task) return;
  if (isRunnerBusy()) {
    addLocalLog("warning", "task.once", "当前有任务在运行，请先停止");
    return;
  }
  const title = task.name || task.id;
  addLocalLog("info", "task.once", `单次运行：${title}`);
  try {
    const onceProfile = { ...state.profile, tasks: [{ ...task, enabled: true }] };
    await api("/api/run", {
      method: "POST",
      body: JSON.stringify({ profile: onceProfile })
    });
    await refreshStatus();
  } catch (error) {
    showError(error);
  }
}

function reorderTask(from, target, insertAfter) {
  if (isProfileEditingLocked()) return;
  const tasks = state.profile?.tasks || [];
  if (!tasks[from] || !tasks[target]) return;
  let to = insertAfter ? target + 1 : target;
  if (from < to) to -= 1;
  if (from === to) return;
  collectTaskForm();
  const [task] = tasks.splice(from, 1);
  tasks.splice(to, 0, task);
  updateSelectedTaskAfterReorder(from, to);
  persistSelectedTask();
  renderTasks();
  renderEditor();
  scheduleSave();
}

function updateSelectedTaskAfterReorder(from, to) {
  if (state.selectedTask === from) {
    state.selectedTask = to;
  } else if (from < state.selectedTask && state.selectedTask <= to) {
    state.selectedTask -= 1;
  } else if (to <= state.selectedTask && state.selectedTask < from) {
    state.selectedTask += 1;
  }
}

function onAddTaskButtonClick(event) {
  event.preventDefault();
  event.stopPropagation();
  closeTaskContextMenu();
  if (isProfileEditingLocked()) return;
  toggleTaskTypeMenu(event.currentTarget);
}

function onPostActionChange(event) {
  const select = event.target.closest("#postActionInput");
  if (select) {
    savePostAction(select.value).catch(showError);
    return;
  }
  const command = event.target.closest("#postActionCommandInput");
  if (command) {
    state.postAction = normalizePostAction({ ...state.postAction, command: command.value });
    savePostActionFull().catch(showError);
    return;
  }
  const timeout = event.target.closest("#postActionTimeoutInput");
  if (timeout) {
    state.postAction = normalizePostAction({ ...state.postAction, command_timeout_seconds: timeout.value });
    savePostActionFull().catch(showError);
  }
}

async function savePostActionFull() {
  if (isRunnerBusy()) return;
  state.postAction = normalizePostAction(await api("/api/post-action", {
    method: "PUT",
    body: JSON.stringify(state.postAction)
  }));
  renderPostActionControl();
}

function addTaskTypeOptions() {
  return ADD_TASK_TYPES
    .filter((type) => typeof taskDefinition !== "function" || taskDefinition(type).enabled !== false)
    .map((type) => ({
      id: type,
      title: taskMenuTitle(type)
    }));
}

function taskMenuTitle(type) {
  const localizedTitle = typeof TASK_NAMES !== "undefined" && TASK_NAMES ? TASK_NAMES[type] : "";
  if (typeof localizedTitle === "string" && localizedTitle) return localizedTitle;
  if (typeof taskDefinition === "function") {
    const definition = taskDefinition(type);
    if (typeof definition?.title === "string" && definition.title) return definition.title;
  }
  return type;
}

function toggleTaskTypeMenu(anchor) {
  if ($("taskTypeMenu")) {
    closeTaskTypeMenu();
    return;
  }
  const menu = document.createElement("div");
  menu.id = "taskTypeMenu";
  menu.className = "taskPopupMenu taskTypeMenu";
  menu.innerHTML = addTaskTypeOptions().map((task) => (
    `<button type="button" data-task-add-type="${escapeHtml(task.id)}">
      <strong>${escapeHtml(task.title)}</strong>
      <span>${escapeHtml(task.id)}</span>
    </button>`
  )).join("");
  document.body.appendChild(menu);
  placeMenu(menu, anchor.getBoundingClientRect().left, anchor.getBoundingClientRect().bottom + 4);
}

function onTaskContextMenu(event) {
  const item = event.target.closest("[data-task-index]");
  if (!item) return;
  event.preventDefault();
  if (isProfileEditingLocked()) return;
  closeTaskTypeMenu();
  showTaskContextMenu(Number(item.dataset.taskIndex), event.clientX, event.clientY);
}

function showTaskContextMenu(index, x, y) {
  closeTaskContextMenu();
  const menu = document.createElement("div");
  menu.id = "taskContextMenu";
  menu.className = "taskPopupMenu taskContextMenu";
  menu.dataset.taskIndex = index;
  menu.innerHTML = `
    <button type="button" data-task-context-action="runOnce">单次运行</button>
    <button type="button" data-task-context-action="rename">重命名</button>
    <button type="button" data-task-context-action="delete" class="danger">删除</button>
  `;
  document.body.appendChild(menu);
  placeMenu(menu, x, y);
}

function onDocumentClick(event) {
  const thumbnail = event.target.closest("[data-log-thumbnail]");
  if (thumbnail) {
    openLogThumbnail(thumbnail.dataset.logThumbnail);
    return;
  }

  const tooltipBtn = event.target.closest("[data-log-tooltip]");
  if (tooltipBtn) {
    toggleLogTooltipPopup(tooltipBtn);
    return;
  }

  if (!event.target.closest(".maaLogTooltipPopup")) {
    closeLogTooltipPopup();
  }

  const addType = event.target.closest("[data-task-add-type]");
  if (addType) {
    if (!isProfileEditingLocked()) {
      runFeatureAction("basement", "addTask", { type: addType.dataset.taskAddType });
    }
    closeTaskTypeMenu();
    return;
  }

  const contextAction = event.target.closest("[data-task-context-action]");
  if (contextAction) {
    if (!isProfileEditingLocked()) {
      runTaskContextAction(contextAction.dataset.taskContextAction);
    }
    closeTaskContextMenu();
    return;
  }

  if (!event.target.closest("#taskTypeMenu") && !event.target.closest("#addTaskButton")) closeTaskTypeMenu();
  if (!event.target.closest("#taskContextMenu")) closeTaskContextMenu();
}

function onDocumentKeyDown(event) {
  if (event.key !== "Escape") return;
  closeLogThumbnail();
  closeLogTooltipPopup();
  closeTaskMenus();
}

function runTaskContextAction(action) {
  const index = Number($("taskContextMenu")?.dataset.taskIndex);
  if (!Number.isInteger(index)) return;
  if (action === "runOnce") runTaskOnce(index);
  if (action === "rename") renameTask(index);
  if (action === "delete") deleteTask(index);
}

function placeMenu(menu, x, y) {
  const margin = 8;
  const left = Math.min(x, window.innerWidth - menu.offsetWidth - margin);
  const top = Math.min(y, window.innerHeight - menu.offsetHeight - margin);
  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${Math.max(margin, top)}px`;
}

function closeTaskMenus() {
  closeTaskTypeMenu();
  closeTaskContextMenu();
}

function closeTaskTypeMenu() {
  $("taskTypeMenu")?.remove();
}

function closeTaskContextMenu() {
  $("taskContextMenu")?.remove();
}

function onTaskDragStart(event) {
  const item = event.target.closest("[data-task-index]");
  if (!item) return;
  if (isProfileEditingLocked()) {
    event.preventDefault();
    return;
  }
  draggedTaskIndex = Number(item.dataset.taskIndex);
  item.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(draggedTaskIndex));
}

function onTaskDragOver(event) {
  if (isProfileEditingLocked()) return;
  const item = event.target.closest("[data-task-index]");
  if (!item || draggedTaskIndex === null) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  markTaskDropTarget(item, event.clientY);
}

function onTaskDragLeave(event) {
  const item = event.target.closest("[data-task-index]");
  if (item && !item.contains(event.relatedTarget)) clearTaskDropMarks(item);
}

function onTaskDrop(event) {
  if (isProfileEditingLocked()) return;
  const item = event.target.closest("[data-task-index]");
  if (!item || draggedTaskIndex === null) return;
  event.preventDefault();
  const target = Number(item.dataset.taskIndex);
  const insertAfter = isAfterTaskMidline(item, event.clientY);
  clearAllTaskDragState();
  reorderTask(draggedTaskIndex, target, insertAfter);
  draggedTaskIndex = null;
}

function onTaskDragEnd() {
  draggedTaskIndex = null;
  clearAllTaskDragState();
}

function markTaskDropTarget(item, y) {
  document.querySelectorAll(".taskItem.dropBefore, .taskItem.dropAfter").forEach(clearTaskDropMarks);
  item.classList.toggle("dropAfter", isAfterTaskMidline(item, y));
  item.classList.toggle("dropBefore", !isAfterTaskMidline(item, y));
}

function isAfterTaskMidline(item, y) {
  const rect = item.getBoundingClientRect();
  return y > rect.top + rect.height / 2;
}

function clearTaskDropMarks(item) {
  item.classList.remove("dropBefore", "dropAfter");
}

function clearAllTaskDragState() {
  document.querySelectorAll(".taskItem").forEach((item) => {
    item.classList.remove("dragging", "dropBefore", "dropAfter");
  });
}

function wireSettingsContentScroll() {
  const content = document.querySelector(".content");
  if (content && typeof onSettingsScroll === "function") {
    content.addEventListener("scroll", onSettingsScroll, { passive: true });
  }
}

function patchSettingsInternalScroll() {
  if (typeof scrollSettingsSection !== "function") return;
  scrollSettingsSection = (index, behavior = "smooth") => {
    const target = document.querySelectorAll(".settingsFold")[index];
    const scroller = document.querySelector(".content");
    if (!target || !scroller) return;
    if (typeof suppressSettingsScroll === "function") {
      const smoothDuration = typeof SETTINGS_SMOOTH_SCROLL_SUPPRESS_MS === "number" ? SETTINGS_SMOOTH_SCROLL_SUPPRESS_MS : 1200;
      const autoDuration = typeof SETTINGS_AUTO_SCROLL_SUPPRESS_MS === "number" ? SETTINGS_AUTO_SCROLL_SUPPRESS_MS : 120;
      suppressSettingsScroll(behavior === "smooth" ? smoothDuration : autoDuration);
    }
    const targetTop = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 16;
    scroller.scrollTo({ top: Math.max(0, targetTop), behavior });
  };
}

function clearTasks() {
  if (isProfileEditingLocked()) return;
  state.profile.tasks.forEach((task) => { task.enabled = false; });
  renderTasks();
  renderEditor();
  scheduleSave();
}

function selectAllTasks() {
  if (isProfileEditingLocked()) return;
  state.profile.tasks.forEach((task) => { task.enabled = true; });
  renderTasks();
  renderEditor();
  scheduleSave();
}

function clearLogs() {
  state.logs = [];
  state.logCards = [];
  renderLogs();
  if (rawLogExpanded) renderRawLogs();
  return api("/api/logs/clear", { method: "POST" }).catch(showError);
}

function openLogThumbnail(thumbnailId) {
  const card = state.logCards.find((entry) => entry.thumbnail_id === thumbnailId);
  const url = card?.thumbnail_url;
  if (!url) return;
  const originalUrl = card?.original_url || "";
  const originalButton = originalUrl
    ? `<button type="button" class="maaLogPreviewOriginal" data-log-original="${escapeHtml(originalUrl)}">查看原图</button>`
    : "";
  closeLogThumbnail();
  const overlay = document.createElement("div");
  overlay.className = "maaLogPreview";
  overlay.innerHTML = `<div class="maaLogPreviewToolbar">
      ${originalButton}
      <button type="button" class="maaLogPreviewClose" aria-label="关闭">×</button>
    </div>
    <img src="${escapeHtml(url)}" alt="" />`;
  overlay.addEventListener("click", (event) => {
    const original = event.target.closest("[data-log-original]");
    if (original) {
      const img = overlay.querySelector("img");
      if (img) img.src = original.dataset.logOriginal;
      original.disabled = true;
      original.textContent = "已显示原图";
      return;
    }
    if (event.target === overlay || event.target.closest(".maaLogPreviewClose")) closeLogThumbnail();
  });
  document.body.appendChild(overlay);
}

function closeLogThumbnail() {
  document.querySelector(".maaLogPreview")?.remove();
}

function toggleLogTooltipPopup(btn) {
  const existing = document.querySelector(".maaLogTooltipPopup");
  if (existing && existing.dataset.anchorId === btn.dataset.logTooltip) {
    existing.remove();
    return;
  }
  closeLogTooltipPopup();
  let data;
  try { data = JSON.parse(btn.dataset.logTooltip); } catch { data = btn.dataset.logTooltip; }
  const popup = document.createElement("div");
  popup.className = "maaLogTooltipPopup";
  popup.dataset.anchorId = btn.dataset.logTooltip;
  popup.innerHTML = renderTooltipContent(data);
  document.body.appendChild(popup);
  const btnRect = btn.getBoundingClientRect();
  const top = Math.min(btnRect.bottom + 6, window.innerHeight - popup.offsetHeight - 8);
  const left = Math.min(btnRect.left, window.innerWidth - popup.offsetWidth - 8);
  popup.style.top = `${Math.max(8, top)}px`;
  popup.style.left = `${Math.max(8, left)}px`;
}

function closeLogTooltipPopup() {
  document.querySelector(".maaLogTooltipPopup")?.remove();
}

function renderTooltipContent(data) {
  if (!data || typeof data !== "object") return `<div class="tooltipRow">${escapeHtml(String(data))}</div>`;
  const KIND_LABELS = {
    stage_drops: "掉落统计", recruit_tags: "公招Tags", recruit_result: "公招结果",
    facility: "设施", screenshot: "截图方式"
  };
  const kind = data.kind;
  if (kind === "screenshot") return renderScreenshotTooltip(data, KIND_LABELS.screenshot);
  const title = KIND_LABELS[kind] || kind || "详情";
  const rows = Object.entries(data)
    .filter(([k]) => k !== "kind")
    .map(([k, v]) => {
      const val = Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
      return `<div class="tooltipRow"><span class="tooltipKey">${escapeHtml(k)}</span><span class="tooltipVal">${escapeHtml(val)}</span></div>`;
    }).join("");
  return `<div class="tooltipTitle">${escapeHtml(title)}</div>${rows || "<div class=\"tooltipRow\">—</div>"}`;
}

function renderScreenshotTooltip(data, title) {
  const alternatives = Array.isArray(data.alternatives) && data.alternatives.length ? data.alternatives : [data];
  const rows = alternatives.map((item) => {
    const method = item && typeof item === "object" ? (item.method || data.method || "Unknown") : "Unknown";
    const cost = item && typeof item === "object" ? (item.cost != null ? item.cost : "???") : "???";
    return `<div class="tooltipRow tooltipScreencapRow"><span class="tooltipKey">${escapeHtml(method)}</span><span class="tooltipVal">${escapeHtml(`${cost} ms`)}</span></div>`;
  }).join("");
  return `<div class="tooltipTitle">${escapeHtml(title)}</div>${rows || "<div class=\"tooltipRow\">—</div>"}`;
}

async function createProfile(name = "") {
  if (isProfileEditingLocked()) return;
  await flushProfileSave();
  const profileName = String(name || `profile-${Date.now().toString().slice(-5)}`).trim();
  const safeName = profileName || "daily";
  if (!PROFILE_NAME_PATTERN.test(safeName)) {
    throw new Error("配置名称只能包含字母、数字、点、横线和下划线。");
  }
  state.profile = buildProfile(safeName);
  state.selectedTask = 0;
  persistSelectedTask();
  renderAll();
  await persistProfile(false);
  await loadProfiles();
  await loadProfile(state.profile.name);
}

function onTaskEditorChange(event) {
  if (isProfileEditingLocked()) {
    event.preventDefault();
    renderEditor();
    return;
  }
  const rerenderFields = new Set(["paramRoguelikeTheme", "paramRoguelikeStrategy", "paramReclamationStrategy", "paramInfrastMode"]);
  if (rerenderFields.has(event.target.id)) {
    collectTaskForm();
    renderTasks();
    renderEditor();
    renderStageTips();
    scheduleSave();
    return;
  }

  if (event.target.id !== "taskTypeInput") {
    collectTaskForm();
    renderTasks();
    renderStageTips();
    scheduleSave();
    return;
  }
  const task = selectedTask();
  task.type = event.target.value;
  task.params = defaultParams(task.type);
  renderEditor();
  renderTasks();
  renderStageTips();
  scheduleSave();
}

function onTaskEditorClick(event) {
  if (isProfileEditingLocked()) {
    event.preventDefault();
    return;
  }
  const stageButton = event.target.closest("[data-stage-action]");
  if (stageButton) {
    updateStagePlan(stageButton);
    return;
  }

  const button = event.target.closest("[data-facility-action]");
  if (!button) return;
  const checked = button.dataset.facilityAction === "all";
  document.querySelectorAll(".facilityBox input[type=\"checkbox\"]").forEach((checkbox) => {
    checkbox.checked = checked;
  });
  collectTaskForm();
  scheduleSave();
}

function updateStagePlan(button) {
  collectTaskForm();
  const task = selectedTask();
  if (!task) return;

  const params = task.params || {};
  const plan = currentStagePlan(params);
  if (button.dataset.stageAction === "add") {
    plan.push("CurrentStage");
    params.use_alternate_stage = true;
  } else if (button.dataset.stageAction === "remove" && plan.length > 1) {
    plan.splice(Number(button.dataset.stageIndex), 1);
  }

  params.stage_plan = plan;
  params.stage = plan[0] || "CurrentStage";
  task.params = params;
  renderEditor();
  scheduleSave();
}

function currentStagePlan(params) {
  const plan = Array.isArray(params.stage_plan) ? params.stage_plan : [params.stage || "CurrentStage"];
  const values = plan.length ? [...plan] : ["CurrentStage"];
  return typeof normalizeStageValue === "function" ? values.map(normalizeStageValue) : values;
}

function persistBasementState() {
  persistSelectedTask();
  persistSettingMode();
}

function basementPayload(payload) {
  return payload && typeof payload === "object" ? payload : { value: payload };
}

const BASEMENT_ACTIONS = {
  save: () => saveProfile(),
  run: () => runProfile(),
  stop: () => stopRun(),
  addTask: (payload) => {
    const value = basementPayload(payload);
    addTask(value.type ?? value.value);
  },
  clearTasks: () => clearTasks(),
  selectAllTasks: () => selectAllTasks(),
  createProfile: (payload) => {
    const value = basementPayload(payload);
    return createProfile(value.name ?? value.value);
  },
  clearLogs: () => clearLogs(),
  selectTask: (payload) => {
    const value = basementPayload(payload);
    selectTaskIndex(Number(value.index ?? value.value));
  },
  setTaskEnabled: (payload) => {
    const value = basementPayload(payload);
    setTaskEnabled(Number(value.index), value.enabled);
  },
  setSettingMode: (payload) => {
    const value = basementPayload(payload);
    setSettingMode(value.mode ?? value.value);
  }
};

function registerAppFeatures() {
  window.MaaFeatures?.register("basement", {
    id: "basement",
    order: 0,
    title: "一键长草",
    render: renderBasementView,
    wire: wireBasementView,
    actions: BASEMENT_ACTIONS,
    getState: () => ({
      profile: state.profile?.name || "",
      selectedTask: state.selectedTask,
      settingMode: state.settingMode
    }),
    persist: persistBasementState
  });
}

function connectEvents() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/api/events`);
  socket.onmessage = (message) => {
    try {
      addLogItem(JSON.parse(message.data));
    } catch (error) {
      addLocalLog("error", "ui.websocket", "事件解析失败", { message: error.message || String(error) });
    }
    scheduleRefreshStatus();
  };
  socket.onclose = () => setTimeout(connectEvents, 2000);
}

function showError(error) {
  addLocalLog("error", "ui.error", error.message || String(error), {
    what: error.name || "Error"
  });
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

async function boot() {
  await ensureMaaLogView();
  await loadCapabilities();
  renderMainNav();
  await loadOptions();
  await loadProfiles();
  await refreshStatus();
  await loadLogCards();
  if (typeof loadSchedulerConfig === "function") await loadSchedulerConfig();
  await loadPostActionConfig();
  if (typeof loadVersionInfo === "function") loadVersionInfo();
  if (typeof loadAdapterConfig === "function") await loadAdapterConfig();
  if (typeof loadNotificationConfig === "function") loadNotificationConfig();
  if (typeof loadRunnerConfig === "function") loadRunnerConfig();
  renderAll();
  renderLogs();
}

patchSettingsInternalScroll();
registerAppFeatures();
wireEvents();
connectEvents();
boot().catch(showError);

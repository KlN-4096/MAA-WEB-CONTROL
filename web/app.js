const CURRENT_VIEW_KEY = "maa-web.currentView";
const SELECTED_TASK_KEY = "maa-web.selectedTaskByProfile";
const SETTING_MODE_KEY = "maa-web.settingMode";
const DEFAULT_VIEW = "basement";
const FALLBACK_PROFILE_KEY = "__default__";

const VIEW_TITLES = {
  basement: "一键长草",
  copilot: "自动战斗",
  tools: "小工具",
  settings: "设置"
};

const state = {
  profiles: [],
  profile: null,
  selectedTask: 0,
  currentView: restoreCurrentView(),
  settingMode: restoreSettingMode(),
  options: null,
  saveTimer: null,
  logs: []
};

const $ = (id) => document.getElementById(id);
const FEATURE_CONTEXT = {
  state,
  api,
  renderAll,
  renderView,
  refreshStatus,
  showError
};

function restoreCurrentView() {
  const value = MaaStorage.get(CURRENT_VIEW_KEY, DEFAULT_VIEW);
  return Object.hasOwn(VIEW_TITLES, value) ? value : DEFAULT_VIEW;
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

async function loadProfiles() {
  const result = await api("/api/profiles");
  state.profiles = result.profiles;
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
  if (typeof setTaskFormOptions === "function") {
    setTaskFormOptions(state.options);
  }
  window.MaaFeatures?.call("copilot", "setOptions", state.options);
}

async function loadProfile(name) {
  state.profile = await api(`/api/profiles/${encodeURIComponent(name)}`);
  state.selectedTask = preferredTaskIndex(state.profile.tasks, restoreSelectedTask(state.profile));
  persistSelectedTask();
  renderAll();
}

async function refreshStatus() {
  const [status, adb, redroid] = await Promise.all([
    api("/api/status"),
    api("/api/adb/devices"),
    api("/api/redroid/status")
  ]);
  setText("runnerState", status.state);
  setText("sideRunnerState", status.state);
  setText("taskProgress", `${status.appended_tasks} / ${status.total_tasks}`);
  setText("sideTaskProgress", `${status.appended_tasks} / ${status.total_tasks}`);
  setText("adbStatus", adb.available ? "可用" : "未配置");
  setText("toolsAdbStatus", adb.available ? "可用" : "未配置");
  setText("redroidStatus", redroid.available ? "可用" : "未配置");
  setText("toolsRedroidStatus", redroid.available ? "可用" : "未配置");
}

function renderAll() {
  renderView();
}

function renderBasementView() {
  renderProfileForm();
  renderProfiles();
  renderTasks();
  renderEditor();
}

function renderView() {
  if (!$(`view-${state.currentView}`) || !document.querySelector(`[data-view="${state.currentView}"]`)) {
    state.currentView = DEFAULT_VIEW;
    persistCurrentView();
  }
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelectorAll(".navButton").forEach((button) => button.classList.remove("active"));
  $(`view-${state.currentView}`).classList.add("active");
  document.querySelector(`[data-view="${state.currentView}"]`).classList.add("active");
  setText("viewTitle", window.MaaFeatures?.title(state.currentView) || VIEW_TITLES[state.currentView] || state.currentView);
  setText("viewSubtitle", state.profile?.name || "");
  window.MaaFeatures?.render(state.currentView, FEATURE_CONTEXT);
}

function renderProfiles() {
  if (!$("profileList")) return;
  $("profileList").innerHTML = state.profiles.map((name) => {
    const active = state.profile?.name === name ? " active" : "";
    return `<button class="profileItem${active}" data-profile="${escapeHtml(name)}">
      <strong>${escapeHtml(name)}</strong>
    </button>`;
  }).join("");
}

function renderProfileForm() {
  if (!state.profile || !$("profileNameInput")) return;
  $("profileDescription").textContent = state.profile.description || state.profile.name;
  $("profileNameInput").value = state.profile.name;
  $("adbAddressInput").value = state.profile.adb?.address || "";
  $("clientTypeInput").value = state.profile.adb?.client_type || "";
  $("descriptionInput").value = state.profile.description || "";
}

function renderTasks() {
  const tasks = state.profile?.tasks || [];
  $("taskList").innerHTML = tasks.map((task, index) => taskListItem(task, index)).join("");
}

function taskListItem(task, index) {
  const active = index === state.selectedTask ? " active" : "";
  const disabled = task.enabled ? "" : " disabled";
  const title = task.name || task.id;
  const checked = task.enabled ? " checked" : "";
  return `<div class="taskItem${active}${disabled}" data-task-index="${index}">
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
}

function selectedTask() {
  return state.profile?.tasks?.[state.selectedTask] || null;
}

function preferredTaskIndex(tasks, index = state.selectedTask) {
  if (!tasks?.length) return 0;
  return Math.max(0, Math.min(index, tasks.length - 1));
}

function collectProfileForm() {
  if (!$("profileNameInput")) return;
  state.profile.name = $("profileNameInput").value.trim() || "daily";
  state.profile.description = $("descriptionInput").value.trim();
  state.profile.adb = state.profile.adb || {};
  state.profile.adb.address = $("adbAddressInput").value.trim();
  state.profile.adb.client_type = $("clientTypeInput").value.trim();
}

function collectTaskForm() {
  const task = selectedTask();
  if (!task || !$("taskIdInput")) return;
  collectTaskEditor(task);
}

function parseJsonField(id) {
  const text = $(id).value.trim();
  return text ? JSON.parse(text) : {};
}

function moveTask(offset) {
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
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    collectTaskForm();
    persistProfile(false).catch(showError);
  }, 500);
}

async function runProfile() {
  await saveProfile();
  await api(`/api/profiles/${encodeURIComponent(state.profile.name)}/run`, { method: "POST" });
  await refreshStatus();
}

async function stopRun() {
  await api("/api/stop", { method: "POST" });
  await refreshStatus();
}

function addLocalLog(level, type, message) {
  state.logs.unshift({ ts: new Date().toISOString(), level, type, message });
  state.logs = state.logs.slice(0, 100);
  renderLogs();
}

function renderLogs() {
  $("logList").innerHTML = state.logs.map((item) => {
    const time = new Date(item.ts).toLocaleString();
    return `<div class="logItem ${escapeHtml(item.level)}">
      <strong>${escapeHtml(item.message)}</strong>
      <time>${escapeHtml(item.type)} · ${escapeHtml(time)}</time>
    </div>`;
  }).join("");
}

function wireEvents() {
  document.querySelector(".mainNav").addEventListener("click", switchView);
  document.querySelector(".modeTabs").addEventListener("click", switchSettingMode);
  if ($("profileList")) {
    $("profileList").addEventListener("click", onProfileClick);
  }
  $("taskList").addEventListener("click", onTaskClick);
  $("taskList").addEventListener("change", onTaskEnableChange);
  $("refreshButton").addEventListener("click", () => boot().catch(showError));
  if ($("saveButton")) {
    $("saveButton").addEventListener("click", () => saveProfile().catch(showError));
  }
  $("runButton").addEventListener("click", () => runProfile().catch(showError));
  $("stopButton").addEventListener("click", () => stopRun().catch(showError));
  $("addTaskButton").addEventListener("click", addTask);
  $("deleteTaskButton").addEventListener("click", clearTasks);
  $("moveUpButton").addEventListener("click", selectAllTasks);
  $("clearLogsButton").addEventListener("click", () => { state.logs = []; renderLogs(); });
  if ($("newProfileButton")) {
    $("newProfileButton").addEventListener("click", createProfile);
  }
  $("taskEditor").addEventListener("change", onTaskEditorChange);
  $("taskEditor").addEventListener("click", onTaskEditorClick);
  window.MaaFeatures?.list().forEach((feature) => window.MaaFeatures.wire(feature.id, FEATURE_CONTEXT));
}

function switchView(event) {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  state.currentView = button.dataset.view;
  persistCurrentView();
  renderView();
}

function switchSettingMode(event) {
  const button = event.target.closest("[data-setting-mode]");
  if (!button || button.disabled) return;
  collectTaskForm();
  state.settingMode = button.dataset.settingMode;
  persistSettingMode();
  renderEditor();
  scheduleSave();
}

function renderSettingModeButtons() {
  const task = selectedTask();
  const supportsAdvanced = task ? taskSupportsAdvanced(task.type) : false;
  document.querySelectorAll("[data-setting-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.settingMode === state.settingMode);
    button.disabled = button.dataset.settingMode === "advanced" && !supportsAdvanced;
  });
}

function onProfileClick(event) {
  const button = event.target.closest("[data-profile]");
  if (button) loadProfile(button.dataset.profile).catch(showError);
}

function onTaskClick(event) {
  const target = event.target.closest("[data-task-select]");
  if (!target) return;
  collectTaskForm();
  state.selectedTask = Number(target.dataset.taskSelect);
  persistSelectedTask();
  renderTasks();
  renderEditor();
}

function onTaskEnableChange(event) {
  const checkbox = event.target.closest("[data-task-enable]");
  if (!checkbox) return;
  const index = Number(checkbox.dataset.taskEnable);
  state.profile.tasks[index].enabled = checkbox.checked;
  renderTasks();
  if (index === state.selectedTask) renderEditor();
  scheduleSave();
}

function addTask() {
  state.profile.tasks.push(defaultTask());
  state.selectedTask = state.profile.tasks.length - 1;
  persistSelectedTask();
  renderTasks();
  renderEditor();
  scheduleSave();
}

function clearTasks() {
  state.profile.tasks.forEach((task) => { task.enabled = false; });
  renderTasks();
  renderEditor();
  scheduleSave();
}

function selectAllTasks() {
  state.profile.tasks.forEach((task) => { task.enabled = true; });
  renderTasks();
  renderEditor();
  scheduleSave();
}

function createProfile() {
  state.profile = {
    name: `profile-${Date.now().toString().slice(-5)}`,
    description: "",
    adb: { address: "127.0.0.1:5555", adb_path: "adb", client_type: "Official", connect_config: {} },
    tasks: [defaultTask("StartUp"), defaultTask("Fight"), defaultTask("Award")]
  };
  state.selectedTask = 0;
  persistSelectedTask();
  renderAll();
  scheduleSave();
}

function onTaskEditorChange(event) {
  const rerenderFields = new Set(["paramRoguelikeTheme", "paramRoguelikeStrategy", "paramReclamationStrategy"]);
  if (rerenderFields.has(event.target.id)) {
    collectTaskForm();
    renderTasks();
    renderEditor();
    scheduleSave();
    return;
  }

  if (event.target.id !== "taskTypeInput") {
    collectTaskForm();
    renderTasks();
    scheduleSave();
    return;
  }
  const task = selectedTask();
  task.type = event.target.value;
  task.params = defaultParams(task.type);
  renderEditor();
  renderTasks();
  scheduleSave();
}

function onTaskEditorClick(event) {
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
    plan.push("当前/上次");
    params.use_alternate_stage = true;
  } else if (button.dataset.stageAction === "remove" && plan.length > 1) {
    plan.splice(Number(button.dataset.stageIndex), 1);
  }

  params.stage_plan = plan;
  params.stage = plan[0] || "当前/上次";
  task.params = params;
  renderEditor();
  scheduleSave();
}

function currentStagePlan(params) {
  const plan = Array.isArray(params.stage_plan) ? params.stage_plan : [params.stage || "当前/上次"];
  return plan.length ? [...plan] : ["当前/上次"];
}

function persistBasementState() {
  persistSelectedTask();
  persistSettingMode();
}

function registerAppFeatures() {
  window.MaaFeatures?.register("basement", {
    id: "basement",
    title: VIEW_TITLES.basement,
    render: renderBasementView,
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
    state.logs.unshift(JSON.parse(message.data));
    state.logs = state.logs.slice(0, 100);
    renderLogs();
    refreshStatus().catch(showError);
  };
  socket.onclose = () => setTimeout(connectEvents, 2000);
}

function showError(error) {
  addLocalLog("error", "ui.error", error.message || String(error));
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

async function boot() {
  await loadOptions();
  await loadProfiles();
  await refreshStatus();
}

registerAppFeatures();
wireEvents();
connectEvents();
boot().catch(showError);

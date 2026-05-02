const CURRENT_VIEW_KEY = "maa-web.currentView";
const SELECTED_TASK_KEY = "maa-web.selectedTaskByProfile";
const SETTING_MODE_KEY = "maa-web.settingMode";
const DEFAULT_VIEW = "basement";
const FALLBACK_PROFILE_KEY = "__default__";
const ADD_TASK_TYPES = ["StartUp", "Fight", "Infrast", "Recruit", "Mall", "Award", "Roguelike", "Reclamation", "CloseDown"];

const state = {
  profiles: [],
  profile: null,
  selectedTask: 0,
  currentView: restoreCurrentView(),
  settingMode: restoreSettingMode(),
  options: null,
  capabilities: null,
  saveTimer: null,
  logs: []
};

const $ = (id) => document.getElementById(id);
let basementWired = false;
let draggedTaskIndex = null;
const wiredFeatureIds = new Set();

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
  closeTaskContextMenu();
  $("taskList").innerHTML = tasks.map((task, index) => taskListItem(task, index)).join("");
}

function taskListItem(task, index) {
  const active = index === state.selectedTask ? " active" : "";
  const disabled = task.enabled ? "" : " disabled";
  const title = task.name || task.id;
  const checked = task.enabled ? " checked" : "";
  return `<div class="taskItem${active}${disabled}" data-task-index="${index}" draggable="true">
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
  addListener("#runButton", "click", () => runFeatureAction("basement", "run")?.catch(showError));
  addListener("#stopButton", "click", () => runFeatureAction("basement", "stop")?.catch(showError));
  addListener("#addTaskButton", "click", onAddTaskButtonClick);
  addListener("#deleteTaskButton", "click", () => runFeatureAction("basement", "clearTasks"));
  addListener("#moveUpButton", "click", () => runFeatureAction("basement", "selectAllTasks"));
  addListener("#clearLogsButton", "click", () => runFeatureAction("basement", "clearLogs"));
  addListener("#newProfileButton", "click", () => runFeatureAction("basement", "createProfile"));
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
  collectTaskForm();
  state.settingMode = mode;
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
  selectTaskIndex(Number(target.dataset.taskSelect));
}

function selectTaskIndex(index) {
  if (!state.profile?.tasks?.[index]) return;
  collectTaskForm();
  state.selectedTask = index;
  persistSelectedTask();
  renderTasks();
  renderEditor();
}

function onTaskEnableChange(event) {
  const checkbox = event.target.closest("[data-task-enable]");
  if (!checkbox) return;
  setTaskEnabled(Number(checkbox.dataset.taskEnable), checkbox.checked);
}

function setTaskEnabled(index, enabled) {
  if (!state.profile?.tasks?.[index]) return;
  state.profile.tasks[index].enabled = Boolean(enabled);
  renderTasks();
  if (index === state.selectedTask) renderEditor();
  scheduleSave();
}

function addTask(type) {
  state.profile.tasks.push(defaultTask(type));
  state.selectedTask = state.profile.tasks.length - 1;
  persistSelectedTask();
  renderTasks();
  renderEditor();
  scheduleSave();
}

function deleteTask(index) {
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

function runTaskOnce(index) {
  const task = state.profile?.tasks?.[index];
  if (!task) return;
  const title = task.name || task.id;
  addLocalLog("info", "task.once", `单次运行：${title}`);
}

function reorderTask(from, target, insertAfter) {
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
  toggleTaskTypeMenu(event.currentTarget);
}

function addTaskTypeOptions() {
  return ADD_TASK_TYPES
    .filter((type) => typeof taskDefinition !== "function" || taskDefinition(type).enabled !== false)
    .map((type) => ({
      id: type,
      title: typeof taskDefinition === "function" ? taskDefinition(type).title : type
    }));
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
  const addType = event.target.closest("[data-task-add-type]");
  if (addType) {
    runFeatureAction("basement", "addTask", { type: addType.dataset.taskAddType });
    closeTaskTypeMenu();
    return;
  }

  const contextAction = event.target.closest("[data-task-context-action]");
  if (contextAction) {
    runTaskContextAction(contextAction.dataset.taskContextAction);
    closeTaskContextMenu();
    return;
  }

  if (!event.target.closest("#taskTypeMenu") && !event.target.closest("#addTaskButton")) closeTaskTypeMenu();
  if (!event.target.closest("#taskContextMenu")) closeTaskContextMenu();
}

function onDocumentKeyDown(event) {
  if (event.key !== "Escape") return;
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
  draggedTaskIndex = Number(item.dataset.taskIndex);
  item.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(draggedTaskIndex));
}

function onTaskDragOver(event) {
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

function clearLogs() {
  state.logs = [];
  renderLogs();
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
  createProfile: () => createProfile(),
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
  await loadCapabilities();
  renderMainNav();
  await loadOptions();
  await loadProfiles();
  await refreshStatus();
  renderAll();
}

patchSettingsInternalScroll();
registerAppFeatures();
wireEvents();
connectEvents();
boot().catch(showError);

let basementWired = false;

function renderBasementView() {
  renderProfileForm();
  renderProfiles();
  renderTasks();
  renderEditor();
  renderPostActionControl();
  syncRunnerControls();
  renderStageTips();
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

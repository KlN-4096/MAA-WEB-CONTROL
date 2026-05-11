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

function collectTaskForm() {
  const task = selectedTask();
  if (isProfileEditingLocked() || !task || !$("taskIdInput")) return;
  collectTaskEditor(task);
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

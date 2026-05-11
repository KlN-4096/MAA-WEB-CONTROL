let draggedTaskIndex = null;

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

function onAddTaskButtonClick(event) {
  event.preventDefault();
  event.stopPropagation();
  closeTaskContextMenu();
  if (isProfileEditingLocked()) return;
  toggleTaskTypeMenu(event.currentTarget);
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

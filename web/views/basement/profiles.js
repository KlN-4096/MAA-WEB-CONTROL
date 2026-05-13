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

async function loadProfile(name) {
  state.profile = await api(`/api/profiles/${encodeURIComponent(name)}`);
  state.selectedTask = preferredTaskIndex(state.profile.tasks, restoreSelectedTask(state.profile));
  persistSelectedTask();
  if (typeof loadVersionInfo === "function") loadVersionInfo();
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

function collectProfileForm() {
  if (isProfileEditingLocked() || !$("profileNameInput")) return;
  state.profile.name = $("profileNameInput").value.trim() || "daily";
  state.profile.description = $("descriptionInput").value.trim();
  state.profile.adb = state.profile.adb || {};
  state.profile.adb.address = $("adbAddressInput").value.trim();
  state.profile.adb.client_type = $("clientTypeInput").value.trim();
}

function isProfileEditingLocked(value = state.runnerState) {
  return isRunnerBusy(value);
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

function onProfileClick(event) {
  if (isProfileEditingLocked()) return;
  const button = event.target.closest("[data-profile]");
  if (button) loadProfile(button.dataset.profile).catch(showError);
}

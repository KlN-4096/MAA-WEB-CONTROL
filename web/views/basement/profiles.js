let profileEditVersion = 0;

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
  bumpProfileEditVersion();
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
  collectTaskForm();
  await persistProfile(false, bumpProfileEditVersion());
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
  await persistProfile(false, bumpProfileEditVersion());
  await loadProfiles();
  await loadProfile(state.profile.name);
}

async function saveProfile() {
  if (isProfileEditingLocked()) return state.profile;
  collectTaskForm();
  await persistProfile(true, bumpProfileEditVersion());
}

async function persistProfile(withFeedback, editVersion = profileEditVersion) {
  const name = state.profile.name;
  const savedProfile = await api(`/api/profiles/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(state.profile)
  });
  const applied = editVersion === profileEditVersion && state.profile?.name === name;
  if (applied) {
    state.profile = savedProfile;
  }
  if (withFeedback) {
    await loadProfiles();
    addLocalLog("info", "profile.saved", applied ? `已保存 ${name}` : `已保存 ${name}，但本地还有未同步修改`);
  }
  return savedProfile;
}

function scheduleSave() {
  if (isProfileEditingLocked()) return;
  const editVersion = bumpProfileEditVersion();
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    if (isProfileEditingLocked()) return;
    collectTaskForm();
    persistProfile(false, editVersion).catch(showError);
  }, 500);
}

function bumpProfileEditVersion() {
  profileEditVersion += 1;
  return profileEditVersion;
}

// 配置的新建/切换/删除统一由设置页「切换配置」节负责（views/settings/profileSync.js）。
function renderProfiles() {
  syncProfileEditingControls();
}

function isProfileEditingLocked(value = state.runnerState) {
  return isRunnerBusy(value);
}

function syncProfileEditingControls() {
  const locked = isProfileEditingLocked();
  setDisabledByIds(["addTaskButton", "deleteTaskButton", "moveUpButton", "postActionInput"], locked);
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

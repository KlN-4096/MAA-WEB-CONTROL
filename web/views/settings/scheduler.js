function syncTimersToScheduler() {
  if (typeof api !== "function") return;
  const config = {
    enabled: SETTINGS_STATE.timers.some((t) => t.enabled),
    slots: SETTINGS_STATE.timers.map((t) => ({
      enabled: t.enabled,
      time: `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`,
      profile_name: t.config || "",
      force_start: Boolean(SETTINGS_STATE.forceStart)
    })),
    post_action: currentPostActionPayload(),
    emulator_launch: {
      enabled: Boolean(SETTINGS_STATE.emulatorLaunchEnabled),
      command: SETTINGS_STATE.emulatorLaunchCommand || "",
      wait_seconds: Math.max(0, Math.min(300, Number(SETTINGS_STATE.emulatorLaunchWait) || 60))
    }
  };
  api("/api/scheduler", {
    method: "PUT",
    body: JSON.stringify(config)
  }).catch(() => {});
}

function currentPostActionPayload() {
  const action = typeof state !== "undefined" ? state.postAction : null;
  if (typeof normalizePostAction === "function") return normalizePostAction(action);
  return {
    type: action?.type || "none",
    only_if_no_other_maa: Boolean(action?.only_if_no_other_maa)
  };
}

async function loadSchedulerConfig() {
  if (typeof api !== "function") return;
  try {
    const config = await api("/api/scheduler");
    if (!config || !Array.isArray(config.slots)) return;
    config.slots.forEach((slot, index) => {
      if (index >= SETTINGS_STATE.timers.length) return;
      const timer = SETTINGS_STATE.timers[index];
      timer.enabled = Boolean(slot.enabled);
      const [h, m] = (slot.time || "00:00").split(":");
      timer.hour = Math.min(23, Math.max(0, parseInt(h, 10) || 0));
      timer.minute = Math.min(59, Math.max(0, parseInt(m, 10) || 0));
      timer.config = slot.profile_name || "";
    });
    SETTINGS_STATE.forceStart = config.slots.some((s) => s.force_start);
    if (config.post_action && typeof state !== "undefined") {
      state.postAction = currentPostActionPayloadFrom(config.post_action);
      if (typeof renderPostActionControl === "function") renderPostActionControl();
    }
    if (config.emulator_launch && typeof config.emulator_launch === "object") {
      const el = config.emulator_launch;
      if (typeof el.enabled === "boolean") SETTINGS_STATE.emulatorLaunchEnabled = el.enabled;
      if (typeof el.command === "string") SETTINGS_STATE.emulatorLaunchCommand = el.command;
      if (Number.isFinite(el.wait_seconds)) {
        SETTINGS_STATE.emulatorLaunchWait = Math.max(0, Math.min(300, Math.round(el.wait_seconds)));
      }
    }
    persistSettingsState();
  } catch (e) { /* ignore if scheduler not available */ }
}

function currentPostActionPayloadFrom(action) {
  if (typeof normalizePostAction === "function") return normalizePostAction(action);
  return {
    type: action?.type || "none",
    only_if_no_other_maa: Boolean(action?.only_if_no_other_maa)
  };
}

async function loadRunnerConfig() {
  if (typeof api !== "function") return;
  try {
    const data = await api("/api/runner/config");
    if (data && Number.isFinite(Number(data.task_timeout_minutes))) {
      SETTINGS_STATE.taskTimeoutMinutes = Math.max(0, Number(data.task_timeout_minutes));
      if (typeof state !== "undefined" && state.currentView === "settings") renderSettingsView();
    }
  } catch (e) { /* ignore */ }
}

async function saveRunnerConfig() {
  if (typeof api !== "function") return;
  try {
    await api("/api/runner/config", {
      method: "PUT",
      body: JSON.stringify({ task_timeout_minutes: Number(SETTINGS_STATE.taskTimeoutMinutes ?? 0) })
    });
    SETTINGS_STATE.taskTimeoutStatus = "已保存";
  } catch (e) {
    SETTINGS_STATE.taskTimeoutStatus = `保存失败：${e.message || "请求错误"}`;
  }
}

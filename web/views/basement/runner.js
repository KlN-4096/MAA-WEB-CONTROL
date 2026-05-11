let runRequestPending = false;
let stopRequestPending = false;

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

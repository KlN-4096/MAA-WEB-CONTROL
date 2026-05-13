async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!response.ok) throw new Error(await response.text() || response.statusText);
  return response.json();
}

function statusMessage(status, unavailableText) {
  if (status?.message) return status.message;
  return status?.available ? "可用" : unavailableText;
}

let refreshStatusTimer = null;

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
  if (typeof syncCopilotRunState === "function") syncCopilotRunState(state.runnerState);
}

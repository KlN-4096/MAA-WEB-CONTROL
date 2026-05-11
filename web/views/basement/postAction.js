const POST_ACTION_OPTIONS = [
  { label: "无动作", value: "none" },
  { label: "退出游戏", value: "exit_game" },
  { label: "关闭模拟器", value: "exit_emulator" },
  { label: "睡眠", value: "sleep" },
  { label: "休眠", value: "hibernate" },
  { label: "关机", value: "shutdown" },
  { label: "自定义命令…", value: "run_command" }
];
const POST_ACTION_VALUES = new Set(POST_ACTION_OPTIONS.map((option) => option.value));

function normalizePostAction(action = {}) {
  const source = action && typeof action === "object" ? action : {};
  const type = POST_ACTION_VALUES.has(source.type) ? source.type : "none";
  const timeout = Number(source.command_timeout_seconds);
  return {
    type,
    only_if_no_other_maa: Boolean(source.only_if_no_other_maa),
    command: typeof source.command === "string" ? source.command : "",
    command_timeout_seconds: Number.isFinite(timeout) ? Math.max(1, Math.min(3600, Math.round(timeout))) : 60
  };
}

function renderPostActionControl() {
  const root = document.querySelector(".afterRun");
  if (!root) return;
  const action = normalizePostAction(state.postAction);
  const current = action.type;
  const disabled = isRunnerBusy() ? " disabled" : "";
  const showCommand = current === "run_command";
  root.innerHTML = `<label class="afterRunLabel" for="postActionInput">完成后</label>
    <select id="postActionInput" class="afterRunSelect"${disabled}>
      ${POST_ACTION_OPTIONS.map((option) => {
        const selected = option.value === current ? " selected" : "";
        return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
      }).join("")}
    </select>
    ${showCommand ? `<input id="postActionCommandInput" class="afterRunCommand" placeholder="docker stop redroid" value="${escapeHtml(action.command)}"${disabled} />
    <input id="postActionTimeoutInput" class="afterRunTimeout" type="number" min="1" max="3600" value="${action.command_timeout_seconds}"${disabled} title="超时（秒）" />` : ""}`;
}

async function loadPostActionConfig() {
  try {
    state.postAction = normalizePostAction(await api("/api/post-action"));
    renderPostActionControl();
  } catch (error) {
    addLocalLog("warning", "ui.post_action", "后置动作配置加载失败，已使用无动作。");
  }
}

async function savePostAction(type) {
  if (isRunnerBusy()) return;
  state.postAction = normalizePostAction({ ...state.postAction, type });
  // Re-render first so the command/timeout inputs become visible when switching
  // to run_command, then sync with backend.
  renderPostActionControl();
  state.postAction = normalizePostAction(await api("/api/post-action", {
    method: "PUT",
    body: JSON.stringify(state.postAction)
  }));
  renderPostActionControl();
}

async function savePostActionFull() {
  if (isRunnerBusy()) return;
  state.postAction = normalizePostAction(await api("/api/post-action", {
    method: "PUT",
    body: JSON.stringify(state.postAction)
  }));
  renderPostActionControl();
}

function onPostActionChange(event) {
  const select = event.target.closest("#postActionInput");
  if (select) {
    savePostAction(select.value).catch(showError);
    return;
  }
  const command = event.target.closest("#postActionCommandInput");
  if (command) {
    state.postAction = normalizePostAction({ ...state.postAction, command: command.value });
    savePostActionFull().catch(showError);
    return;
  }
  const timeout = event.target.closest("#postActionTimeoutInput");
  if (timeout) {
    state.postAction = normalizePostAction({ ...state.postAction, command_timeout_seconds: timeout.value });
    savePostActionFull().catch(showError);
  }
}

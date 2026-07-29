const COPILOT_TABS = [
  "主线/故事集/SideStory",
  "保全派驻",
  "悖论模拟",
  "其他活动"
];

const USE_COPILOT_LIST_TIP = [
  "仅支持以下模式:",
  "  1. 主线: 同一章节内导航",
  "  2. SideStory: 当前页面内导航（普通/EX/S 不能互跳）",
  "  3. 故事集: 当前页面内导航",
  "  4. 悖论模拟: 从干员列表启动",
  "请在对应界面启动，不支持跨章节导航",
  "",
  "当「多作业模式」启用后, 选择单个作业时会自动添加到「作业列表」"
].join("\n");

const COPILOT_STORAGE_KEY = "maa-web.copilotState";
const COPILOT_PERSISTED_FIELDS = [
  "tab",
  "filename",
  "form",
  "useFormation",
  "formationIndex",
  "ignoreRequirements",
  "useSupportUnit",
  "supportUsage",
  "supportUnitName",
  "addTrust",
  "addUserAdditional",
  "userAdditional",
  "useCopilotList",
  "useSanityPotion",
  "loop",
  "loopTimes",
  "taskName",
  "tasks"
];

const COPILOT_STATE = {
  tab: 0,
  filename: "",
  filePopupOpen: false,
  idle: true,
  launching: false,
  runnerState: state.runnerState || "Idle",
  resolveStatus: "",
  resolveError: "",
  resolvedPath: "",
  resolvedInfo: null,
  resolveBusy: false,
  form: false,
  useFormation: false,
  formationIndex: "1",
  ignoreRequirements: false,
  useSupportUnit: false,
  supportUsage: "1",
  supportUnitName: "",
  addTrust: false,
  addUserAdditional: false,
  userAdditional: "",
  useCopilotList: false,
  useSanityPotion: false,
  loop: false,
  loopTimes: 1,
  taskName: "",
  tasks: [],
  ...restoreCopilotState()
};

COPILOT_STATE.idle = true;
COPILOT_STATE.filePopupOpen = false;
normalizeCopilotState();

let COPILOT_OPTIONS = null;
let copilotWired = false;
let copilotImportMode = false;
let copilotLaunchedAt = 0;
const copilotExpandedFolders = {};

function restoreCopilotState() {
  const parsed = readCopilotStorage();
  if (!parsed) return {};
  const restored = {};
  if (Number.isInteger(parsed.tab) && parsed.tab >= 0 && parsed.tab < COPILOT_TABS.length) restored.tab = parsed.tab;
  ["filename", "formationIndex", "supportUsage", "supportUnitName", "userAdditional", "taskName"].forEach((field) => MaaStorage.copyString(parsed, restored, field));
  [
    "form",
    "useFormation",
    "ignoreRequirements",
    "useSupportUnit",
    "addTrust",
    "addUserAdditional",
    "useCopilotList",
    "useSanityPotion",
    "loop"
  ].forEach((field) => MaaStorage.copyBoolean(parsed, restored, field));
  if (Number.isFinite(Number(parsed.loopTimes))) restored.loopTimes = parsed.loopTimes;
  if (Array.isArray(parsed.tasks)) restored.tasks = parsed.tasks.map(normalizeCopilotTask).filter(Boolean);
  return restored;
}

function readCopilotStorage() {
  return MaaStorage.readObject(COPILOT_STORAGE_KEY, null);
}

function persistCopilotState() {
  normalizeCopilotState();
  MaaStorage.writeObject(COPILOT_STORAGE_KEY, MaaStorage.pick(COPILOT_STATE, COPILOT_PERSISTED_FIELDS));
}

function normalizeCopilotTask(task) {
  if (!task || typeof task !== "object" || Array.isArray(task)) return null;
  return {
    name: typeof task.name === "string" ? task.name : "未命名",
    path: typeof task.path === "string" ? task.path : "",
    raid: Boolean(task.raid),
    checked: task.checked !== false
  };
}

function setCopilotViewOptions(options) {
  COPILOT_OPTIONS = options || null;
  renderCopilotView();
}

function renderCopilotView() {
  syncCopilotRunState(state.runnerState, false);
  const layout = $("copilotLayout");
  if (layout) layout.classList.toggle("withList", copilotListVisible());
  const root = $("copilotViewRoot");
  if (!root) return;
  const unavailable = copilotUnavailable();
  root.className = "copilotViewRoot";
  root.innerHTML = `
    <section class="copilotMain">
      ${unavailable ? `<p class="featureUnavailable">${escapeHtml(unavailable)}</p>` : ""}
      <div class="copilotTop">
        <div class="copilotTabs">${COPILOT_TABS.map(copilotTabButton).join("")}</div>
        ${renderCopilotPathRow()}
        <div class="copilotInfoBlock">${renderCopilotInfoBlock()}</div>
      </div>
      <div class="copilotBody">
        <div class="copilotRunColumn">
          ${renderCopilotRunButton()}
          ${renderCopilotOptions()}
        </div>
        ${copilotListVisible() ? renderCopilotList() : ""}
      </div>
      <div class="copilotFooter">
        <a class="copilotLink" href="https://prts.plus" target="_blank" rel="noreferrer">自动战斗作业分享</a>
        <a class="copilotLink" href="https://map.ark-nights.com/areas" target="_blank" rel="noreferrer">自动战斗地图坐标</a>
      </div>
    </section>
  `;
}

function wireCopilotView() {
  const root = $("copilotViewRoot");
  if (!root || copilotWired) return;
  root.addEventListener("click", onCopilotClick);
  root.addEventListener("contextmenu", onCopilotContextMenu);
  root.addEventListener("change", onCopilotChange);
  root.addEventListener("input", onCopilotInput);
  $("copilotClearLogsButton")?.addEventListener("click", () => clearLogs().catch(showError));
  $("copilotRawLogToggle")?.addEventListener("click", toggleRawLog);
  copilotWired = true;
}

function copilotTabButton(label, index) {
  const active = COPILOT_STATE.tab === index ? " active" : "";
  return `<button class="copilotTab${active}" type="button" data-copilot-tab="${index}"${idleDisabledAttr()}>${escapeHtml(label)}</button>`;
}

function renderCopilotPathRow() {
  return `
    <div class="copilotPathRow">
      <div class="copilotPathBox">
        <input id="copilotFilenameInput" value="${escapeHtml(COPILOT_STATE.filename)}" placeholder="作业路径/神秘代码" autocomplete="off"${idleDisabledAttr()} />
        <button class="pathDropButton" type="button" data-copilot-action="toggleFiles"${idleDisabledAttr()}>${COPILOT_STATE.filePopupOpen ? "⌃" : "⌄"}</button>
        ${COPILOT_STATE.filePopupOpen ? renderFilePopup() : ""}
      </div>
      ${iconButton("selectFile", "▢", "选择本地作业 JSON（会上传到服务器供 MAA 读取）")}
      ${iconButton("pasteTask", "⧉", "读取剪贴板并添加为作业")}
      ${iconButton("pasteSet", "▤", "读取剪贴板并添加为作业集")}
      <input id="copilotFilePicker" class="hiddenFileInput" type="file" accept=".json"${copilotImportMode ? " multiple" : ""} />
    </div>
  `;
}

function renderFilePopup() {
  const files = COPILOT_OPTIONS?.copilot?.files || [];
  const content = files.length
    ? files.map((item) => renderFileItem(item, 0)).join("")
    : '<div class="fileTreeEmpty">resource/copilot 下没有可选作业</div>';
  return `<div class="copilotFilePopup">${content}</div>`;
}

function renderFileItem(item, depth) {
  const folder = item.is_folder;
  const children = Array.isArray(item.children) ? item.children : [];
  // 必须用绝对 path：relative_path 是相对 MAA 目录的，后端按进程 CWD 解析会找不到文件。
  const path = (folder ? (item.relative_path || item.path) : (item.path || item.relative_path)) || "";
  const escapedPath = escapeHtml(path);
  const expanded = folder && copilotExpandedFolders[path];
  const icon = folder ? (expanded ? "▾" : "▸") : "·";
  const label = `${icon} ${escapeHtml(item.name || "")}`;
  return `
    <div class="fileTreeItem ${folder ? "folder" : "file"}" style="--depth:${depth}" ${folder ? `data-copilot-folder="${escapedPath}"` : `data-copilot-file="${escapedPath}"`}>
      ${label}
    </div>
    ${folder && expanded ? children.map((child) => renderFileItem(child, depth + 1)).join("") : ""}
  `;
}

function renderCopilotRunButton() {
  const unavailable = copilotUnavailable();
  if (unavailable) {
    return `<button class="copilotStartButton" type="button" disabled title="${escapeHtml(unavailable)}">开始</button>`;
  }
  const label = COPILOT_STATE.runnerState === "Stopping" ? "停止中" : (COPILOT_STATE.idle ? "开始" : "停止");
  const disabled = COPILOT_STATE.runnerState === "Stopping" ? " disabled" : "";
  const action = COPILOT_STATE.idle ? "start" : "stop";
  return `<button class="copilotStartButton" type="button" data-copilot-action="${action}"${disabled}>${label}</button>`;
}

function renderCopilotInfoBlock() {
  if (COPILOT_STATE.startError) {
    return `<div class="copilotInfoLine error">${escapeHtml(COPILOT_STATE.startError)}</div>`;
  }
  if (COPILOT_STATE.resolveBusy) {
    return '<div class="copilotInfoLine loading">正在解析作业……</div>';
  }
  if (COPILOT_STATE.resolveError) {
    return `<div class="copilotInfoLine error">${escapeHtml(COPILOT_STATE.resolveError)}</div>`;
  }
  const info = COPILOT_STATE.resolvedInfo;
  if (!info) return "";
  const opers = Array.isArray(info.opers) ? info.opers : [];
  const sourceLabel = info.source === "prts.plus" ? `prts.plus #${info.upstream_id ?? "?"}` : "本地";
  const segments = [
    info.stage_name ? `关卡 ${escapeHtml(info.stage_name)}` : "",
    info.title ? escapeHtml(truncate(info.title, 28)) : "",
    `干员 ${opers.length}`,
    info.action_count ? `动作 ${info.action_count}` : "",
    Number.isInteger(info.rating_level) ? `评级 ${info.rating_level}` : "",
    info.uploader ? `by ${escapeHtml(info.uploader)}` : "",
  ].filter(Boolean);
  const operNames = opers
    .map((oper) => (typeof oper === "string" ? oper : `${oper?.name || ""}${oper?.skill ? ` ${oper.skill}技` : ""}`))
    .filter(Boolean);
  const detailRows = [
    info.details ? `<div class="copilotInfoDetail">${escapeHtml(truncate(info.details, 120))}</div>` : "",
    operNames.length ? `<div class="copilotInfoOpers">${operNames.slice(0, 12).map((name) => `<span>${escapeHtml(name)}</span>`).join("")}${operNames.length > 12 ? `<span class="more">+${operNames.length - 12}</span>` : ""}</div>` : ""
  ].join("");
  return `<div class="copilotInfoLine ok"><span class="copilotInfoMain">${segments.join(" · ")}</span><span class="copilotInfoSource">${escapeHtml(sourceLabel)}</span></div>${detailRows}`;
}

function syncCopilotRunState(runnerState = state.runnerState, shouldRender = true) {
  const nextRunnerState = runnerState || "Idle";
  const previousIdle = COPILOT_STATE.idle;
  const previousRunnerState = COPILOT_STATE.runnerState;
  COPILOT_STATE.runnerState = nextRunnerState;
  // 自动战斗不走 runner 状态机：profile 在跑时禁用按钮，其余时候由本地 launching 标志
  // 配合 MaaCore 任务链事件（onCopilotChainEvent）决定。
  const profileBusy = typeof isRunnerBusy === "function" ? isRunnerBusy(nextRunnerState) : false;
  COPILOT_STATE.idle = !profileBusy && !COPILOT_STATE.launching;
  if (!shouldRender) return;
  if ((previousIdle !== COPILOT_STATE.idle || previousRunnerState !== nextRunnerState) && state.currentView === "copilot") {
    renderCopilotView();
  }
}

// 由 shared/logEvents.js 在收到 maa.task_chain.* 时调用。
function onCopilotChainEvent(type, stamp) {
  if (!COPILOT_STATE.launching || stamp < copilotLaunchedAt) return;
  COPILOT_STATE.launching = false;
  if (type === "maa.task_chain.error") COPILOT_STATE.startError = "任务链执行失败，详见运行日志。";
  syncCopilotRunState(state.runnerState);
  if (state.currentView === "copilot") renderCopilotView();
}

function truncate(text, max) {
  const value = String(text || "");
  return value.length > max ? value.slice(0, max) + "…" : value;
}

function renderCopilotOptions() {
  const tab = COPILOT_STATE.tab;
  const formVisible = tab === 0 || tab === 3;
  const listEnabled = tab === 0 || tab === 2;
  const sss = tab === 1;
  return `
    <div class="copilotOptions">
      ${formVisible ? check("form", "自动编队", COPILOT_STATE.form, "自动编队可能无法识别带有「特别关注」标记的干员") : ""}
      ${sss ? check("form", "自动编队", false, "保全派驻的自动编队当前不可用", true) : ""}
      ${formVisible && COPILOT_STATE.form ? renderFormationOptions() : ""}
      ${check("useCopilotList", "多作业模式", COPILOT_STATE.useCopilotList, USE_COPILOT_LIST_TIP, !listEnabled)}
      ${COPILOT_STATE.useCopilotList && tab === 0 ? check("useSanityPotion", "使用药剂", COPILOT_STATE.useSanityPotion) : ""}
      ${!COPILOT_STATE.useCopilotList && tab !== 0 && tab !== 2 ? renderLoopOptions() : ""}
    </div>
  `;
}

function renderFormationOptions() {
  return `
    <div class="copilotIndented">${check("useFormation", "使用编队", COPILOT_STATE.useFormation)}${COPILOT_STATE.useFormation ? select("formationIndex", ["1", "2", "3", "4"], COPILOT_STATE.formationIndex) : ""}</div>
    ${check("ignoreRequirements", "忽略干员属性要求", COPILOT_STATE.ignoreRequirements, "勾选此项将跳过技能等级、模组等检查，但可能导致作业无法正常运行")}
    <div class="copilotSupportBlock">
      ${check("useSupportUnit", "借助战", COPILOT_STATE.useSupportUnit, "缺一个还能用用，缺两个以上还是换份作业吧")}
      ${COPILOT_STATE.useSupportUnit ? `<div class="copilotSupportSelect">${select("supportUsage", [{ label: "补漏", value: "1" }, { label: "指定", value: "2" }, { label: "随机", value: "3" }], COPILOT_STATE.supportUsage)}</div>` : ""}
      ${COPILOT_STATE.useSupportUnit ? `<input class="copilotTextInput" data-copilot-field="supportUnitName" value="${escapeHtml(COPILOT_STATE.supportUnitName)}" placeholder="指定助战干员（可选）" />` : ""}
    </div>
    ${check("addTrust", "补充低信赖干员", COPILOT_STATE.addTrust)}
    ${check("addUserAdditional", "追加自定干员", COPILOT_STATE.addUserAdditional, "以英文「;」为分隔符，英文「,」分隔干员名与技能，例: 史尔特尔,3;艾雅法拉,1")}
    ${COPILOT_STATE.addUserAdditional ? `<input class="copilotTextInput" data-copilot-field="userAdditional" value="${escapeHtml(COPILOT_STATE.userAdditional)}" placeholder="史尔特尔,3;艾雅法拉,1" />` : ""}
  `;
}

function renderLoopOptions() {
  return `
    <label class="copilotCheck">
      <input type="checkbox" data-copilot-field="loop" ${COPILOT_STATE.loop ? "checked" : ""}${idleDisabledAttr()} />
      <span>循环次数</span>
      <input class="loopTimesInput" type="number" min="0" max="9999" value="${COPILOT_STATE.loopTimes}" data-copilot-field="loopTimes"${idleDisabledAttr()} />
    </label>
  `;
}

function renderCopilotList() {
  const taskRows = COPILOT_STATE.tasks.length
    ? COPILOT_STATE.tasks.map(renderTaskItem).join("")
    : '<div class="copilotListEmpty"> </div>';
  return `
    <div class="copilotTaskPanel">
      <div class="copilotTaskList">${taskRows}</div>
      <div class="copilotTaskTools">
        ${iconButton("importFiles", "＋", "批量导入")}
        <div class="taskNameBox"><input id="copilotTaskNameInput" value="${escapeHtml(COPILOT_STATE.taskName)}" placeholder="关卡名" autocomplete="off"${idleDisabledAttr()} />${tip("关卡名, 例: 1-7")}</div>
        ${iconButton("addTask", "＋", "左键添加普通难度\n右键添加突袭难度")}
        ${iconButton("clearTasks", "×", "左键清除所有任务\n右键清除未激活任务", "danger")}
      </div>
    </div>
  `;
}

function renderTaskItem(task, index) {
  const raid = task.raid ? " raid" : "";
  const checked = task.checked ? "checked" : "";
  const checkbox = COPILOT_STATE.tab === 1 || COPILOT_STATE.tab === 3
    ? `<span>${escapeHtml(task.name)}</span>`
    : `<label class="copilotTaskCheck"><input type="checkbox" data-copilot-task-check="${index}" ${checked}${idleDisabledAttr()} /><span>${escapeHtml(task.name)}</span></label>`;
  return `<div class="copilotTaskItem${raid}">${checkbox}<button type="button" data-copilot-action="selectTask" data-task-index="${index}"${idleDisabledAttr()}>⌁</button><button type="button" data-copilot-action="deleteTask" data-task-index="${index}"${idleDisabledAttr()}>×</button></div>`;
}

function check(field, label, value, tooltip = "", disabled = false) {
  const disabledAttr = disabled || !COPILOT_STATE.idle ? " disabled" : "";
  return `<label class="copilotCheck"><input type="checkbox" data-copilot-field="${field}" ${value ? "checked" : ""}${disabledAttr} /><span>${escapeHtml(label)}</span>${tooltip ? tip(tooltip) : ""}</label>`;
}

function select(field, options, value) {
  const html = options.map((option) => {
    const normalized = typeof option === "object" ? option : { label: option, value: option };
    const selected = String(normalized.value) === String(value) ? " selected" : "";
    return `<option value="${escapeHtml(normalized.value)}"${selected}>${escapeHtml(normalized.label)}</option>`;
  }).join("");
  return `<select class="copilotSmallSelect" data-copilot-field="${field}"${idleDisabledAttr()}>${html}</select>`;
}

function iconButton(action, icon, tooltip, className = "") {
  return `<button class="copilotIconButton ${className}" type="button" data-copilot-action="${action}" title="${escapeHtml(tooltip)}"${idleDisabledAttr()}>${escapeHtml(icon)}${tip(tooltip)}</button>`;
}

function tip(text) {
  return `<span class="copilotTipIcon" data-tip="${escapeHtml(text)}" tabindex="0">?</span>`;
}

function idleDisabledAttr() {
  return COPILOT_STATE.idle ? "" : " disabled";
}

function copilotListVisible() {
  return (COPILOT_STATE.useCopilotList && (COPILOT_STATE.tab === 0 || COPILOT_STATE.tab === 2)) || COPILOT_STATE.tab === 1 || COPILOT_STATE.tab === 3;
}

async function onCopilotClick(event) {
  const logAction = event.target.closest("[data-copilot-log-action]")?.dataset.copilotLogAction;
  if (logAction === "clear") {
    await clearLogs().catch(showError);
    return;
  }
  if (logAction === "toggle-raw") {
    toggleRawLog();
    return;
  }

  const tab = event.target.closest("[data-copilot-tab]");
  if (tab) {
    setCopilotTab(Number(tab.dataset.copilotTab));
    return;
  }

  const folder = event.target.closest("[data-copilot-folder]");
  if (folder) {
    const path = folder.dataset.copilotFolder;
    copilotExpandedFolders[path] = !copilotExpandedFolders[path];
    renderCopilotView();
    return;
  }

  const file = event.target.closest("[data-copilot-file]");
  if (file) {
    COPILOT_STATE.filename = file.dataset.copilotFile;
    COPILOT_STATE.filePopupOpen = false;
    persistCopilotState();
    scheduleCopilotResolve();
    renderCopilotView();
    return;
  }

  const action = event.target.closest("[data-copilot-action]")?.dataset.copilotAction;
  if (!action) return;
  await runCopilotAction(action, { event });
}

async function onCopilotContextMenu(event) {
  const action = event.target.closest("[data-copilot-action]")?.dataset.copilotAction;
  if (action !== "addTask" && action !== "clearTasks") return;
  event.preventDefault();
  await runCopilotAction(action, { event, alternate: true });
}

function onCopilotChange(event) {
  if (!COPILOT_STATE.idle) return;
  const field = event.target.dataset.copilotField;
  if (field) {
    COPILOT_STATE[field] = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    normalizeCopilotState();
    persistCopilotState();
    renderCopilotView();
    return;
  }

  const taskIndex = event.target.dataset.copilotTaskCheck;
  if (taskIndex !== undefined) {
    COPILOT_STATE.tasks[Number(taskIndex)].checked = event.target.checked;
    persistCopilotState();
  }

  if (event.target.id === "copilotFilePicker" && event.target.files?.length) {
    uploadCopilotFiles([...event.target.files]).catch(showError);
    event.target.value = "";
  }
}

function onCopilotInput(event) {
  if (!COPILOT_STATE.idle) return;
  if (event.target.id === "copilotFilenameInput") {
    COPILOT_STATE.filename = event.target.value;
    persistCopilotState();
    scheduleCopilotResolve();
  }
  if (event.target.id === "copilotTaskNameInput") {
    COPILOT_STATE.taskName = event.target.value.replace(/[:',.()|[\]?，。【】{}；：]/g, "").trim();
    persistCopilotState();
  }
}

let copilotResolveTimer = 0;
let copilotResolveSeq = 0;

function scheduleCopilotResolve() {
  clearTimeout(copilotResolveTimer);
  // 输入一变，上一次的解析结果立刻作废，否则「换作业后马上点开始」会跑旧作业。
  COPILOT_STATE.resolvedPath = "";
  COPILOT_STATE.resolvedInfo = null;
  const text = (COPILOT_STATE.filename || "").trim();
  if (!text) {
    COPILOT_STATE.resolvedInfo = null;
    COPILOT_STATE.resolvedPath = "";
    COPILOT_STATE.resolveError = "";
    COPILOT_STATE.resolveBusy = false;
    renderCopilotView();
    return;
  }
  copilotResolveTimer = setTimeout(() => {
    triggerCopilotResolve(text).catch(() => {});
  }, 350);
}

async function triggerCopilotResolve(text) {
  if (typeof api !== "function") return;
  const seq = ++copilotResolveSeq;
  COPILOT_STATE.resolveBusy = true;
  COPILOT_STATE.resolveError = "";
  refreshCopilotInfoBlock();
  let result;
  try {
    result = await api("/api/copilot/resolve", {
      method: "POST",
      body: JSON.stringify({ code: text })
    });
  } catch (e) {
    if (seq !== copilotResolveSeq) return;
    COPILOT_STATE.resolveBusy = false;
    COPILOT_STATE.resolveError = `解析失败：${e.message || "请求错误"}`;
    refreshCopilotInfoBlock();
    return;
  }
  if (seq !== copilotResolveSeq) return;
  COPILOT_STATE.resolveBusy = false;
  if (result && result.ok && result.info) {
    COPILOT_STATE.resolvedInfo = result.info;
    COPILOT_STATE.resolvedPath = result.path || "";
    COPILOT_STATE.resolveError = "";
    // 解析成功后一律回填真实路径：无论输入的是神秘代码、prts.plus 链接还是本地路径。
    if (result.path && result.path !== COPILOT_STATE.filename) {
      COPILOT_STATE.filename = result.path;
      persistCopilotState();
      const input = document.getElementById("copilotFilenameInput");
      if (input && document.activeElement !== input) input.value = result.path;
    }
  } else {
    COPILOT_STATE.resolvedInfo = null;
    COPILOT_STATE.resolvedPath = "";
    COPILOT_STATE.resolveError = (result && result.message) || "解析失败";
  }
  refreshCopilotInfoBlock();
}

function refreshCopilotInfoBlock() {
  const container = document.querySelector(".copilotInfoBlock");
  if (!container) {
    renderCopilotView();
    return;
  }
  // 整块替换：信息块包含状态行 + 作业说明 + 干员标签三个同级元素。
  container.innerHTML = renderCopilotInfoBlock();
}

async function runCopilotAction(action, payload = {}) {
  if (action === "start" && copilotUnavailable()) return;
  if (!COPILOT_STATE.idle && action !== "stop") return;
  const options = copilotPayload(action, payload);
  const alternate = Boolean(options.alternate);
  const persistedAction = ["pasteTask", "pasteSet", "addTask", "clearTasks", "deleteTask", "selectTask"].includes(action);
  if (action === "start") {
    copilotLaunchedAt = Date.now();
    COPILOT_STATE.launching = true;
    COPILOT_STATE.filePopupOpen = false;
    syncCopilotRunState(state.runnerState);
    await fireCopilotStart();
    return;
  }
  if (action === "stop") {
    COPILOT_STATE.launching = false;
    syncCopilotRunState(state.runnerState);
    await fireCopilotStop();
    return;
  }
  if (action === "toggleFiles") COPILOT_STATE.filePopupOpen = !COPILOT_STATE.filePopupOpen;
  // 打开系统文件对话框后必须立刻返回：重渲染会把 file input 换成新元素，
  // 用户选完文件时 change 只会在已脱离文档的旧节点上派发。
  if (action === "selectFile") {
    pickCopilotFiles(false);
    return;
  }
  if (action === "pasteTask") await pasteCopilotText();
  if (action === "pasteSet") await pasteCopilotSet();
  if (action === "importFiles") {
    pickCopilotFiles(true);
    return;
  }
  if (action === "addTask") addCopilotTask(alternate);
  if (action === "clearTasks") clearCopilotTasks(alternate);
  if (action === "deleteTask") deleteCopilotTask(copilotPayloadIndex(options));
  if (action === "selectTask") selectCopilotTask(copilotPayloadIndex(options), alternate);
  if (persistedAction) persistCopilotState();
  renderCopilotView();
}

function copilotPayload(action, payload) {
  if (payload && typeof payload === "object") return payload;
  if (action === "addTask" || action === "clearTasks") return { alternate: Boolean(payload) };
  return { taskIndex: payload };
}

function copilotPayloadIndex(payload) {
  if (Number.isInteger(Number(payload.taskIndex))) return Number(payload.taskIndex);
  return Number(payload.event?.target.closest("[data-task-index]")?.dataset.taskIndex);
}

function deleteCopilotTask(index) {
  if (!Number.isInteger(index) || !COPILOT_STATE.tasks[index]) return;
  COPILOT_STATE.tasks.splice(index, 1);
}

function setCopilotTab(tab) {
  if (!COPILOT_STATE.idle) return;
  COPILOT_STATE.tab = tab;
  if (tab === 1 || tab === 3) COPILOT_STATE.useCopilotList = false;
  normalizeCopilotState();
  persistCopilotState();
  renderCopilotView();
}

function normalizeCopilotState() {
  if (COPILOT_STATE.useCopilotList) COPILOT_STATE.form = true;
  if (COPILOT_STATE.tab === 1 || COPILOT_STATE.tab === 3) COPILOT_STATE.useCopilotList = false;
  if (COPILOT_STATE.tab === 1) COPILOT_STATE.form = false;
}

function addCopilotTask(raid) {
  const path = copilotFilePath();
  const name = COPILOT_STATE.taskName || basenameWithoutExt(path) || "未命名";
  if (!path) {
    showNotice("请先选择作业文件或填写神秘代码", "warning");
    return;
  }
  COPILOT_STATE.tasks.push({ name, path, raid, checked: true });
}

function clearCopilotTasks(onlyUnchecked) {
  COPILOT_STATE.tasks = onlyUnchecked ? COPILOT_STATE.tasks.filter((task) => task.checked) : [];
}

function selectCopilotTask(index, disableList) {
  const task = COPILOT_STATE.tasks[index];
  if (!task) return;
  COPILOT_STATE.filename = task.path || task.name;
  if (disableList) COPILOT_STATE.useCopilotList = false;
}

function pickCopilotFiles(multiple) {
  const picker = $("copilotFilePicker");
  if (!picker) return;
  picker.multiple = Boolean(multiple);
  copilotImportMode = Boolean(multiple);
  picker.click();
}

// 浏览器出于安全不提供真实路径，必须把作业内容上传到 MAA 能读到的目录。
async function uploadCopilotFiles(files) {
  const uploaded = [];
  for (const file of files) {
    const content = await file.text();
    const result = await api("/api/copilot/upload", {
      method: "POST",
      body: JSON.stringify({ name: file.name, content })
    });
    if (result?.ok && result.path) uploaded.push({ name: basenameWithoutExt(result.name), path: result.path });
  }
  if (!uploaded.length) return;
  if (copilotImportMode) {
    if (!COPILOT_STATE.useCopilotList) COPILOT_STATE.useCopilotList = true;
    uploaded.forEach((item) => COPILOT_STATE.tasks.push({ name: item.name, path: item.path, raid: false, checked: true }));
    showNotice(`已导入 ${uploaded.length} 个作业`, "success");
  } else {
    COPILOT_STATE.filename = uploaded[0].path;
    COPILOT_STATE.resolvedPath = uploaded[0].path;
    showNotice(`已上传作业：${uploaded[0].name}`, "success");
    scheduleCopilotResolve();
  }
  persistCopilotState();
  renderCopilotView();
}

async function readClipboardText() {
  // navigator.clipboard 仅在 https / localhost 可用；局域网 http 访问时必须给出明确提示。
  if (!navigator.clipboard?.readText) {
    showNotice("当前不是安全上下文（https/localhost），浏览器禁止读取剪贴板，请手动粘贴到路径框。", "warning");
    return "";
  }
  try {
    return (await navigator.clipboard.readText()) || "";
  } catch (error) {
    showNotice(`读取剪贴板失败：${error?.message || "已被浏览器拒绝"}`, "warning");
    return "";
  }
}

async function pasteCopilotText() {
  const text = await readClipboardText();
  if (!text.trim()) return;
  COPILOT_STATE.filename = text.trim();
  scheduleCopilotResolve();
}

// 作业集：剪贴板里每行/每个分号段视为一个作业，批量加入作业列表。
async function pasteCopilotSet() {
  const text = await readClipboardText();
  const entries = text.split(/[\r\n;]+/).map((item) => item.trim()).filter(Boolean);
  if (!entries.length) return;
  if (!COPILOT_STATE.useCopilotList) COPILOT_STATE.useCopilotList = true;
  entries.forEach((entry) => {
    COPILOT_STATE.tasks.push({ name: basenameWithoutExt(entry) || entry, path: entry, raid: false, checked: true });
  });
  showNotice(`已添加 ${entries.length} 个作业到作业列表`, "success");
}

function basenameWithoutExt(path) {
  const name = String(path || "").split(/[\\/]/).pop() || "";
  return name.replace(/\.json$/i, "");
}

function copilotUnavailable() {
  const feature = typeof state !== "undefined" ? state.capabilities?.features?.copilot : null;
  if (!feature || feature.available !== false) return "";
  return feature.reason || "后端能力尚未接入。";
}

async function fireCopilotStart() {
  if (typeof api !== "function") return;
  const job = copilotStartPayload();
  if (!job.filename && !job.copilot_list && !job.list) {
    COPILOT_STATE.launching = false;
    COPILOT_STATE.startError = "请先选择作业文件或填写神秘代码。";
    syncCopilotRunState(state.runnerState);
    showNotice(COPILOT_STATE.startError, "warning");
    renderCopilotView();
    return;
  }
  COPILOT_STATE.startError = "";
  try {
    const result = await api("/api/copilot/start", {
      method: "POST",
      body: JSON.stringify(job)
    });
    if (!result.ok) {
      COPILOT_STATE.launching = false;
      COPILOT_STATE.startError = result.message || "启动失败";
      showNotice(`自动战斗启动失败：${COPILOT_STATE.startError}`, "error");
      syncCopilotRunState(state.runnerState);
      renderCopilotView();
    }
  } catch (error) {
    COPILOT_STATE.launching = false;
    COPILOT_STATE.startError = error?.message || "请求失败";
    showError(error);
    syncCopilotRunState(state.runnerState);
    renderCopilotView();
  }
}

function copilotFilePath() {
  // 神秘代码/prts.plus 链接解析后拿到的是本地缓存路径，启动时必须用它而不是原始输入。
  return COPILOT_STATE.resolvedPath || COPILOT_STATE.filename;
}

function copilotStartPayload() {
  const payload = {
    name: COPILOT_STATE.taskName || basenameWithoutExt(copilotFilePath()) || "copilot",
    task_type: copilotTaskType(),
    filename: copilotFilePath()
  };
  if (payload.task_type === "Copilot") addRegularCopilotPayload(payload);
  if (payload.task_type === "SSSCopilot") addSssCopilotPayload(payload);
  if (payload.task_type === "ParadoxCopilot") addParadoxCopilotPayload(payload);
  return payload;
}

function copilotTaskType() {
  if (COPILOT_STATE.tab === 1) return "SSSCopilot";
  if (COPILOT_STATE.tab === 2) return "ParadoxCopilot";
  return "Copilot";
}

function addRegularCopilotPayload(payload) {
  if (COPILOT_STATE.useCopilotList) {
    delete payload.filename;
    payload.copilot_list = checkedCopilotTasks().map((task) => ({
      filename: task.path,
      stage_name: task.name,
      is_raid: Boolean(task.raid)
    }));
    payload.use_sanity_potion = Boolean(COPILOT_STATE.useSanityPotion);
  }
  if (!COPILOT_STATE.useCopilotList && COPILOT_STATE.loop) {
    payload.loop_times = Math.max(1, Number(COPILOT_STATE.loopTimes) || 1);
  }
  if (COPILOT_STATE.form) {
    payload.formation = true;
    if (COPILOT_STATE.useFormation) payload.formation_index = Number(COPILOT_STATE.formationIndex) || 1;
    payload.ignore_requirements = Boolean(COPILOT_STATE.ignoreRequirements);
    payload.add_trust = Boolean(COPILOT_STATE.addTrust);
    if (COPILOT_STATE.useSupportUnit) {
      payload.support_unit_usage = Number(COPILOT_STATE.supportUsage) || 0;
      if (COPILOT_STATE.supportUnitName) payload.support_unit_name = COPILOT_STATE.supportUnitName;
    }
    if (COPILOT_STATE.addUserAdditional) payload.user_additional = parseUserAdditional(COPILOT_STATE.userAdditional);
  }
}

function addSssCopilotPayload(payload) {
  if (COPILOT_STATE.loop) payload.loop_times = Math.max(1, Number(COPILOT_STATE.loopTimes) || 1);
}

function addParadoxCopilotPayload(payload) {
  if (!COPILOT_STATE.useCopilotList) return;
  delete payload.filename;
  payload.list = checkedCopilotTasks().map((task) => task.path);
}

function checkedCopilotTasks() {
  return COPILOT_STATE.tasks.filter((task) => task.checked !== false && task.path);
}

function parseUserAdditional(text) {
  return String(text || "").split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, skill] = entry.split(",").map((part) => part.trim());
      return { name, skill: Number(skill) || 1 };
    })
    .filter((entry) => entry.name);
}

async function fireCopilotStop() {
  if (typeof api !== "function") return;
  try {
    await api("/api/copilot/stop", { method: "POST" });
  } catch {
    // Keep the visible state driven by the next runner status refresh.
  } finally {
    syncCopilotRunState(state.runnerState);
  }
}

const COPILOT_ACTION_NAMES = [
  "toggleFiles",
  "selectFile",
  "pasteTask",
  "pasteSet",
  "start",
  "stop",
  "importFiles",
  "addTask",
  "clearTasks",
  "deleteTask",
  "selectTask"
];

const COPILOT_ACTIONS = Object.fromEntries(
  COPILOT_ACTION_NAMES.map((action) => [action, (payload) => runCopilotAction(action, payload)])
);

COPILOT_ACTIONS.setTab = (payload) => {
  const value = payload && typeof payload === "object" ? payload.tab : payload;
  setCopilotTab(Number(value));
};

if (window.MaaFeatures) {
  window.MaaFeatures.register("copilot", {
    id: "copilot",
    order: 1,
    title: "自动战斗",
    render: renderCopilotView,
    wire: wireCopilotView,
    actions: COPILOT_ACTIONS,
    setOptions: setCopilotViewOptions,
    getState: () => COPILOT_STATE,
    persist: persistCopilotState
  });
}

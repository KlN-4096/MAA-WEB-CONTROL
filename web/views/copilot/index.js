const COPILOT_TABS = [
  "主线/故事集/SideStory",
  "保全派驻",
  "悖论模拟",
  "其他活动"
];

const COPILOT_TIPS = [
  { title: "小提示:" },
  { text: "1. 使用前请确认作业与所选的关卡类型一致。" },
  { text: "2. 主线、故事集、SideStory: 请在关卡界面的右下角存在「开始行动」按钮界面启动。" },
  { text: "3. 保全派驻: resource/copilot 文件夹内置多份作业。请先手动编队，在右下角存在「开始部署」按钮界面启动，可配合「循环次数」。" },
  { text: "4. 悖论模拟: 选好技能后，在技能选择界面存在「开始模拟」按钮界面启动，1/2 星干员（无技能）在右下角存在「开始模拟」按钮界面开始。若使用「多作业模式」，请从干员列表「等级/稀有度」筛选下启动。" },
  { text: "5. 使用好友助战时，请关闭「自动编队」和「多作业模式」，手动选择干员后，在编队界面右下角存在「开始行动」按钮界面启动。" },
  { text: "6. 干员若被标记为「特别关注」，可能影响「自动编队」的识别与选择。建议使用「自动编队」时移除关注，或在报错后关闭「自动编队」，根据提示手动补充缺失的干员。" },
  {
    text: "7. Copilot 作业站的神秘代码可通过输入框右侧的粘贴按钮粘贴:",
    items: ["单击第 2 个按钮 = 添加作业。", "单击第 3 个按钮 = 添加作业集。"]
  },
  {
    text: "8. 多作业模式:",
    items: [
      "选择作业后，检查下方关卡名是否正确 (例: CV-EX-1)。",
      "添加: 左键 = 普通难度，右键 = 突袭难度。",
      "清除: 左键 = 全部清空，右键 = 仅移除未激活任务。",
      "请在能看到目标关卡名的界面启动，不支持跨章节导航。",
      "遇到理智不足、战斗失败、未能三星结算时将自动中止。"
    ]
  }
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
  const root = $("copilotViewRoot");
  if (!root) return;
  const unavailable = copilotUnavailable();
  root.className = `copilotViewRoot ${copilotListVisible() ? "withList" : ""}`;
  root.innerHTML = `
    <section class="copilotMain">
      ${unavailable ? `<p class="featureUnavailable">${escapeHtml(unavailable)}</p>` : ""}
      <div class="copilotTop">
        <div class="copilotTabs">${COPILOT_TABS.map(copilotTabButton).join("")}</div>
        ${renderCopilotPathRow()}
        ${renderCopilotInfoBlock()}
      </div>
      <div class="copilotBody">
        <div class="copilotRunColumn">
          ${renderCopilotRunButton()}
          ${renderCopilotOptions()}
        </div>
        ${copilotListVisible() ? renderCopilotList() : ""}
      </div>
      <a class="copilotLink" href="https://prts.plus" target="_blank" rel="noreferrer">自动战斗作业分享</a>
    </section>
    <aside class="copilotInfo">
      <div class="copilotTips">${renderCopilotTips()}</div>
      <a class="copilotLink mapLink" href="https://map.ark-nights.com/areas" target="_blank" rel="noreferrer">自动战斗地图坐标</a>
    </aside>
  `;
}

function wireCopilotView() {
  const root = $("copilotViewRoot");
  if (!root || copilotWired) return;
  root.addEventListener("click", onCopilotClick);
  root.addEventListener("contextmenu", onCopilotContextMenu);
  root.addEventListener("change", onCopilotChange);
  root.addEventListener("input", onCopilotInput);
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
      ${iconButton("selectFile", "▢", "作业文件可以直接用鼠标拖进来哦 (oﾟvﾟ)ノ")}
      ${iconButton("pasteTask", "⧉", "读取剪贴板并添加为作业")}
      ${iconButton("pasteSet", "▤", "读取剪贴板并添加为作业集")}
      <input id="copilotFilePicker" class="hiddenFileInput" type="file" accept=".json" />
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
  const path = item.relative_path || item.path || "";
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
  if (COPILOT_STATE.idle) {
    return '<button class="copilotStartButton" type="button" data-copilot-action="start">开始</button>';
  }
  return '<button class="copilotStartButton" type="button" data-copilot-action="stop">停止</button>';
}

function renderCopilotInfoBlock() {
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
  return `<div class="copilotInfoLine ok"><span class="copilotInfoMain">${segments.join(" · ")}</span><span class="copilotInfoSource">${escapeHtml(sourceLabel)}</span></div>`;
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

function renderCopilotTips() {
  return COPILOT_TIPS.map((tipItem) => {
    if (tipItem.title) return `<p class="tipTitle">${escapeHtml(tipItem.title)}</p>`;
    if (!tipItem.items) return `<p>${escapeHtml(tipItem.text)}</p>`;
    return `
      <div class="copilotTipGroup">
        <p>${escapeHtml(tipItem.text)}</p>
        <ul>${tipItem.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
    `;
  }).join("");
}

function copilotListVisible() {
  return (COPILOT_STATE.useCopilotList && (COPILOT_STATE.tab === 0 || COPILOT_STATE.tab === 2)) || COPILOT_STATE.tab === 1 || COPILOT_STATE.tab === 3;
}

async function onCopilotClick(event) {
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

  if (event.target.id === "copilotFilePicker" && event.target.files?.[0]) {
    COPILOT_STATE.filename = event.target.files[0].name;
    persistCopilotState();
    renderCopilotView();
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
    const isMystery = /^\s*(?:maa:\/\/|prts\.(?:maa\.)?plus)/i.test(text) || /^\s*\d{1,9}\s*$/.test(text);
    if (result.path && result.path !== COPILOT_STATE.filename && isMystery) {
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
  const top = document.querySelector(".copilotTop");
  if (!top) {
    renderCopilotView();
    return;
  }
  const html = renderCopilotInfoBlock();
  let block = top.querySelector(".copilotInfoLine");
  if (!html) {
    if (block) block.remove();
    return;
  }
  if (block) {
    block.outerHTML = html;
  } else {
    const pathRow = top.querySelector(".copilotPathRow");
    if (pathRow) pathRow.insertAdjacentHTML("afterend", html);
    else top.insertAdjacentHTML("beforeend", html);
  }
}

async function runCopilotAction(action, payload = {}) {
  if (action === "start" && copilotUnavailable()) return;
  if (!COPILOT_STATE.idle && action !== "stop") return;
  const options = copilotPayload(action, payload);
  const alternate = Boolean(options.alternate);
  const persistedAction = ["pasteTask", "pasteSet", "addTask", "clearTasks", "deleteTask", "selectTask"].includes(action);
  if (action === "toggleFiles") COPILOT_STATE.filePopupOpen = !COPILOT_STATE.filePopupOpen;
  if (action === "selectFile") $("copilotFilePicker")?.click();
  if (action === "pasteTask" || action === "pasteSet") await pasteCopilotText();
  if (action === "start") {
    COPILOT_STATE.idle = false;
    COPILOT_STATE.filePopupOpen = false;
    fireCopilotStart();
  }
  if (action === "stop") {
    COPILOT_STATE.idle = true;
    fireCopilotStop();
  }
  if (action === "importFiles") $("copilotFilePicker")?.click();
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
  const name = COPILOT_STATE.taskName || basenameWithoutExt(COPILOT_STATE.filename) || "未命名";
  COPILOT_STATE.tasks.push({ name, path: COPILOT_STATE.filename, raid, checked: true });
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

async function pasteCopilotText() {
  if (!navigator.clipboard?.readText) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      COPILOT_STATE.filename = text.trim();
      scheduleCopilotResolve();
    }
  } catch (error) {
    console.warn("Clipboard access denied:", error.message);
  }
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

function fireCopilotStart() {
  if (typeof api !== "function") return;
  const job = copilotStartPayload();
  api("/api/copilot/start", {
    method: "POST",
    body: JSON.stringify(job)
  }).then((result) => {
    if (!result.ok) {
      COPILOT_STATE.idle = true;
      renderCopilotView();
    }
  }).catch(() => {
    COPILOT_STATE.idle = true;
    renderCopilotView();
  });
}

function copilotStartPayload() {
  const payload = {
    name: COPILOT_STATE.taskName || basenameWithoutExt(COPILOT_STATE.filename) || "copilot",
    task_type: copilotTaskType(),
    filename: COPILOT_STATE.filename
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

function fireCopilotStop() {
  if (typeof api !== "function") return;
  api("/api/copilot/stop", { method: "POST" }).catch(() => {});
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

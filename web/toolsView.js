const TOOL_TABS = ["公招识别", "干员识别", "仓库识别", "牛牛抽卡", "牛牛监控", "小游戏"];

const TOOL_TEXT = {
  recruitTip: "小提示: 和主界面的自动公招是两个独立的功能，请手动打开游戏公招 Tags 界面后使用~",
  showPotential: "显示干员潜能（4/5/6★ Tags）",
  showPotentialTip: "请使用 ｢干员识别｣ 获取干员信息。",
  operTip: "特别关注会影响干员识别准确率，如有特别关注干员识别错误请自行判断。",
  depotTip: "该功能尚处于测试阶段，请检查结果是否准确再行使用。若有误，欢迎打包 debug/depot 文件夹后向我们提交 issue ~",
  gachaInfo: "在罗德岛竟然有这么多志同道合的志士。是的，诗歌！战争！自由！能在历史的洪流中汇集众人的力量，为这片大地的改变而奋斗。真是令人振奋！这些悲壮又非凡的故事，是应当被传颂下去的。",
  peepTip: "看看牛牛眼中的世界？",
  miniEmptyTip: "在上方选择小游戏以开始运行。"
};

const GACHA_TIPS = [
  "保佑胜利的英雄，我将领受你们的祝福。",
  "伟大的战士们啊，我会在你们身边，与你们一同奋勇搏杀。",
  "再转身回头的时候，我们将带着胜利归来。",
  "不需畏惧，我们会战胜那些鲁莽的家伙！",
  "欢呼吧！",
  "来吧——",
  "现在可没有后悔的余地了。",
  "无需退路。",
  "英雄们啊，为这最强大的信念，请站在我们这边。",
  "颤抖吧，在真正的勇敢面前。",
  "哭嚎吧，为你们不堪一击的信念。",
  "你将在此跪拜。",
  "是吗，我们做到了吗……我现在，正体会至高的荣誉和幸福。",
  "转身吧，勇士们。我们已经获得了完美的胜利，现在是该回去享受庆祝的盛典了。",
  "听啊，悲鸣停止了。这是幸福的和平到来前的宁静。",
  "纵使人类的战争没尽头……在这一刻，我们守护住了自己生的尊严。离开吧。但要昂首挺胸。",
  "这对角可能会不小心撞倒些家具，我会尽量小心。"
];

const MINI_GAMES = [
  { label: "争锋频道：绿藤城", value: "MiniGame@ALL@IvyVine", tip: "手动跳过教程对话，然后可以直接退出。\n在活动主界面（右下角有 ｢加入赛事｣ 处）开始任务。\n\n跟着鸭总喝口汤。" },
  { label: "PV-烟花筹委会", value: "MiniGame@PV", tip: "从所选关卡开始并自动通关。若选择第一关，则从活动页最左侧开始；若选择其他关卡，请先进入上一关再返回以校准位置。" },
  { label: "卫戍协议：盟约", value: "MiniGame@SPA", tip: "在活动主界面（有 ｢独立模拟｣ 处开始任务）\n在有存档时需要先手动放弃\n最高只测试过 ｢险境模拟｣" },
  { label: "OS-喀兰贸易技术研发部", value: "MiniGame@OS", tip: "在活动主界面（右下角有 ｢开始重建｣ 处）开始任务。" },
  { label: "次生预案 RM-TR-1", value: "MiniGame@RM-TR-1", tip: "过完新手教程后进入前哨支点，滑动到界面最左侧。" },
  { label: "次生预案 RM-1", value: "MiniGame@RM-1", tip: "刷 RM-TR-1 大约 3 小时，营建策略中，石材开采线点到底。\n手动进入关卡并退出，让 RM-1 位于屏幕中央后运行。" },
  { label: "AT-相谈室", value: "MiniGame@AT@ConversationRoom", tip: "在活动主界面（右下角有 ｢开始营业｣ 处）开始任务。" },
  { label: "争锋频道：青草城", value: "MiniGame@ALL@GreenGrass", tip: "手动跳过教程对话，然后可以直接退出。\n在活动主界面（右下角有 ｢加入赛事｣ 处）开始任务。\n\n跟着鸭总喝口汤。" },
  { label: "争锋频道：蜜果城", value: "MiniGame@ALL@HoneyFruit", tip: "手动跳过教程对话，然后可以直接退出。\n在活动主界面（右下角有 ｢加入赛事｣ 处）开始任务。\n\n跟着鸭总喝口汤。" },
  { label: "活动商店", value: "SS@Store@Begin", tip: "请在活动商店页面开始。\n不买无限池。" },
  { label: "绿票商店", value: "GreenTicket@Store@Begin", tip: "1层全买。\n2层买寻访凭证和招聘许可。" },
  { label: "黄票商店", value: "YellowTicket@Store@Begin", tip: "请确保自己至少有258张黄票。" },
  { label: "生息演算商店", value: "RA@Store@Begin", tip: "请在活动商店页面开始。" },
  { label: "隐秘战线", value: "MiniGame@SecretFront", tip: "在选小队界面开始，如有存档须手动删除。\n第一次打自己看完把教程关了。\n推荐勾选游戏内 ｢继承上一支队伍发回的数据｣" }
];

const TOOLS_STORAGE_KEY = "maa-web.toolsState";
const TOOLS_PERSISTED_FIELDS = [
  "tab",
  "autoTime",
  "showPotential",
  "levels",
  "times",
  "operListTab",
  "gachaDisclaimer",
  "fps",
  "miniGame",
  "secretEnding",
  "secretEvent"
];

const TOOLS_STATE = {
  tab: 0,
  autoTime: true,
  showPotential: true,
  levels: { 3: true, 4: true, 5: true, 6: true },
  times: { 3: ["09", "00"], 4: ["09", "00"], 5: ["09", "00"] },
  recruitInfo: TOOL_TEXT.recruitTip,
  operInfo: TOOL_TEXT.operTip,
  depotInfo: TOOL_TEXT.depotTip,
  operSyncTime: "",
  depotSyncTime: "",
  operListTab: "have",
  gachaDisclaimer: true,
  gachaInfo: TOOL_TEXT.gachaInfo,
  peeping: false,
  fps: 20,
  miniGame: "SS@Store@Begin",
  secretEnding: "A",
  secretEvent: "",
  miniRunning: false,
  miniDropdownOpen: false,
  depotItems: [],
  depotDone: false,
  operOwnList: [],
  operNotOwnList: [],
  operDone: false,
  recruitTags: [],
  recruitSpecialTag: "",
  recruitSyncTime: "",
  ...restoreToolsState()
};

TOOLS_STATE.peeping = false;
TOOLS_STATE.miniRunning = false;
TOOLS_STATE.miniDropdownOpen = false;

let toolsWired = false;
let peepSocket = null;

function restoreToolsState() {
  const parsed = readToolsStorage();
  if (!parsed) return {};
  const restored = {};
  if (Number.isInteger(parsed.tab) && parsed.tab >= 0 && parsed.tab < TOOL_TABS.length) restored.tab = parsed.tab;
  ["autoTime", "showPotential", "gachaDisclaimer"].forEach((field) => MaaStorage.copyBoolean(parsed, restored, field));
  ["operListTab", "miniGame", "secretEnding", "secretEvent"].forEach((field) => MaaStorage.copyString(parsed, restored, field));
  if (Number.isFinite(Number(parsed.fps))) restored.fps = clampInt(parsed.fps, 1, 600);
  if (MaaStorage.isObject(parsed.levels)) {
    restored.levels = { 3: true, 4: true, 5: true, 6: true };
    [3, 4, 5, 6].forEach((level) => {
      if (typeof parsed.levels[level] === "boolean") restored.levels[level] = parsed.levels[level];
    });
  }
  if (MaaStorage.isObject(parsed.times)) {
    restored.times = { 3: ["09", "00"], 4: ["09", "00"], 5: ["09", "00"] };
    [3, 4, 5].forEach((level) => {
      if (Array.isArray(parsed.times[level]) && parsed.times[level].length >= 2) {
        restored.times[level] = [String(parsed.times[level][0]), String(parsed.times[level][1])];
      }
    });
  }
  return restored;
}

function readToolsStorage() {
  return MaaStorage.readObject(TOOLS_STORAGE_KEY, null);
}

function persistToolsState() {
  MaaStorage.writeObject(TOOLS_STORAGE_KEY, MaaStorage.pick(TOOLS_STATE, TOOLS_PERSISTED_FIELDS));
}

function renderToolsView() {
  const root = $("toolsViewRoot");
  if (!root) return;
  const unavailable = toolsUnavailable();
  root.innerHTML = `
    <section class="toolsPanel">
      ${unavailable ? `<p class="featureUnavailable">${escapeHtml(unavailable)}</p>` : ""}
      <div class="toolsTabs">${TOOL_TABS.map(toolTabButton).join("")}</div>
      <div class="toolsContent">${renderToolTab()}</div>
    </section>
  `;
}

function wireToolsView() {
  const root = $("toolsViewRoot");
  if (!root || toolsWired) return;
  root.addEventListener("click", onToolsClick);
  root.addEventListener("change", onToolsChange);
  root.addEventListener("input", onToolsInput);
  toolsWired = true;
}

function toolTabButton(label, index) {
  const active = TOOLS_STATE.tab === index ? " active" : "";
  return `<button class="toolsTab${active}" type="button" data-tools-tab="${index}">${escapeHtml(label)}</button>`;
}

function renderToolTab() {
  if (TOOLS_STATE.tab === 0) return renderRecruitTool();
  if (TOOLS_STATE.tab === 1) return renderOperBoxTool();
  if (TOOLS_STATE.tab === 2) return renderDepotTool();
  if (TOOLS_STATE.tab === 3) return renderGachaTool();
  if (TOOLS_STATE.tab === 4) return renderPeepTool();
  return renderMiniGameTool();
}

function renderRecruitTool() {
  const hasTags = TOOLS_STATE.recruitTags.length > 0;
  const tagsSection = hasTags ? `
    <div class="recruitTagResult">
      <div class="recruitTagRow">${TOOLS_STATE.recruitTags.map((t) => `<span class="recruitTag">${escapeHtml(t)}</span>`).join("")}</div>
      ${TOOLS_STATE.recruitSpecialTag ? `<div class="recruitSpecialTag">⭐ 高稀有度 Tag: ${escapeHtml(TOOLS_STATE.recruitSpecialTag)}</div>` : ""}
      ${TOOLS_STATE.recruitSyncTime ? `<p class="syncLine">识别时间: ${escapeHtml(TOOLS_STATE.recruitSyncTime)}</p>` : ""}
    </div>` : "";
  return `
    <div class="toolsGrid recruitTool">
      <div class="toolsScroll">
        <p class="toolsInfo recruitInfo">${escapeHtml(TOOLS_STATE.recruitInfo)}</p>
        ${tagsSection}
      </div>
      <div class="recruitBottom">
        <div class="recruitLeft">
          ${toolCheck("autoTime", "自动设置时间", TOOLS_STATE.autoTime)}
          <label class="toolCheck wrapCheck">
            <input type="checkbox" data-tools-field="showPotential" ${checked(TOOLS_STATE.showPotential)} />
            <span>${escapeHtml(TOOL_TEXT.showPotential)}</span>${tipIcon(TOOL_TEXT.showPotentialTip)}
          </label>
        </div>
        <div class="recruitLevels">${[3, 4, 5, 6].map(renderRecruitLevel).join("")}</div>
        <button class="toolBigButton" type="button" data-tools-action="startRecruit"${unavailableAttr("tools")}>开始识别</button>
      </div>
    </div>
  `;
}

function renderRecruitLevel(level) {
  const disabledTime = level === 6 ? " disabled" : "";
  const time = level === 6 ? ["09", "00"] : TOOLS_STATE.times[level];
  return `
    <div class="recruitLevel">
      ${toolCheck(`level${level}`, `自动选择 ${level} 星 Tags`, TOOLS_STATE.levels[level])}
      ${TOOLS_STATE.autoTime ? `<div class="timePair">
        <input type="number" min="1" max="9" value="${time[0]}" data-tools-time="${level}-h"${disabledTime} />
        <span>:</span>
        <input type="number" min="0" max="50" step="10" value="${time[1]}" data-tools-time="${level}-m"${disabledTime} />
      </div>` : ""}
    </div>
  `;
}

function renderOperBoxTool() {
  return `
    <div class="toolsGrid resultTool">
      ${syncLine("上次同步时间", TOOLS_STATE.operSyncTime)}
      <p class="toolsInfo centered">${escapeHtml(TOOLS_STATE.operInfo)}</p>
      ${renderOperTabs()}
      <div class="toolButtonRow">
        <button class="toolBigButton" type="button" data-tools-action="copyOper"${unavailableAttr("tools")}>复制到剪切板</button>
        <button class="toolBigButton" type="button" data-tools-action="startOper"${unavailableAttr("tools")}>开始识别</button>
      </div>
    </div>
  `;
}

function renderOperTabs() {
  const own = TOOLS_STATE.operOwnList;
  const notOwn = TOOLS_STATE.operNotOwnList;
  if (!own.length && !notOwn.length) {
    return `<section class="nestedToolPanel emptyResultPanel" aria-label="干员识别结果"></section>`;
  }
  const list = TOOLS_STATE.operListTab === "have" ? own : notOwn;
  const tabs = [
    { key: "have", label: `已拥有 (${own.length})` },
    { key: "notHave", label: `未拥有 (${notOwn.length})` },
  ];
  const tabButtons = tabs.map(({ key, label }) =>
    `<button class="nestedTab${TOOLS_STATE.operListTab === key ? " active" : ""}" type="button" data-tools-oper-tab="${key}">${escapeHtml(label)}</button>`
  ).join("");
  const rows = list.slice(0, 200).map((op) => {
    const star = "★".repeat(Math.max(0, (op.rarity ?? 0) + 1));
    const elite = op.elite != null ? `精${op.elite}` : "";
    const lv = op.level != null ? `Lv${op.level}` : "";
    return `<div class="operRow"><span class="operName">${escapeHtml(op.name || "")}</span><span class="operMeta">${escapeHtml([star, elite, lv].filter(Boolean).join(" "))}</span></div>`;
  }).join("");
  const overflow = list.length > 200 ? `<p class="overflowNote">...仅显示前 200 项，共 ${list.length} 项</p>` : "";
  return `
    <section class="nestedToolPanel" aria-label="干员识别结果">
      <div class="nestedTabs">${tabButtons}</div>
      <div class="operList">${rows}${overflow}</div>
    </section>
  `;
}

function renderDepotTool() {
  const items = TOOLS_STATE.depotItems;
  const depotGrid = items.length
    ? `<div class="cardGrid depotGrid" aria-label="仓库识别结果">${items.map(renderDepotItem).join("")}</div>`
    : `<div class="cardGrid depotGrid emptyResultPanel" aria-label="仓库识别结果"></div>`;
  return `
    <div class="toolsGrid resultTool">
      ${syncLine("上次同步时间", TOOLS_STATE.depotSyncTime)}
      <p class="toolsInfo centered">${escapeHtml(TOOLS_STATE.depotInfo)}</p>
      ${depotGrid}
      <div class="toolButtonRow wide">
        <button class="toolBigButton" type="button" data-tools-action="exportArkplanner"${unavailableAttr("tools")}>导出至企鹅物流刷图规划</button>
        <button class="toolBigButton" type="button" data-tools-action="exportLolicon"${unavailableAttr("tools")}>导出至明日方舟工具箱</button>
        <button class="toolBigButton" type="button" data-tools-action="startDepot"${unavailableAttr("tools")}>开始识别</button>
      </div>
    </div>
  `;
}

function renderDepotItem(item) {
  const name = escapeHtml(item.itemName || item.itemId || "未知");
  const count = item.count != null ? item.count : 0;
  return `<div class="depotItem"><span class="depotItemName">${name}</span><span class="depotItemCount">${count}</span></div>`;
}

function renderGachaTool() {
  if (TOOLS_STATE.gachaDisclaimer) {
    return `
      <div class="gachaDisclaimer">
        <div class="disclaimerLine"><span>请注意，这是</span><strong class="rainbowText">真正的抽卡</strong></div>
        <button class="gachaAgreeButton" type="button" data-tools-action="agreeGacha">知道了</button>
        <label class="toolCheck disabledCheck"><input type="checkbox" disabled /><span>下次不再提示</span></label>
      </div>
    `;
  }
  return `
    <div class="gachaTool">
      <p class="toolsInfo centered">${escapeHtml(TOOLS_STATE.gachaInfo)}</p>
      <div class="peepScreen">${fpsBadge()}</div>
      <div class="toolButtonRow">
        <button class="toolBigButton" type="button" data-tools-action="gachaOnce"${unavailableAttr("tools")}>寻访一次</button>
        <button class="toolBigButton" type="button" data-tools-action="gachaTen"${unavailableAttr("tools")}>寻访十次</button>
        <button class="toolBigButton" type="button" data-tools-action="togglePeep"${unavailableAttr("tools")}>Peep!</button>
      </div>
    </div>
  `;
}

function renderPeepTool() {
  return `
    <div class="peepTool">
      <div class="peepStage">${TOOLS_STATE.peeping ? `<div class="peepScreen active"><div class="deviceFrame">${fpsBadge()}</div></div>` : `<p>${escapeHtml(TOOL_TEXT.peepTip)}</p>`}</div>
      <div class="peepControls">
        <button class="toolBigButton" type="button" data-tools-action="togglePeep"${unavailableAttr("tools")}>${TOOLS_STATE.peeping ? "Stop!" : "Peep!"}</button>
        <label class="fpsControl"><span>目标帧率</span><input type="number" min="1" max="600" value="${TOOLS_STATE.fps}" data-tools-field="fps" /></label>
      </div>
    </div>
  `;
}

function renderMiniGameTool() {
  const selected = MINI_GAMES.find((item) => item.value === TOOLS_STATE.miniGame);
  return `
    <div class="miniGameTool">
      <div class="miniCombo">
        <span class="miniComboTitle">小游戏名称</span>
        <button class="miniComboButton${TOOLS_STATE.miniDropdownOpen ? " open" : ""}" type="button" data-tools-action="toggleMiniDropdown">
          <span>${escapeHtml(selected?.label || "")}</span><span class="miniComboArrow">${TOOLS_STATE.miniDropdownOpen ? "⌃" : "⌄"}</span>
        </button>
        ${TOOLS_STATE.miniDropdownOpen ? renderMiniDropdown() : ""}
      </div>
      ${TOOLS_STATE.miniGame === "MiniGame@SecretFront" ? renderSecretFrontOptions() : ""}
      <p class="miniTip">${escapeHtml(selected?.tip || TOOL_TEXT.miniEmptyTip)}</p>
      <button class="miniStart" type="button" data-tools-action="startMini"${unavailableAttr("tools")}>${TOOLS_STATE.miniRunning ? "Stop!" : "Link Start!"}</button>
    </div>
  `;
}

function renderMiniDropdown() {
  return `<div class="miniComboMenu">${MINI_GAMES.map((item) => `
    <button class="miniComboOption${item.value === TOOLS_STATE.miniGame ? " selected" : ""}" type="button" data-mini-value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>
  `).join("")}</div>`;
}

function renderSecretFrontOptions() {
  const events = [["", "不选择"], ["支援作战平台", "支援作战平台"], ["游侠", "游侠"], ["诡影迷踪", "诡影迷踪"]];
  return `
    <div class="secretFront">
      <label class="titleSelect"><span>结局</span><select data-tools-field="secretEnding">${["A", "B", "C", "D", "E"].map((item) => option(item, item, TOOLS_STATE.secretEnding)).join("")}</select></label>
      <label class="titleSelect"><span>优先系列事件</span><select data-tools-field="secretEvent">${events.map(([value, label]) => option(value, label, TOOLS_STATE.secretEvent)).join("")}</select></label>
    </div>
  `;
}

function onToolsClick(event) {
  const tab = event.target.closest("[data-tools-tab]");
  if (tab) {
    setToolsTab(Number(tab.dataset.toolsTab));
    return;
  }
  const miniValue = event.target.closest("[data-mini-value]")?.dataset.miniValue;
  if (miniValue) {
    TOOLS_STATE.miniGame = miniValue;
    TOOLS_STATE.miniDropdownOpen = false;
    persistToolsState();
    renderToolsView();
    return;
  }
  const operTab = event.target.closest("[data-tools-oper-tab]");
  if (operTab) {
    TOOLS_STATE.operListTab = operTab.dataset.toolsOperTab;
    persistToolsState();
  }
  const action = event.target.closest("[data-tools-action]")?.dataset.toolsAction;
  if (action) runToolsAction(action, { render: false });
  if (operTab || action) renderToolsView();
}

function onToolsChange(event) {
  const field = event.target.dataset.toolsField;
  if (!field) return;
  updateToolsField(field, event.target);
  persistToolsState();
  renderToolsView();
}

function onToolsInput(event) {
  const time = event.target.dataset.toolsTime;
  if (time) {
    updateRecruitTime(time, event.target.value);
    persistToolsState();
  }
  if (event.target.dataset.toolsField === "fps") {
    TOOLS_STATE.fps = clampInt(event.target.value, 1, 600);
    persistToolsState();
  }
}

function updateToolsField(field, target) {
  if (field === "autoTime") TOOLS_STATE.autoTime = target.checked;
  if (field === "showPotential") TOOLS_STATE.showPotential = target.checked;
  if (field.startsWith("level")) TOOLS_STATE.levels[field.replace("level", "")] = target.checked;
  if (field === "miniGame") TOOLS_STATE.miniGame = target.value;
  if (field === "secretEnding") TOOLS_STATE.secretEnding = target.value;
  if (field === "secretEvent") TOOLS_STATE.secretEvent = target.value;
  if (field === "fps") TOOLS_STATE.fps = clampInt(target.value, 1, 600);
}

function setToolsTab(tab) {
  if (!Number.isInteger(tab) || tab < 0 || tab >= TOOL_TABS.length) return;
  TOOLS_STATE.tab = tab;
  TOOLS_STATE.miniDropdownOpen = false;
  persistToolsState();
  renderToolsView();
}

function runToolsAction(action, payload = {}) {
  const options = payload && typeof payload === "object" ? payload : {};
  runToolAction(action);
  if (options.render !== false) renderToolsView();
  return action;
}

function runToolAction(action) {
  if (toolActionRequiresBackend(action) && toolsUnavailable()) return;
  if (action === "startRecruit") {
    TOOLS_STATE.recruitInfo = "正在识别……";
    TOOLS_STATE.recruitTags = [];
    TOOLS_STATE.recruitSpecialTag = "";
    TOOLS_STATE.recruitSyncTime = "";
  }
  if (action === "startOper") TOOLS_STATE.operInfo = "正在识别……";
  if (action === "startDepot") TOOLS_STATE.depotInfo = "正在识别……";
  if (action === "copyOper") {
    const list = TOOLS_STATE.operListTab === "have" ? TOOLS_STATE.operOwnList : TOOLS_STATE.operNotOwnList;
    const text = list.map((op) => op.name || "").filter(Boolean).join("\n");
    if (navigator.clipboard?.writeText && text) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    TOOLS_STATE.operInfo = text ? "已复制到剪切板" : "暂无数据，请先识别";
  }
  if (action === "exportArkplanner") {
    const text = buildDepotExportText("arkplanner");
    if (navigator.clipboard?.writeText && text) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    TOOLS_STATE.depotInfo = text ? "已复制（企鹅物流格式）" : "暂无数据，请先识别";
  }
  if (action === "exportLolicon") {
    const text = buildDepotExportText("lolicon");
    if (navigator.clipboard?.writeText && text) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    TOOLS_STATE.depotInfo = text ? "已复制（明日方舟工具箱格式）" : "暂无数据，请先识别";
  }
  if (action === "agreeGacha") TOOLS_STATE.gachaDisclaimer = false;
  if (action === "gachaOnce" || action === "gachaTen") TOOLS_STATE.gachaInfo = GACHA_TIPS[Math.floor(Math.random() * GACHA_TIPS.length)];
  if (action === "togglePeep") { TOOLS_STATE.peeping = !TOOLS_STATE.peeping; managePeepConnection(); }
  if (action === "startMini") { TOOLS_STATE.miniRunning = !TOOLS_STATE.miniRunning; manageMiniGameTask(); }
  if (action === "toggleMiniDropdown") TOOLS_STATE.miniDropdownOpen = !TOOLS_STATE.miniDropdownOpen;
  if (action === "agreeGacha") persistToolsState();
  fireToolBackend(action);
}

function toolActionRequiresBackend(action) {
  return [
    "startRecruit",
    "copyOper",
    "startOper",
    "exportArkplanner",
    "exportLolicon",
    "startDepot",
    "gachaOnce",
    "gachaTen",
    "togglePeep",
    "startMini"
  ].includes(action);
}

function unavailableAttr(id) {
  const reason = toolsUnavailable(id);
  return reason ? ` disabled title="${escapeHtml(reason)}"` : "";
}

function toolsUnavailable(id = "tools") {
  const feature = typeof state !== "undefined" ? state.capabilities?.features?.[id] : null;
  if (!feature || feature.available !== false) return "";
  return feature.reason || "后端能力尚未接入。";
}

function updateRecruitTime(token, value) {
  const [level, part] = token.split("-");
  const index = part === "h" ? 0 : 1;
  const max = part === "h" ? 9 : 50;
  const normalized = clampInt(value, part === "h" ? 1 : 0, max);
  TOOLS_STATE.times[level][index] = String(part === "m" ? Math.floor(normalized / 10) * 10 : normalized).padStart(2, "0");
}

function toolCheck(field, label, value) {
  return `<label class="toolCheck"><input type="checkbox" data-tools-field="${field}" ${checked(value)} /><span>${escapeHtml(label)}</span></label>`;
}

function checked(value) {
  return value ? "checked" : "";
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${String(value) === String(selected) ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function tipIcon(text) {
  return `<span class="copilotTipIcon" data-tip="${escapeHtml(text)}" tabindex="0">?</span>`;
}

function emptyResult(text) {
  return `<div class="toolEmpty">${escapeHtml(text)}</div>`;
}

function syncLine(label, text) {
  if (!text) return "";
  return `<p class="syncLine">${escapeHtml(label)}: ${escapeHtml(text)}</p>`;
}

function fpsBadge() {
  return `<span class="fpsBadge">${Number(TOOLS_STATE.fps).toFixed(2)} FPS</span>`;
}

function clampInt(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

const TOOL_BACKEND_MAP = {
  startRecruit: "recruit_calc",
  startOper: "operbox",
  startDepot: "depot",
  gachaOnce: "gacha_once",
  gachaTen: "gacha_ten",
};

function buildRecruitCalcParams() {
  const select = [3, 4, 5, 6].filter((l) => TOOLS_STATE.levels[l]);
  const recruitmentTime = {};
  [3, 4, 5].forEach((l) => {
    const [h, m] = TOOLS_STATE.times[l] || ["09", "00"];
    recruitmentTime[String(l)] = parseInt(h, 10) * 60 + parseInt(m, 10);
  });
  recruitmentTime["6"] = 540;
  return { select, confirm: [], times: 0, set_time: TOOLS_STATE.autoTime, recruitment_time: recruitmentTime };
}

function fireToolBackend(action) {
  const toolName = TOOL_BACKEND_MAP[action];
  if (!toolName || typeof api !== "function") return;
  const params = action === "startRecruit" ? buildRecruitCalcParams() : {};
  api("/api/tools/run", {
    method: "POST",
    body: JSON.stringify({ tool: toolName, params })
  }).then((result) => {
    if (result.ok) {
      if (action === "startRecruit") TOOLS_STATE.recruitInfo = "识别请求已发送，等待结果……";
      if (action === "startOper") TOOLS_STATE.operInfo = "识别请求已发送，等待结果……";
      if (action === "startDepot") TOOLS_STATE.depotInfo = "识别请求已发送，等待结果……";
    } else {
      const msg = result.message || "请求失败";
      if (action === "startRecruit") TOOLS_STATE.recruitInfo = msg;
      if (action === "startOper") TOOLS_STATE.operInfo = msg;
      if (action === "startDepot") TOOLS_STATE.depotInfo = msg;
    }
    renderToolsView();
  }).catch((error) => {
    const msg = error.message || "请求失败";
    if (action === "startRecruit") TOOLS_STATE.recruitInfo = msg;
    if (action === "startOper") TOOLS_STATE.operInfo = msg;
    if (action === "startDepot") TOOLS_STATE.depotInfo = msg;
    renderToolsView();
  });
}

function handleToolEvent(event) {
  if (!event || !event.type) return;
  if (event.type === "maa.tools.recruit_calc") {
    const detail = event.detail || {};
    if (detail.what === "tags_detected") {
      TOOLS_STATE.recruitTags = Array.isArray(detail.tags) ? detail.tags : [];
      TOOLS_STATE.recruitSyncTime = new Date().toLocaleTimeString();
      TOOLS_STATE.recruitInfo = TOOLS_STATE.recruitTags.length
        ? `识别到 ${TOOLS_STATE.recruitTags.length} 个 Tag`
        : "识别完成（无 Tags）";
    }
    if (detail.what === "special_tag" && detail.tag) {
      TOOLS_STATE.recruitSpecialTag = detail.tag;
      TOOLS_STATE.recruitInfo = `识别到 ${TOOLS_STATE.recruitTags.length} 个 Tag ⭐ 含高稀有度`;
    }
    if (typeof state !== "undefined" && state.currentView === "tools" && TOOLS_STATE.tab === 0) {
      renderToolsView();
    }
    return;
  }
  if (event.type === "maa.tools.depot") {
    const detail = event.detail || {};
    TOOLS_STATE.depotItems = Array.isArray(detail.items) ? detail.items : [];
    TOOLS_STATE.depotDone = Boolean(detail.done);
    TOOLS_STATE.depotSyncTime = new Date().toLocaleTimeString();
    TOOLS_STATE.depotInfo = TOOLS_STATE.depotDone
      ? `识别完成，共 ${TOOLS_STATE.depotItems.length} 种物品`
      : "识别中…";
    if (typeof state !== "undefined" && state.currentView === "tools" && TOOLS_STATE.tab === 2) {
      renderToolsView();
    }
    return;
  }
  if (event.type === "maa.tools.operbox") {
    const detail = event.detail || {};
    TOOLS_STATE.operOwnList = Array.isArray(detail.own_oper) ? detail.own_oper : [];
    TOOLS_STATE.operNotOwnList = Array.isArray(detail.not_own_oper) ? detail.not_own_oper : [];
    TOOLS_STATE.operDone = Boolean(detail.done);
    TOOLS_STATE.operSyncTime = new Date().toLocaleTimeString();
    TOOLS_STATE.operInfo = TOOLS_STATE.operDone
      ? `识别完成，已拥有 ${TOOLS_STATE.operOwnList.length} 人`
      : "识别中…";
    if (typeof state !== "undefined" && state.currentView === "tools" && TOOLS_STATE.tab === 1) {
      renderToolsView();
    }
    return;
  }
}

function buildDepotExportText(format) {
  const items = TOOLS_STATE.depotItems;
  if (!items.length) return "";
  if (format === "arkplanner") {
    const obj = {};
    items.forEach((item) => { if (item.itemId) obj[item.itemId] = item.count || 0; });
    return JSON.stringify(obj);
  }
  if (format === "lolicon") {
    const obj = { items: {} };
    items.forEach((item) => { if (item.itemId) obj.items[item.itemId] = item.count || 0; });
    return JSON.stringify(obj);
  }
  return "";
}

function managePeepConnection() {
  if (TOOLS_STATE.peeping) {
    startPeepSocket();
  } else {
    closePeepSocket();
  }
}

function startPeepSocket() {
  if (peepSocket) return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  peepSocket = new WebSocket(`${protocol}//${location.host}/api/peep`);
  peepSocket.onopen = () => sendPeepRequest();
  peepSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.ok && data.data) updatePeepFrame(data.data, data.media_type);
    } catch (e) { /* ignore parse errors */ }
    if (TOOLS_STATE.peeping && peepSocket?.readyState === WebSocket.OPEN) {
      sendPeepRequest();
    }
  };
  peepSocket.onclose = () => {
    peepSocket = null;
    if (TOOLS_STATE.peeping) {
      TOOLS_STATE.peeping = false;
      renderToolsView();
    }
  };
  peepSocket.onerror = () => {
    closePeepSocket();
    TOOLS_STATE.peeping = false;
    renderToolsView();
  };
}

function sendPeepRequest() {
  if (peepSocket?.readyState === WebSocket.OPEN) {
    peepSocket.send(JSON.stringify({ fps: TOOLS_STATE.fps }));
  }
}

function closePeepSocket() {
  if (peepSocket) {
    peepSocket.close();
    peepSocket = null;
  }
}

function updatePeepFrame(base64Data, mediaType) {
  const screen = document.querySelector(".peepScreen");
  if (!screen) return;
  let img = screen.querySelector("img");
  if (!img) {
    img = document.createElement("img");
    img.className = "peepFrame";
    screen.appendChild(img);
  }
  img.src = `data:${mediaType || "image/jpeg"};base64,${base64Data}`;
}

function manageMiniGameTask() {
  if (!TOOLS_STATE.miniRunning) {
    if (typeof api === "function") api("/api/stop", { method: "POST" }).catch(() => {});
    return;
  }
  if (typeof api !== "function") return;
  const params = { task_names: [TOOLS_STATE.miniGame] };
  if (TOOLS_STATE.miniGame === "MiniGame@SecretFront") {
    if (TOOLS_STATE.secretEnding) params.secret_ending = TOOLS_STATE.secretEnding;
    if (TOOLS_STATE.secretEvent) params.secret_event = TOOLS_STATE.secretEvent;
  }
  api("/api/tools/run", {
    method: "POST",
    body: JSON.stringify({ tool: "custom", params })
  }).catch(() => {
    TOOLS_STATE.miniRunning = false;
    renderToolsView();
  });
}

const TOOL_ACTION_NAMES = [
  "startRecruit",
  "copyOper",
  "startOper",
  "exportArkplanner",
  "exportLolicon",
  "startDepot",
  "agreeGacha",
  "gachaOnce",
  "gachaTen",
  "togglePeep",
  "toggleMiniDropdown",
  "startMini"
];

const TOOLS_ACTIONS = Object.fromEntries(
  TOOL_ACTION_NAMES.map((action) => [action, (payload) => runToolsAction(action, payload)])
);

TOOLS_ACTIONS.setTab = (payload) => {
  const value = payload && typeof payload === "object" ? payload.tab : payload;
  setToolsTab(Number(value));
};

if (window.MaaFeatures) {
  window.MaaFeatures.register("tools", {
    id: "tools",
    order: 2,
    title: "小工具",
    render: renderToolsView,
    wire: wireToolsView,
    actions: TOOLS_ACTIONS,
    getState: () => TOOLS_STATE,
    persist: persistToolsState
  });
}

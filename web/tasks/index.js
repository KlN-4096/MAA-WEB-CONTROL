const TASK_TYPES = [
  "StartUp", "Recruit", "Infrast", "Fight", "Custom", "Mall",
  "Award", "Roguelike", "Reclamation", "CloseDown", "UserDataUpdate"
];

const TASK_NAMES = {
  StartUp: "开始唤醒",
  Recruit: "自动公招",
  Infrast: "基建换班",
  Fight: "理智作战",
  Custom: "自定义任务",
  Mall: "信用收支",
  Award: "领取奖励",
  Roguelike: "自动肉鸽",
  Reclamation: "生息演算",
  CloseDown: "关闭游戏",
  UserDataUpdate: "更新数据"
};

const NO_ADVANCED_TASKS = new Set(["StartUp", "Award", "CloseDown", "UserDataUpdate"]);
const STARTUP_CLIENT_TYPES = [
  { label: "官服", value: "Official" },
  { label: "Bilibili服", value: "Bilibili" },
  { label: "国际服 (YostarEN)", value: "YoStarEN" },
  { label: "日服 (YostarJP)", value: "YoStarJP" },
  { label: "韩服 (YostarKR)", value: "YoStarKR" },
  { label: "繁中服 (txwy)", value: "txwy" }
];
const CONNECTION_PRESETS = ["通用模式", "蓝叠模拟器", "MuMu 模拟器", "雷电模拟器", "应用宝模拟器", "Android 虚拟设备（AVD）", "夜神模拟器", "逍遥模拟器", "PC 端", "WSA 旧版本", "兼容模式", "第二分辨率", "通用模式（屏蔽异常输出）"];
const TOUCH_MODES = ["Minitouch（默认）", "MaaTouch（实验功能）", "ADB Input（不推荐使用）", "MaaFramework（实验功能）"];
const INFRAST_MODES = ["常规模式", "队列轮换", "自定义基建配置"];
const DRONE_OPTIONS = ["不使用无人机", "贸易站-龙门币", "贸易站-合成玉", "制造站-经验书", "制造站-赤金", "制造站-源石碎片", "制造站-芯片组"];
const STAGE_OPTIONS = [
  { label: "当前/上次", value: "CurrentStage" },
  { label: "1-7", value: "1-7" },
  { label: "R8-11", value: "R8-11" },
  { label: "12-17-HARD", value: "12-17-HARD" },
  { label: "龙门币-6/5", value: "CE-6" },
  { label: "红票-5", value: "AP-5" },
  { label: "技能-5", value: "CA-5" },
  { label: "经验-6/5", value: "LS-6" },
  { label: "碳-5", value: "SK-5" },
  { label: "当期剿灭", value: "Annihilation" },
  { label: "切尔诺伯格", value: "Chernobog@Annihilation" },
  { label: "龙门外环", value: "LungmenOutskirts@Annihilation" },
  { label: "龙门市区", value: "LungmenDowntown@Annihilation" },
  { label: "奶/盾芯片", value: "PR-A-1" },
  { label: "奶/盾芯片组", value: "PR-A-2" },
  { label: "术/狙芯片", value: "PR-B-1" },
  { label: "术/狙芯片组", value: "PR-B-2" },
  { label: "先/辅芯片", value: "PR-C-1" },
  { label: "先/辅芯片组", value: "PR-C-2" },
  { label: "近/特芯片", value: "PR-D-1" },
  { label: "近/特芯片组", value: "PR-D-2" }
];
const DROP_OPTIONS = [{ label: "不选择", value: "" }];
const SERIES_OPTIONS = [{ label: "AUTO", value: 0 }, { label: "6", value: 6 }, { label: "5", value: 5 }, { label: "4", value: 4 }, { label: "3", value: 3 }, { label: "2", value: 2 }, { label: "1", value: 1 }, { label: "不切换", value: -1 }];
const MEDICINE_EXPIRE_OPTIONS = ["24h", "48h", "72h", "96h", "120h", "144h", "168h"];
const ROGUELIKE_THEMES = ["傀影", "水月", "萨米", "萨卡兹", "界园"];
const ROGUELIKE_STRATEGIES = ["刷等级，尽可能稳定地打更多层数", "刷源石锭，投资完成后自动退出", "刷开局，刷取热水壶或精二干员开局", "刷月度小队，尽可能稳定地打更多层数", "刷深入调查，尽可能稳定地打更多层数"];
const ROGUELIKE_THEME_STRATEGIES = {
  "萨米": ["刷坍缩范式，遇到非稀有坍缩范式后直接重开"],
  "界园": ["刷常乐节点，第一层进洞，找不到需要的节点就重开"]
};
const ROGUELIKE_COMMON_SQUADS = ["指挥分队", "后勤分队", "突击战术分队", "堡垒战术分队", "远程战术分队", "破坏战术分队", "高规格分队"];
const ROGUELIKE_THEME_SQUADS = {
  "傀影": ["集群分队", "矛头分队", "研究分队"],
  "水月": ["集群分队", "矛头分队", "心胜于物分队", "物尽其用分队", "以人为本分队", "研究分队"],
  "萨米": ["集群分队", "矛头分队", "永恒狩猎分队", "生活至上分队", "科学主义分队", "特训分队"],
  "萨卡兹": ["集群分队", "矛头分队", "魂灵护送分队", "博闻广记分队", "蓝图测绘分队", "因地制宜分队", "异想天开分队", "点刺成锭分队", "拟态学者分队", "专业人士分队"],
  "界园": ["特勤分队", "高台突破分队", "地面突破分队", "游客分队", "司岁台分队", "天师府分队", "花团锦簇分队", "棋行险着分队", "岁影回音分队", "代理人分队", "知学分队", "商贾分队"]
};
const ROGUELIKE_SARKAZ_INVESTMENT_SQUADS = ["集群分队", "矛头分队", "博闻广记分队", "蓝图测绘分队", "点刺成锭分队", "拟态学者分队"];
const ROGUELIKE_BASE_ROLES = ["先手必胜（先锋、狙击、特种）", "稳扎稳打（重装、术师、狙击）", "取长补短（近卫、辅助、医疗）"];
const ROGUELIKE_JIEGARDEN_ROLES = ["灵活部署（先锋、辅助、特种）", "坚不可摧（重装、术师、医疗）"];
const ROGUELIKE_OPERATOR_OPTIONS = {
  "傀影": ["", "维什戴尔", "丰川祥子", "棘刺", "新约能天使", "蕾缪安", "圣聆初雪", "假日威龙陈", "焰影苇草", "乌尔比安", "圣约送葬人", "佩佩", "怒潮凛冬", "百炼嘉维尔", "海沫", "羽毛笔", "休谟斯", "锏", "山", "仇白", "煌", "艾丽妮", "帕拉斯", "风丸", "号角", "斑点", "石棉", "寒芒克洛丝", "克洛丝", "令", "稀音", "安赛尔", "凯尔希", "芬", "提丰", "银灰", "夜半"],
  "水月": ["", "维什戴尔", "百炼嘉维尔", "怒潮凛冬", "海沫", "羽毛笔", "休谟斯", "山", "风丸", "帕拉斯", "幽灵鲨", "归溟幽灵鲨", "令", "稀音", "号角", "新约能天使", "蕾缪安", "圣聆初雪", "丰川祥子", "棘刺", "仇白", "煌", "银灰", "锏", "艾丽妮", "月见夜", "阿米娅-WARRIOR", "寒芒克洛丝", "凯尔希", "安赛尔", "芬", "斑点", "石棉", "坚雷", "阿米娅", "史都华德", "克洛丝", "梓兰", "佩佩", "乌尔比安", "歌蕾蒂娅"],
  "萨米": ["", "维什戴尔", "焰影苇草", "凯尔希", "银灰", "锏", "假日威龙陈", "圣约送葬人", "怒潮凛冬", "百炼嘉维尔", "海沫", "羽毛笔", "休谟斯", "佩佩", "丰川祥子", "山", "仇白", "煌", "艾丽妮", "帕拉斯", "医生", "风丸", "号角", "斑点", "石棉", "新约能天使", "克洛丝", "令", "稀音", "安赛尔", "芬", "圣聆初雪", "林", "蕾缪安", "提丰"],
  "萨卡兹": ["", "维什戴尔", "焰影苇草", "凯尔希", "银灰", "锏", "假日威龙陈", "圣约送葬人", "怒潮凛冬", "百炼嘉维尔", "佩佩", "乌尔比安", "海沫", "丰川祥子", "山", "羽毛笔", "休谟斯", "仇白", "煌", "艾丽妮", "帕拉斯", "医生", "风丸", "号角", "古米", "石棉", "斑点", "新约能天使", "梅", "流星", "克洛丝", "令", "稀音", "苏苏洛", "嘉维尔", "安赛尔", "讯使", "芬", "圣聆初雪", "林", "蕾缪安", "提丰", "铅踝", "白雪", "锡人", "跃跃", "芳汀", "松果"],
  "界园": ["", "维什戴尔", "新约能天使", "电弧", "凯尔希", "银灰", "假日威龙陈", "圣约送葬人", "怒潮凛冬", "百炼嘉维尔", "锏", "佩佩", "乌尔比安", "海沫", "丰川祥子", "山", "羽毛笔", "休谟斯", "仇白", "煌", "艾丽妮", "帕拉斯", "风丸", "斩业星熊", "号角", "古米", "石棉", "斑点", "梅", "流星", "克洛丝", "令", "稀音", "苏苏洛", "嘉维尔", "清流", "安赛尔", "讯使", "芬", "圣聆初雪", "林", "蕾缪安", "提丰", "铅踝", "白雪", "罗小黑", "跃跃", "伊桑", "芳汀", "松果"]
};
const RECLAMATION_THEMES = ["沙中之火", "沙洲遗闻"];
const RECLAMATION_STRATEGIES = ["无存档，通过进出关卡刷生息点数", "有存档，通过组装支援道具刷生息点数"];
const RECLAMATION_INCREMENT_MODES = ["连点", "长按"];
const FIGHT_TOOLTIPS = {
  onceAsNull: "该选项右键选中时仅生效一次",
  once: "该选项仅生效一次",
  drops: "该选项不会自动计算最优关卡",
  series: "• AUTO:\n自动识别关卡最大代理倍率, 保持最大代理倍率且使用理智药后理智不溢出\n\n• 数值 (1~6):\n按设定倍率执行代理\n若当前理智不足完成设定倍率, 则无法进入战斗\n或者战斗次数不足完成设定倍率, 也将无法进入战斗\n\n• 不切换:\n不调整游戏内代理倍率设定",
  customStage: "支持大部分主线关卡名与原列表的关卡名（如4-10、AP-5、H10-1-Hard）\n可在关卡结尾输入 Normal/Hard 表示需要切换标准与磨难难度\n可输入 SSReopen-XX 一次性代理 SS 复刻的普通关"
};

let UI_OPTIONS = null;
const CLIENT_TYPE_ALIASES = {
  "": "Official",
  "官服": "Official",
  "Bilibili": "Bilibili",
  "B服": "Bilibili",
  "Bilibili服": "Bilibili",
  "国际服 (YostarEN)": "YoStarEN",
  "日服 (YostarJP)": "YoStarJP",
  "韩服 (YostarKR)": "YoStarKR",
  "繁中服 (txwy)": "txwy"
};
const STAGE_VALUE_ALIASES = {
  "当前/上次": "CurrentStage",
  "当前": "CurrentStage",
  "上次": "CurrentStage",
  "CE": "CE-6",
  "龙门币": "CE-6",
  "龙门币-6/5": "CE-6",
  "LS": "LS-6",
  "经验": "LS-6",
  "经验-6/5": "LS-6",
  "狗粮": "LS-6",
  "CA": "CA-5",
  "技能": "CA-5",
  "技能-5": "CA-5",
  "AP": "AP-5",
  "红票": "AP-5",
  "红票-5": "AP-5",
  "SK": "SK-5",
  "碳": "SK-5",
  "碳-5": "SK-5",
  "炭": "SK-5",
  "AN": "Annihilation",
  "剿灭": "Annihilation",
  "剿灭模式": "Annihilation",
  "当期剿灭": "Annihilation",
  "Chernobog": "Chernobog@Annihilation",
  "切尔诺伯格": "Chernobog@Annihilation",
  "LungmenOutskirts": "LungmenOutskirts@Annihilation",
  "龙门外环": "LungmenOutskirts@Annihilation",
  "LungmenDowntown": "LungmenDowntown@Annihilation",
  "龙门市区": "LungmenDowntown@Annihilation",
  "奶/盾芯片": "PR-A-1",
  "奶/盾芯片组": "PR-A-2",
  "术/狙芯片": "PR-B-1",
  "术/狙芯片组": "PR-B-2",
  "先/辅芯片": "PR-C-1",
  "先/辅芯片组": "PR-C-2",
  "近/特芯片": "PR-D-1",
  "近/特芯片组": "PR-D-2"
};

function setTaskFormOptions(options) {
  UI_OPTIONS = options && typeof options === "object" ? options : null;
}

function taskCapabilities() {
  const capabilities = UI_OPTIONS?.capabilities;
  return capabilities && typeof capabilities === "object" ? capabilities : null;
}

function taskCapabilityMap() {
  const tasks = taskCapabilities()?.tasks;
  return tasks && typeof tasks === "object" ? tasks : null;
}

function taskDefinition(type, sequence = TASK_TYPES.indexOf(type)) {
  const capability = taskCapabilityMap()?.[type];
  const fallbackSequence = sequence >= 0 ? sequence : TASK_TYPES.length;
  return {
    id: type,
    title: typeof capability?.title === "string" && capability.title ? capability.title : TASK_NAMES[type] || type,
    order: Number.isFinite(Number(capability?.order)) ? Number(capability.order) : fallbackSequence,
    defaultParams: capability?.default_params,
    supportsAdvanced: capability?.supports_advanced,
    enabled: capability?.enabled,
    sequence: fallbackSequence
  };
}

function taskDefinitions() {
  const definitions = TASK_TYPES.map((type, index) => taskDefinition(type, index));
  const tasks = taskCapabilityMap();
  if (tasks) {
    Object.keys(tasks).forEach((type, index) => {
      if (TASK_TYPES.includes(type)) return;
      definitions.push(taskDefinition(type, TASK_TYPES.length + index));
    });
  }
  return definitions
    .filter((definition) => definition.enabled !== false)
    .sort((left, right) => left.order - right.order || left.sequence - right.sequence);
}

function firstTaskType() {
  return taskDefinitions()[0]?.id || "Fight";
}

function supportsVisitAsMallSubtask() {
  return taskCapabilities()?.supports_visit_as_mall_subtask !== false;
}

function cloneObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultTask(type = firstTaskType()) {
  const id = `${type.toLowerCase()}-${Date.now().toString().slice(-5)}`;
  return { id, type, enabled: true, name: taskDefinition(type).title, params: defaultParams(type), strategy: {} };
}

function defaultParams(type) {
  const defaults = builtinDefaultParams(type);
  const capabilityDefaults = taskDefinition(type).defaultParams;
  if (capabilityDefaults && typeof capabilityDefaults === "object") {
    return { ...defaults, ...cloneObject(capabilityDefaults) };
  }
  return defaults;
}

function taskSupportsAdvanced(type) {
  const capability = taskDefinition(type).supportsAdvanced;
  if (typeof capability === "boolean") return capability;
  return !NO_ADVANCED_TASKS.has(type);
}

function builtinDefaultParams(type) {
  if (type === "Fight") return { stage: "CurrentStage", stage_plan: ["CurrentStage"], medicine: 999, stone: 999, times: 5, series: 0, use_alternate_stage: false };
  if (type === "Custom") return { task_names: [] };
  if (type === "StartUp") return { client_type: "Official", start_game_enabled: true, connection: "雷电模拟器", touch_mode: "Minitouch（默认）" };
  if (type === "Recruit") return { auto_expedited: false, refresh: true, confirm_3: true, confirm_4: true, max_times: 99 };
  if (type === "Infrast") return { mode: "常规模式", drone: "贸易站-龙门币", mood: 30, facilities: allFacilities() };
  if (type === "Mall") return { visit_friends: supportsVisitAsMallSubtask(), shopping: true, buy_first: ["招聘许可"], blacklist: ["碳素", "家具零件"] };
  if (type === "Award") return { daily: true, orundum: true };
  if (type === "Roguelike") return { theme: "萨卡兹", difficulty: "MAX (18)", strategy: ROGUELIKE_STRATEGIES[0], squad: "指挥分队", roles: "稳扎稳打（重装、术师、狙击）", starts_count: 99999, investment_enabled: true, delay_abort: true };
  if (type === "Reclamation") return { theme: "沙洲遗闻", strategy: RECLAMATION_STRATEGIES[1], tool_to_craft: "荧光棒", increment_mode: "连点", max_craft_count: 16 };
  if (type === "UserDataUpdate") return { update_oper_box: true, update_depot: true };
  return {};
}

function renderTaskEditor(task, escapeHtmlFn, mode = "general") {
  if (!task) return '<div class="taskEditor empty">请选择一个任务</div>';
  const params = mode === "advanced" ? renderAdvanced(task, escapeHtmlFn) : renderGeneral(task, escapeHtmlFn);
  const common = renderCommonFields(task, escapeHtmlFn);
  const strategy = escapeHtmlFn(formatJson(task.strategy || {}));
  return `${params}${common}<details class="advancedBlock"><summary>策略 JSON</summary><textarea id="taskStrategyInput">${strategy}</textarea></details>`;
}

function renderCommonFields(task, escapeHtmlFn) {
  return `
    <details class="advancedBlock">
      <summary>任务基础</summary>
      <div class="formGrid">
        <label>任务 ID<input id="taskIdInput" value="${escapeHtmlFn(task.id)}" /></label>
        <label>名称<input id="taskNameInput" value="${escapeHtmlFn(task.name || "")}" /></label>
        <label>类型<select id="taskTypeInput">${taskTypeOptions(task.type)}</select></label>
      </div>
    </details>
  `;
}

function renderGeneral(task, escapeHtmlFn) {
  const p = task.params || {};
  if (task.type === "Fight") return renderFightGeneral(p, escapeHtmlFn);
  if (task.type === "Custom") return renderCustomGeneral(p, escapeHtmlFn);
  if (task.type === "StartUp") return renderStartUpGeneral(p, escapeHtmlFn);
  if (task.type === "Recruit") return renderRecruitGeneral(p);
  if (task.type === "Infrast") return renderInfrastGeneral(p, escapeHtmlFn);
  if (task.type === "Mall") return renderMallGeneral(p);
  if (task.type === "Award") return renderAwardGeneral(p);
  if (task.type === "Roguelike") return renderRoguelikeGeneral(p, escapeHtmlFn);
  if (task.type === "Reclamation") return renderReclamationGeneral(p, escapeHtmlFn);
  if (task.type === "UserDataUpdate") return renderUserDataUpdateGeneral(p);
  return renderJsonParams(p, escapeHtmlFn);
}

function renderAdvanced(task, escapeHtmlFn) {
  const p = task.params || {};
  if (task.type === "Fight") return renderFightAdvanced(p, escapeHtmlFn);
  if (task.type === "Custom") return renderJsonParams(p, escapeHtmlFn);
  if (task.type === "Recruit") return renderRecruitAdvanced(p, escapeHtmlFn);
  if (task.type === "Infrast") return renderInfrastAdvanced(p);
  if (task.type === "Mall") return renderMallAdvanced(p, escapeHtmlFn);
  if (task.type === "Roguelike") return renderRoguelikeAdvanced(p);
  if (task.type === "Reclamation") return renderReclamationAdvanced(p, escapeHtmlFn);
  return `<div class="maaParams"><label class="toggleRow mutedCheck"><input type="checkbox" disabled />高级设置</label></div>`;
}

function renderJsonParams(p, escapeHtmlFn) {
  return `<label>参数 JSON<textarea id="taskParamsInput">${escapeHtmlFn(formatJson(p))}</textarea></label>`;
}

function collectTaskEditor(task) {
  task.id = $("taskIdInput").value.trim();
  task.name = $("taskNameInput").value.trim();
  task.type = $("taskTypeInput").value;
  task.params = { ...(task.params || {}), ...collectParams(task.type) };
  syncProfileClientFromStartup(task);
  task.strategy = parseJsonField("taskStrategyInput");
}

function syncProfileClientFromStartup(task) {
  if (task.type !== "StartUp" || typeof state === "undefined" || !state.profile) return;
  const clientType = canonicalClientType(task.params?.client_type);
  state.profile.adb = state.profile.adb || {};
  state.profile.adb.client_type = clientType;
  if (task.params?.touch_mode) state.profile.adb.touch_mode = task.params.touch_mode;
  if (typeof SETTINGS_STATE !== "undefined") SETTINGS_STATE.clientType = clientType;
  if (typeof SETTINGS_STATE !== "undefined" && task.params?.touch_mode) SETTINGS_STATE.touchMode = task.params.touch_mode;
}

function collectParams(type) {
  if (type === "Fight") return collectFightParams();
  if (type === "Custom") return collectCustomParams();
  if (type === "StartUp") return collectStartUpParams();
  if (type === "Recruit") return collectRecruitParams();
  if (type === "Infrast") return collectInfrastParams();
  if (type === "Mall") return collectMallParams();
  if (type === "Award") return collectAwardParams();
  if (type === "Roguelike") return collectRoguelikeParams();
  if (type === "Reclamation") return collectReclamationParams();
  if (type === "UserDataUpdate") return collectUserDataUpdateParams();
  return $("taskParamsInput") ? parseJsonField("taskParamsInput") : {};
}

function parseJsonField(id) {
  const text = $(id).value.trim();
  return text ? JSON.parse(text) : {};
}

function checkNumberRow(id, text, inputId, enabled, value, fallback) {
  return `<div class="paramRow"><label class="checkLabel"><input id="${id}" type="checkbox" ${checked(enabled)} />${text}</label><input id="${inputId}" type="number" min="0" value="${numberValue(value, fallback)}" /></div>`;
}

function checkRow(id, text, value, className = "", disabled = false) {
  const disabledAttr = disabled ? " disabled" : "";
  return `<label class="toggleRow ${className}"><input id="${id}" type="checkbox" ${checked(value)}${disabledAttr} />${text}</label>`;
}

function timeRow(id, value, disabled = false) {
  const [hour, minute] = String(value).split(":");
  const disabledAttr = disabled ? " disabled" : "";
  return `<div class="timeRow"><input id="${id}h" type="number" value="${hour || "09"}"${disabledAttr} /><span>:</span><input id="${id}m" type="number" value="${minute || "00"}"${disabledAttr} /></div>`;
}

function stageSelect(value, index, manual, removable, escapeHtmlFn) {
  const control = manual
    ? `<input class="stagePlanSelect" name="paramStagePlan" value="${escapeHtmlFn(value)}" />`
    : `<select class="stagePlanSelect" name="paramStagePlan">${stageOptions(value, escapeHtmlFn)}</select>`;
  const removeButton = removable
    ? `<button class="stageRemoveButton" type="button" data-stage-action="remove" data-stage-index="${index}" title="删除候选关卡">×</button>`
    : "";
  return `<div class="stagePlanItem ${removable ? "" : "single"}">${control}${removeButton}</div>`;
}

function stageOptions(current, escapeHtmlFn) {
  return selectOptions(stageOptionsList(), normalizeStageValue(current), escapeHtmlFn);
}

function selectOptions(options, current, escapeHtmlFn) {
  const normalized = options.map(normalizeOption);
  const selectedValue = current ?? normalized[0]?.value ?? "";
  const merged = normalized.some((option) => option.value === selectedValue)
    ? normalized
    : [normalizeOption(selectedValue), ...normalized];
  return merged.map(({ label, value }) => {
    const selected = value === selectedValue ? " selected" : "";
    return `<option value="${escapeHtmlFn(value)}"${selected}>${escapeHtmlFn(label)}</option>`;
  }).join("");
}

function hint(text, escapeHtmlFn) {
  const escaped = escapeHtmlFn(text);
  return `<span class="hint" title="${escaped}" data-tip="${escaped}" aria-label="${escaped}" tabindex="0">?</span>`;
}

function normalizeOption(option) {
  if (option && typeof option === "object") {
    return { label: String(option.label ?? option.display ?? option.value ?? ""), value: String(option.value ?? option.label ?? option.display ?? "") };
  }
  return { label: String(option ?? ""), value: String(option ?? "") };
}

function stagePlanOf(params) {
  const plan = Array.isArray(params.stage_plan) ? params.stage_plan : [params.stage || "CurrentStage"];
  const normalized = plan.map((stage) => normalizeStageValue(stage)).filter(Boolean);
  if (params.use_alternate_stage === false) {
    return [normalized[0] || "CurrentStage"];
  }
  return normalized.length ? normalized : ["CurrentStage"];
}

function stageOptionsList() {
  return dynamicOptions("stages", STAGE_OPTIONS);
}

function dropOptions() {
  return dynamicOptions("drops", DROP_OPTIONS);
}

function dynamicOptions(key, fallback) {
  const values = activeClientOptions()?.[key] || UI_OPTIONS?.[key];
  return Array.isArray(values) && values.length ? values : fallback;
}

function activeClientOptions() {
  const byClient = UI_OPTIONS?.by_client;
  if (!byClient || typeof byClient !== "object") return null;
  const active = activeClientType();
  const fallback = UI_OPTIONS?.resource?.default_client || "Official";
  return byClient[active] || byClient[fallback] || byClient.Official || null;
}

function activeClientType() {
  const profile = typeof state !== "undefined" ? state.profile : null;
  const startupClient = profile?.tasks?.find((task) => task.type === "StartUp")?.params?.client_type;
  const profileClient = profile?.adb?.client_type;
  return canonicalClientType(startupClient || profileClient || UI_OPTIONS?.resource?.default_client || "Official");
}

function canonicalClientType(value) {
  const text = String(value ?? "");
  return CLIENT_TYPE_ALIASES[text] || text || "Official";
}

function clientTypeOptionsList() {
  const clients = UI_OPTIONS?.resource?.clients;
  return Array.isArray(clients) && clients.length ? clients : STARTUP_CLIENT_TYPES;
}

function normalizeStageValue(value) {
  const text = String(value || "CurrentStage");
  return normalizeOptionValue(STAGE_VALUE_ALIASES[text] || text, stageOptionsList());
}

function normalizeDropValue(value) {
  const text = String(value || "");
  if (text === "不选择") return "";
  return normalizeOptionValue(text, dropOptions());
}

function normalizeOptionValue(value, options) {
  const text = String(value ?? "");
  const normalized = options.map(normalizeOption);
  const option = normalized.find((item) => item.value === text || item.label === text);
  return option ? option.value : text;
}

function escapeHtmlFallback(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function taskTypeOptions(current) {
  const definitions = taskDefinitions();
  const options = current && !definitions.some((definition) => definition.id === current)
    ? [taskDefinition(current), ...definitions]
    : definitions;
  return options.map((definition) => {
    const selected = definition.id === current ? " selected" : "";
    return `<option value="${escapeHtmlFallback(definition.id)}"${selected}>${escapeHtmlFallback(definition.title)}</option>`;
  }).join("");
}

function seriesOptions(current, escapeHtmlFn) {
  return SERIES_OPTIONS.map((option) => {
    const selected = Number(current ?? 0) === option.value ? " selected" : "";
    return `<option value="${option.value}"${selected}>${escapeHtmlFn(option.label)}</option>`;
  }).join("");
}

function allFacilities() {
  return ["制造站", "贸易站", "控制中枢", "发电站", "会客室", "办公室", "宿舍", "加工站", "训练室"];
}

function checked(value) {
  return value ? "checked" : "";
}

function numberValue(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function numberInput(id, fallback) {
  const element = $(id);
  if (!element) return fallback;
  const value = Number(element.value);
  return Number.isFinite(value) ? value : fallback;
}

function boolOf(id) {
  const element = $(id);
  return element ? element.checked : false;
}

function valueOf(id, fallback) {
  const element = $(id);
  return element ? element.value.trim() : fallback;
}

function valuesByName(name) {
  return [...document.querySelectorAll(`[name="${name}"]`)].map((item) => item.value);
}

function listOf(id) {
  const text = valueOf(id, "");
  return text.split(/[;,；，]/).map((item) => item.trim()).filter(Boolean);
}

function addBool(target, key, id) {
  if ($(id)) target[key] = boolOf(id);
}

function addNumber(target, key, id, fallback) {
  if ($(id)) target[key] = numberInput(id, fallback);
}

function addValue(target, key, id, fallback) {
  if ($(id)) target[key] = valueOf(id, fallback);
}

function addList(target, key, id) {
  if ($(id)) target[key] = listOf(id);
}

function addTime(target, key, id) {
  const hour = $(`${id}h`);
  const minute = $(`${id}m`);
  if (!hour || !minute) return;
  target[key] = `${hour.value.padStart(2, "0")}:${minute.value.padStart(2, "0")}`;
}

function formatJson(value) {
  return JSON.stringify(value || {}, null, 2);
}

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
const RECLAMATION_THEMES = ["沙中之火（活动未开放）", "沙洲遗闻"];
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

function renderTaskEditor(task, escapeHtml, mode = "general") {
  if (!task) return '<div class="taskEditor empty">请选择一个任务</div>';
  const params = mode === "advanced" ? renderAdvanced(task, escapeHtml) : renderGeneral(task, escapeHtml);
  const common = renderCommonFields(task, escapeHtml);
  const strategy = escapeHtml(formatJson(task.strategy || {}));
  return `${params}${common}<details class="advancedBlock"><summary>策略 JSON</summary><textarea id="taskStrategyInput">${strategy}</textarea></details>`;
}

function renderCommonFields(task, escapeHtml) {
  return `
    <details class="advancedBlock">
      <summary>任务基础</summary>
      <div class="formGrid">
        <label>任务 ID<input id="taskIdInput" value="${escapeHtml(task.id)}" /></label>
        <label>名称<input id="taskNameInput" value="${escapeHtml(task.name || "")}" /></label>
        <label>类型<select id="taskTypeInput">${taskTypeOptions(task.type)}</select></label>
      </div>
    </details>
  `;
}

function renderGeneral(task, escapeHtml) {
  const p = task.params || {};
  if (task.type === "Fight") return renderFightGeneral(p, escapeHtml);
  if (task.type === "Custom") return renderCustomGeneral(p, escapeHtml);
  if (task.type === "StartUp") return renderStartUpGeneral(p, escapeHtml);
  if (task.type === "Recruit") return renderRecruitGeneral(p);
  if (task.type === "Infrast") return renderInfrastGeneral(p, escapeHtml);
  if (task.type === "Mall") return renderMallGeneral(p);
  if (task.type === "Award") return renderAwardGeneral(p);
  if (task.type === "Roguelike") return renderRoguelikeGeneral(p, escapeHtml);
  if (task.type === "Reclamation") return renderReclamationGeneral(p, escapeHtml);
  if (task.type === "UserDataUpdate") return renderUserDataUpdateGeneral(p);
  return renderJsonParams(p, escapeHtml);
}

function renderAdvanced(task, escapeHtml) {
  const p = task.params || {};
  if (task.type === "Fight") return renderFightAdvanced(p, escapeHtml);
  if (task.type === "Custom") return renderJsonParams(p, escapeHtml);
  if (task.type === "Recruit") return renderRecruitAdvanced(p, escapeHtml);
  if (task.type === "Infrast") return renderInfrastAdvanced(p);
  if (task.type === "Mall") return renderMallAdvanced(p, escapeHtml);
  if (task.type === "Roguelike") return renderRoguelikeAdvanced(p);
  if (task.type === "Reclamation") return renderReclamationAdvanced(p, escapeHtml);
  return `<div class="maaParams"><label class="toggleRow mutedCheck"><input type="checkbox" disabled />高级设置</label></div>`;
}

function renderFightGeneral(p, escapeHtml) {
  const stagePlan = stagePlanOf(p);
  const useAlternate = p.use_alternate_stage === true || stagePlan.length > 1;
  const addButton = '<button class="addStageButton" type="button" data-stage-action="add">添加候选</button>';
  return `
    <div class="maaParams fightForm">
      ${checkNumberRow("use_medicine", `使用药剂${hint(FIGHT_TOOLTIPS.onceAsNull, escapeHtml)}`, "paramMedicine", p.use_medicine, p.medicine, 999)}
      ${checkNumberRow("use_stone", `使用源石*${hint(FIGHT_TOOLTIPS.once, escapeHtml)}`, "paramStone", p.use_stone, p.stone, 999)}
      ${checkNumberRow("has_times_limited", `指定次数${hint(FIGHT_TOOLTIPS.onceAsNull, escapeHtml)}`, "paramTimes", p.has_times_limited, p.times, 6)}
      <div class="paramRow"><label class="checkLabel"><input id="paramUseDrops" type="checkbox" ${checked(p.use_drops)} />指定材料${hint(FIGHT_TOOLTIPS.drops, escapeHtml)}</label><select id="paramDrops">${selectOptions(dropOptions(), normalizeDropValue(p.drop), escapeHtml)}</select><input id="paramDropCount" type="number" min="1" max="999" class="shortInput" value="${p.drop_count ?? 1}" /></div>
      <div class="paramRow"><span>代理倍率${hint(FIGHT_TOOLTIPS.series, escapeHtml)}</span><select id="paramSeries">${seriesOptions(p.series, escapeHtml)}</select></div>
      <div class="stageBlock">
        <div class="stageLabel"><span>${useAlternate ? "候选关卡" : "关卡指定"}</span>${addButton}</div>
        <div class="stagePlanList ${useAlternate ? "bordered" : ""}">
          ${stagePlan.map((stage, index) => stageSelect(stage, index, p.custom_stage_code, stagePlan.length > 1, escapeHtml)).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderFightAdvanced(p, escapeHtml) {
  return `
    <div class="maaParams wideForm">
      ${checkRow("custom_annihilation", "自定义剿灭关卡", p.custom_annihilation)}
      ${checkRow("dr_grandet", "饿朗台模式", p.dr_grandet)}
      ${checkRow("use_expiring_medicine", "无限吃 N 小时内过期的理智药", p.use_expiring_medicine ?? true)}
      <div class="subLine">└ <select id="paramMedicineExpireHours">${selectOptions(MEDICINE_EXPIRE_OPTIONS, p.medicine_expire_hours || "48h", escapeHtml)}</select></div>
      ${checkRow("use_activity_expire", "活动结束前 48H 吃当周过期理智药", p.use_activity_expire)}
      <div class="subLine disabled">└ 暂无活动</div>
      ${checkRow("hide_series", "隐藏代理倍率", p.hide_series)}
      ${checkRow("allow_stone_save", "允许使用源石保存状态", p.allow_stone_save)}
      ${checkRow("report_to_penguin", "上报 PenguinStats 掉落数据", p.report_to_penguin)}
      <div class="subLine"><span>企鹅物流 ID（留空自动）</span><input id="paramPenguinId" class="wideInput" value="${escapeHtml(p.penguin_id || "")}" /></div>
      ${checkRow("custom_stage_code", `手动输入关卡名${hint(FIGHT_TOOLTIPS.customStage, escapeHtml)}`, p.custom_stage_code)}
      <span>过期关卡重置为</span><select id="paramStageReset">${selectOptions([{ label: "当前/上次", value: "CurrentStage" }, "不切换"], normalizeStageValue(p.stage_reset), escapeHtml)}</select>
      ${checkRow("use_alternate_stage", "使用备选关卡", p.use_alternate_stage ?? true)}
      ${checkRow("hide_unavailable_stage", "下拉框中隐藏当日不开关卡", p.hide_unavailable_stage)}
      ${checkRow("weekly_schedule", "启用周计划", p.weekly_schedule)}
      <strong class="sectionTitle">以下选项为多任务共用</strong>
      ${checkRow("auto_restart", "游戏掉线时自动重连", p.auto_restart ?? true)}
      ${checkRow("use_remaining_sanity_stage", "使用剩余理智执行指定关卡", p.use_remaining_sanity_stage)}
      <div class="subLine"><span>剩余理智关卡</span><input class="wideInput" id="paramRemainingSanityStage" placeholder="留空则同正常关卡" value="${escapeHtml(p.remaining_sanity_stage || "")}" /></div>
    </div>
  `;
}

function renderStartUpGeneral(p, escapeHtml) {
  return `
    <div class="maaParams wideForm">
      <span>账号切换${hint("需要切换至的账号，留空以禁用。输入登录界面显示的内容，如 123****4567，可输入 123****4567、4567 或 23****45。仅支持官服、B服，不支持登录账号。", escapeHtml)}</span><div><input id="paramAccount" class="accountInput" value="${escapeHtml(p.account || "")}" /><button disabled>立即切换</button></div>
      <strong class="sectionTitle">以下选项为多任务共用</strong>
      ${checkRow("start_game_enabled", "是否启动客户端", p.start_game_enabled ?? true)}
      <span>客户端类型</span><select id="paramClientType">${selectOptions(clientTypeOptionsList(), canonicalClientType(p.client_type), escapeHtml)}</select>
      ${checkRow("auto_detect", `自动检测连接${hint("每次检测完成后会自动取消勾选，如需重新检测可再次勾选。仅当端口经常发生变化时，才需要勾选「每次重新检测」。检测时请确保只开启需要连接的模拟器。", escapeHtml)}`, p.auto_detect ?? true)}
      ${checkRow("detect_every_time", `每次重新检测${hint("不推荐勾选此选项。仅当端口经常发生变化且确认只运行单个模拟器时才建议勾选。", escapeHtml)}`, p.detect_every_time ?? true, "redText")}
      <span>连接配置</span><select id="paramConnection">${selectOptions(CONNECTION_PRESETS, p.connection || "雷电模拟器", escapeHtml)}</select>
      <span>触控模式</span><select id="paramTouchMode">${selectOptions(TOUCH_MODES, p.touch_mode, escapeHtml)}</select>
    </div>
  `;
}

function renderRecruitGeneral(p) {
  return `
    <div class="maaParams wideForm">
      ${checkRow("auto_expedited", "自动使用加急许可*", p.auto_expedited)}
      <span>每次执行时最大招募次数</span><input id="paramRecruitTimes" type="number" value="${numberValue(p.max_times, 99)}" />
    </div>
  `;
}

function renderRecruitAdvanced(p, escapeHtml) {
  return `
    <div class="maaParams wideForm">
      <span>公招多选 Tag 的策略</span>
      <select id="paramRecruitStrategy">
        <option value="0" ${(p.extra_tags_mode ?? 0) == 0 ? "selected" : ""}>默认（不选择额外 Tag）</option>
        <option value="1" ${p.extra_tags_mode == 1 ? "selected" : ""}>优先合成玉（自动选含合成玉 Tag 组合）</option>
        <option value="2" ${p.extra_tags_mode == 2 ? "selected" : ""}>全选满足条件的组合</option>
      </select>
      <span>高星 Tag 首选（分号分隔）</span>
      <input class="wideInput" id="paramExtraTags" value="${escapeHtml(p.extra_tags || "")}" />
      <span>最大加急次数（0 表示不限制）</span><input id="paramExpediteTimes" type="number" min="0" value="${numberValue(p.expedite_times, 0)}" />
      ${checkRow("refresh", "自动刷新 3 星 Tags", p.refresh ?? true)}
      ${checkRow("skip_robot", "无招聘许可时继续尝试刷新 Tags", p.skip_robot ?? true)}
      ${checkRow("reserve_level_1", "保留 1 星词条并跳过该栏位", p.reserve_level_1 ?? true)}
      ${checkRow("confirm_3", "自动确认 3 星", p.confirm_3 ?? true)}
      ${timeRow("time3", p.time3 || "09:00")}
      ${checkRow("confirm_4", "自动确认 4 星", p.confirm_4 ?? true)}
      ${timeRow("time4", p.time4 || "09:00")}
      ${checkRow("confirm_5", "自动确认 5 星", p.confirm_5)}
      ${timeRow("time5", p.time5 || "09:00", true)}
      ${checkRow("confirm_6", "自动确认 6 星", p.confirm_6, "mutedCheck", true)}
    </div>
  `;
}

function renderInfrastGeneral(p, escapeHtml = escapeHtmlFallback) {
  const facilities = p.facilities || allFacilities();
  return `
    <div class="maaParams wideForm infrastForm">
      <span>基建模式</span><select id="paramInfrastMode">${selectOptions(INFRAST_MODES, p.mode || "常规模式", escapeHtml)}</select>
      <span>无人机用途</span><select id="paramDrone">${selectOptions(DRONE_OPTIONS, p.drone || "贸易站-龙门币", escapeHtml)}</select>
      <span class="centerText">基建工作心情阈值: ${numberValue(p.mood, 30)}% ${hint("若启用自定义换班，该字段仅针对 autofill 和使用干员编组的房间有效", escapeHtml)}</span>
      <input id="paramMood" type="range" min="0" max="100" value="${numberValue(p.mood, 30)}" />
      <div class="facilityBox">${allFacilities().map((name) => checkRow(`facility-${name}`, name, facilities.includes(name))).join("")}</div>
      <div class="twoButtons"><button type="button" data-facility-action="all">全选</button><button type="button" data-facility-action="none">清空</button></div>
    </div>
  `;
}

function renderInfrastAdvanced(p) {
  const customVisible = p.mode === "自定义基建配置" || Number(p.mode) === 10000;
  const rotationVisible = p.mode === "队列轮换" || Number(p.mode) === 20000;
  return `
    <div class="maaParams wideForm">
      ${customVisible ? '<span>自定义基建文件</span><input class="wideInput" id="paramInfrastFilename" value="' + escapeHtmlFallback(p.filename || p.custom_infrast_file || "") + '" />' : ""}
      ${customVisible ? '<span>Plan Index</span><input id="paramInfrastPlanIndex" type="number" min="0" value="' + numberValue(p.plan_index, 0) + '" />' : ""}
      ${rotationVisible ? '<span>轮换计划</span><input class="wideInput" id="paramInfrastRotation" value="' + escapeHtmlFallback(p.rotation || "") + '" />' : ""}
      ${checkRow("dorm_trust", "宿舍空余位置蹭信赖", p.dorm_trust)}
      ${checkRow("skip_entered", "不将已进驻的干员放入宿舍", p.skip_entered ?? true)}
      ${checkRow("stone_fragment", "源石碎片自动补货", p.stone_fragment ?? true)}
      ${checkRow("collect_credit", "会客室信息板收取信用", p.collect_credit ?? true)}
      ${checkRow("clue_exchange", "进行线索交流", p.clue_exchange ?? true)}
      ${checkRow("send_clue", "赠送线索", p.send_clue ?? true)}
      ${checkRow("continue_training", "训练完成后继续尝试专精当前技能", p.continue_training)}
    </div>
  `;
}

function renderMallGeneral(p) {
  return `
    <div class="maaParams wideForm">
      ${checkRow("visit_friends", "访问好友", p.visit_friends ?? true)}
      <div class="subLine">└ <label class="inlineCheck"><input id="paramVisitOnce" type="checkbox" ${checked(p.visit_once)} />一日只执行一次</label></div>
      ${checkRow("credit_fight", "借助战打 OF-1 赚信用", p.credit_fight)}
      ${checkRow("shopping", "信用交易所自动购物", p.shopping ?? true)}
      <span>以下功能需在基建换班中设置并执行</span>
      <div class="readonlyList"><p>会客室信息板收取信用</p><p>进行线索交流</p><p>赠送线索</p></div>
    </div>
  `;
}

function renderMallAdvanced(p, escapeHtml) {
  return `
    <div class="maaParams wideForm">
      <span>优先购买 子串即可 分号分隔</span><input class="wideInput" id="paramBuyFirst" value="${escapeHtml((p.buy_first || []).join(";"))}" />
      <span>黑名单 子串即可 分号分隔</span><input class="wideInput" id="paramBlacklist" value="${escapeHtml((p.blacklist || []).join(";"))}" />
      <span>信用战斗编队号</span><input id="paramMallFormation" type="number" min="0" value="${numberValue(p.formation_index, 0)}" />
      ${checkRow("credit_fight_once", "信用战斗一日只执行一次", p.credit_fight_once)}
      ${checkRow("overflow_blacklist", "信用溢出时无视黑名单", p.overflow_blacklist)}
      ${checkRow("discount_only", "只购买打折的信用商品", p.discount_only)}
      ${checkRow("stop_if_low", "信用点低于 300 时停止购买商品", p.stop_if_low)}
    </div>
  `;
}

function renderAwardGeneral(p) {
  return `
    <div class="maaParams wideForm">
      ${checkRow("daily", "领取每日/每周任务奖励", p.daily ?? true)}
      ${checkRow("mail", "领取所有邮件奖励", p.mail)}
      ${checkRow("free_gacha", `进行限定池赠送的每日免费单抽${hint("若不存在免费单抽，则不会抽取", escapeHtmlFallback)}`, p.free_gacha)}
      ${checkRow("orundum", "领取幸运墙的每日合成玉奖励", p.orundum ?? true)}
      ${checkRow("limited_orundum", "领取限时开采许可的每日合成玉奖励", p.limited_orundum)}
      ${checkRow("monthly_card", "领取周年赠送月卡奖励", p.monthly_card)}
    </div>
  `;
}

function renderCustomGeneral(p, escapeHtml) {
  const names = Array.isArray(p.task_names) ? p.task_names.join(";") : String(p.task_names || p.custom_tasks || "");
  const missing = !names.trim();
  return `
    <div class="maaParams wideForm">
      <span>任务名列表${missing ? ' <span class="paramRequiredHint">（必填，否则运行时报错）</span>' : ""}</span>
      <input class="wideInput${missing ? " paramRequired" : ""}" id="paramCustomTaskNames" value="${escapeHtml(names)}" placeholder="GachaOnce;MiniGame@PV" />
      <p class="formNote">多个任务名以英文分号分隔，例：GachaOnce;GachaTenTimes。Custom 会直接按 task_names 执行 MaaCore 内置任务。</p>
    </div>
  `;
}

function renderRoguelikeGeneral(p, escapeHtml) {
  const normalized = normalizeRoguelikeParams({ ...p });
  return `
    <div class="maaParams wideForm">
      <span>肉鸽主题</span><select id="paramRoguelikeTheme">${selectOptions(ROGUELIKE_THEMES, normalized.theme, escapeHtml)}</select>
      <span>难度</span><select id="paramRoguelikeDifficulty">${selectOptions(roguelikeDifficultyOptions(normalized.theme), normalized.difficulty, escapeHtml)}</select>
      <span>策略</span><select id="paramRoguelikeStrategy">${selectOptions(roguelikeStrategyOptions(normalized.theme), normalized.strategy, escapeHtml)}</select>
      <span>开局分队</span><select id="paramRoguelikeSquad">${selectOptions(roguelikeSquadOptions(normalized.theme, normalized.strategy), normalized.squad, escapeHtml)}</select>
      <span>开局职业组</span><select id="paramRoguelikeRoles">${selectOptions(roguelikeRoleOptions(normalized.theme), normalized.roles, escapeHtml)}</select>
      <span>开局干员${hint("不填写则使用默认策略。", escapeHtml)}</span><select id="paramRoguelikeOperator">${selectOptions(roguelikeOperatorOptions(normalized.theme), normalized.operator, escapeHtml)}</select>
    </div>
  `;
}

function renderRoguelikeAdvanced(p) {
  const theme = ROGUELIKE_THEMES.includes(p.theme) ? p.theme : "萨卡兹";
  const isMizuki = theme === "水月";
  const isSami = theme === "萨米";
  const isSarkaz = theme === "萨卡兹";
  const seedValue = escapeHtmlFallback(p.seed || "");
  const foldartalsValue = escapeHtmlFallback(
    Array.isArray(p.first_floor_foldartals) ? p.first_floor_foldartals.join(",") : (p.first_floor_foldartals || "")
  );
  const collapsal = escapeHtmlFallback(
    Array.isArray(p.expected_collapsal_paradigms) ? p.expected_collapsal_paradigms.join(",") : (p.expected_collapsal_paradigms || "")
  );
  return `
    <div class="maaParams wideForm roguelikeAdvanced">
      <span>开始探索 N 次后停止任务</span><input id="paramRoguelikeStarts" type="number" min="0" max="99999" value="${numberValue(p.starts_count, 99999)}" />
      ${checkRow("investment_enabled", "投资源石锭", p.investment_enabled ?? true)}
      <span>最大投资次数${hint("0 = 不限制", escapeHtmlFallback)}</span><input id="paramRoguelikeInvestCount" type="number" min="0" max="99999" value="${numberValue(p.investments_count, 0)}" />
      ${checkRow("stop_when_investment_full", "投资满后停止探索", p.stop_when_investment_full)}
      ${checkRow("investment_with_more_score", `投资后顺带购物${hint("仅刷源石锭策略有效", escapeHtmlFallback)}`, p.investment_with_more_score ?? p.invest_with_more_score)}
      ${checkRow("use_support_unit", `「开局干员」使用助战${hint("需先填写「开局干员」", escapeHtmlFallback)}`, p.use_support_unit, "mutedCheck", true)}
      ${checkRow("use_nonfriend_support", "允许使用非好友助战", p.use_nonfriend_support)}
      ${checkRow("stop_at_final_boss", "在第五层 BOSS 前暂停", p.stop_at_final_boss)}
      ${checkRow("stop_at_max_level", "满级后自动停止", p.stop_at_max_level)}
      ${checkRow("start_with_seed", "使用指定种子开局", p.start_with_seed)}
      <span>种子${hint("填写后「使用指定种子开局」自动启用", escapeHtmlFallback)}</span><input id="paramRoguelikeSeed" value="${seedValue}" placeholder="留空则不指定" />
      ${isMizuki ? checkRow("refresh_trader_with_dice", "水月：用骰子刷新商店", p.refresh_trader_with_dice) : ""}
      ${isSami ? `${checkRow("first_floor_foldartal", "萨米：第一层使用远见密文板", p.first_floor_foldartal)}
      <span>萨米：生活队开局密文板${hint("逗号分隔，如：风声,感知,知识", escapeHtmlFallback)}</span><input id="paramRoguelikeFoldartals" value="${foldartalsValue}" placeholder="留空则不指定" />` : ""}
      ${isSarkaz ? `<span>萨卡兹：期望坍缩范式${hint("逗号分隔，留空则不筛选", escapeHtmlFallback)}</span><input id="paramRoguelikeCollapsal" value="${collapsal}" placeholder="如：深化坚守,领域" />` : ""}
      ${checkRow("start_with_elite_two", "凹精二直升开局", p.start_with_elite_two)}
      ${p.start_with_elite_two ? checkRow("only_start_with_elite_two", "仅凹精二直升（不满足则重开）", p.only_start_with_elite_two) : ""}
      <strong class="sectionTitle">以下选项为多任务共用</strong>
      ${checkRow("delay_abort", "自动肉鸽在战斗结束前延迟「停止」动作", p.delay_abort ?? true)}
    </div>
  `;
}

function renderReclamationGeneral(p, escapeHtml) {
  return `
    <div class="maaParams wideForm">
      <span>生息演算主题</span><select id="paramReclamationTheme">${selectOptions(RECLAMATION_THEMES, p.theme || "沙洲遗闻", escapeHtml)}</select>
      <span>策略</span><select id="paramReclamationStrategy">${selectOptions(RECLAMATION_STRATEGIES, p.strategy || RECLAMATION_STRATEGIES[1], escapeHtml)}</select>
      <div class="reclamationText scrollBox">
        <p>目前生息演算的支持仍处于中期阶段，使用时请注意以下几点：</p>
        <p>通过开局刷点数：（小心已有存档被删除）</p>
        <p>1. 点数刷满后会输出「任务完成」，自动停止任务</p>
        <p>2. 不要在生息演算的编队中有干员的情况下使用</p>
        <p>3. 手动确认存档情况并删除，以免 MAA 删除你的珍贵存档</p>
        <p>4. 导航还没写，不能从生息演算以外的位置开始任务</p>
        <p>5. 如果任务过程中报错、点数没刷满就任务完成，请前往 GitHub 提交 issue</p>
        <p>有存档通过制造刷点数（高级设置）：</p>
        <p>1. 要求是结算后的第一天，且后续三天没有敌袭进入驻扎地</p>
        <p>2. 必须在进入大地图后的界面开始（能看到驻扎地的界面）</p>
        <p>3. 如果能制造的数量刚好是 99 的倍数会卡住，在存档前可以先用掉一点，这个之后再修</p>
      </div>
    </div>
  `;
}

function renderReclamationAdvanced(p, escapeHtml) {
  const archiveMode = (p.strategy || RECLAMATION_STRATEGIES[1]) === RECLAMATION_STRATEGIES[1];
  const disabled = archiveMode ? "" : " disabled";
  return `
    <div class="maaParams wideForm">
      <span>支援道具名称</span><input id="paramReclamationTool" value="${escapeHtml(p.tool_to_craft || "荧光棒")}"${disabled} />
      <span>增加方式</span><select id="paramReclamationIncrement"${disabled}>${selectOptions(RECLAMATION_INCREMENT_MODES, p.increment_mode || "连点", escapeHtml)}</select>
      <span>单次最大组装轮数</span><input id="paramReclamationCraftCount" type="number" min="0" value="${numberValue(p.max_craft_count, 16)}"${disabled} />
      ${archiveMode ? "" : checkRow("clear_store", "任务完成后购买商店", p.clear_store)}
    </div>
  `;
}

function renderUserDataUpdateGeneral(p) {
  return `
    <div class="maaParams wideForm">
      ${checkRow("update_oper_box", "更新干员箱数据", p.update_oper_box ?? true)}
      ${checkRow("update_depot", "更新仓库数据", p.update_depot ?? true)}
    </div>
  `;
}

function collectUserDataUpdateParams() {
  const params = {};
  addBool(params, "update_oper_box", "update_oper_box");
  addBool(params, "update_depot", "update_depot");
  return params;
}

function renderJsonParams(p, escapeHtml) {
  return `<label>参数 JSON<textarea id="taskParamsInput">${escapeHtml(formatJson(p))}</textarea></label>`;
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

function collectFightParams() {
  const params = {};
  addNumber(params, "medicine", "paramMedicine", 999);
  addNumber(params, "stone", "paramStone", 999);
  addNumber(params, "times", "paramTimes", 6);
  addNumber(params, "series", "paramSeries", 1);
  addBool(params, "use_medicine", "use_medicine");
  addBool(params, "use_stone", "use_stone");
  addBool(params, "has_times_limited", "has_times_limited");
  addBool(params, "use_drops", "paramUseDrops");
  addValue(params, "drop", "paramDrops", "");
  addNumber(params, "drop_count", "paramDropCount", 1);
  const stagePlan = valuesByName("paramStagePlan")
    .map((stage) => normalizeStageValue(stage.trim()))
    .filter(Boolean);
  if (stagePlan.length) {
    params.stage_plan = stagePlan;
    params.stage = stagePlan[0] || "CurrentStage";
  }

  addBool(params, "custom_annihilation", "custom_annihilation");
  addBool(params, "dr_grandet", "dr_grandet");
  addBool(params, "use_expiring_medicine", "use_expiring_medicine");
  addValue(params, "medicine_expire_hours", "paramMedicineExpireHours", "48h");
  addBool(params, "use_activity_expire", "use_activity_expire");
  addBool(params, "hide_series", "hide_series");
  addBool(params, "allow_stone_save", "allow_stone_save");
  addBool(params, "report_to_penguin", "report_to_penguin");
  addValue(params, "penguin_id", "paramPenguinId", "");
  addBool(params, "custom_stage_code", "custom_stage_code");
  addValue(params, "stage_reset", "paramStageReset", "CurrentStage");
  addBool(params, "use_alternate_stage", "use_alternate_stage");
  addBool(params, "hide_unavailable_stage", "hide_unavailable_stage");
  addBool(params, "weekly_schedule", "weekly_schedule");
  addBool(params, "auto_restart", "auto_restart");
  addBool(params, "use_remaining_sanity_stage", "use_remaining_sanity_stage");
  addValue(params, "remaining_sanity_stage", "paramRemainingSanityStage", "");
  return params;
}

function collectStartUpParams() {
  const params = {};
  addValue(params, "account", "paramAccount", "");
  addValue(params, "client_type", "paramClientType", "Official");
  addValue(params, "connection", "paramConnection", "雷电模拟器");
  addValue(params, "touch_mode", "paramTouchMode", "Minitouch（默认）");
  addBool(params, "start_game_enabled", "start_game_enabled");
  addBool(params, "auto_detect", "auto_detect");
  addBool(params, "detect_every_time", "detect_every_time");
  return params;
}

function collectRecruitParams() {
  const params = {};
  addBool(params, "auto_expedited", "auto_expedited");
  addNumber(params, "max_times", "paramRecruitTimes", 99);
  addNumber(params, "extra_tags_mode", "paramRecruitStrategy", 0);
  addValue(params, "extra_tags", "paramExtraTags", "");
  addNumber(params, "expedite_times", "paramExpediteTimes", 0);
  addBool(params, "refresh", "refresh");
  addBool(params, "skip_robot", "skip_robot");
  addBool(params, "reserve_level_1", "reserve_level_1");
  addBool(params, "confirm_3", "confirm_3");
  addTime(params, "time3", "time3");
  addBool(params, "confirm_4", "confirm_4");
  addTime(params, "time4", "time4");
  addBool(params, "confirm_5", "confirm_5");
  addTime(params, "time5", "time5");
  addBool(params, "confirm_6", "confirm_6");
  return params;
}

function collectInfrastParams() {
  const params = {};
  addValue(params, "mode", "paramInfrastMode", "常规模式");
  addValue(params, "drone", "paramDrone", "贸易站-龙门币");
  addNumber(params, "mood", "paramMood", 30);
  if ($("facility-制造站")) {
    params.facilities = allFacilities().filter((name) => boolOf(`facility-${name}`));
  }
  addBool(params, "dorm_trust", "dorm_trust");
  addBool(params, "skip_entered", "skip_entered");
  addBool(params, "stone_fragment", "stone_fragment");
  addBool(params, "collect_credit", "collect_credit");
  addBool(params, "clue_exchange", "clue_exchange");
  addBool(params, "send_clue", "send_clue");
  addBool(params, "continue_training", "continue_training");
  addValue(params, "filename", "paramInfrastFilename", "");
  addNumber(params, "plan_index", "paramInfrastPlanIndex", 0);
  addValue(params, "rotation", "paramInfrastRotation", "");
  return params;
}

function collectMallParams() {
  const params = {};
  addBool(params, "visit_friends", "visit_friends");
  addBool(params, "visit_once", "paramVisitOnce");
  addBool(params, "credit_fight", "credit_fight");
  addBool(params, "credit_fight_once", "credit_fight_once");
  addNumber(params, "formation_index", "paramMallFormation", 0);
  addBool(params, "shopping", "shopping");
  addList(params, "buy_first", "paramBuyFirst");
  addList(params, "blacklist", "paramBlacklist");
  addBool(params, "overflow_blacklist", "overflow_blacklist");
  addBool(params, "discount_only", "discount_only");
  addBool(params, "stop_if_low", "stop_if_low");
  return params;
}

function collectAwardParams() {
  const params = {};
  addBool(params, "daily", "daily");
  addBool(params, "mail", "mail");
  addBool(params, "free_gacha", "free_gacha");
  addBool(params, "orundum", "orundum");
  addBool(params, "limited_orundum", "limited_orundum");
  addBool(params, "monthly_card", "monthly_card");
  return params;
}

function collectCustomParams() {
  const params = {};
  addList(params, "task_names", "paramCustomTaskNames");
  return params;
}

function collectRoguelikeParams() {
  const params = {};
  const hasGeneralFields = Boolean($("paramRoguelikeTheme"));
  addValue(params, "theme", "paramRoguelikeTheme", "萨卡兹");
  addValue(params, "difficulty", "paramRoguelikeDifficulty", "MAX (18)");
  addValue(params, "strategy", "paramRoguelikeStrategy", "刷等级，尽可能稳定地打更多层数");
  addValue(params, "squad", "paramRoguelikeSquad", "指挥分队");
  addValue(params, "roles", "paramRoguelikeRoles", "稳扎稳打（重装、术师、狙击）");
  addValue(params, "operator", "paramRoguelikeOperator", "");
  addNumber(params, "starts_count", "paramRoguelikeStarts", 99999);
  addBool(params, "investment_enabled", "investment_enabled");
  addNumber(params, "investments_count", "paramRoguelikeInvestCount", 0);
  addBool(params, "stop_when_investment_full", "stop_when_investment_full");
  addBool(params, "investment_with_more_score", "investment_with_more_score");
  addBool(params, "use_support_unit", "use_support_unit");
  addBool(params, "use_nonfriend_support", "use_nonfriend_support");
  addBool(params, "stop_at_final_boss", "stop_at_final_boss");
  addBool(params, "stop_at_max_level", "stop_at_max_level");
  addBool(params, "start_with_seed", "start_with_seed");
  addValue(params, "seed", "paramRoguelikeSeed", "");
  addBool(params, "refresh_trader_with_dice", "refresh_trader_with_dice");
  addBool(params, "first_floor_foldartal", "first_floor_foldartal");
  const foldartalsEl = $("paramRoguelikeFoldartals");
  if (foldartalsEl) {
    const raw = foldartalsEl.value.trim();
    if (raw) params.first_floor_foldartals = raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const collapsalEl = $("paramRoguelikeCollapsal");
  if (collapsalEl) {
    const raw = collapsalEl.value.trim();
    if (raw) params.expected_collapsal_paradigms = raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  addBool(params, "start_with_elite_two", "start_with_elite_two");
  addBool(params, "only_start_with_elite_two", "only_start_with_elite_two");
  addBool(params, "delay_abort", "delay_abort");
  return hasGeneralFields ? normalizeRoguelikeParams(params) : params;
}

function collectReclamationParams() {
  const params = {};
  addValue(params, "theme", "paramReclamationTheme", "沙洲遗闻");
  addValue(params, "strategy", "paramReclamationStrategy", RECLAMATION_STRATEGIES[1]);
  addValue(params, "tool_to_craft", "paramReclamationTool", "荧光棒");
  addValue(params, "increment_mode", "paramReclamationIncrement", "连点");
  addNumber(params, "max_craft_count", "paramReclamationCraftCount", 16);
  addBool(params, "clear_store", "clear_store");
  return params;
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

function stageSelect(value, index, manual, removable, escapeHtml) {
  const control = manual
    ? `<input class="stagePlanSelect" name="paramStagePlan" value="${escapeHtml(value)}" />`
    : `<select class="stagePlanSelect" name="paramStagePlan">${stageOptions(value, escapeHtml)}</select>`;
  const removeButton = removable
    ? `<button class="stageRemoveButton" type="button" data-stage-action="remove" data-stage-index="${index}" title="删除候选关卡">×</button>`
    : "";
  return `<div class="stagePlanItem ${removable ? "" : "single"}">${control}${removeButton}</div>`;
}

function stageOptions(current, escapeHtml) {
  return selectOptions(stageOptionsList(), normalizeStageValue(current), escapeHtml);
}

function selectOptions(options, current, escapeHtml) {
  const normalized = options.map(normalizeOption);
  const selectedValue = current ?? normalized[0]?.value ?? "";
  const merged = normalized.some((option) => option.value === selectedValue)
    ? normalized
    : [normalizeOption(selectedValue), ...normalized];
  return merged.map(({ label, value }) => {
    const selected = value === selectedValue ? " selected" : "";
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
  }).join("");
}

function hint(text, escapeHtml) {
  const escaped = escapeHtml(text);
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

function seriesOptions(current, escapeHtml) {
  return SERIES_OPTIONS.map((option) => {
    const selected = Number(current ?? 0) === option.value ? " selected" : "";
    return `<option value="${option.value}"${selected}>${escapeHtml(option.label)}</option>`;
  }).join("");
}

function normalizeRoguelikeParams(params) {
  const theme = ROGUELIKE_THEMES.includes(params.theme) ? params.theme : "萨卡兹";
  const difficulties = roguelikeDifficultyOptions(theme);
  const strategies = roguelikeStrategyOptions(theme);
  const strategy = strategies.includes(params.strategy) ? params.strategy : strategies[0];
  const squads = roguelikeSquadOptions(theme, strategy);
  const roles = roguelikeRoleOptions(theme);
  const operators = roguelikeOperatorOptions(theme);

  return {
    ...params,
    theme,
    difficulty: difficulties.includes(params.difficulty) ? params.difficulty : "不切换 (-1)",
    strategy,
    squad: squads.includes(params.squad) ? params.squad : "指挥分队",
    roles: roles.includes(params.roles) ? params.roles : "稳扎稳打（重装、术师、狙击）",
    operator: operators.includes(params.operator) ? params.operator : ""
  };
}

function roguelikeStrategyOptions(theme) {
  return [...ROGUELIKE_STRATEGIES, ...(ROGUELIKE_THEME_STRATEGIES[theme] || [])];
}

function roguelikeSquadOptions(theme, strategy) {
  const themeSquads = theme === "萨卡兹" && strategy === ROGUELIKE_STRATEGIES[1]
    ? ROGUELIKE_SARKAZ_INVESTMENT_SQUADS
    : ROGUELIKE_THEME_SQUADS[theme] || ROGUELIKE_THEME_SQUADS["萨卡兹"];
  return [...themeSquads, ...ROGUELIKE_COMMON_SQUADS];
}

function roguelikeRoleOptions(theme) {
  const themeRoles = theme === "界园" ? ROGUELIKE_JIEGARDEN_ROLES : [];
  return [...ROGUELIKE_BASE_ROLES, ...themeRoles, "随心所欲（三张随机）"];
}

function roguelikeOperatorOptions(theme) {
  const dynamicOperators = activeClientOptions()?.roguelike?.operators?.[theme] || UI_OPTIONS?.roguelike?.operators?.[theme];
  if (Array.isArray(dynamicOperators) && dynamicOperators.length) return dynamicOperators;
  return ROGUELIKE_OPERATOR_OPTIONS[theme] || ROGUELIKE_OPERATOR_OPTIONS["萨卡兹"];
}

function roguelikeDifficultyOptions(theme) {
  const max = theme === "傀影" || theme === "萨米" ? 15 : 18;
  const values = ["不切换 (-1)", `MAX (${max})`, ...Array.from({ length: max }, (_, index) => String(max - index)), "MIN (0)"];
  return values;
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

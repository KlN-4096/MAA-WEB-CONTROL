const BLACKFLOW_REWARD_OPTIONS = [
  ["unnumbered_item", "无编号物品"], ["survey_advance", "考察预支"],
  ["space_lease", "空间租赁"], ["regression_compensation", "回归补偿"],
  ["forest_ride", "林间代步"], ["nest_parasitism", "巢穴寄生"],
  ["pegasus", "天马"], ["hippogriff", "角鹰"], ["dragon", "龙"],
  ["hydra", "九头蛇"], ["bai_ze", "白泽"], ["golden_crow", "金乌"]
];
const BLACKFLOW_ANIMAL_OPTIONS = [
  { label: "不指定", value: "" }, { label: "襁褓猫", value: "swaddled_cat" },
  { label: "襁褓犬", value: "swaddled_dog" }, { label: "襁褓三头犬", value: "swaddled_cerberus" },
  { label: "襁褓羽蛇（最多一只）", value: "swaddled_feathered_serpent" }
];

function renderRoguelikeStartOperators(p) {
  const opers = p.core_char_list || [{ name: p.operator || p.core_char || "", use_support: p.use_support_unit ?? p.use_support ?? false }];
  return `<strong class="sectionTitle">开局干员顺位</strong>
    <p class="formNote">最多三位，职业不能重复；第一顺位借助战与凹精二直升互斥。不指定则使用核心默认策略。</p>
    ${renderStartOperatorList(opers, p.theme, "startOper")}`;
}

function renderStartOperatorList(opers, theme, prefix) {
  const available = activeClientOptions()?.operators || [];
  const options = roguelikeOperatorOptions(theme).map(normalizeOption).filter((option)=>!option.value || !available.length || available.some((oper)=>oper.name === option.value));
  return Array.from({length:3},(_,i)=>`<label>第 ${i+1} 位<select id="${prefix}${i}">${selectOptions(options.map((option)=>({...option,label:typeof operatorDisplayName === "function" ? operatorDisplayName(option.value) || "不指定" : option.label})),opers[i]?.name || "",escapeHtmlFallback)}</select></label>
    ${checkRow(`${prefix}Support${i}`,"该顺位使用助战",opers[i]?.use_support)}`).join("");
}

function renderBlackFlowFields(p) {
  const priority = p.blackflow_start_reward_priority || ["pegasus", "space_lease", "forest_ride", ...BLACKFLOW_REWARD_OPTIONS.map(([key]) => key).filter((key) => !["pegasus","space_lease","forest_ride"].includes(key))];
  const animals = p.blackflow_start_animals || [];
  const rewards = Number(p.blackflow_start_rewards || 0);
  return `<strong class="sectionTitle">黑流树海（官服 / B 服）</strong>
    <label>刷等级目标<select id="blackflow_strategy">${selectOptions([
      {label:"第一结局",value:"ending1"}, {label:"第二结局",value:"ending2"}, {label:"第三结局",value:"ending3"},
      {label:"快速刷分",value:"burn"}, {label:"刷分并投资",value:"burn_with_investment"}
    ], p.blackflow_strategy || "ending1", escapeHtmlFallback)}</select></label>
    ${checkRow("blackflow_fast_pass", "使用满天赋机械师快速飞三层", p.blackflow_fast_pass)}
    <p class="formNote">以下为刷开局设置：目标局使用常规分队、难度和开局干员。没有羽蛇时，后六种奖励不参与筛选。</p>
    ${[0,1].map((i) => `<label>准备局动物 ${i+1}<select id="blackflowAnimal${i}">${selectOptions(BLACKFLOW_ANIMAL_OPTIONS, animals[i] || "", escapeHtmlFallback)}</select></label>`).join("")}
    <span>期望奖励（任意一个命中）</span>
    ${BLACKFLOW_REWARD_OPTIONS.map(([key,label], i) => checkRow(`blackflowReward${i}`, label, Boolean(rewards & (1 << i)))).join("")}
    ${checkRow("blackflow_start_utopia", "凹第一层实托邦（目标难度需至少 6）", p.blackflow_start_utopia)}
    <label>实托邦选卡优先级（按行排序，填写下列名称）
      <textarea id="blackflowPriority" rows="5">${escapeHtmlFallback(priority.map((key) => BLACKFLOW_REWARD_OPTIONS.find(([id]) => id === key)?.[1] || key).join("\n"))}</textarea>
    </label>
    <label>准备局分队<input id="paramRoguelikeCollectibleSquad" value="${escapeHtmlFallback(p.collectible_mode_squad || "")}" placeholder="留空继承常规分队" /></label>
    <label>准备局职业组<input id="blackflowPreparationRoles" value="${escapeHtmlFallback(p.collectible_mode_roles || "")}" placeholder="留空继承常规配置" /></label>
    ${checkRow("blackflowPreparationOverride","准备局使用独立开局干员（否则继承目标局）",Array.isArray(p.collectible_mode_core_char_list))}
    ${renderStartOperatorList(p.collectible_mode_core_char_list || [], "黑流树海", "prepOper")}
    <p class="formNote">机械师快速飞三层：将对应局分队设为特勤分队、职业组设为稳扎稳打、开局干员填机械师且不借助战。</p>`;
}

function collectRoguelikeModernParams(params) {
  if ($("startOper0")) {
    params.core_char_list = [0,1,2].map((i) => ({ name: valueOf(`startOper${i}`, ""), use_support: boolOf(`startOperSupport${i}`) })).filter((x) => x.name);
  }
  if ($("blackflowAnimal0")) {
    params.blackflow_start_animals = [0,1].map((i) => valueOf(`blackflowAnimal${i}`, "")).filter(Boolean);
    params.blackflow_start_rewards = BLACKFLOW_REWARD_OPTIONS.reduce((mask, _, i) => mask | (boolOf(`blackflowReward${i}`) ? 1 << i : 0), 0);
    params.blackflow_start_utopia = boolOf("blackflow_start_utopia");
    params.blackflow_fast_pass = boolOf("blackflow_fast_pass");
    params.blackflow_start_reward_priority = valueOf("blackflowPriority", "").split(/\r?\n/).map((name) => name.trim()).filter(Boolean).map((name) => BLACKFLOW_REWARD_OPTIONS.find(([key,label]) => key === name || label === name)?.[0] || name);
    params.blackflow_strategy = valueOf("blackflow_strategy", "ending1");
    params.collectible_mode_roles = valueOf("blackflowPreparationRoles", "");
    params.collectible_mode_core_char_list = boolOf("blackflowPreparationOverride") ?
      [0,1,2].map((i)=>({name:valueOf(`prepOper${i}`,""),use_support:boolOf(`prepOperSupport${i}`)})).filter((oper)=>oper.name) : null;
  }
}

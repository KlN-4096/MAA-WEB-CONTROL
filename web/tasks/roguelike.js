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
  const isJieGarden = theme === "界园";
  const seedValue = escapeHtmlFallback(p.seed || "");
  const foldartalsValue = escapeHtmlFallback(
    Array.isArray(p.first_floor_foldartals) ? p.first_floor_foldartals.join(",") : (p.first_floor_foldartals || "")
  );
  const collapsal = escapeHtmlFallback(
    Array.isArray(p.expected_collapsal_paradigms) ? p.expected_collapsal_paradigms.join(",") : (p.expected_collapsal_paradigms || "")
  );
  const collectibleStartList = escapeHtmlFallback(
    p.collectible_mode_start_list && typeof p.collectible_mode_start_list === "object" && !Array.isArray(p.collectible_mode_start_list)
      ? Object.keys(p.collectible_mode_start_list).filter((k) => p.collectible_mode_start_list[k]).join(",")
      : Array.isArray(p.collectible_mode_start_list)
        ? p.collectible_mode_start_list.join(",")
        : (p.collectible_mode_start_list || "")
  );
  const collectibleSquad = escapeHtmlFallback(p.collectible_mode_squad || "");
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
      ${isSami ? `${checkRow("use_foldartal", "萨米：使用密文板", p.use_foldartal)}
      ${checkRow("first_floor_foldartal", "萨米：第一层使用远见密文板", p.first_floor_foldartal)}
      <span>萨米：生活队开局密文板${hint("逗号分隔，如：风声,感知,知识", escapeHtmlFallback)}</span><input id="paramRoguelikeFoldartals" value="${foldartalsValue}" placeholder="留空则不指定" />` : ""}
      ${isSarkaz ? `${checkRow("check_collapsal_paradigms", "萨卡兹：检测坍缩范式", p.check_collapsal_paradigms)}
      ${checkRow("double_check_collapsal_paradigms", "萨卡兹：防漏检测（多检一次）", p.double_check_collapsal_paradigms)}
      <span>萨卡兹：期望坍缩范式${hint("逗号分隔，留空则不筛选", escapeHtmlFallback)}</span><input id="paramRoguelikeCollapsal" value="${collapsal}" placeholder="如：深化坚守,领域" />` : ""}
      ${isJieGarden ? checkRow("find_playTime_target", "界园：寻找常乐节点目标", p.find_playTime_target) : ""}
      <strong class="sectionTitle">凹开局/烧水（仅 mode=4 生效）</strong>
      ${checkRow("start_with_elite_two", "凹精二直升开局", p.start_with_elite_two)}
      ${p.start_with_elite_two ? checkRow("only_start_with_elite_two", "仅凹精二直升（不满足则重开）", p.only_start_with_elite_two) : ""}
      ${checkRow("collectible_mode_shopping", "烧水启用购物（凹开局结算时进商店）", p.collectible_mode_shopping)}
      <span>烧水分队${hint("覆盖默认分队，仅凹开局模式生效。留空使用主分队", escapeHtmlFallback)}</span><input id="paramRoguelikeCollectibleSquad" value="${collectibleSquad}" placeholder="留空则使用主分队" />
      <span>凹开局奖励对象${hint("逗号分隔，例：理性,源石锭,赠物", escapeHtmlFallback)}</span><input id="paramRoguelikeCollectibleStart" value="${collectibleStartList}" placeholder="留空则不限定" />
      <strong class="sectionTitle">以下选项为多任务共用</strong>
      ${checkRow("delay_abort", "自动肉鸽在战斗结束前延迟「停止」动作", p.delay_abort ?? true)}
    </div>
  `;
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
  addBool(params, "use_foldartal", "use_foldartal");
  addBool(params, "first_floor_foldartal", "first_floor_foldartal");
  const foldartalsEl = $("paramRoguelikeFoldartals");
  if (foldartalsEl) {
    const raw = foldartalsEl.value.trim();
    if (raw) params.first_floor_foldartals = raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  addBool(params, "check_collapsal_paradigms", "check_collapsal_paradigms");
  addBool(params, "double_check_collapsal_paradigms", "double_check_collapsal_paradigms");
  const collapsalEl = $("paramRoguelikeCollapsal");
  if (collapsalEl) {
    const raw = collapsalEl.value.trim();
    if (raw) params.expected_collapsal_paradigms = raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  addBool(params, "find_playTime_target", "find_playTime_target");
  addBool(params, "start_with_elite_two", "start_with_elite_two");
  addBool(params, "only_start_with_elite_two", "only_start_with_elite_two");
  addBool(params, "collectible_mode_shopping", "collectible_mode_shopping");
  addValue(params, "collectible_mode_squad", "paramRoguelikeCollectibleSquad", "");
  const collectibleStartEl = $("paramRoguelikeCollectibleStart");
  if (collectibleStartEl) {
    const raw = collectibleStartEl.value.trim();
    if (raw) {
      const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
      params.collectible_mode_start_list = Object.fromEntries(items.map((item) => [item, true]));
    }
  }
  addBool(params, "delay_abort", "delay_abort");
  return hasGeneralFields ? normalizeRoguelikeParams(params) : params;
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

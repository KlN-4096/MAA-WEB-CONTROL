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
      <div class="subLine"><span>剿灭子关卡</span><select id="paramAnnihilationStage">${selectOptions([
        { label: "当期剿灭", value: "Annihilation" },
        { label: "切尔诺伯格", value: "Chernobog@Annihilation" },
        { label: "龙门外环", value: "LungmenOutskirts@Annihilation" },
        { label: "龙门市区", value: "LungmenDowntown@Annihilation" }
      ], p.annihilation_stage || "Annihilation", escapeHtml)}</select></div>
      ${checkRow("dr_grandet", "饿朗台模式", p.dr_grandet)}
      ${checkRow("use_expiring_medicine", "无限吃 N 小时内过期的理智药", p.use_expiring_medicine ?? true)}
      <div class="subLine">└ <select id="paramMedicineExpireHours">${selectOptions(MEDICINE_EXPIRE_OPTIONS, p.medicine_expire_hours || "48h", escapeHtml)}</select></div>
      ${unsupportedLine("过期理智药使用上限", "MaaCore 已废弃 expiring_medicine，改用上面的「N 小时内过期」时限控制。")}
      ${unsupportedRow("活动结束前 48H 吃当周过期理智药")}
      ${unsupportedRow("隐藏代理倍率", "原版 WPF 的界面显示开关，不影响实际执行。")}
      ${unsupportedRow("允许使用源石保存状态", "原版 WPF 的界面行为开关，MaaCore 不消费。")}
      ${checkRow("report_to_penguin", "上报 PenguinStats 掉落数据", p.report_to_penguin)}
      <div class="subLine"><span>企鹅物流 ID（留空自动）</span><input id="paramPenguinId" class="wideInput" value="${escapeHtml(p.penguin_id || "")}" /></div>
      ${checkRow("report_to_yituliu", "上报一图流", p.report_to_yituliu)}
      <div class="subLine"><span>一图流 ID（留空自动）</span><input id="paramYituliuId" class="wideInput" value="${escapeHtml(p.yituliu_id || "")}" /></div>
      ${checkRow("custom_stage_code", `手动输入关卡名${hint(FIGHT_TOOLTIPS.customStage, escapeHtml)}`, p.custom_stage_code)}
      ${unsupportedLine("过期关卡重置为", "原版 WPF 的关卡列表重置策略，不参与任务执行。")}
      ${checkRow("use_alternate_stage", "使用备选关卡", p.use_alternate_stage ?? true)}
      ${unsupportedLine("下拉框中隐藏当日不开关卡", "关卡下拉已按当日（04:00 日切）自动过滤，无需该开关。")}
      ${unsupportedRow("启用周计划", "原版 WPF 的周一至周日关卡计划，Web 版暂未实现。")}
      <strong class="sectionTitle">以下选项为多任务共用</strong>
      ${checkRow("auto_restart", `游戏掉线时自动重连${hint("对应 MaaCore Fight.client_type：开启后掉线会自动重启客户端并继续作战。", escapeHtml)}`, p.auto_restart ?? true)}
      ${unsupportedRow("使用剩余理智执行指定关卡", "MaaCore Fight 不支持该参数。请改用任务列表里的「剩余理智」任务（独立一条 Fight）。")}
      <span>服务器${hint("用于上报数据时区分服务器，默认 CN（官服/B服）", escapeHtml)}</span><select id="paramFightServer">${selectOptions([
        { label: "官服 (CN)", value: "CN" },
        { label: "国际服 (US)", value: "US" },
        { label: "日服 (JP)", value: "JP" },
        { label: "韩服 (KR)", value: "KR" }
      ], p.server || "CN", escapeHtml)}</select>
    </div>
  `;
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
  addValue(params, "annihilation_stage", "paramAnnihilationStage", "Annihilation");
  addBool(params, "dr_grandet", "dr_grandet");
  addBool(params, "use_expiring_medicine", "use_expiring_medicine");
  addValue(params, "medicine_expire_hours", "paramMedicineExpireHours", "48h");
  addBool(params, "report_to_penguin", "report_to_penguin");
  addValue(params, "penguin_id", "paramPenguinId", "");
  addBool(params, "report_to_yituliu", "report_to_yituliu");
  addValue(params, "yituliu_id", "paramYituliuId", "");
  addBool(params, "custom_stage_code", "custom_stage_code");
  addBool(params, "use_alternate_stage", "use_alternate_stage");
  addBool(params, "auto_restart", "auto_restart");
  addValue(params, "server", "paramFightServer", "CN");
  // MaaCore 用 Fight.client_type 是否为空来开关「掉线自动重连」（integration.md:176）。
  if ($("auto_restart")) params.client_type = boolOf("auto_restart") ? activeClientType() : "";
  return params;
}

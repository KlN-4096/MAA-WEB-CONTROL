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
      <div class="subLine"><span>过期理智药使用上限${hint("0 = 不限制；可单独限制即将过期理智药的最大使用数量。", escapeHtml)}</span><input id="paramExpiringMedicineCount" type="number" min="0" max="999" class="shortInput" value="${numberValue(p.expiring_medicine_count, 0)}" /></div>
      ${checkRow("use_activity_expire", "活动结束前 48H 吃当周过期理智药", p.use_activity_expire)}
      <div class="subLine disabled">└ 暂无活动</div>
      ${checkRow("hide_series", "隐藏代理倍率", p.hide_series)}
      ${checkRow("allow_stone_save", "允许使用源石保存状态", p.allow_stone_save)}
      ${checkRow("report_to_penguin", "上报 PenguinStats 掉落数据", p.report_to_penguin)}
      <div class="subLine"><span>企鹅物流 ID（留空自动）</span><input id="paramPenguinId" class="wideInput" value="${escapeHtml(p.penguin_id || "")}" /></div>
      ${checkRow("report_to_yituliu", "上报一图流", p.report_to_yituliu)}
      <div class="subLine"><span>一图流 ID（留空自动）</span><input id="paramYituliuId" class="wideInput" value="${escapeHtml(p.yituliu_id || "")}" /></div>
      ${checkRow("custom_stage_code", `手动输入关卡名${hint(FIGHT_TOOLTIPS.customStage, escapeHtml)}`, p.custom_stage_code)}
      <span>过期关卡重置为</span><select id="paramStageReset">${selectOptions([{ label: "当前/上次", value: "CurrentStage" }, "不切换"], normalizeStageValue(p.stage_reset), escapeHtml)}</select>
      ${checkRow("use_alternate_stage", "使用备选关卡", p.use_alternate_stage ?? true)}
      ${checkRow("hide_unavailable_stage", "下拉框中隐藏当日不开关卡", p.hide_unavailable_stage)}
      ${checkRow("weekly_schedule", "启用周计划", p.weekly_schedule)}
      <strong class="sectionTitle">以下选项为多任务共用</strong>
      ${checkRow("auto_restart", "游戏掉线时自动重连", p.auto_restart ?? true)}
      ${checkRow("use_remaining_sanity_stage", "使用剩余理智执行指定关卡", p.use_remaining_sanity_stage)}
      <div class="subLine"><span>剩余理智关卡</span><input class="wideInput" id="paramRemainingSanityStage" placeholder="留空则同正常关卡" value="${escapeHtml(p.remaining_sanity_stage || "")}" /></div>
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
  addBool(params, "use_activity_expire", "use_activity_expire");
  addBool(params, "hide_series", "hide_series");
  addBool(params, "allow_stone_save", "allow_stone_save");
  addBool(params, "report_to_penguin", "report_to_penguin");
  addValue(params, "penguin_id", "paramPenguinId", "");
  addBool(params, "report_to_yituliu", "report_to_yituliu");
  addValue(params, "yituliu_id", "paramYituliuId", "");
  addNumber(params, "expiring_medicine_count", "paramExpiringMedicineCount", 0);
  addBool(params, "custom_stage_code", "custom_stage_code");
  addValue(params, "stage_reset", "paramStageReset", "CurrentStage");
  addBool(params, "use_alternate_stage", "use_alternate_stage");
  addBool(params, "hide_unavailable_stage", "hide_unavailable_stage");
  addBool(params, "weekly_schedule", "weekly_schedule");
  addBool(params, "auto_restart", "auto_restart");
  addBool(params, "use_remaining_sanity_stage", "use_remaining_sanity_stage");
  addValue(params, "remaining_sanity_stage", "paramRemainingSanityStage", "");
  addValue(params, "server", "paramFightServer", "CN");
  return params;
}

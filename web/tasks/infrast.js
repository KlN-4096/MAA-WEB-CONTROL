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

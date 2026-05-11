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
      ${checkRow("set_time", `自动设置招募时限${hint("关闭后将不会主动设置招募时长（可用于手动调整）", escapeHtml)}`, p.set_time ?? true)}
      ${checkRow("refresh", "自动刷新 3 星 Tags", p.refresh ?? true)}
      ${checkRow("skip_robot", "无招聘许可时继续尝试刷新 Tags", p.skip_robot ?? true)}
      ${checkRow("reserve_level_1", "保留 1 星词条并跳过该栏位", p.reserve_level_1 ?? true)}
      ${checkRow("confirm_3", "自动确认 3 星", p.confirm_3 ?? true)}
      ${timeRow("time3", p.time3 || "09:00")}
      ${checkRow("confirm_4", "自动确认 4 星", p.confirm_4 ?? true)}
      ${timeRow("time4", p.time4 || "09:00")}
      ${checkRow("confirm_5", "自动确认 5 星", p.confirm_5)}
      ${timeRow("time5", p.time5 || "09:00", true)}
      ${checkRow("confirm_6", "自动确认 6 星", p.confirm_6)}
      ${timeRow("time6", p.time6 || "09:00", true)}
      <strong class="sectionTitle">公招上报</strong>
      ${checkRow("report_to_penguin", "上报 PenguinStats", p.report_to_penguin)}
      <div class="subLine"><span>企鹅物流 ID（留空自动）</span><input id="paramRecruitPenguinId" class="wideInput" value="${escapeHtml(p.penguin_id || "")}" /></div>
      ${checkRow("report_to_yituliu", "上报一图流", p.report_to_yituliu)}
      <div class="subLine"><span>一图流 ID（留空自动）</span><input id="paramRecruitYituliuId" class="wideInput" value="${escapeHtml(p.yituliu_id || "")}" /></div>
      <span>服务器${hint("用于上报数据时区分服务器，默认 CN（官服/B服）", escapeHtml)}</span><select id="paramRecruitServer">${selectOptions([
        { label: "官服 (CN)", value: "CN" },
        { label: "国际服 (US)", value: "US" },
        { label: "日服 (JP)", value: "JP" },
        { label: "韩服 (KR)", value: "KR" }
      ], p.server || "CN", escapeHtml)}</select>
    </div>
  `;
}

function collectRecruitParams() {
  const params = {};
  addBool(params, "auto_expedited", "auto_expedited");
  addNumber(params, "max_times", "paramRecruitTimes", 99);
  addNumber(params, "extra_tags_mode", "paramRecruitStrategy", 0);
  addValue(params, "extra_tags", "paramExtraTags", "");
  addNumber(params, "expedite_times", "paramExpediteTimes", 0);
  addBool(params, "set_time", "set_time");
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
  addTime(params, "time6", "time6");
  addBool(params, "report_to_penguin", "report_to_penguin");
  addValue(params, "penguin_id", "paramRecruitPenguinId", "");
  addBool(params, "report_to_yituliu", "report_to_yituliu");
  addValue(params, "yituliu_id", "paramRecruitYituliuId", "");
  addValue(params, "server", "paramRecruitServer", "CN");
  return params;
}

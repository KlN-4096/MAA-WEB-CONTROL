function renderUserDataUpdateGeneral(p) {
  const interval = p.trigger_interval || "EveryTime";
  return `
    <div class="maaParams wideForm">
      ${checkRow("update_oper_box", "更新干员箱数据", p.update_oper_box ?? true)}
      ${checkRow("update_depot", "更新仓库数据", p.update_depot ?? true)}
      <span>触发周期${hint(escapeHtmlFallback("EveryTime: 每次任务都执行；Daily: 同一日仅执行一次；Weekly: 同一周仅执行一次。"), escapeHtmlFallback)}</span>
      <select id="paramUserDataInterval">
        <option value="EveryTime" ${interval === "EveryTime" ? "selected" : ""}>每次执行 (EveryTime)</option>
        <option value="Daily" ${interval === "Daily" ? "selected" : ""}>每日一次 (Daily)</option>
        <option value="Weekly" ${interval === "Weekly" ? "selected" : ""}>每周一次 (Weekly)</option>
      </select>
    </div>
  `;
}

function collectUserDataUpdateParams() {
  const params = {};
  addBool(params, "update_oper_box", "update_oper_box");
  addBool(params, "update_depot", "update_depot");
  addValue(params, "trigger_interval", "paramUserDataInterval", "EveryTime");
  return params;
}

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

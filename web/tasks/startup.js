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

function renderStartUpAdvanced(p, escapeHtml) {
  return `
    <div class="maaParams wideForm">
      <strong class="sectionTitle">开始唤醒失败重试</strong>
      <span>最大尝试次数${hint("包含第一次开始唤醒。填 3 表示最多执行 3 次 StartUp；某次成功后会直接进入后续任务。", escapeHtml)}</span>
      <input id="paramStartupRetryTimes" type="number" min="1" max="10" value="${numberValue(p.startup_retry_times, 1)}" />
      <span>失败后命令 A${hint("在失败的 StartUp 后执行，例如 docker stop redroid。命令为空时跳过。", escapeHtml)}</span>
      <input id="paramStartupRetryCommandA" class="wideInput" value="${escapeHtml(p.startup_retry_command_a || "")}" placeholder="docker stop redroid" />
      <span>命令 A 后等待</span>
      <div><input id="paramStartupRetryWaitA" type="number" min="0" max="3600" value="${numberValue(p.startup_retry_wait_a_seconds, 60)}" /><span class="unitLabel">秒</span></div>
      <span>恢复命令 B${hint("等待 A 后执行，例如 docker start redroid 或 docker compose up -d。命令为空时跳过。", escapeHtml)}</span>
      <input id="paramStartupRetryCommandB" class="wideInput" value="${escapeHtml(p.startup_retry_command_b || "")}" placeholder="docker start redroid" />
      <span>命令 B 后等待</span>
      <div><input id="paramStartupRetryWaitB" type="number" min="0" max="3600" value="${numberValue(p.startup_retry_wait_b_seconds, 60)}" /><span class="unitLabel">秒</span></div>
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
  addNumber(params, "startup_retry_times", "paramStartupRetryTimes", 1);
  addValue(params, "startup_retry_command_a", "paramStartupRetryCommandA", "");
  addNumber(params, "startup_retry_wait_a_seconds", "paramStartupRetryWaitA", 60);
  addValue(params, "startup_retry_command_b", "paramStartupRetryCommandB", "");
  addNumber(params, "startup_retry_wait_b_seconds", "paramStartupRetryWaitB", 60);
  return params;
}

function renderNotificationSection() {
  const notif = SETTINGS_STATE.notification || defaultNotificationState();
  const webhook = notif.webhook || {};
  const status = SETTINGS_STATE.notificationStatus || "";
  const headersText = formatHeadersForInput(webhook.headers);
  return settingsColumn(`
    <p class="settingsGlobalTip">通知由服务端发送，可同时启用多个渠道；密钥只保存于服务端，不写浏览器缓存。</p>
    ${checkLine("启用外部通知", notif.enabled, "全局开关；关闭时即使运行结束也不发送。", "notification.enabled")}
    ${checkLine("任务完成时通知", notif.send_on_complete, "", "notification.send_on_complete")}
    ${checkLine("任务失败时通知", notif.send_on_error, "", "notification.send_on_error")}
    ${checkLine("任务超时时通知", notif.send_on_timeout, "需开启「任务超时」并设置非零分钟数。", "notification.send_on_timeout")}
    ${checkLine("任务被停止时通知", notif.send_on_stopped, "默认关闭：手动停止通常不需要通知。", "notification.send_on_stopped")}
    ${checkLine("任务开始前通知", notif.send_on_start, "", "notification.send_on_start")}
    ${fieldRow("每 N 条日志通知", numberBox(String(notif.log_count || 0), "settingsControlS", "notification.log_count"), "0 为关闭")}
    ${fieldRow("日志触发正则", textBox(notif.log_pattern || "", "settingsControlL", "notification.log_pattern"), "留空关闭；匹配日志后发送。")}
    ${fieldRow("附带最近日志条数", numberBox(String(notif.history_lines || 0), "settingsControlS", "notification.history_lines"))}
    ${fieldRow("黑名单关键词", textBox((notif.blacklist || []).join(";"), "settingsControlL", "notification.blacklist"), "分号分隔，命中内容不发送")}
    ${fieldRow("任务超时（分钟）", numberBox(String(SETTINGS_STATE.taskTimeoutMinutes ?? 0), "settingsControlS", "taskTimeoutMinutes"), "0 = 关闭。任务执行超过该分钟数时，runner 会自动调用 stop 并发出 timeout 通知。")}
    ${checkLine("附带任务详情", notif.include_details, "在 JSON 内附 details（profile/state/task counts/last_error）。", "notification.include_details")}
    <p class="formNote">已保存的凭据以掩码显示，原样保存会保留；清空字段可删除。配置只保存在服务端，不存入浏览器缓存。</p>
    ${checkLine("启用 Webhook", webhook.enabled, "", "notification.webhook.enabled")}
    ${fieldRow("Webhook URL", textBox(webhook.url || "", "settingsControlL", "notification.webhook.url"))}
    ${fieldRow("HTTP 方法", selectBox([
      { label: "POST", value: "POST" },
      { label: "PUT", value: "PUT" }
    ], webhook.method || "POST", "notification.webhook.method", "settingsControlS"))}
    ${fieldRow("自定义请求头", `<textarea class="settingsControlL settingsTextarea" data-settings-field="notification.webhook.headers" placeholder="Authorization: Bearer xxx&#10;X-Custom: foo">${escapeHtml(headersText)}</textarea>`, "每行 一个 Header。格式：Key: Value")}
    ${fieldRow("Webhook JSON 模板（可选）", `<textarea class="settingsControlL settingsTextarea" data-settings-field="notification.webhook.body_template">${escapeHtml(webhook.body_template || "")}</textarea>`, "可用 {title}、{content}、{time}，放在 JSON 字符串内部；留空保持旧版格式。")}
    ${renderNotificationChannels(notif.channels || [])}
    <button class="settingsButtonSmall" type="button" data-notification-add>添加通知渠道</button>
    <div class="settingsInlinePair">
      <button class="settingsButtonSmall" type="button" data-settings-action="saveNotification">保存通知配置</button>
      <button class="settingsButtonSmall" type="button" data-settings-action="testNotification">发送测试</button>
    </div>
    ${status ? `<p class="settingsLineText ${SETTINGS_STATE.notificationStatusLevel || ""}">${escapeHtml(status)}</p>` : ""}
    ${SETTINGS_STATE.taskTimeoutStatus ? `<p class="settingsLineText ${SETTINGS_STATE.taskTimeoutStatusLevel || ""}">任务超时：${escapeHtml(SETTINGS_STATE.taskTimeoutStatus)}</p>` : ""}
  `);
}

async function loadNotificationConfig() {
  if (typeof api !== "function") return;
  try {
    const data = await api("/api/notifications");
    if (data && typeof data === "object") {
      SETTINGS_STATE.notification = mergeNotificationState(data);
      if (typeof state !== "undefined" && state.currentView === "settings") renderSettingsView();
    }
  } catch (e) { /* ignore */ }
}

async function saveNotificationConfig() {
  if (typeof api !== "function") return;
  const config = SETTINGS_STATE.notification || defaultNotificationState();
  SETTINGS_STATE.notificationStatus = "正在保存……";
  renderSettingsView();
  try {
    const result = await api("/api/notifications", {
      method: "PUT",
      body: JSON.stringify(config)
    });
    if (result && typeof result === "object") SETTINGS_STATE.notification = mergeNotificationState(result);
    SETTINGS_STATE.notificationStatus = "已保存";
    SETTINGS_STATE.notificationStatusLevel = "ok";
    if (typeof showToast === "function") showToast("通知配置已保存", "success");
  } catch (e) {
    SETTINGS_STATE.notificationStatus = `保存失败：${e.message || "请求错误"}`;
    SETTINGS_STATE.notificationStatusLevel = "err";
    showError(e);
  }
  renderSettingsView();
}

async function testNotificationConfig() {
  if (typeof api !== "function") return;
  SETTINGS_STATE.notificationStatus = "正在发送测试……";
  renderSettingsView();
  try {
    const config = SETTINGS_STATE.notification || defaultNotificationState();
    const result = await api("/api/notifications/test", {
      method: "POST",
      body: JSON.stringify({ config })
    });
    SETTINGS_STATE.notificationStatus = result?.ok ? "测试已发送" : "至少一个渠道发送失败或未配置，请检查配置与日志";
    SETTINGS_STATE.notificationStatusLevel = result?.ok ? "ok" : "err";
    if (typeof showToast === "function") showToast(SETTINGS_STATE.notificationStatus, result?.ok ? "success" : "error");
  } catch (e) {
    SETTINGS_STATE.notificationStatus = `测试失败：${e.message || "请求错误"}`;
    SETTINGS_STATE.notificationStatusLevel = "err";
    showError(e);
  }
  renderSettingsView();
}

const NOTIFICATION_CHANNEL_FIELDS = {
  smtp: ["server", "port", "username", "password", "from", "to", "use_ssl", "starttls", "requires_authentication"],
  telegram: ["bot_token", "chat_id", "topic_id"],
  bark: ["server", "send_key", "group", "icon"],
  gotify: ["server", "token"],
  qmsg: ["server", "key", "user", "bot"],
  serverchan: ["send_key"],
  discord: ["bot_token", "user_id"],
  dingtalk: ["access_token", "secret"]
};

function renderNotificationChannels(channels) {
  return channels.map((channel,index)=>`<fieldset class="planRow">
    <legend>渠道 ${index+1}</legend>
    ${checkLine("启用此渠道", channel.enabled, "", `notification.channels.${index}.enabled`)}
    ${fieldRow("类型", selectBox(Object.keys(NOTIFICATION_CHANNEL_FIELDS), channel.type, `notification.channels.${index}.type`))}
    ${(NOTIFICATION_CHANNEL_FIELDS[channel.type] || []).map((key)=>{
      const field = `notification.channels.${index}.options.${key}`;
      const value = channel.options?.[key];
      if (["use_ssl","starttls","requires_authentication"].includes(key)) return checkLine(key,value ?? true,"",field);
      const secret = /token|secret|password|key/.test(key);
      return fieldRow(key, `<input class="settingsControlL" data-settings-field="${field}" type="${secret ? "password" : "text"}" autocomplete="off" value="${escapeHtml(value ?? "")}"/>`);
    }).join("")}
    <button type="button" class="settingsButtonSmall" data-notification-remove="${index}">移除此渠道</button>
  </fieldset>`).join("");
}

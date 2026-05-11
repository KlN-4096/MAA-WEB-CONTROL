function renderNotificationSection() {
  const notif = SETTINGS_STATE.notification || defaultNotificationState();
  const webhook = notif.webhook || {};
  const status = SETTINGS_STATE.notificationStatus || "";
  const headersText = formatHeadersForInput(webhook.headers);
  return settingsColumn(`
    <p class="settingsGlobalTip">仅支持 Webhook（POST/PUT JSON）。MaaCore 任务结束、失败、被停止时由后端自动调用。</p>
    ${checkLine("启用外部通知", notif.enabled, "全局开关；关闭时即使运行结束也不发送。", "notification.enabled")}
    ${checkLine("任务完成时通知", notif.send_on_complete, "", "notification.send_on_complete")}
    ${checkLine("任务失败时通知", notif.send_on_error, "", "notification.send_on_error")}
    ${checkLine("任务超时时通知", notif.send_on_timeout, "需开启「任务超时」并设置非零分钟数。", "notification.send_on_timeout")}
    ${checkLine("任务被停止时通知", notif.send_on_stopped, "默认关闭：手动停止通常不需要通知。", "notification.send_on_stopped")}
    ${fieldRow("任务超时（分钟）", numberBox(String(SETTINGS_STATE.taskTimeoutMinutes ?? 0), "settingsControlS", "taskTimeoutMinutes"), "0 = 关闭。任务执行超过该分钟数时，runner 会自动调用 stop 并发出 timeout 通知。")}
    ${checkLine("附带任务详情", notif.include_details, "在 JSON 内附 details（profile/state/task counts/last_error）。", "notification.include_details")}
    ${checkLine("启用 Webhook", webhook.enabled, "", "notification.webhook.enabled")}
    ${fieldRow("Webhook URL", textBox(webhook.url || "", "settingsControlL", "notification.webhook.url"))}
    ${fieldRow("HTTP 方法", selectBox([
      { label: "POST", value: "POST" },
      { label: "PUT", value: "PUT" }
    ], webhook.method || "POST", "notification.webhook.method", "settingsControlS"))}
    ${fieldRow("自定义请求头", `<textarea class="settingsControlL settingsTextarea" data-settings-field="notification.webhook.headers" placeholder="Authorization: Bearer xxx&#10;X-Custom: foo">${escapeHtml(headersText)}</textarea>`, "每行 一个 Header。格式：Key: Value")}
    <div class="settingsInlinePair">
      <button class="settingsButtonSmall" type="button" data-settings-action="saveNotification">保存通知配置</button>
      <button class="settingsButtonSmall" type="button" data-settings-action="testNotification">发送测试</button>
    </div>
    ${status ? `<p class="settingsLineText">${escapeHtml(status)}</p>` : ""}
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
  } catch (e) {
    SETTINGS_STATE.notificationStatus = `保存失败：${e.message || "请求错误"}`;
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
    SETTINGS_STATE.notificationStatus = result?.ok ? "测试已发送" : "测试失败：请检查 Webhook URL 与请求头";
  } catch (e) {
    SETTINGS_STATE.notificationStatus = `测试失败：${e.message || "请求错误"}`;
  }
  renderSettingsView();
}

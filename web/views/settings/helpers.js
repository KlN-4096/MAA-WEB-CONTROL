function settingsCheck(key, label, title = "") {
  const checked = SETTINGS_STATE[key] ? " checked" : "";
  return `<span class="settingsCheckLine">
    <label class="settingsCheck">
      <input type="checkbox" data-settings-flag="${key}"${checked} />
      <span>${escapeHtml(label)}</span>
    </label>
    ${settingsTip(title)}
  </span>`;
}

function timerRow(timer, index) {
  const checked = timer.enabled ? " checked" : "";
  const disabled = timer.enabled ? "" : " disabled";
  const configSelect = SETTINGS_STATE.customConfig ? timerConfigSelect(timer, index) : "";
  return `<div class="timerItem">
    <label class="settingsCheck">
      <input type="checkbox" data-timer-enabled="${index}"${checked} />
      <span>定时 ${index + 1}</span>
    </label>
    <span class="timerTime">
      <input type="number" min="0" max="23" value="${timer.hour}" data-timer-hour="${index}"${disabled} />
      <span>:</span>
      <input type="number" min="0" max="59" value="${timer.minute}" data-timer-minute="${index}"${disabled} />
    </span>
    ${configSelect}
  </div>`;
}

function timerConfigSelect(timer, index) {
  return `<select class="timerConfigSelect" data-timer-config="${index}">${configOptions(timer.config)}</select>`;
}

function settingsTip(text = "") {
  if (!text) return "";
  return `<span class="copilotTipIcon settingsTipIcon" tabindex="0" data-tip="${escapeHtml(text)}">?</span>`;
}

function settingsColumn(content) {
  return `<div class="settingsReplica">${content}</div>`;
}

function fieldRow(label, control, tip = "") {
  return `<label class="settingsFieldRow">
    <span class="settingsFieldText">${escapeHtml(label)}</span>
    <span class="settingsControlLine">${control}${settingsTip(tip)}</span>
  </label>`;
}

function checkLine(label, checked = false, tip = "", key = "", disabled = false) {
  const value = key ? SETTINGS_STATE[key] : checked;
  const attr = key ? ` data-settings-field="${key}"` : "";
  const disabledAttr = disabled ? " disabled" : "";
  return `<span class="settingsCheckLine">
    <label class="settingsCheck">
      <input type="checkbox"${attr}${value ? " checked" : ""}${disabledAttr} />
      <span>${escapeHtml(label)}</span>
    </label>
    ${settingsTip(tip)}
  </span>`;
}

function textBox(value = "", className = "settingsControlL", key = "", attrs = "") {
  const attr = key ? ` data-settings-field="${key}"` : "";
  return `<input class="${className}" type="text" value="${escapeHtml(value)}"${attr}${attrs} />`;
}

function numberBox(value = "", className = "settingsControlS", key = "", attrs = "") {
  const attr = key ? ` data-settings-field="${key}"` : "";
  return `<input class="${className}" type="number" value="${escapeHtml(value)}"${attr}${attrs} />`;
}

function selectBox(options, selected = 0, key = "", className = "settingsControlL", attrs = "") {
  const attr = key ? ` data-settings-field="${key}"` : "";
  return `<select class="${className}"${attr}${attrs}>${options.map((option, index) => {
    const normalized = typeof option === "object" ? option : { label: option, value: option };
    const isSelected = key
      ? String(normalized.value) === String(selected)
      : index === Number(selected);
    return `<option value="${escapeHtml(normalized.value)}"${isSelected ? " selected" : ""}>${escapeHtml(normalized.label)}</option>`;
  }).join("")}</select>`;
}

function inputButton(value, label, className = "settingsControlL", attrs = "") {
  return `${textBox(value, className, "", attrs)}<button class="settingsButtonSmall" type="button"${attrs}>${escapeHtml(label)}</button>`;
}

function sliderRow(label, value) {
  return `<label class="settingsSliderRow">
    <span>${escapeHtml(label)}</span>
    <input type="range" min="0" max="100" value="${value}" />
  </label>`;
}

function chipsBox(labels) {
  return `<div class="settingsChips">${labels.map((label) => `<span>${escapeHtml(label)} ×</span>`).join("")}</div>`;
}

function badgeRow(label, value) {
  return `<span class="settingsBadgeRow"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></span>`;
}

function configOptions(selectedValue) {
  const names = SETTINGS_STATE.configs.length ? SETTINGS_STATE.configs : ["Default"];
  const current = selectedValue || state.profile?.name || names[0];
  return names.map((name) => {
    const selected = name === current ? " selected" : "";
    return `<option value="${escapeHtml(name)}"${selected}>${escapeHtml(name)}</option>`;
  }).join("");
}

function defaultNotificationState() {
  return {
    enabled: false,
    send_on_complete: true,
    send_on_error: true,
    send_on_stopped: false,
    send_on_timeout: true,
    include_details: true,
    webhook: { enabled: false, url: "", method: "POST", headers: {} }
  };
}

function formatHeadersForInput(headers) {
  if (!headers || typeof headers !== "object") return "";
  return Object.entries(headers)
    .filter(([k, v]) => k && v !== undefined && v !== null)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

function parseHeadersFromInput(text) {
  const map = {};
  String(text || "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key) map[key] = value;
  });
  return map;
}

function mergeNotificationState(data) {
  const base = defaultNotificationState();
  if (!data || typeof data !== "object") return base;
  return {
    enabled: Boolean(data.enabled),
    send_on_complete: data.send_on_complete !== false,
    send_on_error: data.send_on_error !== false,
    send_on_stopped: Boolean(data.send_on_stopped),
    send_on_timeout: data.send_on_timeout !== false,
    include_details: data.include_details !== false,
    webhook: {
      enabled: Boolean(data.webhook?.enabled),
      url: typeof data.webhook?.url === "string" ? data.webhook.url : "",
      method: data.webhook?.method === "PUT" ? "PUT" : "POST",
      headers: data.webhook?.headers && typeof data.webhook.headers === "object" ? { ...data.webhook.headers } : {}
    }
  };
}

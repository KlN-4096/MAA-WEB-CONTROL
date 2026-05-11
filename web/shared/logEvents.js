let rawLogExpanded = false;
let maaLogViewLoadPromise = null;

function addLocalLog(level, type, message, detail = {}) {
  addLogItem({ ts: new Date().toISOString(), level, type, message, detail });
}

function addLogItem(item) {
  const event = normalizeLogItem(item);
  state.logs.push(event);
  state.logs = state.logs.slice(-1000);
  if (rawLogExpanded) renderRawLogs();
  if (event.type?.startsWith("maa.log.")) {
    handleMaaLogEvent(event);
  } else if (event.type?.startsWith("maa.tools.") && typeof handleToolEvent === "function") {
    handleToolEvent(event);
  } else if (!shouldUseCardLog()) {
    renderLogs();
  }
}

function renderLogs() {
  const list = $("logList");
  if (!list) return;
  const logView = getMaaLogView();
  if (shouldUseCardLog()) {
    if (logView && state.logCards.length) {
      list.innerHTML = logView.renderLogCards(state.logCards);
      scrollLogListToBottom();
    } else {
      list.innerHTML = `<div class="logEmpty">等待事件</div>`;
    }
    return;
  }
  list.innerHTML = logView ? logView.renderLegacyLogItems(state.logs) : renderLegacyLogItemsFallback(state.logs);
  scrollLogListToBottom();
}

function renderRawLogs() {
  const list = $("rawLogList");
  if (!list) return;
  const logView = getMaaLogView();
  list.innerHTML = logView
    ? logView.renderLegacyLogItems(state.logs)
    : renderLegacyLogItemsFallback(state.logs);
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
}

function toggleRawLog() {
  rawLogExpanded = !rawLogExpanded;
  const list = $("rawLogList");
  const btn = $("rawLogToggle");
  if (list) list.hidden = !rawLogExpanded;
  if (btn) btn.textContent = rawLogExpanded ? "收起" : "展开";
  if (rawLogExpanded) renderRawLogs();
}

function handleMaaLogEvent(event) {
  if (event.type === "maa.log.clear") {
    state.logCards = [];
    // Only strip MAA card log entries; keep runner/scheduler/ui DEV events
    state.logs = state.logs.filter((e) => !e.type?.startsWith("maa.log."));
    renderLogs();
    if (rawLogExpanded) renderRawLogs();
    return;
  }
  const logView = getMaaLogView();
  const detail = event.detail || {};
  if (detail.card && logView) {
    logView.upsertLogCard(state.logCards, detail.card);
    renderLogs();
    return;
  }
  if (event.type === "maa.log.run.completed") {
    renderLogs();
  }
}

function shouldUseCardLog() {
  return typeof SETTINGS_STATE === "undefined" || SETTINGS_STATE.useCardLog !== false;
}

function getMaaLogView() {
  const view = window.MaaLogView;
  return view && typeof view.renderLogCards === "function" && typeof view.upsertLogCard === "function" ? view : null;
}

async function ensureMaaLogView() {
  if (getMaaLogView()) return;
  if (!maaLogViewLoadPromise) {
    maaLogViewLoadPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = `/shared/logCards.js?v=${Date.now()}`;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.body.appendChild(script);
    });
  }
  await maaLogViewLoadPromise;
}

function renderLegacyLogItemsFallback(items = []) {
  if (!items.length) return `<div class="logEmpty">等待事件</div>`;
  return items.map((item) => {
    const details = renderLogDetails(item.detail);
    return `<div class="logItem ${escapeHtml(item.level)}">
      <time class="logTime">${escapeHtml(formatLogTime(item.ts))}</time>
      <div class="logBody">
        <strong class="logMessage">${escapeHtml(item.message)}</strong>
        <span class="logType">${escapeHtml(item.type)}</span>
        ${details}
      </div>
    </div>`;
  }).join("");
}

function scrollLogListToBottom() {
  const list = $("logList");
  if (!list) return;
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
}

function normalizeLogItem(item = {}) {
  const detail = item.detail && typeof item.detail === "object" && !Array.isArray(item.detail) ? item.detail : {};
  const level = ["debug", "info", "warning", "error"].includes(item.level) ? item.level : "info";
  return {
    ts: item.ts || new Date().toISOString(),
    level,
    type: item.type || "ui.event",
    message: item.message || item.type || "事件",
    detail
  };
}

function formatLogTime(value) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return "--:--:--";
  return time.toLocaleTimeString("zh-CN", { hour12: false });
}

function renderLogDetails(detail) {
  const entries = logDetailEntries(detail);
  if (!entries.length) return "";
  return `<dl class="logDetails">${entries.map(([key, value]) => `
    <div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>
  `).join("")}</dl>`;
}

function logDetailEntries(detail) {
  const sources = [detail];
  if (detail.details && typeof detail.details === "object" && !Array.isArray(detail.details)) sources.push(detail.details);
  const entries = [];
  VISIBLE_LOG_DETAILS.forEach((key) => {
    const value = sources.map((source) => source[key]).find((candidate) => candidate !== undefined && candidate !== null && candidate !== "");
    if (value !== undefined) entries.push([key, stringifyLogDetail(value)]);
  });
  return entries.slice(0, 4);
}

function stringifyLogDetail(value) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function clearLogs() {
  state.logs = [];
  state.logCards = [];
  renderLogs();
  if (rawLogExpanded) renderRawLogs();
  return api("/api/logs/clear", { method: "POST" }).catch(showError);
}

function openLogThumbnail(thumbnailId) {
  const card = state.logCards.find((entry) => entry.thumbnail_id === thumbnailId);
  const url = card?.thumbnail_url;
  if (!url) return;
  const originalUrl = card?.original_url || "";
  const originalButton = originalUrl
    ? `<button type="button" class="maaLogPreviewOriginal" data-log-original="${escapeHtml(originalUrl)}">查看原图</button>`
    : "";
  closeLogThumbnail();
  const overlay = document.createElement("div");
  overlay.className = "maaLogPreview";
  overlay.innerHTML = `<div class="maaLogPreviewToolbar">
      ${originalButton}
      <button type="button" class="maaLogPreviewClose" aria-label="关闭">×</button>
    </div>
    <img src="${escapeHtml(url)}" alt="" />`;
  overlay.addEventListener("click", (event) => {
    const original = event.target.closest("[data-log-original]");
    if (original) {
      const img = overlay.querySelector("img");
      if (img) img.src = original.dataset.logOriginal;
      original.disabled = true;
      original.textContent = "已显示原图";
      return;
    }
    if (event.target === overlay || event.target.closest(".maaLogPreviewClose")) closeLogThumbnail();
  });
  document.body.appendChild(overlay);
}

function closeLogThumbnail() {
  document.querySelector(".maaLogPreview")?.remove();
}

function toggleLogTooltipPopup(btn) {
  const existing = document.querySelector(".maaLogTooltipPopup");
  if (existing && existing.dataset.anchorId === btn.dataset.logTooltip) {
    existing.remove();
    return;
  }
  closeLogTooltipPopup();
  let data;
  try { data = JSON.parse(btn.dataset.logTooltip); } catch { data = btn.dataset.logTooltip; }
  const popup = document.createElement("div");
  popup.className = "maaLogTooltipPopup";
  popup.dataset.anchorId = btn.dataset.logTooltip;
  popup.innerHTML = renderTooltipContent(data);
  document.body.appendChild(popup);
  const btnRect = btn.getBoundingClientRect();
  const top = Math.min(btnRect.bottom + 6, window.innerHeight - popup.offsetHeight - 8);
  const left = Math.min(btnRect.left, window.innerWidth - popup.offsetWidth - 8);
  popup.style.top = `${Math.max(8, top)}px`;
  popup.style.left = `${Math.max(8, left)}px`;
}

function closeLogTooltipPopup() {
  document.querySelector(".maaLogTooltipPopup")?.remove();
}

function renderTooltipContent(data) {
  if (!data || typeof data !== "object") return `<div class="tooltipRow">${escapeHtml(String(data))}</div>`;
  const KIND_LABELS = {
    stage_drops: "掉落统计", recruit_tags: "公招Tags", recruit_result: "公招结果",
    facility: "设施", screenshot: "截图方式"
  };
  const kind = data.kind;
  if (kind === "screenshot") return renderScreenshotTooltip(data, KIND_LABELS.screenshot);
  const title = KIND_LABELS[kind] || kind || "详情";
  const rows = Object.entries(data)
    .filter(([k]) => k !== "kind")
    .map(([k, v]) => {
      const val = Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
      return `<div class="tooltipRow"><span class="tooltipKey">${escapeHtml(k)}</span><span class="tooltipVal">${escapeHtml(val)}</span></div>`;
    }).join("");
  return `<div class="tooltipTitle">${escapeHtml(title)}</div>${rows || "<div class=\"tooltipRow\">—</div>"}`;
}

function renderScreenshotTooltip(data, title) {
  const alternatives = Array.isArray(data.alternatives) && data.alternatives.length ? data.alternatives : [data];
  const rows = alternatives.map((item) => {
    const method = item && typeof item === "object" ? (item.method || data.method || "Unknown") : "Unknown";
    const cost = item && typeof item === "object" ? (item.cost != null ? item.cost : "???") : "???";
    return `<div class="tooltipRow tooltipScreencapRow"><span class="tooltipKey">${escapeHtml(method)}</span><span class="tooltipVal">${escapeHtml(`${cost} ms`)}</span></div>`;
  }).join("");
  return `<div class="tooltipTitle">${escapeHtml(title)}</div>${rows || "<div class=\"tooltipRow\">—</div>"}`;
}

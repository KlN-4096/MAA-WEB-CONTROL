let rawLogExpanded = false;
let maaLogViewLoadPromise = null;
const LOG_MAIN_LIST_SELECTOR = '[data-log-list="main"]';
const LOG_RAW_LIST_SELECTOR = '[data-log-list="raw"]';
const LOG_RAW_TOGGLE_SELECTOR = '[data-log-raw-toggle]';

function addLocalLog(level, type, message, detail = {}) {
  addLogItem({ ts: new Date().toISOString(), level, type, message, detail });
}

function addLogItem(item) {
  const event = normalizeLogItem(item);
  state.logs.push(event);
  state.logs = state.logs.slice(-1000);
  if (rawLogExpanded) renderRawLogs();
  if (event.type?.startsWith("maa.task_chain.")) notifyTaskChainEvent(event);
  if (event.type?.startsWith("maa.log.")) {
    handleMaaLogEvent(event);
  } else if (event.type?.startsWith("maa.tools.") && typeof handleToolEvent === "function") {
    handleToolEvent(event);
  } else if (!shouldUseCardLog()) {
    renderLogs();
  }
}

// 小工具/自动战斗直接驱动 adapter，不经过 runner 状态机，
// 只能靠 MaaCore 的任务链事件判断「跑完了没有」。
function notifyTaskChainEvent(event) {
  const finished = ["maa.task_chain.completed", "maa.task_chain.stopped", "maa.task_chain.error"].includes(event.type);
  if (!finished) return;
  // WebSocket 重连时服务端会重放最近 20 条事件，早于本次启动的历史事件不能用来复位状态。
  const at = Date.parse(event.ts);
  const stamp = Number.isNaN(at) ? Date.now() : at;
  if (typeof onCopilotChainEvent === "function") onCopilotChainEvent(event.type, stamp);
  if (typeof onToolsChainEvent === "function") onToolsChainEvent(event.type, stamp);
}

function renderLogs() {
  const logView = getMaaLogView();
  const html = shouldUseCardLog()
    ? (logView && state.logCards.length ? logView.renderLogCards(state.logCards) : `<div class="logEmpty">等待事件</div>`)
    : (logView ? logView.renderLegacyLogItems(state.logs) : renderLegacyLogItemsFallback(state.logs));
  renderLogLists(LOG_MAIN_LIST_SELECTOR, html);
  syncRawLogPanels();
  scrollLogListsToBottom(LOG_MAIN_LIST_SELECTOR);
}

function renderRawLogs() {
  const logView = getMaaLogView();
  renderLogLists(LOG_RAW_LIST_SELECTOR, logView ? logView.renderLegacyLogItems(state.logs) : renderLegacyLogItemsFallback(state.logs));
  syncRawLogPanels();
  scrollLogListsToBottom(LOG_RAW_LIST_SELECTOR);
}

function toggleRawLog() {
  rawLogExpanded = !rawLogExpanded;
  syncRawLogPanels();
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
  return api("/api/logs/clear", { method: "POST" });
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

function renderLogLists(selector, html) {
  document.querySelectorAll(selector).forEach((list) => {
    // innerHTML 重建会把 scrollTop 清零：贴底的继续跟随，回看中的要还原原位置。
    const stick = isScrolledToBottom(list);
    const previousTop = list.scrollTop;
    list.innerHTML = html;
    list.dataset.stick = stick ? "1" : "0";
    if (!stick) list.scrollTop = previousTop;
  });
}

function syncRawLogPanels() {
  document.querySelectorAll(LOG_RAW_TOGGLE_SELECTOR).forEach((btn) => {
    btn.textContent = rawLogExpanded ? "收起" : "展开";
  });
  document.querySelectorAll(LOG_RAW_LIST_SELECTOR).forEach((list) => {
    list.hidden = !rawLogExpanded;
  });
}

const LOG_STICK_THRESHOLD = 24;

// 只有用户本来就停在底部时才自动跟随，否则回看历史会被新日志拽走。
function scrollLogListsToBottom(selector) {
  const lists = Array.from(document.querySelectorAll(selector));
  if (!lists.length) return;
  requestAnimationFrame(() => {
    lists.forEach((list) => {
      if (list.dataset.stick !== "0") list.scrollTop = list.scrollHeight;
    });
  });
}

function isScrolledToBottom(list) {
  if (!list || !list.scrollHeight) return true;
  return list.scrollHeight - list.scrollTop - list.clientHeight < LOG_STICK_THRESHOLD;
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

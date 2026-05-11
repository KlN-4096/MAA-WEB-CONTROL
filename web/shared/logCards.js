const LOG_LEVEL_CLASS = {
  debug: "trace",
  info: "info",
  warning: "warning",
  error: "error"
};

function logEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeLogCard(card = {}) {
  const items = Array.isArray(card.items) ? card.items.map(normalizeMaaLogItem).sort(byTime) : [];
  return {
    id: card.id || "",
    items,
    start_time: card.start_time || items[0]?.time || "",
    end_time: card.end_time || items[items.length - 1]?.time || "",
    thumbnail_id: card.thumbnail_id || "",
    thumbnail_url: card.thumbnail_url || (card.thumbnail_id ? `/api/logs/thumbnails/${card.thumbnail_id}` : ""),
    original_url: card.original_url || "",
    show_thumbnail: Boolean(card.show_thumbnail ?? card.thumbnail_id)
  };
}

function normalizeMaaLogItem(item = {}) {
  return {
    id: item.id || "",
    time: item.time || "",
    content: item.content || "",
    color_key: item.color_key || "MessageLogBrush",
    weight: item.weight || "Regular",
    show_time: item.show_time !== false,
    tooltip: item.tooltip ?? null,
    raw: item.raw ?? {}
  };
}

function normalizeLogEvent(event = {}) {
  return {
    ...event,
    detail: event.detail && typeof event.detail === "object" && !Array.isArray(event.detail) ? event.detail : {}
  };
}

function renderLogCards(cards = []) {
  const normalized = cards.map(normalizeLogCard).filter((card) => card.items.length || card.thumbnail_url);
  if (!normalized.length) return `<div class="logEmpty">等待事件</div>`;
  return normalized.map(renderLogCard).join("");
}

function renderLegacyLogItems(items = []) {
  if (!items.length) return `<div class="logEmpty">等待事件</div>`;
  return items.map(renderLegacyLogItem).join("");
}

function renderLogCard(card) {
  return `<article class="maaLogCard${card.thumbnail_url ? " hasThumbnail" : ""}" data-card-id="${logEscape(card.id)}">
    <aside class="maaLogTimeColumn">
      <time class="maaLogTime">${logEscape(formatLogTime(card.start_time))}</time>
      ${card.thumbnail_url ? renderLogThumbnail(card) : ""}
      ${card.end_time && card.end_time !== card.start_time ? `<time class="maaLogEndTime">${logEscape(formatLogTime(card.end_time))}</time>` : ""}
    </aside>
    <div class="maaLogContent">
      ${card.items.map(renderLogItem).join("")}
    </div>
  </article>`;
}

function renderLogItem(item) {
  // color_key (e.g. "SuccessLogBrush") drives all visual styling via CSS.
  // LOG_LEVEL_CLASS is only consulted for a raw numeric level embedded in the
  // callback detail, which some adapters populate. The color_key itself is not
  // a valid LOG_LEVEL_CLASS key, so that lookup was always undefined.
  const rawLevel = item.raw?.level;
  const levelClass = rawLevel ? (LOG_LEVEL_CLASS[rawLevel] || "") : "";
  return `<div class="maaLogItem ${logEscape(item.color_key)}${levelClass ? ` ${levelClass}` : ""}">
    <div class="maaLogItemBody">
      <div class="maaLogItemLine">${renderLogContent(item.content)}</div>
      ${renderLogTooltipButton(item)}
    </div>
  </div>`;
}

function renderLegacyLogItem(item) {
  const details = renderLogDetails(item.detail);
  return `<div class="logItem ${logEscape(item.level)}">
    <time class="logTime">${logEscape(formatLogTime(item.ts))}</time>
    <div class="logBody">
      <strong class="logMessage">${logEscape(item.message)}</strong>
      <span class="logType">${logEscape(item.type)}</span>
      ${details}
    </div>
  </div>`;
}

function renderLogTooltipButton(item) {
  if (!item.tooltip) return "";
  return `<button type="button" class="maaLogTooltipButton" title="日志提示" data-log-tooltip="${logEscape(JSON.stringify(item.tooltip))}">i</button>`;
}

function renderLogThumbnail(card) {
  return `<button type="button" class="maaLogThumbnail" data-log-thumbnail="${logEscape(card.thumbnail_id)}">
    <img src="${logEscape(card.thumbnail_url)}" alt="" loading="lazy" />
  </button>`;
}

function renderLogContent(content) {
  return logEscape(content).replaceAll("\n", "<br />");
}

function upsertLogCard(cards, nextCard) {
  const card = normalizeLogCard(nextCard);
  const index = cards.findIndex((entry) => entry.id === card.id);
  if (index >= 0) {
    cards[index] = card;
  } else {
    cards.push(card);
  }
  cards.sort(byCardTime);
  return cards;
}

function clearLogCards(cards) {
  cards.length = 0;
  return cards;
}

function byTime(left, right) {
  return new Date(left.time || 0) - new Date(right.time || 0);
}

function byCardTime(left, right) {
  return new Date(left.start_time || 0) - new Date(right.start_time || 0);
}

window.MaaLogView = {
  normalizeLogCard,
  normalizeLogItem: normalizeMaaLogItem,
  normalizeLogEvent,
  renderLogCards,
  renderLegacyLogItems,
  upsertLogCard,
  clearLogCards
};

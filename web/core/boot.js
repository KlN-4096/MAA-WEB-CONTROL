function syncTaskFormOptions() {
  if (typeof setTaskFormOptions === "function") {
    setTaskFormOptions({ ...(state.options || {}), capabilities: state.capabilities });
  }
}

function wireEnabledFeatures() {
  window.MaaFeatures?.list().forEach((feature) => {
    if (wiredFeatureIds.has(feature.id)) return;
    window.MaaFeatures.wire(feature.id, FEATURE_CONTEXT);
    wiredFeatureIds.add(feature.id);
  });
}

async function loadCapabilities() {
  try {
    const result = await api("/api/capabilities");
    state.capabilities = result && typeof result === "object" && !Array.isArray(result) ? result : null;
    if (!state.capabilities) throw new Error("无效的 capabilities 响应");
    window.MaaFeatures?.configure(state.capabilities);
    if (!window.MaaFeatures?.isEnabled(state.currentView)) {
      state.currentView = window.MaaFeatures?.firstId() || DEFAULT_VIEW;
      persistCurrentView();
    }
  } catch (error) {
    state.capabilities = null;
    window.MaaFeatures?.configure(null);
    addLocalLog("warning", "ui.capabilities", "能力配置加载失败，已回退到内置功能。");
  }
  syncTaskFormOptions();
  wireEnabledFeatures();
}

async function loadOptions() {
  try {
    state.options = await api("/api/options");
  } catch (error) {
    state.options = null;
    addLocalLog("warning", "ui.options", "动态选项加载失败，已使用内置选项。");
  }
  syncTaskFormOptions();
  window.MaaFeatures?.call("copilot", "setOptions", state.options);
}

async function loadProfiles() {
  const result = await api("/api/profiles");
  state.profiles = Array.isArray(result.profiles) ? result.profiles : [];
  if (!state.profile && state.profiles.length) await loadProfile(state.profiles[0]);
  renderProfiles();
}

async function loadLogCards() {
  try {
    const logView = getMaaLogView();
    if (!logView) return;
    const result = await api("/api/logs/cards?run_id=current");
    const cards = Array.isArray(result.cards) ? result.cards : [];
    cards.forEach((card) => logView.upsertLogCard(state.logCards, card));
  } catch (error) {
    state.logCards = [];
    addLocalLog("warning", "ui.logs", "卡片日志加载失败，已回退到事件列表。");
  }
}

function renderAll() {
  renderView();
}

function renderMainNav() {
  const nav = document.querySelector(".mainNav");
  if (!nav) return;
  nav.innerHTML = window.MaaFeatures?.list().map((feature) => {
    const active = feature.id === state.currentView ? " active" : "";
    return `<button class="navButton${active}" type="button" data-view="${escapeHtml(feature.id)}">${escapeHtml(feature.title)}</button>`;
  }).join("") || "";
}

function renderView() {
  if (!window.MaaFeatures?.isEnabled(state.currentView) || !window.MaaFeatures?.has(state.currentView) || !$(`view-${state.currentView}`)) {
    state.currentView = window.MaaFeatures?.firstId() || DEFAULT_VIEW;
    persistCurrentView();
  }
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelectorAll(".navButton").forEach((button) => button.classList.remove("active"));
  $(`view-${state.currentView}`).classList.add("active");
  document.querySelector(`[data-view="${state.currentView}"]`)?.classList.add("active");
  setText("viewTitle", window.MaaFeatures?.title(state.currentView) || state.currentView);
  setText("viewSubtitle", state.profile?.name || "");
  window.MaaFeatures?.render(state.currentView, FEATURE_CONTEXT);
}

function switchView(event) {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  closeTaskMenus();
  state.currentView = button.dataset.view;
  persistCurrentView();
  renderView();
}

function wireEvents() {
  document.querySelector(".mainNav").addEventListener("click", switchView);
  $("refreshButton").addEventListener("click", () => boot().catch(showError));
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeyDown);
  wireSettingsContentScroll();
}

function wireSettingsContentScroll() {
  const content = document.querySelector(".content");
  if (content && typeof onSettingsScroll === "function") {
    content.addEventListener("scroll", onSettingsScroll, { passive: true });
  }
}

function onDocumentClick(event) {
  const thumbnail = event.target.closest("[data-log-thumbnail]");
  if (thumbnail) {
    openLogThumbnail(thumbnail.dataset.logThumbnail);
    return;
  }

  const tooltipBtn = event.target.closest("[data-log-tooltip]");
  if (tooltipBtn) {
    toggleLogTooltipPopup(tooltipBtn);
    return;
  }

  if (!event.target.closest(".maaLogTooltipPopup")) {
    closeLogTooltipPopup();
  }

  const addType = event.target.closest("[data-task-add-type]");
  if (addType) {
    if (!isProfileEditingLocked()) {
      runFeatureAction("basement", "addTask", { type: addType.dataset.taskAddType });
    }
    closeTaskTypeMenu();
    return;
  }

  const contextAction = event.target.closest("[data-task-context-action]");
  if (contextAction) {
    if (!isProfileEditingLocked()) {
      runTaskContextAction(contextAction.dataset.taskContextAction);
    }
    closeTaskContextMenu();
    return;
  }

  if (!event.target.closest("#taskTypeMenu") && !event.target.closest("#addTaskButton")) closeTaskTypeMenu();
  if (!event.target.closest("#taskContextMenu")) closeTaskContextMenu();
}

function onDocumentKeyDown(event) {
  if (event.key !== "Escape") return;
  closeLogThumbnail();
  closeLogTooltipPopup();
  closeTaskMenus();
}

function connectEvents() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/api/events`);
  socket.onmessage = (message) => {
    try {
      addLogItem(JSON.parse(message.data));
    } catch (error) {
      addLocalLog("error", "ui.websocket", "事件解析失败", { message: error.message || String(error) });
    }
    scheduleRefreshStatus();
  };
  socket.onclose = () => setTimeout(connectEvents, 2000);
}

async function boot() {
  await ensureMaaLogView();
  await loadCapabilities();
  renderMainNav();
  await loadOptions();
  await loadProfiles();
  await refreshStatus();
  await loadLogCards();
  if (typeof loadSchedulerConfig === "function") await loadSchedulerConfig();
  await loadPostActionConfig();
  if (typeof loadVersionInfo === "function") loadVersionInfo();
  if (typeof loadAdapterConfig === "function") await loadAdapterConfig();
  if (typeof loadNotificationConfig === "function") loadNotificationConfig();
  if (typeof loadRunnerConfig === "function") loadRunnerConfig();
  renderAll();
  renderLogs();
}

patchSettingsInternalScroll();
registerAppFeatures();
wireEvents();
connectEvents();
boot().catch(showError);

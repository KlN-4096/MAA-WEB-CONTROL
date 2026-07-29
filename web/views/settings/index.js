function renderSettingsView() {
  const root = $("settingsViewRoot");
  if (!root) return;
  syncSettingsConfigs();
  syncSettingsFromProfile();
  // 整页 innerHTML 重建会丢焦点并把滚动条弹回折叠块顶部，重建前后要还原。
  const restore = captureSettingsFocus();
  root.innerHTML = `
    <aside class="settingsSideNav">${SETTINGS_SECTIONS.map(settingsNavButton).join("")}</aside>
    <section class="settingsContent">
      ${SETTINGS_SECTIONS.map((section) => settingsSection(section, section.render())).join("")}
    </section>
  `;
  syncSettingsEditingLock();
  const restored = restoreSettingsFocus(restore);
  if (!restored && typeof state !== "undefined" && state.currentView === "settings") {
    requestAnimationFrame(() => scrollSettingsSection(SETTINGS_STATE.selected, "auto"));
  }
}

function captureSettingsFocus() {
  const active = document.activeElement;
  const field = active?.dataset?.settingsField;
  if (!field) return null;
  const scroller = document.querySelector(".content");
  return {
    field,
    scrollTop: scroller ? scroller.scrollTop : 0,
    selectionStart: typeof active.selectionStart === "number" ? active.selectionStart : null,
    selectionEnd: typeof active.selectionEnd === "number" ? active.selectionEnd : null
  };
}

function restoreSettingsFocus(snapshot) {
  if (!snapshot) return false;
  const next = document.querySelector(`[data-settings-field="${snapshot.field}"]`);
  if (!next) return false;
  const scroller = document.querySelector(".content");
  if (scroller) scroller.scrollTop = snapshot.scrollTop;
  next.focus({ preventScroll: true });
  if (snapshot.selectionStart !== null && typeof next.setSelectionRange === "function") {
    try {
      next.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    } catch {
      // number/select 类型不支持选区，忽略
    }
  }
  return true;
}

function wireSettingsView() {
  const root = $("settingsViewRoot");
  if (!root || settingsWired) return;
  root.addEventListener("click", onSettingsClick);
  root.addEventListener("change", onSettingsChange);
  root.addEventListener("input", onSettingsInput);
  window.addEventListener("scroll", onSettingsScroll, { passive: true });
  settingsWired = true;
}

function settingsNavButton(section, index) {
  const active = SETTINGS_STATE.selected === index ? " active" : "";
  return `<button class="settingsNavItem${active}" type="button" data-settings-nav="${index}">${escapeHtml(section.title)}</button>`;
}

function settingsSection(section, body) {
  const expanded = SETTINGS_STATE.expanded[section.key];
  const icon = expanded ? "⌃" : "⌄";
  const hidden = expanded ? "" : " hidden";
  return `<section class="settingsFold" data-settings-section="${section.key}">
    <button class="settingsFoldHead" type="button" data-settings-toggle="${section.key}">
      <strong>${escapeHtml(section.title)}</strong><span>${icon}</span>
    </button>
    <div class="settingsFoldBody"${hidden}>${body}</div>
  </section>`;
}

const SETTINGS_ACTION_NAMES = ["selectSection", "toggleSection", "addConfig", "deleteConfig", "persist"];
const SETTINGS_ACTIONS = Object.fromEntries(
  SETTINGS_ACTION_NAMES.map((action) => [action, (payload) => runSettingsAction(action, payload)])
);

if (window.MaaFeatures) {
  window.MaaFeatures.register("settings", {
    id: "settings",
    order: 3,
    title: "设置",
    render: renderSettingsView,
    wire: wireSettingsView,
    actions: SETTINGS_ACTIONS,
    getState: () => SETTINGS_STATE,
    persist: persistSettingsState
  });
}

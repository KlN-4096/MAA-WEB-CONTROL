function renderSettingsView() {
  const root = $("settingsViewRoot");
  if (!root) return;
  syncSettingsConfigs();
  syncSettingsFromProfile();
  root.innerHTML = `
    <aside class="settingsSideNav">${SETTINGS_SECTIONS.map(settingsNavButton).join("")}</aside>
    <section class="settingsContent">
      ${SETTINGS_SECTIONS.map((section) => settingsSection(section, section.render())).join("")}
    </section>
  `;
  syncSettingsEditingLock();
  if (typeof state !== "undefined" && state.currentView === "settings") {
    requestAnimationFrame(() => scrollSettingsSection(SETTINGS_STATE.selected, "auto"));
  }
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

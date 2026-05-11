function scrollSettingsSection(index, behavior = "smooth") {
  const section = SETTINGS_SECTIONS[index];
  const target = document.querySelector(`[data-settings-section="${section?.key}"]`);
  if (!target) return;
  suppressSettingsScroll(behavior === "smooth" ? SETTINGS_SMOOTH_SCROLL_SUPPRESS_MS : SETTINGS_AUTO_SCROLL_SUPPRESS_MS);
  const top = target.getBoundingClientRect().top + window.scrollY - 64;
  window.scrollTo({ top, behavior });
}

function onSettingsScroll() {
  if (state.currentView !== "settings" || settingsScrollRaf) return;
  settingsScrollRaf = requestAnimationFrame(() => {
    settingsScrollRaf = 0;
    updateSettingsNavFromScroll();
  });
}

function updateSettingsNavFromScroll() {
  if (isSettingsScrollSuppressed()) return;
  const sections = [...document.querySelectorAll(".settingsFold")];
  if (!sections.length) return;
  const focusY = 90;
  let selected = 0;
  sections.forEach((section, index) => {
    if (section.getBoundingClientRect().top <= focusY) {
      selected = index;
    }
  });
  setSettingsSelected(selected);
}

function suppressSettingsScroll(duration) {
  settingsProgrammaticScrollUntil = Math.max(settingsProgrammaticScrollUntil, Date.now() + duration);
  clearTimeout(settingsProgrammaticScrollTimer);
  settingsProgrammaticScrollTimer = setTimeout(() => {
    if (Date.now() >= settingsProgrammaticScrollUntil) {
      settingsProgrammaticScrollUntil = 0;
    }
  }, duration + 20);
}

function isSettingsScrollSuppressed() {
  return Date.now() < settingsProgrammaticScrollUntil;
}

function setSettingsSelected(index) {
  if (index === SETTINGS_STATE.selected) return;
  SETTINGS_STATE.selected = index;
  persistSettingsState();
  syncSettingsNavActive();
}

function syncSettingsNavActive() {
  document.querySelectorAll("[data-settings-nav]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.settingsNav) === SETTINGS_STATE.selected);
  });
}

function patchSettingsInternalScroll() {
  if (typeof scrollSettingsSection !== "function") return;
  scrollSettingsSection = (index, behavior = "smooth") => {
    const target = document.querySelectorAll(".settingsFold")[index];
    const scroller = document.querySelector(".content");
    if (!target || !scroller) return;
    if (typeof suppressSettingsScroll === "function") {
      const smoothDuration = typeof SETTINGS_SMOOTH_SCROLL_SUPPRESS_MS === "number" ? SETTINGS_SMOOTH_SCROLL_SUPPRESS_MS : 1200;
      const autoDuration = typeof SETTINGS_AUTO_SCROLL_SUPPRESS_MS === "number" ? SETTINGS_AUTO_SCROLL_SUPPRESS_MS : 120;
      suppressSettingsScroll(behavior === "smooth" ? smoothDuration : autoDuration);
    }
    const targetTop = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 16;
    scroller.scrollTo({ top: Math.max(0, targetTop), behavior });
  };
}

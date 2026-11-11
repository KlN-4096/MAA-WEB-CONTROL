const APPEARANCE_FIELDS = new Set(["uiTheme","dateFormat","operatorLanguage","backgroundEnabled","backgroundOpacity","backgroundBlur","backgroundFit","backgroundVersion"]);

function applyAppearance() {
  const theme = SETTINGS_STATE.uiTheme || "dark";
  const light = theme === "light" || (theme === "system" && window.matchMedia?.("(prefers-color-scheme: light)").matches);
  document.documentElement.dataset.theme = light ? "light" : "dark";
  const shell = document.querySelector(".windowShell");
  if (!shell) return;
  shell.classList.toggle("customBackground",Boolean(SETTINGS_STATE.backgroundEnabled));
  shell.style.setProperty("--custom-background",`url("/api/ui/background?v=${Number(SETTINGS_STATE.backgroundVersion || 0)}")`);
  shell.style.setProperty("--background-opacity",String(Number(SETTINGS_STATE.backgroundOpacity ?? 50)/100));
  shell.style.setProperty("--background-blur",`${Number(SETTINGS_STATE.backgroundBlur || 0)}px`);
  shell.style.setProperty("--background-size", {cover:"cover",contain:"contain",stretch:"100% 100%",tile:"auto"}[SETTINGS_STATE.backgroundFit] || "cover");
  shell.style.setProperty("--background-repeat",SETTINGS_STATE.backgroundFit === "tile" ? "repeat" : "no-repeat");
}

async function uploadBackground(file) {
  if (!file) return;
  const image = await readImageFile(file);
  await api("/api/ui/background",{method:"PUT",body:JSON.stringify({image_base64:image})});
  SETTINGS_STATE.backgroundEnabled = true;
  SETTINGS_STATE.backgroundVersion = Date.now();
  persistSettingsState();
  applyAppearance();
  renderSettingsView();
  showNotice("背景已保存","success");
}

function operatorDisplayName(name) {
  const language = SETTINGS_STATE.operatorLanguage || "zh";
  if (language === "zh") return name;
  const operators = activeClientOptions()?.operators || [];
  const operator = operators.find((item)=>item.name === name);
  return operator?.names?.[language] || name;
}

function formatUiDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  const short = SETTINGS_STATE.dateFormat === "HH:mm";
  const time = date.toLocaleTimeString("zh-CN",{hour12:false,hour:"2-digit",minute:"2-digit",...(short?{}:{second:"2-digit"})});
  if (SETTINGS_STATE.dateFormat !== "yyyy-MM-dd HH:mm:ss") return time;
  const pad = (n)=>String(n).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${time}`;
}

window.matchMedia?.("(prefers-color-scheme: light)")?.addEventListener("change",applyAppearance);

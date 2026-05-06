const SETTINGS_SECTIONS = [
  { key: "config", title: "切换配置", render: renderConfigSection },
  { key: "timer", title: "定时执行", render: renderTimerSection },
  { key: "game", title: "运行设置", render: renderGameSection },
  { key: "performance", title: "性能设置", render: renderPerformanceSection },
  { key: "connection", title: "连接设置", render: renderConnectionSection },
  { key: "maacore", title: "MAA 核心", render: renderMaaCoreSection },
  { key: "startup", title: "启动设置", render: renderStartupSection },
  { key: "ui", title: "界面设置", render: renderUiSection },
  { key: "background", title: "背景设置", render: renderBackgroundSection },
  { key: "remote", title: "远程控制", render: renderRemoteSection },
  { key: "notification", title: "外部通知", render: renderNotificationSection },
  { key: "update", title: "更新设置", render: renderUpdateSection },
  { key: "issue", title: "问题反馈", render: renderIssueSection },
  { key: "about", title: "关于我们", render: renderAboutSection }
];

const SETTINGS_STORAGE_KEY = "maa-web.settingsState";
const SETTINGS_CONDITIONAL_FIELDS = new Set([
  "forceStart",
  "customConfig",
  "autoDetectConnection",
  "connectConfig",
  "useCardLog",
  "proxyType",
  "maaAdapterType",
  "ldExtrasEnabled",
  "ldManualIndex",
  "mumuExtrasEnabled",
  "mumuBridge",
  "emulatorLaunchEnabled"
]);
const SETTINGS_PERSISTED_FIELDS = [
  "selected",
  "expanded",
  "customConfig",
  "forceStart",
  "showBeforeForce",
  "clientType",
  "blockSleep",
  "blockSleepScreenOn",
  "enablePenguin",
  "connectConfig",
  "adbAddress",
  "adbPath",
  "touchMode",
  "autoDetectConnection",
  "detectEveryTime",
  "ldExtrasEnabled",
  "ldManualIndex",
  "ldExtrasPath",
  "ldExtrasIndex",
  "mumuExtrasEnabled",
  "mumuBridge",
  "useTray",
  "useCardLog",
  "updateSource",
  "forceGithub",
  "proxyType",
  "achievementPopupDisabled",
  "achievementPopupAutoClose",
  "logThumbnailMax",
  "maaAdapterType",
  "maaCoreDir",
  "timers",
  "emulatorLaunchEnabled",
  "emulatorLaunchCommand",
  "emulatorLaunchWait"
];
const SETTINGS_AUTO_SCROLL_SUPPRESS_MS = 120;
const SETTINGS_SMOOTH_SCROLL_SUPPRESS_MS = 1200;

const SETTINGS_STATE = {
  selected: 0,
  expanded: Object.fromEntries(SETTINGS_SECTIONS.map((section) => [section.key, true])),
  customConfig: true,
  forceStart: true,
  showBeforeForce: false,
  clientType: "Official",
  blockSleep: true,
  blockSleepScreenOn: true,
  enablePenguin: true,
  connectConfig: "LDPlayer",
  adbAddress: "127.0.0.1:5555",
  adbPath: "adb",
  touchMode: "Minitouch（默认）",
  autoDetectConnection: false,
  detectEveryTime: true,
  ldExtrasEnabled: true,
  ldManualIndex: false,
  ldExtrasPath: "",
  ldExtrasIndex: 0,
  mumuExtrasEnabled: true,
  mumuBridge: false,
  useTray: true,
  useCardLog: true,
  logThumbnailMax: 100,
  updateSource: "Overseas",
  forceGithub: true,
  proxyType: "",
  achievementPopupDisabled: true,
  achievementPopupAutoClose: true,
  maaVersion: "—",
  resourceVersion: "—",
  maaAdapterType: "",
  maaCoreDir: "",
  maaActiveType: "dry-run",
  newConfigName: "",
  configs: [],
  currentConfig: "",
  configsDirty: false,
  configsSource: "",
  timers: Array.from({ length: 8 }, (_, index) => ({
    enabled: index >= 6,
    hour: index * 3,
    minute: 0,
    config: ""
  })),
  emulatorLaunchEnabled: false,
  emulatorLaunchCommand: "",
  emulatorLaunchWait: 60
};

Object.assign(SETTINGS_STATE, restoreSettingsState());

let settingsWired = false;
let settingsScrollRaf = 0;
let settingsProgrammaticScrollUntil = 0;
let settingsProgrammaticScrollTimer = 0;

function restoreSettingsState() {
  const parsed = readSettingsStorage();
  if (!parsed) return {};
  const restored = {};
  if (Number.isInteger(parsed.selected)) {
    restored.selected = Math.max(0, Math.min(parsed.selected, SETTINGS_SECTIONS.length - 1));
  }
  if (MaaStorage.isObject(parsed.expanded)) {
    restored.expanded = Object.fromEntries(SETTINGS_SECTIONS.map((section) => [
      section.key,
      typeof parsed.expanded[section.key] === "boolean" ? parsed.expanded[section.key] : true
    ]));
  }
  [
    "customConfig",
    "forceStart",
    "showBeforeForce",
    "blockSleep",
    "blockSleepScreenOn",
    "enablePenguin",
    "autoDetectConnection",
    "detectEveryTime",
    "ldExtrasEnabled",
    "ldManualIndex",
    "mumuExtrasEnabled",
    "mumuBridge",
    "useTray",
    "useCardLog",
    "forceGithub",
    "achievementPopupDisabled",
    "achievementPopupAutoClose"
  ].forEach((field) => MaaStorage.copyBoolean(parsed, restored, field));
  ["clientType", "connectConfig", "adbAddress", "adbPath", "touchMode", "updateSource", "proxyType", "maaAdapterType", "maaCoreDir", "ldExtrasPath"].forEach((field) => MaaStorage.copyString(parsed, restored, field));
  if (Number.isInteger(parsed.ldExtrasIndex)) restored.ldExtrasIndex = Math.max(0, parsed.ldExtrasIndex);
  if (parsed?.logThumbnailMax !== undefined) restored.logThumbnailMax = clampNumber(parsed.logThumbnailMax, 1, 9999, SETTINGS_STATE.logThumbnailMax);
  if (Array.isArray(parsed.timers)) restored.timers = restoreTimers(parsed.timers);
  MaaStorage.copyBoolean(parsed, restored, "emulatorLaunchEnabled");
  MaaStorage.copyString(parsed, restored, "emulatorLaunchCommand");
  if (Number.isFinite(parsed.emulatorLaunchWait)) {
    restored.emulatorLaunchWait = Math.max(0, Math.min(300, Math.round(parsed.emulatorLaunchWait)));
  }
  return restored;
}

function readSettingsStorage() {
  return MaaStorage.readObject(SETTINGS_STORAGE_KEY, null);
}

function persistSettingsState() {
  MaaStorage.writeObject(SETTINGS_STORAGE_KEY, MaaStorage.pick(SETTINGS_STATE, SETTINGS_PERSISTED_FIELDS));
}

function restoreTimers(timers) {
  return SETTINGS_STATE.timers.map((timer, index) => {
    const value = timers[index];
    if (!value || typeof value !== "object" || Array.isArray(value)) return timer;
    return {
      enabled: typeof value.enabled === "boolean" ? value.enabled : timer.enabled,
      hour: clampNumber(value.hour, 0, 23, timer.hour),
      minute: clampNumber(value.minute, 0, 59, timer.minute),
      config: typeof value.config === "string" ? value.config : timer.config
    };
  });
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

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

function renderConfigSection() {
  const options = configOptions(SETTINGS_STATE.currentConfig);
  return `<div class="configReplica">
    <label class="settingsField">
      <span>配置名称</span>
      <span class="settingsComboLine">
        <select data-settings-current-config>${options}</select>
        <button class="settingsIconButton" type="button" title="删除配置" data-settings-delete-config>×</button>
      </span>
    </label>
    <div class="settingsAddLine">
      <input data-settings-new-config value="${escapeHtml(SETTINGS_STATE.newConfigName)}" autocomplete="off" />
      <button type="button" data-settings-add-config>添加</button>
    </div>
  </div>`;
}

function renderTimerSection() {
  const globalTip = SETTINGS_STATE.configs.length > 1
    ? `<p class="settingsGlobalTip">此选项页为全局配置</p>`
    : "";
  const showBefore = SETTINGS_STATE.forceStart
    ? `<div class="timerShowRow">${settingsCheck("showBeforeForce", "强制定时启动前显示窗口")}</div>`
    : "";
  return `<div class="timerReplica">
    ${globalTip}
    <div class="timerFlags">
      ${settingsCheck("forceStart", "强制定时启动", "停止当前任务，重启游戏并开始新任务")}
      ${settingsCheck("customConfig", "自定义配置选择", "将提前两分钟重启并切换配置")}
    </div>
    ${showBefore}
    <div class="timerGrid">${SETTINGS_STATE.timers.map(timerRow).join("")}</div>
  </div>`;
}

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

function renderPerformanceSection() {
  return settingsColumn(`
    <p class="settingsGlobalTip">性能设置暂未接入 Web 版，以下选项仅供查看。</p>
    ${fieldRow("使用 GPU 加速推理", selectBox(["系统默认 GPU", "CPU", "DirectML", "CUDA"], 0, "", "settingsControlL", " disabled"), "使用 GPU 推理能够以极低的 GPU 占用显著降低 CPU 的负担")}
  `);
}

function renderGameSection() {
  const clientType = typeof canonicalClientType === "function" ? canonicalClientType(SETTINGS_STATE.clientType) : SETTINGS_STATE.clientType;
  const clientOptions = typeof clientTypeOptionsList === "function" ? clientTypeOptionsList() : [
    { label: "官服", value: "Official" },
    { label: "Bilibili服", value: "Bilibili" },
    { label: "国际服 (YostarEN)", value: "YoStarEN" },
    { label: "日服 (YostarJP)", value: "YoStarJP" },
    { label: "韩服 (YostarKR)", value: "YoStarKR" },
    { label: "繁中服 (txwy)", value: "txwy" }
  ];
  const overseasTip = clientType && !["Official", "Bilibili"].includes(clientType)
    ? '<p class="settingsLineText">海外服资源适配提示</p>'
    : "";
  const yostarTip = clientType === "YoStarEN"
    ? '<p class="settingsLineText">YoStarEN 需要使用 1920x1080 分辨率。</p>'
    : "";
  return settingsColumn(`
    ${fieldRow("客户端类型", selectBox(clientOptions, clientType, "clientType"))}
    ${yostarTip}
    ${overseasTip}
    <p class="settingsGlobalTip">以下选项暂未接入 Web 版：</p>
    ${checkLine("划火柴模式（自动战斗相关）（不稳定，暂不推荐开启）", false, "", "", true)}
    ${fieldRow("开始前脚本", textBox("Example: \"C:\\\\1.cmd\" -minimized", "settingsControlXL", "", " disabled"))}
    ${fieldRow("结束后脚本", textBox("Example: \"C:\\\\1.cmd\" -noWindow", "settingsControlXL", "", " disabled"))}
    <div class="settingsInlinePair">${checkLine("自动战斗时启用上述脚本", false, "", "", true)}${checkLine("手动暂停时启用上述脚本", false, "", "", true)}</div>
    <div class="settingsInlinePair">${checkLine("运行任务时阻止休眠", true, "", "", true)}${checkLine("阻止休眠时保持屏幕常亮", true, "", "", true)}</div>
    <div class="settingsInlinePair">${checkLine("上报企鹅物流", true, "", "", true)}${checkLine("上报一图流", false, "", "", true)}</div>
    ${fieldRow("企鹅物流 ID（仅数字部分）", textBox("", "settingsControlL", "", " disabled"))}
    <div class="settingsInlinePair">
      ${fieldRow("任务超时时间（分钟）", numberBox("60", "settingsControlS", "", " disabled"))}
      ${fieldRow("提醒间隔时间（分钟）", numberBox("30", "settingsControlS", "", " disabled"))}
    </div>
  `);
}

function renderConnectionSection() {
  const disabledAuto = SETTINGS_STATE.autoDetectConnection ? " disabled" : "";
  const isLd = SETTINGS_STATE.connectConfig === "LDPlayer";
  const isMumu = SETTINGS_STATE.connectConfig === "MuMuEmulator12";
  return settingsColumn(`
    ${checkLine("自动检测连接", false, "自动寻找可用模拟器连接。", "autoDetectConnection")}
    ${checkLine("每次重新检测", true, "端口经常变化时再启用。", "detectEveryTime")}
    ${fieldRow("连接配置", selectBox([
      { label: "雷电模拟器", value: "LDPlayer" },
      { label: "MuMu 模拟器", value: "MuMuEmulator12" },
      { label: "通用", value: "General" }
    ], SETTINGS_STATE.connectConfig, "connectConfig"), "", "settingsControlXL")}
    ${fieldRow("连接地址", textBox(SETTINGS_STATE.adbAddress, "settingsControlXL", "adbAddress", disabledAuto), "写入当前 profile.adb.address")}
    ${fieldRow("ADB 路径", textBox(SETTINGS_STATE.adbPath, "settingsControlXL", "adbPath", disabledAuto))}
    ${isLd ? checkLine("启用 LD 截图增强模式", true, "启用后可解锁 LDExtras 高速截图。", "ldExtrasEnabled") : ""}
    ${isLd && SETTINGS_STATE.ldExtrasEnabled ? fieldRow("LD 安装路径", textBox(SETTINGS_STATE.ldExtrasPath, "settingsControlXXL", "ldExtrasPath"), "雷电模拟器安装目录，含 ldopengl64.dll") : ""}
    ${isLd && SETTINGS_STATE.ldExtrasEnabled ? checkLine("手动填写「实例编号」", false, "", "ldManualIndex") : ""}
    ${isLd && SETTINGS_STATE.ldExtrasEnabled && SETTINGS_STATE.ldManualIndex ? fieldRow("实例编号", numberBox(String(SETTINGS_STATE.ldExtrasIndex), "settingsControlS", "ldExtrasIndex")) : ""}
    ${isMumu ? checkLine("启用 MuMu 截图增强模式", true, "", "mumuExtrasEnabled", true) : ""}
    ${isMumu ? fieldRow("MuMu 安装路径", textBox("C:\\\\Program Files\\\\Netease\\\\MuMuPlayer-12.0", "settingsControlXXL", "", " disabled")) : ""}
    ${isMumu ? checkLine("MuMu 网络桥接模式", false, "", "mumuBridge", true) : ""}
    ${isMumu && SETTINGS_STATE.mumuBridge ? fieldRow("MuMu 实例编号", numberBox("0", "settingsControlS", "", " disabled")) : ""}
    ${fieldRow("触控模式", selectBox(["Minitouch（默认）", "MaaTouch（实验功能）", "ADB Input（不推荐使用）", "MaaFramework（实验功能）"], SETTINGS_STATE.touchMode, "touchMode"))}
    <div class="settingsInlinePair">${checkLine("退出时释放 ADB", true, "", "", true)}${checkLine("使用 ADB Lite（实验性功能）", false, "", "", true)}</div>
    <p class="settingsGlobalTip">以下选项暂未接入 Web 版：</p>
    ${checkLine("ADB 连接失败时尝试启动模拟器", true, "连接失败后自动启动模拟器。", "", true)}
    ${checkLine("连接失败后尝试重启 ADB Server", true, "", "", true)}
    ${checkLine("连接失败后尝试关闭并重启 ADB 进程", true, "", "", true)}
    <button class="settingsButtonSmall" type="button" data-settings-action="screenshotTest">截图测试</button>
    <p class="settingsLineText" id="screenshotTestResult">点击「截图测试」以验证当前 ADB 连接的截图能力。</p>
  `);
}

function renderMaaCoreSection() {
  const isOfficial = SETTINGS_STATE.maaAdapterType === "official";
  return settingsColumn(`
    <p class="settingsGlobalTip">配置 MAA 核心适配器。当前运行中：<strong>${escapeHtml(SETTINGS_STATE.maaActiveType)}</strong></p>
    ${fieldRow("适配器类型", selectBox([
      { label: "DryRun（模拟运行，不实际操作）", value: "" },
      { label: "Official（使用本地 MaaCore DLL）", value: "official" }
    ], SETTINGS_STATE.maaAdapterType, "maaAdapterType"))}
    ${isOfficial ? fieldRow("MaaCore 目录", textBox(SETTINGS_STATE.maaCoreDir, "settingsControlXXL", "maaCoreDir"), "MAA 安装目录，包含 MaaCore.dll 的文件夹") : ""}
    <div class="settingsInlinePair">
      <button class="settingsButtonSmall" type="button" data-settings-action="applyAdapter">应用并切换</button>
      <span id="maaAdapterStatus" class="settingsLineText"></span>
    </div>
  `);
}

function renderStartupSection() {
  const launchDetail = SETTINGS_STATE.emulatorLaunchEnabled ? `
    <div class="timerEmulatorConfig">
      <div class="timerEmulatorRow">
        <span class="timerEmulatorLabel">启动命令</span>
        <input class="timerEmulatorInput" type="text" data-settings-field="emulatorLaunchCommand"
          value="${escapeHtml(SETTINGS_STATE.emulatorLaunchCommand)}"
          placeholder="Windows: path\\to\\emulator.exe  Linux: docker start redroid" />
      </div>
      <div class="timerEmulatorRow">
        <span class="timerEmulatorLabel">等待秒数</span>
        <input class="timerEmulatorWait" type="number" min="0" max="300"
          data-settings-field="emulatorLaunchWait"
          value="${SETTINGS_STATE.emulatorLaunchWait}" />
        <span class="timerEmulatorUnit">秒</span>
      </div>
    </div>` : "";
  return settingsColumn(`
    <div class="settingsSplit">
      <div class="settingsColumn">
        <p class="settingsGlobalTip" style="text-align:left">以下选项暂未接入 Web 版：</p>
        ${checkLine("开机自动启动 MAA", false, "需要系统权限时可能失败。", "", true)}
        ${checkLine("启动 MAA 后直接最小化", true, "", "", true)}
        ${checkLine("启动 MAA 后直接运行", false, "", "", true)}
      </div>
      <div class="settingsColumn">
        <p class="settingsGlobalTip" style="text-align:left">定时任务触发前自动启动：</p>
        ${checkLine("自动启动模拟器/容器", SETTINGS_STATE.emulatorLaunchEnabled, "定时任务触发时先执行启动命令，等待就绪后再连接 ADB。", "emulatorLaunchEnabled")}
        ${launchDetail}
      </div>
    </div>
  `);
}

function renderRemoteSection() {
  return settingsColumn(`
    <p class="settingsGlobalTip">远程控制功能暂未实现，以下选项仅供参考。</p>
    <p class="settingsLineText">注意：随意填入未知来源的地址可能会导致您的账户受到损失。</p>
    ${fieldRow("获取任务端点", textBox("", "settingsControlXL", "", " disabled"))}
    ${fieldRow("汇报任务端点", textBox("", "settingsControlXL", "", " disabled"))}
    ${fieldRow("轮询间隔 (ms)", numberBox("1000", "settingsControlS", "", " disabled"))}
    ${fieldRow("用户标识符", inputButton("", "测试连接", "settingsControlL", " disabled"))}
    ${fieldRow("设备标识符（只读）", inputButton("", "重新生成", "settingsControlL", " disabled"))}
    <a class="settingsLink" href="https://maa.plus/docs/开发文档/远程控制协议.html" target="_blank" rel="noreferrer">远程控制功能开发者文档</a>
  `);
}

function renderUiSection() {
  return settingsColumn(`
    <p class="settingsGlobalTip">此选项页为全局配置</p>
    <div class="settingsSplit">
      <div class="settingsColumn">
        ${checkLine("使用卡片样式日志", true, "以任务卡片形式展示运行日志（推荐）。", "useCardLog")}
        ${SETTINGS_STATE.useCardLog ? fieldRow("日志缩略图最大数量", numberBox(String(SETTINGS_STATE.logThumbnailMax), "settingsControlL", "logThumbnailMax")) : ""}
        <p class="settingsGlobalTip">以下选项暂未接入 Web 版：</p>
        ${checkLine("显示托盘图标", true, "", "", true)}
        ${checkLine("最小化时隐藏至托盘", false, "", "", true)}
        ${checkLine("重要信息弹出系统通知", false, "重要事件弹出系统通知。", "", true)}
        ${checkLine("隐藏关闭按钮", false, "", "", true)}
        ${checkLine("窗口标题滚动", false, "", "", true)}
        ${checkLine("反转主任务右键单击效果", false, "切换主任务右键行为。", "", true)}
        ${checkLine("使用软件渲染", false, "用于规避部分图形模块异常。", "", true)}
        ${fieldRow("日期格式字符串", selectBox(["HH:mm:ss", "HH:mm", "yyyy-MM-dd HH:mm:ss"], 0, "", "settingsControlL", " disabled"))}
      </div>
      <div class="settingsColumn">
        ${fieldRow("语言 / Language", selectBox(["简体中文", "English", "日本語"], 0, "", "settingsControlL", " disabled"))}
        ${fieldRow("干员名称显示语言", selectBox(["跟随 MAA", "简体中文", "English"], 0, "", "settingsControlL", " disabled"))}
        ${fieldRow("界面主题", selectBox(["与系统同步", "深色", "浅色"], 0, "", "settingsControlL", " disabled"))}
        ${fieldRow("主界面可选择按钮功能", selectBox(["清空", "全选", "开始"], 0, "", "settingsControlL", " disabled"))}
      </div>
    </div>
  `);
}

function renderBackgroundSection() {
  return settingsColumn(`
    <p class="settingsGlobalTip">背景设置暂未实现，以下选项仅供参考。</p>
    ${fieldRow("背景图片", inputButton("", "选择", "settingsControlL", " disabled"))}
    ${sliderRow("背景不透明度", 50)}
    ${sliderRow("背景模糊半径", 12)}
    ${fieldRow("背景填充模式", selectBox(["拉伸填充", "适应", "平铺"], 0, "", "settingsControlL", " disabled"))}
  `);
}

function renderNotificationSection() {
  return settingsColumn(`
    <p class="settingsGlobalTip">外部通知功能暂未实现。</p>
    ${fieldRow("通知渠道", `${selectBox(["（未实现）", "Server酱", "Telegram", "Discord"], 0, "", "settingsControlL", " disabled")}<button class="settingsButtonSmall" type="button" disabled>发送测试</button>`)}
  `);
}

function renderHotkeySection() {
  return settingsColumn(`<p class="settingsGlobalTip">全局热键在浏览器中不可用。</p>`);
}

function renderAchievementSection() {
  return settingsColumn(`<p class="settingsGlobalTip">成就系统仅桌面版可用。</p>`);
}

function renderUpdateSection() {
  const isGithub = SETTINGS_STATE.updateSource === "Github";
  const isMirror = SETTINGS_STATE.updateSource === "MirrorChyan";
  return settingsColumn(`
    <p class="settingsGlobalTip">此选项页为全局配置。自动更新功能仅桌面版可用，Web 版由部署方维护更新。</p>
    <div class="settingsSplit settingsUpdateGrid">
      <div class="settingsColumn">
        ${checkLine("启动时检查更新", true, "", "", true)}
        ${checkLine("定时检查更新", true, "定期检查更新。", "", true)}
        ${checkLine("自动下载更新包", true, "", "", true)}
        ${checkLine("自动安装更新包", true, "", "", true)}
        ${checkLine("显示 MAA.Updater 控制台输出", false, "", "", true)}
        ${isGithub ? checkLine("强制使用 GitHub", true, "忽略代理源配置。", "forceGithub", true) : ""}
        ${fieldRow("更新渠道", selectBox(["公测版", "稳定版", "内测版"], 0, "", "settingsControlL", " disabled"))}
        ${fieldRow("更新源", selectBox([
          { label: "海外源", value: "Overseas" },
          { label: "GitHub", value: "Github" },
          { label: "Mirror酱", value: "MirrorChyan" }
        ], SETTINGS_STATE.updateSource, "updateSource", "settingsControlL", " disabled"))}
        ${isMirror ? fieldRow("Mirror酱 CDK", inputButton("", "复制", "settingsControlL", " disabled")) : ""}
        ${fieldRow("HTTP Proxy", selectBox(["", "HTTP Proxy"], SETTINGS_STATE.proxyType, "proxyType"))}
        ${SETTINGS_STATE.proxyType ? textBox("", "settingsControlL", "proxyAddress") : ""}
      </div>
      <div class="settingsColumn">
        ${badgeRow("软件版本", SETTINGS_STATE.maaVersion)}
        ${badgeRow("资源版本", SETTINGS_STATE.resourceVersion)}
        <div class="settingsInlinePair">
          <button class="settingsButtonSmall" type="button" disabled>软件更新</button>
          <button class="settingsButtonSmall" type="button" disabled>更新日志</button>
        </div>
        <button class="settingsButtonSmall" type="button" disabled>资源更新</button>
      </div>
    </div>
  `);
}

function renderIssueSection() {
  return settingsColumn(`
    <p class="settingsLineText">请在确认您的问题不属于「常见问题」后，再进行「问题反馈」</p>
    <div class="settingsSplit settingsIssueGrid">
      <div class="settingsColumn">
        <a class="settingsLink" href="https://maa.plus/docs/用户手册/常见问题.html" target="_blank" rel="noreferrer">常见问题</a>
        <a class="settingsLink" href="https://github.com/MaaAssistantArknights/MaaAssistantArknights/issues" target="_blank" rel="noreferrer">问题反馈 (GitHub Issues)</a>
      </div>
      <div class="settingsColumn">
        <button class="settingsButtonSmall" type="button" disabled>生成日志压缩包</button>
        <button class="settingsButtonSmall" type="button" disabled>打开日志文件夹</button>
        <span class="settingsCheckLine"><button class="settingsButtonSmall" type="button" disabled>清空图片缓存</button>${settingsTip("清理调试截图缓存。")}</span>
      </div>
    </div>
  `);
}

function renderAboutSection() {
  return settingsColumn(`
    <div class="settingsSplit settingsAboutGrid">
      <div class="settingsColumn">
        <a class="settingsLink" href="https://maa.plus" target="_blank" rel="noreferrer">MAA 官网</a>
        <a class="settingsLink" href="https://github.com/MaaAssistantArknights/MaaAssistantArknights" target="_blank" rel="noreferrer">源码: GitHub</a>
        <a class="settingsLink" href="https://space.bilibili.com/3493274731940507" target="_blank" rel="noreferrer">bilibili</a>
      </div>
      <div class="settingsColumn">
        <a class="settingsLink" href="https://discord.gg/23KMRefaXz" target="_blank" rel="noreferrer">Discord</a>
        <a class="settingsLink" href="https://t.me/+Mgc2Zngr-hs3ZjU1" target="_blank" rel="noreferrer">Telegram</a>
        <a class="settingsLink" href="https://ota.maa.plus/MaaAssistantArknights/MaaRelease/releases/tag/latest" target="_blank" rel="noreferrer">最新版本</a>
      </div>
    </div>
  `);
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

function onSettingsClick(event) {
  const nav = event.target.closest("[data-settings-nav]");
  if (nav) {
    runSettingsAction("selectSection", { index: Number(nav.dataset.settingsNav) });
    return;
  }
  const toggle = event.target.closest("[data-settings-toggle]");
  if (toggle) {
    runSettingsAction("toggleSection", { key: toggle.dataset.settingsToggle });
    return;
  }
  if (isSettingsEditingLocked() && (event.target.closest("[data-settings-add-config]") || event.target.closest("[data-settings-delete-config]"))) {
    return;
  }
  if (event.target.closest("[data-settings-add-config]")) {
    runSettingsAction("addConfig")?.catch(showError);
    return;
  }
  if (event.target.closest("[data-settings-delete-config]")) {
    runSettingsAction("deleteConfig")?.catch(showError);
    return;
  }
  if (event.target.closest("[data-settings-action='screenshotTest']")) {
    runSettingsScreenshotTest();
    return;
  }
  if (event.target.closest("[data-settings-action='applyAdapter']")) {
    applyAdapterConfig();
  }
}

function onSettingsChange(event) {
  if (isSettingsEditingLocked() && isSettingsWriteTarget(event.target)) {
    syncSettingsEditingLock();
    return;
  }
  if (event.target.matches("[data-settings-current-config]")) {
    SETTINGS_STATE.currentConfig = event.target.value;
    persistSettingsState();
    if (typeof switchProfileConfig === "function") {
      switchProfileConfig(event.target.value).catch(showError);
    }
    return;
  }
  const flag = event.target.closest("[data-settings-flag]");
  if (flag) {
    SETTINGS_STATE[flag.dataset.settingsFlag] = flag.checked;
    persistSettingsState();
    saveSettingsProfile();
    if (["forceStart", "emulatorLaunchEnabled"].includes(flag.dataset.settingsFlag)) syncTimersToScheduler();
    renderSettingsView();
    return;
  }
  if (updateSettingsField(event.target)) {
    const field = event.target.dataset.settingsField;
    if (field && field.startsWith("emulatorLaunch")) syncTimersToScheduler();
    return;
  }
  if (updateTimerField(event.target)) {
    persistSettingsState();
    syncTimersToScheduler();
    renderSettingsView();
  }
}

function onSettingsInput(event) {
  if (isSettingsEditingLocked() && isSettingsWriteTarget(event.target)) {
    syncSettingsEditingLock();
    return;
  }
  if (event.target.matches("[data-settings-new-config]")) {
    SETTINGS_STATE.newConfigName = event.target.value;
    return;
  }
  if (updateSettingsField(event.target)) return;
  if (updateTimerField(event.target)) persistSettingsState();
}

function runSettingsAction(action, payload = {}) {
  const value = payload && typeof payload === "object" ? payload : { value: payload };
  if (action === "selectSection") return selectSettingsSection(Number(value.index ?? value.value));
  if (action === "toggleSection") return toggleSettingsSection(value.key ?? value.value);
  if (action === "addConfig") return addLocalConfig();
  if (action === "deleteConfig") return deleteLocalConfig();
  if (action === "persist") return persistSettingsState();
  return undefined;
}

function selectSettingsSection(index) {
  if (!Number.isInteger(index) || !SETTINGS_SECTIONS[index]) return;
  SETTINGS_STATE.selected = index;
  persistSettingsState();
  syncSettingsNavActive();
  requestAnimationFrame(() => scrollSettingsSection(SETTINGS_STATE.selected));
}

function toggleSettingsSection(key) {
  if (!Object.hasOwn(SETTINGS_STATE.expanded, key)) return;
  SETTINGS_STATE.expanded[key] = !SETTINGS_STATE.expanded[key];
  persistSettingsState();
  renderSettingsView();
}

function syncSettingsConfigs() {
  const source = state.profiles.join("\n") || state.profile?.name || "Default";
  if (SETTINGS_STATE.configsDirty) return;
  if (SETTINGS_STATE.configsSource !== source) {
    SETTINGS_STATE.configs = state.profiles.length ? [...state.profiles] : [source];
    SETTINGS_STATE.configsSource = source;
    SETTINGS_STATE.timers.forEach((timer) => {
      if (!SETTINGS_STATE.configs.includes(timer.config)) timer.config = state.profile?.name || SETTINGS_STATE.configs[0];
    });
  }
  SETTINGS_STATE.currentConfig = state.profile?.name || SETTINGS_STATE.currentConfig || SETTINGS_STATE.configs[0];
}

function isSettingsEditingLocked() {
  return typeof isProfileEditingLocked === "function"
    ? isProfileEditingLocked()
    : typeof isRunnerBusy === "function" && isRunnerBusy();
}

function isSettingsWriteTarget(target) {
  return Boolean(target.closest(
    "[data-settings-field], [data-settings-flag], [data-timer-enabled], [data-timer-hour], [data-timer-minute], [data-timer-config], [data-settings-current-config], [data-settings-new-config], [data-settings-add-config], [data-settings-delete-config]"
  ));
}

function syncSettingsEditingLock() {
  const root = $("settingsViewRoot");
  if (!root) return;
  const locked = isSettingsEditingLocked();
  root.classList.toggle("settingsLocked", locked);
  root.querySelectorAll(
    "[data-settings-field], [data-settings-flag], [data-timer-enabled], [data-timer-hour], [data-timer-minute], [data-timer-config], [data-settings-current-config], [data-settings-new-config], [data-settings-add-config], [data-settings-delete-config]"
  ).forEach((control) => {
    setSettingsLockDisabled(control, locked);
  });
}

function setSettingsLockDisabled(element, locked) {
  if (!element) return;
  const key = "lockDisabled";
  if (locked) {
    if (!(key in element.dataset)) {
      element.dataset[key] = element.disabled ? "1" : "0";
    }
    element.disabled = true;
    return;
  }
  if (element.dataset[key] === "1") {
    element.disabled = true;
  } else if (element.dataset[key] === "0") {
    element.disabled = false;
  }
  delete element.dataset[key];
}

function syncSettingsFromProfile() {
  const profile = typeof state !== "undefined" ? state.profile : null;
  if (!profile) return;
  const adb = profile.adb || {};
  SETTINGS_STATE.clientType = typeof canonicalClientType === "function"
    ? canonicalClientType(adb.client_type || SETTINGS_STATE.clientType)
    : (adb.client_type || SETTINGS_STATE.clientType);
  SETTINGS_STATE.adbAddress = adb.address || SETTINGS_STATE.adbAddress;
  SETTINGS_STATE.adbPath = adb.adb_path || SETTINGS_STATE.adbPath;
  SETTINGS_STATE.connectConfig = profileConnectPreset(adb.connect_config) || SETTINGS_STATE.connectConfig;
  const ld = adb.ld_player_extras;
  if (ld && typeof ld === "object") {
    if (typeof ld.enabled === "boolean") SETTINGS_STATE.ldExtrasEnabled = ld.enabled;
    if (typeof ld.path === "string" && ld.path) SETTINGS_STATE.ldExtrasPath = ld.path;
    if (Number.isInteger(ld.index)) SETTINGS_STATE.ldExtrasIndex = Math.max(0, ld.index);
  }
  const startup = firstTaskParams("StartUp");
  if (startup) {
    SETTINGS_STATE.autoDetectConnection = startup.auto_detect ?? SETTINGS_STATE.autoDetectConnection;
    SETTINGS_STATE.detectEveryTime = startup.detect_every_time ?? SETTINGS_STATE.detectEveryTime;
    SETTINGS_STATE.touchMode = startup.touch_mode || SETTINGS_STATE.touchMode;
  }
}

function profileConnectPreset(connectConfig) {
  if (typeof connectConfig === "string") return connectConfig;
  if (!connectConfig || typeof connectConfig !== "object" || Array.isArray(connectConfig)) return "";
  return connectConfig.preset || connectConfig.name || connectConfig.config || "";
}

function firstTaskParams(type) {
  return state.profile?.tasks?.find((task) => task.type === type)?.params || null;
}

function applySettingsToProfile() {
  if (typeof state === "undefined" || !state.profile || isSettingsEditingLocked()) return;
  const clientType = typeof canonicalClientType === "function" ? canonicalClientType(SETTINGS_STATE.clientType) : SETTINGS_STATE.clientType;
  SETTINGS_STATE.clientType = clientType;
  state.profile.adb = state.profile.adb || {};
  state.profile.adb.client_type = clientType;
  state.profile.adb.address = SETTINGS_STATE.adbAddress;
  state.profile.adb.adb_path = SETTINGS_STATE.adbPath;
  state.profile.adb.connect_config = { preset: SETTINGS_STATE.connectConfig };
  state.profile.adb.ld_player_extras = {
    enabled: SETTINGS_STATE.ldExtrasEnabled,
    path: SETTINGS_STATE.ldExtrasPath,
    manual_index: SETTINGS_STATE.ldManualIndex,
    index: Number.parseInt(SETTINGS_STATE.ldExtrasIndex, 10) || 0,
  };
  const startup = firstTaskParams("StartUp");
  if (startup) {
    startup.client_type = clientType;
    startup.connection = SETTINGS_STATE.connectConfig;
    startup.auto_detect = SETTINGS_STATE.autoDetectConnection;
    startup.detect_every_time = SETTINGS_STATE.detectEveryTime;
    startup.touch_mode = SETTINGS_STATE.touchMode;
  }
}

function saveSettingsProfile() {
  if (isSettingsEditingLocked()) return;
  applySettingsToProfile();
  if (typeof persistProfile === "function") {
    persistProfile(false).catch(showError);
  }
}

async function addLocalConfig() {
  if (isSettingsEditingLocked()) return;
  const name = SETTINGS_STATE.newConfigName.trim() || `profile-${Date.now().toString().slice(-5)}`;
  SETTINGS_STATE.newConfigName = "";
  if (SETTINGS_STATE.configs.includes(name)) {
    SETTINGS_STATE.currentConfig = name;
    persistSettingsState();
    if (typeof switchProfileConfig === "function") await switchProfileConfig(name);
    renderSettingsView();
    return;
  }
  SETTINGS_STATE.currentConfig = name;
  SETTINGS_STATE.configsDirty = false;
  if (typeof createProfile === "function") {
    await createProfile(name);
  } else {
    SETTINGS_STATE.configs = [...SETTINGS_STATE.configs, name];
    SETTINGS_STATE.configsDirty = true;
  }
  persistSettingsState();
  renderSettingsView();
}

async function deleteLocalConfig() {
  if (isSettingsEditingLocked()) return;
  if (SETTINGS_STATE.configs.length <= 1) return;
  const name = SETTINGS_STATE.currentConfig;
  if (!confirm(`删除配置「${name}」？`)) return;
  if (typeof deleteProfile === "function") {
    await deleteProfile(name);
    SETTINGS_STATE.configsDirty = false;
    SETTINGS_STATE.configsSource = "";
    SETTINGS_STATE.currentConfig = state.profile?.name || state.profiles[0] || "";
  } else {
    SETTINGS_STATE.configs = SETTINGS_STATE.configs.filter((config) => config !== name);
    SETTINGS_STATE.configsDirty = true;
    SETTINGS_STATE.currentConfig = SETTINGS_STATE.configs[0];
  }
  persistSettingsState();
  renderSettingsView();
}

function updateTimerField(target) {
  const timerKey = Object.keys(target.dataset).find((key) => key.startsWith("timer"));
  if (!timerKey) return false;
  const index = Number(target.dataset[timerKey]);
  const field = timerKey.replace("timer", "").toLowerCase();
  if (!SETTINGS_STATE.timers[index]) return false;
  SETTINGS_STATE.timers[index][field] = target.type === "checkbox" ? target.checked : target.value;
  return true;
}

function updateSettingsField(target) {
  const field = target.dataset.settingsField;
  if (!field) return false;
  if (isSettingsEditingLocked()) return true;
  SETTINGS_STATE[field] = target.type === "checkbox"
    ? target.checked
    : field === "logThumbnailMax"
      ? clampNumber(target.value, 1, 9999, SETTINGS_STATE.logThumbnailMax)
      : target.value;
  persistSettingsState();
  saveSettingsProfile();
  if (SETTINGS_CONDITIONAL_FIELDS.has(field)) renderSettingsView();
  return true;
}

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

function syncTimersToScheduler() {
  if (typeof api !== "function") return;
  const config = {
    enabled: SETTINGS_STATE.timers.some((t) => t.enabled),
    slots: SETTINGS_STATE.timers.map((t) => ({
      enabled: t.enabled,
      time: `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`,
      profile_name: t.config || "",
      force_start: Boolean(SETTINGS_STATE.forceStart)
    })),
    post_action: currentPostActionPayload(),
    emulator_launch: {
      enabled: Boolean(SETTINGS_STATE.emulatorLaunchEnabled),
      command: SETTINGS_STATE.emulatorLaunchCommand || "",
      wait_seconds: Math.max(0, Math.min(300, Number(SETTINGS_STATE.emulatorLaunchWait) || 60))
    }
  };
  api("/api/scheduler", {
    method: "PUT",
    body: JSON.stringify(config)
  }).catch(() => {});
}

function currentPostActionPayload() {
  const action = typeof state !== "undefined" ? state.postAction : null;
  if (typeof normalizePostAction === "function") return normalizePostAction(action);
  return {
    type: action?.type || "none",
    only_if_no_other_maa: Boolean(action?.only_if_no_other_maa)
  };
}

async function loadSchedulerConfig() {
  if (typeof api !== "function") return;
  try {
    const config = await api("/api/scheduler");
    if (!config || !Array.isArray(config.slots)) return;
    config.slots.forEach((slot, index) => {
      if (index >= SETTINGS_STATE.timers.length) return;
      const timer = SETTINGS_STATE.timers[index];
      timer.enabled = Boolean(slot.enabled);
      const [h, m] = (slot.time || "00:00").split(":");
      timer.hour = Math.min(23, Math.max(0, parseInt(h, 10) || 0));
      timer.minute = Math.min(59, Math.max(0, parseInt(m, 10) || 0));
      timer.config = slot.profile_name || "";
    });
    SETTINGS_STATE.forceStart = config.slots.some((s) => s.force_start);
    if (config.post_action && typeof state !== "undefined") {
      state.postAction = currentPostActionPayloadFrom(config.post_action);
      if (typeof renderPostActionControl === "function") renderPostActionControl();
    }
    if (config.emulator_launch && typeof config.emulator_launch === "object") {
      const el = config.emulator_launch;
      if (typeof el.enabled === "boolean") SETTINGS_STATE.emulatorLaunchEnabled = el.enabled;
      if (typeof el.command === "string") SETTINGS_STATE.emulatorLaunchCommand = el.command;
      if (Number.isFinite(el.wait_seconds)) {
        SETTINGS_STATE.emulatorLaunchWait = Math.max(0, Math.min(300, Math.round(el.wait_seconds)));
      }
    }
    persistSettingsState();
  } catch (e) { /* ignore if scheduler not available */ }
}

function currentPostActionPayloadFrom(action) {
  if (typeof normalizePostAction === "function") return normalizePostAction(action);
  return {
    type: action?.type || "none",
    only_if_no_other_maa: Boolean(action?.only_if_no_other_maa)
  };
}

async function loadVersionInfo() {
  if (typeof api !== "function") return;
  try {
    const data = await api("/api/version");
    if (data.maa_version) SETTINGS_STATE.maaVersion = data.maa_version;
    if (data.resource_version) SETTINGS_STATE.resourceVersion = data.resource_version;
    renderSettingsView();
  } catch (e) { /* ignore */ }
}

async function loadAdapterConfig() {
  if (typeof api !== "function") return;
  try {
    const data = await api("/api/adapter");
    if (data.adapter !== undefined) SETTINGS_STATE.maaAdapterType = data.adapter;
    if (data.core_dir !== undefined) SETTINGS_STATE.maaCoreDir = data.core_dir;
    SETTINGS_STATE.maaActiveType = data.active_type || "dry-run";
    if (typeof state !== "undefined" && state.currentView === "settings") renderSettingsView();
  } catch (e) { /* ignore */ }
}

async function applyAdapterConfig() {
  if (typeof api !== "function") return;
  const statusEl = document.getElementById("maaAdapterStatus");
  if (statusEl) statusEl.textContent = "正在应用……";
  try {
    const result = await api("/api/adapter", {
      method: "PUT",
      body: JSON.stringify({
        adapter: SETTINGS_STATE.maaAdapterType,
        core_dir: SETTINGS_STATE.maaCoreDir,
      })
    });
    if (result && result.detail) {
      if (statusEl) statusEl.textContent = `失败：${result.detail}`;
      return;
    }
    SETTINGS_STATE.maaActiveType = result.active_type || "dry-run";
    const note = result.hot_swapped ? "已生效" : (result.note || "重启后生效");
    if (statusEl) statusEl.textContent = `已保存（${note}），当前：${SETTINGS_STATE.maaActiveType}`;
    persistSettingsState();
    renderSettingsView();
  } catch (e) {
    if (statusEl) statusEl.textContent = `失败：${e.message}`;
  }
}

async function runSettingsScreenshotTest() {
  if (typeof api !== "function") return;
  const resultEl = document.getElementById("screenshotTestResult");
  if (resultEl) resultEl.textContent = "截图测试中……";
  try {
    const t0 = Date.now();
    const result = await api("/api/adb/test-screenshot", { method: "POST" });
    const elapsed = Date.now() - t0;
    if (resultEl) {
      const benchmark = formatScreenshotBenchmark(result.benchmark);
      resultEl.textContent = result.ok
        ? `截图成功 (${elapsed} ms)${benchmark ? " · " + benchmark : ""}`
        : `截图失败: ${result.message || "未知错误"}`;
    }
  } catch (error) {
    if (resultEl) resultEl.textContent = `截图失败: ${error.message || "请求错误"}`;
  }
}

function formatScreenshotBenchmark(benchmark) {
  if (!benchmark || typeof benchmark !== "object") return "";
  const method = benchmark.method ? String(benchmark.method) : "";
  const cost = benchmark.cost !== undefined && benchmark.cost !== null && benchmark.cost !== "" ? `${benchmark.cost} ms` : "";
  if (method && cost) return `最快方式: ${method} ${cost}`;
  if (method) return `最快方式: ${method}`;
  if (cost) return `最快方式: ${cost}`;
  return "";
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

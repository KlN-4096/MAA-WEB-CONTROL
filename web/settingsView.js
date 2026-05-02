const SETTINGS_SECTIONS = [
  { key: "config", title: "切换配置", render: renderConfigSection },
  { key: "timer", title: "定时执行", render: renderTimerSection },
  { key: "performance", title: "性能设置", render: renderPerformanceSection },
  { key: "game", title: "运行设置", render: renderGameSection },
  { key: "connection", title: "连接设置", render: renderConnectionSection },
  { key: "startup", title: "启动设置", render: renderStartupSection },
  { key: "remote", title: "远程控制", render: renderRemoteSection },
  { key: "ui", title: "界面设置", render: renderUiSection },
  { key: "background", title: "背景设置", render: renderBackgroundSection },
  { key: "notification", title: "外部通知", render: renderNotificationSection },
  { key: "hotkey", title: "热键设置", render: renderHotkeySection },
  { key: "achievement", title: "成就设置", render: renderAchievementSection },
  { key: "update", title: "更新设置", render: renderUpdateSection },
  { key: "issue", title: "问题反馈", render: renderIssueSection },
  { key: "about", title: "关于我们", render: renderAboutSection }
];

const SETTINGS_STORAGE_KEY = "maa-web.settingsState";
const SETTINGS_CONDITIONAL_FIELDS = new Set([
  "forceStart",
  "customConfig",
  "clientType",
  "blockSleep",
  "enablePenguin",
  "autoDetectConnection",
  "connectConfig",
  "ldManualIndex",
  "mumuBridge",
  "useTray",
  "useCardLog",
  "updateSource",
  "proxyType",
  "achievementPopupDisabled"
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
  "autoDetectConnection",
  "ldExtrasEnabled",
  "ldManualIndex",
  "mumuExtrasEnabled",
  "mumuBridge",
  "useTray",
  "useCardLog",
  "updateSource",
  "forceGithub",
  "proxyType",
  "achievementPopupDisabled",
  "achievementPopupAutoClose",
  "timers"
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
  autoDetectConnection: false,
  ldExtrasEnabled: true,
  ldManualIndex: false,
  mumuExtrasEnabled: true,
  mumuBridge: false,
  useTray: true,
  useCardLog: true,
  updateSource: "Overseas",
  forceGithub: true,
  proxyType: "",
  achievementPopupDisabled: true,
  achievementPopupAutoClose: true,
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
  }))
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
  ["clientType", "connectConfig", "updateSource", "proxyType"].forEach((field) => MaaStorage.copyString(parsed, restored, field));
  if (Array.isArray(parsed.timers)) restored.timers = restoreTimers(parsed.timers);
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
  root.innerHTML = `
    <aside class="settingsSideNav">${SETTINGS_SECTIONS.map(settingsNavButton).join("")}</aside>
    <section class="settingsContent">
      ${SETTINGS_SECTIONS.map((section) => settingsSection(section, section.render())).join("")}
    </section>
  `;
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
    ${fieldRow("使用 GPU 加速推理", selectBox(["系统默认 GPU (NVIDIA GeForce RTX)", "CPU", "DirectML", "CUDA"], 0), "使用 GPU 推理能够以极低的 GPU 占用显著降低 CPU 的负担")}
  `);
}

function renderGameSection() {
  const overseasTip = SETTINGS_STATE.clientType && !["Official", "Bilibili"].includes(SETTINGS_STATE.clientType)
    ? '<p class="settingsLineText">海外服资源适配提示</p>'
    : "";
  const yostarTip = SETTINGS_STATE.clientType === "YoStarEN"
    ? '<p class="settingsLineText">YoStarEN 需要使用 1920x1080 分辨率</p>'
    : "";
  return settingsColumn(`
    ${fieldRow("客户端类型", selectBox([
      { label: "官服", value: "Official" },
      { label: "Bilibili", value: "Bilibili" },
      { label: "YoStarEN", value: "YoStarEN" },
      { label: "YoStarJP", value: "YoStarJP" },
      { label: "YoStarKR", value: "YoStarKR" }
    ], SETTINGS_STATE.clientType, "clientType"))}
    ${yostarTip}
    ${overseasTip}
    ${checkLine("划火柴模式（自动战斗相关）（不稳定，暂不推荐开启）")}
    ${fieldRow("开始前脚本", textBox("Example: \"C:\\\\1.cmd\" -minimized", "settingsControlXL"))}
    ${fieldRow("结束后脚本", textBox("Example: \"C:\\\\1.cmd\" -noWindow", "settingsControlXL"))}
    <div class="settingsInlinePair">${checkLine("自动战斗时启用上述脚本")}${checkLine("手动暂停时启用上述脚本")}</div>
    <div class="settingsInlinePair">${checkLine("运行任务时阻止休眠", true, "", "blockSleep")}${SETTINGS_STATE.blockSleep ? checkLine("阻止休眠时保持屏幕常亮", true, "", "blockSleepScreenOn") : ""}</div>
    <div class="settingsInlinePair">${checkLine("上报企鹅物流", true, "", "enablePenguin")}${checkLine("上报一图流")}</div>
    ${SETTINGS_STATE.enablePenguin ? fieldRow("企鹅物流 ID（仅数字部分）", textBox("614858333", "settingsControlL")) : ""}
    <div class="settingsInlinePair">
      ${fieldRow("任务超时时间（分钟）", numberBox("60", "settingsControlS"))}
      ${fieldRow("提醒间隔时间（分钟）", numberBox("30", "settingsControlS"))}
    </div>
  `);
}

function renderConnectionSection() {
  const disabledAuto = SETTINGS_STATE.autoDetectConnection ? " disabled" : "";
  const isLd = SETTINGS_STATE.connectConfig === "LDPlayer";
  const isMumu = SETTINGS_STATE.connectConfig === "MuMuEmulator12";
  return settingsColumn(`
    ${checkLine("自动检测连接", false, "自动寻找可用模拟器连接。", "autoDetectConnection")}
    ${fieldRow("连接配置", selectBox([
      { label: "雷电模拟器", value: "LDPlayer" },
      { label: "MuMu 模拟器", value: "MuMuEmulator12" },
      { label: "通用", value: "General" }
    ], SETTINGS_STATE.connectConfig, "connectConfig"), "", "settingsControlXL")}
    ${fieldRow("连接地址", selectBox(["emulator-5554", "127.0.0.1:5555"], 0, "", "settingsControlXL", disabledAuto), "历史连接地址")}
    ${fieldRow("ADB 路径", inputButton("D:\\\\APPS\\\\AppGroup_2_china\\\\LeidianMoNoQi\\\\leidi", "选择", "settingsControlXL", disabledAuto))}
    ${isLd ? checkLine("启用 LD 截图增强模式", true, "", "ldExtrasEnabled") : ""}
    ${isLd ? fieldRow("LD 安装路径", textBox("D:\\\\APPS\\\\AppGroup_2_china\\\\LeidianMoNoQi\\\\Leidian\\\\LDPlayer", "settingsControlXXL")) : ""}
    ${isLd ? checkLine("手动填写「实例编号」", false, "", "ldManualIndex") : ""}
    ${isLd && SETTINGS_STATE.ldManualIndex ? fieldRow("实例编号", numberBox("0", "settingsControlS")) : ""}
    ${isMumu ? checkLine("启用 MuMu 截图增强模式", true, "", "mumuExtrasEnabled") : ""}
    ${isMumu ? fieldRow("MuMu 安装路径", textBox("C:\\\\Program Files\\\\Netease\\\\MuMuPlayer-12.0", "settingsControlXXL")) : ""}
    ${isMumu ? checkLine("MuMu 网络桥接模式", false, "", "mumuBridge") : ""}
    ${isMumu && SETTINGS_STATE.mumuBridge ? fieldRow("MuMu 实例编号", numberBox("0", "settingsControlS")) : ""}
    <button class="settingsButtonSmall" type="button">截图测试</button>
    <p class="settingsLineText">截图耗时 min/avg/max(ms): -- / -- / -- (---)</p>
    ${checkLine("ADB 连接失败时尝试启动模拟器", true, "连接失败后自动启动模拟器。")}
    ${checkLine("连接失败后尝试重启 ADB Server", true)}
    ${checkLine("连接失败后尝试关闭并重启 ADB 进程", true)}
    ${fieldRow("触控模式", `${selectBox(["Minitouch（默认）", "MaaTouch", "ADB"], 0)}<button class="settingsButtonSmall" type="button">强制替换 ADB</button>`)}
    <div class="settingsInlinePair">${checkLine("退出时释放 ADB", true)}${checkLine("使用 ADB Lite（实验性功能）")}</div>
  `);
}

function renderStartupSection() {
  return settingsColumn(`
    <p class="settingsGlobalTip">此选项页为全局配置</p>
    <div class="settingsSplit">
      <div class="settingsColumn">
        ${checkLine("开机自动启动 MAA", false, "需要系统权限时可能失败。")}
        ${checkLine("启动 MAA 后直接最小化", true)}
        <hr class="settingsDivider" />
        ${checkLine("启动 MAA 后直接运行")}
        ${checkLine("启动 MAA 后自动开启模拟器", true)}
        ${checkLine("ADB 连接失败时尝试启动模拟器", true, "连接失败后自动启动模拟器。")}
      </div>
      <div class="settingsColumn">
        ${fieldRow("模拟器路径", inputButton("D:\\\\APPS\\\\leidian\\\\LDPlayer9\\\\dnplayer", "选择"))}
        ${fieldRow("附加命令", textBox("--instance Pie64"))}
        ${fieldRow("等待模拟器启动时间（秒）", numberBox("30", "settingsControlS"))}
      </div>
    </div>
  `);
}

function renderRemoteSection() {
  return settingsColumn(`
    <p class="settingsLineText">注意：随意填入未知来源的地址可能会导致您的账户受到损失。</p>
    ${fieldRow("获取任务端点", textBox("", "settingsControlXL"))}
    ${fieldRow("汇报任务端点", textBox("", "settingsControlXL"))}
    ${fieldRow("轮询间隔 (ms)", numberBox("1000", "settingsControlXL"))}
    ${fieldRow("用户标识符", inputButton("", "测试连接", "settingsControlXL"))}
    ${fieldRow("设备标识符（只读）", inputButton("", "重新生成", "settingsControlXL"))}
    <p class="settingsLineText">了解如何开发相关功能，可以访问</p>
    <a class="settingsLink" href="#" tabindex="-1">远程控制功能开发者文档</a>
  `);
}

function renderUiSection() {
  return settingsColumn(`
    <p class="settingsGlobalTip">此选项页为全局配置</p>
    <div class="settingsSplit">
      <div class="settingsColumn">
        ${checkLine("显示托盘图标", true, "", "useTray")}
        ${SETTINGS_STATE.useTray ? checkLine("最小化时隐藏至托盘") : ""}
        ${checkLine("重要信息弹出系统通知", false, "重要事件弹出系统通知。")}
        ${checkLine("隐藏关闭按钮")}
        ${checkLine("窗口标题滚动")}
        ${checkLine("反转主任务右键单击效果", false, "切换主任务右键行为。")}
        ${checkLine("使用软件渲染", false, "用于规避部分图形模块异常。")}
        ${checkLine("使用卡片样式日志", true, "", "useCardLog")}
        ${SETTINGS_STATE.useCardLog ? fieldRow("日志缩略图最大数量", numberBox("20", "settingsControlL")) : ""}
        ${fieldRow("日期格式字符串", selectBox(["HH:mm:ss", "HH:mm", "yyyy-MM-dd HH:mm:ss"], 0))}
      </div>
      <div class="settingsColumn">
        ${fieldRow("语言 / Language", selectBox(["简体中文", "English", "日本語"], 0))}
        ${fieldRow("干员名称显示语言", selectBox(["跟随 MAA", "简体中文", "English"], 0))}
        ${fieldRow("界面主题", selectBox(["与系统同步", "深色", "浅色"], 0))}
        ${fieldRow("主界面可选择按钮功能", selectBox(["清空", "全选", "开始"], 0))}
        ${fieldRow("标题栏显示内容", chipsBox(["配置名称", "连接配置", "连接地址", "客户端类型"]))}
        <button class="settingsPrimaryButton" type="button">重看设置指引</button>
      </div>
    </div>
  `);
}

function renderBackgroundSection() {
  return settingsColumn(`
    ${fieldRow("背景图片", inputButton("D:\\\\APPS\\\\MAA-v5.2.2-win-x64\\\\background\\\\background.png", "选择", "settingsControlXXL"))}
    ${sliderRow("背景不透明度", 50)}
    ${sliderRow("背景模糊半径", 12)}
    ${fieldRow("背景填充模式", selectBox(["拉伸填充", "适应", "平铺"], 0))}
  `);
}

function renderNotificationSection() {
  return settingsColumn(`
    ${fieldRow("启用的通知配置", `${selectBox(["", "Server酱", "Telegram", "Discord"], 0)}<button class="settingsButtonSmall" type="button" disabled>发送测试</button>`)}
  `);
}

function renderHotkeySection() {
  return settingsColumn(`
    <p class="settingsGlobalTip">此选项页为全局配置</p>
    ${fieldRow("[热键] 显示/收起 MAA", textBox("Ctrl + Shift + Alt + M"), "键入 退格/Esc/Delete 清除当前热键")}
    ${fieldRow("[热键] Link start/stop", textBox("Ctrl + Shift + Alt + L"), "键入 退格/Esc/Delete 清除当前热键")}
  `);
}

function renderAchievementSection() {
  return settingsColumn(`
    <p class="settingsLineText">成就等级： 25</p>
    <button class="settingsButtonSmall" type="button">查看成就</button>
    <div class="settingsInlinePair">
      <button class="settingsButtonSmall" type="button">备份成就</button>
      <button class="settingsButtonSmall" type="button">加载备份</button>
    </div>
    <div class="achievementMedal">♜</div>
    ${checkLine("禁用成就提示气泡", true, "", "achievementPopupDisabled")}
    ${SETTINGS_STATE.achievementPopupDisabled ? "" : checkLine("成就提示气泡自动关闭", true, "", "achievementPopupAutoClose")}
  `);
}

function renderUpdateSection() {
  const isGithub = SETTINGS_STATE.updateSource === "Github";
  const isMirror = SETTINGS_STATE.updateSource === "MirrorChyan";
  return settingsColumn(`
    <p class="settingsGlobalTip">此选项页为全局配置</p>
    <div class="settingsSplit settingsUpdateGrid">
      <div class="settingsColumn">
        ${checkLine("启动时检查更新", true)}
        ${checkLine("定时检查更新", true, "定期检查更新。")}
        ${checkLine("自动下载更新包", true)}
        ${checkLine("自动安装更新包", true)}
        ${checkLine("显示 MAA.Updater 控制台输出")}
        ${isGithub ? checkLine("强制使用 GitHub", true, "忽略代理源配置。", "forceGithub") : ""}
        ${fieldRow("更新渠道", selectBox(["公测版", "稳定版", "内测版"], 0))}
        ${fieldRow("更新源", selectBox([
          { label: "海外源", value: "Overseas" },
          { label: "GitHub", value: "Github" },
          { label: "Mirror酱", value: "MirrorChyan" }
        ], SETTINGS_STATE.updateSource, "updateSource"))}
        ${isMirror ? fieldRow("Mirror酱 CDK", inputButton("", "复制", "settingsControlL")) : ""}
        ${isMirror ? '<a class="settingsLink" href="#" tabindex="-1">Mirror酱</a>' : ""}
      </div>
      <div class="settingsColumn">
        ${fieldRow("HTTP Proxy", selectBox(["", "HTTP Proxy"], SETTINGS_STATE.proxyType, "proxyType"))}
        ${SETTINGS_STATE.proxyType ? textBox("192.168.31.45:7890", "settingsControlL") : ""}
        ${badgeRow("软件版本", "v6.9.0")}
        ${badgeRow("资源版本", "承诺")}
        ${badgeRow("构建日期", "2026/5/2 12:30:07")}
        ${badgeRow("资源日期", "2026/5/1 17:02:14")}
        <div class="settingsInlinePair">
          <button class="settingsButtonSmall" type="button">软件更新</button>
          <button class="settingsButtonSmall" type="button">更新日志</button>
        </div>
        <button class="settingsButtonSmall" type="button">资源更新</button>
        <a class="settingsLink" href="#" tabindex="-1">资源仓库</a>
      </div>
    </div>
  `);
}

function renderIssueSection() {
  return settingsColumn(`
    <p class="settingsLineText">请在确认您的问题不属于「常见问题」后，再进行「问题反馈」</p>
    <div class="settingsSplit settingsIssueGrid">
      <div class="settingsColumn">
        <a class="settingsLink" href="#" tabindex="-1">常见问题</a>
        <a class="settingsLink" href="#" tabindex="-1">问题反馈</a>
      </div>
      <div class="settingsColumn">
        <button class="settingsButtonSmall" type="button">生成日志压缩包</button>
        <button class="settingsButtonSmall" type="button">打开日志文件夹</button>
        <span class="settingsCheckLine"><button class="settingsButtonSmall" type="button">清空图片缓存</button>${settingsTip("清理调试截图缓存。")}</span>
      </div>
    </div>
  `);
}

function renderAboutSection() {
  return settingsColumn(`
    <div class="settingsSplit settingsAboutGrid">
      <div class="settingsColumn">
        <a class="settingsLink" href="#" tabindex="-1">MAA 官网</a>
        <a class="settingsLink" href="#" tabindex="-1">bilibili</a>
        <a class="settingsLink" href="#" tabindex="-1">源码: GitHub</a>
        <button class="settingsButtonSmall" type="button">查看公告</button>
      </div>
      <div class="settingsColumn">
        <a class="settingsLink" href="#" tabindex="-1">QQ 群</a>
        <a class="settingsLink" href="#" tabindex="-1">QQ 频道</a>
        <a class="settingsLink" href="#" tabindex="-1">Telegram</a>
        <a class="settingsLink" href="#" tabindex="-1">Discord</a>
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

function checkLine(label, checked = false, tip = "", key = "") {
  const value = key ? SETTINGS_STATE[key] : checked;
  const attr = key ? ` data-settings-field="${key}"` : "";
  return `<span class="settingsCheckLine">
    <label class="settingsCheck">
      <input type="checkbox"${attr}${value ? " checked" : ""} />
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
    SETTINGS_STATE.selected = Number(nav.dataset.settingsNav);
    persistSettingsState();
    syncSettingsNavActive();
    requestAnimationFrame(() => scrollSettingsSection(SETTINGS_STATE.selected));
    return;
  }
  const toggle = event.target.closest("[data-settings-toggle]");
  if (toggle) {
    const key = toggle.dataset.settingsToggle;
    SETTINGS_STATE.expanded[key] = !SETTINGS_STATE.expanded[key];
    persistSettingsState();
    renderSettingsView();
    return;
  }
  if (event.target.closest("[data-settings-add-config]")) {
    addLocalConfig();
    return;
  }
  if (event.target.closest("[data-settings-delete-config]")) {
    deleteLocalConfig();
  }
}

function onSettingsChange(event) {
  if (event.target.matches("[data-settings-current-config]")) {
    SETTINGS_STATE.currentConfig = event.target.value;
    persistSettingsState();
    return;
  }
  const flag = event.target.closest("[data-settings-flag]");
  if (flag) {
    SETTINGS_STATE[flag.dataset.settingsFlag] = flag.checked;
    persistSettingsState();
    renderSettingsView();
    return;
  }
  if (updateSettingsField(event.target)) return;
  if (updateTimerField(event.target)) {
    persistSettingsState();
    renderSettingsView();
  }
}

function onSettingsInput(event) {
  if (event.target.matches("[data-settings-new-config]")) {
    SETTINGS_STATE.newConfigName = event.target.value;
    return;
  }
  if (updateSettingsField(event.target)) return;
  if (updateTimerField(event.target)) persistSettingsState();
}

function syncSettingsConfigs() {
  const source = state.profiles.join("\n") || state.profile?.name || "Default";
  if (SETTINGS_STATE.configsDirty || SETTINGS_STATE.configsSource === source) return;
  SETTINGS_STATE.configs = state.profiles.length ? [...state.profiles] : [source];
  SETTINGS_STATE.currentConfig = state.profile?.name || SETTINGS_STATE.configs[0];
  SETTINGS_STATE.configsSource = source;
  SETTINGS_STATE.timers.forEach((timer) => { timer.config = SETTINGS_STATE.currentConfig; });
}

function addLocalConfig() {
  const name = SETTINGS_STATE.newConfigName.trim() || new Date().toLocaleString();
  if (!SETTINGS_STATE.configs.includes(name)) {
    SETTINGS_STATE.configs = [...SETTINGS_STATE.configs, name];
  }
  SETTINGS_STATE.configsDirty = true;
  SETTINGS_STATE.currentConfig = name;
  SETTINGS_STATE.newConfigName = "";
  persistSettingsState();
  renderSettingsView();
}

function deleteLocalConfig() {
  if (SETTINGS_STATE.configs.length <= 1) return;
  SETTINGS_STATE.configs = SETTINGS_STATE.configs.filter((name) => name !== SETTINGS_STATE.currentConfig);
  SETTINGS_STATE.configsDirty = true;
  SETTINGS_STATE.currentConfig = SETTINGS_STATE.configs[0];
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
  SETTINGS_STATE[field] = target.type === "checkbox" ? target.checked : target.value;
  persistSettingsState();
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

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

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

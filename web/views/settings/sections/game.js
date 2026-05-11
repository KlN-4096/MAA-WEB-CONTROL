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
    ${checkLine("划火柴模式（自动战斗相关）（不稳定，暂不推荐开启）", false, "", "deploymentWithPause")}
    <p class="settingsGlobalTip">以下选项暂未接入 Web 版：</p>
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

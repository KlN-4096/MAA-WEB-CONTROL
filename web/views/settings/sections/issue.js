function renderIssueSection() {
  return settingsColumn(`
    <p class="settingsLineText">请在确认您的问题不属于「常见问题」后，再进行「问题反馈」</p>
    <div class="settingsSplit settingsIssueGrid">
      <div class="settingsColumn">
        <a class="settingsLink" href="https://maa.plus/docs/用户手册/常见问题.html" target="_blank" rel="noreferrer">常见问题</a>
        <a class="settingsLink" href="https://github.com/MaaAssistantArknights/MaaAssistantArknights/issues" target="_blank" rel="noreferrer">问题反馈 (GitHub Issues)</a>
      </div>
      <div class="settingsColumn">
        <span class="settingsCheckLine"><button class="settingsButtonSmall" type="button" data-settings-action="clearLogCache">清空日志与图片缓存</button>${settingsTip("清空运行日志卡片与截图缩略图缓存。")}</span>
        <p class="settingsLineText">生成日志压缩包 / 打开日志文件夹<span class="unsupportedBadge">暂未接入</span></p>
      </div>
    </div>
  `);
}

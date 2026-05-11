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

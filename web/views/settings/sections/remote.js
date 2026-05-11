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

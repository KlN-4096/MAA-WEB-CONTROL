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

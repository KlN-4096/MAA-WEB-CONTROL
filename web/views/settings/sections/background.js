function renderBackgroundSection() {
  return settingsColumn(`
    <p class="settingsGlobalTip">背景设置暂未实现，以下选项仅供参考。</p>
    ${fieldRow("背景图片", inputButton("", "选择", "settingsControlL", " disabled"))}
    ${sliderRow("背景不透明度", 50)}
    ${sliderRow("背景模糊半径", 12)}
    ${fieldRow("背景填充模式", selectBox(["拉伸填充", "适应", "平铺"], 0, "", "settingsControlL", " disabled"))}
  `);
}

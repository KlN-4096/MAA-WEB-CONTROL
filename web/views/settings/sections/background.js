function renderBackgroundSection() {
  return settingsColumn(`
    <p class="settingsGlobalTip">背景图片保存在服务器；显示偏好保存在当前浏览器，不修改任务配置。</p>
    ${checkLine("显示自定义背景",SETTINGS_STATE.backgroundEnabled,"","backgroundEnabled")}
    ${fieldRow("上传图片",'<input id="backgroundUpload" type="file" accept="image/png,image/jpeg,image/webp"/>')}
    ${fieldRow("不透明度（0–100）",numberBox(String(SETTINGS_STATE.backgroundOpacity),"settingsControlS","backgroundOpacity"))}
    ${fieldRow("模糊半径（0–40 px）",numberBox(String(SETTINGS_STATE.backgroundBlur),"settingsControlS","backgroundBlur"))}
    ${fieldRow("填充模式",selectBox([{label:"裁剪填满",value:"cover"},{label:"完整适应",value:"contain"},{label:"拉伸",value:"stretch"},{label:"平铺",value:"tile"}],SETTINGS_STATE.backgroundFit,"backgroundFit"))}
  `);
}

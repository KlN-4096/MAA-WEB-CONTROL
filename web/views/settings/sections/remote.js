function renderRemoteSection() {
  const config = SETTINGS_STATE.remote || {enabled:false,poll_url:"",report_url:"",interval_ms:1000,user:"",device:"",profile_name:""};
  return settingsColumn(`
    <p class="settingsGlobalTip">MAA 出站轮询协议；默认关闭。不开放匿名入站执行接口，不接受远端脚本和任意核心参数。</p>
    <p class="settingsLineText">注意：随意填入未知来源的地址可能会导致您的账户受到损失。</p>
    ${checkLine("启用远程控制",config.enabled,"启用后仅接受所填服务的固定指令；包含抽卡指令，务必信任该服务。","remote.enabled")}
    ${fieldRow("使用配置",selectBox([{label:"请选择配置",value:""},...(state.profiles || []).map((name)=>({label:name,value:name}))],config.profile_name,"remote.profile_name"))}
    <p class="formNote">已保存的服务地址和用户标识以掩码显示；保留掩码表示不修改，清空表示删除。</p>
    ${fieldRow("获取任务端点", textBox(config.poll_url, "settingsControlXL", "remote.poll_url"))}
    ${fieldRow("汇报任务端点", textBox(config.report_url, "settingsControlXL", "remote.report_url"))}
    ${fieldRow("轮询间隔 (ms)", numberBox(String(config.interval_ms), "settingsControlS", "remote.interval_ms"))}
    ${fieldRow("用户标识符", textBox(config.user,"settingsControlL","remote.user"))}
    ${fieldRow("设备标识符（只读）", textBox(config.device,"settingsControlL",""," readonly"))}
    <button class="settingsButtonSmall" type="button" data-settings-action="saveRemote">保存远控配置</button>
    <p class="settingsLineText">${escapeHtml(SETTINGS_STATE.remoteStatus || "")}</p>
    <a class="settingsLink" href="https://maa.plus/docs/开发文档/远程控制协议.html" target="_blank" rel="noreferrer">远程控制功能开发者文档</a>
  `);
}

async function loadRemoteConfig() {
  try {
    const result = await api("/api/remote");
    SETTINGS_STATE.remote = result.config;
    SETTINGS_STATE.remoteStatus = result.state.last_error || (result.config.enabled ? "已启用" : "已关闭");
  } catch (error) { SETTINGS_STATE.remoteStatus = "读取失败"; }
}

async function saveRemoteConfig() {
  try {
    const result = await api("/api/remote",{method:"PUT",body:JSON.stringify(SETTINGS_STATE.remote)});
    SETTINGS_STATE.remote = result.config;
    SETTINGS_STATE.remoteStatus = result.config.enabled ? "已保存并启用" : "已保存，远控关闭";
  } catch (error) { showError(error); }
  renderSettingsView();
}

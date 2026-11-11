function renderPerformanceSection() {
  const inference = SETTINGS_STATE.inference || {backend:"default",device:0};
  return settingsColumn(`
    <p class="settingsGlobalTip">进程级设置，保存后重启服务生效。WebGPU 需对应驱动/核心支持；DirectML 仅支持 Windows。参数被接受不代表实际使用 GPU，核心可能回退 CPU，实际后端需在部署机核验。</p>
    ${fieldRow("推理后端", selectBox([{value:"default",label:"保持核心默认"},{value:"cpu",label:"CPU"},{value:"auto",label:"GPU 自动选择"},{value:"webgpu",label:"WebGPU（实验）"},{value:"directml",label:"DirectML（Windows）"}], inference.backend,"inference.backend"))}
    ${fieldRow("设备序号", numberBox(String(inference.device),"settingsControlS","inference.device"))}
    <button class="settingsButtonSmall" type="button" data-settings-action="saveInference">保存推理设置</button>
    <p class="settingsLineText">${escapeHtml(SETTINGS_STATE.inferenceStatus || "")}</p>
  `);
}

async function loadInferenceConfig() {
  try {
    const result = await api("/api/inference");
    SETTINGS_STATE.inference = result.config;
    SETTINGS_STATE.inferenceStatus = result.error || (result.restart_required ? "已保存，等待重启服务" : result.static_options_accepted ? `核心已接受静态选项：${result.active.backend}；实际执行后端未知` : result.resources_loaded ? "资源已加载，保持核心默认选项" : "尚未加载核心，未验证静态选项");
  } catch (error) { SETTINGS_STATE.inferenceStatus = "读取失败"; }
}

async function saveInferenceConfig() {
  try {
    await api("/api/inference",{method:"PUT",body:JSON.stringify(SETTINGS_STATE.inference || {backend:"default",device:0})});
    SETTINGS_STATE.inferenceStatus = "已保存，重启服务后生效";
  } catch (error) { showError(error); }
  renderSettingsView();
}

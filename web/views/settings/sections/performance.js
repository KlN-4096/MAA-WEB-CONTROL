function renderPerformanceSection() {
  return settingsColumn(`
    <p class="settingsGlobalTip">性能设置暂未接入 Web 版，以下选项仅供查看。</p>
    ${fieldRow("使用 GPU 加速推理", selectBox(["系统默认 GPU", "CPU", "DirectML", "CUDA"], 0, "", "settingsControlL", " disabled"), "使用 GPU 推理能够以极低的 GPU 占用显著降低 CPU 的负担")}
  `);
}

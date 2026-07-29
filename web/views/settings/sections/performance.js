function renderPerformanceSection() {
  return settingsColumn(`
    <p class="settingsGlobalTip">GPU 推理需要在服务端进程内设置 MaaCore static option，Web 版<span class="unsupportedBadge">暂未接入</span></p>
    ${fieldRow("使用 GPU 加速推理", selectBox(["系统默认 GPU", "CPU", "DirectML", "CUDA"], 0, "", "settingsControlL", " disabled"), "使用 GPU 推理能够以极低的 GPU 占用显著降低 CPU 的负担")}
  `);
}

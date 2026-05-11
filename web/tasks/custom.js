function renderCustomGeneral(p, escapeHtml) {
  const names = Array.isArray(p.task_names) ? p.task_names.join(";") : String(p.task_names || p.custom_tasks || "");
  const missing = !names.trim();
  return `
    <div class="maaParams wideForm">
      <span>任务名列表${missing ? ' <span class="paramRequiredHint">（必填，否则运行时报错）</span>' : ""}</span>
      <input class="wideInput${missing ? " paramRequired" : ""}" id="paramCustomTaskNames" value="${escapeHtml(names)}" placeholder="GachaOnce;MiniGame@PV" />
      <p class="formNote">多个任务名以英文分号分隔，例：GachaOnce;GachaTenTimes。Custom 会直接按 task_names 执行 MaaCore 内置任务。</p>
    </div>
  `;
}

function collectCustomParams() {
  const params = {};
  addList(params, "task_names", "paramCustomTaskNames");
  return params;
}

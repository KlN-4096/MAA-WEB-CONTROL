function renderCustomGeneral(p, escapeHtml) {
  const names = Array.isArray(p.task_names) ? p.task_names.join(";") : String(p.task_names || p.custom_tasks || "");
  const missing = !names.trim();
  return `
    <div class="maaParams wideForm">
      <span>任务名列表${missing ? ' <span class="paramRequiredHint">（必填，否则运行时报错）</span>' : ""}</span>
      <input class="wideInput${missing ? " paramRequired" : ""}" id="paramCustomTaskNames" value="${escapeHtml(names)}" placeholder="GachaOnce;MiniGame@PV" />
      <p class="formNote">以英文分号分隔多个候选任务名，例：GachaOnce;GachaTenTimes。MaaCore 只会执行其中第一个匹配上的任务（及其 next），需要连续执行多个请添加多条自定义任务。</p>
    </div>
  `;
}

function collectCustomParams() {
  const params = {};
  addList(params, "task_names", "paramCustomTaskNames");
  return params;
}

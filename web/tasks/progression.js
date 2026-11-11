const OPER_ROLES = [
  ["", "自动识别"], ["Pioneer", "先锋"], ["Warrior", "近卫"], ["Tank", "重装"],
  ["Sniper", "狙击"], ["Caster", "术师"], ["Medic", "医疗"], ["Support", "辅助"], ["Special", "特种"]
].map(([value, label]) => ({ value, label }));

function renderOperProgressGeneral(p, escapeHtml) {
  const plans = Array.isArray(p.plans) ? p.plans : [];
  const names = [...new Set((activeClientOptions()?.operators || []).map((oper) => oper.name))];
  return `<div class="planEditor">
    <p class="formNote">按计划顺序培养，消耗现有材料；不自动刷缺失材料。专精需精二和技能 7 级，可同时设置前置目标。不指定的目标保持原样。训练室被占用时由核心跳过或续接。</p>
    <datalist id="progressOperatorNames">${names.map((name) => `<option value="${escapeHtml(name)}" label="${escapeHtml(typeof operatorDisplayName === "function" ? operatorDisplayName(name) : name)}"></option>`).join("")}</datalist>
    ${plans.map((plan, index) => `<fieldset class="planRow" data-oper-plan="${index}">
      <legend>计划 ${index + 1}</legend>
      <label>干员中文名<input data-plan-field="name" list="progressOperatorNames" value="${escapeHtml(plan.name || "")}" /></label>
      <label>职业（同名干员可指定）<select data-plan-field="role">${selectOptions(OPER_ROLES, plan.role || "", escapeHtml)}</select></label>
      <label>精英化目标<select data-plan-field="elite">${selectOptions([{label:"不指定",value:""},{label:"精一",value:1},{label:"精二",value:2}], plan.elite ?? "", escapeHtml)}</select></label>
      <label>技能等级目标<select data-plan-field="skill_level">${selectOptions([{label:"不指定",value:""}, ...Array.from({length:6}, (_,i) => ({label:String(i+2),value:i+2}))], plan.skill_level ?? "", escapeHtml)}</select></label>
      ${[0,1,2].map((i) => `<label>技能 ${i+1} 专精<select data-plan-mastery="${i}">${selectOptions([{label:"不指定",value:0},{label:"专一",value:1},{label:"专二",value:2},{label:"专三",value:3}], plan.skill_mastery?.[i] || 0, escapeHtml)}</select></label>`).join("")}
      <div class="buttonRow"><button type="button" data-progress-action="up" data-plan-index="${index}" ${index === 0 ? "disabled" : ""}>上移</button><button type="button" data-progress-action="remove" data-plan-index="${index}">删除本行</button></div>
    </fieldset>`).join("")}
    <div class="buttonRow"><button type="button" data-progress-action="add">添加干员计划</button><button type="button" data-progress-action="clear">清空计划</button></div>
  </div>`;
}

function collectOperProgressParams() {
  const plans = [...document.querySelectorAll("[data-oper-plan]")].map((row) => {
    const plan = { name: row.querySelector('[data-plan-field="name"]').value.trim() };
    for (const key of ["role", "elite", "skill_level"]) {
      const value = row.querySelector(`[data-plan-field="${key}"]`).value;
      if (value !== "") plan[key] = key === "role" ? value : Number(value);
    }
    plan.skill_mastery = [0,1,2].map((i) => Number(row.querySelector(`[data-plan-mastery="${i}"]`).value));
    return plan;
  });
  return { plans };
}

function editProgressPlans(button) {
  const action = button.dataset.progressAction;
  if (action === "clear" && !window.confirm("确定清空全部干员培养计划？")) return;
  collectTaskForm();
  const task = selectedTask();
  if (!task || task.type !== "OperProgress") return;
  const plans = task.params.plans || [];
  const index = Number(button.dataset.planIndex);
  if (action === "add") plans.push({ name: "", skill_mastery: [0,0,0] });
  if (action === "remove") plans.splice(index, 1);
  if (action === "up" && index > 0 && index < plans.length) [plans[index-1], plans[index]] = [plans[index], plans[index-1]];
  task.params.plans = action === "clear" ? [] : plans;
  renderEditor();
  scheduleSave();
}

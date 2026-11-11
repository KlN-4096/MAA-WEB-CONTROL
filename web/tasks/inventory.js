function renderDepotMaintainGeneral(p, escapeHtml) {
  const targets = p.targets || [];
  return `<div class="planEditor">
    <p class="formNote">按后端完整仓库补足材料，达标或今日关卡未开放则跳过。药剂/源石必须同时打开总开关与目标行开关。关闭前置识别会使用同配置的历史仓库，离线消耗后请重新识别。</p>
    ${checkRow("stockRefresh","开始前重新识别仓库",p.update_depot ?? true)}
    ${checkRow("stockSort","按当前/目标达成率升序执行",p.sort_by_progress)}
    ${checkRow("stockFirst","只执行第一个库存不足目标",p.only_first)}
    ${checkRow("stockChips","双芯片按配方折算为芯片组（不实际合成）",p.count_dual_chips)}
    ${checkRow("stockAuto","AUTO 代理倍率",p.use_auto_series)}
    ${checkRow("stockMedicine","允许使用药剂",p.use_medicine)}
    ${checkRow("stockStone","允许使用源石",p.use_stone)}
    ${checkRow("stockExpiring","使用 2 天内临期药剂",p.use_expiring_medicine)}
    ${checkRow("stockActivity","SideStory 活动期间跳过",p.skip_during_activity)}
    ${checkRow("stockResource","资源全开放期间跳过",p.skip_during_resource_collection)}
    ${targets.map((row, index) => `<fieldset class="planRow" data-inventory-row="${index}">
      <legend>目标 ${index + 1}</legend>
      <label>材料<select data-stock-field="item_id">${selectOptions(dropOptions(), row.item_id || "", escapeHtml)}</select></label>
      <label>保持数量<input data-stock-field="quantity" type="number" min="1" max="999999" value="${numberValue(row.quantity, 100)}" /></label>
      <label>关卡代码<input data-stock-field="stage" value="${escapeHtml(row.stage || "")}" placeholder="例如 1-7" /></label>
      <label><input data-stock-field="use_medicine" type="checkbox" ${checked(row.use_medicine)}/>此目标使用药剂<input data-stock-field="medicine" type="number" min="0" max="999" value="${numberValue(row.medicine,0)}"/></label>
      <label><input data-stock-field="use_stone" type="checkbox" ${checked(row.use_stone)}/>此目标使用源石<input data-stock-field="stone" type="number" min="0" max="999" value="${numberValue(row.stone,0)}"/></label>
      <button type="button" data-inventory-action="remove" data-row-index="${index}">删除本行</button>
    </fieldset>`).join("")}
    <button type="button" data-inventory-action="add">添加材料目标</button>
    <label>每项目最多场次（默认不限制）<input id="stockMaxTimes" type="number" min="1" max="2147483647" value="${numberValue(p.max_times, 2147483647)}" /></label>
  </div>`;
}

function collectDepotMaintainParams() {
  return {
    targets: [...document.querySelectorAll("[data-inventory-row]")].map((row) => ({
      item_id: row.querySelector('[data-stock-field="item_id"]').value,
      quantity: Number(row.querySelector('[data-stock-field="quantity"]').value),
      stage: row.querySelector('[data-stock-field="stage"]').value.trim(),
      medicine: Number(row.querySelector('[data-stock-field="medicine"]').value),
      stone: Number(row.querySelector('[data-stock-field="stone"]').value),
      use_medicine: row.querySelector('[data-stock-field="use_medicine"]').checked,
      use_stone: row.querySelector('[data-stock-field="use_stone"]').checked
    })),
    max_times: Number($("stockMaxTimes")?.value || 2147483647),
    update_depot: boolOf("stockRefresh"), sort_by_progress: boolOf("stockSort"), only_first: boolOf("stockFirst"),
    count_dual_chips: boolOf("stockChips"), use_auto_series: boolOf("stockAuto"), use_medicine: boolOf("stockMedicine"),
    use_stone: boolOf("stockStone"), use_expiring_medicine: boolOf("stockExpiring"), skip_during_activity: boolOf("stockActivity"),
    skip_during_resource_collection: boolOf("stockResource")
  };
}

function editInventoryTargets(button) {
  collectTaskForm();
  const task = selectedTask();
  if (!task || task.type !== "DepotMaintain") return;
  const rows = task.params.targets || [];
  if (button.dataset.inventoryAction === "add") rows.push({ item_id: "", quantity: 100, stage: "" });
  if (button.dataset.inventoryAction === "remove") rows.splice(Number(button.dataset.rowIndex), 1);
  task.params.targets = rows;
  renderEditor();
  scheduleSave();
}

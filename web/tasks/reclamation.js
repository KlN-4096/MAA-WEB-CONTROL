function renderReclamationGeneral(p, escapeHtml) {
  return `
    <div class="maaParams wideForm">
      <span>生息演算主题</span><select id="paramReclamationTheme">${selectOptions(RECLAMATION_THEMES, p.theme || "沙洲遗闻", escapeHtml)}</select>
      <span>策略</span><select id="paramReclamationStrategy">${selectOptions(RECLAMATION_STRATEGIES, p.strategy || RECLAMATION_STRATEGIES[1], escapeHtml)}</select>
      <div class="reclamationText scrollBox">
        <p>目前生息演算的支持仍处于中期阶段，使用时请注意以下几点：</p>
        <p>通过开局刷点数：（小心已有存档被删除）</p>
        <p>1. 点数刷满后会输出「任务完成」，自动停止任务</p>
        <p>2. 不要在生息演算的编队中有干员的情况下使用</p>
        <p>3. 手动确认存档情况并删除，以免 MAA 删除你的珍贵存档</p>
        <p>4. 导航还没写，不能从生息演算以外的位置开始任务</p>
        <p>5. 如果任务过程中报错、点数没刷满就任务完成，请前往 GitHub 提交 issue</p>
        <p>有存档通过制造刷点数（高级设置）：</p>
        <p>1. 要求是结算后的第一天，且后续三天没有敌袭进入驻扎地</p>
        <p>2. 必须在进入大地图后的界面开始（能看到驻扎地的界面）</p>
        <p>3. 如果能制造的数量刚好是 99 的倍数会卡住，在存档前可以先用掉一点，这个之后再修</p>
      </div>
    </div>
  `;
}

function renderReclamationAdvanced(p, escapeHtml) {
  const archiveMode = (p.strategy || RECLAMATION_STRATEGIES[1]) === RECLAMATION_STRATEGIES[1];
  const disabled = archiveMode ? "" : " disabled";
  return `
    <div class="maaParams wideForm">
      <span>支援道具名称</span><input id="paramReclamationTool" value="${escapeHtml(p.tool_to_craft || "荧光棒")}"${disabled} />
      <span>增加方式</span><select id="paramReclamationIncrement"${disabled}>${selectOptions(RECLAMATION_INCREMENT_MODES, p.increment_mode || "连点", escapeHtml)}</select>
      <span>单次最大组装轮数</span><input id="paramReclamationCraftCount" type="number" min="0" value="${numberValue(p.max_craft_count, 16)}"${disabled} />
      ${archiveMode ? "" : checkRow("clear_store", "任务完成后购买商店", p.clear_store)}
    </div>
  `;
}

function collectReclamationParams() {
  const params = {};
  addValue(params, "theme", "paramReclamationTheme", "沙洲遗闻");
  addValue(params, "strategy", "paramReclamationStrategy", RECLAMATION_STRATEGIES[1]);
  addValue(params, "tool_to_craft", "paramReclamationTool", "荧光棒");
  addValue(params, "increment_mode", "paramReclamationIncrement", "连点");
  addNumber(params, "max_craft_count", "paramReclamationCraftCount", 16);
  addBool(params, "clear_store", "clear_store");
  return params;
}

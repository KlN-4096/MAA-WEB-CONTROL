function renderAwardGeneral(p) {
  return `
    <div class="maaParams wideForm">
      ${checkRow("daily", "领取每日/每周任务奖励", p.daily ?? true)}
      ${checkRow("mail", "领取所有邮件奖励", p.mail)}
      ${checkRow("free_gacha", `进行限定池赠送的每日免费单抽${hint("若不存在免费单抽，则不会抽取", escapeHtmlFallback)}`, p.free_gacha)}
      ${checkRow("orundum", "领取幸运墙的每日合成玉奖励", p.orundum ?? true)}
      ${checkRow("limited_orundum", "领取限时开采许可的每日合成玉奖励", p.limited_orundum)}
      ${checkRow("monthly_card", "领取周年赠送月卡奖励", p.monthly_card)}
    </div>
  `;
}

function collectAwardParams() {
  const params = {};
  addBool(params, "daily", "daily");
  addBool(params, "mail", "mail");
  addBool(params, "free_gacha", "free_gacha");
  addBool(params, "orundum", "orundum");
  addBool(params, "limited_orundum", "limited_orundum");
  addBool(params, "monthly_card", "monthly_card");
  return params;
}

function renderMallGeneral(p) {
  return `
    <div class="maaParams wideForm">
      ${checkRow("visit_friends", "访问好友", p.visit_friends ?? true)}
      <div class="subLine">└ <label class="inlineCheck"><input id="paramVisitOnce" type="checkbox" ${checked(p.visit_once)} />一日只执行一次</label></div>
      ${checkRow("credit_fight", "借助战打 OF-1 赚信用", p.credit_fight)}
      ${checkRow("shopping", "信用交易所自动购物", p.shopping ?? true)}
      <span>以下功能需在基建换班中设置并执行</span>
      <div class="readonlyList"><p>会客室信息板收取信用</p><p>进行线索交流</p><p>赠送线索</p></div>
    </div>
  `;
}

function renderMallAdvanced(p, escapeHtml) {
  return `
    <div class="maaParams wideForm">
      <span>优先购买 子串即可 分号分隔</span><input class="wideInput" id="paramBuyFirst" value="${escapeHtml((p.buy_first || []).join(";"))}" />
      <span>黑名单 子串即可 分号分隔</span><input class="wideInput" id="paramBlacklist" value="${escapeHtml((p.blacklist || []).join(";"))}" />
      <span>信用战斗编队号</span><input id="paramMallFormation" type="number" min="0" value="${numberValue(p.formation_index, 0)}" />
      ${checkRow("credit_fight_once", "信用战斗一日只执行一次", p.credit_fight_once)}
      ${checkRow("overflow_blacklist", "信用溢出时无视黑名单", p.overflow_blacklist)}
      ${checkRow("discount_only", "只购买打折的信用商品", p.discount_only)}
      ${checkRow("stop_if_low", "信用点低于 300 时停止购买商品", p.stop_if_low)}
    </div>
  `;
}

function collectMallParams() {
  const params = {};
  addBool(params, "visit_friends", "visit_friends");
  addBool(params, "visit_once", "paramVisitOnce");
  addBool(params, "credit_fight", "credit_fight");
  addBool(params, "credit_fight_once", "credit_fight_once");
  addNumber(params, "formation_index", "paramMallFormation", 0);
  addBool(params, "shopping", "shopping");
  addList(params, "buy_first", "paramBuyFirst");
  addList(params, "blacklist", "paramBlacklist");
  addBool(params, "overflow_blacklist", "overflow_blacklist");
  addBool(params, "discount_only", "discount_only");
  addBool(params, "stop_if_low", "stop_if_low");
  return params;
}

let executionRecords = null;
let executionRecordsProfile = "";

async function loadExecutionRecords() {
  const name = state.profile?.name;
  if (!name) return;
  const records = await api(`/api/execution/state?profile_name=${encodeURIComponent(name)}`);
  if (state.profile?.name !== name) return;
  executionRecords = records;
  executionRecordsProfile = name;
  if (TOOLS_STATE.tab === 6) renderToolsView();
}

function renderExecutionRecords() {
  const data = executionRecordsProfile === state.profile?.name ? executionRecords : null;
  const reports = data?.reports || [];
  const daily = new Map();
  for (const session of reports) {
    const row = daily.get(session.day) || { battles: 0, rounds: 0, sanity: 0, known: true, medicine: 0, expiring: 0, stone: 0 };
    row.battles += session.battles;
    row.rounds += session.rounds;
    row.sanity += session.sanity;
    row.known &&= session.sanity_known;
    row.medicine += session.medicine;
    row.expiring += session.expiring_medicine;
    row.stone += session.stone;
    daily.set(session.day, row);
  }
  const progress = Object.values(data?.progress || {});
  return `<section class="toolsScroll">
    <div class="buttonRow"><button type="button" data-record-refresh>刷新记录</button><a href="/api/logs/archive" download>下载日志包</a></div>
    <p class="formNote">当前配置：${escapeHtml(state.profile?.name || "未选择")}。按游戏区服凌晨 04:00 换日；只统计已识别结算的普通作战，不估算未知理智。升级前没有采集的历史不会补算。</p>
    ${data ? "" : "<p>点击刷新读取后端保存的记录。</p>"}
    <h3>作战日报</h3>
    ${daily.size ? `<table class="recordsTable"><thead><tr><th>游戏日</th><th>场次 / 轮次</th><th>理智</th><th>药剂 / 临期药 / 源石</th></tr></thead><tbody>${[...daily].sort(([a],[b])=>b.localeCompare(a)).map(([day,row])=>`<tr><td>${escapeHtml(day)}</td><td>${row.battles} / ${row.rounds}</td><td>${row.sanity}${row.known ? "" : "（部分未知）"}</td><td>${row.medicine} / ${row.expiring} / ${row.stone}</td></tr>`).join("")}</tbody></table>` : "<p>暂无作战结算记录。</p>"}
    <h3>最近关卡与掉落</h3>
    ${reports.slice(-30).reverse().map((session) => `<details><summary>${escapeHtml(session.day)} · ${escapeHtml(session.stage)} · ${session.battles} 场</summary><p>${Object.values(session.drops).map((drop)=>`${escapeHtml(drop.name)} × ${drop.quantity}`).join("；") || "无已识别掉落"}</p></details>`).join("")}
    <h3>干员培养进度</h3>
    ${progress.length ? `<table class="recordsTable"><thead><tr><th>干员</th><th>结果</th><th>详细信息</th><th>更新时间</th></tr></thead><tbody>${progress.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.result || "")}</td><td>${escapeHtml(item.result_detail || "")}<br/>${escapeHtml(JSON.stringify({elite:item.elite,skill_level:item.skill_level,skill_mastery:item.skill_mastery}))}</td><td>${escapeHtml(item.updated_at || "")}</td></tr>`).join("")}</tbody></table>` : "<p>暂无培养记录。</p>"}
    <h3>后端库存</h3><p>${data?.inventory?.updated_at ? `上次成功识别：${escapeHtml(data.inventory.updated_at)}；${Object.keys(data.inventory.items || {}).length} 种物品。执行库存保持时仍会重新识别，避免使用离线消耗前的数据。` : "暂无完整识别记录。"}</p>
  </section>`;
}

// Stage open schedule: JS getDay() values (0=Sun, 1=Mon, ..., 6=Sat)
const CLIENT_TIMEZONE_OFFSETS = {
  Official: 8,
  Bilibili: 8,
  txwy: 8,
  YoStarEN: -7,
  YoStarJP: 9,
  YoStarKR: 9
};
const STAGE_SCHEDULE = [
  { days: new Set([2,4,6,0]), tip: "CE-6: 龙门币" },
  { days: new Set([1,4,6,0]), tip: "AP-5: 红票" },
  { days: new Set([2,3,5,0]), tip: "CA-5: 技能" },
  { days: new Set([1,3,5,6]), tip: "SK-5: 碳" },
  { days: null,               tip: "LS-6: 经验" },
  { days: new Set([1,4,5,0]), tip: "PR-A-1/2: 奶&盾芯片" },
  { days: new Set([1,2,5,6]), tip: "PR-B-1/2: 术&狙芯片" },
  { days: new Set([3,4,6,0]), tip: "PR-C-1/2: 先&辅芯片" },
  { days: new Set([2,3,6,0]), tip: "PR-D-1/2: 近&特芯片" },
];

function renderStageTips() {
  const block = document.getElementById("stageTipsBlock");
  if (!block) return;
  block.textContent = activeStageTipText() || fallbackStageTipText();
}

function activeStageTipText() {
  const tips = (typeof activeClientOptions === "function" ? activeClientOptions() : null)?.stage_tips
    || state.options?.stage_tips;
  const text = tips && typeof tips.text === "string" ? tips.text.trim() : "";
  return text || "";
}

function fallbackStageTipText() {
  const today = maaStageDay();
  const lines = STAGE_SCHEDULE
    .filter((g) => g.days === null || g.days.has(today))
    .map((g) => g.tip);
  return ["今日关卡小提示:", ...lines].join("\n");
}

function maaStageDay() {
  const client = typeof activeClientType === "function" ? activeClientType() : "Official";
  const offset = CLIENT_TIMEZONE_OFFSETS[client] ?? 8;
  return new Date(Date.now() + (offset - 4) * 60 * 60 * 1000).getUTCDay();
}

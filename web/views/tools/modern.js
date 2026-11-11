const PIXEL_STATE = {image:"",preview:"",groups:null,fit:"cover",dither:false,brightness:1,contrast:1,saturation:1,swipe:true,grid_delay:0,generation:0};

function availableMiniGames() {
  const permanent = new Set(["SS@Store@Begin","GreenTicket@Store@Begin","YellowTicket@Store@Begin","RA@Store@Begin","MiniGame@SecretFront","MiniGame@SPA"]);
  const base = MINI_GAMES.filter((item)=>permanent.has(item.value));
  const dynamic = activeClientOptions()?.tools?.mini_games || [];
  return [...new Map([...base,...dynamic].map((item)=>[item.value,item])).values()];
}

function renderModernTools() {
  return `<div class="toolsScroll">
    <h3>材料合成</h3><p>先从培养缺料弹窗进入加工站合成页面。会递归合成所需材料，原料不足即停止；会消耗游戏内材料。</p>
    <button type="button" data-modern-tool="material_synthesis">开始合成</button>
    <h3>自动升潜</h3><p>手动进入干员列表后运行。默认不使用普通信物补足中坚信物。</p>
    <label><input id="potentialNormalToken" type="checkbox"/>允许消耗普通信物</label>
    <button type="button" data-modern-tool="auto_potential">开始升潜</button>
    <h3>诅咒藏品</h3><p>进入对应活动界面后运行，活动和区服是否适配以当前核心资源为准。</p>
    <button type="button" data-modern-tool="cursed_relic">开始任务</button>
    <button type="button" data-modern-tool="stop">停止当前任务</button>
  </div>`;
}

function renderPixelPaint() {
  return `<div class="toolsScroll">
    <p>上传图片后转换为游戏 24×24 / 40 色像素画。先检查预览，再手动进入游戏像素编辑器开始绘制；不会自动打开或保存其他作品。</p>
    <label>图片<input id="pixelSource" type="file" accept="image/png,image/jpeg,image/webp"/></label>
    <label>构图<select data-pixel-field="fit">${selectOptions([{value:"cover",label:"裁剪填满"},{value:"contain",label:"完整保留留白"},{value:"stretch",label:"拉伸"}],PIXEL_STATE.fit,escapeHtml)}</select></label>
    <label><input data-pixel-field="dither" type="checkbox" ${checked(PIXEL_STATE.dither)}/>Floyd–Steinberg 抖动</label>
    ${[["brightness","亮度"],["contrast","对比度"],["saturation","饱和度"]].map(([key,label])=>`<label>${label}<input data-pixel-field="${key}" type="number" min="0" max="3" step="0.1" value="${PIXEL_STATE[key]}"/></label>`).join("")}
    <button type="button" data-pixel-convert ${PIXEL_STATE.image ? "" : "disabled"}>转换并预览</button>
    ${PIXEL_STATE.preview ? `<img class="pixelPreview" src="${PIXEL_STATE.preview}" width="288" height="288" alt="24×24 游戏色板预览"/>` : ""}
    <label><input data-pixel-field="swipe" type="checkbox" ${checked(PIXEL_STATE.swipe)}/>连续滑动绘制</label>
    <label>每格额外等待（毫秒）<input data-pixel-field="grid_delay" type="number" min="0" max="5000" value="${PIXEL_STATE.grid_delay}"/></label>
    <button type="button" data-modern-tool="pixel_paint" ${PIXEL_STATE.groups ? "" : "disabled"}>按预览绘制</button>
    <button type="button" data-modern-tool="stop">停止当前任务</button>
  </div>`;
}

async function readImageFile(file) {
  if (!file || !["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > 8*1024*1024) throw new Error("请选择不超过 8 MiB 的 PNG/JPEG/WebP 图片");
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(String(reader.result));
    reader.onerror = ()=>reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

async function loadPixelSource(file) {
  if (!file) return;
  const generation = ++PIXEL_STATE.generation;
  PIXEL_STATE.image = "";
  PIXEL_STATE.groups = null;
  PIXEL_STATE.preview = "";
  renderToolsView();
  const image = await readImageFile(file);
  if (generation !== PIXEL_STATE.generation) return;
  PIXEL_STATE.image = image;
  renderToolsView();
}

async function convertPixelPaint() {
  const {image,fit,dither,brightness,contrast,saturation} = PIXEL_STATE;
  const generation = ++PIXEL_STATE.generation;
  const result = await api("/api/tools/pixel/preview",{method:"POST",body:JSON.stringify({image_base64:image,fit,dither,brightness,contrast,saturation})});
  if (generation !== PIXEL_STATE.generation) return;
  PIXEL_STATE.groups = result.groups;
  PIXEL_STATE.preview = result.preview;
  renderToolsView();
}

async function runModernTool(tool) {
  if (tool === "stop") {
    await api("/api/tools/stop",{method:"POST"});
    return;
  }
  if (!window.confirm(tool === "pixel_paint" ? "确认已进入游戏像素编辑器，并按当前预览覆盖画布？" : "确认在游戏中执行此操作？合成和升潜可能消耗现有材料。")) return;
  const params = tool === "auto_potential" ? {use_normal_token:Boolean($("potentialNormalToken")?.checked)} :
    tool === "pixel_paint" ? {groups:PIXEL_STATE.groups,swipe:PIXEL_STATE.swipe,grid_delay:PIXEL_STATE.grid_delay} : {};
  const result = await api("/api/tools/run",{method:"POST",body:JSON.stringify({tool,params,profile_name:state.profile?.name || ""})});
  if (!result.ok) throw new Error(result.message || "任务启动失败");
  showNotice("任务已启动，进度见右侧日志。","success");
  scheduleRefreshStatus();
}

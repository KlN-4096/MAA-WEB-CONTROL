# MAA 原版日志复刻计划

## 文档状态

本文是实施前计划。当前阶段只做原版日志系统对齐，不修改运行代码，不启动真实 MAA/MaaCore/ADB。

对照目标：

- 视觉、状态和日志语义必须和原版 MAA 源码一致。
- 行为上以 MaaCore callback、原版 `TaskQueueViewModel.AddLog`、`LogCardItemViewModel`、`AsstProxy` 的日志转换逻辑为准。
- 保留 Web 后端的原始事件与 detail，方便排查问题。

## 硬性要求

这部分不能按“相似实现”处理，必须按源码逻辑复刻：

1. 分卡状态机必须等价于 `TaskQueueViewModel.AddLog()`。
2. 卡片创建必须等价于 `createNewCard()`：如果最后一张卡片为空，不再创建第二张空卡。
3. item 合并必须等价于 `TryMergeIntoLastCard()`：普通日志只追加到最后一张卡，不由前端重新猜分组。
4. `LogCardSplitMode.None / Before / After / Both` 的前后分卡顺序必须一致。
5. `LogCard.StartTime` 和 `EndTime` 必须由第一条和最后一条 item 的 `Time` 派生。
6. 缩略图挂载必须等价于 `AttachThumbnailToCardAsync()`：只在 `updateCardImage=true` 时捕获并挂到当前最后一张卡。
7. 缩略图裁剪必须等价于 `TrimOldThumbnails()`：按卡片顺序清除最老的缩略图，只清 `Thumbnail`，不删日志卡片和日志文字。
8. MaaCore callback 到可读日志的转换必须优先逐项搬运 `AsstProxy.ProcTaskChainMsg / ProcSubTaskStart / ProcSubTaskCompleted / ProcSubTaskExtraInfo / ProcSubTaskError` 的分支逻辑。
9. `UiLogColor` 必须保留原版 color key，CSS 只是 key 的渲染映射，不允许在后端只压缩成 `info/warning/error`。
10. 无法在浏览器 1:1 复刻的仅限 WPF 表现层能力，例如原生 `ToolTip` 控件、toast、overlay；日志数据结构和 callback 映射不能简化。

## 当前结论

原版 MAA 的日志不是普通事件流，而是“卡片日志”：

- 每张卡片包含多条日志 item。
- 左侧是时间列，卡片有开始时间和结束时间。
- 卡片可以带截图缩略图，悬停可查看更大图。
- 单条日志可以有颜色、粗体、tooltip。
- `splitMode` 决定一条日志是否开启新卡片或独占卡片。
- 任务开始、任务完成、错误、理智作战掉落统计、基建设施切换、公招结果都会用不同的卡片分组。

当前 Web 的日志仍是简单事件列表：

- `EventRecord` 只有 `ts / level / type / message / detail`。
- 前端 `renderLogs()` 逐条渲染 `.logItem`。
- 没有卡片分组、开始/结束时间、截图缩略图、tooltip、原版颜色键、日志合并规则。
- `maa.callback` 目前只显示 `MAA callback {message}`，没有转换成原版可读日志。

## 原版日志模型

### LogItem

原版 `LogItemViewModel` 字段，Web 字段必须语义等价：

| 字段 | 含义 | Web 对齐 |
|---|---|---|
| `Time` | 日志产生时间，默认格式来自设置 | `time` |
| `Content` / `DisplayContent` | 多行日志正文 | `content` |
| `Color` | `UiLogColor` brush key | `color_key` |
| `Weight` | Regular/Bold | `weight` |
| `ShowTime` | plain log 是否显示时间 | 必须保留，卡片日志可不显示但数据不丢 |
| `ToolTip` | 文字、富文本或截图 tooltip | `tooltip` |

### LogCard

原版 `LogCardItemViewModel` 字段与 XAML 推导，Web 字段必须语义等价：

| 字段 | 含义 | Web 对齐 |
|---|---|---|
| `Items` | 卡片内多条 `LogItem` | `items` |
| `StartTime` | 第一条 item 时间 | 由 `items[0].time` 派生 |
| `EndTime` | 最后一条 item 时间 | 由最后一条 item 派生 |
| `Thumbnail` | 卡片截图缩略图 | `thumbnail_url` / `thumbnail_id` |
| `ShowThumbnail` | 是否显示缩略图 | `Boolean(thumbnail_url)` |

必须保留的派生规则：

- `StartTime = Items[0].Time`，无 item 时为空字符串。
- `EndTime = Items[^1].Time`，无 item 时为空字符串。
- `ShowThumbnail = Thumbnail is not null`。
- item 的 `Time` 变化时，所属 card 的 `StartTime / EndTime` 也要更新。Web 不一定有 WPF 的 `PropertyChanged`，但结果必须一致。

### SplitMode

原版 `LogCardSplitMode`：

| 模式 | 含义 | 示例 |
|---|---|---|
| `None` | 合并进当前卡片 | 连接中、最快截图耗时、正在运行 |
| `Before` | 先开新卡片，再写日志 | 开始任务、进入基建设施、开始一次作战 |
| `After` | 写入后再开新卡片 | 少见 |
| `Both` | 独占卡片 | 停止、全部完成、严重错误 |

Web 必须由后端显式保存并发送 `split_mode` 结果，不允许前端只靠事件名猜测。

等价伪代码：

```text
AddLog(content, color, weight, tooltip, updateCardImage, fetchLatestImage, useCardImageAsToolTip, splitMode):
  if splitMode is Before or Both:
    createNewCard()

  if no card exists and (content is not empty or updateCardImage):
    createNewCard()

  if card exists:
    if content is not empty:
      append LogItem to LogItemViewModels
      append same LogItem to last LogCard.Items

    if updateCardImage:
      AttachThumbnailToCardAsync(last card, fetchLatestImage, useCardImageAsToolTip)

  if splitMode is After or Both:
    createNewCard()

createNewCard():
  if card list not empty and last card has zero items:
    return
  append new empty card
```

## 视觉复刻目标

以用户提供的原版截图为准：

- 日志区域为深色背景。
- 卡片最大宽度约等于原版右侧日志列，原版 XAML 为 `MaxWidth=420`。
- 卡片边框为低对比灰色，圆角约 4px。
- 卡片间距很小，约 2.5px。
- 左侧时间列固定宽度，原版约 60px。
- 时间为灰色，正文为浅灰。
- 卡片正文多行自然换行，不压缩行距。
- 缩略图位于左侧时间列下方，保持 16:9，原版缩略图源为 640x360。
- 缩略图下方显示结束时间；当开始时间等于结束时间且只有一条日志时可隐藏结束时间。
- 有 tooltip 的日志右侧显示圆形/箭头提示按钮，悬停显示 tooltip。
- 默认显示卡片日志；plain text 日志可以作为设置项保留。

## 颜色映射

原版使用 `UiLogColor` brush key，不是普通 `info/warning/error` 四级。

第一阶段必须支持这些 key，且后端事件必须保留原 key：

| 原版 key | 用途 | Web 颜色建议 |
|---|---|---|
| `TraceLogBrush` | 普通灰色日志 | 浅灰 |
| `MessageLogBrush` | 常规消息 | 浅灰 |
| `InfoLogBrush` | 信息、截图耗时、理智作战阶段 | 青色 |
| `SuccessLogBrush` | 成功 | 绿色 |
| `WarningLogBrush` | 警告 | 橙色 |
| `ErrorLogBrush` | 错误 | 红色 |
| `RareOperatorLogBrush` | 高星公招结果 | 青色/高亮加粗 |
| `LdSpecialScreenshot` | 雷电增强截图命中 | 蓝紫色，类似截图中的“最快截图耗时” |
| `MuMuSpecialScreenshot` | MuMu 增强截图命中 | 蓝紫色 |

第二阶段继续补全剩余源码 key，但不能改变已有 key 的语义：

- 公招星级颜色：1/2/3/4/5/6 星。
- 肉鸽节点颜色：战斗、紧急、商店、藏品、BOSS 等。
- 下载日志颜色。

## 后端事件模型

当前 `EventRecord` 不足以表达卡片日志。必须新增语义日志事件，不破坏原始事件：

```json
{
  "type": "maa.log.item",
  "ts": "2026-05-03T13:42:37Z",
  "message": "1-7 掉落统计:\n龙门币 : 432 (+432)",
  "level": "info",
  "detail": {
    "card_id": "run-xxx-card-004",
    "split_mode": "Before",
    "color_key": "InfoLogBrush",
    "weight": "Regular",
    "tooltip": { "kind": "material_drops", "items": [] },
    "thumbnail": { "capture": true, "force": false },
    "raw": {}
  }
}
```

后端内部模型必须等价表达原版结构：

```text
MaaLogService
  append(content, color_key, weight, tooltip, split_mode, thumbnail)
  clear()
  cards()
  recent_events()

MaaLogCard
  id
  items[]
  thumbnail_id

MaaLogItem
  id
  time
  content
  color_key
  weight
  tooltip
  raw_event
```

原则：

- `maa.callback` 原始事件继续保留。
- `maa.log.item` 是复刻 UI 的主数据源。
- 前端不要直接解析所有 MaaCore callback；callback 到中文日志的转换放在后端。
- 运行完成后可以通过 `/api/logs/cards` 重拉完整卡片状态，WebSocket 只负责增量。
- `EventRecord.level` 只能作为兼容字段，不能替代 `color_key`。

## Callback 到日志的映射

### 启动和连接

运行开始后第一张卡片应按原版合并：

```text
Build Time:
2026/5/2 12:30:07
Resource Time:
2026/5/1 17:02:14
正在连接模拟器……
最快截图耗时: 49ms (LDExtras)
正在运行中……
```

映射：

- Web runner 开始时生成 Build Time / Resource Time。
- `runner.connecting` 追加“正在连接模拟器……”。
- MaaCore `ConnectionInfo` / `FastestWayToScreencap` 追加“最快截图耗时: {cost}ms ({method})”，带截图方法 tooltip。
- `AsstStart()` 成功后追加“正在运行中……”。
- 这些默认 `splitMode=None`，合并在第一张卡片。

### TaskChainStart

原版：

```text
开始任务: 开始唤醒
开始任务: 自动公招
开始任务: 基建换班
开始任务: 理智作战
```

映射：

- `TaskChainStart` -> `开始任务: {任务显示名}`
- `splitMode=Before`
- 更新任务列表状态为 running。

### TaskChainCompleted

原版：

```text
完成任务: 开始唤醒
完成任务: 自动公招
完成任务: 理智作战
理智: 0/210
```

映射：

- `TaskChainCompleted` -> `完成任务: {任务显示名}`
- Fight 且有 `SanityReport` 时追加下一行 `理智: {current}/{max}`。
- 默认 `splitMode=None`，和任务内最后一张卡片合并。

### TaskChainError

原版：

- 输出 `任务出错: {任务名}`。
- `UiLogColor.Error`。
- `updateCardImage=true`。
- `fetchLatestImage=true`。
- `useCardImageAsToolTip=true`。

Web 必须复刻：

- 错误卡片红色。
- 捕获当前截图作为缩略图。
- 最后一条错误日志右侧显示 tooltip 图标。
- 最终 runner 状态必须是 Failed，不允许随后显示 Completed。

### TaskChainStopped

原版：

- `SetStopped()`。
- 清空任务状态。
- 停止日志独占卡片。

Web 必须复刻：

- `/api/stop` 后显示“正在停止……”。
- 真正 stopped 后显示“已停止”或原版本地化 `Stopped`。
- 不能再追加“任务已全部完成”。

### AllTasksCompleted

原版截图对应：

```text
任务已全部完成！
(用时 0h 10m 5s)
```

理智作战结束时：

```text
任务已全部完成！
(用时 0h 4m 18s)
理智将在 2026-05-04 18:46 回满。(20h 59m 后)
```

映射：

- `AllTasksCompleted` -> 独占完成卡片，`splitMode=Both`。
- 计算用时使用后端 run start time。
- 如果 Fight `SanityReport` 存在，计算回满时间：`report_time + (sanity_max - sanity_current) * 6min`。

## 任务内日志映射

### 公招识别

原版截图：

```text
公招识别结果:
狙击干员
医疗干员
辅助干员
术师干员
新手
3 ★ Tags
已确认招募
```

映射：

- `SubTaskExtraInfo.what=RecruitTagsDetected`
  - `splitMode=Before`
  - `updateCardImage=true`
  - 内容为 `公招识别结果:\n{tags}`
- `RecruitResult`
  - `level >= 5` 使用 `RareOperatorLogBrush` + `Bold`
  - `level < 5` 使用 `InfoLogBrush`
  - tooltip 为推荐组合/候选结果。
- `RecruitTagsSelected` -> `选择 Tags:\n{selected}`
- `RecruitConfirm` -> `已确认招募`
- `RecruitTagsRefreshed` -> `已刷新 N 次`

### 基建换班

原版截图：

```text
当前设施: 制造站 01
当前设施: 制造站 02
当前设施: 贸易站 01
当前设施: 宿舍 04
当前设施: 训练室 01
训练室空闲中
完成任务: 基建换班
```

映射：

- `SubTaskExtraInfo.what=EnterFacility`
  - 内容：`当前设施: {facility_display} {index+1:D2}`
  - `splitMode=Before`
- `InfrastConfirmButton`
  - 空内容 + `updateCardImage=true` + `fetchLatestImage=true`
  - 给当前设施卡片挂缩略图。
- 训练室/线索/制造站等额外信息按原版 callback 追加到当前设施卡片。
- `TaskChainCompleted(Infrast)` 追加 `完成任务: 基建换班`。

### 信用收支

原版截图：

```text
开始任务: 信用收支
完成任务: 访问好友
完成任务: 信用收支
```

映射：

- `TaskChainStart(Mall)` 开新卡片。
- `VisitLimited` / `VisitNextBlack` -> `完成任务: 访问好友`
- `EndOfActionThenStop` -> `完成任务: 借助战`
- `TaskChainCompleted(Mall)` -> `完成任务: 信用收支`

### 领取奖励

原版截图：

```text
开始任务: 领取奖励
完成任务: 领取奖励
```

映射：

- 只需 TaskChainStart/Completed。
- 领取到的细节如果 callback 有 `SubTaskExtraInfo`，追加到当前卡片。

### 理智作战

原版截图：

```text
开始行动 1~6 次, -36理智
理智: 54/210

1-7 掉落统计:
龙门币 : 432 (+432)
“厂券” : 36 (+36)
固源岩 : 8 (+8)
基础作战记录 : 8 (+8)
双酮 : 1 (+1)
当前次数 : 6
```

第二张作战卡片：

```text
开始行动 7~9 次, -18理智
理智: 18/210

1-7 掉落统计:
龙门币 : 648 (+216)
...
当前次数 : 3
完成任务: 理智作战
理智: 0/210
```

映射：

- `SubTaskStart.ProcessTask` 且 task 为 `StartButton2` / `AnnihilationConfirm`
  - `splitMode=Before`
  - 内容来自 FightReport：`开始行动 {times} 次, -{sanity_cost}理智`
  - 如果有 SanityReport，追加 `理智: {current}/{max}`。
- `SubTaskExtraInfo.what=StageDrops`
  - 追加 `stageCode 掉落统计:\n{drops}\n当前次数 : {cur_times}`。
  - 掉落按原版规则排序：先按本次新增数量降序，再按总量降序。
  - `updateCardImage=true`。
  - tooltip 数据结构必须保留材料 id、名称、数量和新增数量；如果第一轮 UI 来不及画材料图标，也必须保留完整数据，不能只存纯文字。
- `TaskChainCompleted(Fight)` 追加完成任务与剩余理智。
- `AllTasksCompleted` 追加理智回满时间。

### 自动战斗 / Copilot

自动战斗页面使用 `CopilotViewModel.LogItemViewModels`，不完全等同一键长草右侧日志。

目标：

- 一键长草日志和自动战斗日志共用底层模型。
- 自动战斗运行时右侧或页面内日志源切换到 copilot log source。
- 缺干员、作业格式错误、战斗失败使用红色。
- 普通部署/开始/完成使用灰色或信息色。

## 缩略图方案

原版：

- `AddLog(... updateCardImage=true)` 后调用 `AsstGetImageBgrDataAsync`。
- 截图缩放为 640x360，只保存小图，避免长时间运行占用过多内存。
- `MaxNumberOfLogThumbnails` 控制保留数量。
- 卡片缩略图可以作为 tooltip 图片。

Web 方案必须保持源码语义：

1. 后端 `MaaLogService` 收到 `thumbnail.capture=true`。
2. 调官方 Python wrapper 的 `asst.get_image(size)` 或底层 `AsstGetImage/AsstGetImageBgr`。
3. 将 raw 图像转成 PNG/JPEG 缩略图。
4. 存在内存或 `data/runtime/log-thumbnails/{run_id}/`。
5. `MaaLogCard.thumbnail_url` 指向 `/api/logs/thumbnails/{id}`。
6. 保留数量默认 100，和源码 `GuiSettingsUserControlModel.MaxNumberOfLogThumbnails` 默认值一致；设置页可调整。

限制：

- 如果 MaaCore 尚未连接，不能截图。
- 如果当前 adapter 是 dry-run，使用空缩略图或 fixture。
- 如果 wrapper 只返回 RGB/BGR raw bytes，后端需要知道当前截图宽高；宽高可从连接后的截图数据或配置中推导。

## 前端渲染计划

新增或重构：

```text
web/logView.js
  renderLogCards(cards)
  renderLogCard(card)
  renderLogItem(item)
  renderLogTooltip(item)
  normalizeLogEvent(event)

web/styles.css
  .maaLogCard
  .maaLogTimeColumn
  .maaLogThumbnail
  .maaLogContent
  .maaLogItem
  .maaLogItem.color-*
  .maaLogTooltipButton
```

布局要求：

- 日志列表按时间正序显示，和原版截图一致，最新在底部。
- WebSocket 到达新日志后自动滚到底部。
- 保留“清空”按钮，只清空前端/当前 run 日志，不删除后端历史文件。
- 每张卡片左侧显示开始时间，必要时显示结束时间。
- 卡片内 item 不重复显示时间。
- 多行内容使用 `white-space: pre-wrap`。
- tooltip 图标位置靠右，不遮挡正文。
- 缩略图点击或 hover 展开大图。

## API 计划

建议新增：

- `GET /api/logs/cards?run_id=current`
- `GET /api/logs/recent?limit=100`
- `POST /api/logs/clear`
- `GET /api/logs/thumbnails/{thumbnail_id}`
- `GET /api/events`

WebSocket 事件：

- `maa.log.clear`
- `maa.log.card.created`
- `maa.log.item`
- `maa.log.thumbnail.updated`
- `maa.log.run.completed`

兼容策略：

- 旧 `EventRecord` 继续发送。
- 前端优先消费 `maa.log.*`。
- 调试模式下可以退回当前 `.logItem` 事件列表，避免页面空白；正式验收不能以 fallback 视为完成。

## 实施顺序

1. 后端新增日志模型和 `MaaLogService`，先用 fake event 单测验证分卡。
2. runner 接入 `MaaLogService.clear()`、Build Time、连接、running、stop、completed。
3. `maa_adapter` callback 增加解析层，把 `TaskChain*` 和常见 `SubTask*` 映射为 `maa.log.item`。
4. 前端新增卡片日志渲染，当前事件列表只作为调试 fallback。
5. 接入缩略图 API，先支持 `StageDrops`、`EnterFacility`、`TaskChainError`。
6. 补齐公招 tooltip、材料 tooltip、截图耗时 tooltip。
7. 设置页接入“使用卡片样式日志”和“日志缩略图最大数量”。

## 验收用例

### 一键长草基础流

输入 fake callback：

1. run start
2. connecting
3. fastest screenshot
4. running
5. StartUp start/completed
6. Recruit start/completed
7. AllTasksCompleted

期望：

- 第一张卡片包含 Build Time、Resource Time、连接、截图耗时、正在运行。
- StartUp 独立卡片：开始和完成在同一张卡片。
- Recruit 独立卡片。
- 全部完成独占卡片。

### 公招识别

输入 fake callback：

- `RecruitTagsDetected`
- `RecruitResult(level=3)`
- `RecruitTagsSelected`
- `RecruitConfirm`

期望：

- 新卡片显示 tags。
- `3 ★ Tags` 为信息色。
- 选择 Tags 和确认招募在同一卡片追加。
- 有截图缩略图。

### 基建换班

输入 fake callback：

- `EnterFacility(Manufacture, 0)`
- `InfrastConfirmButton`
- `EnterFacility(Trade, 1)`
- `InfrastConfirmButton`
- `TaskChainCompleted(Infrast)`

期望：

- 每个设施开一张新卡片。
- 每张设施卡片有缩略图。
- 时间列显示开始/结束时间。

### 理智作战

输入 fake callback：

- `ProcessTask.StartButton2`
- `StageDrops(stage=1-7, cur_times=6)`
- `ProcessTask.StartButton2`
- `StageDrops(stage=1-7, cur_times=3)`
- `TaskChainCompleted(Fight)`
- `AllTasksCompleted`

期望：

- 每次作战开一张新卡片。
- 掉落统计格式与截图一致。
- 掉落统计带缩略图。
- Fight 完成显示剩余理智。
- 全部完成显示理智回满时间。

### 错误与停止

输入 fake callback：

- `TaskChainError(Fight)`
- 或用户 stop 后 `TaskChainStopped`

期望：

- error 为红色，带最新截图 tooltip。
- stop 为停止卡片。
- 不出现“任务已全部完成”。

## 无法完全复刻项

| 原版能力 | 难点 | 替代方案 |
|---|---|---|
 WPF Tooltip 富文本和图片 | 浏览器实现不同 | HTML tooltip/popover，但 tooltip 数据必须完整保留 |
 WPF brush key 完全一致 | 主题资源不同 | 建立 `UiLogColor -> CSS var` 映射 |
 原版 toast/系统通知 | 浏览器权限和系统差异 | Web Notification 或后端 helper，默认关闭 |
 原版悬浮窗日志源 | 需要桌面 overlay | 后续做 Web 浮窗或独立小窗口 |
 卡片截图 hover 大图 | 需要截图 API 和图片缓存 | 后端缩略图服务 + 前端 popover |

## 关键证据

当前 Web：

- `app/models.py:60-76`：当前 `EventRecord` 只有通用事件字段。
- `app/events.py:9-22`：EventBus 只保存最近事件队列。
- `app/maa_adapter.py:116-123`：当前 callback 只发布 `maa.callback`。
- `app/runner.py:75-99`：runner 发布 connecting/appending/running/completed 等通用事件。
- `web/app.js:378-421`：当前 `renderLogs()` 渲染单条事件列表。
- `web/styles.css:589-608`：当前 `.logItem` 是简单二列事件卡。

原版 MAA：

- `src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:270-275`：plain log 与 card log 两套集合。
- `src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:279-312`：日志 item 合并进最后一张卡片。
- `src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:326-404`：日志缩略图截图、缩放、挂载。
- `src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:406-420`：按最老卡片清理超限缩略图。
- `src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:1147-1168`：`LogCardSplitMode`。
- `src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:1181-1239`：`AddLog` 参数和分卡逻辑。
- `src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:1243-1251`：`createNewCard()` 避免重复空卡。
- `src/MaaWpfGui/Views/UI/TaskQueueView.xaml:787-879`：卡片日志 XAML 布局。
- `src/MaaWpfGui/ViewModels/Items/LogItemViewModel.cs:39-127`：日志 item 字段。
- `src/MaaWpfGui/ViewModels/Items/LogCardItemViewModel.cs:42-50`：日志卡片字段。
- `src/MaaWpfGui/ViewModels/Items/LogCardItemViewModel.cs:79-94`：StartTime/EndTime 从第一条/最后一条 item 派生。
- `src/MaaWpfGui/Constants/UILogColor.cs:21-150`：原版日志颜色 key。
- `src/MaaWpfGui/Main/AsstProxy.cs:843-927`：最快截图耗时日志。
- `src/MaaWpfGui/Main/AsstProxy.cs:1025-1230`：TaskChain 日志、完成日志、理智回满时间。
- `src/MaaWpfGui/Main/AsstProxy.cs:1512-1560`：理智作战开始日志。
- `src/MaaWpfGui/Main/AsstProxy.cs:1781-1909`：StageDrops、EnterFacility、公招 tags 日志。
- `src/MaaWpfGui/Main/AsstProxy.cs:1936-1994`：公招星级结果、选择 tags、确认招募日志。
- `src/MaaWpfGui/Res/Localizations/zh-cn.xaml:1122-1150`：截图耗时、开始/完成任务、全部完成、理智报告等中文文案。

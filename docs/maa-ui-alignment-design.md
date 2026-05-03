# Web UI 与原版 MAA UI/行为/日志对齐设计

## 文档状态

本文是实施前的对齐设计稿。当前阶段只做源码对照和设计确认，不修改运行代码，不运行真实 MAA/MaaCore/ADB，不启动或停止任何服务。

对照范围：

- 当前 Web 项目：`E:\Project\Python\maa-web-control`
- 原版 MAA 源码：`E:\Project\C\MaaAssistantArknights`
- 用户真实 MAA 路径：`D:\APPS\AppGroup_3_Game\MAA`，仅作为实际部署路径背景，不在本文执行。

## 总体结论

当前 Web 已有四个主页面骨架：

- 一键长草：左侧任务队列，中间任务配置，右侧事件日志。
- 自动战斗：主线/故事集/SideStory、保全派驻、悖论模拟、其他活动四个 tab。
- 小工具：公招识别、干员识别、仓库识别、牛牛抽卡、牛牛监控、小游戏六个 tab。
- 设置：切换配置、定时执行、性能设置、运行设置、连接设置、启动设置、远程控制、界面设置、背景设置、外部通知、热键设置、成就设置、更新设置、问题反馈、关于我们十五个 section。

主要差距集中在三点：

1. 执行状态没有完全以 MaaCore callback 为准。
   当前 runner 在 `adapter.start()` 返回后会发布 completed，但 MaaCore 的 `TaskChainError` / `TaskChainStopped` 也会导致 `running()` 结束。后续必须区分 completed、failed、stopped。

2. 连接前 MaaCore 实例选项缺失。
   原版在 `AsstConnect` 前调用 `AsstSetInstanceOption(InstanceOptionKey.ClientType, SettingsViewModel.GameSettings.ClientType)`。当前 Web official adapter 创建 Asst 后直接 connect，导致 StartUp 拼出的启动命令缺少包名，例如 `am start -n /com.u8.sdk.U8UnityContext`。正确命令应包含 `com.hypergryph.arknights/com.u8.sdk.U8UnityContext`。

3. 自动战斗和小工具仍主要是前端状态模拟。
   这些页面已有 UI，但大多数按钮只修改本地状态，没有把 UI 配置转成官方 task params，也没有通过后端调用 MaaCore。

## 对齐原则

1. UI 结构、分组、显隐条件、按钮状态以原版 WPF 为主参考。
2. 执行语义以 MaaCore callback 为准，不以前端本地状态或 `running()` 结束作为唯一成功依据。
3. 能复用官方 wrapper、MaaCore、resource、task schema 的地方必须复用，不重写 OCR、ADB 点击、截图、任务识别逻辑。
4. Web 无法完全复刻 Windows/WPF 能力时，保留同等语义并给出替代方案，例如本地文件选择、附加窗口、系统托盘、热键、截图测试。
5. 所有“看起来可用”的按钮必须要么接真实后端，要么明确禁用并标明原因，避免前端假运行。
6. 日志分两层：原版风格可读日志 + 可展开原始 callback/detail。

## 全局执行、状态与日志

### 原版行为

原版一键长草由 `TaskQueueViewModel.LinkStartWithTasks` 驱动：

- 检查 idle。
- 清空日志。
- 输出 Build Time / Resource Time。
- 运行启动脚本。
- 连接模拟器。
- 遍历启用任务。
- 对每个任务调用对应 SettingsUserControlModel 序列化。
- append MaaCore task。
- `AsstStart()`。
- 停止时进入 Stopping，调用 `AsstStop()`，等待 running=false，输出 Stopped。

MaaCore callback 明确区分：

- `TaskChainStart`
- `TaskChainCompleted`
- `TaskChainError`
- `TaskChainStopped`
- `AllTasksCompleted`
- `SubTaskStart`
- `SubTaskCompleted`
- `SubTaskError`
- `SubTaskExtraInfo`

### 当前 Web 差距

当前 runner 大体流程是：

- `connect(profile)`
- `profile_to_append_calls(profile)`
- `append_task(call)`
- `start()`
- 等待 `asst.running()` 为 false
- 发布 `runner.completed`

这会把 MaaCore task chain error/stopped 误显示成 completed。

### 对齐目标

Runner 状态建议为：

- `Idle`
- `Connecting`
- `AppendingTasks`
- `Running`
- `Stopping`
- `Stopped`
- `Completed`
- `Failed`

事件建议拆分为：

- `runner.connecting`
- `runner.appending`
- `task.appended`
- `runner.running`
- `runner.stopping`
- `runner.stopped`
- `runner.completed`
- `runner.failed`
- `maa.callback`
- `maa.task_chain.start`
- `maa.task_chain.completed`
- `maa.task_chain.error`
- `maa.task_chain.stopped`
- `maa.sub_task.start`
- `maa.sub_task.completed`
- `maa.sub_task.error`
- `maa.sub_task.extra`

按钮状态：

| 状态 | 主按钮 | 说明 |
|---|---|---|
| Idle | `Link Start!` | 可启动 |
| Connecting/AppendingTasks/Running | `停止` | 点击应调用 `/api/stop` |
| Stopping | `停止中` 或禁用 | 不允许重复 stop |
| Stopped | `Link Start!` | 日志显示 Stopped |
| Failed | `Link Start!` | 日志显示 Failed 和错误原因 |
| Completed | `Link Start!` | 日志显示 Completed |

### 后端接入口

- `app/runner.py`：按 MaaCore callback 分类最终状态，不再只看 adapter.start 返回值。
- `app/maa_adapter.py`：保留并分类 callback，暴露最近 task chain 状态。
- `app/events.py`：保留原始 detail，补充语义事件。
- `app/models.py`：补充 stopped 状态或等价字段。

### 前端接入口

- `web/app.js`：按钮状态、日志渲染、WebSocket 事件处理。
- `web/styles.css`：日志 plain/card 双样式。
- `web/index.html`：四页容器和右侧日志区。

### 验证

使用 fake Asst，不运行真实 ADB：

- `TaskChainCompleted` -> `runner.completed`
- `TaskChainError` -> `runner.failed`
- `TaskChainStopped` -> `runner.stopped`
- `/api/stop` 后不允许出现 `runner.completed`
- 日志应按原版顺序展示 Connecting、Connected、Appending、Running、Stopping/Stopped/Completed/Failed

## 一键长草

### 页面整体

当前 Web 的一键长草任务类型：

- `StartUp`：开始唤醒
- `Recruit`：自动公招
- `Infrast`：基建换班
- `Fight`：理智作战
- `Custom`：剩余理智
- `Mall`：信用收支
- `Award`：领取奖励
- `Roguelike`：自动肉鸽
- `Reclamation`：生息演算
- `CloseDown`：关闭游戏

原版还涉及 `UserDataUpdate`、`Copilot`、`SSSCopilot`、`Depot`、`OperBox`、`VideoRecognition`、`SingleStep`、`Custom` 等任务或入口。Web 当前 mapper 白名单已有部分类型，但 UI 任务列表未完全开放。

任务队列行为应对齐：

- 勾选启用/禁用。
- 拖动排序。
- `+` 添加所有支持任务，菜单显示中文，内部保留 MaaCore task type。
- 右键任务显示操作菜单，包括删除、单次运行、复制或高级操作。
- 清空表示全部取消勾选，不删除任务。
- 无启用任务时输出 UnselectedTask/Stopped，不显示 completed。

### StartUp 开始唤醒

原版选项：

- 账号切换。
- 是否启动客户端。
- 客户端类型。
- 连接配置。
- ADB 路径。
- ADB 地址。
- 触控模式。
- 自动检测连接。
- 每次检测。
- PC 端/附加窗口相关条件字段。

当前 Web 已有：

- `account`
- `start_game_enabled`
- `client_type`
- `auto_detect`
- `detect_every_time`
- `connection`
- `touch_mode`

必须补齐的执行语义：

- 在 `connect()` 前调用 MaaCore instance option：`ClientType = 6`，value 为标准 client type，如 `Official`。
- StartUp task params 里的 `client_type` 仍保留，但不能替代 connect 前的 instance option。
- 连接配置、ADB 路径、地址、触控模式必须进入后端执行配置，而不是只存在前端或 profile 局部字段。

无法完全复刻：

- PC 附加窗口、桌面窗口检测、窗口输入方式属于桌面端能力，纯浏览器无法直接实现。

替代方案：

- 后端提供 capability 检测。
- 不支持时禁用相关字段。
- 如果以后需要 PC 附加窗口，单独做 native bridge 或桌面 helper。

验证：

- fake Asst 记录调用顺序：`set_instance_option(6, "Official")` 必须在 `connect()` 前。
- StartUp 失败时显示 failed，不显示 completed。

### Fight 理智作战

原版常规选项：

- 关卡。
- 药剂数量。
- 源石数量。
- 作战次数。
- 指定掉落材料和目标数量。
- 代理倍率/连续作战。
- 候选关卡。
- 自定义关卡名。

原版高级选项：

- 自定义剿灭。
- DrGrandet。
- 掉落上报。
- 临期理智药。
- 活动临期理智药。
- 隐藏代理倍率。
- 允许源石保存。
- 手动关卡。
- 关卡重置。
- 备选关卡。
- 隐藏不可用关卡。
- 周计划。
- 自动重连。

当前 Web 已有大量静态选项：

- `stage`
- `use_medicine` / `medicine`
- `use_stone` / `stone`
- `has_times_limited` / `times`
- `use_drops` / `drop`
- `series`
- `stage_plan`
- `custom_stage_code`
- `weekly_schedule`
- `auto_restart`

对齐目标：

- 药剂、源石、次数支持原版“未启用时不传或传 null”的语义。
- `drops` 支持材料名/数量，不只下拉名。
- 活动/关卡/掉落列表由官方 resource 动态读取，不长期维护静态大列表。
- 周计划、备选关卡、隐藏不可用关卡需要和资源可用状态联动。

无法完全复刻：

- 活动开放状态、关卡列表、掉落数据依赖 resource 和服务器时间，纯前端静态列表无法保证准确。

替代方案：

- 后端提供 `/api/options` 或 capability 读取 resource。
- resource 不可用时降级为自由输入。

验证：

- mapper 单测覆盖 `stage`、`medicine`、`stone`、`times`、`series`、`drops`、`report_to_penguin`、`client_type`。

### Recruit 自动公招

原版选项：

- 使用加急许可。
- 最大招聘次数。
- 自动刷新。
- 无招聘许可仍然刷新/强制刷新。
- 不自动确认 1 星/跳过小车。
- 自动确认 3 星。
- 自动确认 4 星。
- 自动确认 5 星。
- 6 星策略。
- 3/4/5 星招募时间。
- 额外 tags 策略。
- 优先 tags。
- Penguin / 一图流上报。

当前 Web 有：

- `auto_expedited`
- `max_times`
- `extra_tags`
- `refresh`
- `skip_robot`
- `reserve_level_1`
- `confirm_3`
- `time3`
- `confirm_4`
- `time4`
- `confirm_5`
- `time5`
- `confirm_6`

对齐目标：

- 明确映射 `select`、`confirm`、`times`、`refresh`、`force_refresh`、`skip_robot`、`set_time`、`expedite`、`expedite_times`、`extra_tags_mode`、`first_tags`、`recruitment_time`、`server`、上报字段。
- 公招识别小工具和一键长草自动公招是两个入口，但底层均复用官方 Recruit/RecruitCalc 能力。

验证：

- fake profile 验证各种星级组合。
- 单跑 Recruit 与 StartUp+Recruit 日志均能进入真实公招流程。

### Infrast 基建换班

原版选项：

- 模式：普通、自定义、轮换。
- 设施选择：制造、贸易、控制中枢、发电、会客室、办公室、宿舍、加工、训练。
- 无人机用途。
- 心情阈值。
- 宿舍空位补信赖。
- 宿舍未进驻过滤。
- 源石碎片补货。
- 会客室留言板。
- 线索交流。
- 赠送线索。
- 训练室继续专精。
- 自定义基建文件。
- 自定义 plan index。

当前 Web 有：

- `mode`
- `drone`
- `mood`
- `facilities`
- `dorm_trust`
- `skip_entered`
- `stone_fragment`
- `collect_credit`
- `clue_exchange`
- `send_clue`
- `continue_training`

对齐目标：

- 模式切换驱动条件显示。
- `mode=Custom` 时显示/要求基建文件和 plan index。
- `mode=Rotation` 时显示轮换计划相关配置。
- 设施字段必须按官方英文值传给 MaaCore：`Mfg`、`Trade`、`Control`、`Power`、`Reception`、`Office`、`Dorm`、`Processing`、`Training`。

无法完全复刻：

- 浏览器不能直接引用用户本机任意基建排班文件。

替代方案：

- 上传排班 JSON 到后端缓存。
- 或从服务端可访问目录选择文件。

验证：

- Normal/Custom/Rotation 三套 mapper 单测。

### Mall 信用收支

原版选项：

- 访问好友。
- 访问好友一日一次。
- 信用战斗。
- 信用战斗编队号。
- 信用战斗一日一次。
- 购物。
- 基建提示依赖。
- 优先购买列表。
- 黑名单。
- 信用溢出时无视黑名单。
- 只买折扣。
- 保留最大信用。

当前 Web 有基础 Mall 表单，但需要补全一日一次、编队号、优先/黑名单列表编辑、折扣/保留信用等条件逻辑。

对齐目标：

- `buy_first` / `blacklist` 支持列表编辑。
- `formation_index` 支持数字输入。
- `force_shopping_if_credit_full`、`only_buy_discount`、`reserve_max_credit` 明确默认值和显隐条件。

验证：

- mapper 单测覆盖信用战斗、访问好友、购物、黑名单、优先购买、折扣、保留信用。

### Award 领取奖励

原版选项：

- 日/周任务奖励。
- 邮件。
- 免费单抽/公招相关。
- 合成玉/幸运墙。
- 限时开采。
- 特殊入口。

当前 Web：

- Award 无高级设置，符合“置灰/无高级设置”的 UI 目标。
- mapper 已有基础字段，但 UI 命名和活动项条件显示仍需对齐。

对齐目标：

- `award`、`mail`、`recruit`、`orundum`、`mining`、`specialaccess` 全字段可控。
- 活动不可用时禁用或隐藏。

验证：

- mapper 单测覆盖 Award 全字段。

### Roguelike 自动肉鸽

原版选项组：

- 主题。
- 模式。
- 难度。
- 开局次数。
- 投资策略。
- 投资次数。
- 满投资停止。
- 分队。
- 职业。
- 开局干员。
- 技能。
- 开局干员使用方式。
- 助战。
- stop when investment full。
- stop at final boss。
- 月度小队。
- 深入调查。
- 藏品。
- foldartal。
- seed。
- theme-specific 条件字段。

当前 Web：

- 已有主题、策略、分队、职业、干员等静态数据。
- 高级设置和 MaaCore 参数仍明显不全。

对齐目标：

- 先补齐字段结构和条件显示，再分阶段接 resource 动态选项。
- mapper 只传 MaaCore 支持字段，未知字段不得混入官方 params。

无法完全复刻：

- 肉鸽主题、藏品、干员可用性和高级策略高度依赖 resource。

替代方案：

- 第一阶段保留 UI 字段和 disabled 状态。
- 第二阶段接 resource/capability 动态列表。

验证：

- mapper 单测覆盖 `mode`、`theme`、`difficulty`、`starts_count`、investment、squad、roles、core_char、support、seed。

### Reclamation 生息演算

原版选项：

- 主题。
- 模式。
- 增量模式。
- 制造批次数量。
- 制造工具列表。
- 清空商店。
- 高级条件字段。

当前 Web：

- 有 `theme`、`strategy`、`tools_to_craft`、`num_craft_batches` 等基础字段。
- 条件显示和资源驱动列表仍需补齐。

对齐目标：

- 输出官方字段：`theme`、`mode`、`increment_mode`、`num_craft_batches`、`tools_to_craft`、`clear_store`。
- 不同模式下禁用不适用字段。

验证：

- mapper 单测覆盖所有字段。

### UserDataUpdate 用户数据更新

原版：

- 用于干员/仓库数据更新和触发间隔配置。

当前 Web：

- 一键长草任务列表未完整覆盖。
- 小工具有干员识别和仓库识别入口，但没有和 UserDataUpdate 形成统一数据流。

对齐目标：

- 一键长草中补充 UserDataUpdate。
- 与干员识别、仓库识别结果展示打通。

### CloseDown / Custom / SingleStep

原版：

- `CloseDown` 关闭客户端。
- `Custom` 用 task names 执行 MaaCore resource/tasks 中的自定义流程。
- 部分 debug/single-step 能力面向高级用户。

当前 Web：

- `CloseDown` 在任务列表中。
- `Custom` 当前显示为“剩余理智”，mapper 曾将 Custom 映射到 Fight，这不适合承载牛牛抽卡/小游戏等官方 Custom task_names。

对齐目标：

- 区分“剩余理智”与官方 `Custom`。
- 官方 Custom 应有明确 `task_names` 或 `custom_tasks` 参数，不得误映射为 Fight。
- 高级/调试任务默认隐藏。

## 自动战斗

### 原版页面内容

原版 Copilot 页包含：

- 主线/故事集/SideStory。
- 保全派驻。
- 悖论模拟。
- 其他活动。
- 本地 JSON 文件。
- 作业站神秘代码。
- 文件树。
- 剪贴板作业/作业集。
- 作业信息展示：标题、说明、干员、技能、练度、模组、总人数。
- 自动编队。
- 编队栏位。
- 忽略练度要求。
- 助战策略。
- 指定/随机/补漏助战相关能力。
- 补信赖。
- 自定义追加干员。
- 多作业模式。
- 作业列表。
- 突袭勾选。
- 理智药。
- 循环次数。
- Start / Stop。
- 专页日志。

### 当前 Web 内容

当前 Web 有：

- 四个 tab。
- 使用提示。
- 文件名/文件弹窗。
- 自动编队。
- 编队栏位。
- 忽略练度要求。
- 助战选项。
- 补信赖。
- 追加干员。
- 多作业模式。
- 理智药。
- 循环次数。
- 任务列表。
- 开始/停止。

当前差距：

- start/stop 只切本地状态，没有调用后端。
- 文件选择只保存浏览器文件名，没有上传或缓存内容。
- 未解析作业 JSON，不能展示标题、干员、技能、练度、SSS buff/tool men/drops。
- 未做作业类型校验。
- 未构造 `Copilot` / `SSSCopilot` / `ParadoxCopilot` 官方 params。
- 缺少 `support_unit_name` 或明确的“指定助战”策略处理。
- SSS 自动编队在 Core 中不可用，不能假装可用。

### 官方 task params 对齐

`Copilot`：

- `filename`
- `copilot_list`
- `loop_times`
- `use_sanity_potion`
- `formation`
- `formation_index`
- `user_additional`
- `add_trust`
- `ignore_requirements`
- `support_unit_usage`
- `support_unit_name`

`SSSCopilot`：

- `filename`
- `loop_times`

`ParadoxCopilot`：

- `filename`
- `list`

重要限制：

- `filename` 与 `copilot_list` / `list` 二选一。
- 多作业主线使用 `Copilot.copilot_list`。
- 悖论批量使用 `ParadoxCopilot.list`，不要使用已废弃的 `copilot_list.is_paradox`。
- SSS Core 当前禁用自动编队，Web 应禁用该开关或说明不可用。

### 后端/API 目标

建议新增：

- `POST /api/copilot/parse`
- `POST /api/copilot/validate`
- `POST /api/copilot/cache`
- `POST /api/copilot/start`
- `POST /api/copilot/stop`

输入来源：

- 上传 JSON。
- 粘贴 JSON。
- 作业站 ID。
- 服务端 resource/copilot 文件树。

输出：

- 作业类型。
- 文档标题/说明。
- 关卡名。
- 干员/技能/练度摘要。
- 可执行 params 预览。
- 错误/警告。

### 无法完全复刻

- 浏览器不能直接把本地绝对路径交给 MaaCore 稳定读取。
- Windows 文件对话框、拖拽本地路径、覆盖层行为不能完全等同 WPF。

替代方案：

- 使用上传/粘贴/服务端文件树。
- 后端缓存为临时 JSON 文件，再把服务端路径传给 MaaCore。

## 小工具

### 总体

当前 Web 有六个 tab：

- 公招识别
- 干员识别
- 仓库识别
- 牛牛抽卡
- 牛牛监控
- 小游戏

当前差距：

- 多数按钮只修改 `TOOLS_STATE`。
- 没有调用 `/api/run`、`/api/stop` 或 MaaCore。
- 后端没有工具专用 API。
- Peep/牛牛监控需要截图帧流，现有 `/api/adb/test-screenshot` 仍是 stub。

### 公招识别

原版路径：

- 用户手动打开公招 tags 页面。
- 选择 3/4/5/6 星、是否显示潜能、自动设置时间。
- `RecruitStartCalc()`
- `AsstConnect()`
- append `RecruitCalc`，本质使用 Recruit params。
- `AsstStart()`
- 回调 `RecruitTagsDetected`、`RecruitResult`，更新 UI。

当前 Web：

- 有星级、时间、潜能选项。
- 开始按钮只显示“正在识别”。

目标：

- `POST /api/tools/recruit-calc`
- 复用官方 Recruit/RecruitCalc。
- 展示 tags、可选结果、推荐组合、潜能提示。

### 干员识别

原版路径：

- `StartOperBox()`
- `AsstConnect()`
- `AsstStartOperBox()`
- append `OperBox`
- Core 执行 `OperBoxBegin` 和 `OperBoxRecognitionTask`
- 回调 `OperBoxInfo`

当前 Web：

- 有空结果面板和复制按钮。
- 未接后端。

目标：

- `POST /api/tools/oper-box`
- 结果缓存并支持复制。

### 仓库识别

原版路径：

- `StartDepot()`
- `AsstConnect()`
- `AsstStartDepot()`
- append `Depot`
- 回调 `DepotInfo`
- 支持 ArkPlanner / Lolicon 格式复制。

当前 Web：

- 有仓库 tab 和导出按钮。
- 无真实数据。

目标：

- `POST /api/tools/depot`
- 识别结果结构化保存。
- 前端导出 ArkPlanner / Lolicon。

### 牛牛抽卡

原版路径：

- `GachaOnce` / `GachaTenTimes`
- `AsstStartGacha(once)`
- append `Custom` task：`GachaOnce` 或 `GachaTenTimes`
- `AsstStart()`
- 启动后联动 Peep。

当前 Web：

- 按钮只随机换文案。
- 当前 `Custom` mapper 不能承载官方 Custom task names。

目标：

- 修正 Custom 映射能力。
- `POST /api/tools/gacha`
- 可选联动 Peep。

### 牛牛监控

原版：

- 空闲时先 `AsstConnect()`。
- timer 周期调用 `AsstGetImageBgrDataAsync(forceScreencap: true)`。
- UI 显示截图和 FPS。
- 停止时 Stop/SetStopped。

当前 Web：

- 假屏幕和 FPS 文案。
- 无截图 API。

目标：

- `POST /api/tools/peep/start`
- `POST /api/tools/peep/stop`
- WebSocket 或 MJPEG/PNG polling 输出帧。
- FPS 由后端测量。

无法完全复刻：

- 浏览器显示可复刻，截图来源必须由后端或 MaaCore wrapper 提供。

### 小游戏

原版：

- 列表来自 `StageManager.MiniGameEntries`，会从活动数据动态插入。
- `StartMiniGameAsync()`
- `AsstConnect()`
- `AsstMiniGame(taskName)`
- append `Custom` task names。
- 非 idle 时点击会 stop。

当前 Web：

- 静态硬编码小游戏列表。
- start 只切 `miniRunning`。

目标：

- 列表改为后端 resource 动态读取。
- `POST /api/tools/minigame`
- 使用官方 `Custom.task_names`。

### 视频识别

原版：

- Core 有 `VideoRecognition`，但 WPF 小工具页该区域折叠/隐藏。

当前 Web：

- 无入口。

对齐目标：

- 先保持隐藏。
- 若后续启用，需要文件上传/服务端路径选择和 `VideoRecognition` append API。

## 设置

### 当前 Web section

Web 当前设置 section：

1. 切换配置
2. 定时执行
3. 性能设置
4. 运行设置
5. 连接设置
6. 启动设置
7. 远程控制
8. 界面设置
9. 背景设置
10. 外部通知
11. 热键设置
12. 成就设置
13. 更新设置
14. 问题反馈
15. 关于我们

### 原版行为

原版设置页是多个 Expander 分区，支持：

- 左侧导航点击滚动。
- 右侧滚动时左侧 selected index 联动。
- 展开/折叠状态持久化。
- 不同连接方式显示不同字段。
- ClientType 变化影响资源、关卡、启动包名、上报服务器。

### 运行设置

应覆盖：

- 客户端类型。
- 防止休眠。
- 防止息屏。
- Penguin / 一图流上报。
- 部署暂停。
- 游戏服务器与资源语言。

关键目标：

- `clientType` 不只是 UI 字段，必须进入后端 settings/profile，并在 connect 前写入 MaaCore instance option。

### 连接设置

应覆盖：

- 自动检测连接。
- 每次检测。
- 连接配置。
- ADB 路径。
- ADB 地址。
- 触控模式。
- ADB Lite。
- Kill ADB on exit。
- 重试连接。
- 断线重启。
- MuMu extras。
- 雷电 extras。
- PC attach window。
- 截图测试。

无法完全复刻：

- 浏览器不能弹出原版 Windows 文件选择并把绝对路径天然交给后端。
- PC attach window 需要桌面能力。

替代：

- 手填路径。
- 后端检测 ADB。
- 后端能力检测后显示 supported/unsupported/unavailable/requires native bridge。

### 启动设置

应覆盖：

- 启动前脚本。
- 运行后脚本。
- 自动启动模拟器。
- 强制启动。
- 启动前显示模拟器。
- 启动方式与模拟器路径。

当前目标：

- 第一阶段只保留 UI 和配置保存。
- 涉及启动外部程序的行为要明确需要用户确认后再实现。

### 远程控制

原版有远程控制相关设置。Web 自身就是远程 UI，但仍需区分：

- MAA 官方远程控制协议。
- 当前 Web 后端 REST/WebSocket。

目标：

- 不把官方 remote-control 协议作为当前主架构。
- 可作为未来兼容入口。

### 界面、背景、通知、热键、成就、更新、问题反馈、关于

对齐目标：

- UI 字体、间距、卡片风格与一键长草一致。
- 设置页所有 section 的字体、标题、控件大小统一。
- 热键、托盘、系统通知等桌面能力在 Web 中标记为不可用或需 native bridge。
- 更新设置若涉及下载安装，必须单独确认，不自动执行。
- 问题反馈只提供日志路径、复制诊断信息、打开链接等安全动作。

### 设置 API 目标

建议新增：

- `GET /api/settings`
- `PATCH /api/settings`
- `POST /api/settings/detect-adb`
- `POST /api/settings/test-screenshot`

Runner 读取：

- `client_type`
- `connect_config`
- `adb_path`
- `address`
- `touch_mode`
- `adb_lite`
- `kill_adb`
- `retry`
- `restart`

## API 总体设计

### Profile Run

保留：

- `POST /api/run`
- `POST /api/stop`
- `GET /api/status`
- `GET /api/logs/recent`
- `GET /api/events`

增强：

- run 请求携带 profile + settings 快照。
- stop 进入 Stopping 并等待 MaaCore stopped callback。
- 状态由 callback 分类驱动。

### 自动战斗

新增：

- `POST /api/copilot/parse`
- `POST /api/copilot/validate`
- `POST /api/copilot/cache`
- `POST /api/copilot/start`
- `POST /api/copilot/stop`

### 小工具

新增：

- `POST /api/tools/recruit-calc`
- `POST /api/tools/oper-box`
- `POST /api/tools/depot`
- `POST /api/tools/gacha`
- `POST /api/tools/peep/start`
- `POST /api/tools/peep/stop`
- `POST /api/tools/minigame`

### 资源与动态选项

新增或扩展：

- `GET /api/options`
- `GET /api/capabilities`
- `GET /api/resources/stages`
- `GET /api/resources/drops`
- `GET /api/resources/copilot-files`
- `GET /api/resources/minigames`
- `GET /api/resources/infrast-plans`

## 无法完全复刻清单

| 原版能力 | 原因 | Web 替代方案 |
|---|---|---|
 Windows 文件对话框和绝对路径 | 浏览器沙盒限制 | 上传、粘贴、服务端目录选择 |
 PC attach window | 需要桌面窗口句柄和管理员权限 | native bridge 或禁用 |
 系统托盘 | 浏览器不支持 | Web 通知或后端 helper |
 全局热键 | 浏览器只能页面焦点内处理 | native bridge |
 WPF WaterfallPanel/Expander 动画 | 技术栈不同 | CSS sticky nav + section 展开 |
 直接启动模拟器程序 | 高影响系统操作 | 独立确认后由后端实现 |
 SSS 自动编队 | MaaCore 当前禁用 | UI 禁用并说明 |
 Peep 实时截图 | 需要 MaaCore image API/帧流 | 后端 WebSocket/MJPEG |

## 高优先级对齐项

1. connect 前设置 `ClientType` instance option。
2. runner 按 `TaskChainCompleted/Error/Stopped` 分类最终状态。
3. Stop 流程和日志对齐，不再把 stopped 显示为 completed。
4. 日志语义化：原版风格文案 + 原始 callback detail。
5. 设置页运行/连接字段进入后端 settings/profile。
6. StartUp/Fight/Recruit/Infrast/Mall/Award 参数补齐并测试。
7. Custom 与“剩余理智”解耦，恢复官方 Custom task_names 能力。
8. 自动战斗接后端，完成作业解析、校验、缓存、append/start/stop。
9. 小工具从本地模拟改为真实工具 API，无法实现的先禁用。
10. 设置页条件显示、滚动选中、展开状态与原版对齐。
11. 资源驱动选项：关卡、材料、作业、小游戏、基建计划。
12. fake Asst 回归测试覆盖关键调用顺序和状态。

## 验证矩阵

### 后端单元测试

- `maa_adapter`：
  - `set_instance_option(6, client_type)` 在 `connect()` 前。
  - callback 分类正确。
- `runner`：
  - completed/error/stopped 三种状态正确。
  - stop 后不发 completed。
  - append 失败有错误日志。
- `mapper`：
  - StartUp client_type/account。
  - Fight stage/medicine/stone/times/drops/series。
  - Recruit select/confirm/refresh/force_refresh/expedite/report。
  - Infrast normal/custom/rotation。
  - Mall buy_first/blacklist/formation/reserve。
  - Award 全字段。
  - Roguelike/Reclamation 高级字段。
  - Custom task_names。
- tools：
  - RecruitCalc append/start。
  - Depot/OperBox append/start。
  - Gacha Custom task_names。
  - MiniGame Custom task_names。
  - Peep start/stop 状态。

### 前端测试

- 刷新后保留当前页面和选中项。
- 一键长草任务可添加、删除、拖动、清空勾选。
- Link Start/停止/停止中/失败/完成状态正确。
- 日志出现语义化条目且可看 detail。
- 自动战斗 tab 显隐条件正确。
- 自动战斗作业类型不匹配时禁止启动。
- 小工具不可用时按钮 disabled。
- 设置页滚动时左侧选中项联动。
- 设置页条件字段随选项变化显示/隐藏。

## 关键证据

### 当前 Web

- `web/index.html:28-90`：四个页面 section 和一键长草三栏布局。
- `web/app.js:336-365`：主按钮 busy 时显示停止，stopButton disabled。
- `web/app.js:378-420`：右侧日志渲染。
- `web/app.js:461-464`：busy 时点击主按钮走 stop，否则 run。
- `app/maa_adapter.py:72-91`：创建 Asst 后直接 connect，缺少 ClientType instance option。
- `app/maa_adapter.py:116-123`：callback 仅发布 `maa.callback`。
- `app/maa_adapter.py:137-142`：start 后只轮询 running。
- `app/runner.py:65-72`：connect -> append -> start。
- `app/runner.py:92-99`：存在无条件 completed 风险。
- `app/models.py:9-17`：RunnerStateName 缺 stopped。
- `web/taskForms.js:1-24`：当前一键长草任务类型。
- `web/taskForms.js:243-255`：StartUp 表单。
- `web/taskForms.js:258-283`：Recruit 表单。
- `web/taskForms.js:286-311`：Infrast 表单。
- `web/taskForms.js:314-336`：Mall 表单。
- `web/taskForms.js:339-349`：Award 表单。
- `web/taskForms.js:352-378`：Roguelike 表单。
- `web/taskForms.js:381-413`：Reclamation 表单。
- `app/mapper.py:13-28`：mapper 白名单包含 Copilot/SSSCopilot/Depot/OperBox 等。
- `app/mapper.py:118-146`：task_to_append_call。
- `web/copilotView.js:1-6`：自动战斗四个 tab。
- `web/copilotView.js:395-415`：自动战斗 start/stop 主要为本地状态。
- `web/toolsView.js:1`：小工具六个 tab。
- `web/toolsView.js:365-383`：小工具动作主要为本地状态。
- `web/settingsView.js:1-17`：设置页十五个 section。
- `web/settingsView.js:723-770`：滚动导航联动。

### 原版 MAA

- `src/MaaWpfGui/Main/AsstProxy.cs:2649-2651`：connect 前设置 ClientType。
- `src/MaaCore/Common/AsstTypes.h:41-49`：`InstanceOptionKey.ClientType = 6`。
- `src/MaaCore/Assistant.cpp:171-173`：ClientType option 传给 controller。
- `src/MaaCore/Assistant.cpp:529-531`：MaaCore 发布 Stopped/Completed/Error。
- `src/MaaCore/Assistant.cpp:538-540`：队列空时发布 AllTasksCompleted。
- `src/MaaWpfGui/Main/AsstProxy.cs:711-739`：callback 分发 TaskChain 状态。
- `src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:1733-1868`：LinkStartWithTasks 主流程。
- `src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:1934-1953`：Stop 流程。
- `src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:1987-1999`：SetStopped 日志。
- `src/MaaWpfGui/Views/UI/TaskQueueView.xaml:413-459`：LinkStart/Stop/WaitAndStop 按钮。
- `src/MaaWpfGui/Views/UI/TaskQueueView.xaml:602-806`：右侧日志样式。
- `src/MaaWpfGui/ViewModels/UserControl/TaskQueue/StartUpSettingsUserControlModel.cs:88-102`：StartUp 序列化。
- `src/MaaWpfGui/Models/AsstTasks/AsstStartUpTask.cs:29-52`：StartUp 官方字段。
- `src/MaaWpfGui/Models/AsstTasks/AsstRecruitTask.cs:137-165`：Recruit 官方字段。
- `src/MaaWpfGui/Models/AsstTasks/AsstInfrastTask.cs:103-127`：Infrast 官方字段。
- `src/MaaWpfGui/Views/UI/CopilotView.xaml:105`：自动战斗 tabs。
- `src/MaaWpfGui/ViewModels/UI/CopilotViewModel.cs:1820-1940`：自动战斗启动校验。
- `src/MaaWpfGui/ViewModels/UI/CopilotViewModel.cs:2039-2123`：Copilot/SSS/Paradox append。
- `src/MaaWpfGui/Models/AsstTasks/AsstCopilotTask.cs:80-119`：Copilot 参数。
- `src/MaaWpfGui/Models/AsstTasks/AsstParadoxCopilotTask.cs:21-47`：Paradox 参数。
- `src/MaaCore/Task/Interface/CopilotTask.cpp:56-190`：Core Copilot 接收字段。
- `src/MaaCore/Task/Interface/SSSCopilotTask.cpp:38-86`：Core SSS 接收字段，自动编队禁用。
- `src/MaaCore/Task/Interface/ParadoxCopilotTask.cpp:29-67`：Core Paradox 接收字段。
- `src/MaaWpfGui/ViewModels/UI/ToolboxViewModel.cs:372-421`：公招识别。
- `src/MaaWpfGui/ViewModels/UI/ToolboxViewModel.cs:957-988`：仓库识别。
- `src/MaaWpfGui/ViewModels/UI/ToolboxViewModel.cs:1383-1415`：干员识别。
- `src/MaaWpfGui/ViewModels/UI/ToolboxViewModel.cs:1509-1528`：牛牛抽卡。
- `src/MaaWpfGui/ViewModels/UI/ToolboxViewModel.cs:1779-1838`：牛牛监控。
- `src/MaaWpfGui/ViewModels/UI/ToolboxViewModel.cs:1968-1999`：小游戏。
- `src/MaaWpfGui/Views/UI/SettingsView.xaml:65-367`：设置页 Expander。
- `src/MaaWpfGui/ViewModels/UI/SettingsViewModel.cs:675-827`：滚动选中联动。
- `src/MaaWpfGui/ViewModels/UI/SettingsViewModel.cs:833-980`：Expander 状态持久化。
- `src/MaaWpfGui/ViewModels/UserControl/Settings/ConnectSettingsUserControl.xaml:36-363`：连接设置、PC attach、MuMu/雷电 extras、截图测试、触控、ADB Lite、Kill ADB。

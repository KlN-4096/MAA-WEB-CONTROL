# 原版 MAA 功能与当前 Web 项目缺口对比

生成日期：2026-05-07（最近更新：2026-05-07，第二次）

对照范围：

- 当前项目：`E:\Project\Python\maa-web-control`
- 原版 MAA：`E:\Project\C\MaaAssistantArknights`
- 原版依据：`docs/zh-cn/protocol/integration.md`、WPF `Configuration/Single/MaaTask`、`Models/AsstTasks`、`Constants/ConfigurationKeys.cs`、设置页 ViewModel。
- 当前依据：`app/capabilities.py`、`app/mapper.py`、`app/models.py`、`app/api.py`、`web/taskForms.js`、`web/copilotView.js`、`web/toolsView.js`、`web/settingsView.js`。

状态口径：

| 状态 | 含义 |
|---|---|
| 已覆盖 | 当前 Web 有专用 UI/API，并能映射到 MaaCore 参数或等价行为。 |
| 部分覆盖 | 有 UI、mapper 或 API 的一部分，但缺字段、缺执行语义、缺结果解析或只支持别名。 |
| 仅后端 | mapper/API 能接受或发起，但没有专用 UI。 |
| 仅 UI | 页面展示或本地保存了选项，但没有接入后端或 MaaCore。 |
| 未覆盖 | 当前项目没有等价 UI/API/mapper/执行能力。 |
| Web 不适用 | 原版 WPF/系统级能力，浏览器本身无法直接复刻；若要支持需要 native helper 或后端服务。 |

## 总览

| 原版能力 | 当前项目状态 | 主要缺口 |
|---|---|---|
| 主任务链 `StartUp/Fight/Recruit/Infrast/Mall/Award/Roguelike/Reclamation/Custom/CloseDown/UserDataUpdate` | 部分覆盖 | 主链任务基本存在，但不少字段仅 mapper 支持或 UI 没有控件；`UserDataUpdate` 缺触发周期配置。 |
| `Copilot` 自动战斗 | 部分覆盖 | Web 有自动战斗页和 `/api/copilot/run`，但只传 `filename/formation/loop_times`，缺多作业、助战、自动编队细项、理智药等。 |
| `SSSCopilot` 保全作业 | 仅后端 | `mapper.py` 白名单可透传该任务类型；但 Web 保全 tab 仍共用 `/api/copilot/run`，实际按 `Copilot` append。 |
| `ParadoxCopilot` 悖论模拟 | 未覆盖 | 有 UI tab，但后端没有 append `ParadoxCopilot`，也没有 `filename/list` 参数模型。 |
| `SingleStep` | 未覆盖 | 无 UI/API/mapper 白名单。 |
| `VideoRecognition` | 未覆盖 | 无 UI/API/mapper；原版核心协议仍保留该任务。 |
| `Depot/OperBox/RecruitCalc` 工具 | 部分覆盖 | Depot/OperBox 结果解析和前端展示已实现；RecruitCalc 结果解析、持久化仍不完整。 |
| `Gacha/MiniGame/Peep` 工具 | 部分覆盖 | Gacha/MiniGame 通过 `Custom` 发起；MiniGame 列表硬编码，缺原版动态活动列表；Peep 有截图流但不是完整原版工具数据流。 |
| 远程控制协议 | 仅 UI | 设置页禁用展示，没有轮询获取任务、汇报任务、身份配置执行逻辑。 |
| 外部通知 | 仅 UI | 只显示未实现提示，无 SMTP/ServerChan/Discord/DingTalk/Telegram/Bark/Qmsg/Gotify/Webhook 实现。 |
| 更新/性能/背景/热键/成就/托盘 | 仅 UI 或未覆盖 | 多数为桌面端能力；当前 Web 只显示版本或占位，未实现实际功能。 |
| 连接/ADB 实例选项 | 部分覆盖 | 支持地址、ADB 路径、连接配置、LD extras、ClientType；缺 TouchMode/AdbLite/KillAdbOnExit/DeploymentWithPause 等 MaaCore instance option。 |

## 核心任务逐项对比

证据：

- 原版任务类型：`E:\Project\C\MaaAssistantArknights\src\MaaWpfGui\Services\MaaService.cs:104`
- 当前 mapper 白名单：`app/mapper.py:15`
- 当前新增任务菜单：`web/app.js:7`、`web/taskForms.js:1`

### 通用任务字段

| 原版字段 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `enable` | 默认 `true`，所有 append task 通用 | 已覆盖 | 当前 `TaskDefinition.enabled` 控制是否 append，mapper 还会设置 `params.enable=true`。 |
| 任务排序/启用/名称 | WPF `BaseTask.Name/IsEnable/TaskType` | 已覆盖 | Web profile task 支持 `id/type/enabled/name/params/strategy`。 |
| 任务右键/单次运行/复制等队列操作 | 原版任务队列 UI 行为 | 部分覆盖 | 当前已有任务编辑/添加/选择，原版完整右键行为未逐项实现。 |

### `StartUp`

原版证据：`integration.md:44`、`AsstStartUpTask.cs:24`、`StartUpTask.cs:20`。当前证据：`web/taskForms.js:326`、`web/taskForms.js:596`、`app/mapper.py:215`。

| 原版字段/配置 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `client_type` | 必填；`Official/Bilibili/txwy/YoStarEN/YoStarJP/YoStarKR` | 已覆盖 | UI、profile、mapper 均支持。 |
| `start_game_enabled` | 默认 `false`；是否启动客户端 | 已覆盖 | 当前默认多处为 `true`，行为上可配置。 |
| `account_name` | 可选；切换账号 | 已覆盖 | Web UI 字段叫 `account`，mapper 转为 `account_name`。 |
| 连接配置 `ConnectConfig` | 原版 StartUp 页可配置连接 | 部分覆盖 | Web 保存 `connection/connect_config`，后端连接使用 profile connect config；但 StartUp task params 里的 `connection` 不是 MaaCore 协议字段。 |
| `TouchMode` 实例选项 | 原版通过 `AsstSetInstanceOption(2, value)` 设置 | 部分覆盖 | Web UI 有 `touch_mode`，mapper 只放进 task params；official adapter 当前未设置 MaaCore `TouchMode` instance option。 |
| 自动检测连接 | `AutoDetect/AlwaysAutoDetect` | 仅 UI/部分覆盖 | Web 保存 `auto_detect/detect_every_time`，但真实自动检测模拟器端口能力不完整。 |
| PC 附加窗口 | WPF 附加窗口截图/鼠标/键盘模式 | Web 不适用 | 当前无 native window helper。 |

### `CloseDown`

原版证据：`integration.md:84`、`AsstCloseDownTask.cs:32`。当前证据：`app/capabilities.py:140`、`app/mapper.py:461`。

| 原版字段 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `client_type` | 必填；空则不执行 | 部分覆盖 | capabilities/mapper 支持；任务表单无专用 UI，走通用 JSON 或默认参数。 |

### `Fight`

原版证据：`integration.md:110`、`FightTask.cs:35`、`AsstFightTask.cs:29`。当前证据：`web/taskForms.js:283`、`web/taskForms.js:561`、`app/mapper.py:229`。

| 原版字段/配置 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `stage` | 默认空；当前/上次关卡 | 已覆盖 | UI 支持下拉、候选关卡和手动值。 |
| `medicine` | 最大使用理智药数量，默认 `0` | 已覆盖 | Web 用 `use_medicine + medicine` 控制。 |
| `expiring_medicine` | 最大使用 48 小时内过期理智药数量 | 部分覆盖 | Web 支持 `use_expiring_medicine/medicine_expire_hours` 并映射到 `medicine_expire_days`，未直接支持原协议的 `expiring_medicine` 数量。 |
| `stone` | 最大碎石数量，默认 `0` | 已覆盖 | Web 用 `use_stone + stone` 控制。 |
| `times` | 作战次数，默认 `2147483647` | 已覆盖 | Web 用 `has_times_limited + times` 控制。 |
| `series` | 连战次数 `-1..6` | 已覆盖 | UI 和 mapper 均支持。 |
| `drops` | 指定掉落 `{item_id: count}` | 部分覆盖 | UI 只支持单材料；mapper 可接受 dict 或列表，但 UI 不支持多材料目标。 |
| `report_to_penguin` | 默认 `false` | 部分覆盖 | mapper 支持；UI 未提供作战页专用开关，默认 profile 可携带。 |
| `penguin_id` | 企鹅物流 ID | 部分覆盖 | mapper 支持；UI 未提供作战页专用输入。 |
| `report_to_yituliu` | 默认 `false` | 未覆盖 | mapper/UI 未处理。 |
| `yituliu_id` | 一图流 ID | 未覆盖 | mapper/UI 未处理。 |
| `server` | 默认 `CN` | 部分覆盖 | mapper 支持；UI 未提供作战页专用选择，依赖 profile/default。 |
| `client_type` | 崩溃重启时用于回连 | 部分覆盖 | mapper 支持；Fight UI 未提供专用字段，依赖 profile/default。 |
| `DrGrandet` | 节省碎石模式 | 已覆盖 | UI 字段 `dr_grandet`，mapper 转为 `DrGrandet`。 |
| 自定义剿灭 `AnnihilationStage` | WPF 配置项 | 部分覆盖 | UI 有 `custom_annihilation`，但 mapper 未把它转换成具体 `stage`。 |
| 过期关卡重置 `StageResetMode` | WPF 配置项 | 仅 UI | UI 保存 `stage_reset`，mapper 未执行原版重置逻辑。 |
| 每周计划 `WeeklySchedule` | WPF 每日开关 | 仅 UI | UI 只有 `weekly_schedule` 开关，没有周一至周日具体计划。 |
| `UseStoneAllowSave/HideSeries/HideUnavailableStage/CustomStageCode` | WPF UI 行为配置 | 部分覆盖 | Web 有部分 UI 状态，主要影响前端显示，不完全等价原版 WPF 行为。 |

### `Recruit`

原版证据：`integration.md:219`、`RecruitTask.cs:31`、`AsstRecruitTask.cs:141`。当前证据：`web/taskForms.js:341`、`web/taskForms.js:608`、`app/mapper.py:270`。

| 原版字段/配置 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `refresh` | 刷新 3 星 Tags，默认 `false` | 已覆盖 | UI 和 mapper 支持。 |
| `force_refresh` | 无招聘许可时继续刷新，WPF 序列化字段 | 已覆盖 | Web 用 `skip_robot`/默认值间接覆盖，mapper 输出 `force_refresh`。 |
| `select` | 会点击的 Tag 等级 | 部分覆盖 | mapper 支持直接 list；UI 没有逐等级 `select` 控件，而是由 confirm 推导。 |
| `confirm` | 会确认的 Tag 等级 | 已覆盖 | UI 提供 3/4/5/6 星确认。 |
| `first_tags` | 3 星首选 Tag | 部分覆盖 | UI 是文本 `extra_tags`，mapper 拆分为 `first_tags`；没有独立列表管理。 |
| `extra_tags_mode` | `0/1/2` 多选策略 | 已覆盖 | UI 下拉框三档选择（默认/优先合成玉/全选匹配），mapper 输出 `extra_tags_mode` 整型。 |
| `times` | 招募次数 | 已覆盖 | UI `max_times`，mapper 输出 `times`。 |
| `set_time` | 是否设置招募时限 | 部分覆盖 | mapper 固定支持；UI 没有开关。 |
| `expedite` | 是否使用加急许可 | 已覆盖 | UI `auto_expedited`。 |
| `expedite_times` | 加急次数 | 部分覆盖 | mapper 支持；UI 无独立加急次数输入。 |
| `skip_robot` | 小车词条处理 | 已覆盖 | UI `skip_robot`。 |
| `recruitment_time` | 3/4/5/6 星时间 | 部分覆盖 | UI 有 3/4/5 星；6 星时间禁用且未收集 `time6`。 |
| `report_to_penguin`/`penguin_id` | 企鹅物流上报 | 部分覆盖 | mapper 支持；UI 无公招任务内专用控件。 |
| `report_to_yituliu`/`yituliu_id` | 一图流上报 | 未覆盖 | mapper/UI 未处理。 |
| `server` | `CN/US/JP/KR` | 部分覆盖 | mapper 支持；UI 无任务内控件。 |
| `reserve_level_1` | WPF/当前 UI 保留 1 星词条 | 仅 UI | 当前收集该字段，但 mapper 未用它生成 MaaCore 参数。 |

### `Infrast`

原版证据：`integration.md:318`、`InfrastTask.cs:39`、`AsstInfrastTask.cs:103`。当前证据：`web/taskForms.js:369`、`web/taskForms.js:626`、`app/mapper.py:298`。

| 原版字段/配置 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `mode` | `0/10000/20000` | 已覆盖 | UI 和 mapper 支持常规、自定义、队列轮换。 |
| `facility` | 有序设施列表 | 已覆盖 | UI 多选，mapper 转英文设施名。 |
| `drones` | 无人机用途 | 已覆盖 | UI 中文，mapper 转 MaaCore 值。 |
| `threshold` | 心情阈值 `[0,1]` | 已覆盖 | UI 百分比，mapper 转小数。 |
| `replenish` | 源石碎片补货 | 已覆盖 | UI `stone_fragment`。 |
| `dorm_notstationed_enabled` | 宿舍未进驻筛选 | 已覆盖 | UI `skip_entered`。 |
| `dorm_trust_enabled` | 宿舍蹭信赖 | 已覆盖 | UI `dorm_trust`。 |
| `reception_message_board` | 会客室信息板信用 | 已覆盖 | UI `collect_credit`。 |
| `reception_clue_exchange` | 线索交流 | 已覆盖 | UI `clue_exchange`。 |
| `reception_send_clue` | 赠送线索 | 已覆盖 | UI `send_clue`。 |
| `continue_training` | 训练室继续专精 | 已覆盖 | UI 和 mapper 支持。 |
| `filename` | 自定义基建文件 | 部分覆盖 | UI 可手填；动态文件列表由 options 提供，但未做原版完整方案选择体验。 |
| `plan_index` | 自定义方案序号 | 已覆盖 | UI 和 mapper 支持。 |
| 队列轮换计划 | WPF 队列轮换相关配置 | 仅 UI | Web 有 `rotation` 输入，但 mapper 未使用。 |

### `Mall`

原版证据：`integration.md:404`、`MallTask.cs:33`、`AsstMallTask.cs:25`。当前证据：`web/taskForms.js:402`、`web/taskForms.js:647`、`app/mapper.py:318`。

| 原版字段/配置 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `visit_friends` | 访问好友 | 已覆盖 | UI 和 mapper 支持。 |
| `shopping` | 信用商店购物 | 已覆盖 | UI 和 mapper 支持。 |
| `buy_first` | 优先购买列表 | 已覆盖 | UI 分号文本，mapper 拆 list。 |
| `blacklist` | 黑名单 | 已覆盖 | UI 分号文本，mapper 拆 list。 |
| `force_shopping_if_credit_full` | 信用溢出无视黑名单 | 已覆盖 | UI `overflow_blacklist`。 |
| `only_buy_discount` | 只买折扣 | 已覆盖 | UI `discount_only`。 |
| `reserve_max_credit` | 低于 300 停止购买 | 已覆盖 | UI `stop_if_low`。 |
| `credit_fight` | OF-1 助战信用 | 已覆盖 | UI 和 mapper 支持。 |
| `formation_index` | 信用战斗编队 | 已覆盖 | UI 和 mapper 支持。 |
| 一日只执行一次 | WPF 本地状态 | 部分覆盖 | Web 有 `visit_once/credit_fight_once`，mapper 输出扩展字段；需要确认 MaaCore 是否消费。 |

### `Award`

原版证据：`integration.md:463`、`AwardTask.cs:26`、`AsstAwardTask.cs:31`。当前证据：`web/taskForms.js:429`、`app/mapper.py:332`。

| 原版字段 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `award` | 每日/每周任务奖励 | 已覆盖 | UI `daily`，mapper 输出 `award`。 |
| `mail` | 邮件奖励 | 已覆盖 | 无。 |
| `recruit` | 限定池免费单抽 | 已覆盖 | UI `free_gacha`。 |
| `orundum` | 幸运墙合成玉 | 已覆盖 | 无。 |
| `mining` | 限时开采许可 | 已覆盖 | UI `limited_orundum`。 |
| `specialaccess` | 周年赠送月卡 | 已覆盖 | UI `monthly_card`。 |

### `Roguelike`

原版证据：`integration.md:507`、`RoguelikeTask.cs:30`、`AsstRoguelikeTask.cs:204`。当前证据：`web/taskForms.js:454`、`web/taskForms.js:680`、`app/mapper.py:341`。

| 原版字段/配置 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `theme` | `Phantom/Mizuki/Sami/Sarkaz/JieGarden` | 已覆盖 | UI 和 mapper 支持。 |
| `mode` | `0..7` 多模式 | 部分覆盖 | UI 用策略文案推导部分模式；mapper 支持直接 `mode`，但 UI 未覆盖所有模式说明和数值。 |
| `squad` | 开局分队 | 已覆盖 | UI 和 mapper 支持。 |
| `roles` | 开局职业组 | 已覆盖 | UI 和 mapper 支持。 |
| `core_char` | 开局干员 | 已覆盖 | UI `operator`，mapper 转 `core_char`。 |
| `use_support` | 开局干员助战 | 已覆盖 | UI `use_support_unit`，mapper 转 `use_support`。 |
| `use_nonfriend_support` | 非好友助战 | 已覆盖 | UI 有复选框，mapper 支持。 |
| `starts_count` | 探索次数 | 已覆盖 | UI 和 mapper 支持。 |
| `difficulty` | 难度 | 已覆盖 | UI 和 mapper 支持。 |
| `stop_at_final_boss` | 五层 BOSS 前暂停 | 已覆盖 | UI 和 mapper 支持。 |
| `stop_at_max_level` | 满级停止 | 已覆盖 | UI 和 mapper 支持。 |
| `investment_enabled` | 投资源石锭 | 已覆盖 | UI 和 mapper 支持。 |
| `investments_count` | 投资次数 | 已覆盖 | UI 有数字输入，mapper 支持。 |
| `stop_when_investment_full` | 投资满停止 | 已覆盖 | UI 有复选框，mapper 支持。 |
| `investment_with_more_score` | 投资后购物 | 已覆盖 | mapper 已修正字段名为 `investment_with_more_score`（原 bug：`invest_with_more_score`）；UI 有复选框。 |
| `start_with_elite_two` | 凹开局精二直升 | 已覆盖 | UI 有复选框，mapper 支持。 |
| `only_start_with_elite_two` | 只凹精二直升 | 已覆盖 | UI 有条件显示的复选框（仅 start_with_elite_two 启用时展示），mapper 支持。 |
| `refresh_trader_with_dice` | 水月骰子刷商店 | 已覆盖 | UI 仅水月主题时显示复选框，mapper 支持。 |
| `first_floor_foldartal` | 萨米第一层远见密文板 | 已覆盖 | UI 仅萨米主题时显示复选框，mapper 支持。 |
| `start_foldartal_list` / `first_floor_foldartals` | 萨米生活队开局密文板列表 | 已覆盖 | UI 逗号分隔输入，mapper 接受 `first_floor_foldartals` 并转为 list；与原版 `start_foldartal_list` 字段名不同但语义覆盖。 |
| `collectible_mode_start_list` | 凹开局奖励对象 | 未覆盖 | mapper/UI 未处理。 |
| `use_foldartal` | 是否使用密文板 | 未覆盖 | mapper/UI 未处理。 |
| `check_collapsal_paradigms` | 是否检测坍缩范式 | 未覆盖 | mapper/UI 未处理。 |
| `double_check_collapsal_paradigms` | 防漏检测 | 未覆盖 | mapper/UI 未处理。 |
| `expected_collapsal_paradigms` | 期望坍缩范式 | 已覆盖 | UI 仅萨卡兹主题时显示逗号分隔输入，mapper 和测试均覆盖。 |
| `monthly_squad_auto_iterate` | 月度小队自动切换 | 仅后端 | mapper 支持；UI 无控件。 |
| `monthly_squad_check_comms` | 月度通信作为切换依据 | 仅后端 | mapper 支持；UI 无控件。 |
| `deep_exploration_auto_iterate` | 深入调查自动切换 | 仅后端 | mapper 支持；UI 无控件。 |
| `collectible_mode_shopping` | 烧水启用购物 | 未覆盖 | mapper/UI 未处理。 |
| `collectible_mode_squad` | 烧水分队 | 未覆盖 | mapper/UI 未处理。 |
| `find_playTime_target` | 界园常乐节点目标 | 未覆盖 | mapper/UI 未处理。 |
| `start_with_seed`/`seed` | 固定种子刷钱 | 已覆盖 | UI 有布尔开关和种子文本输入框，mapper 支持 `seed` 字符串透传。 |
| `delay_abort` | WPF 多任务共用停止延迟 | 仅 UI | UI 保存，mapper 未传递或转为 MaaCore instance option。 |

### `Reclamation`

原版证据：`integration.md:906`、`ReclamationTask.cs:26`、`AsstReclamationTask.cs:73`。当前证据：`web/taskForms.js:483`、`web/taskForms.js:699`、`app/mapper.py:437`。

| 原版字段/配置 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `theme` | `Fire/Tales` | 部分覆盖 | mapper 支持；UI 列出“沙中之火（活动未开放）/沙洲遗闻”，当前仅映射 `Tales`。 |
| `mode` | `0/1` | 已覆盖 | UI 用策略文案推导。 |
| `tools_to_craft` | 支援道具列表 | 部分覆盖 | UI 单输入 `tool_to_craft`，mapper 转 list；不支持多项编辑体验。 |
| `increment_mode` | `0` 连点 / `1` 长按 | 已覆盖 | UI 和 mapper 支持。 |
| `num_craft_batches` | 单次最大制造轮数 | 已覆盖 | UI `max_craft_count`。 |
| `clear_store` | WPF 额外字段，完成后买商店 | 部分覆盖 | UI 只在部分模式显示；mapper 支持。 |

### `Custom`

原版证据：`integration.md:958`、`AsstCustomTask.cs:21`。当前证据：`web/taskForms.js:442`、`app/mapper.py:471`。

| 原版字段 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `task_names` | 必填；执行数组中首个匹配任务 | 已覆盖 | UI 和 mapper 支持。 |

### `UserDataUpdate`

原版证据：`UserDataUpdateTask.cs:28`、`UserDataUpdateSettingsUserControlModel.cs:39`。当前证据：`app/capabilities.py:156`、`web/taskForms.js:518`、`app/mapper.py:466`。

| 原版字段/配置 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `UpdateOperBox` | 默认 `true` | 部分覆盖 | capabilities/mapper 有默认值；UI 显示“无需配置参数”，没有控件。 |
| `UpdateDepot` | 默认 `true` | 部分覆盖 | 同上。 |
| `TriggerInterval` | `EveryTime/Daily/Weekly` | 未覆盖 | 当前无触发周期配置，也无按周期跳过执行逻辑。 |

## 自动战斗与扩展任务

### `Copilot`

原版证据：`integration.md:714`、`AsstCopilotTask.cs:27`。当前证据：`web/copilotView.js:1`、`web/copilotView.js:506`、`app/api.py:291`、`app/models.py:134`。

| 原版字段/配置 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `filename` | 单作业路径，与 `copilot_list` 二选一 | 已覆盖 | Web 输入路径，API append `Copilot.filename`。 |
| `copilot_list[].filename` | 多作业文件 | 仅 UI | UI 可维护任务列表，但 `/api/copilot/run` 不发送 `copilot_list`。 |
| `copilot_list[].stage_name` | 多作业关卡名 | 仅 UI | UI 有任务名输入，但后端不使用。 |
| `copilot_list[].is_raid` | 突袭难度 | 仅 UI | UI 右键添加 raid，但后端不使用。 |
| `loop_times` | 单作业循环次数 | 已覆盖 | API 支持。 |
| `use_sanity_potion` | 理智不足时吃药 | 仅 UI | UI 仅在多作业模式显示，API 不发送。 |
| `formation` | 自动编队 | 部分覆盖 | API 发送 `formation`，但用数值承载，未完整遵循 boolean + `formation_index` 语义。 |
| `formation_index` | 编队栏位 `0..4` | 部分覆盖 | UI 有 `formationIndex`，API 没有按原字段发送。 |
| `user_additional[]` | 自定义追加干员 | 仅 UI | UI 有开关提示，无输入解析和 API 参数。 |
| `user_additional[].name` | 干员名 | 未覆盖 | 无参数模型。 |
| `user_additional[].skill` | 技能 | 未覆盖 | 无参数模型。 |
| `add_trust` | 低信赖补位 | 仅 UI | UI 有开关，API 不发送。 |
| `ignore_requirements` | 忽略属性要求 | 仅 UI | UI 有开关，API 不发送。 |
| `support_unit_usage` | 助战使用模式 `0..3` | 仅 UI | UI 只提供补漏/随机，API 不发送。 |
| `support_unit_name` | 指定助战干员 | 未覆盖 | 无 UI/API。 |

### `SSSCopilot`

原版证据：`integration.md:809`、`sss-schema.md:15`。当前证据：`web/copilotView.js:1`、`app/mapper.py:23`。

| 原版字段 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `filename` | 保全作业 JSON 路径 | 仅后端 | `mapper.py` 可透传 `SSSCopilot.filename`；Web 保全 tab/API 未按 `SSSCopilot` 发起。 |
| `loop_times` | 循环次数 | 未覆盖 | UI 循环次数存在，但 API 仍按 `Copilot`。 |

### `ParadoxCopilot`

原版证据：`integration.md:838`、`AsstParadoxCopilotTask.cs:21`。当前证据：`web/copilotView.js:1`。

| 原版字段 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `filename` | 单个悖论作业路径 | 未覆盖 | Web 有悖论 tab，但 API 不 append `ParadoxCopilot`。 |
| `list` | 悖论作业列表 | 未覆盖 | UI 多作业状态未转为 `ParadoxCopilot.list`。 |

### `SingleStep`

原版证据：`integration.md:982`。

| 原版字段 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `type` | 默认 `copilot` | 未覆盖 | 无 UI/API/mapper 白名单。 |
| `subtask` | `stage/start/action` | 未覆盖 | 无。 |
| `details` | 子任务参数 | 未覆盖 | 无。 |

### `VideoRecognition`

原版证据：`integration.md:1022`、`AsstProxy.cs:2964`。

| 原版字段 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `filename` | 视频路径 | 未覆盖 | 无 UI/API/mapper；需要服务端文件路径或上传方案。 |

## 小工具

证据：

- 原版工具 append：`AsstProxy.cs:2908`、`AsstProxy.cs:2919`、`AsstProxy.cs:2930`、`AsstProxy.cs:2944`
- 当前工具 UI/API：`web/toolsView.js:1`、`web/toolsView.js:460`、`app/api.py:257`

| 原版工具/配置 | 当前状态 | 缺口 |
|---|---|---|
| 公招识别 `RecruitCalc` | 已覆盖 | 后端 append `RecruitCalc` 并传星级/时间参数；识别结果通过 `maa.tools.recruit_calc` EventBus 事件推送，前端实时展示 Tags 及高稀有度标记。潜能联动和历史记录仍未实现。 |
| 干员识别 `OperBox` | 已覆盖 | 后端解析 `OperBoxInfo` callback，EventBus 广播 `maa.tools.operbox` 事件；前端实时展示已拥有/未拥有列表，支持文本导出。持久化跨会话仍未实现。 |
| 仓库识别 `Depot` | 已覆盖 | 后端解析 `Depot` callback，EventBus 广播 `maa.tools.depot` 事件；前端实时展示物品网格，支持 arkplanner/lolicon JSON 格式导出。持久化跨会话仍未实现。 |
| 抽卡 `GachaOnce/GachaTenTimes` | 部分覆盖 | 后端用 `Custom.task_names` 发起；免责声明“下次不再提示”和成就联动未完整实现。 |
| Peep/牛牛监控 | 部分覆盖 | 当前有 `/api/peep` 截图流和 FPS；原版相关状态、工具联动、截图输入能力未完整对齐。 |
| MiniGame | 部分覆盖 | 后端用 `Custom.task_names` 发起；列表硬编码，缺原版 `StageManager.MiniGameEntries` 动态活动解析；`SecretFront` 参数拼接语义也不完全一致。 |
| `MiniGame.TaskName` | 部分覆盖 | Web 本地保存 `miniGame`，不是原版配置键。 |
| `MiniGame.SecretFrontEnding` | 已覆盖 | Web 有结局选择。 |
| `MiniGame.SecretFrontEvent` | 已覆盖 | Web 有优先事件选择。 |
| `Gacha.ShowDisclaimerNoMore` | 未覆盖 | Web 有免责声明，但“下次不再提示”禁用。 |
| `Peep.TargetFps` | 部分覆盖 | Web 本地保存 FPS，未使用原版配置键。 |

## 连接与 MaaCore 选项

原版证据：`ConfigurationKeys.cs:67`、`ConnectSettingsUserControlModel.cs:98`、`AsstProxy.cs:633`、`integration.md:1110`。当前证据：`app/models.py:27`、`web/settingsView.js:360`、`app/maa_adapter.py:163`。

| 原版配置/实例选项 | 默认/说明 | 当前状态 | 缺口 |
|---|---|---|---|
| `Connect.AddressHistory` | 地址历史 | 未覆盖 | Web 不维护历史列表。 |
| `Connect.AutoDetect` | 默认 `true` | 部分覆盖 | UI/profile 保存，真实自动检测能力不完整。 |
| `Connect.AlwaysAutoDetect` | 默认 `false` | 部分覆盖 | UI/profile 保存，执行语义不完整。 |
| `Connect.Address` | ADB 地址 | 已覆盖 | profile `adb.address`。 |
| `Connect.AdbPath` | ADB 路径 | 已覆盖 | profile `adb.adb_path`。 |
| `Connect.ConnectConfig` | 连接配置 | 部分覆盖 | 支持 profile preset；预设列表少于原版，部分模拟器配置缺失。 |
| `Connect.MuMu12Extras.Enabled` | MuMu 截图增强 | 未覆盖 | UI 禁用，模型/后端未实现。 |
| `Connect.MuMu12EmulatorPath` | MuMu 安装路径 | 未覆盖 | UI 禁用。 |
| `Connect.MuMu12Index` | MuMu 实例编号 | 未覆盖 | UI 禁用。 |
| `Connect.MuMu12Display` | MuMu 显示器 | 未覆盖 | 无 UI/API。 |
| `Connect.MumuBridgeConnection` | MuMu 桥接 | 未覆盖 | UI 禁用。 |
| `Connect.LdPlayerExtras.Enabled` | LD 截图增强 | 部分覆盖 | profile/adapter 支持 LD extras；截图增强结果展示仍有限。 |
| `Connect.LdPlayerEmulatorPath` | LD 安装路径 | 已覆盖 | profile `ld_player_extras.path`。 |
| `Connect.LdPlayerManualSetIndex` | 手动实例编号 | 已覆盖 | profile `manual_index`。 |
| `Connect.LdPlayerIndex` | LD 实例编号 | 已覆盖 | profile `index`。 |
| `Connect.RetryOnDisconnected` | 断连重试 | 未覆盖 | 无 UI/API/runner 逻辑。 |
| `Connect.AllowADBRestart` | 连接失败重启 ADB server | 仅 UI | UI 禁用展示，后端未实现。 |
| `Connect.AllowADBHardRestart` | 重启 ADB 进程 | 仅 UI | UI 禁用展示，后端未实现。 |
| `Connect.AdbLiteEnabled` / instance option `4` | 使用 AdbLite | 仅 UI | UI 禁用展示，official adapter 未设置 option。 |
| `Connect.KillAdbOnExit` / instance option `5` | 退出释放 ADB | 仅 UI | UI 禁用展示，official adapter 未设置 option。 |
| `Connect.TouchMode` / instance option `2` | `minitouch/maatouch/adb/MaaFwAdb` | 部分覆盖 | UI 有触控模式，mapper 放 task params；official adapter 未设置 instance option。 |
| instance option `3 DeploymentWithPause` | 自动战斗/肉鸽/保全暂停下干员 | 仅 UI | 运行设置显示禁用，后端未设置。 |
| instance option `6 ClientType` | 连接前设置客户端类型 | 已覆盖 | official adapter 设置 `CLIENT_TYPE_OPTION=6`。 |
| AttachWindow `UseAttachWindow/ScreencapMethod/MouseMethod/KeyboardMethod` | PC 附加窗口 | Web 不适用 | 当前无 native helper。 |

## 设置页与全局配置

### 配置/任务链/定时

原版证据：`Root.cs:30`、`SpecificConfig.cs:32`、`Timer.cs:32`、`TimerSettingsUserControlModel.cs:34`。当前证据：`web/settingsView.js:1`、`app/models.py:115`、`app/scheduler.py:13`。

| 原版配置 | 当前状态 | 缺口 |
|---|---|---|
| 多配置 `Configurations/Current` | 已覆盖 | 当前 profile 存储提供近似能力。 |
| `InfrastOrder` | 未覆盖 | Web 未实现原版基建房间排序持久化。 |
| `TaskSelectedIndex` | 部分覆盖 | Web 本地保存 selected task，但不是原版配置键。 |
| `DragItemIsChecked` | 未覆盖 | 拖拽勾选状态未对齐。 |
| `Timer.ForceScheduledStart` | 已覆盖 | Web scheduler `force_start`。 |
| `Timer.ShowWindowBeforeForceScheduledStart` | 仅 UI | Web 保存但无桌面窗口语义。 |
| `Timer.CustomConfig` | 部分覆盖 | Web slot 可选 profile，但原版提前两分钟切换配置/重启语义未完整实现。 |
| 单个 Timer `Enable/Config/Hour/Minute` | 已覆盖 | Web `TimerSlot.enabled/profile_name/time`。 |
| 定时前启动模拟器 | 部分覆盖 | Web 有 `emulator_launch.command/wait_seconds`，但不等价原版 emulator path/additional command 全部语义。 |
| 后置动作 `PostActions` | 部分覆盖 | Web 支持 `exit_game/exit_emulator/sleep/hibernate/shutdown`；`exit_maa` 在模型里但 UI/runner 未完整实现。 |

### 运行/启动/上报

原版证据：`ConfigurationKeys.cs:96`、`GameSettingsUserControlModel.cs:54`、`StartSettingsUserControlModel.cs:78`、`ConfigurationKeys.cs:253`。当前证据：`web/settingsView.js:330`、`web/settingsView.js:422`。

| 原版配置 | 当前状态 | 缺口 |
|---|---|---|
| `Start.StartGame` | 已覆盖 | 通过 StartUp `start_game_enabled`。 |
| `Start.ClientType` | 已覆盖 | profile/client type。 |
| `Start.RunDirectly` | 仅 UI | 设置页禁用展示。 |
| `Start.MinimizeDirectly` | Web 不适用 | 浏览器无桌面最小化语义。 |
| `Start.OpenEmulatorAfterLaunch` | 部分覆盖 | Web 仅定时前命令启动，不是 MAA 启动后自动开模拟器完整流程。 |
| `Start.EmulatorPath` | 部分覆盖 | Web 用自由命令替代。 |
| `Start.EmulatorAddCommand` | 部分覆盖 | Web 无独立追加命令字段。 |
| `Start.EmulatorWaitSeconds` | 已覆盖 | Web `emulatorLaunchWait`。 |
| `Start.StartsWithScript` | 仅 UI | 设置页禁用展示，后端未执行。 |
| `Start.EndsWithScript` | 仅 UI | 设置页禁用展示，后端未执行。 |
| `Start.CopilotWithScript` | 仅 UI | 设置页禁用展示，后端未执行。 |
| `Start.ManualStopWithScript` | 仅 UI | 设置页禁用展示，后端未执行。 |
| `Start.BlockSleep` | 仅 UI | 设置页禁用展示，后端未阻止休眠。 |
| `Start.BlockSleepWithScreenOn` | 仅 UI | 设置页禁用展示，后端未实现。 |
| `Penguin.EnablePenguin` | 部分覆盖 | mapper 可传，设置页开关禁用展示。 |
| `Penguin.Id` | 部分覆盖 | mapper 可传，设置页输入禁用展示。 |
| `Yituliu.EnableYituliu` | 未覆盖 | 无 mapper/UI 执行。 |
| `TaskTimeoutMinutes` | 仅 UI | 设置页禁用展示，runner 无任务超时配置。 |
| `ReminderIntervalMinutes` | 仅 UI | 设置页禁用展示。 |

### 界面/背景/热键/成就

原版证据：`GUI.cs:26`、`ConfigurationKeys.cs:34`、`GuiSettingsUserControlModel.cs:73`、`BackgroundSettingsUserControlModel.cs:39`、`AchievementSettingsUserControlModel.cs:206`。当前证据：`web/settingsView.js:457`、`web/settingsView.js:493`。

| 原版配置 | 当前状态 | 缺口 |
|---|---|---|
| `GUI.Localization` | 仅 UI | 语言选择禁用，Web 无多语言系统。 |
| `GUI.OperNameLanguage` | 仅 UI | 禁用展示。 |
| `GUI.UseTray` | Web 不适用 | 浏览器无系统托盘；UI 展示禁用。 |
| `GUI.MinimizeToTray` | Web 不适用 | 浏览器无托盘最小化。 |
| `GUI.HideCloseButton` | Web 不适用 | WPF 窗口行为。 |
| `GUI.WindowTitleScrollable` | Web 不适用 | WPF 标题栏行为。 |
| `GUI.UseNotify` | Web 不适用/未覆盖 | 原生系统通知未实现。 |
| `GUI.MainTasksInvertNullFunction` | 仅 UI | 禁用展示。 |
| `GUI.LogItemDateFormatString` | 仅 UI | 禁用展示；日志时间格式未按用户配置切换。 |
| `GUI.DarkMode` | 仅 UI | 主题选择禁用。 |
| `GUI.InverseClearMode` | 仅 UI | 禁用展示。 |
| `GUI.WindowTitlePrefix` | Web 不适用 | 无 WPF 标题前缀。 |
| `GUI.IgnoreBadModulesAndUseSoftwareRendering` | Web 不适用 | WPF 渲染选项。 |
| `GUI.UseCardLog` | 已覆盖 | Web 有卡片样式日志开关。 |
| `GUI.MaxNumberOfLogThumbnails` | 已覆盖 | Web 有缩略图最大数量。 |
| `GUI.WindowTitleSelectShowList` | Web 不适用 | WPF 标题显示内容。 |
| `GUI.Background.ImagePath` | 仅 UI | 背景设置禁用，无实际背景文件选择。 |
| `GUI.Background.StretchMode` | 仅 UI | 禁用展示。 |
| `GUI.Background.Opacity` | 仅 UI | UI 展示但未实际接入。 |
| `GUI.Background.BlurEffectRadius` | 仅 UI | UI 展示但未实际接入。 |
| 热键设置 | 未覆盖 | 当前 settings sections 未启用 hotkey section。 |
| `Achievement.PopupDisabled` | 未覆盖 | 当前 settings sections 未启用 achievement section。 |
| `Achievement.PopupAutoClose` | 未覆盖 | 同上。 |

### 远程控制

原版证据：`remote-control-schema.md:18`、`ConfigurationKeys.cs:286`、`RemoteControlUserControlModel.cs:34`。当前证据：`web/settingsView.js:475`。

| 原版配置/协议 | 当前状态 | 缺口 |
|---|---|---|
| `RemoteControlGetTaskEndpointUri` | 仅 UI | 输入框禁用，无轮询任务服务。 |
| `RemoteControlReportStatusUri` | 仅 UI | 输入框禁用，无汇报结果服务。 |
| `RemoteControlUserIdentity` | 仅 UI | 输入框禁用。 |
| `RemoteControlDeviceIdentity` | 仅 UI | 输入框禁用，无生成/持久化。 |
| `RemoteControlPollIntervalMs` | 仅 UI | 数值禁用，无轮询循环。 |
| 远程任务 `CaptureImage/LinkStart/LinkStop/Toolbox-*` | 未覆盖 | 当前没有官方远控协议执行器。 |

### 外部通知

原版证据：`ConfigurationKeys.cs:292`、`ExternalNotificationSettingsUserControlModel.cs:48`。当前证据：`web/settingsView.js:500`。

| 原版配置 | 当前状态 | 缺口 |
|---|---|---|
| `ExternalNotification.Enabled` | 仅 UI | 设置页显示“未实现”，无后端发送。 |
| `ExternalNotification.SendWhenComplete` | 未覆盖 | 无触发逻辑。 |
| `ExternalNotification.EnableDetails` | 未覆盖 | 无通知详情拼装。 |
| `ExternalNotification.SendWhenError` | 未覆盖 | 无触发逻辑。 |
| `ExternalNotification.SendWhenTimeout` | 未覆盖 | runner 无 timeout 通知。 |
| SMTP `Server/Port/User/Password/UseSsl/RequiresAuthentication/From/To` | 未覆盖 | 无 UI/API/发送器。 |
| ServerChan `SendKey` | 未覆盖 | 无。 |
| Discord `BotToken/UserId/WebhookUrl` | 未覆盖 | 无。 |
| DingTalk `AccessToken/Secret` | 未覆盖 | 无。 |
| Telegram `BotToken/ChatId/TopicId` | 未覆盖 | 无。 |
| Bark `SendKey/Server` | 未覆盖 | 无。 |
| Qmsg `Server/Key/User/Bot` | 未覆盖 | 无。 |
| Gotify `Server/Token` | 未覆盖 | 无。 |
| CustomWebhook `Url/Body` | 未覆盖 | 无。 |

### 更新/性能/问题反馈/关于

原版证据：`ConfigurationKeys.cs:230`、`VersionUpdateSettingsUserControlModel.cs:207`、`ConfigurationKeys.cs:325`、`GpuOption.cs:42`。当前证据：`web/settingsView.js:511`、`app/api.py:70`。

| 原版配置/功能 | 当前状态 | 缺口 |
|---|---|---|
| `VersionUpdate.VersionType` | 仅 UI | 更新渠道禁用，无 updater。 |
| `VersionUpdate.ResourceUpdateSource` | 仅 UI | 更新源禁用，无资源更新。 |
| `VersionUpdate.UpdateSource.ForceGithubGlobalSource` | 仅 UI | 禁用展示。 |
| `VersionUpdate.ResourceUpdateSource.MirrorChyanCdk` | 未覆盖 | 无输入/校验。 |
| `VersionUpdate.UpdateSource.MirrorChyanCdkExpired` | 未覆盖 | 无。 |
| `VersionUpdate.StartupUpdateCheck` | 仅 UI | 禁用展示。 |
| `VersionUpdate.ScheduledUpdateCheck` | 仅 UI | 禁用展示。 |
| `VersionUpdate.ResourceApi` | 未覆盖 | 无。 |
| `VersionUpdate.AllowNightlyUpdates` | 未覆盖 | 无。 |
| `VersionUpdate.HasAcknowledgedNightlyWarning` | 未覆盖 | 无。 |
| `VersionUpdate.Proxy/ProxyType` | 部分覆盖 | UI 有 HTTP Proxy 字段雏形，但无 updater 使用。 |
| `AutoDownloadUpdatePackage` | 仅 UI | 禁用展示。 |
| `AutoInstallUpdatePackage` | 仅 UI | 禁用展示。 |
| `ShowUpdaterConsole` | 仅 UI | 禁用展示。 |
| 软件/资源版本显示 | 部分覆盖 | Web `/api/version` 只读取 MaaCore/resource 版本，不执行更新。 |
| `Performance.UseGpu` | 仅 UI | 性能页禁用展示，未调用 static option。 |
| `Performance.PreferredGpuDescription` | 未覆盖 | 无 GPU 枚举。 |
| `Performance.PreferredGpuInstancePath` | 未覆盖 | 无 GPU 枚举。 |
| `Performance.AllowDeprecatedGpu` | 未覆盖 | 无。 |
| 问题反馈日志打包 | 仅 UI | 按钮禁用，无日志 zip 生成。 |
| 打开日志文件夹 | Web 不适用/未覆盖 | 浏览器不能直接打开本地文件夹；可由后端提供下载替代。 |
| 清空图片缓存 | 仅 UI | 按钮禁用。 |
| 关于链接 | 已覆盖 | 官网/GitHub/社区链接存在。 |

## 高优先级缺口建议

> 2026-05-07 更新：已完成 Roguelike 投资/坍缩/密文板/种子 UI 字段补齐、`investment_with_more_score` 字段名 bug 修复、Depot/OperBox callback 解析与前端实时展示。

1. ✅ ~~先补”看起来已可用但参数未真正传递”的字段：Roguelike 投资/坍缩/密文板字段。~~ **已完成**
2. **仍待处理**：`Copilot` 多作业/自动编队细项（`copilot_list`、`formation_index`、`user_additional`）、`Recruit` extra tag 策略和上报字段。
3. 连接层补齐 MaaCore instance option：`TouchMode`、`DeploymentWithPause`、`AdbLiteEnabled`、`KillAdbOnExit`，并明确哪些 Web 环境不支持。
4. ✅ ~~工具页补结果解析：`Depot`、`OperBox`、`RecruitCalc` callback 数据已落到前端状态。~~ **已完成**
5. 自动战斗页按 task type 分流：主线 `Copilot`、保全 `SSSCopilot`、悖论 `ParadoxCopilot`，不要所有 tab 共用 `/api/copilot/run` 的简化模型。
6. 把设置页”禁用展示”的项目拆成三类：后端可实现、需要 native helper、纯桌面不适用，避免后续误认为已经接入。

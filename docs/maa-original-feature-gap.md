# 原版 MAA 功能与当前 Web 项目缺口对比

> 许可说明：本文档引用的 MaaAssistantArknights / MAA 原版代码、路径与协议属于 Maa Team and contributors，原项目以 `AGPL-3.0-only` 发布；本项目同样以 `AGPL-3.0-only` 发布。

**核对日期：2026-07-29**（本轮逐条对照 MaaCore C++ 源码重写，此前版本的状态列已大量过期）

## 怎么读这份文档

- **结论只来自源码**：`MaaCore/Task/**/*.cpp` 决定某个参数到底会不会被消费；`MaaWpfGui/Models/AsstTasks/*.cs` 决定原版实际下发什么。
  原版 `docs/zh-cn/protocol/integration.md` 有过时之处（例如 Recruit `set_time` 的生效条件），不作为唯一依据。
- **界面上的「暂未接入」徽标**与本文档「暂未接入」清单一一对应。看到徽标就说明该控件确实不会生效，不是没做完的半成品。
- 当前项目的证据路径（2026-05 拆分后的目录结构）：
  - 后端：`app/mapper.py`、`app/maa_adapter.py`、`app/runner.py`、`app/api.py`、`app/capabilities.py`
  - 前端任务表单：`web/tasks/*.js`
  - 前端视图：`web/views/basement/**`、`web/views/copilot/index.js`、`web/views/tools/index.js`、`web/views/settings/**`

| 状态 | 含义 |
|---|---|
| 已覆盖 | 有 UI，且参数确实被 MaaCore 消费（已对照 C++ 源码确认）。 |
| 部分覆盖 | 主干可用，细项或体验有差距。 |
| 暂未接入 | 界面上有入口但明确不会生效，已打徽标标注。 |
| 未覆盖 | 没有入口。 |
| Web 不适用 | 桌面端/系统级能力，浏览器天然做不到。 |

## 总览

| 原版能力 | 当前状态 | 说明 |
|---|---|---|
| 主任务链 `StartUp/Fight/Recruit/Infrast/Mall/Award/Roguelike/Reclamation/Custom/CloseDown` | 已覆盖 | 常用参数已端到端打通，本轮修正了一批键名/类型错误 |
| `UserDataUpdate` | 已覆盖（展开实现） | MaaCore **没有**该任务类型；mapper 按原版做法展开成 `Depot` + `OperBox` |
| `Copilot` / `SSSCopilot` / `ParadoxCopilot` | 已覆盖 | 含神秘代码下载、作业预览、多作业列表、本地文件上传 |
| `Depot` / `OperBox` / 公招识别 | 已覆盖 | 回调解析已按 MaaCore 真实字段重写，结果落盘 `data/tools_state.json` |
| `Gacha` / `MiniGame` | 部分覆盖 | 通过 `Custom.task_names` 发起；MiniGame 列表仍是硬编码 |
| `SingleStep` / `VideoRecognition` | 未覆盖 | 无 UI / API / mapper 白名单 |
| 连接与实例选项 | 部分覆盖 | TouchMode/DeploymentWithPause/AdbLite/KillAdbOnExit/ClientType/ADB 重启均已实现；MuMu 增强未接入 |
| 定时执行 / 后置动作 | 已覆盖 | 8 个槽位 + `run_command` 后置命令（`docker stop redroid` 场景） |
| 外部通知 | 部分覆盖 | 通用 Webhook（POST/PUT + 自定义头）已实现；SMTP/ServerChan/Bark 等专用渠道未接入 |
| 远程控制协议 | 暂未接入 | 只有占位 UI，无轮询/汇报执行器 |
| 更新 | 部分覆盖 | 核心与资源更新可用；Mirror酱 CDK、更新渠道已接入配置 |
| 界面/背景/热键/托盘/成就 | Web 不适用 / 暂未接入 | 详见下方清单 |

## 本轮（2026-07-29）修正的参数契约问题

这些都属于「界面上有、以前也保存了，但 MaaCore 根本不消费或直接拒绝」的情况，**修之前任务会白跑**：

| 项 | 以前 | 现在 | 依据 |
|---|---|---|---|
| 肉鸽策略 → `mode` | 刷开局=2、刷月度小队=3（MaaCore 已移除的值），`AsstAppendTask` 返回 0，任务被静默丢弃 | 刷等级 0 / 刷源石锭 1 / 刷开局 4 / 刷坍缩范式 5 / 刷月度小队 6 / 刷深入调查 7 / 刷常乐节点 20001 | `Task/Roguelike/RoguelikeConfig.h` 的 `RoguelikeMode` 与 `is_valid_mode` |
| `append_task` 返回值 | 不检查，返回 0 也当成功 | 返回 0 即抛错，把 MaaCore 的拒绝暴露到日志 | `Assistant.cpp::append_task` 未知类型/校验失败 `return 0` |
| `start_with_seed` | 布尔 + 另一个 `seed` 字段 | 直接下发种子字符串（留空即不启用），不存在 `seed` 键 | `RoguelikeInputSeedTaskPlugin::load_params` |
| 萨米密文板 | `first_floor_foldartal` 传布尔、列表键写成 `first_floor_foldartals` | 前者传期望板名字符串，后者正名为 `start_foldartal_list` | `RoguelikeConfig.cpp:31`、`Task/Interface/RoguelikeTask.cpp:171` |
| 凹开局奖励 | 中文词组成的字典（一个都命中不了） | 固定英文键 `hot_water/shield/ingot/hope/random` + 主题专属 `key/dice/ideas/ticket` | `RoguelikeCustomStartTaskPlugin.cpp:84-100` |
| 开局职业组 | 「稳扎稳打（重装、术师、狙击）」整串下发，OCR 永远匹配不上 | 截成短名「稳扎稳打」 | `RoguelikeSettingsUserControlModel.cs:141-154` 的 Value |
| 凹精二直升 | 任何模式都下发，非 mode=4 时 MaaCore **拒绝整个任务** | 仅 mode=4 时下发，且 `only_` 依赖 `start_` | `RoguelikeConfig.cpp:35-43` |
| 常乐节点目标 | 布尔；且 mode=20001 下不下发会让任务被拒 | mode=20001 时无条件下发 1~3 的整数 | `RoguelikeConfig.cpp:107-112` |
| 最大投资次数 | 0 原样下发 = 一次都不投（提示却写「0=不限制」） | 0 时不下发该键 = `INT_MAX` | `RoguelikeInvestTaskPlugin.cpp:31` |
| 公招 `force_refresh` | 跟随「自动刷新 3 星」，无法单独设置；文案还挂在 `skip_robot` 上 | 独立开关；`skip_robot` 文案改回「不选择 1 星（小车）词条」 | `RecruitTask.cpp:47-54` |
| 公招 `select` / `confirm` | select 含 3 星；`reserve_level_1` 是空操作 | select 只含 4/5/6；`skip_robot` 时 confirm 追加 1（与原版 `NotChooseLevel1` 一致） | `RecruitSettingsUserControlModel.cs:288-308` |
| 过期理智药 | 同时下发 `medicine_expire_days` 与已废弃的 `expiring_medicine` | 只发 `medicine_expire_days`（原版亦然） | `FightTask.cpp:69-81`、`AsstFightTask.cs:41` |
| 掉线自动重连 | `auto_restart` 是死字段 | 勾选后写入 `Fight.client_type`（为空即禁用该功能） | `integration.md:176-181` |
| 关卡按星期选择 | 用本地 `weekday()`，凌晨 0-4 点会选错 | 加明日方舟 04:00 日切 | 与 `options.py::_maa_day_of_week`、前端 `stageTips` 对齐 |
| 仓库/干员识别回调 | 判 `Depot`/`OperBox`，字段名也全错，事件永不发出 | 判 `DepotInfo`/`OperBoxInfo`；`data` 是 JSON 字符串；未拥有列表由 `all_opers.own` 算出 | `DepotRecognitionTask.cpp:57-75`、`OperBoxRecognitionTask.cpp:62-101` |
| 公招识别小工具 | 下发 `RecruitCalc`（MaaCore 没有该类型） | 下发 `Recruit` + `confirm:[-1]`（原版的「仅识别」写法） | `Assistant.cpp` 类型分支、`AutoRecruitTask::is_calc_only_task` |
| 干员星级显示 | `rarity + 1`，6 星画 7 颗 | 直接用 `rarity`（本身就是 1~6） | `OperBoxImageAnalyzer.cpp:163` |

## 暂未接入清单（界面上有徽标）

**MaaCore 不消费这些参数**，保留控件只是为了对齐原版界面：

- 理智作战：活动结束前 48H 吃过期药、隐藏代理倍率、允许使用源石保存状态、过期关卡重置、下拉框隐藏当日不开关卡、启用周计划、过期理智药使用上限、使用剩余理智执行指定关卡（请改用任务列表里独立的「剩余理智」任务）
- 自动肉鸽：战斗结束前延迟「停止」动作（原版是 GUI 层行为）
- 基建：轮换计划（具体计划请写进自定义基建配置文件）
- 公招：最大加急次数（`RecruitTask.cpp:52` 标 `[[maybe_unused]]`，上游同样无效）
- 开始唤醒：自动检测连接（已迁到「设置 → 连接设置 → 自动检测连接」按钮，那里会真正扫描 adb 设备）
- 连接设置：MuMu 截图增强 / 网络桥接（需要 Windows 原生 DLL）

**桌面端专属，浏览器天然做不到**：托盘图标与最小化到托盘、隐藏关闭按钮、窗口标题滚动、开机自启、启动后最小化、系统通知弹窗、软件渲染、热键、GPU 推理、背景图与主题/语言切换、开始前/结束后脚本、运行时阻止休眠。

**有价值但还没做**：远程控制协议、SMTP/ServerChan/Discord/DingTalk/Telegram/Bark/Qmsg/Gotify 专用通知渠道、日志打包下载、`SingleStep`、`VideoRecognition`、MiniGame 动态活动列表、作业评分上报。

## 主要任务逐项状态

### `StartUp`
`client_type` / `start_game_enabled` / `account_name` 已覆盖。连接配置与触控模式由 profile 的 `adb.*` 决定（`_profile_connect_config` + `_set_instance_options`），表单里的同名字段只做镜像。
本项目额外提供原版没有的「开始唤醒失败重试」（失败后执行命令 A → 等待 → 命令 B → 重试，用于 `docker restart redroid`）。

### `Fight`
`stage / stage_plan / medicine / medicine_expire_days / stone / times / series / drops / report_to_penguin / penguin_id / report_to_yituliu / yituliu_id / server / client_type / DrGrandet` 已覆盖。
剿灭子关卡通过 `custom_annihilation + annihilation_stage` 替换 `stage` 实现。
`drops` 后端支持多材料字典，前端目前只有单材料 + 数量。

### `Recruit`
`refresh / force_refresh / select / confirm / first_tags / extra_tags_mode / times / set_time / expedite / skip_robot / recruitment_time / report_to_* / server` 已覆盖。

### `Infrast`
`mode / facility / drones / threshold / replenish / dorm_* / reception_* / continue_training / filename / plan_index` 已覆盖。
自定义基建文件已改为下拉选择（数据来自 `/api/options` 的 `infrast.custom_files`），也可手填路径。

### `Mall`
`visit_friends / shopping / buy_first / blacklist / force_shopping_if_credit_full / only_buy_discount / reserve_max_credit / credit_fight / formation_index` 已覆盖。
两个「一日只执行一次」在原版是 GUI 层按上次执行日期置位，本项目没有该状态存储，等同无效。

### `Award`
`award / mail / recruit / orundum / mining / specialaccess` 全部已覆盖。

### `Roguelike`
主题、难度、模式、分队、职业组、开局干员、助战、探索次数、投资、停止条件、种子、密文板、坍缩范式、凹开局/烧水均已覆盖（见上方修正表）。
`monthly_squad_auto_iterate` / `monthly_squad_check_comms` / `deep_exploration_auto_iterate` 仅后端支持，无控件。

### `Reclamation`
`theme / mode / tools_to_craft / increment_mode / num_craft_batches / clear_store` 已覆盖。
「沙中之火」在 MaaCore 已下线（`ReclamationTask.cpp` 直接 Stop），下拉里已标注。

### `Copilot` 系列
`filename / copilot_list(filename+stage_name+is_raid) / loop_times / use_sanity_potion / formation / formation_index / add_trust / ignore_requirements / support_unit_usage / support_unit_name / user_additional` 已覆盖；SSS 与悖论按各自 task type 分流。
神秘代码（`maa://12345` / 纯数字 / prts.plus 链接）由 `app/copilot_resolver.py` 下载并缓存到 `data/copilot_cache/`。
本地作业文件通过 `POST /api/copilot/upload` 上传到 `data/copilot_upload/`（浏览器拿不到真实路径，必须上传服务端 MaaCore 才读得到）。

## 本项目特有的 API

| 端点 | 用途 |
|---|---|
| `POST /api/adb/detect` | 扫描 `adb devices` + 探测常见模拟器端口，回填连接地址 |
| `GET/PUT /api/tools/state` | 仓库/干员/公招识别结果持久化 |
| `POST /api/copilot/upload` | 上传本地作业 JSON |
| `POST /api/tools/stop` | 停止小工具任务（不影响一键长草的 runner 状态） |
| `GET /api/redroid/status` | `docker inspect` 查询 redroid 容器状态 |
| `POST /api/adb/test-screenshot` | 截图能力与耗时基准 |

## 已知的、还没解决的问题

1. `/api/tools/run` 与 `/api/copilot/start` 在多 profile 时依赖前端传 `profile_name` 决定用哪套连接配置；不传且 runner 从没跑过时会提示「没有可用的配置」。
2. 一键长草运行期间禁止使用小工具/自动战斗（MaaCore 单实例），但反过来在小工具跑任务时点「Link Start!」会新建 Asst 实例，旧任务被静默掐断。
3. `find_playTime_target` 在 MaaCore 是 1/2/3 三种常乐节点子类型，前端只有一个复选框，表达不了 2/3。
4. 识别结果的 `tools_state.json` 是「读-改-写」，并发 PUT 可能丢更新（实际触发概率极低）。

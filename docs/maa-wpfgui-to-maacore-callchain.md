# MAA 原生 WPF UI 到 MAACore 的调用链备忘录

> 许可说明：本文档引用的 MaaAssistantArknights / MAA 原版代码、路径与协议属于 Maa Team and contributors，原项目以 `AGPL-3.0-only` 发布；本项目同样以 `AGPL-3.0-only` 发布。

> 用途：后续新会话可直接把本文件作为前提输入，减少重复检索。
> 范围：仅基于 `/mnt/e/Project/C/MaaAssistantArknights` 原生 UI 与 Core 代码整理，不包含 `maa-web-control`。

## 结论

MAA 原生 UI 不是“页面直接调用 Core”，而是分成四层：

1. `include/AsstCaller.h` 暴露 MAACore 的 C API。
2. `src/MaaWpfGui/Services/MaaService.cs` 用 `LibraryImport` 把 C API 映射到托管层。
3. `src/MaaWpfGui/Main/AsstProxy.cs` 做字符串编码、资源加载、实例生命周期、任务追加/启动/停止、回调分发。
4. `src/MaaWpfGui/ViewModels/*` 和 `Models/AsstTasks/*` 负责把 UI 状态序列化成 Core 需要的 JSON，再通过 `AsstProxy` 下发。

所以，后续判断 `MAA_web` 是否“功能完备”，不能只看按钮数量，而要对照这四层是否都覆盖了。

## 主链路

- 原生 C API 入口在 [include/AsstCaller.h](</mnt/e/Project/C/MaaAssistantArknights/include/AsstCaller.h:56>)。
  - 这里定义了 `AsstSetUserDir`、`AsstLoadResource`、`AsstCreateEx`、`AsstConnect`、`AsstAppendTask`、`AsstSetTaskParams`、`AsstStart`、`AsstStop`、`AsstRunning`、`AsstBackToHome`、`AsstSetConnectionExtras`、`AsstAttachWindow`、`AsstAsyncScreencap`、`AsstGetImage`、`AsstGetImageBgr`、`AsstGetVersion` 等接口。
- Core 实现落在 [src/MaaCore/AsstCaller.cpp](</mnt/e/Project/C/MaaAssistantArknights/src/MaaCore/AsstCaller.cpp:49>)。
  - `AsstCreateEx` 最终创建 `asst::Assistant`。
  - `AsstAppendTask`、`AsstStart`、`AsstStop`、`AsstConnect` 都只是把参数转给 `Assistant`。
- 托管桥是 [src/MaaWpfGui/Services/MaaService.cs](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/MaaService.cs:25>)。
  - `LibraryImport("MaaCore.dll")` 直接声明 native 函数。
  - `CallbackDelegate` 与 Core 的 callback 形状对应。
- 业务代理是 [src/MaaWpfGui/Main/AsstProxy.cs](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:70>)。
  - 构造时先保存回调，并在 [451](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:451>) 设置 user dir。
  - `LoadResource()` 在 [469](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:469>) 负责按客户端类型装载资源。
  - `Init()` 在 [584](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:584>) 里完成资源加载、实例创建、实例选项设置。

## 启动与注入

- 应用启动后，`RootViewModel` 在 [95](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/RootViewModel.cs:95>) 异步调用 `Instances.AsstProxy.Init`。
- `Bootstrapper` 在 [705](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/Bootstrapper.cs:705>) 注册 `AsstProxy` 单例，并在 [726](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/Bootstrapper.cs:726>)、[740](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/Bootstrapper.cs:740>) 完成容器注入。
- `Instances` 把 `AsstProxy` 暴露成全局单例，见 [src/MaaWpfGui/Helper/Instances.cs](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Helper/Instances.cs:74>) 与 [98](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Helper/Instances.cs:98>)。

## 连接链路

- 统一入口是 [AsstProxy.cs:2448](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2448>) 的 `AsstConnect(ref string error)`。
- 分支 1，AttachWindow 模式：
  - 在 [2501](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2501>) 查找“明日方舟”窗口。
  - 在 [2568](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2568>) 调 `AsstAttachWindow`。
- 分支 2，ADB 模式：
  - 在 [2601](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2601>) 和 [2605](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2605>) 设置 MuMu/LDPlayer extras。
  - 在 [2649](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2649>) 先写 `ClientType` 实例选项。
  - 在 [2651](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2651>) 调原生 `AsstConnect`。
  - 自动探测和回退地址在 [2707](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2707>)。
- 连接设置改动后会回写实例选项：
  - [ConnectSettingsUserControlModel.cs:1210](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/Settings/ConnectSettingsUserControlModel.cs:1210>) 把 `TouchMode`、`DeploymentWithPause`、`AdbLiteEnabled`、`KillAdbOnExit` 写给 Core。

## 回调与状态同步

- native callback 进入 [AsstProxy.cs:696](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:696>)，先把 JSON 指针转成字符串，再在 [703](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:703>) 切到 UI 线程。
- `ProcMsg` 负责把 Core 消息翻译成 UI 行为，见 [AsstProxy.cs:711](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:711>)。
- `TaskChainStart` / `TaskChainCompleted` / `TaskChainError` / `TaskChainStopped` 会更新 `Running`、日志、进度和通知，重点在 [727](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:727>)、[1050](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:1050>)、[1099](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:1099>)、[1177](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:1177>)。
- 子任务消息会广播给各任务页：
  - [AsstProxy.cs:742](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:742>) 到 [747](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:747>) 调 `TaskQueueViewModel.InvokeProcSubTaskMsg`。
  - [TaskQueueViewModel.cs:2128](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:2128>) 到 [2134](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:2134>) 再分发到各 Task Settings VM。
- 单个 UI item 会聚合多个 Core task id 的状态，见 [TaskItemViewModel.cs:82](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/TaskItemViewModel.cs:82>) 到 [126](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/TaskItemViewModel.cs:126>)。

## 队列执行

- 主任务队列启动从 [TaskQueueViewModel.cs:1725](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:1725>) 开始。
- 它会先连接模拟器，再遍历任务，在 [1830](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:1830>) 调 `SerializeTask()`。
- 每个任务序列化成功后，返回的 task id 会写回对应 UI item，见 [1835](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:1835>)。
- 全部任务追加完以后才统一 `AsstStart()`，见 [1866](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:1866>)。
- 停止链路是 [1934](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:1934>) 调 `AsstStop()`，再在 [1946](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:1946>) 轮询 `AsstRunning()`。
- 定时启动也会复用队列链路：`HandleScheduledStart()` 在强制定时启动时可先停止旧任务并追加 `CloseDown`，再调用 `LinkStart()`，见 [TaskQueueViewModel.cs:903](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:903>) 到 [947](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:947>)。

## 任务序列化映射

### 统一入口

- `TaskSettingsViewModel.SerializeTask()` 约定了所有任务页都要把 UI 状态转成 `(bool? IsSuccess, IEnumerable<int> TaskId)`，见 [TaskSettingsViewModel.cs:77](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/TaskSettingsViewModel.cs:77>) 到 [89](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/TaskSettingsViewModel.cs:89>)。
- `AsstProxy.AsstAppendTaskWithEncoding()` 负责把 `Asst*Task` 转 JSON 并调用 native `AsstAppendTask`，见 [2749](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2749>) 到 [2753](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2753>)。
- 运行中的任务支持复用 task id 更新参数：`AsstProxy.AsstSetTaskParamsEncoded()` 在 [3001](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:3001>) 到 [3014](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:3014>) 最终调用 native `AsstSetTaskParams`。
- 多数队列任务页在 `taskId > 0` 时走 `AsstSetTaskParamsEncoded()`，例如 StartUp [StartUpSettingsUserControlModel.cs:101](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/TaskQueue/StartUpSettingsUserControlModel.cs:101>)、Fight [FightSettingsUserControlModel.cs:1065](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/TaskQueue/FightSettingsUserControlModel.cs:1065>)、Infrast [InfrastSettingsUserControlModel.cs:605](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/TaskQueue/InfrastSettingsUserControlModel.cs:605>)、Roguelike [RoguelikeSettingsUserControlModel.cs:1135](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/TaskQueue/RoguelikeSettingsUserControlModel.cs:1135>)。
- 注意 WPF 内部有两套任务类型：`AsstTaskType` 是 Core 接收的任务名，定义在 [MaaService.cs:104](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/MaaService.cs:104>)；`AsstProxy.TaskType` 是 WPF 自己用于状态表和 UI 分类的类型，定义在 [AsstProxy.cs:2769](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2769>)。
- 因此不能简单用 WPF 分类推断 Core 类型。例如工具箱抽卡和小游戏在 WPF 状态表里分别是 `Gacha` / `MiniGame`，但实际通过 `AsstCustomTask` 下发 Core `Custom` 任务，见 [AsstProxy.cs:2930](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2930>) 到 [2950](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2950>)。

### 任务类型

- StartUp:
  - [AsstStartUpTask.cs](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstStartUpTask.cs:22>) 定义 `client_type`、`start_game_enabled`、`account_name`。
  - [StartUpSettingsUserControlModel.cs:94](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/TaskQueue/StartUpSettingsUserControlModel.cs:94>) 负责组装。
- Fight:
  - [AsstFightTask.cs](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstFightTask.cs:22>) 定义 `stage`、`medicine`、`stone`、`times`、`series`、`report_to_penguin`、`server`、`client_type` 等。
  - [FightSettingsUserControlModel.cs:1033](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/TaskQueue/FightSettingsUserControlModel.cs:1033>) 负责组装。
- Recruit:
  - [AsstRecruitTask.cs](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstRecruitTask.cs:24>) 定义 `refresh`、`select`、`confirm`、`times`、`set_time`、`expedite`、`extra_tags_mode`、`recruitment_time` 等。
  - [RecruitSettingsUserControlModel.cs:268](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/TaskQueue/RecruitSettingsUserControlModel.cs:268>) 负责组装。
- Infrast:
  - [AsstInfrastTask.cs](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstInfrastTask.cs:25>) 定义 `facility`、`drones`、`continue_training`、`threshold`、`reception_*`、`mode`、`filename`、`plan_index`。
  - [InfrastSettingsUserControlModel.cs:563](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/TaskQueue/InfrastSettingsUserControlModel.cs:563>) 负责组装。
- Mall:
  - [AsstMallTask.cs](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstMallTask.cs:25>) 定义 `credit_fight`、`formation_index`、`visit_friends`、`shopping`、`buy_first`、`blacklist`、`force_shopping_if_credit_full`、`only_buy_discount`、`reserve_max_credit`。
  - [MallSettingsUserControlModel.cs:230](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/TaskQueue/MallSettingsUserControlModel.cs:230>) 负责组装。
- Award:
  - [AsstAwardTask.cs](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstAwardTask.cs:24>) 定义 `award`、`mail`、`recruit`、`orundum`、`mining`、`specialaccess`。
  - [AwardSettingsUserControlModel.cs:124](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/TaskQueue/AwardSettingsUserControlModel.cs:124>) 负责组装。
- Roguelike:
  - [AsstRoguelikeTask.cs](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstRoguelikeTask.cs:25>) 覆盖 `mode`、`theme`、`difficulty`、`starts_count`、`investment_*`、`squad`、`roles`、`core_char`、`collectible_*`、`monthly_squad_*`、`deep_exploration_*`、`expected_collapsal_paradigms`、`use_support`、`start_with_seed` 等。
  - [RoguelikeSettingsUserControlModel.cs:1064](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/TaskQueue/RoguelikeSettingsUserControlModel.cs:1064>) 负责组装。
- Reclamation:
  - [AsstReclamationTask.cs](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstReclamationTask.cs:25>) 定义 `theme`、`mode`、`increment_mode`、`num_craft_batches`、`tools_to_craft`、`clear_store`。
  - [ReclamationSettingsUserControlModel.cs:151](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/TaskQueue/ReclamationSettingsUserControlModel.cs:151>) 负责组装。
- Custom:
  - [AsstCustomTask.cs](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstCustomTask.cs:22>) 只有 `task_names`。
  - [CustomSettingsUserControlModel.cs:85](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/TaskQueue/CustomSettingsUserControlModel.cs:85>) 负责组装。
- CloseDown:
  - [AsstCloseDownTask.cs](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstCloseDownTask.cs:24>) 只有 `client_type`。
- UserDataUpdate:
  - 由队列任务页和工具页联动，核心是追加识别/仓库识别任务并重置状态，参见 [UserDataUpdateSettingsUserControlModel.cs](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/TaskQueue/UserDataUpdateSettingsUserControlModel.cs:72>)。

### Copilot / SSS / 悖论

- Copilot 不在主任务队列序列化链路里，而是由 `CopilotViewModel` 直接追加并启动 Core 任务。
- `AsstCopilotTask` 在 [AsstCopilotTask.cs:26](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstCopilotTask.cs:26>) 定义自动战斗参数，序列化字段包括 `filename` 或 `copilot_list`，以及 `formation`、`support_unit_usage`、`add_trust`、`ignore_requirements`、`loop_times`、`use_sanity_potion`、`formation_index`、`user_additional`，见 [80](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstCopilotTask.cs:80>) 到 [119](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstCopilotTask.cs:119>)。
- `AsstParadoxCopilotTask` 在 [AsstParadoxCopilotTask.cs:183](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstParadoxCopilotTask.cs:183>) 定义悖论作业参数，序列化字段是单文件 `filename` 或多文件 `list`，见 [196](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstParadoxCopilotTask.cs:196>) 到 [208](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/AsstTasks/AsstParadoxCopilotTask.cs:208>)。
- `CopilotViewModel.AppendAndStartCopilotAsync()` 在 [2039](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/CopilotViewModel.cs:2039>) 到 [2123](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/CopilotViewModel.cs:2123>) 处理单作业、多作业列表、SSS、悖论几条路径。
- 多作业列表的主线/SS/故事集/悖论都用 WPF 分类 `TaskType.Copilot` 追加；单作业会用 `_taskType` 区分 Core 的 `Copilot` 和 `SSSCopilot`，见 [CopilotViewModel.cs:2119](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/CopilotViewModel.cs:2119>) 到 [2120](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/CopilotViewModel.cs:2120>)。
- Core 侧还暴露 `SingleStep` 和 `VideoRecognition`，但 WPF 当前没有主要可用入口：`VideoRecognition` 相关 UI 被隐藏，`CopilotViewModel` 注释说明“已不支持”，见 [CopilotViewModel.cs:74](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/CopilotViewModel.cs:74>) 与 [ToolboxView.xaml:518](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Views/UI/ToolboxView.xaml:518>)。

## 工具箱入口

- 仓库识别：`AsstStartDepot()`，见 [AsstProxy.cs:2908](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2908>)。
- 干员识别：`AsstStartOperBox()`，见 [AsstProxy.cs:2919](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2919>)。
- 抽卡：`AsstStartGacha()`，见 [AsstProxy.cs:2930](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2930>)。
- 小游戏：`AsstMiniGame()`，见 [AsstProxy.cs:2944](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2944>)。
- 公招识别/计算：`ToolboxViewModel.RecruitStartCalc()` 先连接，再构造 `AsstRecruitTask`，以 WPF `TaskType.RecruitCalc` 追加 Core `Recruit` 参数并 `AsstStart()`，见 [ToolboxViewModel.cs:372](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/ToolboxViewModel.cs:372>) 到 [420](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/ToolboxViewModel.cs:420>)。
- 工具箱实时截图：见 [ToolboxViewModel.cs:1693](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/ToolboxViewModel.cs:1693>) 到 [1745](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/ToolboxViewModel.cs:1745>)。

## 远程控制入口

- 原生 WPF 还有一个不经过按钮点击的远程控制旁路，服务类是 [RemoteControlService.cs:44](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/RemoteControl/RemoteControlService.cs:44>)。
- 它会轮询远端任务并分成顺序队列和即时队列，任务类型列表见 [RemoteControlService.cs:285](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/RemoteControl/RemoteControlService.cs:285>) 到 [306](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/RemoteControl/RemoteControlService.cs:306>)。
- 顺序任务覆盖 `LinkStart`、`LinkStart-Base/WakeUp/Combat/Recruiting/Mall/Mission/AutoRoguelike/Reclamation`、`Toolbox-GachaOnce/TenTimes`、`CaptureImage`、`Settings-ConnectAddress`、`Settings-Stage1`。
- 即时任务覆盖 `HeartBeat`、`StopTask`、`CaptureImageNow`。
- `LinkStart` 远程入口会切回 UI 线程调用 `TaskQueueViewModel.LinkStart()`，见 [RemoteControlService.cs:330](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/RemoteControl/RemoteControlService.cs:330>) 到 [340](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/RemoteControl/RemoteControlService.cs:340>)。
- 分类启动入口会走 `RemoteControlService.LinkStart()`，按任务名从当前配置中取单个任务并调用对应 Settings VM 的 `SerializeTask()`，见 [RemoteControlService.cs:556](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/RemoteControl/RemoteControlService.cs:556>) 到 [620](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/RemoteControl/RemoteControlService.cs:620>)。
- 远程截图会调用 `AsstConnect()` 和 `AsstGetFreshImage()` / `AsstGetFreshImageAsync()`，见 [RemoteControlService.cs:378](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/RemoteControl/RemoteControlService.cs:378>) 到 [405](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/RemoteControl/RemoteControlService.cs:405>) 以及 [485](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/RemoteControl/RemoteControlService.cs:485>) 到 [512](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/RemoteControl/RemoteControlService.cs:512>)。
- 远程停止直接调用 `AsstStop()`，见 [RemoteControlService.cs:471](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/RemoteControl/RemoteControlService.cs:471>) 到 [479](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/RemoteControl/RemoteControlService.cs:479>)。

## 其他 Core API 使用情况

- `MaaService` 实际 P/Invoke 的 native API 只有 [MaaService.cs:31](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/MaaService.cs:31>) 到 [100](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Services/MaaService.cs:100>) 这些；`include/AsstCaller.h` 中的 `AsstConnected`、`AsstAsyncConnect`、`AsstAsyncAttachWindow`、`AsstAsyncClick`、`AsstGetUUID`、`AsstGetTasksList` 在当前 WPF 主链路里没有封装。
- `AsstGetVersion()` 由版本页/更新弹窗读取 Core 版本，见 [VersionUpdateSettingsUserControlModel.cs:72](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/Settings/VersionUpdateSettingsUserControlModel.cs:72>) 与 [VersionUpdateDialogViewModel.cs:75](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/Dialogs/VersionUpdateDialogViewModel.cs:75>)。
- `AsstBackToHome()` 用于任务完成后的返回安卓主页动作，见 [TaskQueueViewModel.cs:451](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:451>) 到 [454](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:454>)。
- `CloseDown` 用于关闭游戏：后处理里会调用 `AsstStartCloseDown()`，见 [TaskQueueViewModel.cs:457](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:457>) 到 [464](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:464>)；代理层先 `AsstStop()` 再追加 `AsstCloseDownTask`，见 [AsstProxy.cs:2877](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2877>) 到 [2895](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:2895>)。
- `AsstAsyncScreencap` + `AsstGetImage` / `AsstGetImageBgr` 由 `AsstProxy` 封装成 `AsstGetFreshImage()`、`AsstGetImageBgrDataAsync()` 等截图 API，基础实现见 [AsstProxy.cs:204](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:204>) 到 [357](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:357>)。
- 截图 API 的上层用途包括队列日志缩略图 [TaskQueueViewModel.cs:374](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:374>) 到 [393](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:393>)、工具箱实时预览 [ToolboxViewModel.cs:1723](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/ToolboxViewModel.cs:1723>) 到 [1745](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/ToolboxViewModel.cs:1745>)、远程截图。
- 静态/实例选项也属于 UI 调 Core 的重要面：GPU OCR 用 `AsstSetStaticOption`，见 [AsstProxy.cs:616](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:616>)；TouchMode、DeploymentWithPause、AdbLiteEnabled、KillAdbOnExit 通过 `AsstSetInstanceOption` 写入，见 [ConnectSettingsUserControlModel.cs:1210](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/Settings/ConnectSettingsUserControlModel.cs:1210>) 到 [1215](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/Settings/ConnectSettingsUserControlModel.cs:1215>)。

## 脚本、定时与任务后动作

- 队列启动前会运行 `StartsWithScript`，见 [TaskQueueViewModel.cs:1779](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:1779>)；队列完成或手动停止时会运行 `EndsWithScript`，见 [TaskQueueViewModel.cs:447](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:447>) 与 [1990](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:1990>) 到 [1993](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/TaskQueueViewModel.cs:1993>)。
- Copilot 也有独立脚本入口：开始前运行 `StartsWithScript`，停止时可运行 `EndsWithScript`，见 [CopilotViewModel.cs:1950](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/CopilotViewModel.cs:1950>) 与 [2135](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/CopilotViewModel.cs:2135>) 到 [2146](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UI/CopilotViewModel.cs:2146>)。
- 任务后动作由 `PostActionSetting` 表示，可选择返回安卓主页、关闭游戏、退出模拟器、关机/休眠等；其中返回主页和关闭游戏会实际调用 Core，配置模型见 [PostActionSetting.cs:28](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Models/PostActionSetting.cs:28>)。

## 配置与资源

- `ConfigurationHelper` 负责普通设置写盘，见 [ConfigurationHelper.cs:354](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Helper/ConfigurationHelper.cs:354>) 到 [380](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Helper/ConfigurationHelper.cs:380>)。
- `ConfigFactory.CurrentConfig.TaskQueue` 是任务队列的真实持久化来源，任务编辑、移动、删除都直接作用在它上面。
- `GameSettingsUserControlModel.ClientType` 改动后会触发资源刷新，见 [GameSettingsUserControlModel.cs:74](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/Settings/GameSettingsUserControlModel.cs:74>) 到 [105](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/ViewModels/UserControl/Settings/GameSettingsUserControlModel.cs:105>)。
- `AsstProxy.LoadResource()` 会按 client type 载入主资源、缓存资源、global 资源，以及 PC 平台差异资源，见 [AsstProxy.cs:473](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:473>) 到 [504](</mnt/e/Project/C/MaaAssistantArknights/src/MaaWpfGui/Main/AsstProxy.cs:504>)。

## 给 MAA_web 的对照维度

后续判断 `MAA_web` 是否功能完备，建议至少逐项对照：

1. 是否有与原版一致的核心任务分类。
2. 是否能把 UI 状态序列化成和 `Asst*Task` 一致的 JSON 字段。
3. 是否有连接方式分支：ADB / AttachWindow / extras / 自动探测。
4. 是否有回调驱动的运行态、任务态、子任务态更新。
5. 是否有资源加载、client type 切换、配置持久化这三类基础设施。
6. 是否覆盖工具箱入口：仓库识别、干员识别、公招识别、抽卡、小游戏、实时截图。
7. 是否覆盖 Copilot / SSS / 悖论的单作业、多作业列表、自动编队、助战、追加信赖、忽略要求、额外干员等参数。
8. 是否支持运行中 `SetTaskParams` 更新任务参数，而不是只能开始前追加任务。
9. 是否有远程控制旁路：远程启动队列/分类任务、远程抽卡、远程截图、远程停止、心跳/状态回报。
10. 是否覆盖辅助 Core API：版本读取、截图/BGR 数据、返回安卓主页、静态/实例选项写入。
11. 是否清楚区分 WPF UI 分类和 Core 任务类型，尤其是 `Gacha` / `MiniGame` 这类 UI 分类实际下发 `Custom` 的情况。
12. 是否覆盖定时启动、开始/结束脚本、任务后动作，尤其是返回主页和关闭游戏这些会触发 Core 的后处理。

## 适合下次会话直接带入的短结论

MAA 原生 UI 的核心不是页面，而是 `AsstProxy` 和一组 `Asst*Task` 序列化器。只要 `MAA_web` 能完整复刻这条链路，并覆盖上面这些对照维度，才算接近原版 UI 的功能完备度。复核后主链路没有遗漏；主要补充点是 Copilot/SSS/悖论、远程控制、工具箱公招识别、运行中改参、版本/截图/返回主页/关闭游戏、定时与脚本等旁路能力。

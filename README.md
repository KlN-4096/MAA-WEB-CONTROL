# MAA Web Control

内网 MAA Web 控制台原型。默认适配器仍是 dry-run，不会连接 ADB 或 MaaCore；只有显式设置 `MAA_ADAPTER=official` 或 `MAA_ADAPTER=real` 后，后端才会加载官方 Python wrapper 并调用真实 MaaCore。

## dry-run 运行

```powershell
cd E:\Project\Python\maa-web-control
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

打开 `http://127.0.0.1:8765`。

## Windows 真实 MaaCore 手测

1. 启动模拟器，并确认 ADB 能看到设备：

```powershell
adb devices
```

如果列表里没有设备，按模拟器给出的地址连接，例如：

```powershell
adb connect 127.0.0.1:5555
adb devices
```

把 `adb devices` 输出里的设备地址填到 Web UI 的 profile ADB address，或保存到 profile 的 `adb.address`。`adb_path` 默认是 `adb`，如果没有加入 `PATH`，请在 profile 里填完整 adb 路径。

2. 设置真实 MaaCore 环境变量并启动后端：

```powershell
cd E:\Project\Python\maa-web-control
$env:MAA_ADAPTER = "official"
$env:MAA_CORE_DIR = "D:\APPS\AppGroup_3_Game\MAA"
# 可选：默认会优先尝试 $env:MAA_CORE_DIR\Python，其次才是 E:\Project\C\MaaAssistantArknights\src\Python
# $env:MAA_PYTHON_DIR = "D:\APPS\AppGroup_3_Game\MAA\Python"
# 可选：默认 data\runtime\maa
# $env:MAA_USER_DIR = "E:\Project\Python\maa-web-control\data\runtime\maa"
# 可选：默认 General；profile.adb.connect_config.name/config/preset 会优先生效
# $env:MAA_CONNECT_CONFIG = "General"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

`MAA_CORE_DIR` 必须指向包含 `MaaCore.dll` 和 `resource` 的 MAA 发布或构建目录。未设置 `MAA_ADAPTER=official` 时，上面的 Web 操作仍然只是 dry-run。

3. 打开 `http://127.0.0.1:8765`，在 Web UI 中选择或编辑任务，确认 ADB 地址后点击开始。

4. 观察右侧日志：

- `runner.*` 表示 Web runner 的连接、追加任务、启动、完成或失败状态。
- `maa.callback` 表示 MaaCore 官方 wrapper callback 已进入事件流。
- 如果要验证 ADB 是否连通，先在命令行执行 `adb devices`；模拟器地址一般是 `127.0.0.1:5555`，然后把这个地址填到 profile 的 `adb.address`。
- 也可以直接查看最近日志：

```powershell
Invoke-RestMethod http://127.0.0.1:8765/api/logs/recent?limit=50
```

## 当前边界

- 已有 profile 存储：`data/profiles/*.json`
- 已有 REST API：`/api/status`、`/api/profiles`、`/api/profiles/{name}`、`/api/run`、`/api/stop`
- 已有 WebSocket：`/api/events`
- 默认 dry-run 不会连接真实 MAA/ADB
- official/real 模式通过官方 Python wrapper 调用 MaaCore
- `redroid` 状态仍是占位

## Adapter 接入点

执行层保持 `app.runner.MaaAdapter` 协议：

- `connect(profile)`：连接 ADB/redroid
- `append_task(call)`：调用 `AsstAppendTask(type, paramsJson)`
- `start()`：调用 `AsstStart()`
- `stop()`：调用 `AsstStop()`

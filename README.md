# MAA Web Control

内网 MAA Web 控制台原型。当前版本先实现任务配置、profile 保存、运行状态、事件流和静态 Web UI；MaaCore 适配器暂时是 dry-run，后续可替换为 Python wrapper 或 `libMaaCore.so` 直接调用。

## 运行

```powershell
cd E:\Project\Python\maa-web-control
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

打开 `http://127.0.0.1:8765`。

## 当前边界

- 已有 profile 存储：`data/profiles/*.json`
- 已有 REST API：`/api/status`、`/api/profiles`、`/api/profiles/{name}`、`/api/run`、`/api/stop`
- 已有 WebSocket：`/api/events`
- `ADB`、`redroid`、真实 `MaaCore` 调用仍是适配器占位

## 后续接入点

真实执行层只需要替换 `app.runner.MaaAdapter`：

- `connect(profile)`：连接 ADB/redroid
- `append_task(call)`：调用 `AsstAppendTask(type, paramsJson)`
- `start()`：调用 `AsstStart()`
- `stop()`：调用 `AsstStop()`


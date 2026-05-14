# MAA Web Control

局域网内的 MAA Web 控制台，用来配置 MAA Core、编辑 profile、查看运行日志，并用内置 scheduler 定时执行每日任务。

当前主要部署目标是 Linux + redroid：Web 后端常驻后台，到点执行 `docker start redroid`，等待 ADB 就绪后运行指定 profile，任务结束后执行 `docker stop redroid`。

## 运行条件

- Python 3.11+
- 已安装项目依赖：`pip install -e .`
- 可用的 MAA Linux 目录，包含 `libMaaCore.so`、`resource/`、`Python/`
- 可用的 redroid 容器，默认容器名 `redroid`
- 宿主机能执行 `adb`、`docker start redroid`、`docker stop redroid`

## 后台启动

在项目根目录创建或确认 `run.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

exec "$ROOT_DIR/.venv/bin/uvicorn" app.main:app \
  --host "${MAA_WEB_HOST:-0.0.0.0}" \
  --port "${MAA_WEB_PORT:-8000}"
```

手动后台启动：

```bash
cd /home/klnon/maa_web/MAA-WEB-CONTROL
mkdir -p data/runtime
nohup ./run.sh >> data/runtime/maa-web-control.log 2>&1 &
echo $! > data/runtime/maa-web-control.pid
```

访问：

```text
http://<server-ip>:8000
```

停止：

```bash
cd /home/klnon/maa_web/MAA-WEB-CONTROL
kill "$(cat data/runtime/maa-web-control.pid)"
```

## Web 配置

首次启动后在 Web 设置页配置：

1. **MAA 核心**
   - 适配器类型：`Official`
   - MaaCore 目录：例如 `/home/klnon/redroid/MAA`
   - 点击「应用并切换」

2. **连接设置**
   - ADB 地址：`127.0.0.1:5555`
   - ADB 路径：`adb`
   - redroid 可使用 `MaaTouch`

3. **任务配置**
   - 保存需要的 profile，例如 `daily-shualizhi`、`daily-shoucai`
   - profile 文件位于 `data/profiles/*.json`

4. **定时执行**
   - 启用时间点并选择 profile
   - 勾选强制定时启动

5. **启动设置**
   - 勾选「自动启动模拟器/容器」
   - 启动命令：`docker start redroid`
   - 等待秒数：建议 `60` 到 `90`

6. **完成后**
   - 选择自定义命令
   - 命令：`docker stop redroid`
   - 超时：`60` 秒

配置会保存到 `data/adapter.json`、`data/scheduler.json`、`data/runner_config.json` 等文件。重启 Web 后端后会自动加载。

## 验证

```bash
curl http://127.0.0.1:8000/api/status
curl http://127.0.0.1:8000/api/adapter
curl http://127.0.0.1:8000/api/scheduler
curl http://127.0.0.1:8000/api/profiles
```

手动触发一次 profile：

```bash
curl -X POST http://127.0.0.1:8000/api/profiles/daily-shualizhi/run
```

查看日志：

```bash
tail -f data/runtime/maa-web-control.log
curl http://127.0.0.1:8000/api/logs/recent?limit=50
```

确认 Web scheduler 跑通后，再停用旧 crontab 的 MAA 定时块，避免两套调度同时启动 redroid。

## 本地开发

```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

未配置 Official 适配器时会使用 dry-run，不会实际操作 MAA/ADB。

## 测试

```bash
python -m unittest discover -s tests
```

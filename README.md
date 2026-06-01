# MAA Web Control

局域网内的 MAA Web 控制台，用来配置 MAA Core、编辑 profile、查看运行日志，并用内置 scheduler 定时执行每日任务。

当前主要部署目标是 Linux + redroid：Web 后端常驻后台，到点执行 `docker start redroid`，等待 ADB 就绪后运行指定 profile，任务结束后执行 `docker stop redroid`。

截图:
<img width="1709" height="988" alt="image" src="https://github.com/user-attachments/assets/622c2d58-50c8-435e-b7f0-5f676d67572d" />


## 运行条件

- Python 3.11+
- 可用的 MAA Linux 目录，包含 `libMaaCore.so`、`resource/`、`Python/`
- 可用的 redroid 容器，默认容器名 `redroid`
- 宿主机能执行 `adb`、`docker start redroid`、`docker stop redroid`

## 一键启动

Linux / macOS：

```bash
git clone https://github.com/KlN-4096/MAA-WEB-CONTROL.git
cd MAA-WEB-CONTROL
./run.sh
```

Windows：

```bat
git clone https://github.com/KlN-4096/MAA-WEB-CONTROL.git
cd MAA-WEB-CONTROL
run.bat
```

`run.sh` 和 `run.bat` 会自动创建 `.venv`、安装项目依赖并启动 Web 服务。默认监听 `0.0.0.0:8000`，可用环境变量覆盖：

```bash
MAA_WEB_HOST=127.0.0.1 MAA_WEB_PORT=8765 ./run.sh
```

```bat
set MAA_WEB_HOST=127.0.0.1
set MAA_WEB_PORT=8765
run.bat
```

访问：

```text
http://<server-ip>:8000
```

## 后台启动

Linux 服务器后台启动：

```bash
cd /home/klnon/MAA-WEB-CONTROL
mkdir -p data/runtime
nohup ./run.sh >> data/runtime/maa-web-control.log 2>&1 &
echo $! > data/runtime/maa-web-control.pid
```

停止：

```bash
cd /home/klnon/MAA-WEB-CONTROL
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

## 本地开发

```bash
MAA_WEB_HOST=127.0.0.1 MAA_WEB_PORT=8765 ./run.sh
```

未配置 Official 适配器时会使用 dry-run，不会实际操作 MAA/ADB。

## 测试

```bash
.venv/bin/python -m pip install -e ".[test]"
.venv/bin/python -m unittest discover -s tests
```

## 许可证

本项目以 [GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`) 开源。

本项目不是 MaaAssistantArknights 官方项目。MAA / MaaCore / MaaAssistantArknights 由 Maa Team and contributors 维护，并以 `AGPL-3.0-only` 发布；本项目运行时需要用户自行提供 MAA Core、resource 和 Python wrapper。

## 聊聊其他

这个项目是为了我能在Linux上也能享受到windows一样的MAA服务而开发的,为了一周不上线,纯让MAA来收菜.项目基本能进行日常的收菜了,但肯定还有非常多BUG,还有非常多的功能未接入(比如说自动战斗等,甚至肉鸽,生息这些非高频使用的功能我都没进行测试),小工具,设置页面也有很大一块没有正式接入.

项目源代码是我+codex+claude code共同vibe coding出来的,欢迎贡献

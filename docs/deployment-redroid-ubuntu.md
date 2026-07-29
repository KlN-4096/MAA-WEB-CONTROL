# Ubuntu 后台 + redroid + 一键长草 静默运行手册

本文档描述如何把 `maa-web-control` 部署在 Ubuntu 服务器后台，配合 Docker
里的 redroid 容器实现「定时启动模拟器 → 跑长草 → 关掉模拟器 → 静默
等待下一轮」的完整自动化闭环。

适用版本：`maa-web-control` ≥ 2026-07-29（含 `PostAction.run_command`、真实
`/api/redroid/status`、`/api/adb/detect` 与识别结果持久化）。

## 总体链路

```
systemd: maa-web-control.service (uvicorn FastAPI)
   │
   │ 定时器到点
   ▼
emulator_launch.command:  docker start redroid && sleep 5
   │ wait_seconds 内等待 redroid 启动
   ▼
ADB 连接 127.0.0.1:5555  →  MaaCore 跑 profile（一键长草）
   │
   ▼
PostAction.type = run_command
PostAction.command  = docker stop redroid
   │
   ▼
NotificationService.dispatch_run_event("complete", …)
   │  POST 到 webhook（Server酱 / Discord / 自建）
   ▼
进程继续静默，等下一个 TimerSlot
```

## 一、redroid 容器

```bash
# 拉镜像（按宿主架构选合适标签）
docker pull redroid/redroid:11.0.0-latest

# 创建容器（仅创建一次；以后用 start/stop）
docker create \
  --name redroid \
  --privileged \
  --memory 4g \
  --cpus 2 \
  -p 5555:5555 \
  redroid/redroid:11.0.0-latest \
  androidboot.redroid_width=1280 \
  androidboot.redroid_height=720 \
  androidboot.redroid_dpi=240
```

启动后用 `adb devices` 确认 `127.0.0.1:5555  device`。redroid 默认带
ADB；不需要再装额外组件。

## 二、安装 maa-web-control

```bash
git clone <你的仓库> /opt/maa-web-control
cd /opt/maa-web-control
python3 -m venv .venv
. .venv/bin/activate
pip install -e .
```

确认 `data/` 目录可写。运行期会在这里生成：

| 文件/目录 | 内容 |
|---|---|
| `profiles/*.json` | 任务配置；`hidden_builtins` 记录被删除的内置任务 |
| `scheduler.json` | 定时槽位、启动命令、后置动作 |
| `runner_config.json` | 任务超时分钟数 |
| `notifications.json` | Webhook 通知配置 |
| `adapter.json` | 适配器类型与 MaaCore 目录 |
| `userdata_state.json` | 「更新数据」任务的 Daily/Weekly 周期记录 |
| `tools_state.json` | 仓库/干员/公招识别结果 |
| `copilot_upload/` `copilot_cache/` | 上传的作业、神秘代码下载的作业 |

备份时整个 `data/` 拷走即可。

如果要使用 official MaaCore（非 dry-run），需要把 MaaCore 的 Linux 编译
产物（含 `libMaaCore.so`、`resource/`、`Python/`）放到独立目录，例如
`/opt/MAA`，并通过 `/api/adapter` 或环境变量 `MAA_ADAPTER=official`
+ `MAA_CORE_DIR=/opt/MAA` 切换。

## 三、systemd unit

`/etc/systemd/system/maa-web-control.service`

```ini
[Unit]
Description=MAA Web Control
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=maa
Group=maa
WorkingDirectory=/opt/maa-web-control
Environment=MAA_ADAPTER=official
Environment=MAA_CORE_DIR=/opt/MAA
ExecStart=/opt/maa-web-control/.venv/bin/uvicorn app.main:app \
          --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now maa-web-control
sudo journalctl -fu maa-web-control
```

如果要让 `maa` 账户能跑 docker 命令，需把它加进 docker 组：

```bash
sudo usermod -aG docker maa
```

## 四、profile 与 scheduler 配置

打开浏览器访问 `http://<server>:8000`，按以下步骤配置一次：

1. **基建 / profile**
   - 在「任务」列表里依次打开 StartUp / Recruit / Infrast / Fight /
     Mall / Award / Roguelike / UserDataUpdate / CloseDown，并保存为
     一个 profile（默认名 `daily`）。
   - 在 Fight 高级页选好关卡或候选；UserDataUpdate 推荐 `trigger_interval=Daily`。
   - StartUp `start_game_enabled=true`、CloseDown 保留。

2. **连接设置**
   - ADB 地址 `127.0.0.1:5555`；ADB 路径 `adb`。
   - 不确定端口时点「自动检测连接」，它会扫 `adb devices` 并探测常见模拟器端口后回填。
   - 旁边的「检查 redroid 容器」等价于 `docker inspect`，可用来确认容器是否已起。
   - 「连接失败后重启 ADB Server」勾上；如果遇到 ADB 进程僵死可加勾
     「连接失败后强制结束 ADB 进程」。

3. **定时执行**
   - 启用 1 个 slot：例如 `04:00` → profile `daily`、强制启动勾上。
   - 关卡按明日方舟 04:00 日切判断开放日，凌晨跑也不会选错关。
   - 「启动模拟器命令」填：`docker start redroid && sleep 5`，
     等待秒数 `60`（redroid 冷启动通常 30–60s，可按宿主性能调整）。

4. **后置动作（关键）**
   - 选「自定义命令…」，命令填 `docker stop redroid`。
   - 超时填 `60` 秒。
   - 这是把 redroid 真正关掉的唯一方式，比单纯 `exit_emulator` 可靠。
   - 如果同时希望宿主进入睡眠，可改写为 `docker stop redroid && systemctl suspend`，
     超时按需调大。

5. **外部通知**
   - 启用 webhook，URL 填你的 Server酱 / Discord webhook /
     自建接收端；勾选 complete + error + timeout，保存后点「发送测试」
     验证一次。

6. **任务超时**
   - 在「外部通知」section 顶部把「任务超时（分钟）」设为
     90 或你能容忍的值；超时后会调用 stop 并触发 timeout 通知。

完成上述配置后，把浏览器关掉即可——所有状态写在 `data/` 里，systemd
进程会自行 picking 起来。

## 五、最小化验证

```bash
# 触发一次完整链路（不等定时器）
curl -X POST http://localhost:8000/api/profiles/daily/run

# 查看最近事件（一次性快照；实时流是 WebSocket /api/events）
curl http://localhost:8000/api/logs/recent?limit=50

# 查看 redroid 容器状态 / 扫描可用设备
curl http://localhost:8000/api/redroid/status
curl -X POST http://localhost:8000/api/adb/detect
```

预期行为：

- `redroid/status` 在容器停止时返回 `available: false`、message 含
  `stopped`；运行中时 `available: true`、message 含 `running`。
- 任务结束后 `journalctl -u maa-web-control` 里能看到
  `runner.post_action: run_command` 与 webhook 推送日志。
- 容器自动从 `running` 切回 `exited`。

## 六、常见问题

| 问题 | 排查 |
|---|---|
| ADB 连不上 redroid | 确认 `docker port redroid` 含 `5555/tcp`；宿主防火墙放通；首次连接需 `adb connect 127.0.0.1:5555`。可勾选「连接失败后重启 ADB Server」让 runner 自动 `kill-server` 重试。 |
| `docker stop` 报权限拒绝 | `maa` 用户未加入 `docker` 组；或 systemd unit 用了不同 user。 |
| webhook 发不出去 | 设置页「发送测试」直接看响应；服务器若需代理，请把代理写进自定义 Header 或宿主层 `HTTPS_PROXY`。 |
| redroid 启动慢 | 把 `wait_seconds` 调大，或在 emulator_launch.command 里加 `until adb -s 127.0.0.1:5555 wait-for-device; do sleep 2; done`。 |
| 想让任务跑完后顺便备份 | 把 `command` 写成多条命令组合：`docker stop redroid && rsync -a /opt/maa-web-control/data/ /backup/`。 |
| 升级后界面还是旧的 | 后端已对静态资源发 `Cache-Control: no-cache`，正常刷新即可；若仍是旧版按 Ctrl+F5。 |
| 日志里出现「MaaCore 拒绝了任务 X」 | 该任务的参数组合被 MaaCore 校验拒绝（以前会静默跳过）。按提示检查这条任务的配置，肉鸽策略/主题不匹配是最常见原因。 |

## 七、回滚

只想停掉自动化：

```bash
sudo systemctl disable --now maa-web-control
docker stop redroid
```

`data/` 目录保留所有用户配置；后续重新启用 service 即可恢复。

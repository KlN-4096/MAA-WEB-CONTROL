from __future__ import annotations

import asyncio
import platform
import subprocess
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime
from inspect import isawaitable
from pathlib import Path
from typing import Any, Awaitable, Callable, Protocol

from .events import EventBus
from .execution_ledger import ExecutionLedger, profile_identity
from .inventory import inventory_context, stock_with_dual_chips
from .resource_paths import resolve_maa_root
from .logs import MaaLogService
from .mapper import TaskMappingError, profile_to_append_calls
from .models import AppendCall, EventRecord, PostAction, Profile, RunnerStatus


RunEventCallback = Callable[[str, dict[str, Any]], Awaitable[None]]
CommandRunner = Callable[[str, int], Any]
SleepRunner = Callable[[float], Any]
STARTUP_RETRY_PARAM_KEYS = {
    "startup_retry_times",
    "startup_retry_command_a",
    "startup_retry_wait_a_seconds",
    "startup_retry_command_b",
    "startup_retry_wait_b_seconds",
}
STARTUP_RETRY_COMMAND_TIMEOUT_SECONDS = 60
STARTUP_RETRY_MAX_ATTEMPTS = 10


@dataclass(frozen=True)
class StartupRetryConfig:
    attempts: int = 1
    command_a: str = ""
    wait_a_seconds: int = 60
    command_b: str = ""
    wait_b_seconds: int = 60


class MaaAdapter(Protocol):
    @property
    def task_chain_status(self) -> str | None: ...

    @property
    def is_connected(self) -> bool: ...

    async def connect(self, profile: Profile) -> bool: ...

    async def append_task(self, call: AppendCall) -> int: ...

    async def start(self, wait: bool = True) -> bool: ...

    async def stop(self) -> bool: ...


class DryRunMaaAdapter:
    def __init__(self) -> None:
        self._connected = False

    @property
    def task_chain_status(self) -> str | None:
        return "Completed"

    @property
    def is_connected(self) -> bool:
        return self._connected

    async def connect(self, profile: Profile) -> bool:
        await asyncio.sleep(0.05)
        self._connected = True
        return True

    async def append_task(self, call: AppendCall) -> int:
        await asyncio.sleep(0.02)
        return abs(hash((call.task_id, call.type))) % 100000 + 1

    async def start(self, wait: bool = True) -> bool:
        await asyncio.sleep(0.1)
        return True

    async def stop(self) -> bool:
        await asyncio.sleep(0.02)
        return True


class MaaRunnerService:
    def __init__(
        self,
        adapter: MaaAdapter,
        events: EventBus,
        log_service: MaaLogService | None = None,
        *,
        userdata_state_path: Path | None = None,
        run_event_callback: RunEventCallback | None = None,
        task_timeout_minutes: int = 0,
        command_runner: CommandRunner | None = None,
        sleep: SleepRunner | None = None,
        ledger: ExecutionLedger | None = None,
    ) -> None:
        self._adapter = adapter
        self._events = events
        self._logs = log_service or MaaLogService(events)
        self._status = RunnerStatus()
        self._profile: Profile | None = None
        self._task: asyncio.Task[None] | None = None
        self._stop_requested = False
        self._post_action: PostAction = PostAction()
        self._userdata_state_path = userdata_state_path
        self._run_event_callback = run_event_callback
        self._task_timeout_minutes = max(0, int(task_timeout_minutes))
        self._timed_out = False
        self._command_runner = command_runner
        self._sleep = sleep or asyncio.sleep
        self.ledger = ledger if ledger is not None and ledger.available else None
        self._verified_identity: str | None = None
        self._external_reserved = False
        self._external_task: asyncio.Task[None] | None = None

    def set_run_event_callback(self, callback: RunEventCallback | None) -> None:
        self._run_event_callback = callback

    def set_task_timeout_minutes(self, minutes: int) -> None:
        self._task_timeout_minutes = max(0, int(minutes))

    @property
    def task_timeout_minutes(self) -> int:
        return self._task_timeout_minutes

    def status(self) -> RunnerStatus:
        return self._status.model_copy()

    def profile(self) -> Profile | None:
        return self._profile.model_copy(deep=True) if self._profile is not None else None

    @property
    def log_service(self) -> MaaLogService:
        return self._logs

    @property
    def adapter(self) -> MaaAdapter:
        return self._adapter

    @property
    def events(self) -> EventBus:
        return self._events

    def set_adapter(self, adapter: MaaAdapter) -> None:
        if self.is_running():
            raise RuntimeError("Cannot change adapter while a run is in progress.")
        self._adapter = adapter
        self._verified_identity = None

    @property
    def post_action(self) -> PostAction:
        return self._post_action.model_copy()

    def set_post_action(self, action: PostAction) -> PostAction:
        self._post_action = action.model_copy()
        return self.post_action

    async def run(self, profile: Profile, *, context_profile: Profile | None = None) -> RunnerStatus:
        if self.is_running():
            raise RuntimeError("Runner is busy.")
        self._stop_requested = False
        self._timed_out = False
        self._profile = (context_profile or profile).model_copy(deep=True)
        self._status = RunnerStatus(state="Connecting", current_profile=profile.name)
        self._logs.clear()
        self._logs.append(_build_resource_log(), color_key="TraceLogBrush")
        self._task = asyncio.create_task(self._run_profile(profile))
        return self.status()

    def is_running(self) -> bool:
        return self._external_reserved or (self._task is not None and not self._task.done())

    async def wait_for_completion(self) -> RunnerStatus:
        status = self._status
        task = self._external_task if self._external_reserved else self._task
        if task:
            await asyncio.shield(task)
        return status.model_copy()

    async def capture_image(self, profile: Profile) -> bytes | None:
        getter = getattr(self._adapter, "capture_image", None)
        if getter is None:
            raise RuntimeError("当前适配器不支持截图")
        target = (profile.adb.adb_path, profile.adb.address, profile.adb.client_type)
        matched = self._adapter.is_connected and getattr(self._adapter, "connection_target", None) == target
        if self.is_running():
            if not matched:
                raise RuntimeError("当前运行连接与远控配置不同或尚未连接，无法截图")
            return await getter()
        self._external_reserved = True
        try:
            if not matched:
                await self._connect(profile)
            return await getter()
        finally:
            self._external_reserved = False

    async def run_external(self, profile: Profile | None, call: AppendCall) -> dict[str, Any]:
        # 在首次 await 之前占用，同样保护连接/追加期间，不能只检查 Core.running。
        if self.is_running():
            raise RuntimeError("已有任务正在运行，请先停止。")
        if profile is None and not self._adapter.is_connected:
            raise RuntimeError("没有可用的配置，无法连接模拟器。")
        self._external_reserved = True
        self._stop_requested = False
        self._profile = profile.model_copy(deep=True) if profile else None
        self._status = RunnerStatus(state="Connecting", current_profile=profile.name if profile else None, current_task=call.task_id, total_tasks=1)
        started: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._external_task = asyncio.create_task(self._run_external(profile, call, started))
        try:
            return await asyncio.shield(started)
        except asyncio.CancelledError:
            self._stop_requested = True
            await asyncio.shield(self._external_task)
            if started.done() and not started.cancelled():
                started.exception()
            raise

    async def _run_external(self, profile: Profile | None, call: AppendCall, started: asyncio.Future[dict[str, Any]]) -> None:
        ledger_active = self.ledger is not None and profile is not None
        try:
            if ledger_active:
                self.ledger.begin(profile, account_verified=self._verified_identity == profile_identity(profile))
            if profile is not None:
                await self._connect(profile)
            if self._stop_requested:
                raise RunStopped("任务已停止。")
            task_id = await self._append_call(call)
            if self._stop_requested:
                raise RunStopped("任务已停止。")
            if not await self._adapter.start(wait=False):
                raise RuntimeError("MaaCore start failed.")
            if self._stop_requested:
                raise RunStopped("任务已停止。")
            self._status.state = "Running"
            self._status.appended_tasks = 1
            started.set_result({"ok": True, "task_id": task_id})
            wait_idle = getattr(self._adapter, "wait_until_idle", None)
            if wait_idle:
                await wait_idle()
            else:
                await asyncio.sleep(0)
            if ledger_active:
                self.ledger.check()
            status = "Stopped" if self._stop_requested else self._adapter.task_chain_status
            if status is None:
                raise RuntimeError("未收到核心任务结束状态。")
            self._status.state = status
            self._status.current_task = None
            self._events.publish(EventRecord.now("tool.finished", status))
        except (RuntimeError, ValueError, OSError) as exc:
            try:
                await self._adapter.stop()
            except (RuntimeError, OSError) as stop_exc:
                self._events.publish(EventRecord.now("runner.stop_failed", str(stop_exc), level="error"))
            self._stop(str(exc)) if isinstance(exc, RunStopped) else self._fail(str(exc))
            if not started.done():
                started.set_exception(exc)
        finally:
            if ledger_active:
                self._verified_identity = profile_identity(profile) if self.ledger.account_verified else None
                self.ledger.end()
            self._external_reserved = False

    async def stop(self) -> RunnerStatus:
        # 小工具 / 自动战斗直接驱动 adapter，没有 _run_profile 协程会把 Stopping 改回来；
        # 此时置状态会让「一键长草」永久变成忙碌态。
        running = self.is_running()
        if running:
            self._stop_requested = True
            self._status.state = "Stopping"
        self._logs.append("正在停止……", color_key="WarningLogBrush", split_mode="Before")
        self._events.publish(EventRecord.now("runner.stopping", "Stop requested."))
        await self._adapter.stop()
        return self.status()

    async def shutdown(self) -> None:
        if self._external_reserved:
            await self.stop()
            if self._external_task:
                await self._external_task
        task = self._task
        if task is None or task.done():
            return
        if self._status.state != "Stopping":
            await self.stop()
        with suppress(Exception):
            await task

    async def _run_profile(self, profile: Profile) -> None:
        try:
            if self.ledger:
                context = self._profile or profile
                self.ledger.begin(context, account_verified=self._verified_identity == profile_identity(context))
            calls = profile_to_append_calls(profile, state_path=None if self.ledger else self._userdata_state_path)
            await self._fire_run_event("start", "任务即将开始。")
            await self._connect(profile)
            if self._task_timeout_minutes > 0:
                try:
                    await asyncio.wait_for(
                        self._run_calls_and_finish(profile, calls),
                        timeout=self._task_timeout_minutes * 60,
                    )
                except asyncio.TimeoutError:
                    self._timed_out = True
                    await self._handle_timeout()
            else:
                await self._run_calls_and_finish(profile, calls)
        except RunStopped as exc:
            try:
                await self._adapter.stop()
            except (RuntimeError, OSError) as stop_exc:
                self._events.publish(EventRecord.now("runner.stop_failed", str(stop_exc), level="error"))
            self._stop(str(exc))
            await self._fire_run_event("stopped", str(exc))
        except (RuntimeError, ValueError, OSError) as exc:
            try:
                await self._adapter.stop()
            except (RuntimeError, OSError) as stop_exc:
                self._events.publish(EventRecord.now("runner.stop_failed", str(stop_exc), level="error"))
            self._fail(str(exc))
            await self._fire_run_event("error", str(exc))
        finally:
            if self.ledger:
                self._verified_identity = profile_identity(self._profile) if self.ledger.account_verified and self._profile else None
                self.ledger.end()
            await self._execute_post_action()

    async def _run_calls_and_finish(self, profile: Profile, calls: list[AppendCall]) -> None:
        if not calls:
            raise RunStopped("No enabled tasks selected.")
        startup, startup_retry, remaining = self._split_startup_retry_calls(calls)
        if startup is not None:
            await self._run_startup_with_retry(profile, startup, startup_retry)
            if remaining:
                await self._connect(profile)
            else:
                await self._finish_from_status(self._adapter.task_chain_status or "Failed")
                return
        if self.ledger:
            await self._run_tracked_calls(profile, remaining)
            return
        if any(call.type == "DepotMaintain" for call in remaining):
            raise RuntimeError("库存保持需要启用执行记录服务。")
        await self._append_tasks(remaining)
        if not remaining:
            await self._finish_from_status(self._adapter.task_chain_status or "Completed")
            return
        await self._start_and_finish()

    async def _run_tracked_calls(self, profile: Profile, calls: list[AppendCall]) -> None:
        assert self.ledger is not None
        userdata = {t.id: t for t in profile.tasks if t.enabled and t.type == "UserDataUpdate"}
        batch: list[AppendCall] = []
        userdata_sources: set[str] = set()
        async def flush() -> None:
            if not batch:
                return
            status = await self._run_batch(batch)
            batch.clear()
            for source in userdata_sources:
                expected = [call.task_id for call in calls if call.task_id in {f"{source}:depot", f"{source}:operbox"}]
                if expected and all(self.ledger.task_succeeded(task_id) for task_id in expected):
                    self.ledger.mark_userdata(source)
            userdata_sources.clear()
            if status != "Completed":
                raise RuntimeError("任务队列执行失败，未启动后续动态任务。")

        for call in calls:
            if self._stop_requested:
                raise RunStopped("Run stopped.")
            source = next((key for key in userdata if call.task_id in {f"{key}:depot", f"{key}:operbox"}), None)
            if source:
                interval = str(userdata[source].params.get("trigger_interval", "EveryTime"))
                if not self.ledger.userdata_due(source, interval):
                    continue
            if call.type == "DepotMaintain":
                await flush()
                await self._maintain_inventory(call)
                continue
            if call.type == "Mall":
                # 重复的每日任务需要先消费此前同类的成功回调，再应用每日限次。
                if any(previous.type == "Mall" for previous in batch):
                    await flush()
            batch.append(self.ledger.prepare(call))
            if source:
                userdata_sources.add(source)
        await flush()
        await self._finish_from_status("Completed")

    async def _run_segment(self, call: AppendCall) -> str:
        return await self._run_batch([call])

    async def _run_batch(self, calls: list[AppendCall]) -> str:
        if self._stop_requested:
            raise RunStopped("Run stopped.")
        await self._append_tasks(calls)
        self._status.state = "Running"
        if not await self._adapter.start():
            raise RuntimeError("MaaCore start failed.")
        if self._stop_requested or self._adapter.task_chain_status == "Stopped":
            raise RunStopped("Run stopped.")
        if self.ledger:
            self.ledger.check()
        status = self._adapter.task_chain_status
        if status is None:
            raise RuntimeError("未收到核心任务结束状态。")
        return status

    async def _maintain_inventory(self, call: AppendCall) -> None:
        assert self.ledger is not None
        assert self._profile is not None
        params = call.params
        context = await asyncio.to_thread(inventory_context, resolve_maa_root(adapter=self._adapter), self._profile.adb.client_type)
        if (params["skip_during_activity"] and context["activity_open"]) or (params["skip_during_resource_collection"] and context["resource_open"]):
            self._logs.append("当前活动满足跳过条件，跳过库存保持。")
            return
        if params["update_depot"]:
            status = await self._run_segment(AppendCall(task_id=f"{call.task_id}:depot", type="Depot", params={}))
            if status != "Completed":
                raise RuntimeError("仓库识别失败，未执行库存保持。")
        def stock(item_id: str) -> int:
            return stock_with_dual_chips(item_id, self.ledger.inventory(), context["items"], params["count_dual_chips"])
        rows = list(enumerate(params["targets"]))
        if params["sort_by_progress"]:
            rows.sort(key=lambda item: stock(item[1]["item_id"]) / item[1]["quantity"])
        for index, row in rows:
            if row["stage"] in context["known_stages"] and row["stage"] not in context["open_stages"]:
                self._logs.append(f"今日关卡未开放，跳过库存目标：{row['stage']}", color_key="WarningLogBrush")
                continue
            current = stock(row["item_id"])
            deficit = row["quantity"] - current
            if deficit <= 0:
                self._logs.append(f"库存已达标：{row['item_id']} ({current}/{row['quantity']})")
                continue
            self._logs.append(f"库存保持：{row['item_id']} 还需 {deficit}，关卡 {row['stage']}")
            status = await self._run_segment(AppendCall(
                task_id=f"{call.task_id}:fight-{index}", type="Fight",
                params={"stage": row["stage"], "drops": {row["item_id"]: deficit},
                        "times": params["max_times"],
                        "medicine": row["medicine"] if params["use_medicine"] and row["use_medicine"] else 0,
                        "stone": row["stone"] if params["use_stone"] and row["use_stone"] else 0,
                        "medicine_expire_days": 2 if params["use_expiring_medicine"] else 0,
                        "series": 0 if params["use_auto_series"] else 1},
            ))
            if status != "Completed":
                raise RuntimeError("库存保持作战失败，已停止后续目标。")
            after = stock(row["item_id"])
            if after < row["quantity"]:
                self._logs.append(f"库存尚未达标：{row['item_id']} ({after}/{row['quantity']})；理智/场次不足或未识别掉落。", color_key="WarningLogBrush")
            if params["only_first"]:
                return

    async def _handle_timeout(self) -> None:
        message = f"任务执行超过 {self._task_timeout_minutes} 分钟，自动停止。"
        try:
            await self._adapter.stop()
        except Exception:
            pass
        self._fail(message)
        self._events.publish(EventRecord.now("runner.timeout", message, level="error"))
        await self._fire_run_event("timeout", message)

    async def _connect(self, profile: Profile) -> None:
        self._logs.append("正在连接模拟器……", color_key="MessageLogBrush")
        self._events.publish(EventRecord.now("runner.connecting", "Connecting to emulator."))
        if not await self._adapter.connect(profile):
            raise RuntimeError("MaaCore connect failed.")

    async def _append_tasks(self, calls: list[AppendCall]) -> None:
        if not calls:
            return
        self._status.state = "AppendingTasks"
        self._status.total_tasks = self._status.appended_tasks + len(calls) if self.ledger else len(calls)
        self._events.publish(EventRecord.now("runner.appending", f"Appending {len(calls)} tasks."))
        for call in calls:
            if self._stop_requested:
                raise RunStopped("Run stopped before start.")
            self._status.current_task = call.task_id
            task_id = await self._append_call(call)
            self._status.appended_tasks += 1
            detail = {"task_id": call.task_id, "maa_task_id": task_id, "type": call.type}
            self._events.publish(EventRecord.now("task.appended", f"Appended {call.type}.", detail=detail))

    async def _append_call(self, call: AppendCall) -> int:
        target = call
        if call.type == "StartUp":
            target = call.model_copy(deep=True)
            target.params = _strip_startup_retry_params(target.params)
        core_id = await self._adapter.append_task(target)
        if self._stop_requested:
            raise RunStopped("任务已停止，未启动刚追加的任务。")
        if core_id <= 0:
            raise RuntimeError(f"MaaCore append failed: {target.type}")
        if self.ledger and self._profile is not None:
            self.ledger.bind(core_id, target)
        return core_id

    async def _start_and_finish(self) -> None:
        self._status.state = "Running"
        self._logs.append("正在运行中……", color_key="MessageLogBrush")
        self._events.publish(EventRecord.now("runner.running", "MaaCore start requested."))
        if not await self._adapter.start():
            raise RuntimeError("MaaCore start failed.")
        if self._stop_requested:
            self._stop("Run stopped.")
            await self._fire_run_event("stopped", "Run stopped.")
            return
        await self._finish_from_status(self._adapter.task_chain_status or "Completed")

    def _split_startup_retry_calls(
        self,
        calls: list[AppendCall],
    ) -> tuple[AppendCall | None, StartupRetryConfig, list[AppendCall]]:
        if not calls or calls[0].type != "StartUp":
            return None, StartupRetryConfig(), calls
        cfg = _startup_retry_config(calls[0])
        if cfg.attempts <= 1:
            return None, StartupRetryConfig(), calls
        startup = calls[0].model_copy(deep=True)
        startup.params = _strip_startup_retry_params(startup.params)
        return startup, cfg, calls[1:]

    async def _run_startup_with_retry(self, profile: Profile, startup: AppendCall, cfg: StartupRetryConfig) -> None:
        for attempt in range(1, cfg.attempts + 1):
            if self._stop_requested:
                raise RunStopped("Run stopped before start.")
            status = await self._run_single_startup(startup, attempt, cfg.attempts)
            if status != "Failed":
                return
            if attempt >= cfg.attempts:
                self._events.publish(EventRecord.now(
                    "runner.startup_retry.exhausted",
                    "StartUp retry attempts exhausted; continuing remaining tasks.",
                    level="warning",
                    detail={"attempts": cfg.attempts},
                ))
                self._logs.append("开始唤醒重试次数已用完，继续后续任务。", color_key="WarningLogBrush")
                return
            await self._run_startup_recovery(profile, cfg, attempt)

    async def _run_single_startup(self, call: AppendCall, attempt: int, attempts: int) -> str:
        self._status.state = "AppendingTasks"
        self._status.total_tasks = max(self._status.total_tasks, 1)
        self._status.current_task = call.task_id
        task_id = await self._append_call(call)
        self._status.appended_tasks += 1
        self._events.publish(EventRecord.now(
            "task.appended",
            f"Appended {call.type}.",
            detail={"task_id": call.task_id, "maa_task_id": task_id, "type": call.type},
        ))
        self._status.state = "Running"
        self._logs.append(f"开始唤醒尝试 {attempt}/{attempts}……", color_key="MessageLogBrush", split_mode="Before")
        self._events.publish(EventRecord.now(
            "runner.startup_retry.attempt",
            f"StartUp attempt {attempt}/{attempts}.",
            detail={"attempt": attempt, "attempts": attempts},
        ))
        if not await self._adapter.start():
            raise RuntimeError("MaaCore start failed.")
        return self._adapter.task_chain_status or "Completed"

    async def _run_startup_recovery(self, profile: Profile, cfg: StartupRetryConfig, attempt: int) -> None:
        self._events.publish(EventRecord.now(
            "runner.startup_retry.recovery",
            f"StartUp failed; running recovery before attempt {attempt + 1}.",
            level="warning",
            detail={"attempt": attempt, "next_attempt": attempt + 1},
        ))
        self._logs.append("开始唤醒失败，执行恢复命令后重试。", color_key="WarningLogBrush", split_mode="Both")
        await self._run_retry_command("A", cfg.command_a)
        await self._wait_retry_interval("A", cfg.wait_a_seconds)
        await self._run_retry_command("B", cfg.command_b)
        await self._wait_retry_interval("B", cfg.wait_b_seconds)
        await self._connect(profile)

    async def _run_retry_command(self, label: str, command: str) -> None:
        command = (command or "").strip()
        if not command:
            return
        self._logs.append(f"开始唤醒恢复命令 {label}: {command}", color_key="WarningLogBrush")
        try:
            await self._execute_shell_command(command, STARTUP_RETRY_COMMAND_TIMEOUT_SECONDS)
        except Exception as exc:
            self._events.publish(EventRecord.now(
                "runner.startup_retry.command_error",
                f"StartUp recovery command {label} failed: {exc}",
                level="error",
                detail={"label": label, "command": command},
            ))
            self._logs.append(f"开始唤醒恢复命令 {label} 失败: {exc}", color_key="ErrorLogBrush")

    async def _wait_retry_interval(self, label: str, seconds: int) -> None:
        wait = max(0, int(seconds or 0))
        if wait <= 0:
            return
        self._events.publish(EventRecord.now(
            "runner.startup_retry.waiting",
            f"Waiting {wait}s after StartUp recovery command {label}.",
            detail={"label": label, "seconds": wait},
        ))
        self._logs.append(f"开始唤醒恢复等待 {label}: {wait}s", color_key="WarningLogBrush")
        result = self._sleep(wait)
        if isawaitable(result):
            await result

    async def _finish_from_status(self, final_status: str) -> None:
        if final_status == "Failed":
            self._fail("MaaCore task chain failed.")
            await self._fire_run_event("error", "MaaCore task chain failed.")
            return
        if final_status == "Stopped":
            self._stop("MaaCore task chain stopped.")
            await self._fire_run_event("stopped", "MaaCore task chain stopped.")
            return
        self._status.state = "Completed"
        self._status.current_task = None
        self._logs.complete_run(f"任务已全部完成！\n(用时 {self._logs.elapsed_text()})")
        self._events.publish(EventRecord.now("runner.completed", "Run completed."))
        await self._fire_run_event("complete", "Run completed.")

    def _stop(self, message: str) -> None:
        self._status.state = "Stopped"
        self._status.current_task = None
        if not self._logs.has_last_content_prefix("已停止"):
            self._logs.append("已停止", color_key="WarningLogBrush", split_mode="After")
        self._events.publish(EventRecord.now("runner.stopped", message, detail={"stopped": True}))

    def _fail(self, message: str) -> None:
        self._status.state = "Failed"
        self._status.last_error = message
        if not self._logs.has_last_content_prefix("任务出错"):
            self._logs.append(f"任务出错: {message}", color_key="ErrorLogBrush", weight="Bold", split_mode="Both")
        self._events.publish(EventRecord.now("runner.failed", message, level="error"))

    async def _fire_run_event(self, event_type: str, message: str) -> None:
        callback = self._run_event_callback
        if callback is None:
            return
        payload = {
            "profile": self._profile.name if self._profile else None,
            "message": message,
            "state": self._status.state,
            "total_tasks": self._status.total_tasks,
            "appended_tasks": self._status.appended_tasks,
            "current_task": self._status.current_task,
            "last_error": self._status.last_error,
        }
        try:
            await callback(event_type, payload)
        except Exception as exc:
            self._events.publish(
                EventRecord.now(
                    "runner.notification.error",
                    f"Notification callback failed: {exc}",
                    level="error",
                )
            )


    async def _execute_post_action(self) -> None:
        action = self._post_action
        if action.type == "none":
            return
        self._events.publish(EventRecord.now(
            "runner.post_action",
            f"Executing post-action: {action.type}",
            detail={"action": action.type},
        ))
        try:
            if action.type == "exit_game":
                await self._adapter.stop()
            elif action.type == "exit_emulator":
                await self._adapter.stop()
                self._logs.append("后置动作: 已请求关闭模拟器（通过 ADB stop）", color_key="WarningLogBrush")
            elif action.type == "shutdown":
                await self._run_power_action("shutdown")
            elif action.type == "sleep":
                await self._run_power_action("sleep")
            elif action.type == "hibernate":
                await self._run_power_action("hibernate")
            elif action.type == "run_command":
                await self._run_post_command(action.command, action.command_timeout_seconds)
        except Exception as exc:
            self._events.publish(EventRecord.now(
                "runner.post_action.error",
                f"Post-action failed: {exc}",
                level="error",
            ))

    async def _run_post_command(self, command: str, timeout_seconds: int) -> None:
        command = (command or "").strip()
        if not command:
            self._logs.append("后置动作: 自定义命令为空，已跳过", color_key="WarningLogBrush")
            return
        timeout = max(1, int(timeout_seconds or 60))
        self._logs.append(f"后置动作: 执行自定义命令 → {command}", color_key="WarningLogBrush")
        await self._execute_shell_command(command, timeout)

    async def _execute_shell_command(self, command: str, timeout: int) -> None:
        if self._command_runner is not None:
            result = self._command_runner(command, timeout)
            if isawaitable(result):
                await result
            return
        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            except asyncio.TimeoutError:
                proc.kill()
                with suppress(Exception):
                    await proc.wait()
                raise RuntimeError(f"自定义命令超时（>{timeout}s）")
        except FileNotFoundError as exc:
            raise RuntimeError(f"自定义命令找不到可执行：{exc}") from exc
        stdout = stdout_b.decode("utf-8", errors="replace").strip() if stdout_b else ""
        stderr = stderr_b.decode("utf-8", errors="replace").strip() if stderr_b else ""
        rc = proc.returncode or 0
        if stdout:
            self._logs.append(f"  ↳ stdout: {stdout[:512]}", color_key="MessageLogBrush")
        if stderr:
            self._logs.append(f"  ↳ stderr: {stderr[:512]}", color_key="ErrorLogBrush" if rc else "TraceLogBrush")
        if rc != 0:
            raise RuntimeError(f"自定义命令退出码 {rc}")

    async def _run_power_action(self, action: str) -> None:
        system = platform.system()
        LINUX_COMMANDS = {
            "shutdown": ["shutdown", "-h", "now"],
            "sleep": ["systemctl", "suspend"],
            "hibernate": ["systemctl", "hibernate"],
        }
        WINDOWS_COMMANDS = {
            "shutdown": ["shutdown", "/s", "/t", "0"],
            "sleep": ["rundll32.exe", "powrprof.dll,SetSuspendState", "0", "1", "0"],
            "hibernate": ["shutdown", "/h"],
        }
        if system == "Linux" and action in LINUX_COMMANDS:
            self._logs.append(f"后置动作: {action}…", color_key="WarningLogBrush")
            await asyncio.to_thread(subprocess.Popen, LINUX_COMMANDS[action])
        elif system == "Windows" and action in WINDOWS_COMMANDS:
            self._logs.append(f"后置动作: {action}…", color_key="WarningLogBrush")
            await asyncio.to_thread(subprocess.Popen, WINDOWS_COMMANDS[action])
        else:
            self._logs.append(
                f"后置动作: {action}（当前平台 {system} 暂不支持，请手动执行）",
                color_key="WarningLogBrush",
            )


def _build_resource_log() -> str:
    now = datetime.now()
    stamp = f"{now.year}/{now.month}/{now.day} {now:%H:%M:%S}"
    return f"Build Time:\n{stamp}\nResource Time:\n{stamp}"


def _startup_retry_config(call: AppendCall) -> StartupRetryConfig:
    params = call.params or {}
    attempts = _int_in_range(params.get("startup_retry_times"), 1, STARTUP_RETRY_MAX_ATTEMPTS, 1)
    return StartupRetryConfig(
        attempts=attempts,
        command_a=str(params.get("startup_retry_command_a", "") or ""),
        wait_a_seconds=_int_in_range(params.get("startup_retry_wait_a_seconds"), 0, 3600, 60),
        command_b=str(params.get("startup_retry_command_b", "") or ""),
        wait_b_seconds=_int_in_range(params.get("startup_retry_wait_b_seconds"), 0, 3600, 60),
    )


def _strip_startup_retry_params(params: dict[str, Any]) -> dict[str, Any]:
    stripped = dict(params)
    for key in STARTUP_RETRY_PARAM_KEYS:
        stripped.pop(key, None)
    return stripped


def _int_in_range(value: Any, minimum: int, maximum: int, fallback: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, parsed))


class RunStopped(RuntimeError):
    """Raised when the run should finish as Stopped instead of Failed."""

"""remotion-worker HTTP + WS 客户端（D4）。

worker 契约（remotion-worker/src/server.ts）：
``POST /render {yaml_path, job_id, frames?}`` → 202（accepted + total_frames/fps）
/ 400（spec 校验结构化错误）/ 409（job_id 重复）；WS ``/ws/progress``
广播渲染进度/done/error 事件（全量广播，不按 job 过滤）；产物
``<RENDER_OUT_DIR>/<job_id>.mp4``（默认 ``<repo>/data/videos/renders/``）。

完成判定：WS done 事件为准（远程 worker / 非共享 FS 场景可用）；WS 不可达
（连接失败 / 中途断开 / websockets 未装）自动回落共享 FS 轮询——同机起步
形态不受影响。

监控（7.6 最小落地）：每次渲染结束写一条结构化指标到
``data/videos/render_metrics.jsonl``（job_id/status/duration_ms/worker_url/
frames/error），供 ``GET /api/v1/videos/health/summary`` 聚合。
Remotion 许可：按 g0-gate.md §2 结论，团队 ≤3 人落在免费档；**季度复核
许可资格**已列入监控项（本文件的指标流是复核数据来源之一）。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import json
import logging
from pathlib import Path
import time
from typing import Any, Awaitable, Callable

logger = logging.getLogger(__name__)

DEFAULT_WORKER_URL = "http://localhost:3100"
RENDER_TIMEOUT_S = 1800
POLL_INTERVAL_S = 2.0
# job_id 重复（worker 进程内去重，409）时自动加 -v2… 后缀重试的次数。
JOB_ID_RETRY_MAX = 5
METRICS_FILENAME = "render_metrics.jsonl"

# 渲染事件回调：worker 广播的 JSON 事件（status/progress/error/warning…）
RenderEventCallback = Callable[[dict[str, Any]], Awaitable[None] | None]


@dataclass(frozen=True)
class RenderOutcome:
    ok: bool
    job_id: str = ""
    output_path: str = ""  # worker 侧产物路径（本地共享盘或远程路径）
    error: str = ""
    details: list[dict[str, Any]] = field(default_factory=list)
    total_frames: int = 0
    fps: int = 0
    warnings: list[dict[str, Any]] = field(default_factory=list)
    via: str = ""  # 完成判定通道："ws" | "poll"


def resolve_worker_url(overrides: dict[str, Any] | None = None) -> str:
    """worker 地址解析：overrides ``worker_url`` > settings
    ``integrations.remotion_worker_url``（env REMOTION_WORKER_URL 可覆盖）>
    默认 http://localhost:3100。"""
    overrides = overrides or {}
    direct = str(overrides.get("worker_url") or "").strip().rstrip("/")
    if direct:
        return direct
    try:
        from deeptutor.services.config.runtime_settings import RuntimeSettingsService

        settings = RuntimeSettingsService.get_instance().load_integrations()
        configured = str(settings.get("remotion_worker_url") or "").strip().rstrip("/")
        if configured:
            return configured
    except Exception:
        logger.warning("读取 integrations settings 失败，worker 地址回落默认", exc_info=True)
    return DEFAULT_WORKER_URL


def shared_render_path(videos_root: Path, job_id: str) -> Path:
    """worker 默认产物位置（``data/videos/renders/<job_id>.mp4``，共享目录）。"""
    return videos_root / "renders" / f"{job_id}.mp4"


def ws_progress_url(worker_url: str) -> str:
    """HTTP(S) worker 地址 → WS 进度频道地址。"""
    base = worker_url.rstrip("/")
    if base.startswith("https://"):
        return "wss://" + base[len("https://"):] + "/ws/progress"
    if base.startswith("http://"):
        return "ws://" + base[len("http://"):] + "/ws/progress"
    return f"ws://{base}/ws/progress"


def append_render_metric(
    videos_root: Path,
    *,
    job_id: str,
    status: str,  # "done" | "error"
    duration_ms: int,
    worker_url: str,
    frames: dict[str, int] | None = None,
    error: str = "",
    via: str = "",
) -> None:
    """写一条渲染指标（JSONL 追加；7.6 最小监控落地）。

    Remotion 许可季度复核（g0-gate.md §2）以此流为数据来源之一。
    写入失败只记日志，绝不影响渲染主流程。
    """
    record = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "job_id": job_id,
        "status": status,
        "duration_ms": duration_ms,
        "worker_url": worker_url,
        "frames": frames,
        "via": via,
    }
    if error:
        record["error"] = error[:500]
    try:
        metrics_path = videos_root / METRICS_FILENAME
        metrics_path.parent.mkdir(parents=True, exist_ok=True)
        with open(metrics_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError:
        logger.warning("render metric append failed: %s", job_id, exc_info=True)
    logger.info(
        "render_job job_id=%s status=%s duration_ms=%d via=%s worker=%s%s",
        job_id, status, duration_ms, via or "-", worker_url,
        f" error={error[:200]}" if error else "",
    )


async def _emit(on_event: RenderEventCallback | None, event: dict[str, Any]) -> None:
    if on_event is None:
        return
    result = on_event(event)
    if asyncio.iscoroutine(result):
        await result


async def _await_via_ws(
    *,
    worker_url: str,
    job_id: str,
    videos_root: Path,
    timeout_s: int,
    on_event: RenderEventCallback | None,
) -> RenderOutcome | None:
    """经 WS ``/ws/progress`` 等待渲染完成。

    返回 ``None`` 表示 WS 通道不可用（调用方回落 FS 轮询）；done 事件即
    完成（远程 worker 不依赖共享盘），error 事件即失败。
    """
    try:
        import websockets
    except ImportError:
        return None

    output = shared_render_path(videos_root, job_id)
    try:
        async with websockets.connect(
            ws_progress_url(worker_url),
            ping_interval=20,
            open_timeout=5,
            # worker 是同机/内网服务，显式禁用代理（系统级 SOCKS 代理会
            # 截获 localhost 连接且缺 python-socks 时直接 ImportError）。
            proxy=None,
        ) as ws:
            deadline = asyncio.get_running_loop().time() + timeout_s
            while True:
                remaining = deadline - asyncio.get_running_loop().time()
                if remaining <= 0:
                    return RenderOutcome(
                        ok=False,
                        job_id=job_id,
                        via="ws",
                        error=f"render timeout after {timeout_s}s（worker 侧任务可能仍在进行）",
                    )
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=min(remaining, 30.0))
                except asyncio.TimeoutError:
                    # 心跳窗口：同机场景产物可能已落盘（快进完成判定）
                    if output.is_file():
                        return RenderOutcome(ok=True, job_id=job_id, output_path=str(output), via="ws")
                    continue
                except websockets.ConnectionClosed:
                    return None  # 连接中断：回落轮询
                try:
                    event = json.loads(raw)
                except (TypeError, ValueError):
                    continue
                if not isinstance(event, dict) or event.get("job_id") != job_id:
                    continue  # 全量广播：只认本 job
                await _emit(on_event, event)
                status = event.get("status")
                if status == "done":
                    out = str(event.get("output") or "") or str(output)
                    return RenderOutcome(ok=True, job_id=job_id, output_path=out, via="ws")
                if status == "error":
                    return RenderOutcome(
                        ok=False,
                        job_id=job_id,
                        via="ws",
                        error=str(event.get("error") or "render failed"),
                        details=event.get("details")
                        if isinstance(event.get("details"), list)
                        else [],
                    )
    except (OSError, TimeoutError):
        return None  # 连接失败：回落轮询
    except Exception as exc:  # 其他 WS 层异常（代理/协议栈差异等）：同样降级
        logger.info("WS 进度通道异常，回落共享盘轮询（job %s）: %s", job_id, exc)
        return None


async def _await_via_poll(
    *,
    job_id: str,
    videos_root: Path,
    timeout_s: int,
    poll_interval_s: float,
) -> RenderOutcome:
    """共享 FS 轮询（WS 不可用时的降级通道，同机起步形态）。"""
    output = shared_render_path(videos_root, job_id)
    deadline = asyncio.get_running_loop().time() + timeout_s
    while asyncio.get_running_loop().time() < deadline:
        if output.is_file():
            return RenderOutcome(ok=True, job_id=job_id, output_path=str(output), via="poll")
        await asyncio.sleep(poll_interval_s)
    return RenderOutcome(
        ok=False,
        job_id=job_id,
        via="poll",
        error=f"render timeout after {timeout_s}s（worker 侧任务可能仍在进行）",
    )


async def submit_render(
    *,
    worker_url: str,
    yaml_path: Path,
    job_id: str,
    videos_root: Path,
    timeout_s: int = RENDER_TIMEOUT_S,
    poll_interval_s: float = POLL_INTERVAL_S,
    frames: dict[str, int] | None = None,
    on_event: RenderEventCallback | None = None,
) -> RenderOutcome:
    """提交渲染任务并等待完成。

    409（job_id 在 worker 进程内已存在，如重渲染场景）自动以 ``-v2``…
    后缀重试。完成判定优先 WS done（远程可用），WS 不可用回落共享盘轮询。
    ``frames``（{"start", "end"}）为局部重渲染预留，原样透传给 worker。
    ``on_event`` 接收本 job 的 WS 事件（进度/告警/完成），用于桥接
    StreamBus 进度上报。
    """
    import httpx

    started = time.monotonic()
    base = worker_url.rstrip("/")
    payload_extra = {"frames": frames} if frames else {}
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=5.0)) as client:
        try:
            health = await client.get(f"{base}/health")
            health.raise_for_status()
        except httpx.HTTPError as exc:
            outcome = RenderOutcome(ok=False, error=f"worker unreachable: {exc}")
            append_render_metric(
                videos_root, job_id=job_id, status="error",
                duration_ms=int((time.monotonic() - started) * 1000),
                worker_url=base, frames=frames, error=outcome.error,
            )
            return outcome

        accepted: dict[str, Any] | None = None
        final_job_id = job_id
        for attempt in range(JOB_ID_RETRY_MAX):
            candidate = job_id if attempt == 0 else f"{job_id}-v{attempt + 1}"
            try:
                resp = await client.post(
                    f"{base}/render",
                    json={"job_id": candidate, "yaml_path": str(yaml_path), **payload_extra},
                )
            except httpx.HTTPError as exc:
                outcome = RenderOutcome(ok=False, error=f"render submit failed: {exc}")
                append_render_metric(
                    videos_root, job_id=candidate, status="error",
                    duration_ms=int((time.monotonic() - started) * 1000),
                    worker_url=base, frames=frames, error=outcome.error,
                )
                return outcome
            if resp.status_code == 409:
                continue
            if resp.status_code == 400:
                body = resp.json() if resp.headers.get("content-type", "").startswith(
                    "application/json"
                ) else {}
                details = body.get("details") or []
                outcome = RenderOutcome(
                    ok=False,
                    job_id=candidate,
                    error=str(body.get("error") or "spec validation failed"),
                    details=details if isinstance(details, list) else [],
                )
                append_render_metric(
                    videos_root, job_id=candidate, status="error",
                    duration_ms=int((time.monotonic() - started) * 1000),
                    worker_url=base, frames=frames, error=outcome.error,
                )
                return outcome
            if resp.status_code != 202:
                outcome = RenderOutcome(
                    ok=False, job_id=candidate, error=f"unexpected status {resp.status_code}"
                )
                append_render_metric(
                    videos_root, job_id=candidate, status="error",
                    duration_ms=int((time.monotonic() - started) * 1000),
                    worker_url=base, frames=frames, error=outcome.error,
                )
                return outcome
            accepted = resp.json()
            final_job_id = candidate
            break
        if accepted is None:
            outcome = RenderOutcome(
                ok=False,
                error=f"job_id {job_id!r} 及其 -v2…-v{JOB_ID_RETRY_MAX} 后缀均被 worker 占用",
            )
            append_render_metric(
                videos_root, job_id=job_id, status="error",
                duration_ms=int((time.monotonic() - started) * 1000),
                worker_url=base, frames=frames, error=outcome.error,
            )
            return outcome

    outcome = await _await_via_ws(
        worker_url=base,
        job_id=final_job_id,
        videos_root=videos_root,
        timeout_s=timeout_s,
        on_event=on_event,
    )
    if outcome is None:
        logger.info("WS 进度通道不可用，回落共享盘轮询（job %s）", final_job_id)
        outcome = await _await_via_poll(
            job_id=final_job_id,
            videos_root=videos_root,
            timeout_s=timeout_s,
            poll_interval_s=poll_interval_s,
        )

    if outcome.ok:
        outcome = RenderOutcome(
            ok=True,
            job_id=final_job_id,
            output_path=outcome.output_path,
            total_frames=int(accepted.get("total_frames") or 0),
            fps=int(accepted.get("fps") or 0),
            warnings=accepted.get("warnings") or [],
            via=outcome.via,
        )
    append_render_metric(
        videos_root,
        job_id=final_job_id,
        status="done" if outcome.ok else "error",
        duration_ms=int((time.monotonic() - started) * 1000),
        worker_url=base,
        frames=frames,
        error=outcome.error,
        via=outcome.via,
    )
    return outcome


__all__ = [
    "DEFAULT_WORKER_URL",
    "METRICS_FILENAME",
    "POLL_INTERVAL_S",
    "RENDER_TIMEOUT_S",
    "RenderEventCallback",
    "RenderOutcome",
    "append_render_metric",
    "resolve_worker_url",
    "shared_render_path",
    "submit_render",
    "ws_progress_url",
]

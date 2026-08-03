"""video_compose capability：spec YAML → remotion-worker → mp4。

流程（M2，specs/video-pipeline 的 compose 阶段；也可被单独触发以支持
"改字重渲染"局部迭代）：

1. loading —— 读取 spec（overrides ``spec``/``spec_path``，缺省取最新），
   校验后确定产物目录与 job_id（默认 ``<series_slug>_ep<NN>``，overrides
   ``job_id`` 可指定）；
2. rendering —— ``POST /render {yaml_path, job_id}`` 到 remotion-worker
   （地址：overrides ``worker_url`` > settings
   ``integrations.remotion_worker_url`` > http://localhost:3100），
   WS ``/ws/progress`` 订阅真实进度并桥接 StreamBus（WS 不可用回落共享
   盘轮询），产物复制进 ``<video_dir>/renders/<job_id>.mp4``（D10 布局；
   远程 worker 时产物留在 worker 侧，仅记录路径）。
"""

from __future__ import annotations

import logging
from pathlib import Path
import shutil
from typing import Any

import yaml

from deeptutor.agents._shared.capability_result import emit_capability_result
from deeptutor.capabilities.video.migrations import migrate_spec
from deeptutor.capabilities.video.paths import (
    latest_spec_path,
    resolve_spec_path,
    video_dir_for_spec,
    videos_root,
)
from deeptutor.capabilities.video.validator import format_errors_for_llm, validate_schema
from deeptutor.capabilities.video.worker_client import (
    RENDER_TIMEOUT_S,
    resolve_worker_url,
    submit_render,
)
from deeptutor.core.agentic.usage import UsageTracker
from deeptutor.core.capability_protocol import BaseCapability, CapabilityManifest
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream_bus import StreamBus
from deeptutor.i18n import StatusI18n

logger = logging.getLogger(__name__)


class VideoComposeCapability(BaseCapability):
    manifest = CapabilityManifest(
        name="video_compose",
        description=(
            "Submit a video spec to the remotion-worker render service "
            "(POST /render) and collect the rendered mp4 into the video "
            "artifact directory."
        ),
        stages=["loading", "rendering"],
        tools_used=[],
        cli_aliases=["video_compose", "compose"],
    )

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        from deeptutor.services.llm.config import get_llm_config

        llm_config = get_llm_config()
        usage = UsageTracker(model=getattr(llm_config, "model", None))
        i18n = StatusI18n(self.name, context.language, module="capabilities")
        overrides = context.config_overrides or {}

        # ── Stage 1: 加载 spec ───────────────────────────────────────────
        async with stream.stage("loading", source=self.name):
            try:
                reference = str(overrides.get("spec") or overrides.get("spec_path") or "")
                spec_path = resolve_spec_path(reference) if reference else latest_spec_path()
            except FileNotFoundError as exc:
                await stream.error(str(exc), source=self.name, stage="loading")
                await emit_capability_result(
                    stream, {"response": str(exc), "ok": False}, source=self.name, usage=usage
                )
                return
            data = yaml.safe_load(spec_path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                await stream.error(
                    i18n.t("spec_invalid", "Spec is not a YAML mapping."),
                    source=self.name,
                    stage="loading",
                )
                return
            try:
                data = migrate_spec(data).data
            except ValueError as exc:
                await stream.error(str(exc), source=self.name, stage="loading")
                return
            schema_errors = validate_schema(data)
            if schema_errors:
                rendered = format_errors_for_llm(schema_errors)
                await stream.error(rendered, source=self.name, stage="loading")
                await emit_capability_result(
                    stream,
                    {
                        "response": rendered,
                        "ok": False,
                        "spec_path": str(spec_path),
                        "validation_errors": [e.render() for e in schema_errors],
                    },
                    source=self.name,
                    usage=usage,
                )
                return
            video_dir = video_dir_for_spec(spec_path)
            renders_dir = video_dir / "renders"
            renders_dir.mkdir(parents=True, exist_ok=True)
            job_id = str(overrides.get("job_id") or "").strip() or spec_path.stem
            worker_url = resolve_worker_url(overrides)
            timeout_s = int(overrides.get("timeout_s", 0) or 0) or RENDER_TIMEOUT_S

        # ── Stage 2: 提交渲染并等待产物 ──────────────────────────────────
        async with stream.stage("rendering", source=self.name):
            await stream.thinking(
                i18n.t(
                    "submitting",
                    f"Submitting render job {job_id} to {worker_url}...",
                    job_id=job_id,
                    worker_url=worker_url,
                ),
                source=self.name,
                stage="rendering",
            )

            async def _on_render_event(event: dict[str, Any]) -> None:
                """WS 进度事件 → StreamBus（7.4：前端可见真实渲染进度）。"""
                progress = event.get("progress")
                if event.get("status") == "rendering" and isinstance(progress, (int, float)):
                    await stream.progress(
                        message=i18n.t(
                            "render_progress",
                            "Rendering... {pct}%",
                            pct=int(progress * 100),
                        ),
                        current=int(progress * 100),
                        total=100,
                        source=self.name,
                        stage="rendering",
                    )
                elif event.get("type") == "warning":
                    await stream.progress(
                        message=str(event.get("message") or "render warning"),
                        source=self.name,
                        stage="rendering",
                        metadata={"render_warning": event},
                    )

            outcome = await submit_render(
                worker_url=worker_url,
                yaml_path=spec_path,
                job_id=job_id,
                videos_root=videos_root(),
                timeout_s=timeout_s,
                on_event=_on_render_event,
            )
            if not outcome.ok:
                detail = outcome.error
                if outcome.details:
                    detail += "\n" + "\n".join(
                        f"- {d.get('path', '')}: {d.get('message', '')}"
                        for d in outcome.details[:10]
                        if isinstance(d, dict)
                    )
                await stream.error(detail, source=self.name, stage="rendering")
                await emit_capability_result(
                    stream,
                    {
                        "response": detail,
                        "ok": False,
                        "spec_path": str(spec_path),
                        "job_id": outcome.job_id or job_id,
                        "worker_url": worker_url,
                        "details": outcome.details,
                    },
                    source=self.name,
                    usage=usage,
                )
                return

            render_path = renders_dir / f"{outcome.job_id}.mp4"
            local_output = Path(outcome.output_path)
            if outcome.output_path != str(render_path):
                if local_output.is_file():
                    shutil.copy2(local_output, render_path)
                else:
                    # 远程 worker：产物在 worker 侧，本地只记录路径（7.4 WS done 契约）
                    render_path = local_output
            await stream.progress(
                message=i18n.t(
                    "render_done",
                    f"Render done: {render_path}",
                    path=str(render_path),
                ),
                source=self.name,
                stage="rendering",
            )

        response_md = i18n.t(
            "done",
            (
                f"渲染完成：`{render_path}`\n"
                f"- job_id：{outcome.job_id} · {outcome.total_frames} 帧 @ {outcome.fps}fps"
            ),
            render_path=str(render_path),
            job_id=outcome.job_id,
            total_frames=outcome.total_frames,
            fps=outcome.fps,
        )
        await stream.content(response_md, source=self.name, stage="rendering")
        await emit_capability_result(
            stream,
            {
                "response": response_md,
                "ok": True,
                "spec_path": str(spec_path),
                "video_dir": str(video_dir),
                "render_path": str(render_path),
                "worker_output_path": outcome.output_path,
                "job_id": outcome.job_id,
                "worker_url": worker_url,
                "total_frames": outcome.total_frames,
                "fps": outcome.fps,
                "warnings": outcome.warnings,
            },
            source=self.name,
            usage=usage,
        )


__all__ = ["VideoComposeCapability"]

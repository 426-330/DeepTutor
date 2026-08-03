"""video_pipeline capability：四阶段顺序编排（D7，specs/video-pipeline）。

``video_spec → asset_gen → narration_gen → video_compose``。阶段间不共享
内存状态，只认落盘产物：每阶段以新 capability 实例跑完整 run()，产物
路径经子阶段结果信封取回并写入 ``<video_dir>/pipeline_state.json``
（pipeline_state.py）。断点续跑：已完成且产物仍在盘上的阶段自动跳过；
``start_from`` override 可从任一阶段强制起跑（单阶段独立触发由
各 capability 自身支持）。
"""

from __future__ import annotations

import dataclasses
import logging
from pathlib import Path
from typing import Any

from deeptutor.agents._shared.capability_result import emit_capability_result
from deeptutor.capabilities.video.asset_capability import AssetGenCapability
from deeptutor.capabilities.video.capability import VideoSpecCapability
from deeptutor.capabilities.video.compose_capability import VideoComposeCapability
from deeptutor.capabilities.video.narration_capability import NarrationGenCapability
from deeptutor.capabilities.video.paths import (
    latest_spec_path,
    resolve_spec_path,
    video_dir_for_spec,
)
from deeptutor.capabilities.video.pipeline_state import PIPELINE_STAGES, PipelineState
from deeptutor.core.agentic.usage import UsageTracker
from deeptutor.core.capability_protocol import BaseCapability, CapabilityManifest
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream_bus import StreamBus
from deeptutor.i18n import StatusI18n

logger = logging.getLogger(__name__)

_STAGE_CAPABILITIES = {
    "video_spec": VideoSpecCapability,
    "asset_gen": AssetGenCapability,
    "narration_gen": NarrationGenCapability,
    "video_compose": VideoComposeCapability,
}

# 各阶段结果信封中纳入 pipeline_state.artifacts 的关键产物字段
_STAGE_ARTIFACT_KEYS = {
    "video_spec": ("spec_path", "video_dir"),
    "asset_gen": ("manifest_path", "assets_dir"),
    "narration_gen": ("audio_dir", "audio_files", "align_files"),
    "video_compose": ("render_path", "job_id"),
}


class _ResultCapture:
    """包一层 StreamBus：记录子阶段 emit 的结果信封，其余方法透传。"""

    def __init__(self, bus: StreamBus) -> None:
        self._bus = bus
        self.payloads: list[dict[str, Any]] = []

    def __getattr__(self, name: str) -> Any:
        return getattr(self._bus, name)

    async def result(self, data: dict[str, Any], **kwargs: Any) -> None:
        self.payloads.append(data)
        await self._bus.result(data, **kwargs)


class VideoPipelineCapability(BaseCapability):
    manifest = CapabilityManifest(
        name="video_pipeline",
        description=(
            "End-to-end video generation pipeline: video_spec → asset_gen → "
            "narration_gen → video_compose, with on-disk resume state "
            "(pipeline_state.json) and a start_from override."
        ),
        stages=list(PIPELINE_STAGES),
        tools_used=[],
        cli_aliases=["video_pipeline", "vpipe"],
    )

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        from deeptutor.services.llm.config import get_llm_config

        llm_config = get_llm_config()
        usage = UsageTracker(model=getattr(llm_config, "model", None))
        i18n = StatusI18n(self.name, context.language, module="capabilities")
        overrides = context.config_overrides or {}

        start_from = str(overrides.get("start_from") or "").strip()
        if start_from and start_from not in PIPELINE_STAGES:
            await stream.error(
                i18n.t(
                    "bad_start_from",
                    f"Unknown start_from stage: {start_from}",
                    start_from=start_from,
                ),
                source=self.name,
            )
            return
        start_idx = PIPELINE_STAGES.index(start_from) if start_from else 0

        # 定位既有 spec（断点续跑 / start_from 时必须有；全新一句话出片
        # 则由 video_spec 阶段产出后回填）。
        spec_path = self._resolve_existing_spec(overrides)
        if start_idx > 0 and spec_path is None:
            await stream.error(
                i18n.t(
                    "spec_required",
                    "start_from requires an existing spec (pass spec= or run video_spec first).",
                ),
                source=self.name,
            )
            return
        state = (
            PipelineState.load(video_dir_for_spec(spec_path))
            if spec_path is not None
            else None
        )

        # 项目级技能挂载（6.6）：既有项目 <video_dir>/project.yaml 声明的
        # skills 注入 video_spec 子阶段（overrides 显式 skills 优先）。
        project_skills = self._load_project_skills(spec_path)
        if project_skills and not overrides.get("skills"):
            await stream.progress(
                message=i18n.t(
                    "project_skills",
                    "Project skills: {names}.",
                    names=", ".join(project_skills),
                ),
                source=self.name,
            )

        stage_summaries: dict[str, dict[str, Any]] = {}
        final_payload: dict[str, Any] = {}

        for idx, stage in enumerate(PIPELINE_STAGES):
            if idx < start_idx:
                stage_summaries[stage] = {"status": "skipped", "reason": f"start_from={start_from}"}
                continue
            if state is not None and not start_from and state.is_done(stage):
                record = state.stage_record(stage)
                stage_summaries[stage] = {
                    "status": "skipped",
                    "reason": "done",
                    "artifacts": record.get("artifacts") or {},
                }
                # video_spec 被跳过时仍需回填 spec_path 供后续阶段使用
                if stage == "video_spec":
                    saved = (record.get("artifacts") or {}).get("spec_path")
                    if saved:
                        spec_path = Path(str(saved))
                await stream.progress(
                    message=i18n.t(
                        "stage_skipped",
                        f"Stage {stage} already done, skipped.",
                        stage=stage,
                    ),
                    source=self.name,
                    stage=stage,
                )
                continue

            child_context = self._child_context(context, stage, spec_path, project_skills)
            capture = _ResultCapture(stream)
            capability = _STAGE_CAPABILITIES[stage]()
            await stream.progress(
                message=i18n.t(
                    "stage_started",
                    f"Stage {stage} started.",
                    stage=stage,
                ),
                source=self.name,
                stage=stage,
            )
            await capability.run(child_context, capture)
            payload = capture.payloads[-1] if capture.payloads else {}
            final_payload[stage] = payload

            # video_spec 完成后回填 spec 与状态文件位置
            if stage == "video_spec" and payload.get("spec_path"):
                spec_path = Path(str(payload["spec_path"]))
                state = PipelineState.load(video_dir_for_spec(spec_path))

            if payload.get("ok"):
                artifacts = {
                    key: payload[key]
                    for key in _STAGE_ARTIFACT_KEYS[stage]
                    if payload.get(key)
                }
                if state is not None:
                    state.mark_done(stage, artifacts)
                stage_summaries[stage] = {"status": "done", "artifacts": artifacts}
            else:
                error = str(payload.get("response") or f"{stage} failed")
                if state is not None:
                    state.mark_failed(stage, error)
                stage_summaries[stage] = {"status": "failed", "error": error[:500]}
                await stream.error(
                    i18n.t(
                        "stage_failed",
                        f"Stage {stage} failed; rerun with start_from={stage} to resume.",
                        stage=stage,
                    ),
                    source=self.name,
                    stage=stage,
                )
                await emit_capability_result(
                    stream,
                    {
                        "response": self._summary_md(i18n, stage_summaries, failed=stage),
                        "ok": False,
                        "failed_stage": stage,
                        "resume_with": {"start_from": stage},
                        "spec_path": str(spec_path) if spec_path else "",
                        "state_path": str(state.path) if state is not None else "",
                        "stages": stage_summaries,
                    },
                    source=self.name,
                    usage=usage,
                )
                return

        render_path = str((final_payload.get("video_compose") or {}).get("render_path") or "")
        response_md = self._summary_md(i18n, stage_summaries, failed=None)
        await stream.content(response_md, source=self.name, stage="video_compose")
        await emit_capability_result(
            stream,
            {
                "response": response_md,
                "ok": True,
                "spec_path": str(spec_path) if spec_path else "",
                "video_dir": str(video_dir_for_spec(spec_path)) if spec_path else "",
                "state_path": str(state.path) if state is not None else "",
                "render_path": render_path,
                "stages": stage_summaries,
            },
            source=self.name,
            usage=usage,
        )

    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_existing_spec(overrides: dict[str, Any]) -> Path | None:
        reference = str(overrides.get("spec") or overrides.get("spec_path") or "").strip()
        try:
            if reference:
                return resolve_spec_path(reference)
            # latest 回落仅在显式续跑（start_from）时启用：全新一句话出片
            # 必须走 video_spec 建新项目，否则会错误复用上一个项目的
            # pipeline_state 导致全部阶段 "already done, skipped"（实测 bug）。
            if str(overrides.get("start_from") or "").strip():
                return latest_spec_path()
            return None
        except FileNotFoundError:
            return None

    @staticmethod
    def _load_project_skills(spec_path: Path | None) -> list[str]:
        """读既有项目 ``<video_dir>/project.yaml`` 的 skills 声明（6.6）。"""
        if spec_path is None:
            return []
        project_file = video_dir_for_spec(spec_path) / "project.yaml"
        if not project_file.is_file():
            return []
        try:
            import yaml as _yaml

            project = _yaml.safe_load(project_file.read_text(encoding="utf-8")) or {}
        except Exception:
            return []
        declared = project.get("skills") if isinstance(project, dict) else None
        if isinstance(declared, list):
            return [str(name).strip() for name in declared if str(name).strip()]
        return []

    @staticmethod
    def _child_context(
        context: UnifiedContext,
        stage: str,
        spec_path: Path | None,
        project_skills: list[str] | None = None,
    ) -> UnifiedContext:
        """子阶段上下文：新 config_overrides（注入 spec 引用），不共享内存态。"""
        child_overrides = dict(context.config_overrides or {})
        child_overrides.pop("start_from", None)
        if stage != "video_spec" and spec_path is not None:
            child_overrides["spec"] = str(spec_path)
        # project.yaml 声明的技能注入 video_spec 子阶段（显式 skills 优先）
        if stage == "video_spec" and project_skills and not child_overrides.get("skills"):
            child_overrides["skills"] = list(project_skills)
        return dataclasses.replace(context, config_overrides=child_overrides)

    @staticmethod
    def _summary_md(
        i18n: StatusI18n,
        summaries: dict[str, dict[str, Any]],
        *,
        failed: str | None,
    ) -> str:
        lines = [
            i18n.t("summary_header", "video_pipeline 阶段汇总："),
        ]
        for stage in PIPELINE_STAGES:
            info = summaries.get(stage)
            if info is None:
                lines.append(f"- {stage}: pending")
            else:
                lines.append(f"- {stage}: {info.get('status', '?')}")
        if failed:
            lines.append(
                i18n.t(
                    "summary_failed",
                    f"在 {failed} 阶段失败；修复后以 start_from={failed} 重跑即可续跑。",
                    failed=failed,
                )
            )
        return "\n".join(lines)


__all__ = ["VideoPipelineCapability"]

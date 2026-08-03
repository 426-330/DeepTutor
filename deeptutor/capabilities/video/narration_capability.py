"""narration_gen capability：spec YAML → 逐屏 TTS 音频 + 词级对齐文件。

流程（M1，specs/narration-gen）：

1. loading —— 读取 ``data/videos/*.yaml``（缺省取最新），版本迁移 + §10
   机器校验（结构不过关不配音）；
2. synthesizing —— 每屏 ``narration.{opening,explanation,conclusion}`` 三段
   拼接为口播稿，调 DeepTutor TTS provider 层（``services.voice``）逐屏
   生成 ``audio/s<NN>.wav``；
3. aligning —— 经 exec 沙箱跑 whisperX 得词级时间戳，写
   ``audio/s<NN>.align.json``（真实时长 + cues）。沙箱不可用 / whisperX
   失败自动降级：无对齐文件也能渲染（IR 注入期回落 DSL 默认时长）。

真实时长只记录在 ``.align.json``，绝不回写 YAML（D6）。
"""

from __future__ import annotations

import logging
from typing import Any

import yaml

from deeptutor.agents._shared.capability_result import emit_capability_result
from deeptutor.capabilities.video.align import align_scene_audio
from deeptutor.capabilities.video.migrations import migrate_spec
from deeptutor.capabilities.video.paths import (
    latest_spec_path,
    resolve_spec_path,
    video_dir_for_spec,
)
from deeptutor.capabilities.video.validator import format_errors_for_llm, validate_schema
from deeptutor.core.agentic.usage import UsageTracker
from deeptutor.core.capability_protocol import BaseCapability, CapabilityManifest
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream_bus import StreamBus
from deeptutor.i18n import StatusI18n

logger = logging.getLogger(__name__)


class NarrationGenCapability(BaseCapability):
    manifest = CapabilityManifest(
        name="narration_gen",
        description=(
            "Generate per-scene TTS audio (audio/s<NN>.wav) from a video "
            "spec's narration, then word-level whisperX alignment files "
            "(audio/s<NN>.align.json) via the exec sandbox."
        ),
        stages=["loading", "synthesizing", "aligning"],
        tools_used=["exec"],
        cli_aliases=["narration_gen", "narrate"],
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
                    stream,
                    {"response": str(exc), "ok": False},
                    source=self.name,
                    usage=usage,
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
                await stream.error(
                    i18n.t(
                        "spec_invalid_detail",
                        f"Spec failed schema validation:\n{rendered}",
                        errors=rendered,
                    ),
                    source=self.name,
                    stage="loading",
                )
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

            scenes = [s for s in (data.get("scenes") or []) if isinstance(s, dict)]
            fps = int(data.get("fps") or 30)
            video_dir = video_dir_for_spec(spec_path)
            audio_dir = video_dir / "audio"
            audio_dir.mkdir(parents=True, exist_ok=True)
            await stream.progress(
                message=i18n.t(
                    "loaded",
                    f"Spec loaded: {spec_path} ({len(scenes)} scenes).",
                    path=str(spec_path),
                    count=len(scenes),
                ),
                source=self.name,
                stage="loading",
            )

        # ── Stage 2: 逐屏 TTS（失败降级不阻断：无配音也能出无声片，D6）────
        voice = str(overrides.get("voice") or "").strip() or None
        audio_files: list[str] = []
        degraded: list[str] = []
        async with stream.stage("synthesizing", source=self.name):
            from deeptutor.services.voice import VoiceProviderError, synthesize_speech

            for idx, scene in enumerate(scenes, start=1):
                narration = scene.get("narration") or {}
                text = "\n".join(
                    str(narration.get(part) or "").strip()
                    for part in ("opening", "explanation", "conclusion")
                ).strip()
                if not text:
                    await stream.progress(
                        message=i18n.t(
                            "scene_skipped",
                            f"Scene {idx}: empty narration, skipped.",
                            scene=idx,
                        ),
                        source=self.name,
                        stage="synthesizing",
                    )
                    continue
                try:
                    audio_bytes, _content_type = await synthesize_speech(
                        text,
                        voice=voice,
                        response_format="wav",
                    )
                except (VoiceProviderError, ValueError) as exc:
                    # 未配置 TTS（resolve_tts_runtime_config 抛 ValueError）或
                    # provider 故障（VoiceProviderError）：记 degraded 继续下一屏，
                    # 渲染层回退 DSL 默认时长出无声片，不再硬失败（此前
                    # "No active TTS model is configured" 会中断整个 pipeline）。
                    degraded.append(f"s{idx:02d}: {exc}")
                    await stream.progress(
                        message=i18n.t(
                            "tts_degraded",
                            f"Scene {idx}: TTS degraded ({exc}), continuing without audio.",
                            scene=idx,
                            error=str(exc),
                        ),
                        source=self.name,
                        stage="synthesizing",
                    )
                    continue
                wav_path = audio_dir / f"s{idx:02d}.wav"
                wav_path.write_bytes(audio_bytes)
                audio_files.append(str(wav_path))
                await stream.progress(
                    message=i18n.t(
                        "scene_audio",
                        f"Scene {idx}/{len(scenes)} audio done.",
                        scene=idx,
                        total=len(scenes),
                    ),
                    current=idx,
                    total=len(scenes),
                    source=self.name,
                    stage="synthesizing",
                )

        # ── Stage 3: whisperX 词级对齐（可降级） ─────────────────────────
        align_files: list[str] = []
        skip_align = bool(overrides.get("skip_align", False))
        language = str(overrides.get("language") or context.language or "").split("-")[0]
        async with stream.stage("aligning", source=self.name):
            if skip_align:
                degraded.append("skip_align=true")
            else:
                timeout_s = int(overrides.get("align_timeout_s", 0) or 0) or None
                for idx, _scene in enumerate(scenes, start=1):
                    if not (audio_dir / f"s{idx:02d}.wav").is_file():
                        continue
                    kwargs: dict[str, Any] = {"fps": fps, "language": language}
                    if timeout_s:
                        kwargs["timeout_s"] = timeout_s
                    outcome = await align_scene_audio(audio_dir, scene=idx, **kwargs)
                    if outcome.ok:
                        align_files.append(outcome.align_path)
                    else:
                        degraded.append(f"s{idx:02d}: {outcome.error}")
                        logger.warning("whisperX align degraded for scene %d: %s", idx, outcome.error)
                if degraded:
                    await stream.progress(
                        message=i18n.t(
                            "align_degraded",
                            "Alignment degraded; renderer will use DSL default durations.",
                        ),
                        source=self.name,
                        stage="aligning",
                        metadata={"degraded": degraded},
                    )

        response_md = i18n.t(
            "done",
            (
                f"配音完成：{len(audio_files)} 个音频、{len(align_files)} 个对齐文件\n"
                f"- 音频目录：`{audio_dir}`"
            ),
            audio_count=len(audio_files),
            align_count=len(align_files),
            audio_dir=str(audio_dir),
        )
        if degraded:
            response_md += "\n" + i18n.t(
                "done_degraded_note",
                "（对齐已降级：渲染层将使用 DSL 默认时长；重跑本阶段即可补齐。）",
            )
        await stream.content(response_md, source=self.name, stage="aligning")
        await emit_capability_result(
            stream,
            {
                "response": response_md,
                "ok": True,
                "spec_path": str(spec_path),
                "video_dir": str(video_dir),
                "audio_dir": str(audio_dir),
                "audio_files": audio_files,
                "align_files": align_files,
                "scene_count": len(scenes),
                "aligned_count": len(align_files),
                "degraded": degraded,
            },
            source=self.name,
            usage=usage,
        )


__all__ = ["NarrationGenCapability"]

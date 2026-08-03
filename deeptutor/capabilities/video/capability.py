"""video_spec capability：一句话/URL/文档 → 校验通过的 Concept Video DSL YAML。

流程（M1，design.md D2/D5/D7）：

1. clarifying —— ask_user 澄清受众/长度预设（7·10·13）/主题/主色等
   （可跳过用默认，overrides 直传优先）；
2. designing —— LLM 生成 v3.1 style 设计块；
3. generating → validating —— 按 video_blueprint 骨架逐屏填 PageModel +
   content_slots → YAML 解析 → 版本迁移（v3.0→v3.1）→ §10 机器校验 +
   §13 语义复查；不通过带结构化错误回炉，最多 max_attempts（默认 3）次；
4. writing —— 落盘 ``data/videos/<series_slug>_ep<NN>.yaml`` 并建产物目录
   ``{data,assets,audio,renders}/``（D10 布局）。
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

import yaml

from deeptutor.agents._shared.capability_result import emit_capability_result
from deeptutor.capabilities.video.clarify import ClarifyPrefs, clarify_prefs
from deeptutor.capabilities.video.migrations import migrate_spec
from deeptutor.capabilities.video.paths import (
    slugify_series,
    spec_path_for,
    video_dir_for,
)
from deeptutor.capabilities.video.skills import (
    render_skill_constraints,
    scan_effect_skills,
)
from deeptutor.capabilities.video.spec_agent import VideoSpecAgent
from deeptutor.capabilities.video.validator import (
    SpecError,
    format_errors_for_llm,
    has_blocking_errors,
    validate_spec,
)
from deeptutor.core.agentic.usage import UsageTracker
from deeptutor.core.capability_protocol import BaseCapability, CapabilityManifest
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream_bus import StreamBus
from deeptutor.core.trace import merge_trace_metadata
from deeptutor.i18n import StatusI18n

logger = logging.getLogger(__name__)

_URL_RE = re.compile(r"https?://[^\s<>\"')\]]+")
_MAX_URLS = 2
_URL_MATERIAL_CHARS = 8000
_ATTACHMENT_MATERIAL_CHARS = 8000
_DEFAULT_MAX_ATTEMPTS = 3


class VideoSpecCapability(BaseCapability):
    manifest = CapabilityManifest(
        name="video_spec",
        description=(
            "Generate a validated Concept Video DSL YAML spec "
            "(clarify → style design → blueprint slot filling → two-layer "
            "validation with retry) and save it under data/videos/."
        ),
        stages=["clarifying", "designing", "generating", "validating", "writing"],
        tools_used=["ask_user", "web_fetch"],
        cli_aliases=["video_spec", "vspec"],
    )

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        from deeptutor.services.llm.config import get_llm_config

        llm_config = get_llm_config()
        usage = UsageTracker(model=getattr(llm_config, "model", None))
        i18n = StatusI18n(self.name, context.language, module="capabilities")
        overrides = context.config_overrides or {}
        max_attempts = int(overrides.get("max_attempts", _DEFAULT_MAX_ATTEMPTS) or 0)
        max_attempts = max(1, max_attempts)

        from deeptutor.services.prompt import get_prompt_manager

        prompts = get_prompt_manager().load_prompts(
            module_name="capabilities",
            agent_name="video_spec",
            language=context.language,
        )
        clarify_copy = prompts.get("clarify") if isinstance(prompts, dict) else None

        agent = VideoSpecAgent(
            api_key=llm_config.api_key,
            base_url=llm_config.base_url,
            api_version=llm_config.api_version,
            language=context.language,
        )
        agent.set_trace_callback(self._build_trace_bridge(stream, i18n=i18n))

        # ── Stage 1: 澄清（ask_user，可跳过）+ 多源素材收集 ──────────────
        async with stream.stage("clarifying", source=self.name):
            await stream.thinking(
                i18n.t("clarifying", "Clarifying audience, length and style..."),
                source=self.name,
                stage="clarifying",
            )
            prefs = await clarify_prefs(
                context, stream, copy=clarify_copy or {}, source=self.name
            )
            materials = await self._gather_materials(context, stream, i18n)
            await stream.progress(
                message=i18n.t(
                    "clarified",
                    f"Preset: {prefs.preset}; theme: {prefs.theme or 'default'}.",
                    preset=prefs.preset,
                    theme=prefs.theme or "default",
                ),
                source=self.name,
                stage="clarifying",
            )

        # ── Stage 2: style 设计块 ────────────────────────────────────────
        async with stream.stage("designing", source=self.name):
            await stream.thinking(
                i18n.t("designing", "Designing the style block..."),
                source=self.name,
                stage="designing",
            )
            style = await agent.design_style(
                topic=context.user_message,
                audience=prefs.audience,
                theme=prefs.theme,
                primary_color=prefs.primary_color,
                font_hint=prefs.font_hint,
                effects_hint=prefs.effects_hint,
            )
            style = self._apply_pref_overrides(style, prefs)

            # 特效技能挂载（D8/6.3/6.6）：overrides skills > project.yaml >
            # 用户消息点名 > always: true；注入约束文本，校验用全量目录。
            catalog = scan_effect_skills()
            known_skills = set(catalog)
            selected_skills, skill_warnings = self._resolve_skills(
                context, overrides, catalog
            )
            skills_text = render_skill_constraints(selected_skills)
            if selected_skills:
                await stream.progress(
                    message=i18n.t(
                        "skills_mounted",
                        "Effect skills: {names}.",
                        names=", ".join(s.name for s in selected_skills),
                    ),
                    source=self.name,
                    stage="designing",
                )
            for warning in skill_warnings:
                logger.warning("video_spec skill mount: %s", warning)

        # ── Stage 3+4: 骨架槽位填充 → 两层校验 → 回炉 ───────────────────
        history_context = str(
            context.metadata.get("conversation_context_text", "") or ""
        ).strip()
        data: dict[str, Any] | None = None
        errors: list[SpecError] = []
        yaml_text = ""
        attempts = 0
        for attempt in range(1, max_attempts + 1):
            attempts = attempt
            stage_name = "generating" if attempt == 1 else "validating"
            async with stream.stage(stage_name, source=self.name):
                if attempt == 1:
                    await stream.thinking(
                        i18n.t("generating", "Filling the blueprint skeleton..."),
                        source=self.name,
                        stage="generating",
                    )
                else:
                    await stream.thinking(
                        i18n.t(
                            "retrying",
                            f"Validation failed (attempt {attempt}/{max_attempts}); regenerating...",
                            attempt=attempt,
                            max_attempts=max_attempts,
                        ),
                        source=self.name,
                        stage="validating",
                    )
                yaml_text = await agent.generate_spec(
                    topic=context.user_message,
                    audience=prefs.audience,
                    preset=prefs.preset,
                    style=style,
                    materials=materials,
                    history_context=history_context,
                    skills_text=skills_text,
                    previous_yaml=yaml_text,
                    validation_errors=format_errors_for_llm(
                        [e for e in errors if e.severity != "warning"]
                    )
                    if errors
                    else "",
                )
                data, errors = self._parse_migrate_validate(
                    yaml_text, known_skills=known_skills
                )
                if not has_blocking_errors(errors):
                    break
                await stream.progress(
                    message=i18n.t(
                        "validation_failed",
                        f"{len(errors)} validation issue(s) found.",
                        count=len(errors),
                    ),
                    source=self.name,
                    stage="validating",
                    metadata={"validation_errors": [e.render() for e in errors]},
                )

        if data is None or has_blocking_errors(errors):
            rendered = format_errors_for_llm(errors) if errors else "empty generation"
            await stream.error(
                i18n.t(
                    "generation_failed",
                    "Video spec generation failed after retries.",
                ),
                source=self.name,
                stage="validating",
            )
            await emit_capability_result(
                stream,
                {
                    "response": i18n.t(
                        "generation_failed_detail",
                        f"视频描述文件生成失败（{attempts} 次尝试后仍未通过校验）：\n{rendered}",
                        attempts=attempts,
                        errors=rendered,
                    ),
                    "ok": False,
                    "attempts": attempts,
                    "validation_errors": [e.render() for e in errors],
                },
                source=self.name,
                usage=usage,
            )
            return

        # ── Stage 5: 落盘 ────────────────────────────────────────────────
        async with stream.stage("writing", source=self.name):
            series = str(data.get("series") or "").strip() or "video"
            series_slug = slugify_series(series)
            episode = int(data.get("episode") or 1)
            spec_path = spec_path_for(series_slug, episode, create_dirs=True)
            spec_path.write_text(
                yaml.safe_dump(data, allow_unicode=True, sort_keys=False),
                encoding="utf-8",
            )
            video_dir = video_dir_for(series_slug, episode, create=True)
            scene_count = len(data.get("scenes") or [])
            await stream.progress(
                message=i18n.t(
                    "written",
                    f"Spec saved: {spec_path}",
                    path=str(spec_path),
                ),
                source=self.name,
                stage="writing",
            )

        response_md = i18n.t(
            "done",
            (
                f"视频描述文件已生成并通过两层校验：\n"
                f"- spec：`{spec_path}`\n"
                f"- 产物目录：`{video_dir}`\n"
                f"- 系列：{series} 第 {episode} 集 · {prefs.preset} · {scene_count} 屏"
            ),
            spec_path=str(spec_path),
            video_dir=str(video_dir),
            series=series,
            episode=episode,
            preset=prefs.preset,
            scene_count=scene_count,
        )
        await stream.content(response_md, source=self.name, stage="writing")
        warnings = [e.render() for e in errors if e.severity == "warning"]
        await emit_capability_result(
            stream,
            {
                "response": response_md,
                "ok": True,
                "spec_path": str(spec_path),
                "video_dir": str(video_dir),
                "series": series,
                "series_slug": series_slug,
                "episode": episode,
                "preset": prefs.preset,
                "scene_count": scene_count,
                "style": data.get("style") or {},
                "attempts": attempts,
                "clarify": prefs.answers,
                "skills": [s.name for s in selected_skills],
                "validation_warnings": warnings + skill_warnings,
            },
            source=self.name,
            usage=usage,
        )

    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_skills(
        context: UnifiedContext,
        overrides: dict[str, Any],
        catalog: dict[str, Any],
    ) -> tuple[list[Any], list[str]]:
        """技能选择：overrides skills > project.yaml > 用户消息点名 > always。

        project.yaml 位置：overrides 给出既有 spec / project_dir 时的产物目录
        （再生成/局部迭代场景）；全新生成时无项目目录，跳过该档。
        """
        from deeptutor.capabilities.video.paths import (
            resolve_spec_path,
            video_dir_for_spec,
        )
        from deeptutor.capabilities.video.skills import (
            EffectSkill,
            resolve_project_skills,
        )

        video_dir = None
        project_dir = str(overrides.get("project_dir") or "").strip()
        reference = str(overrides.get("spec") or overrides.get("spec_path") or "").strip()
        try:
            if project_dir:
                video_dir = Path(project_dir)
            elif reference:
                video_dir = video_dir_for_spec(resolve_spec_path(reference))
        except FileNotFoundError:
            video_dir = None

        # 用户消息点名已安装技能（无显式声明时的意图识别）。
        if not overrides.get("skills") and (video_dir is None or not (video_dir / "project.yaml").is_file()):
            mentioned = [
                name
                for name in catalog
                if name and name.lower() in (context.user_message or "").lower()
            ]
            if mentioned:
                skills = [catalog[name] for name in mentioned]
                return skills, []

        skills, warnings = resolve_project_skills(video_dir, overrides)
        # 只保留已安装技能（resolve_project_skills 已过滤并给 warnings）
        return [s for s in skills if isinstance(s, EffectSkill)], warnings

    async def _gather_materials(
        self,
        context: UnifiedContext,
        stream: StreamBus,
        i18n: StatusI18n,
    ) -> str:
        """多源输入：URL 经 web_fetch 解析；附件用既有解析层的 extracted_text。"""
        parts: list[str] = []

        urls = _URL_RE.findall(context.user_message or "")[:_MAX_URLS]
        if urls:
            from deeptutor.tools.web_fetch import fetch_url_as_markdown

            for url in urls:
                outcome = await fetch_url_as_markdown(url, max_chars=_URL_MATERIAL_CHARS)
                if outcome.ok:
                    parts.append(f"[Fetched: {outcome.url}]\n{outcome.markdown}")
                else:
                    await stream.progress(
                        message=i18n.t(
                            "fetch_failed",
                            f"Could not fetch {url}: {outcome.error}",
                            url=url,
                            error=outcome.error,
                        ),
                        source=self.name,
                        stage="clarifying",
                    )

        for attachment in context.attachments or []:
            text = (attachment.extracted_text or "").strip()
            if text:
                parts.append(
                    f"[Attachment: {attachment.filename or attachment.id}]\n"
                    f"{text[:_ATTACHMENT_MATERIAL_CHARS]}"
                )

        return "\n\n".join(parts)

    @staticmethod
    def _apply_pref_overrides(style: dict[str, Any], prefs: ClarifyPrefs) -> dict[str, Any]:
        """澄清的显式选择压过 LLM 设计（用户点选优先）。"""
        out = dict(style or {})
        if prefs.theme:
            out["theme"] = prefs.theme
        if prefs.primary_color:
            colors = dict(out.get("colors") or {})
            colors["primary"] = prefs.primary_color
            out["colors"] = colors
        return out

    @staticmethod
    def _parse_migrate_validate(
        yaml_text: str,
        *,
        known_skills: set[str] | None = None,
    ) -> tuple[dict[str, Any] | None, list[SpecError]]:
        """YAML 解析 → 版本迁移 → §10 + §13 两层校验（含技能 warning）。"""
        if not yaml_text.strip():
            return None, [
                SpecError(rule="schema", field="(root)", message="LLM 未产出 YAML 内容")
            ]
        try:
            data = yaml.safe_load(yaml_text)
        except yaml.YAMLError as exc:
            return None, [
                SpecError(rule="schema", field="(root)", message=f"YAML 解析失败: {exc}")
            ]
        if not isinstance(data, dict):
            return None, [
                SpecError(rule="schema", field="(root)", message="spec 顶层必须是 mapping")
            ]
        try:
            data = migrate_spec(data).data
        except ValueError as exc:
            return None, [SpecError(rule="schema", field="version", message=str(exc))]
        return data, validate_spec(data, known_skills=known_skills)

    def _build_trace_bridge(self, stream: StreamBus, i18n: StatusI18n | None = None):
        async def _trace_bridge(update: dict[str, Any]) -> None:
            event = str(update.get("event", "") or "")
            if event != "llm_call":
                return
            stage = str(update.get("phase") or update.get("stage") or "generating")
            base_metadata = {
                key: value
                for key, value in update.items()
                if key
                not in {"event", "state", "response", "chunk", "result", "tool_name", "tool_args"}
            }
            state = str(update.get("state", "running"))
            label = str(base_metadata.get("label", "") or stage.replace("_", " ").title())
            if state == "running":
                await stream.progress(
                    message=label,
                    source=self.name,
                    stage=stage,
                    metadata=merge_trace_metadata(
                        base_metadata,
                        {"trace_kind": "call_status", "call_state": "running"},
                    ),
                )
                return
            if state == "streaming":
                chunk = str(update.get("chunk", "") or "")
                if chunk:
                    await stream.thinking(
                        chunk,
                        source=self.name,
                        stage=stage,
                        metadata=merge_trace_metadata(
                            base_metadata,
                            {"trace_kind": "llm_chunk"},
                        ),
                    )
                return
            if state == "complete":
                was_streaming = update.get("streaming", False)
                if not was_streaming:
                    response = str(update.get("response", "") or "")
                    if response:
                        await stream.thinking(
                            response,
                            source=self.name,
                            stage=stage,
                            metadata=merge_trace_metadata(
                                base_metadata,
                                {"trace_kind": "llm_output"},
                            ),
                        )
                await stream.progress(
                    message=label,
                    source=self.name,
                    stage=stage,
                    metadata=merge_trace_metadata(
                        base_metadata,
                        {"trace_kind": "call_status", "call_state": "complete"},
                    ),
                )
                return
            if state == "error":
                fallback = (
                    i18n.t("llm_call_failed", "LLM call failed.")
                    if i18n is not None
                    else "LLM call failed."
                )
                await stream.error(
                    str(update.get("response", "") or fallback),
                    source=self.name,
                    stage=stage,
                    metadata=merge_trace_metadata(
                        base_metadata,
                        {"trace_kind": "call_status", "call_state": "error"},
                    ),
                )

        return _trace_bridge


__all__ = ["VideoSpecCapability"]

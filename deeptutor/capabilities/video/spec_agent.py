"""video_spec 的 LLM 生成 Agent：style 设计块 + 逐屏槽位填充。

骨架来自 ``video_blueprint`` 长度预设（templates.py），LLM 只负责 style、
PageModel 六字段与类型专有 content_slots——布局与场景序列在提示词中锁定，
禁止自由编排（D2）。校验不通过时携带结构化错误回炉（retry）。
"""

from __future__ import annotations

import json
from typing import Any

import yaml

from deeptutor.agents.base_agent import BaseAgent
from deeptutor.capabilities.video.templates import get_blueprint, layout_library
from deeptutor.core.trace import build_trace_metadata, new_call_id


def extract_yaml(text: str) -> str:
    """从 LLM 响应提取 YAML 文本（优先 ```yaml 围栏块）。"""
    stripped = (text or "").strip()
    if not stripped:
        return ""
    for fence in ("```yaml", "```yml", "```"):
        start = stripped.find(fence)
        if start != -1:
            body = stripped[start + len(fence):]
            end = body.find("```")
            if end != -1:
                return body[:end].strip()
    if stripped.startswith("version:"):
        return stripped
    return ""


class VideoSpecAgent(BaseAgent):
    """style 设计 + spec YAML 生成（Blocking 调用：YAML 只有整体可用）。"""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        api_version: str | None = None,
        language: str = "zh",
    ) -> None:
        super().__init__(
            module_name="capabilities",
            agent_name="video_spec",
            api_key=api_key,
            base_url=base_url,
            api_version=api_version,
            language=language,
        )

    async def process(self, **kwargs: Any) -> str:
        """BaseAgent 约定入口：等价于 :meth:`generate_spec`（透传全部参数）。"""
        return await self.generate_spec(**kwargs)

    async def design_style(
        self,
        *,
        topic: str,
        audience: str,
        theme: str,
        primary_color: str,
        font_hint: str,
        effects_hint: str,
    ) -> dict[str, Any]:
        """生成顶层 style 设计块（JSON）。失败/非法返回空 dict（用默认主题）。"""
        system_prompt = self.get_prompt("style_system")
        user_template = self.get_prompt("style_user_template")
        if not system_prompt or not user_template:
            return {}
        response = await self.call_llm(
            user_prompt=user_template.format(
                topic=topic.strip(),
                audience=audience.strip() or "(default)",
                theme=theme.strip() or "default",
                primary_color=primary_color.strip() or "(none)",
                font_hint=font_hint.strip() or "(default)",
                effects_hint=effects_hint.strip() or "(default)",
            ),
            system_prompt=system_prompt,
            response_format={"type": "json_object"},
            stage="designing",
            trace_meta=build_trace_metadata(
                call_id=new_call_id("video-style"),
                phase="designing",
                label="Style design",
                call_kind="video_style_design",
                trace_role="generate",
                trace_kind="llm_output",
            ),
        )
        try:
            style = json.loads(response or "{}")
        except (TypeError, ValueError):
            return {}
        return style if isinstance(style, dict) else {}

    async def generate_spec(
        self,
        *,
        topic: str,
        audience: str,
        preset: str,
        style: dict[str, Any],
        materials: str,
        history_context: str,
        skills_text: str = "",
        previous_yaml: str = "",
        validation_errors: str = "",
    ) -> str:
        """按蓝图骨架生成 spec YAML；带错误时进入回炉模式。

        ``skills_text`` 为已安装特效技能的约束文本（skills.py
        ``render_skill_constraints``）；为空表示无特效技能注入。
        """
        system_prompt = self.get_prompt("spec_system")
        if not system_prompt:
            raise ValueError("VideoSpecAgent prompts are not configured.")

        blueprint_yaml = yaml.safe_dump(
            get_blueprint(preset), allow_unicode=True, sort_keys=False
        )
        layouts_yaml = yaml.safe_dump(
            layout_library(), allow_unicode=True, sort_keys=False
        )
        style_yaml = (
            yaml.safe_dump(style, allow_unicode=True, sort_keys=False) if style else "(none)"
        )
        skills_block = skills_text.strip() or "(none)"

        if validation_errors:
            user_template = self.get_prompt("retry_user_template")
            user_prompt = user_template.format(
                topic=topic.strip(),
                preset=preset,
                blueprint=blueprint_yaml.strip(),
                layouts=layouts_yaml.strip(),
                style=style_yaml.strip(),
                materials=materials.strip() or "(none)",
                skills=skills_block,
                previous_yaml=previous_yaml.strip(),
                validation_errors=validation_errors.strip(),
            )
            stage = "validating"
            call_kind = "video_spec_retry"
        else:
            user_template = self.get_prompt("spec_user_template")
            user_prompt = user_template.format(
                topic=topic.strip(),
                audience=audience.strip() or "(default)",
                preset=preset,
                blueprint=blueprint_yaml.strip(),
                layouts=layouts_yaml.strip(),
                style=style_yaml.strip(),
                materials=materials.strip() or "(none)",
                skills=skills_block,
                history_context=history_context.strip() or "(none)",
            )
            stage = "generating"
            call_kind = "video_spec_generation"

        response = await self.call_llm(
            user_prompt=user_prompt,
            system_prompt=system_prompt,
            stage=stage,
            trace_meta=build_trace_metadata(
                call_id=new_call_id("video-spec"),
                phase=stage,
                label="Spec generation" if not validation_errors else "Spec repair",
                call_kind=call_kind,
                trace_role="generate",
                trace_kind="llm_output",
            ),
        )
        return extract_yaml(response)


__all__ = ["VideoSpecAgent", "extract_yaml"]

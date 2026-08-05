"""video_spec 生成前的交互式澄清（ask_user）。

优先级：``config_overrides`` 显式给值 > ask_user 交互 > 默认值。CLI /
pipeline 无人值守路径传 ``skip_clarify: true``（或直接给值）即跳过提问；
无 ``wait_for_user_reply`` waiter 的环境（如 partners）自动落默认值。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import re
from typing import Any

from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream_bus import StreamBus
from deeptutor.tools.ask_user import build_ask_user_payload

_CJK_RE = re.compile(r"[一-鿿㐀-䶿豈-﫿]")


def resolve_prompt_language(message: str, context_language: str | None) -> str:
    """澄清/prompts 语言解析（D4）：显式 zh/en > 用户消息 CJK 检测 > en。

    ``context_language`` 为空/未识别视为未设置；显式设置时优先，不受
    启发式影响（中英混输含 CJK 即判 zh）。
    """
    lang = str(context_language or "").strip().lower()
    if lang.startswith("zh"):
        return "zh"
    if lang.startswith("en"):
        return "en"
    return "zh" if _CJK_RE.search(message or "") else "en"


@dataclass(frozen=True)
class ClarifyPrefs:
    """澄清结果：长度预设 + 受众 + 风格偏好（写入 style 块）。"""

    preset: str = "standard-10"
    audience: str = ""
    theme: str = ""
    primary_color: str = ""
    font_hint: str = ""
    effects_hint: str = ""
    asked: bool = False
    answers: dict[str, str] = field(default_factory=dict)


_PRESET_ALIASES = {
    "7": "short-7",
    "short": "short-7",
    "short-7": "short-7",
    "10": "standard-10",
    "standard": "standard-10",
    "standard-10": "standard-10",
    "13": "full-13",
    "full": "full-13",
    "full-13": "full-13",
}


def normalize_preset(value: str, *, default: str = "standard-10") -> str:
    key = str(value or "").strip().lower()
    if key in _PRESET_ALIASES:
        return _PRESET_ALIASES[key]
    # ask_user 卡片返回完整 option label（如 "7 屏 (short-7)"）：抽取预设 id。
    for preset in ("short-7", "standard-10", "full-13"):
        if preset in key:
            return preset
    return default


def prefs_from_overrides(overrides: dict[str, Any]) -> dict[str, str]:
    """从 config_overrides 提取显式澄清值（pipeline/CLI 直传）。"""
    keys = ("preset", "audience", "theme", "primary_color", "font_hint", "effects_hint")
    return {k: str(overrides[k]).strip() for k in keys if overrides.get(k)}


def build_clarify_questions(copy: dict[str, Any]) -> list[dict[str, Any]]:
    """ask_user 问题集（文案来自 prompts yaml 的 clarify 节）。"""
    def q(key: str, default: str) -> str:
        value = copy.get(key)
        return value if isinstance(value, str) and value else default

    return [
        {
            "id": "preset",
            "prompt": q("q_preset", "视频长度预设（屏数）？"),
            "header": q("h_preset", "长度"),
            "options": [
                {"label": "7 屏 (short-7)", "description": q("d_preset_7", "约 1 分钟内，单点讲解")},
                {"label": "10 屏 (standard-10)", "description": q("d_preset_10", "约 1.5–2 分钟，标准单集")},
                {"label": "13 屏 (full-13)", "description": q("d_preset_13", "约 2.5–3 分钟，深度讲解")},
            ],
        },
        {
            "id": "audience",
            "prompt": q("q_audience", "目标受众是谁？（影响措辞与举例）"),
            "header": q("h_audience", "受众"),
            "options": [],
            "placeholder": q("p_audience", "如：零基础大众 / 大学生 / 从业者"),
        },
        {
            "id": "theme",
            "prompt": q("q_theme", "视觉主题？"),
            "header": q("h_theme", "主题"),
            "options": [
                {"label": "default", "description": q("d_theme_default", "内建通用主题")},
                {"label": "quant-traditional", "description": q("d_theme_quant", "量化科普主题色卡")},
            ],
        },
        {
            "id": "primary_color",
            "prompt": q("q_color", "主色 primary（hex，可留空用主题默认）？"),
            "header": q("h_color", "主色"),
            "options": [],
            "placeholder": "#1A5FB4",
        },
    ]


async def clarify_prefs(
    context: UnifiedContext,
    stream: StreamBus,
    *,
    copy: dict[str, Any],
    source: str,
) -> ClarifyPrefs:
    """汇总澄清偏好。overrides 直传 > ask_user 交互 > 默认。"""
    overrides = context.config_overrides or {}
    given = prefs_from_overrides(overrides)
    skip = bool(overrides.get("skip_clarify", False))

    base = ClarifyPrefs(
        preset=normalize_preset(given.get("preset", "")),
        audience=given.get("audience", ""),
        theme=given.get("theme", ""),
        primary_color=given.get("primary_color", ""),
        font_hint=given.get("font_hint", ""),
        effects_hint=given.get("effects_hint", ""),
        answers=dict(given),
    )
    if skip:
        return base

    waiter = context.metadata.get("wait_for_user_reply")
    if not callable(waiter):
        return base

    payload, error = build_ask_user_payload(
        questions=build_clarify_questions(copy),
        intro=copy.get("intro") if isinstance(copy.get("intro"), str) else None,
    )
    if payload is None:
        return base

    # 前端从 tool_result.metadata.tool_metadata.ask_user 渲染提问卡片
    # （与 chat 的 ask_user 工具同一事件形状，tool_dispatch 包一层
    # tool_metadata；AskUserOptions.extractAskUserPayload 只认这个嵌套
    # 位置，顶层 metadata.ask_user 不渲染——Web 端不显示卡片的根因）。
    await stream.tool_result(
        tool_name="ask_user",
        result="; ".join(q.prompt for q in payload.questions),
        source=source,
        stage="clarifying",
        metadata={"tool_metadata": {"ask_user": payload.to_dict()}},
    )
    # 等待用户回复，但必须有超时兜底：Web 端若未渲染/未回答卡片，
    # 无限等待会把整个 pipeline 挂死（实测：turn 停在 clarifying 无任何
    # 后续事件）。超时或回复为空 → 落默认值继续。
    # overrides["clarify_timeout_s"] 可调（默认 120s；0/负数 = 不限时）。
    timeout_s = float(overrides.get("clarify_timeout_s", 120) or 0)
    try:
        if timeout_s > 0:
            raw_reply = await asyncio.wait_for(waiter(), timeout=timeout_s)
        else:
            raw_reply = await waiter()
    except (TimeoutError, asyncio.TimeoutError):
        # 通知前端卡片已了结（无答案），并落默认值继续。
        await stream.progress(
            message="澄清等待超时，使用默认配置继续 / Clarification timed out; continuing with defaults.",
            source=source,
            stage="clarifying",
            metadata={"ask_user_resolved": True, "answers": []},
        )
        return base
    if raw_reply is None:
        return base

    from deeptutor.agents.chat.agentic_pipeline import _normalise_user_reply

    reply_text, answers = _normalise_user_reply(raw_reply)
    # 通知前端卡片已了结（带答案折叠为已答状态）。
    await stream.progress(
        message="",
        source=source,
        stage="clarifying",
        metadata={"ask_user_resolved": True, "answers": answers or []},
    )
    merged = dict(base.answers)
    for entry in answers or []:
        merged[entry["questionId"]] = entry["text"].strip()
    if reply_text and "preset" not in merged:
        # 自由文本整体回复（无结构化 answers）：尽力当长度预设解析。
        merged["preset"] = reply_text.strip()

    return ClarifyPrefs(
        preset=normalize_preset(merged.get("preset", ""), default=base.preset),
        audience=merged.get("audience", base.audience),
        theme=merged.get("theme", base.theme),
        primary_color=merged.get("primary_color", base.primary_color),
        font_hint=merged.get("font_hint", base.font_hint),
        effects_hint=merged.get("effects_hint", base.effects_hint),
        asked=True,
        answers=merged,
    )


__all__ = ["ClarifyPrefs", "clarify_prefs", "normalize_preset", "resolve_prompt_language"]

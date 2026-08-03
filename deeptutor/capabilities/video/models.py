"""spec 顶层结构的 Pydantic 模型（类型安全的内部表示）。

校验权威始终是 §10 JSON Schema（validator.py）；这里的模型只做内部
结构化访问——因此 content_slots 走 ``extra="allow"`` 原样透传，不在
Pydantic 层重复 schema 的枚举/字数约束（避免双源漂移，D5）。
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class Narration(BaseModel):
    """三段式口播稿，直接拼接作为 TTS 输入。"""

    opening: str = ""
    explanation: str = ""
    conclusion: str = ""

    def joined(self) -> str:
        return "\n".join(part for part in (self.opening, self.explanation, self.conclusion) if part)


class Visual(BaseModel):
    primary: str = ""
    secondary: str | None = None
    emphasis: str | None = None


class PageTransition(BaseModel):
    next_question: str | None = None


class FontSpec(BaseModel):
    family: str = ""
    weight: int | None = None


class TransitionEffect(BaseModel):
    type: Literal["fade", "wipe-left", "slide", "zoom", "none"] = "fade"
    frames: int | None = None


class BackgroundEffect(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: Literal["none", "gradient", "particles"] = "none"
    skill: str | None = None
    params: dict[str, Any] | None = None


class Effects(BaseModel):
    transition: TransitionEffect | None = None
    entrance: str | None = None
    chart_motion: str | None = None
    background: BackgroundEffect | None = None


class StyleBlock(BaseModel):
    """v3.1 style 块（顶层与分镜级同构；colors 值含义随层级不同）。"""

    theme: str | None = None
    preset: str | None = None
    colors: dict[str, str] = Field(default_factory=dict)
    fonts: dict[str, FontSpec] = Field(default_factory=dict)
    effects: Effects | None = None


class Opening(BaseModel):
    title: str = ""
    subtitle: str | None = None


class Scene(BaseModel):
    """一屏 = PageModel 六字段 + type/layout + 类型专有 content_slots。

    content_slots（hook_line/formula/key_cards/……）以 extra 字段透传，
    枚举与必填约束由 JSON Schema + §13 语义复查把关。
    """

    model_config = ConfigDict(extra="allow")

    type: str = ""
    layout: str = ""
    title: str = ""
    question: str = ""
    core_message: str = ""
    narration: Narration = Field(default_factory=Narration)
    visual: Visual = Field(default_factory=Visual)
    transition: PageTransition = Field(default_factory=PageTransition)
    duration_frames: int | None = None
    style: StyleBlock | None = None


class VideoSpec(BaseModel):
    """spec 顶层结构。"""

    version: Literal["3.0", "3.1"] = "3.1"
    series: str = ""
    episode: int = 1
    fps: int = 30
    style: StyleBlock | None = None
    opening: Opening | None = None
    scenes: list[Scene] = Field(default_factory=list)


def parse_spec(data: dict[str, Any]) -> VideoSpec:
    """已校验的 spec dict → 类型安全内部表示。"""
    return VideoSpec.model_validate(data)


__all__ = [
    "BackgroundEffect",
    "Effects",
    "FontSpec",
    "Narration",
    "Opening",
    "PageTransition",
    "Scene",
    "StyleBlock",
    "TransitionEffect",
    "VideoSpec",
    "Visual",
    "parse_spec",
]

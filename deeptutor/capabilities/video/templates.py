"""场景模板库访问（``video_dsl/concept-video-scene-templates.yaml``）。

只读访问：layout_library（每屏怎么布）与 video_blueprint（7/10/13 屏
长度预设 = 场景 type 序列 + 每屏建议 layout）。capability 按预设复制骨架，
LLM 只填 PageModel 与 content_slots，不做自由编排（D2）。
"""

from __future__ import annotations

from typing import Any

import yaml

from deeptutor.capabilities.video.schema import TEMPLATES_PATH

# 长度预设 → 用户可识别的屏数
BLUEPRINT_PRESETS: dict[str, int] = {
    "short-7": 7,
    "standard-10": 10,
    "full-13": 13,
}
DEFAULT_PRESET = "standard-10"

_templates_cache: dict[str, Any] | None = None


def load_templates(path=None) -> dict[str, Any]:
    """读取场景模板库（带缓存）。"""
    global _templates_cache
    if path is not None:
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    if _templates_cache is None:
        if not TEMPLATES_PATH.is_file():
            raise FileNotFoundError(
                f"场景模板库缺失：{TEMPLATES_PATH} — video_dsl 资产未取回（G0 门禁）。"
            )
        with open(TEMPLATES_PATH, encoding="utf-8") as f:
            _templates_cache = yaml.safe_load(f) or {}
    return _templates_cache


def get_blueprint(preset: str) -> list[dict[str, str]]:
    """指定预设的场景骨架：[{type, layout}, …]。"""
    blueprints = (load_templates().get("video_blueprint") or {})
    entry = blueprints.get(preset)
    if entry is None:
        raise ValueError(
            f"未知长度预设 {preset!r}，可选：{', '.join(BLUEPRINT_PRESETS)}"
        )
    return [dict(scene) for scene in (entry.get("scenes") or [])]


def layout_library() -> list[dict[str, Any]]:
    return list(load_templates().get("layout_library") or [])


def layout_aliases() -> dict[str, str]:
    return dict(load_templates().get("layout_aliases") or {})


__all__ = [
    "BLUEPRINT_PRESETS",
    "DEFAULT_PRESET",
    "get_blueprint",
    "layout_aliases",
    "layout_library",
    "load_templates",
]

"""内建主题色板解析（《量化色卡规范.md》 → token→hex）。

色卡规范是视觉权威文件之一（与 DSL/§10 schema 并列），本模块从
``video_dsl/量化色卡规范.md`` 的 markdown 表格解析内建主题色板，避免在
Python 侧再维护一份硬编码色值（单一来源纪律，同 D5）。spec 顶层
``style.colors`` 的 hex 覆盖按样式链（D3）在解析后应用。
"""

from __future__ import annotations

import re
from pathlib import Path

from deeptutor.runtime.home import PACKAGE_ROOT

COLOR_TOKENS = ("primary", "secondary", "accent", "success", "warning", "danger", "neutral")
DEFAULT_THEME = "default"

PALETTE_PATH = PACKAGE_ROOT / "video_dsl" / "量化色卡规范.md"

_THEME_HEADER_RE = re.compile(r"^###\s+\d+(?:\.\d+)*\s+`(?P<theme>[a-z0-9-]+)`")
_TOKEN_ROW_RE = re.compile(
    r"^\|\s*(?P<token>primary|secondary|accent|success|warning|danger|neutral)\s*"
    r"\|\s*`?(?P<hex>#[0-9A-Fa-f]{6})`?\s*\|"
)

# token → 语义描述（取自色卡规范 §1，供 imagegen prompt 注入）
TOKEN_SEMANTICS = {
    "primary": "主色",
    "secondary": "次色",
    "accent": "点缀色",
    "success": "正向色",
    "warning": "警示色",
    "danger": "负向色",
    "neutral": "中性色",
}

_themes_cache: dict[str, dict[str, str]] | None = None


def load_themes(path: Path | None = None) -> dict[str, dict[str, str]]:
    """解析内建主题色板：{theme: {token: hex}}。文件缺失时抛 FileNotFoundError。"""
    global _themes_cache
    if path is not None:
        return _parse_themes(Path(path).read_text(encoding="utf-8"))
    if _themes_cache is None:
        if not PALETTE_PATH.is_file():
            raise FileNotFoundError(
                f"色卡规范缺失：{PALETTE_PATH} — video_dsl 资产未取回（G0 门禁）。"
            )
        _themes_cache = _parse_themes(PALETTE_PATH.read_text(encoding="utf-8"))
    return _themes_cache


def _parse_themes(text: str) -> dict[str, dict[str, str]]:
    themes: dict[str, dict[str, str]] = {}
    current: str | None = None
    for line in text.splitlines():
        header = _THEME_HEADER_RE.match(line.strip())
        if header:
            current = header.group("theme")
            themes.setdefault(current, {})
            continue
        if line.startswith("#"):
            current = None
            continue
        if current is None:
            continue
        row = _TOKEN_ROW_RE.match(line.strip())
        if row:
            themes[current][row.group("token")] = row.group("hex")
    return {theme: palette for theme, palette in themes.items() if palette}


def resolve_palette(style: dict | None) -> tuple[str, dict[str, str]]:
    """按样式链解析生效色板：内建主题 → style.theme → style.colors hex 覆盖。

    返回 ``(theme, palette)``；未声明主题时以 default 兜底（DSL §1）。
    """
    style = style or {}
    themes = load_themes()
    theme = str(style.get("theme") or "").strip() or DEFAULT_THEME
    if theme not in themes:
        theme = DEFAULT_THEME
    palette = dict(themes.get(theme) or themes.get(DEFAULT_THEME) or {})
    for token, value in (style.get("colors") or {}).items():
        if token in COLOR_TOKENS and isinstance(value, str) and value.startswith("#"):
            palette[token] = value
    return theme, palette


def palette_description(palette: dict[str, str]) -> str:
    """色板 → imagegen prompt 注入用的自然语言描述（色卡规范 §3：素材生成
    prompt 需注入当前生效的色板描述）。"""
    parts = [
        f"{token}({TOKEN_SEMANTICS.get(token, token)}) {palette[token]}"
        for token in COLOR_TOKENS
        if token in palette
    ]
    return "; ".join(parts)


__all__ = [
    "COLOR_TOKENS",
    "DEFAULT_THEME",
    "PALETTE_PATH",
    "TOKEN_SEMANTICS",
    "load_themes",
    "palette_description",
    "resolve_palette",
]

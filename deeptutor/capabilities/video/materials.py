"""video_spec 素材收集的结构化结果与摘要（improve-video-gen-flow D1/D2）。

D1：抓取结果结构化——素材文本 + 成功/失败 URL + 附件数，供 capability
做"全败中止"判定（``should_abort_on_fetch_failure``）。
D2：素材摘要为**纯截取**（标题 + 前 N 字符，不调 LLM，成本/延迟不变），
注入 style 设计与逐屏生成两个 LLM 调用点。
"""

from __future__ import annotations

from dataclasses import dataclass, field

SUMMARY_CHARS = 500


@dataclass(frozen=True)
class MaterialSource:
    """一份抓取/附件素材。"""

    label: str  # 来源标识（URL 或附件名）
    title: str  # 素材标题（抓取页 <title>；附件为文件名）
    text: str  # 正文（已截断）


@dataclass(frozen=True)
class GatheredMaterials:
    """``_gather_materials`` 的结构化返回。"""

    text: str  # 全文截断版（进 generate_spec 的 materials 占位符）
    summary: str  # 摘要版（进 design_style 与约束段）
    sources: list[MaterialSource] = field(default_factory=list)
    fetched_urls: list[str] = field(default_factory=list)  # 抓取成功的 URL
    failed_urls: list[str] = field(default_factory=list)
    attachment_count: int = 0  # 带 extracted_text 的附件数

    @property
    def has_content(self) -> bool:
        return bool(self.text.strip())


def summarize_material(source: MaterialSource, *, max_chars: int = SUMMARY_CHARS) -> str:
    """单份素材摘要：标题 + 前 N 字符（不调 LLM）。"""
    head = source.text.strip()[:max_chars]
    truncated = len(source.text.strip()) > max_chars
    title = source.title.strip() or source.label
    body = f"{head}…" if truncated else head
    return f"[{title}]\n{body}"


def summarize_materials(
    sources: list[MaterialSource], *, max_chars: int = SUMMARY_CHARS
) -> str:
    """多份素材摘要拼接；无素材返回空串。"""
    return "\n\n".join(
        summarize_material(source, max_chars=max_chars) for source in sources
    )


def should_abort_on_fetch_failure(
    *,
    urls_in_message: list[str],
    gathered: GatheredMaterials,
    allow_fetch_failure: bool,
) -> bool:
    """D1 中止判定：消息含 URL ∧ 全部抓取失败 ∧ 无附件素材 ∧ 未显式放行。"""
    if allow_fetch_failure or not urls_in_message:
        return False
    if gathered.attachment_count > 0:
        return False
    return not gathered.fetched_urls


__all__ = [
    "SUMMARY_CHARS",
    "GatheredMaterials",
    "MaterialSource",
    "should_abort_on_fetch_failure",
    "summarize_material",
    "summarize_materials",
]

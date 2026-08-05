"""两层校验：§10 JSON Schema 机器校验 + §13 语义复查。

- §10：jsonschema（draft 2020-12），schema 来自
  ``video_dsl/schema/concept-video.schema.json``（单一来源，D5）。
- §13：schema 未覆盖的跨字段规则——error 级（R1–R8：formula 必配
  numeric_example、conclusion 恰好 3 卡、core_message ≤120、opening.title
  ≤14、narration.explanation 非空、visual.primary 非空、chart 必配 data、
  新场景必填槽位）+ warning 级（W9/W10：next_question 衔接提醒）。

错误统一为 :class:`SpecError` 结构化列表（屏号 + 字段 + 原因），供
capability 回炉时注入 LLM 提示词。
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

from deeptutor.capabilities.video.schema import load_schema

CORE_MESSAGE_MAX = 120
OPENING_TITLE_MAX = 14
CONCLUSION_KEY_CARDS = 3


@dataclass(frozen=True)
class SpecError:
    """一条结构化校验错误。

    ``scene`` 为 1 基屏号（对应 s01/s02/……），``None`` 表示顶层/片头。
    """

    rule: str  # "schema" | "semantic"
    field: str  # 出错字段路径，如 "scenes[2].numeric_example"
    message: str  # 人类可读原因（回炉时原样喂给 LLM）
    scene: int | None = None
    severity: str = "error"  # "error"（阻断回炉）| "warning"（记录不阻断）

    def render(self) -> str:
        where = f"第 {self.scene} 屏" if self.scene is not None else "顶层"
        prefix = "warning: " if self.severity == "warning" else ""
        return f"[{where}] {self.field}: {prefix}{self.message}"


def _schema_validator():
    """构建 draft 2020-12 validator；缺依赖时报清晰错误。"""
    try:
        from jsonschema import Draft202012Validator
    except ImportError as exc:  # pragma: no cover - 环境缺依赖时
        raise RuntimeError(
            "video spec 校验需要 jsonschema 包（draft 2020-12）：pip install jsonschema"
        ) from exc
    schema = load_schema()
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def _scene_index_of(path: Any) -> int | None:
    """从 jsonschema 错误的 absolute_path 提取 1 基屏号。"""
    parts = list(path)
    if len(parts) >= 2 and parts[0] == "scenes" and isinstance(parts[1], int):
        return parts[1] + 1
    return None


def _field_of(path: Any) -> str:
    parts = [str(p) for p in path]
    return ".".join(parts) if parts else "(root)"


def validate_schema(data: dict[str, Any]) -> list[SpecError]:
    """§10 机器校验，返回结构化错误列表（空 = 通过）。"""
    validator = _schema_validator()
    errors: list[SpecError] = []
    for err in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path)):
        errors.append(
            SpecError(
                rule="schema",
                field=_field_of(err.absolute_path),
                message=err.message,
                scene=_scene_index_of(err.absolute_path),
            )
        )
    return errors


def _bigrams(text: str) -> set[str]:
    """连续 2 字子串集合（去空白/标点），W10 呼应启发式。"""
    clean = re.sub(r"[\s\W_]+", "", text, flags=re.UNICODE)
    return {clean[i : i + 2] for i in range(len(clean) - 1)}


def _flatten_content_slots(data: dict[str, Any]) -> None:
    """把场景内误用的 ``content_slots`` 包装键展开到场景顶层（原地修改）。

    DSL 的 content_slots 是场景类型专有字段、直接平铺在场景上；LLM（实测
    DeepSeek V4 Pro）经常错误地包一层 ``content_slots: {...}``，导致
    additionalProperties 校验反复失败、三次回炉都修不回来。直接键优先
    （平铺字段已存在时不覆盖），包装键随后删除。
    """
    scenes = data.get("scenes")
    if not isinstance(scenes, list):
        return
    for scene in scenes:
        if not isinstance(scene, dict):
            continue
        slots = scene.pop("content_slots", None)
        if isinstance(slots, dict):
            for key, value in slots.items():
                scene.setdefault(key, value)


def semantic_review(
    data: dict[str, Any],
    *,
    known_skills: set[str] | None = None,
    reference_text: str = "",
) -> list[SpecError]:
    """§13 语义复查最小集（schema 通过后再跑；跨字段规则不进 schema）。

    ``known_skills`` 给出已安装特效技能标识集合时，额外做 warning 级复查：
    ``style.effects.background.skill``（顶层与分镜级）引用未安装技能 →
    warning（不阻断；渲染层按白名单降级占位帧，D8/§12）。
    ``reference_text``（用户消息 + 素材标题）非空时做 W11 相关性复查：
    spec 标题集与参考文本字符级 bigram 零重合 → warning（启发式，不阻断、
    不回炉，improve-video-gen-flow D3）。
    """
    errors: list[SpecError] = []

    opening = data.get("opening") or {}
    title = opening.get("title")
    if isinstance(title, str) and len(title) > OPENING_TITLE_MAX:
        errors.append(
            SpecError(
                rule="semantic",
                field="opening.title",
                message=f"片头标题 {len(title)} 字，超过上限 {OPENING_TITLE_MAX} 字",
            )
        )

    if known_skills is not None:
        top_skill = (
            ((data.get("style") or {}).get("effects") or {}).get("background") or {}
        ).get("skill")
        if isinstance(top_skill, str) and top_skill and top_skill not in known_skills:
            errors.append(
                SpecError(
                    rule="semantic",
                    field="style.effects.background.skill",
                    message=f"引用未安装特效技能 {top_skill!r}（渲染层将降级占位帧）",
                    severity="warning",
                )
            )

    scenes = data.get("scenes") or []
    for idx, scene in enumerate(scenes, start=1):
        if not isinstance(scene, dict):
            continue
        scene_type = scene.get("type")

        if scene_type == "formula" and not str(scene.get("numeric_example") or "").strip():
            errors.append(
                SpecError(
                    rule="semantic",
                    field=f"scenes[{idx - 1}].numeric_example",
                    message="formula 场景必须配 numeric_example（代入真实数字的算例，§13.1）",
                    scene=idx,
                )
            )

        if scene_type == "conclusion":
            key_cards = scene.get("key_cards")
            count = len(key_cards) if isinstance(key_cards, list) else 0
            if count != CONCLUSION_KEY_CARDS:
                errors.append(
                    SpecError(
                        rule="semantic",
                        field=f"scenes[{idx - 1}].key_cards",
                        message=(
                            f"conclusion 场景 key_cards 必须恰好 {CONCLUSION_KEY_CARDS} 张"
                            f"（当前 {count} 张，§13.2）"
                        ),
                        scene=idx,
                    )
                )

        core_message = scene.get("core_message")
        if isinstance(core_message, str) and len(core_message) > CORE_MESSAGE_MAX:
            errors.append(
                SpecError(
                    rule="semantic",
                    field=f"scenes[{idx - 1}].core_message",
                    message=(
                        f"core_message {len(core_message)} 字，超过上限 "
                        f"{CORE_MESSAGE_MAX} 字（一页一结论，§13.3）"
                    ),
                    scene=idx,
                )
            )

        # R5: 主口播段非空（§13.5）
        narration = scene.get("narration") or {}
        if not str(narration.get("explanation") or "").strip():
            errors.append(
                SpecError(
                    rule="semantic",
                    field=f"scenes[{idx - 1}].narration.explanation",
                    message="narration.explanation（主口播段）不可为空（§13.5）",
                    scene=idx,
                )
            )

        # R6: 主视觉指令非空（§13.6）
        visual = scene.get("visual") or {}
        if not str(visual.get("primary") or "").strip():
            errors.append(
                SpecError(
                    rule="semantic",
                    field=f"scenes[{idx - 1}].visual.primary",
                    message="visual.primary（主视觉指令）不可为空（§13.6）",
                    scene=idx,
                )
            )

        # R7: chart 场景必配 data 外链（§13.7）
        if scene_type == "chart" and not str(scene.get("data") or "").strip():
            errors.append(
                SpecError(
                    rule="semantic",
                    field=f"scenes[{idx - 1}].data",
                    message="chart 场景必须配 data 数据外链（§13.7）",
                    scene=idx,
                )
            )

        # R8: 新场景必填槽位（§13.8）
        required_slots = {
            "big_number": ("number", "big_number 场景必配 number 大数字"),
            "quote": ("quote_text", "quote 场景必配 quote_text 金句正文"),
            "case_study": ("result", "case_study 场景必配 result 结果"),
        }
        if scene_type in required_slots:
            slot, msg = required_slots[scene_type]
            if not str(scene.get(slot) or "").strip():
                errors.append(
                    SpecError(
                        rule="semantic",
                        field=f"scenes[{idx - 1}].{slot}",
                        message=f"{msg}（§13.8）",
                        scene=idx,
                    )
                )
        min_items = {
            "data_comparison": ("metrics", 2, "data_comparison 场景 metrics 至少 2 条"),
            "timeline": ("events", 2, "timeline 场景 events 至少 2 个"),
            "recap": ("points", 2, "recap 场景 points 至少 2 条"),
        }
        if scene_type in min_items:
            slot, minimum, msg = min_items[scene_type]
            items = scene.get(slot)
            count = len(items) if isinstance(items, list) else 0
            if count < minimum:
                errors.append(
                    SpecError(
                        rule="semantic",
                        field=f"scenes[{idx - 1}].{slot}",
                        message=f"{msg}（当前 {count}，§13.8）",
                        scene=idx,
                    )
                )

        # W9/W10: transition.next_question 衔接（warning 级，不阻断）
        next_question = str((scene.get("transition") or {}).get("next_question") or "").strip()
        next_scene = scenes[idx] if idx < len(scenes) else None
        if next_scene is not None and not next_question:
            errors.append(
                SpecError(
                    rule="semantic",
                    field=f"scenes[{idx - 1}].transition.next_question",
                    message="非末屏建议填写 transition.next_question 以衔接下一屏（§13.9）",
                    scene=idx,
                    severity="warning",
                )
            )
        if isinstance(next_scene, dict) and next_question:
            following = str(next_scene.get("question") or "").strip()
            if following and not (_bigrams(next_question) & _bigrams(following)):
                errors.append(
                    SpecError(
                        rule="semantic",
                        field=f"scenes[{idx - 1}].transition.next_question",
                        message=(
                            "transition.next_question 与下一屏 question 无重合，"
                            "注意衔接（§13.10，启发式）"
                        ),
                        scene=idx,
                        severity="warning",
                    )
                )

        if known_skills is not None:
            scene_skill = (
                ((scene.get("style") or {}).get("effects") or {}).get("background") or {}
            ).get("skill")
            if isinstance(scene_skill, str) and scene_skill and scene_skill not in known_skills:
                errors.append(
                    SpecError(
                        rule="semantic",
                        field=f"scenes[{idx - 1}].style.effects.background.skill",
                        message=f"引用未安装特效技能 {scene_skill!r}（渲染层将降级占位帧）",
                        scene=idx,
                        severity="warning",
                    )
                )

    # W11: 相关性复查（warning 级）——spec 标题集（series + opening.title +
    # 各屏 title）与参考文本（用户消息 + 素材标题）字符级 bigram 零重合 →
    # 可能跑题。纯启发式，宁可误报不错报（improve-video-gen-flow D3）。
    if reference_text.strip():
        spec_titles = [str(data.get("series") or "")]
        if isinstance(title, str):
            spec_titles.append(title)
        for scene in scenes:
            if isinstance(scene, dict) and isinstance(scene.get("title"), str):
                spec_titles.append(scene["title"])
        spec_bigrams: set[str] = set()
        for text in spec_titles:
            spec_bigrams |= _bigrams(text)
        ref_bigrams = _bigrams(reference_text)
        if spec_bigrams and ref_bigrams and not (spec_bigrams & ref_bigrams):
            errors.append(
                SpecError(
                    rule="semantic",
                    field="series",
                    message=(
                        "spec 标题与输入主题/素材标题无任何重合，内容可能跑题"
                        "（§13.11，启发式 warning）"
                    ),
                    severity="warning",
                )
            )

    return errors


def validate_spec(
    data: dict[str, Any],
    *,
    known_skills: set[str] | None = None,
    reference_text: str = "",
) -> list[SpecError]:
    """完整两层校验：schema 不通过时短路（结构坏了语义复查无意义）。"""
    schema_errors = validate_schema(data)
    if schema_errors:
        return schema_errors
    return semantic_review(data, known_skills=known_skills, reference_text=reference_text)


def has_blocking_errors(errors: list[SpecError]) -> bool:
    """是否含 error 级问题（warning 不阻断生成/落盘）。"""
    return any(err.severity != "warning" for err in errors)


def format_errors_for_llm(errors: list[SpecError]) -> str:
    """结构化错误 → 回炉提示词文本（逐条：屏号 + 字段 + 原因）。"""
    lines = [f"- {err.render()}" for err in errors]
    return "\n".join(lines)


__all__ = [
    "CONCLUSION_KEY_CARDS",
    "CORE_MESSAGE_MAX",
    "OPENING_TITLE_MAX",
    "SpecError",
    "format_errors_for_llm",
    "has_blocking_errors",
    "semantic_review",
    "validate_schema",
    "validate_spec",
]

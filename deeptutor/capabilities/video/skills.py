"""特效技能包扫描 / 检索 / 项目级挂载（D8，规范：video_dsl/effect-skills.md）。

两个扫描位置（用户覆盖仓库，同名 user 胜）：

- ``video_dsl/skills/`` —— 仓库内建（进 git，随领域包分发）；
- ``data/skills/`` —— 用户安装位（运行时数据）。

与 DeepTutor 知识技能（``deeptutor/services/skill``，提示词/参考文档包）
互补：本模块只管含 component.tsx 的**渲染资源包**，供 video 系
capability 注入 LLM 上下文与校验 ``background.skill`` 引用。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from deeptutor.runtime.home import PACKAGE_ROOT

REQUIRED_FILES = ("SKILL.md", "component.tsx", "preview.png", "defaults.json")
COLOR_TOKENS = ("primary", "secondary", "accent", "success", "warning", "danger", "neutral")

_FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)


@dataclass(frozen=True)
class EffectSkill:
    """一个特效技能包的解析结果。"""

    name: str
    description: str
    params_schema: dict[str, Any]
    defaults: dict[str, Any]
    source: str  # "repo" | "user"
    directory: str
    always: bool = False
    has_component: bool = False
    has_preview: bool = False
    body: str = ""  # frontmatter 之后的正文（使用约束 + 示例 YAML）
    issues: list[str] = field(default_factory=list)  # 结构缺件等问题


def repo_skills_root() -> Path:
    return PACKAGE_ROOT / "video_dsl" / "skills"


def user_skills_root() -> Path:
    from deeptutor.services.path_service import get_path_service

    return get_path_service().workspace_root / "skills"


def _parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    match = _FRONTMATTER_RE.match(text)
    if not match:
        return {}, text
    try:
        data = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError:
        data = {}
    if not isinstance(data, dict):
        data = {}
    return data, text[match.end():]


def _load_skill(skill_dir: Path, source: str) -> EffectSkill | None:
    skill_file = skill_dir / "SKILL.md"
    if not skill_file.is_file():
        return None
    try:
        meta, body = _parse_frontmatter(skill_file.read_text(encoding="utf-8"))
    except OSError:
        return None
    name = str(meta.get("name") or "").strip() or skill_dir.name
    issues = [f"missing {f}" for f in REQUIRED_FILES if not (skill_dir / f).is_file()]
    try:
        defaults = json.loads((skill_dir / "defaults.json").read_text(encoding="utf-8"))
        if not isinstance(defaults, dict):
            defaults = {}
    except (OSError, ValueError):
        defaults = {}
    params = meta.get("params")
    return EffectSkill(
        name=name,
        description=str(meta.get("description") or "").strip(),
        params_schema=params if isinstance(params, dict) else {},
        defaults=defaults,
        source=source,
        directory=str(skill_dir),
        always=bool(meta.get("always")),
        has_component=(skill_dir / "component.tsx").is_file(),
        has_preview=(skill_dir / "preview.png").is_file(),
        body=body.strip(),
        issues=issues,
    )


def scan_effect_skills(
    *,
    repo_root: Path | None = None,
    user_root: Path | None = None,
) -> dict[str, EffectSkill]:
    """扫描两个技能位置，返回 {name: EffectSkill}（user 同名覆盖 repo）。"""
    skills: dict[str, EffectSkill] = {}
    for root, source in (
        (repo_root if repo_root is not None else repo_skills_root(), "repo"),
        (user_root if user_root is not None else user_skills_root(), "user"),
    ):
        if not root.is_dir():
            continue
        for skill_file in sorted(root.rglob("SKILL.md")):
            skill = _load_skill(skill_file.parent, source)
            if skill is not None:
                skills[skill.name] = skill
    return skills


def color_param_issues(skill: EffectSkill) -> list[str]:
    """params schema 中颜色参数未走 7 token 枚举的告警（规范 §2.1）。"""
    issues: list[str] = []
    properties = (skill.params_schema or {}).get("properties") or {}
    for param, spec in properties.items():
        if not isinstance(spec, dict):
            continue
        looks_color = "color" in param.lower() or "colour" in param.lower()
        if looks_color and spec.get("enum") != list(COLOR_TOKENS) and sorted(
            spec.get("enum") or []
        ) != sorted(COLOR_TOKENS):
            issues.append(f"颜色参数 {param!r} 未约束为 7 token 枚举")
        default = spec.get("default")
        if looks_color and isinstance(default, str) and default.startswith("#"):
            issues.append(f"颜色参数 {param!r} 默认值出现裸 hex")
    return issues


def render_skill_constraints(skills: list[EffectSkill]) -> str:
    """渲染注入 LLM 的技能约束文本：标识 + 描述 + params schema + 正文示例。"""
    blocks: list[str] = []
    for skill in skills:
        lines = [
            f"### 特效技能 {skill.name}",
            skill.description or "(no description)",
        ]
        if skill.params_schema:
            lines.append("参数 schema（params 必须遵守；颜色参数只许 7 个 token，禁裸 hex）：")
            lines.append(
                json.dumps(skill.params_schema, ensure_ascii=False, indent=2)
            )
        if skill.defaults:
            lines.append("默认参数：")
            lines.append(json.dumps(skill.defaults, ensure_ascii=False))
        if skill.body:
            lines.append(skill.body)
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def resolve_project_skills(
    video_dir: Path | None,
    overrides: dict[str, Any] | None = None,
    *,
    repo_root: Path | None = None,
    user_root: Path | None = None,
) -> tuple[list[EffectSkill], list[str]]:
    """项目级技能挂载（D8 分档的中期档）。

    优先级：overrides ``skills`` 显式列表 > ``<video_dir>/project.yaml``
    的 ``skills`` 声明 > always: true 技能。返回 ``(技能列表, warnings)``；
    声明了但未安装的技能名进 warnings（不阻断）。
    """
    overrides = overrides or {}
    catalog = scan_effect_skills(repo_root=repo_root, user_root=user_root)

    requested: list[str] | None = None
    explicit = overrides.get("skills")
    if isinstance(explicit, (list, tuple)) and explicit:
        requested = [str(name).strip() for name in explicit if str(name).strip()]
    elif video_dir is not None:
        project_file = Path(video_dir) / "project.yaml"
        if project_file.is_file():
            try:
                project = yaml.safe_load(project_file.read_text(encoding="utf-8")) or {}
            except yaml.YAMLError:
                project = {}
            declared = project.get("skills") if isinstance(project, dict) else None
            if isinstance(declared, list) and declared:
                requested = [str(name).strip() for name in declared if str(name).strip()]

    warnings: list[str] = []
    if requested is None:
        return [s for s in catalog.values() if s.always], warnings

    skills: list[EffectSkill] = []
    for name in requested:
        skill = catalog.get(name)
        if skill is None:
            warnings.append(f"skill-not-installed: {name}")
            continue
        skills.append(skill)
    return skills, warnings


__all__ = [
    "COLOR_TOKENS",
    "REQUIRED_FILES",
    "EffectSkill",
    "color_param_issues",
    "render_skill_constraints",
    "repo_skills_root",
    "resolve_project_skills",
    "scan_effect_skills",
    "user_skills_root",
]

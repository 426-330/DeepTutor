"""特效技能包 scanner / 校验 warning / 项目级挂载测试（tasks 6.1/6.3/6.6）。

规范：video_dsl/effect-skills.md。quant-video-remotion（知识技能，
frontmatter always: true）确认见 test_quant_domain_skill_always。
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from deeptutor.capabilities.video.skills import (
    color_param_issues,
    render_skill_constraints,
    resolve_project_skills,
    scan_effect_skills,
)
from deeptutor.capabilities.video.validator import (
    has_blocking_errors,
    semantic_review,
    validate_spec,
)

_SKILL_MD = """---
name: three/particle-wave
description: 粒子波浪背景
params:
  type: object
  additionalProperties: false
  properties:
    density: { type: number, minimum: 0, maximum: 1, default: 0.5 }
    color: { enum: [primary, secondary, accent, success, warning, danger, neutral], default: primary }
always: false
---

## 用法

```yaml
background: { type: particles, skill: three/particle-wave, params: { density: 0.6 } }
```
"""

_ALWAYS_MD = """---
name: bg/starfield
description: 星空背景（always）
params:
  type: object
  properties:
    color: { enum: [primary, secondary, accent, success, warning, danger, neutral] }
always: true
---
"""


def make_pack(root: Path, rel: str, skill_md: str, *, complete: bool = True) -> Path:
    pack = root / rel
    pack.mkdir(parents=True, exist_ok=True)
    (pack / "SKILL.md").write_text(skill_md, encoding="utf-8")
    if complete:
        (pack / "component.tsx").write_text("export default function C() {}")
        (pack / "preview.png").write_bytes(b"png")
        (pack / "defaults.json").write_text(json.dumps({"density": 0.5, "color": "primary"}))
    return pack


@pytest.fixture()
def skill_roots(tmp_path: Path):
    repo = tmp_path / "video_dsl" / "skills"
    user = tmp_path / "data" / "skills"
    make_pack(repo, "three/particle-wave", _SKILL_MD)
    make_pack(user, "bg/starfield", _ALWAYS_MD)
    return repo, user


class TestScanner:
    def test_scan_both_roots(self, skill_roots):
        repo, user = skill_roots
        catalog = scan_effect_skills(repo_root=repo, user_root=user)
        assert set(catalog) == {"three/particle-wave", "bg/starfield"}
        wave = catalog["three/particle-wave"]
        assert wave.source == "repo"
        assert wave.description == "粒子波浪背景"
        assert wave.params_schema["properties"]["density"]["maximum"] == 1
        assert wave.defaults == {"density": 0.5, "color": "primary"}
        assert wave.has_component and wave.has_preview
        assert wave.issues == []
        assert catalog["bg/starfield"].always is True

    def test_user_shadows_repo(self, skill_roots, tmp_path: Path):
        repo, user = skill_roots
        shadow = _SKILL_MD.replace("粒子波浪背景", "用户覆盖版")
        make_pack(user, "three/particle-wave", shadow)
        catalog = scan_effect_skills(repo_root=repo, user_root=user)
        assert catalog["three/particle-wave"].source == "user"
        assert catalog["three/particle-wave"].description == "用户覆盖版"

    def test_incomplete_pack_flagged(self, skill_roots):
        repo, user = skill_roots
        make_pack(user, "bg/broken", _ALWAYS_MD.replace("bg/starfield", "bg/broken"), complete=False)
        catalog = scan_effect_skills(repo_root=repo, user_root=user)
        broken = catalog["bg/broken"]
        assert "missing component.tsx" in broken.issues
        assert "missing defaults.json" in broken.issues

    def test_color_param_discipline(self, skill_roots):
        repo, user = skill_roots
        catalog = scan_effect_skills(repo_root=repo, user_root=user)
        assert color_param_issues(catalog["three/particle-wave"]) == []
        bad_md = _SKILL_MD.replace(
            "color: { enum: [primary, secondary, accent, success, warning, danger, neutral], default: primary }",
            "color: { type: string, default: '#FF0000' }",
        )
        make_pack(user, "three/particle-wave", bad_md)
        catalog = scan_effect_skills(repo_root=repo, user_root=user)
        issues = color_param_issues(catalog["three/particle-wave"])
        assert issues  # 裸 hex 默认值被抓


class TestRenderConstraints:
    def test_render_includes_schema_and_example(self, skill_roots):
        repo, user = skill_roots
        catalog = scan_effect_skills(repo_root=repo, user_root=user)
        text = render_skill_constraints([catalog["three/particle-wave"]])
        assert "three/particle-wave" in text
        assert "density" in text
        assert "background:" in text  # 正文示例 YAML 一并下发


class TestProjectMount:
    def test_project_yaml_declaration(self, skill_roots, tmp_path: Path):
        repo, user = skill_roots
        video_dir = tmp_path / "demo_ep01"
        video_dir.mkdir()
        (video_dir / "project.yaml").write_text(
            "skills: [three/particle-wave, no/such-skill]\n", encoding="utf-8"
        )
        skills, warnings = resolve_project_skills(
            video_dir, {}, repo_root=repo, user_root=user
        )
        assert [s.name for s in skills] == ["three/particle-wave"]
        assert warnings == ["skill-not-installed: no/such-skill"]

    def test_overrides_beat_project_yaml(self, skill_roots, tmp_path: Path):
        repo, user = skill_roots
        video_dir = tmp_path / "demo_ep01"
        video_dir.mkdir()
        (video_dir / "project.yaml").write_text("skills: [three/particle-wave]\n")
        skills, _ = resolve_project_skills(
            video_dir, {"skills": ["bg/starfield"]}, repo_root=repo, user_root=user
        )
        assert [s.name for s in skills] == ["bg/starfield"]

    def test_fallback_to_always(self, skill_roots, tmp_path: Path):
        repo, user = skill_roots
        skills, warnings = resolve_project_skills(
            tmp_path / "no-project", {}, repo_root=repo, user_root=user
        )
        assert [s.name for s in skills] == ["bg/starfield"]
        assert warnings == []


class TestSkillValidationWarning:
    def _spec_with_skill(self, skill: str, *, top_level: bool = False) -> dict:
        background = {"type": "particles", "skill": skill, "params": {"density": 0.5}}
        scene = {
            "type": "concept",
            "layout": "split",
            "title": "概念",
            "question": "问？",
            "core_message": "答。",
            "narration": {"opening": "开", "explanation": "讲", "conclusion": "收"},
            "visual": {"primary": "图"},
            "transition": {},
        }
        spec = {
            "version": "3.1",
            "series": "s",
            "episode": 1,
            "scenes": [scene],
        }
        if top_level:
            spec["style"] = {"effects": {"background": background}}
        else:
            scene["style"] = {"effects": {"background": background}}
        return spec

    def test_unknown_skill_warns_not_blocks(self):
        spec = self._spec_with_skill("three/unknown")
        errors = validate_spec(spec, known_skills={"three/particle-wave"})
        assert errors  # 有 warning
        assert all(e.severity == "warning" for e in errors)
        assert not has_blocking_errors(errors)
        assert "three/unknown" in errors[0].message
        assert errors[0].scene == 1

    def test_installed_skill_no_warning(self):
        spec = self._spec_with_skill("three/particle-wave")
        assert validate_spec(spec, known_skills={"three/particle-wave"}) == []

    def test_top_level_skill_warns(self):
        spec = self._spec_with_skill("three/unknown", top_level=True)
        errors = semantic_review(spec, known_skills=set())
        assert any(e.field == "style.effects.background.skill" for e in errors)

    def test_no_skill_check_when_catalog_not_given(self):
        spec = self._spec_with_skill("three/unknown")
        assert validate_spec(spec) == []  # known_skills=None → 不查


class TestQuantDomainSkill:
    def test_quant_domain_skill_always(self):
        """6.6 短期档确认：quant-video-remotion frontmatter always: true。"""
        from deeptutor.services.skill.service import SkillService

        entries = SkillService().summary_entries()
        quant = next((e for e in entries if e.name == "quant-video-remotion"), None)
        assert quant is not None, "quant-video-remotion 未安装"
        assert quant.always is True

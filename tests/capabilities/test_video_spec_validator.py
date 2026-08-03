"""video-spec 两层校验 + 版本迁移 + 辅助函数的单元测试。

覆盖 openspec change video-generation-system tasks 4.1/4.5 的验收口径：
正样本过、裸 hex 负样本拒、§13 语义复查触发、v3.0→v3.1 迁移、
whisperX 对齐产物结构（真实时长只进 .align.json）。
"""

from __future__ import annotations

import copy

import pytest

pytest.importorskip("jsonschema", reason="jsonschema 未安装（video spec §10 校验依赖）")

from deeptutor.capabilities.video.align import (
    build_whisperx_command,
    whisperx_json_to_align,
)
from deeptutor.capabilities.video.clarify import normalize_preset
from deeptutor.capabilities.video.migrations import migrate_spec
from deeptutor.capabilities.video.paths import slugify_series, spec_filename
from deeptutor.capabilities.video.spec_agent import extract_yaml
from deeptutor.capabilities.video.templates import get_blueprint
from deeptutor.capabilities.video.validator import (
    semantic_review,
    validate_schema,
    validate_spec,
)

_TYPES_LAYOUTS = [
    ("opening", "full-hero"),
    ("problem_hook", "split"),
    ("concept", "split"),
    ("formula", "formula-focus"),
    ("chart", "chart-full"),
    ("conclusion", "card-grid-3"),
    ("summary", "title-closing"),
]


def _valid_spec() -> dict:
    scenes = []
    for scene_type, layout in _TYPES_LAYOUTS:
        scene = {
            "type": scene_type,
            "layout": layout,
            "title": "什么是最大回撤",
            "question": "最大回撤衡量什么？",
            "core_message": "最大回撤衡量历史上最惨的一次从高点到低点的跌幅。",
            "narration": {
                "opening": "先看一个反常识的现象。",
                "explanation": "最大回撤是从净值高点到后续低点的最大跌幅。",
                "conclusion": "所以它衡量的是最差的持有体验。",
            },
            "visual": {"primary": "净值曲线从高点跌入谷底"},
            # 与下一屏 question "最大回撤衡量什么？" 呼应（§13.10 warning 级启发式）
            "transition": {"next_question": "那最大回撤是怎么衡量的？"},
        }
        if scene_type == "formula":
            scene["formula"] = "MDD = \\frac{V_{peak} - V_{trough}}{V_{peak}}"
            scene["variables"] = [{"symbol": "V_{peak}", "meaning": "净值高点"}]
            scene["numeric_example"] = "净值从 1.5 跌到 1.2，回撤 = (1.5-1.2)/1.5 = 20%。"
        if scene_type == "conclusion":
            scene["key_cards"] = ["卡一", "卡二", "卡三"]
            scene["takeaway"] = "回撤是体验的度量。"
        if scene_type == "chart":
            scene["chart_type"] = "line"
            scene["data"] = "returns.csv"
        scenes.append(scene)
    return {
        "version": "3.1",
        "series": "量化科普",
        "episode": 3,
        "fps": 30,
        "style": {
            "theme": "quant-traditional",
            "colors": {"primary": "#1A5FB4"},
            "fonts": {"title": {"family": "Noto Sans SC", "weight": 700}},
            "effects": {"transition": {"type": "fade", "frames": 12}},
        },
        "opening": {"title": "最大回撤是什么？", "subtitle": "为什么同样赚30%体验天差地别"},
        "scenes": scenes,
    }


class TestSchemaValidation:
    def test_valid_spec_passes_both_layers(self):
        spec = _valid_spec()
        assert validate_schema(spec) == []
        assert semantic_review(spec) == []
        assert validate_spec(spec) == []

    def test_scene_level_raw_hex_rejected(self):
        spec = _valid_spec()
        spec["scenes"][2]["style"] = {"colors": {"primary": "#FF0000"}}
        errors = validate_schema(spec)
        assert errors
        assert any(e.scene == 3 for e in errors)

    def test_unknown_color_token_key_rejected(self):
        spec = _valid_spec()
        spec["style"]["colors"]["brand"] = "#1A5FB4"
        assert validate_schema(spec) != []

    def test_unregistered_scene_type_rejected(self):
        spec = _valid_spec()
        spec["scenes"][0]["type"] = "dance"
        assert validate_schema(spec) != []

    def test_opening_title_over_limit_rejected(self):
        spec = _valid_spec()
        spec["opening"]["title"] = "长" * 15
        assert validate_spec(spec) != []


class TestSemanticReview:
    def test_formula_without_numeric_example_flagged(self):
        spec = _valid_spec()
        for scene in spec["scenes"]:
            if scene["type"] == "formula":
                del scene["numeric_example"]
        errors = semantic_review(spec)
        assert any(e.scene == 4 and "numeric_example" in e.field for e in errors)

    def test_conclusion_key_cards_must_be_exactly_three(self):
        spec = _valid_spec()
        for scene in spec["scenes"]:
            if scene["type"] == "conclusion":
                scene["key_cards"] = ["只有一张"]
        errors = semantic_review(spec)
        assert any("key_cards" in e.field for e in errors)

    def test_core_message_over_limit_flagged(self):
        spec = _valid_spec()
        spec["scenes"][0]["core_message"] = "长" * 121
        assert validate_spec(spec) != []

    def test_narration_explanation_required(self):
        """§13.5：主口播段不可为空（error 级）。"""
        spec = _valid_spec()
        spec["scenes"][0]["narration"]["explanation"] = ""
        errors = semantic_review(spec)
        assert any("narration.explanation" in e.field for e in errors)

    def test_visual_primary_required(self):
        """§13.6：主视觉指令不可为空（error 级）。"""
        spec = _valid_spec()
        spec["scenes"][0]["visual"]["primary"] = ""
        errors = semantic_review(spec)
        assert any("visual.primary" in e.field for e in errors)

    def test_chart_requires_data(self):
        """§13.7：chart 场景必配 data 外链（error 级）。"""
        spec = _valid_spec()
        for scene in spec["scenes"]:
            if scene["type"] == "chart":
                del scene["data"]
        errors = semantic_review(spec)
        assert any(e.field.endswith(".data") for e in errors)


class TestSemanticReviewNewScenes:
    """§13.8：6 个新场景类型的必填槽位复查（tasks 5.11/6.9）。"""

    def _scene(self, scene_type: str, **slots) -> dict:
        base = _valid_spec()["scenes"][0]
        return {**base, "type": scene_type, **slots}

    def _review(self, scene: dict):
        spec = _valid_spec()
        spec["scenes"][0] = scene
        return semantic_review(spec)

    def test_new_scene_types_pass_with_slots(self):
        cases = [
            ("data_comparison", {"layout": "comparison-2col", "metrics": [
                {"label": "a", "value": "1"}, {"label": "b", "value": "2"}]}),
            ("timeline", {"layout": "timeline-horizontal", "events": [
                {"label": "x"}, {"label": "y"}]}),
            ("quote", {"layout": "quote-center", "quote_text": "金句"}),
            ("big_number", {"layout": "number-spotlight", "number": "17.4"}),
            ("case_study", {"layout": "stacked", "result": "结果"}),
            ("recap", {"layout": "grid-3x2", "points": ["一", "二"]}),
        ]
        for scene_type, slots in cases:
            errors = self._review(self._scene(scene_type, **slots))
            assert errors == [], f"{scene_type} 带齐槽位应通过：{errors}"

    def test_new_scene_types_flagged_without_slots(self):
        cases = [
            ("big_number", {}, "number"),
            ("quote", {}, "quote_text"),
            ("case_study", {}, "result"),
            ("data_comparison", {"metrics": [{"label": "a", "value": "1"}]}, "metrics"),
            ("timeline", {"events": [{"label": "x"}]}, "events"),
            ("recap", {"points": ["一"]}, "points"),
        ]
        for scene_type, slots, field in cases:
            errors = self._review(self._scene(scene_type, **slots))
            assert any(e.field.endswith(f".{field}") for e in errors), scene_type

    def test_new_scene_types_pass_schema(self):
        """13 枚举 + 24 布局枚举均被 §10 schema 接受。"""
        spec = _valid_spec()
        spec["scenes"][0] = {
            **spec["scenes"][0],
            "type": "big_number",
            "layout": "number-spotlight",
            "number": "17.4",
        }
        assert validate_schema(spec) == []


class TestSemanticWarnings:
    """§13.9/13.10：warning 级复查不阻断（has_blocking_errors 为 False）。"""

    def test_missing_next_question_is_warning_not_blocking(self):
        spec = _valid_spec()
        spec["scenes"][0]["transition"] = {}
        errors = semantic_review(spec)
        from deeptutor.capabilities.video.validator import has_blocking_errors

        assert any(
            "next_question" in e.field and e.severity == "warning" for e in errors
        )
        assert not has_blocking_errors(errors)

    def test_uncorrelated_next_question_is_warning_not_blocking(self):
        spec = _valid_spec()
        spec["scenes"][0]["transition"] = {"next_question": "香蕉的价格是多少？"}
        errors = semantic_review(spec)
        from deeptutor.capabilities.video.validator import has_blocking_errors

        assert any(
            "next_question" in e.field and e.severity == "warning" for e in errors
        )
        assert not has_blocking_errors(errors)


class TestMigrations:
    def test_v30_without_style_passes_through_with_default_theme_note(self):
        spec = _valid_spec()
        spec["version"] = "3.0"
        del spec["style"]
        result = migrate_spec(spec)
        assert result.data["version"] == "3.1"
        assert any("default" in note for note in result.notes)
        assert validate_schema(result.data) == []

    def test_v31_is_noop(self):
        assert migrate_spec(_valid_spec()).migrated is False

    def test_unknown_version_raises(self):
        with pytest.raises(ValueError):
            migrate_spec({"version": "2.0", "scenes": []})


class TestHelpers:
    def test_blueprint_presets(self):
        assert len(get_blueprint("short-7")) == 7
        assert len(get_blueprint("standard-10")) == 10
        assert len(get_blueprint("full-13")) == 13

    def test_extract_yaml(self):
        fenced = '```yaml\nversion: "3.1"\nseries: x\n```'
        assert extract_yaml(fenced) == 'version: "3.1"\nseries: x'
        assert extract_yaml('version: "3.1"\nseries: x').startswith("version:")
        assert extract_yaml("no yaml here") == ""

    def test_normalize_preset_accepts_card_labels(self):
        assert normalize_preset("7 屏 (short-7)") == "short-7"
        assert normalize_preset("10 屏 (standard-10)") == "standard-10"
        assert normalize_preset("13 屏 (full-13)") == "full-13"
        assert normalize_preset("随便") == "standard-10"

    def test_slug_and_filename(self):
        assert slugify_series("Quant 101!") == "quant-101"
        assert slugify_series("量化科普") != ""
        assert spec_filename("lianghua", 3) == "lianghua_ep03.yaml"

    def test_whisperx_command(self):
        cmd = build_whisperx_command("s01.wav", language="zh")
        assert cmd.startswith("whisperx s01.wav")
        assert "--language zh" in cmd

    def test_whisperx_json_to_align_real_duration_and_cues(self):
        # narration-gen 验收口径：4.2s 音频 @30fps → 126 帧；cues 逐词对齐。
        wx = {
            "segments": [
                {
                    "start": 0.0,
                    "end": 4.2,
                    "words": [
                        {"word": "你", "start": 0.0, "end": 0.3},
                        {"word": "好", "start": 0.3, "end": 0.6},
                    ],
                }
            ]
        }
        align = whisperx_json_to_align(wx, scene=1, audio_name="s01.wav", fps=30)
        assert align["duration_seconds"] == 4.2
        assert align["duration_frames"] == 126
        assert align["cues"] == [
            {"start": 0.0, "end": 0.3, "text": "你"},
            {"start": 0.3, "end": 0.6, "text": "好"},
        ]

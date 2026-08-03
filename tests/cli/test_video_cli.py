"""video CLI 命令组测试（tasks 7.3）：preview / spec validate / render 参数装配。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

pytest.importorskip("jsonschema", reason="jsonschema 未安装（video spec 校验依赖）")

from deeptutor_cli.main import app

runner = CliRunner()

VALID_SPEC = """\
version: "3.1"
series: demo
episode: 1
fps: 30
style:
  theme: quant-traditional
opening:
  title: "测试标题"
scenes:
  - type: concept
    layout: split
    title: 标题
    question: 问题
    core_message: 结论
    narration: {opening: o, explanation: e, conclusion: c}
    visual: {primary: p}
    transition: {}
  - type: conclusion
    layout: card-grid-3
    title: 收束
    question: 带走了什么？
    core_message: 三个要点。
    narration: {opening: o, explanation: e, conclusion: c}
    visual: {primary: p}
    transition: {}
    key_cards: [卡一, 卡二, 卡三]
    takeaway: 带走
"""

SEMANTIC_INVALID_SPEC = """\
version: "3.1"
series: demo
episode: 1
scenes:
  - type: formula
    layout: formula-focus
    title: 标题
    question: 问题
    core_message: 结论
    narration: {opening: o, explanation: e, conclusion: c}
    visual: {primary: p}
    transition: {}
"""

SCHEMA_INVALID_SPEC = """\
version: "3.1"
series: demo
episode: 1
scenes:
  - type: dance
    layout: split
    title: 标题
    question: 问题
    core_message: 结论
    narration: {opening: o, explanation: e, conclusion: c}
    visual: {primary: p}
    transition: {}
"""


@pytest.fixture()
def spec_file(tmp_path: Path) -> Path:
    path = tmp_path / "demo_ep01.yaml"
    path.write_text(VALID_SPEC, encoding="utf-8")
    return path


class TestSpecValidate:
    def test_valid_spec_exit_0(self, spec_file: Path) -> None:
        result = runner.invoke(app, ["video", "spec", "validate", str(spec_file)])
        assert result.exit_code == 0, result.output
        # error 级问题不存在即通过（warning 级如 §13.9 建议不阻断、exit 仍为 0）
        assert "error " not in result.output

    def test_semantic_error_exit_1(self, tmp_path: Path) -> None:
        path = tmp_path / "bad_ep01.yaml"
        path.write_text(SEMANTIC_INVALID_SPEC, encoding="utf-8")
        result = runner.invoke(app, ["video", "spec", "validate", str(path)])
        assert result.exit_code == 1
        assert "numeric_example" in result.output

    def test_schema_error_json_format(self, tmp_path: Path) -> None:
        path = tmp_path / "bad_ep02.yaml"
        path.write_text(SCHEMA_INVALID_SPEC, encoding="utf-8")
        result = runner.invoke(app, ["video", "spec", "validate", str(path), "-f", "json"])
        assert result.exit_code == 1
        payload = json.loads(result.output)
        assert payload["valid"] is False
        assert payload["errors"]

    def test_missing_file_exit_1(self) -> None:
        result = runner.invoke(app, ["video", "spec", "validate", "no_such_spec_xyz"])
        assert result.exit_code == 1


class TestPreview:
    def test_preview_json(self, spec_file: Path) -> None:
        result = runner.invoke(app, ["video", "preview", str(spec_file), "-f", "json"])
        assert result.exit_code == 0, result.output
        payload = json.loads(result.output)
        assert payload["series"] == "demo"
        assert payload["scene_count"] == 2
        assert payload["theme"] == "quant-traditional"
        assert payload["total_frames"] == 180  # 2 屏 × 默认 90 帧
        assert payload["duration_seconds"] == 6.0
        assert payload["valid"] is True

    def test_preview_rich(self, spec_file: Path) -> None:
        result = runner.invoke(app, ["video", "preview", str(spec_file)])
        assert result.exit_code == 0
        assert "demo" in result.output
        assert "quant-traditional" in result.output


class TestRenderArgs:
    def test_frames_format_validation(self, spec_file: Path) -> None:
        result = runner.invoke(app, ["video", "render", str(spec_file), "--frames", "abc"])
        assert result.exit_code == 1
        assert "start:end" in result.output

    def test_frames_range_validation(self, spec_file: Path) -> None:
        result = runner.invoke(app, ["video", "render", str(spec_file), "--frames", "180:90"])
        assert result.exit_code == 1

    def test_render_missing_spec_exit_1(self) -> None:
        result = runner.invoke(app, ["video", "render", "no_such_spec_xyz"])
        assert result.exit_code == 1

    def test_help_lists_commands(self) -> None:
        result = runner.invoke(app, ["video", "--help"])
        assert result.exit_code == 0
        assert "render" in result.output
        assert "preview" in result.output

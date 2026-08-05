"""improve-video-gen-flow 验收测试（tasks 1–4）。

覆盖：D1 抓取全败中止/显式放行/部分失败继续；D2 素材摘要与提示词注入；
D3 W11 相关性 warning；D4 澄清语言解析与 clarify 键值对齐。
capability 级用例用 FakeAgent + fake web_fetch 驱动，不打真实 LLM/网络。
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

pytest.importorskip("jsonschema", reason="jsonschema 未安装（video spec 校验依赖）")

from deeptutor.capabilities.video.clarify import resolve_prompt_language
from deeptutor.capabilities.video.materials import (
    GatheredMaterials,
    MaterialSource,
    should_abort_on_fetch_failure,
    summarize_material,
    summarize_materials,
)
from deeptutor.capabilities.video.validator import has_blocking_errors, validate_spec
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream import StreamEvent, StreamEventType
from deeptutor.core.stream_bus import StreamBus
from deeptutor.services.path_service import PathService

# ---------------------------------------------------------------------------
# 纯函数层
# ---------------------------------------------------------------------------


class TestMaterialSummary:
    def test_summarize_material_title_plus_head(self) -> None:
        source = MaterialSource(label="u", title="太阳系", text="正文" * 400)
        summary = summarize_material(source, max_chars=100)
        assert summary.startswith("[太阳系]")
        assert summary.endswith("…")
        assert len(summary) < 200

    def test_summarize_material_short_text_not_truncated(self) -> None:
        source = MaterialSource(label="u", title="t", text="short")
        assert summarize_material(source) == "[t]\nshort"

    def test_summarize_materials_empty(self) -> None:
        assert summarize_materials([]) == ""


class TestAbortDecision:
    def _gathered(self, fetched=(), failed=("u1",), attachments=0) -> GatheredMaterials:
        return GatheredMaterials(
            text="", summary="", fetched_urls=list(fetched),
            failed_urls=list(failed), attachment_count=attachments,
        )

    def test_all_failed_aborts(self) -> None:
        assert should_abort_on_fetch_failure(
            urls_in_message=["u1"], gathered=self._gathered(), allow_fetch_failure=False
        )

    def test_explicit_override_continues(self) -> None:
        assert not should_abort_on_fetch_failure(
            urls_in_message=["u1"], gathered=self._gathered(), allow_fetch_failure=True
        )

    def test_partial_failure_continues(self) -> None:
        assert not should_abort_on_fetch_failure(
            urls_in_message=["u1", "u2"],
            gathered=self._gathered(fetched=("u2",)),
            allow_fetch_failure=False,
        )

    def test_attachment_present_continues(self) -> None:
        assert not should_abort_on_fetch_failure(
            urls_in_message=["u1"],
            gathered=self._gathered(attachments=1),
            allow_fetch_failure=False,
        )

    def test_no_url_never_aborts(self) -> None:
        assert not should_abort_on_fetch_failure(
            urls_in_message=[], gathered=self._gathered(), allow_fetch_failure=False
        )


class TestRelevanceWarning:
    def _spec(self, series: str, title: str) -> dict:
        return {
            "version": "3.1",
            "series": series,
            "episode": 1,
            "opening": {"title": title},
            "scenes": [
                {
                    "type": "concept",
                    "layout": "split",
                    "title": title,
                    "question": "q",
                    "core_message": "c",
                    "narration": {"opening": "o", "explanation": "e", "conclusion": "c"},
                    "visual": {"primary": "p"},
                    "transition": {},
                }
            ],
        }

    def test_zero_overlap_warns(self) -> None:
        spec = self._spec(series="烹饪入门", title="红烧肉的做法")
        errors = validate_spec(spec, reference_text="介绍太阳系行星")
        w11 = [e for e in errors if e.severity == "warning" and e.field == "series"]
        assert w11, errors
        assert "重合" in w11[0].message
        assert not has_blocking_errors(errors)

    def test_overlap_no_warning(self) -> None:
        spec = self._spec(series="太阳系科普", title="太阳系有几大行星")
        errors = validate_spec(spec, reference_text="介绍太阳系")
        assert not [e for e in errors if e.field == "series"]

    def test_no_reference_skips_check(self) -> None:
        spec = self._spec(series="烹饪入门", title="红烧肉的做法")
        assert not [e for e in validate_spec(spec) if e.field == "series"]


class TestPromptLanguage:
    def test_chinese_message_resolves_zh(self) -> None:
        assert resolve_prompt_language("做一期太阳系科普", "") == "zh"
        assert resolve_prompt_language("做一期太阳系科普", None) == "zh"

    def test_explicit_en_wins_over_chinese_message(self) -> None:
        assert resolve_prompt_language("做一期太阳系科普", "en") == "en"

    def test_explicit_zh(self) -> None:
        assert resolve_prompt_language("make a video", "zh") == "zh"

    def test_default_en_without_cjk(self) -> None:
        assert resolve_prompt_language("make a video about the solar system", "") == "en"


class TestClarifyCopyParity:
    def test_zh_en_clarify_and_status_keys_aligned(self) -> None:
        root = Path(__file__).resolve().parents[2]
        zh = yaml.safe_load(
            (root / "deeptutor/capabilities/prompts/zh/video_spec.yaml").read_text(encoding="utf-8")
        )
        en = yaml.safe_load(
            (root / "deeptutor/capabilities/prompts/en/video_spec.yaml").read_text(encoding="utf-8")
        )
        for section in ("clarify", "status"):
            assert set(zh.get(section, {})) == set(en.get(section, {})), section


# ---------------------------------------------------------------------------
# capability 级（FakeAgent + fake web_fetch）
# ---------------------------------------------------------------------------

VALID_YAML_TMPL = """\
version: "3.1"
series: 太阳系科普
episode: 1
opening:
  title: "太阳系"
scenes:
  - type: concept
    layout: split
    title: 太阳系有几大行星
    question: 太阳系有几大行星？
    core_message: 太阳系有八大行星。
    narration: {opening: o, explanation: e, conclusion: c}
    visual: {primary: p}
    transition: {}
"""

UNRELATED_YAML = """\
version: "3.1"
series: 烹饪入门
episode: 1
scenes:
  - type: concept
    layout: split
    title: 红烧肉的做法
    question: 怎么做红烧肉？
    core_message: 先焯水再慢炖。
    narration: {opening: o, explanation: e, conclusion: c}
    visual: {primary: p}
    transition: {}
"""


class _FakeAgent:
    """记录调用参数；generate_spec 返回可配置 YAML。"""

    calls: list[dict] = []
    spec_yaml: str = VALID_YAML_TMPL
    last_language: str = ""

    def __init__(self, **kwargs) -> None:
        type(self).last_language = kwargs.get("language", "")

    def set_trace_callback(self, _callback) -> None:
        pass

    async def design_style(self, **kwargs):
        type(self).calls.append(("design_style", kwargs))
        return {}

    async def generate_spec(self, **kwargs):
        type(self).calls.append(("generate_spec", kwargs))
        return type(self).spec_yaml


class _FakeFetchOutcome:
    def __init__(self, ok: bool, url: str, title: str = "", markdown: str = "", error: str = ""):
        self.ok = ok
        self.url = url
        self.title = title
        self.markdown = markdown
        self.error = error


def _install_common(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, spec_yaml: str) -> list:
    import deeptutor.capabilities.video.capability as cap_module
    import deeptutor.services.llm.config as llm_config_module
    import deeptutor.services.path_service as ps

    _FakeAgent.calls = []
    _FakeAgent.spec_yaml = spec_yaml
    monkeypatch.setattr(cap_module, "VideoSpecAgent", _FakeAgent)
    monkeypatch.setattr(
        llm_config_module,
        "get_llm_config",
        lambda: SimpleNamespace(api_key="k", base_url="u", api_version=None, model="m"),
    )
    monkeypatch.setattr(ps, "get_path_service", lambda: PathService(workspace_root=tmp_path))
    return _FakeAgent.calls


def _install_fetch(monkeypatch: pytest.MonkeyPatch, outcomes: dict[str, _FakeFetchOutcome]) -> None:
    import deeptutor.tools.web_fetch as web_fetch_module

    async def fake_fetch(url: str, **_kwargs):
        return outcomes.get(url) or _FakeFetchOutcome(False, url, error="blocked")

    monkeypatch.setattr(web_fetch_module, "fetch_url_as_markdown", fake_fetch)


async def _run(message: str, overrides: dict, language: str = "") -> list[StreamEvent]:
    from deeptutor.capabilities.video.capability import VideoSpecCapability

    bus = StreamBus()
    events: list[StreamEvent] = []

    async def consume():
        async for event in bus.subscribe():
            events.append(event)

    consumer = asyncio.create_task(consume())
    await asyncio.sleep(0)
    context = UnifiedContext(
        user_message=message,
        language=language,
        config_overrides={"skip_clarify": True, **overrides},
    )
    await VideoSpecCapability().run(context, bus)
    await asyncio.sleep(0)
    await bus.close()
    await consumer
    return events


def _result_payload(events: list[StreamEvent]) -> dict:
    for event in reversed(events):
        if event.type == StreamEventType.RESULT:
            return event.metadata
    return {}


class TestFetchFailureSemantics:
    ZHIHU = "https://zhuanlan.zhihu.com/p/123456"
    WIKI = "https://zh.wikipedia.org/wiki/太阳系"

    def test_all_fetch_failed_aborts_with_suggestions(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        _install_common(monkeypatch, tmp_path, VALID_YAML_TMPL)
        _install_fetch(monkeypatch, {})
        events = asyncio.run(_run(f"把这篇文章做成视频：{self.ZHIHU}", {}))
        payload = _result_payload(events)
        assert payload.get("ok") is False
        assert payload.get("error") == "fetch_all_failed"
        assert payload.get("failed_urls") == [self.ZHIHU]
        response = payload.get("response", "")
        # 三个可操作建议：粘贴正文 / 上传文档 / allow_fetch_failure 放行
        assert "粘贴" in response and "附件" in response and "allow_fetch_failure" in response
        # 不产生 spec 文件，且未调 LLM
        assert not list((tmp_path / "videos").glob("*.yaml"))
        assert _FakeAgent.calls == []

    def test_explicit_override_continues_with_warnings(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        _install_common(monkeypatch, tmp_path, VALID_YAML_TMPL)
        _install_fetch(monkeypatch, {})
        events = asyncio.run(
            _run(
                f"把这篇文章做成视频：{self.ZHIHU}",
                {"allow_fetch_failure": True},
            )
        )
        payload = _result_payload(events)
        assert payload.get("ok") is True, payload.get("response")
        assert payload.get("warnings") == [f"fetch_failed: {self.ZHIHU}"]

    def test_partial_failure_continues_with_warnings(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        _install_common(monkeypatch, tmp_path, VALID_YAML_TMPL)
        _install_fetch(
            monkeypatch,
            {self.WIKI: _FakeFetchOutcome(True, self.WIKI, title="太阳系", markdown="行星" * 200)},
        )
        events = asyncio.run(_run(f"做视频 {self.WIKI} 和 {self.ZHIHU}", {}))
        payload = _result_payload(events)
        assert payload.get("ok") is True, payload.get("response")
        assert payload.get("warnings") == [f"fetch_failed: {self.ZHIHU}"]
        # 成功素材进入生成提示词
        gen = dict(_FakeAgent.calls)["generate_spec"]
        assert "行星" in gen["materials"]


class TestMaterialInjection:
    def test_summary_injected_into_both_llm_calls(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        _install_common(monkeypatch, tmp_path, VALID_YAML_TMPL)
        _install_fetch(
            monkeypatch,
            {
                "https://zh.wikipedia.org/wiki/太阳系": _FakeFetchOutcome(
                    True,
                    "https://zh.wikipedia.org/wiki/太阳系",
                    title="太阳系",
                    markdown="水星金星地球" * 100,
                )
            },
        )
        events = asyncio.run(_run("做视频 https://zh.wikipedia.org/wiki/太阳系", {}))
        assert _result_payload(events).get("ok") is True
        calls = dict(_FakeAgent.calls)
        style_call = calls["design_style"]
        gen_call = calls["generate_spec"]
        # 摘要进 style 设计与 spec 生成两个调用点（D2）
        assert "太阳系" in style_call["materials_summary"]
        assert "水星金星地球" in style_call["materials_summary"]
        assert "太阳系" in gen_call["materials_summary"]
        # 全文截断版仍进 materials
        assert len(gen_call["materials"]) > len(gen_call["materials_summary"])

    def test_spec_system_has_grounding_constraint(self) -> None:
        root = Path(__file__).resolve().parents[2]
        for lang, needles in (
            ("zh", ("不得编造", "素材")),
            ("en", ("fabricate", "grounded")),
        ):
            prompts = yaml.safe_load(
                (root / f"deeptutor/capabilities/prompts/{lang}/video_spec.yaml").read_text(
                    encoding="utf-8"
                )
            )
            system = prompts["spec_system"]
            for needle in needles:
                assert needle in system, f"{lang} spec_system missing {needle}"


class TestCapabilityLevelWarnings:
    def test_unrelated_spec_produces_w11_but_still_saved(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        _install_common(monkeypatch, tmp_path, UNRELATED_YAML)
        events = asyncio.run(_run("介绍太阳系", {}))
        payload = _result_payload(events)
        assert payload.get("ok") is True, payload.get("response")
        warnings = payload.get("validation_warnings") or []
        assert any("重合" in w for w in warnings), warnings
        # warning 不阻断：spec 已落盘
        assert Path(payload["spec_path"]).is_file()

    def test_chinese_message_selects_chinese_prompts(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        _install_common(monkeypatch, tmp_path, VALID_YAML_TMPL)
        events = asyncio.run(_run("介绍太阳系", {}, language=""))
        assert _result_payload(events).get("ok") is True
        assert _FakeAgent.last_language == "zh"

    def test_explicit_en_selects_english_prompts(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        _install_common(monkeypatch, tmp_path, VALID_YAML_TMPL)
        events = asyncio.run(_run("介绍太阳系", {}, language="en"))
        assert _result_payload(events).get("ok") is True
        assert _FakeAgent.last_language == "en"

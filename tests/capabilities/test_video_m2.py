"""asset_gen / video_compose / video_pipeline 辅助层单元测试（M2，tasks 5.1/5.3）。

覆盖：主题色板解析与样式链覆盖、插画 prompt 色板注入、截图命令、BGM 解析、
chart data 引用、worker_client（health → POST /render → 轮询产物，含 409
job_id 后缀重试与 400 结构化错误）、pipeline_state 断点判定。
"""

from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

from deeptutor.capabilities.video.assets import (
    build_illustration_prompt,
    build_screenshot_command,
    chart_data_refs,
    resolve_bgm,
)
from deeptutor.capabilities.video.pipeline_state import PIPELINE_STAGES, PipelineState
from deeptutor.capabilities.video.themes import load_themes, resolve_palette
from deeptutor.capabilities.video.worker_client import (
    resolve_worker_url,
    shared_render_path,
    submit_render,
)


class TestThemes:
    def test_builtin_themes_parsed(self):
        themes = load_themes()
        assert set(themes) >= {"default", "quant-traditional"}
        assert themes["default"]["primary"] == "#2563EB"
        assert themes["quant-traditional"]["primary"] == "#1A5FB4"
        assert len(themes["default"]) == 7

    def test_new_themes_parsed(self):
        """tasks 6.9：tech-minimal / warm-editorial 从色卡规范解析出全 7 token。"""
        themes = load_themes()
        assert set(themes) >= {"tech-minimal", "warm-editorial"}
        assert themes["tech-minimal"]["primary"] == "#0284C7"
        assert themes["warm-editorial"]["primary"] == "#C2410C"
        assert len(themes["tech-minimal"]) == 7
        assert len(themes["warm-editorial"]) == 7

    def test_resolve_palette_default_fallback(self):
        theme, palette = resolve_palette(None)
        assert theme == "default"
        theme, palette = resolve_palette({"theme": "no-such-theme"})
        assert theme == "default"

    def test_resolve_palette_applies_hex_override(self):
        theme, palette = resolve_palette(
            {"theme": "quant-traditional", "colors": {"primary": "#FF8800", "brand": "#000000"}}
        )
        assert theme == "quant-traditional"
        assert palette["primary"] == "#FF8800"
        assert "brand" not in palette


class TestAssetHelpers:
    def test_illustration_prompt_injects_palette(self):
        prompt = build_illustration_prompt(
            "净值曲线跌入谷底", palette_desc="primary(主色) #1A5FB4", scene_title="回撤"
        )
        assert "净值曲线跌入谷底" in prompt
        assert "#1A5FB4" in prompt
        assert "no text" in prompt

    def test_screenshot_command(self):
        cmd = build_screenshot_command("https://example.com/a b", "s01_web.png")
        assert "playwright screenshot" in cmd
        assert "'https://example.com/a b'" in cmd  # shlex 引用带空格 URL

    def test_resolve_bgm(self, tmp_path: Path):
        videos = tmp_path / "videos"
        (videos / "bgm").mkdir(parents=True)
        track = videos / "bgm" / "calm.mp3"
        track.write_bytes(b"fake")
        assert resolve_bgm(videos, "auto") == track
        assert resolve_bgm(videos, "calm.mp3") == track
        assert resolve_bgm(videos, str(track)) == track
        assert resolve_bgm(videos, "missing.mp3") is None

    def test_chart_data_refs(self):
        scenes = [
            {"type": "concept"},
            {"type": "chart", "data": "returns.csv"},
            {"type": "chart"},
        ]
        assert chart_data_refs(scenes) == [(2, "returns.csv")]


class _FakeWorkerHandler(BaseHTTPRequestHandler):
    """最小 worker 替身：/health + /render（202 后异步落 mp4）。"""

    jobs: dict[str, int] = {}
    out_dir: Path = Path(".")
    mode: str = "ok"

    def log_message(self, *_args):  # 静音
        return

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"status": "ok"})
        else:
            self._json(404, {})

    def do_POST(self):
        if self.path != "/render":
            self._json(404, {})
            return
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        job_id = body.get("job_id", "")
        if self.mode == "reject":
            self._json(
                400,
                {
                    "error": "spec validation failed",
                    "details": [{"path": "/scenes/0/type", "message": "bad type"}],
                },
            )
            return
        if job_id in self.jobs:
            self._json(409, {"error": "duplicate"})
            return
        self.jobs[job_id] = 1
        self._json(202, {"job_id": job_id, "status": "accepted", "total_frames": 90, "fps": 30})
        # 模拟异步渲染落盘
        threading.Thread(
            target=self._write_output, args=(job_id,), daemon=True
        ).start()

    def _write_output(self, job_id: str):
        time.sleep(0.3)
        renders = self.out_dir / "renders"  # 与 shared_render_path 同约定
        renders.mkdir(parents=True, exist_ok=True)
        (renders / f"{job_id}.mp4").write_bytes(b"mp4")

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture()
def fake_worker(tmp_path: Path):
    _FakeWorkerHandler.jobs = {}
    _FakeWorkerHandler.out_dir = tmp_path
    _FakeWorkerHandler.mode = "ok"
    server = HTTPServer(("127.0.0.1", 0), _FakeWorkerHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}", tmp_path
    server.shutdown()


class TestWorkerClient:
    def test_shared_render_path(self, tmp_path: Path):
        assert shared_render_path(tmp_path, "j1") == tmp_path / "renders" / "j1.mp4"

    def test_resolve_worker_url_override_wins(self):
        assert resolve_worker_url({"worker_url": "http://x:1234/"}) == "http://x:1234"

    def test_resolve_worker_url_default(self, monkeypatch):
        from deeptutor.services.config.runtime_settings import RuntimeSettingsService

        monkeypatch.setattr(
            RuntimeSettingsService,
            "load_integrations",
            lambda self, **kw: {"remotion_worker_url": ""},
        )
        assert resolve_worker_url({}) == "http://localhost:3100"

    def test_resolve_worker_url_from_settings(self, monkeypatch):
        from deeptutor.services.config.runtime_settings import RuntimeSettingsService

        monkeypatch.setattr(
            RuntimeSettingsService,
            "load_integrations",
            lambda self, **kw: {"remotion_worker_url": "http://worker:3100"},
        )
        assert resolve_worker_url({}) == "http://worker:3100"

    @pytest.mark.asyncio
    async def test_submit_render_success(self, fake_worker):
        url, out_dir = fake_worker
        outcome = await submit_render(
            worker_url=url,
            yaml_path=Path("data/videos/demo_ep01.yaml"),
            job_id="demo",
            videos_root=out_dir,
            timeout_s=10,
            poll_interval_s=0.1,
        )
        assert outcome.ok
        assert outcome.job_id == "demo"
        assert outcome.total_frames == 90 and outcome.fps == 30
        assert Path(outcome.output_path).read_bytes() == b"mp4"

    @pytest.mark.asyncio
    async def test_submit_render_409_retries_with_suffix(self, fake_worker):
        url, out_dir = fake_worker
        _FakeWorkerHandler.jobs["demo"] = 1  # 占位 → 409
        outcome = await submit_render(
            worker_url=url,
            yaml_path=Path("x.yaml"),
            job_id="demo",
            videos_root=out_dir,
            timeout_s=10,
            poll_interval_s=0.1,
        )
        assert outcome.ok
        assert outcome.job_id == "demo-v2"

    @pytest.mark.asyncio
    async def test_submit_render_400_structured_error(self, fake_worker):
        url, out_dir = fake_worker
        _FakeWorkerHandler.mode = "reject"
        outcome = await submit_render(
            worker_url=url,
            yaml_path=Path("x.yaml"),
            job_id="demo",
            videos_root=out_dir,
            timeout_s=5,
            poll_interval_s=0.1,
        )
        assert not outcome.ok
        assert outcome.error == "spec validation failed"
        assert outcome.details[0]["path"] == "/scenes/0/type"

    @pytest.mark.asyncio
    async def test_submit_render_worker_unreachable(self, tmp_path: Path):
        outcome = await submit_render(
            worker_url="http://127.0.0.1:1",
            yaml_path=Path("x.yaml"),
            job_id="demo",
            videos_root=tmp_path,
            timeout_s=5,
            poll_interval_s=0.1,
        )
        assert not outcome.ok
        assert "unreachable" in outcome.error


class TestPipelineState:
    def test_mark_and_is_done_with_existing_artifacts(self, tmp_path: Path):
        artifact = tmp_path / "spec.yaml"
        artifact.write_text("version: '3.1'")
        state = PipelineState.load(tmp_path)
        assert not state.is_done("video_spec")
        state.mark_done("video_spec", {"spec_path": str(artifact)})
        assert state.is_done("video_spec")

        reloaded = PipelineState.load(tmp_path)
        assert reloaded.is_done("video_spec")
        assert json.loads((tmp_path / "pipeline_state.json").read_text())["stages"]["video_spec"]["status"] == "done"

    def test_is_done_false_when_artifact_deleted(self, tmp_path: Path):
        artifact = tmp_path / "spec.yaml"
        artifact.write_text("x")
        state = PipelineState.load(tmp_path)
        state.mark_done("video_spec", {"spec_path": str(artifact)})
        artifact.unlink()
        assert not PipelineState.load(tmp_path).is_done("video_spec")

    def test_mark_failed(self, tmp_path: Path):
        state = PipelineState.load(tmp_path)
        state.mark_failed("video_compose", "worker unreachable")
        assert not state.is_done("video_compose")
        assert state.stage_record("video_compose")["status"] == "failed"

    def test_stage_order(self):
        assert PIPELINE_STAGES == ("video_spec", "asset_gen", "narration_gen", "video_compose")

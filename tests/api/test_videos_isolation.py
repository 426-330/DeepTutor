"""多用户隔离验证（tasks 7.5）：data/users/<uid> 下 videos 树互不干扰。

paths.py 挂 PathService.workspace_root（多用户场景随 scope 切换）；本测试用
两个独立 workspace root 双 scope 实测 paths 层与 videos 路由层的隔离。
"""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

pytest.importorskip("jsonschema", reason="jsonschema 未安装")
fastapi = pytest.importorskip("fastapi", reason="fastapi 未安装")
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from deeptutor.services.path_service import PathService  # noqa: E402

VALID_SPEC_TMPL = """\
version: "3.1"
series: {series}
episode: 1
scenes:
  - type: concept
    layout: split
    title: 标题
    question: 问题
    core_message: 结论
    narration: {{opening: o, explanation: e, conclusion: c}}
    visual: {{primary: p}}
    transition: {{}}
"""


@pytest.fixture()
def two_scopes(tmp_path: Path):
    alice_root = tmp_path / "users" / "alice"
    bob_root = tmp_path / "users" / "bob"
    alice_root.mkdir(parents=True)
    bob_root.mkdir(parents=True)
    return {
        "alice": PathService(workspace_root=alice_root),
        "bob": PathService(workspace_root=bob_root),
    }


def _use_scope(monkeypatch: pytest.MonkeyPatch, service: PathService) -> None:
    """把 get_path_service 固定到指定 scope（模拟该用户的请求上下文）。"""
    import deeptutor.services.path_service as ps

    monkeypatch.setattr(ps, "get_path_service", lambda: service)


class TestPathsIsolation:
    def test_videos_root_follows_scope(self, two_scopes, monkeypatch) -> None:
        from deeptutor.capabilities.video.paths import (
            latest_spec_path,
            spec_path_for,
            videos_root,
        )

        _use_scope(monkeypatch, two_scopes["alice"])
        alice_spec = spec_path_for("demo", 1, create_dirs=True)
        alice_spec.write_text(VALID_SPEC_TMPL.format(series="alice-demo"), encoding="utf-8")
        assert str(alice_spec).startswith(str(two_scopes["alice"].workspace_root))
        assert videos_root() == two_scopes["alice"].workspace_root / "videos"
        assert latest_spec_path() == alice_spec

        # 切到 bob：看不到 alice 的 spec
        _use_scope(monkeypatch, two_scopes["bob"])
        assert videos_root() == two_scopes["bob"].workspace_root / "videos"
        with pytest.raises(FileNotFoundError):
            latest_spec_path()

        # bob 写自己的 spec，互不可见
        bob_spec = spec_path_for("demo", 1, create_dirs=True)
        bob_spec.write_text(VALID_SPEC_TMPL.format(series="bob-demo"), encoding="utf-8")
        assert latest_spec_path() == bob_spec
        assert bob_spec.read_text(encoding="utf-8") != alice_spec.read_text(encoding="utf-8")

        _use_scope(monkeypatch, two_scopes["alice"])
        assert latest_spec_path() == alice_spec


class TestRouterIsolation:
    def _client_for(self, service: PathService, monkeypatch) -> TestClient:
        module = importlib.import_module("deeptutor.api.routers.videos")
        importlib.reload(module)
        _use_scope(monkeypatch, service)
        app = FastAPI()
        app.include_router(module.router, prefix="/api/v1/videos")
        return TestClient(app)

    def test_router_list_isolated_per_scope(self, two_scopes, monkeypatch) -> None:
        alice_client = self._client_for(two_scopes["alice"], monkeypatch)
        resp = alice_client.put(
            "/api/v1/videos/demo_ep01/spec",
            json={"content": VALID_SPEC_TMPL.format(series="alice-demo")},
        )
        assert resp.status_code == 200, resp.text
        items = alice_client.get("/api/v1/videos").json()
        assert [item["name"] for item in items] == ["demo_ep01"]

        bob_client = self._client_for(two_scopes["bob"], monkeypatch)
        assert bob_client.get("/api/v1/videos").json() == []
        assert bob_client.get("/api/v1/videos/demo_ep01/spec").status_code == 404

        resp = bob_client.put(
            "/api/v1/videos/demo_ep01/spec",
            json={"content": VALID_SPEC_TMPL.format(series="bob-demo")},
        )
        assert resp.status_code == 200, resp.text

        # 同名视频在两个 scope 下内容各自独立（get_path_service 为请求级全局，
        # 每个客户端使用前重新绑定自己的 scope）
        alice_client = self._client_for(two_scopes["alice"], monkeypatch)
        assert "alice-demo" in alice_client.get("/api/v1/videos/demo_ep01/spec").text
        bob_client = self._client_for(two_scopes["bob"], monkeypatch)
        assert "bob-demo" in bob_client.get("/api/v1/videos/demo_ep01/spec").text


class TestHealthSummary:
    def test_health_summary_aggregates_metrics(
        self, two_scopes, monkeypatch, tmp_path: Path
    ) -> None:
        import json as _json

        module = importlib.import_module("deeptutor.api.routers.videos")
        importlib.reload(module)
        service = two_scopes["alice"]
        _use_scope(monkeypatch, service)

        # 造指标流：2 done + 1 error
        videos = service.workspace_root / "videos"
        videos.mkdir(parents=True, exist_ok=True)
        records = [
            {"ts": "t", "job_id": "j1", "status": "done", "duration_ms": 1000},
            {"ts": "t", "job_id": "j2", "status": "done", "duration_ms": 3000},
            {"ts": "t", "job_id": "j3", "status": "error", "duration_ms": 500, "error": "boom"},
        ]
        (videos / "render_metrics.jsonl").write_text(
            "\n".join(_json.dumps(r) for r in records) + "\n", encoding="utf-8"
        )

        app = FastAPI()
        app.include_router(module.router, prefix="/api/v1/videos")
        client = TestClient(app)
        resp = client.get("/api/v1/videos/health/summary")
        assert resp.status_code == 200
        payload = resp.json()
        assert payload["worker"]["url"].startswith("http")
        assert payload["worker"]["reachable"] is False  # 无真实 worker
        stats = payload["renders"]
        assert stats["total"] == 3
        assert stats["done"] == 2
        assert stats["failed"] == 1
        assert stats["success_rate"] == pytest.approx(2 / 3, rel=1e-3)
        assert stats["avg_duration_ms"] == 2000

"""videos 路由冒烟测试：tmp 目录造假 videos 树，覆盖 list / spec get / put（含 400）。"""

from __future__ import annotations

import importlib
import json
from pathlib import Path

import pytest

try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
except Exception:  # pragma: no cover - optional dependency in lightweight envs
    FastAPI = None
    TestClient = None

try:  # PUT 校验路径依赖 jsonschema（§10 schema 校验）
    import jsonschema  # noqa: F401

    _HAS_JSONSCHEMA = True
except Exception:  # pragma: no cover
    _HAS_JSONSCHEMA = False

pytestmark = pytest.mark.skipif(
    FastAPI is None or TestClient is None or not _HAS_JSONSCHEMA,
    reason="fastapi/jsonschema not installed",
)

if FastAPI is not None and TestClient is not None:
    videos_router_module = importlib.import_module("deeptutor.api.routers.videos")
    router = videos_router_module.router
else:  # pragma: no cover - optional dependency in lightweight envs
    videos_router_module = None
    router = None

VALID_SPEC = """\
version: "3.1"
series: demo
episode: 1
scenes:
  - type: concept
    layout: centered-text
    title: 标题
    question: 问题
    core_message: 结论
    narration: {opening: o, explanation: e, conclusion: c}
    visual: {primary: p}
    transition: {}
"""

# schema 通过但 §13 语义不通过：formula 场景缺 numeric_example
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

# §10 schema 不通过：缺 scenes
SCHEMA_INVALID_SPEC = """\
version: "3.1"
series: demo
episode: 1
"""


def _build_app(videos_root: Path) -> FastAPI:
    if FastAPI is None or router is None:  # pragma: no cover - guarded by pytestmark
        raise RuntimeError("fastapi is not installed")
    videos_router_module.videos_root = lambda: videos_root
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/videos")
    return app


@pytest.fixture()
def client(tmp_path: Path):
    root = tmp_path / "videos"
    root.mkdir()
    yield TestClient(_build_app(root))
    importlib.reload(videos_router_module)


def _seed_video(root_client, spec: str = VALID_SPEC) -> None:
    """经 PUT 写一集合法 spec（同时覆盖 put 成功路径）。"""
    resp = root_client.put("/api/v1/videos/demo_ep01/spec", json={"content": spec})
    assert resp.status_code == 200, resp.text


def test_put_and_get_spec_roundtrip(client: TestClient) -> None:
    _seed_video(client)
    resp = client.get("/api/v1/videos/demo_ep01/spec")
    assert resp.status_code == 200
    assert resp.text == VALID_SPEC

    resp = client.get("/api/v1/videos/missing_ep99/spec")
    assert resp.status_code == 404


def test_list_videos(client: TestClient, tmp_path: Path) -> None:
    assert client.get("/api/v1/videos").json() == []

    _seed_video(client)
    video_dir = tmp_path / "videos" / "demo_ep01"
    renders = video_dir / "renders"
    renders.mkdir(parents=True)
    (renders / "demo_ep01.mp4").write_bytes(b"fake-mp4")
    (video_dir / "pipeline_state.json").write_text(
        json.dumps(
            {
                "version": 1,
                "stages": {"video_spec": {"status": "done"}, "asset_gen": {"status": "failed"}},
            }
        ),
        encoding="utf-8",
    )

    items = client.get("/api/v1/videos").json()
    assert len(items) == 1
    item = items[0]
    assert item["name"] == "demo_ep01"
    assert item["series_slug"] == "demo"
    assert item["episode"] == 1
    assert item["has_spec"] is True
    assert item["scene_count"] == 1
    assert item["renders"] == ["demo_ep01"]
    assert item["stages"]["video_spec"]["status"] == "done"


def test_put_spec_validation_errors(client: TestClient) -> None:
    # §13 语义错误：带屏号 + 字段 + 原因的结构化错误
    resp = client.put("/api/v1/videos/demo_ep01/spec", json={"content": SEMANTIC_INVALID_SPEC})
    assert resp.status_code == 400
    errors = resp.json()["detail"]["errors"]
    assert errors[0]["rule"] == "semantic"
    assert errors[0]["scene"] == 1
    assert "numeric_example" in errors[0]["field"]

    # §10 schema 错误
    resp = client.put("/api/v1/videos/demo_ep01/spec", json={"content": SCHEMA_INVALID_SPEC})
    assert resp.status_code == 400
    assert resp.json()["detail"]["errors"][0]["rule"] == "schema"

    # YAML 本身解析失败
    resp = client.put("/api/v1/videos/demo_ep01/spec", json={"content": "scenes: [unclosed"})
    assert resp.status_code == 400
    assert resp.json()["detail"]["error"] == "yaml parse failed"


# 多屏 spec 且非末屏缺 next_question：§13.9 只产出 warning，PUT 不应拒绝
WARNING_ONLY_SPEC = """\
version: "3.1"
series: demo
episode: 1
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


def test_put_spec_warning_only_passes(client: TestClient) -> None:
    resp = client.put("/api/v1/videos/demo_ep01/spec", json={"content": WARNING_ONLY_SPEC})
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["ok"] is True
    # warning 随响应返回（severity=warning），不阻断保存
    assert any(w["severity"] == "warning" for w in payload.get("warnings", []))
    assert client.get("/api/v1/videos/demo_ep01/spec").status_code == 200

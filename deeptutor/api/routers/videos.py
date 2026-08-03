"""
Videos API Router（video-generation-system）

视频项目（``data/videos/<series_slug>_ep<NN>.yaml`` + 同名产物目录）的
REST 面板接口：列表 / spec 读写（两层校验）/ 触发渲染 / 产物浏览 / 静态文件。
路径约定见 ``deeptutor/capabilities/video/paths.py``（D10 数据布局），
根目录随 PathService workspace 走，多用户场景自动隔离。
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
import re
import shutil
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel, Field
import yaml

from deeptutor.capabilities.video.paths import VIDEO_SUBDIRS, videos_root
from deeptutor.capabilities.video.pipeline_state import PipelineState

logger = logging.getLogger(__name__)

router = APIRouter()

# 视频名 = <series_slug>_ep<NN>（slugify_series 产物：小写 a-z0-9 与连字符）。
_VIDEO_NAME_RE = re.compile(r"(?P<slug>[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)_ep(?P<episode>\d{2,})")
_SPEC_NAME_RE = re.compile(r"(?P<name>[a-z0-9](?:[a-z0-9-]*[a-z0-9])?_ep\d{2,})\.yaml")

_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}


# === Request Models ===


class SpecUpdateRequest(BaseModel):
    """写回 spec：content 为 YAML 原文。"""

    content: str


class RenderRequest(BaseModel):
    """触发渲染；frames 为局部重渲染预留（透传给 remotion-worker）。"""

    job_id: str | None = None
    worker_url: str | None = None
    frames: dict[str, int] | None = Field(default=None, description='{"start": N, "end": M}')


# === Helpers ===


def _parse_video_name(name: str) -> tuple[str, int]:
    """校验并拆解 ``<series_slug>_ep<NN>``；非法名抛 404（不暴露路径细节）。"""
    match = _VIDEO_NAME_RE.fullmatch(str(name or ""))
    if not match:
        raise HTTPException(status_code=404, detail=f"video not found: {name}")
    return match.group("slug"), int(match.group("episode"))


def _video_dir(name: str) -> Path:
    slug, episode = _parse_video_name(name)
    return videos_root() / f"{slug}_ep{episode:02d}"


def _spec_path(name: str) -> Path:
    slug, episode = _parse_video_name(name)
    return videos_root() / f"{slug}_ep{episode:02d}.yaml"


def _require_spec(name: str) -> Path:
    spec_path = _spec_path(name)
    if not spec_path.is_file():
        raise HTTPException(status_code=404, detail=f"video spec not found: {name}")
    return spec_path


def _resolve_under(base: Path, relative: str) -> Path:
    """把相对路径限制在 base 内（路径穿越防护）。"""
    base_resolved = base.resolve()
    candidate = (base_resolved / relative).resolve()
    if candidate != base_resolved and base_resolved not in candidate.parents:
        raise HTTPException(status_code=404, detail="file not found")
    return candidate


def _list_renders(video_dir: Path) -> list[dict[str, Any]]:
    renders_dir = video_dir / "renders"
    if not renders_dir.is_dir():
        return []
    items = []
    for path in sorted(renders_dir.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True):
        stat = path.stat()
        items.append({"job_id": path.stem, "size": stat.st_size, "mtime": stat.st_mtime})
    return items


def _stage_statuses(video_dir: Path) -> dict[str, Any] | None:
    """pipeline_state.json 存在时返回 {stage: {status, ...}}，否则 None。"""
    state = PipelineState.load(video_dir)
    if not state.path.is_file():
        return None
    return state.as_dict().get("stages") or {}


def _scene_count(spec_path: Path) -> int | None:
    try:
        data = yaml.safe_load(spec_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if isinstance(data, dict) and isinstance(data.get("scenes"), list):
        return len(data["scenes"])
    return None


def _video_summary(name: str, spec_path: Path, video_dir: Path) -> dict[str, Any]:
    slug, episode = _parse_video_name(name)
    has_spec = spec_path.is_file()
    item: dict[str, Any] = {
        "series_slug": slug,
        "episode": episode,
        "name": name,
        "spec_path": str(spec_path),
        "has_spec": has_spec,
        "renders": [entry["job_id"] for entry in _list_renders(video_dir)],
    }
    if has_spec:
        item["scene_count"] = _scene_count(spec_path)
    stages = _stage_statuses(video_dir)
    if stages is not None:
        item["stages"] = stages
    return item


# === API Endpoints ===


@router.get("/health/summary")
async def health_summary() -> dict[str, Any]:
    """渲染链路健康摘要（7.6 最小监控落地）。

    - worker：``GET /health`` 可达性（地址走 settings，同 video_compose）；
    - renders：从 ``data/videos/render_metrics.jsonl``（worker_client 每次
      渲染写一条结构化指标）聚合最近渲染统计。

    Remotion 许可季度复核（g0-gate.md §2：团队 ≤3 人免费档，扩至第 4 人
    触发付费）以 renders 统计为数据来源之一——复核时看本端点的
    ``renders`` 聚合与团队规模。
    """
    from deeptutor.capabilities.video.worker_client import (
        METRICS_FILENAME,
        resolve_worker_url,
    )

    worker_url = resolve_worker_url(None)
    worker: dict[str, Any] = {"url": worker_url, "reachable": False, "detail": ""}
    try:
        import httpx

        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{worker_url}/health")
            resp.raise_for_status()
        worker["reachable"] = True
    except Exception as exc:
        worker["detail"] = f"{type(exc).__name__}: {exc}"

    records: list[dict[str, Any]] = []
    metrics_path = videos_root() / METRICS_FILENAME
    if metrics_path.is_file():
        try:
            lines = metrics_path.read_text(encoding="utf-8").splitlines()
            for line in lines[-200:]:  # 轻量：只聚合最近 200 条
                try:
                    record = json.loads(line)
                except ValueError:
                    continue
                if isinstance(record, dict):
                    records.append(record)
        except OSError:
            pass

    done = [r for r in records if r.get("status") == "done"]
    failed = [r for r in records if r.get("status") == "error"]
    durations = [int(r["duration_ms"]) for r in done if isinstance(r.get("duration_ms"), (int, float))]
    return {
        "worker": worker,
        "renders": {
            "total": len(records),
            "done": len(done),
            "failed": len(failed),
            "success_rate": round(len(done) / len(records), 4) if records else None,
            "avg_duration_ms": int(sum(durations) / len(durations)) if durations else None,
            "recent": records[-10:][::-1],
        },
    }


@router.get("")
async def list_videos() -> list[dict[str, Any]]:
    """列出视频项目：spec 文件与同名产物目录的并集。"""
    root = videos_root()
    if not root.is_dir():
        return []
    names: dict[str, tuple[Path, Path]] = {}
    for spec in root.glob("*_ep*.yaml"):
        match = _SPEC_NAME_RE.fullmatch(spec.name)
        if match:
            name = match.group("name")
            names.setdefault(name, (spec, root / name))
    for child in root.iterdir():
        if child.is_dir() and _VIDEO_NAME_RE.fullmatch(child.name):
            names.setdefault(child.name, (root / f"{child.name}.yaml", child))
    return [
        _video_summary(name, spec_path, video_dir)
        for name, (spec_path, video_dir) in sorted(names.items())
    ]


@router.get("/{name}/spec")
async def get_spec(name: str) -> PlainTextResponse:
    """读取 spec YAML 原文。"""
    spec_path = _require_spec(name)
    return PlainTextResponse(
        spec_path.read_text(encoding="utf-8"), media_type="application/yaml"
    )


@router.put("/{name}/spec")
async def put_spec(name: str, request: SpecUpdateRequest) -> dict[str, Any]:
    """写回 spec YAML：先过两层校验（§10 schema + §13 语义），失败 400。"""
    from deeptutor.capabilities.video.validator import validate_spec

    spec_path = _spec_path(name)
    try:
        data = yaml.safe_load(request.content)
    except yaml.YAMLError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "yaml parse failed",
                "errors": [
                    {"rule": "yaml", "field": "(root)", "message": str(exc), "scene": None}
                ],
            },
        ) from exc
    if not isinstance(data, dict):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "spec validation failed",
                "errors": [
                    {
                        "rule": "semantic",
                        "field": "(root)",
                        "message": "spec 顶层必须是 mapping（YAML 对象）",
                        "scene": None,
                    }
                ],
            },
        )
    errors = validate_spec(data)
    blocking = [err for err in errors if err.severity != "warning"]
    if blocking:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "spec validation failed",
                "errors": [
                    {
                        "rule": err.rule,
                        "field": err.field,
                        "message": err.message,
                        "scene": err.scene,
                        "severity": err.severity,
                    }
                    for err in blocking
                ],
            },
        )
    spec_path.parent.mkdir(parents=True, exist_ok=True)
    spec_path.write_text(request.content, encoding="utf-8")
    return {
        "ok": True,
        "name": name,
        "spec_path": str(spec_path),
        "scene_count": _scene_count(spec_path),
        # warning 级（如 §13.9 next_question 建议、未安装技能引用）不阻断保存，
        # 随响应返回供编辑器提示。
        "warnings": [
            {
                "rule": err.rule,
                "field": err.field,
                "message": err.message,
                "scene": err.scene,
                "severity": err.severity,
            }
            for err in errors
            if err.severity == "warning"
        ],
    }


# 进行中渲染任务的强引用集（防止 create_task 被 GC）。
_BACKGROUND_TASKS: set[asyncio.Task] = set()


async def _run_render_job(
    *,
    worker_url: str,
    yaml_path: Path,
    job_id: str,
    frames: dict[str, int] | None,
    video_dir: Path,
) -> None:
    """后台渲染任务：提交 worker，产物复制进 ``<video_dir>/renders/``。"""
    from deeptutor.capabilities.video.worker_client import submit_render

    outcome = await submit_render(
        worker_url=worker_url,
        yaml_path=yaml_path,
        job_id=job_id,
        videos_root=videos_root(),
        frames=frames,
    )
    if not outcome.ok:
        logger.warning("render job %s failed: %s", job_id, outcome.error)
        return
    renders_dir = video_dir / "renders"
    renders_dir.mkdir(parents=True, exist_ok=True)
    render_path = renders_dir / f"{outcome.job_id}.mp4"
    if outcome.output_path and outcome.output_path != str(render_path):
        try:
            shutil.copy2(outcome.output_path, render_path)
        except OSError:
            logger.warning("render job %s: copy %s failed", job_id, outcome.output_path)


@router.post("/{name}/render", status_code=202)
async def trigger_render(name: str, request: RenderRequest | None = None) -> dict[str, Any]:
    """触发渲染：后台提交 remotion-worker，立即返回 job_id。"""
    from deeptutor.capabilities.video.worker_client import resolve_worker_url

    spec_path = _require_spec(name)
    request = request or RenderRequest()
    job_id = (request.job_id or "").strip() or name
    frames = request.frames
    if frames is not None:
        start, end = frames.get("start"), frames.get("end")
        if not isinstance(start, int) or not isinstance(end, int) or start < 0 or end <= start:
            raise HTTPException(
                status_code=400, detail="frames must be {'start': int >= 0, 'end': int > start}"
            )
    overrides = {"worker_url": request.worker_url} if request.worker_url else None
    worker_url = resolve_worker_url(overrides)
    task = asyncio.create_task(
        _run_render_job(
            worker_url=worker_url,
            yaml_path=spec_path,
            job_id=job_id,
            frames=frames,
            video_dir=_video_dir(name),
        )
    )
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)
    return {"job_id": job_id, "status": "submitted", "worker_url": worker_url}


@router.get("/{name}/renders")
async def list_renders(name: str) -> list[dict[str, Any]]:
    """列出产物目录 ``renders/*.mp4``（job_id、大小、mtime）。"""
    return _list_renders(_video_dir(name))


@router.get("/{name}/artifacts")
async def get_artifacts(name: str) -> dict[str, Any]:
    """产物面板数据：assets（含 .meta.json 摘要）/ audio（含 align 状态）/
    renders / pipeline_state。"""
    video_dir = _video_dir(name)
    if not video_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"video dir not found: {name}")

    assets: list[dict[str, Any]] = []
    assets_dir = video_dir / "assets"
    if assets_dir.is_dir():
        for path in sorted(assets_dir.iterdir()):
            if not path.is_file():
                continue
            stat = path.stat()
            entry: dict[str, Any] = {
                "name": path.name,
                "size": stat.st_size,
                "mtime": stat.st_mtime,
                "kind": (
                    "image"
                    if path.suffix.lower() in _IMAGE_SUFFIXES
                    else "meta"
                    if path.suffix == ".json"
                    else "other"
                ),
            }
            if path.name.endswith(".meta.json") or path.name == "manifest.json":
                try:
                    entry["meta"] = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    entry["meta"] = None
            assets.append(entry)

    audio: list[dict[str, Any]] = []
    audio_dir = video_dir / "audio"
    if audio_dir.is_dir():
        for path in sorted(audio_dir.glob("*.wav")):
            stat = path.stat()
            align_path = path.with_suffix(".align.json")
            entry = {
                "name": path.name,
                "size": stat.st_size,
                "mtime": stat.st_mtime,
                "has_align": align_path.is_file(),
            }
            if align_path.is_file():
                try:
                    align = json.loads(align_path.read_text(encoding="utf-8"))
                    entry["duration_seconds"] = align.get("duration_seconds")
                except (OSError, ValueError):
                    pass
            audio.append(entry)

    state = PipelineState.load(video_dir)
    return {
        "name": name,
        "assets": assets,
        "audio": audio,
        "renders": _list_renders(video_dir),
        "pipeline_state": state.as_dict() if state.path.is_file() else None,
    }


@router.get("/{name}/files/{file_path:path}")
async def get_file(name: str, file_path: str) -> FileResponse:
    """产物静态文件（renders mp4 / assets 图片等），限制在该集产物目录内。"""
    video_dir = _video_dir(name)
    if not video_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"video dir not found: {name}")
    target = _resolve_under(video_dir, file_path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    # 只暴露约定子目录内的产物，不泄 spec 之外的创作层文件
    if target.parent.resolve() not in {
        (video_dir / sub).resolve() for sub in VIDEO_SUBDIRS
    }:
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(target)

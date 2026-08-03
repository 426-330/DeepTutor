"""
CLI Video Command Group
========================
视频生成系统的本地命令（video-generation-system，tasks 7.3）：

- ``deeptutor video render <spec_path>``   触发 video_compose（可 --frames 局部重渲染）
- ``deeptutor video preview <spec_path>``  打印 spec 摘要（本地命令，不启动渲染）
- ``deeptutor video spec validate <spec_path>``  两层校验（exit code 区分结果）
"""

from __future__ import annotations

import json
from pathlib import Path

import typer
import yaml
from rich.console import Console
from rich.table import Table

console = Console()

DEFAULT_DURATION_FRAMES = 90
DEFAULT_FPS = 30


def _resolve_spec(spec_path: str) -> Path:
    """解析 spec 引用：直接路径 > data/videos/ 下文件名/stem。"""
    from deeptutor.capabilities.video.paths import resolve_spec_path

    try:
        return resolve_spec_path(spec_path)
    except FileNotFoundError:
        console.print(f"[red]video spec not found: {spec_path}[/]")
        raise typer.Exit(code=1) from None


def _load_and_validate(spec_path: Path):
    """解析 + 版本迁移 + 两层校验（含技能 warning）；失败打印并退出。"""
    from deeptutor.capabilities.video.migrations import migrate_spec
    from deeptutor.capabilities.video.skills import scan_effect_skills
    from deeptutor.capabilities.video.validator import validate_spec

    try:
        data = yaml.safe_load(spec_path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        console.print(f"[red]YAML parse failed:[/] {exc}")
        raise typer.Exit(code=2) from exc
    if not isinstance(data, dict):
        console.print("[red]spec 顶层必须是 mapping（YAML 对象）[/]")
        raise typer.Exit(code=2)
    try:
        data = migrate_spec(data).data
    except ValueError as exc:
        console.print(f"[red]{exc}[/]")
        raise typer.Exit(code=2)
    known_skills = set(scan_effect_skills())
    errors = validate_spec(data, known_skills=known_skills)
    return data, errors


def _spec_summary(spec_path: Path, data: dict, errors: list) -> dict:
    """preview/summary 用的结构化摘要。"""
    scenes = [s for s in (data.get("scenes") or []) if isinstance(s, dict)]
    fps = int(data.get("fps") or DEFAULT_FPS)
    total_frames = sum(
        int(s.get("duration_frames") or DEFAULT_DURATION_FRAMES) for s in scenes
    )
    style = data.get("style") or {}
    blocking = [e for e in errors if e.severity != "warning"]
    warnings = [e for e in errors if e.severity == "warning"]
    return {
        "spec_path": str(spec_path),
        "series": data.get("series"),
        "episode": data.get("episode"),
        "version": data.get("version"),
        "fps": fps,
        "theme": style.get("theme") or "default",
        "scene_count": len(scenes),
        "total_frames": total_frames,
        "duration_seconds": round(total_frames / fps, 2),
        "valid": not blocking,
        "error_count": len(blocking),
        "warning_count": len(warnings),
        "errors": [
            {"rule": e.rule, "field": e.field, "message": e.message, "scene": e.scene}
            for e in blocking
        ],
        "warnings": [
            {"rule": e.rule, "field": e.field, "message": e.message, "scene": e.scene}
            for e in warnings
        ],
    }


def _print_validation(errors: list, fmt: str) -> None:
    blocking = [e for e in errors if e.severity != "warning"]
    warnings = [e for e in errors if e.severity == "warning"]
    if fmt == "json":
        console.print_json(
            json.dumps(
                {
                    "valid": not blocking,
                    "errors": [e.render() for e in blocking],
                    "warnings": [e.render() for e in warnings],
                },
                ensure_ascii=False,
            )
        )
        return
    if not errors:
        console.print("[green]OK — 两层校验通过（§10 schema + §13 语义复查）[/]")
        return
    for err in blocking:
        console.print(f"[red]error[/]   {err.render()}")
    for err in warnings:
        console.print(f"[yellow]warning[/] {err.render()}")


def register(app: typer.Typer) -> None:
    spec_app = typer.Typer(help="Spec inspection commands.")
    app.add_typer(spec_app, name="spec")

    @app.command("render")
    def video_render(
        spec_path: str = typer.Argument(..., help="spec YAML 路径或 data/videos/ 下文件名。"),
        frames: str | None = typer.Option(
            None, "--frames", help="局部重渲染帧区间，格式 start:end（如 90:180）。"
        ),
        worker_url: str | None = typer.Option(
            None, "--worker-url", help="remotion-worker 地址（默认走 settings/localhost:3100）。"
        ),
        job_id: str | None = typer.Option(None, "--job-id", help="渲染任务 ID（默认 spec 文件名 stem）。"),
        timeout: int = typer.Option(0, "--timeout", help="渲染超时秒数（默认 1800）。"),
        fmt: str = typer.Option("rich", "--format", "-f", help="Output format: rich | json."),
    ) -> None:
        """Submit the spec to remotion-worker and render an mp4 (video_compose)."""
        from deeptutor.app import DeepTutorApp

        from .common import build_turn_request, maybe_run, run_turn_and_render

        resolved = _resolve_spec(spec_path)
        config: dict = {"spec": str(resolved)}
        if frames:
            try:
                start_s, end_s = frames.split(":", 1)
                frame_range = {"start": int(start_s), "end": int(end_s)}
            except ValueError:
                console.print(f"[red]--frames 格式应为 start:end，收到: {frames}[/]")
                raise typer.Exit(code=1) from None
            if frame_range["start"] < 0 or frame_range["end"] <= frame_range["start"]:
                console.print("[red]--frames 需满足 0 <= start < end[/]")
                raise typer.Exit(code=1)
            config["frames"] = frame_range
        if worker_url:
            config["worker_url"] = worker_url
        if job_id:
            config["job_id"] = job_id
        if timeout > 0:
            config["timeout_s"] = timeout

        request = build_turn_request(
            content=f"render video spec {resolved}",
            capability="video_compose",
            session_id=None,
            tools=[],
            knowledge_bases=[],
            language="zh",
            config_items=[],
            config_json=json.dumps(config, ensure_ascii=False),
            notebook_refs=[],
            history_refs=[],
        )
        maybe_run(run_turn_and_render(app=DeepTutorApp(), request=request, fmt=fmt))

    @app.command("preview")
    def video_preview(
        spec_path: str = typer.Argument(..., help="spec YAML 路径或 data/videos/ 下文件名。"),
        fmt: str = typer.Option("rich", "--format", "-f", help="Output format: rich | json."),
    ) -> None:
        """Print a spec summary (scenes / duration / theme / validation) — no rendering."""
        resolved = _resolve_spec(spec_path)
        data, errors = _load_and_validate(resolved)
        summary = _spec_summary(resolved, data, errors)

        if fmt == "json":
            console.print_json(json.dumps(summary, ensure_ascii=False))
            return

        table = Table(title=f"Video spec: {resolved.name}")
        table.add_column("Field", style="bold")
        table.add_column("Value")
        for key in (
            "series", "episode", "version", "fps", "theme",
            "scene_count", "total_frames", "duration_seconds",
        ):
            table.add_row(key, str(summary[key]))
        status = (
            "[green]valid[/]"
            if summary["valid"] and not summary["warning_count"]
            else "[green]valid[/] (with warnings)"
            if summary["valid"]
            else "[red]invalid[/]"
        )
        table.add_row("validation", f"{status} — {summary['error_count']} error(s), {summary['warning_count']} warning(s)")
        console.print(table)
        if errors:
            _print_validation(errors, fmt="rich")

    @spec_app.command("validate")
    def spec_validate(
        spec_path: str = typer.Argument(..., help="spec YAML 路径或 data/videos/ 下文件名。"),
        fmt: str = typer.Option("rich", "--format", "-f", help="Output format: rich | json."),
    ) -> None:
        """Run §10 schema + §13 semantic validation; exit 1 on errors."""
        resolved = _resolve_spec(spec_path)
        _, errors = _load_and_validate(resolved)
        _print_validation(errors, fmt)
        if any(e.severity != "warning" for e in errors):
            raise typer.Exit(code=1)


__all__ = ["register"]

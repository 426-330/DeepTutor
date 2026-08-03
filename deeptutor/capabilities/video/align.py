"""whisperX 词级对齐（exec 沙箱封装，D6/D9）。

每屏音频在沙箱内跑 whisperX CLI，产出词级时间戳并写
``audio/s<NN>.align.json``（真实时长 + cues）。对齐文件是运行期产物：
渲染层在 IR 注入期读取它覆盖 DSL ``duration_frames`` 默认值——**绝不回写
YAML**（D6）。沙箱不可用 / whisperX 失败均可降级：没有 align 文件时渲染
用 DSL 默认时长，不阻塞配音产物。
"""

from __future__ import annotations

import json
import math
import shlex
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# whisperX 首次运行需下载模型，给予宽松限额。
ALIGN_TIMEOUT_S = 600
ALIGN_MEMORY_MB = 4096
ALIGN_CPU_SECONDS = 1200


@dataclass(frozen=True)
class AlignOutcome:
    scene: int
    ok: bool
    align_path: str = ""
    duration_seconds: float = 0.0
    cue_count: int = 0
    error: str = ""
    warnings: list[str] = field(default_factory=list)


def build_whisperx_command(
    audio_name: str,
    *,
    language: str = "",
    model: str = "small",
) -> str:
    """whisperX CLI 命令（在挂载的 audio 目录内运行）。"""
    parts = [
        "whisperx",
        shlex.quote(audio_name),
        "--output_format", "json",
        "--output_dir", ".",
        "--model", shlex.quote(model),
        "--compute_type", "int8",
    ]
    if language:
        parts += ["--language", shlex.quote(language)]
    return " ".join(parts)


def whisperx_json_to_align(
    data: dict[str, Any],
    *,
    scene: int,
    audio_name: str,
    fps: int,
) -> dict[str, Any]:
    """whisperX JSON 输出 → .align.json 结构（真实时长 + 词级 cues）。"""
    cues: list[dict[str, Any]] = []
    duration = 0.0
    for segment in data.get("segments") or []:
        if not isinstance(segment, dict):
            continue
        seg_end = segment.get("end")
        if isinstance(seg_end, (int, float)):
            duration = max(duration, float(seg_end))
        for word in segment.get("words") or []:
            if not isinstance(word, dict):
                continue
            start, end = word.get("start"), word.get("end")
            text = str(word.get("word") or "").strip()
            if isinstance(start, (int, float)) and isinstance(end, (int, float)) and text:
                cues.append(
                    {"start": round(float(start), 3), "end": round(float(end), 3), "text": text}
                )
                duration = max(duration, float(end))
    duration = round(duration, 3)
    return {
        "scene": scene,
        "audio": audio_name,
        "duration_seconds": duration,
        "fps": fps,
        "duration_frames": max(1, math.ceil(duration * fps)) if duration > 0 else None,
        "cues": cues,
    }


async def align_scene_audio(
    audio_dir: Path,
    *,
    scene: int,
    fps: int,
    language: str = "",
    model: str = "small",
    timeout_s: int = ALIGN_TIMEOUT_S,
) -> AlignOutcome:
    """对 ``audio/s<NN>.wav`` 跑 whisperX 并写 ``s<NN>.align.json``。

    任何失败都返回 ``ok=False`` 的降级结果而不抛出——无对齐文件也能渲染。
    """
    audio_name = f"s{scene:02d}.wav"
    align_name = f"s{scene:02d}.align.json"
    audio_path = audio_dir / audio_name
    if not audio_path.is_file():
        return AlignOutcome(scene=scene, ok=False, error=f"audio missing: {audio_name}")

    try:
        from deeptutor.services.sandbox import (
            ExecRequest,
            Mount,
            ResourceLimits,
            get_sandbox_service,
        )
    except ImportError as exc:  # pragma: no cover
        return AlignOutcome(scene=scene, ok=False, error=f"sandbox unavailable: {exc}")

    service = get_sandbox_service()
    if not await service.available():
        return AlignOutcome(scene=scene, ok=False, error="sandbox unavailable (degraded)")

    request = ExecRequest(
        command=build_whisperx_command(audio_name, language=language, model=model),
        workdir=str(audio_dir),
        mounts=(Mount(host_path=str(audio_dir), sandbox_path=str(audio_dir), read_only=False),),
        limits=ResourceLimits(
            timeout_s=timeout_s,
            memory_mb=ALIGN_MEMORY_MB,
            cpu_seconds=ALIGN_CPU_SECONDS,
            max_output_chars=20_000,
        ),
    )
    result = await service.run(request, user_id="narration_gen")
    if not result.ok or result.exit_code != 0:
        detail = result.error or result.stderr.strip() or f"exit {result.exit_code}"
        return AlignOutcome(scene=scene, ok=False, error=f"whisperx failed: {detail[:500]}")

    # whisperX 输出 <stem>.json 到 output_dir
    raw_json = audio_dir / f"{audio_path.stem}.json"
    try:
        data = json.loads(raw_json.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return AlignOutcome(scene=scene, ok=False, error=f"align parse failed: {exc}")

    align = whisperx_json_to_align(data, scene=scene, audio_name=audio_name, fps=fps)
    align_path = audio_dir / align_name
    align_path.write_text(
        json.dumps(align, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    try:
        raw_json.unlink()
    except OSError:
        pass
    return AlignOutcome(
        scene=scene,
        ok=True,
        align_path=str(align_path),
        duration_seconds=align["duration_seconds"],
        cue_count=len(align["cues"]),
    )


__all__ = [
    "ALIGN_TIMEOUT_S",
    "AlignOutcome",
    "align_scene_audio",
    "build_whisperx_command",
    "whisperx_json_to_align",
]

"""asset_gen 的素材辅助：prompt 构建、截图命令、产物 manifest、图表数据与 BGM 解析。

产物布局与引用约定（scene schema 封闭 ``additionalProperties: false``，素材
引用不进 YAML，走约定命名 + manifest 契约）::

    <video_dir>/assets/s<NN>.png            # 主视觉插画（imagegen）
    <video_dir>/assets/s<NN>.meta.json      # 旁车生成参数（prompt/模型/尺寸等）
    <video_dir>/assets/s<NN>_web.png        # 网页截图（沙箱 Playwright）
    <video_dir>/assets/manifest.json        # 素材总账（本模块输出契约）
    <video_dir>/data/<chart.data 引用的文件>  # 图表数据（worker chartData.ts 按此解析）

BGM 素材库约定：全局库 ``data/videos/bgm/``（.mp3/.wav/.m4a/.aac/.ogg），
``bgm`` override 可给库内文件名或绝对路径；``bgm: "auto"``（或库非空时
缺省）取库中第一个音频。video_compose 混音按 manifest.bgm.path 取文件。
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import re
import shlex
from typing import Any

_URL_RE = re.compile(r"https?://[^\s<>\"')\]]+")
_AUDIO_EXTS = (".mp3", ".wav", ".m4a", ".aac", ".ogg")

SCREENSHOT_TIMEOUT_S = 120
SCREENSHOT_VIEWPORT = "1280,720"

# 注入 imagegen prompt 的风格约束：扁平插画、无文字（字幕/标题由渲染层绘制，
# 模型生成文字既不可控也不可校验）。
ILLUSTRATION_STYLE_HINT = (
    "Flat vector explainer illustration, clean shapes, generous negative space, "
    "no text, no letters, no watermark"
)


def find_urls(text: str) -> list[str]:
    return _URL_RE.findall(text or "")


def build_illustration_prompt(
    visual_desc: str,
    *,
    palette_desc: str,
    scene_title: str = "",
) -> str:
    """imagegen prompt：视觉描述 + 生效色板 + 风格约束（色卡规范 §3）。"""
    parts = [visual_desc.strip()]
    if scene_title:
        parts.append(f"Scene: {scene_title.strip()}")
    parts.append(f"Color palette (use these exact colors): {palette_desc}")
    parts.append(ILLUSTRATION_STYLE_HINT)
    return "\n".join(part for part in parts if part)


def build_screenshot_command(url: str, out_name: str) -> str:
    """Playwright 截图沙箱命令（runner 镜像已含 Chromium + Playwright，D9）。"""
    return (
        f"python -m playwright screenshot "
        f"--viewport-size={SCREENSHOT_VIEWPORT} --wait-for-timeout=3000 "
        f"{shlex.quote(url)} {shlex.quote(out_name)}"
    )


def write_meta(
    meta_path: Path,
    *,
    kind: str,
    scene: int,
    params: dict[str, Any],
) -> Path:
    """写旁车 .meta.json（生成参数可追溯，spec: 生成参数可追溯）。

    当前 provider 层（deeptutor/services/imagegen）无 seed 透出入口，
    seed 记 null——复现粒度为 prompt + model + size + quality。
    """
    payload = {
        "kind": kind,
        "scene": scene,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        **params,
    }
    meta_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return meta_path


def write_manifest(manifest_path: Path, manifest: dict[str, Any]) -> Path:
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return manifest_path


def list_bgm_library(videos_root: Path) -> list[Path]:
    """全局 BGM 素材库：``data/videos/bgm/`` 下的音频文件（按文件名排序）。"""
    library = videos_root / "bgm"
    if not library.is_dir():
        return []
    return sorted(
        p for p in library.iterdir() if p.is_file() and p.suffix.lower() in _AUDIO_EXTS
    )


def resolve_bgm(videos_root: Path, bgm_ref: str) -> Path | None:
    """解析 BGM 引用：绝对/相对路径 > 库内文件名 > auto/缺省取库中首个。"""
    ref = str(bgm_ref or "").strip()
    library = list_bgm_library(videos_root)
    if ref and ref != "auto":
        candidate = Path(ref)
        if candidate.is_file():
            return candidate
        match = videos_root / "bgm" / ref
        if match.is_file():
            return match
        return None
    return library[0] if library else None


def chart_data_refs(scenes: list[dict[str, Any]]) -> list[tuple[int, str]]:
    """所有 chart 屏的 (屏号, data 引用)（worker chartData.ts 按
    ``<video_dir>/data/<data>`` 解析，同约定）。"""
    refs = []
    for idx, scene in enumerate(scenes, start=1):
        if scene.get("type") == "chart":
            ref = str(scene.get("data") or "").strip()
            if ref:
                refs.append((idx, ref))
    return refs


__all__ = [
    "ILLUSTRATION_STYLE_HINT",
    "SCREENSHOT_TIMEOUT_S",
    "SCREENSHOT_VIEWPORT",
    "build_illustration_prompt",
    "build_screenshot_command",
    "chart_data_refs",
    "find_urls",
    "list_bgm_library",
    "resolve_bgm",
    "write_manifest",
    "write_meta",
]

"""``data/videos/`` 数据布局（D10）。

一棵树即契约::

    data/videos/<series_slug>_ep<NN>.yaml          # 唯一事实源（创作层，进 git）
    data/videos/<series_slug>_ep<NN>/{data,assets,audio,renders}/

真实音频时长等运行期产物只写 ``audio/s<NN>.align.json``，绝不回写 YAML（D6）。
根目录挂在 PathService 的 workspace_root（即 ``data/``）下，多用户场景自动
随 workspace 切换。
"""

from __future__ import annotations

from pathlib import Path
import re
import unicodedata

VIDEO_SUBDIRS = ("data", "assets", "audio", "renders")

_SLUG_INVALID_RE = re.compile(r"[^a-z0-9]+")


def videos_root() -> Path:
    """``data/videos/`` 根目录（随 PathService workspace 走）。"""
    from deeptutor.services.path_service import get_path_service

    return get_path_service().workspace_root / "videos"


def slugify_series(series: str) -> str:
    """系列名 → 文件名安全的 slug。

    ASCII 小写 + 连字符；非 ASCII（如中文系列名）按字符转 Unicode 码位
    片段，保证可逆区分且全角字符不撞名。
    """
    text = unicodedata.normalize("NFKC", str(series or "")).strip().lower()
    ascii_part = _SLUG_INVALID_RE.sub("-", text.encode("ascii", "ignore").decode("ascii"))
    non_ascii = [ch for ch in text if ord(ch) > 127]
    slug = ascii_part.strip("-")
    if non_ascii:
        suffix = "-".join(f"u{ord(ch):x}" for ch in non_ascii)
        slug = f"{slug}-{suffix}" if slug else suffix
    return slug or "series"


def spec_filename(series_slug: str, episode: int) -> str:
    return f"{series_slug}_ep{int(episode):02d}.yaml"


def spec_path_for(series_slug: str, episode: int, *, create_dirs: bool = False) -> Path:
    """spec YAML 落盘路径（不创建父目录，除非 create_dirs）。"""
    root = videos_root()
    if create_dirs:
        root.mkdir(parents=True, exist_ok=True)
    return root / spec_filename(series_slug, episode)


def video_dir_for(series_slug: str, episode: int, *, create: bool = False) -> Path:
    """该集产物目录 ``data/videos/<series_slug>_ep<NN>/``。"""
    video_dir = videos_root() / f"{series_slug}_ep{int(episode):02d}"
    if create:
        for sub in VIDEO_SUBDIRS:
            (video_dir / sub).mkdir(parents=True, exist_ok=True)
    return video_dir


def resolve_spec_path(reference: str) -> Path:
    """把用户/pipeline 给的 spec 引用解析为实际路径。

    接受：绝对/相对路径、``data/videos/`` 下的文件名、或不带扩展名的
    ``<series_slug>_ep<NN>`` 片段。未找到时抛 FileNotFoundError。
    """
    ref = str(reference or "").strip()
    if not ref:
        raise FileNotFoundError("empty spec reference")
    candidate = Path(ref)
    candidates = [candidate]
    if not candidate.is_absolute():
        root = videos_root()
        candidates.append(root / ref)
        if not ref.endswith((".yaml", ".yml")):
            candidates.append(root / f"{ref}.yaml")
    for path in candidates:
        if path.is_file():
            return path
    raise FileNotFoundError(f"video spec not found: {ref}")


def latest_spec_path() -> Path:
    """``data/videos/`` 下最近修改的 spec（narration_gen 缺省输入）。"""
    root = videos_root()
    specs = sorted(root.glob("*_ep*.yaml"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not specs:
        raise FileNotFoundError(f"no video spec under {root}")
    return specs[0]


def video_dir_for_spec(spec_path: Path) -> Path:
    """spec 文件对应的产物目录（与 YAML 同 stem 的同名目录）。"""
    return spec_path.parent / spec_path.stem


__all__ = [
    "VIDEO_SUBDIRS",
    "latest_spec_path",
    "resolve_spec_path",
    "slugify_series",
    "spec_filename",
    "spec_path_for",
    "video_dir_for",
    "video_dir_for_spec",
    "videos_root",
]

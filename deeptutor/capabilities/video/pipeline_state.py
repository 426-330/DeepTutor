"""video_pipeline 断点状态（``<video_dir>/pipeline_state.json``）。

产物即契约（D7）：状态文件只记录各阶段 done/failed 与产物路径，阶段间
不共享内存。跳过判定 = 状态 done **且** 记录的关键产物仍在盘上——产物
被删/被移动时该阶段自动重跑。
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PIPELINE_STAGES = ("video_spec", "asset_gen", "narration_gen", "video_compose")
STATE_FILENAME = "pipeline_state.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class PipelineState:
    """``pipeline_state.json`` 的读写封装。"""

    def __init__(self, video_dir: Path, data: dict[str, Any] | None = None) -> None:
        self.video_dir = Path(video_dir)
        self._data: dict[str, Any] = data or {"version": 1, "stages": {}}

    @classmethod
    def load(cls, video_dir: Path) -> "PipelineState":
        path = Path(video_dir) / STATE_FILENAME
        if path.is_file():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(data, dict) and isinstance(data.get("stages"), dict):
                    return cls(video_dir, data)
            except (OSError, ValueError):
                pass  # 状态文件损坏：从零重建（产物判定仍以磁盘为准）
        return cls(video_dir)

    @property
    def path(self) -> Path:
        return self.video_dir / STATE_FILENAME

    def save(self) -> Path:
        self.video_dir.mkdir(parents=True, exist_ok=True)
        self._data["updated_at"] = _now()
        self.path.write_text(
            json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return self.path

    def stage_record(self, stage: str) -> dict[str, Any]:
        record = self._data["stages"].get(stage)
        return record if isinstance(record, dict) else {}

    def mark_done(self, stage: str, artifacts: dict[str, Any]) -> None:
        self._data["stages"][stage] = {
            "status": "done",
            "artifacts": artifacts,
            "finished_at": _now(),
        }
        self.save()

    def mark_failed(self, stage: str, error: str) -> None:
        self._data["stages"][stage] = {
            "status": "failed",
            "error": error[:1000],
            "finished_at": _now(),
        }
        self.save()

    def is_done(self, stage: str) -> bool:
        """状态 done 且记录中的文件产物全部仍在盘上。"""
        record = self.stage_record(stage)
        if record.get("status") != "done":
            return False
        for value in (record.get("artifacts") or {}).values():
            for path_str in _flatten_paths(value):
                if not Path(path_str).exists():
                    return False
        return True

    def as_dict(self) -> dict[str, Any]:
        return self._data


def _flatten_paths(value: Any) -> list[str]:
    """从 artifacts 结构中提取文件路径字符串（str/list/dict 递归）。"""
    if isinstance(value, str):
        # 只把长得像路径的字符串纳入存在性检查
        return [value] if ("/" in value or "\\" in value) else []
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            out.extend(_flatten_paths(item))
        return out
    if isinstance(value, dict):
        out = []
        for item in value.values():
            out.extend(_flatten_paths(item))
        return out
    return []


__all__ = ["PIPELINE_STAGES", "STATE_FILENAME", "PipelineState"]

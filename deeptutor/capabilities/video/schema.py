"""§10 JSON Schema 加载（单一来源，D5）。

schema 权威文件在 ``video_dsl/schema/concept-video.schema.json``（仓库根，
JSON Schema draft 2020-12）。三端共享这一份来源：worker 与前端 Player 用
ajv，backend 用 jsonschema——本模块只负责定位与加载，不复制 schema 内容。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from deeptutor.runtime.home import PACKAGE_ROOT

SCHEMA_PATH = PACKAGE_ROOT / "video_dsl" / "schema" / "concept-video.schema.json"
TEMPLATES_PATH = PACKAGE_ROOT / "video_dsl" / "concept-video-scene-templates.yaml"

_schema_cache: dict[str, Any] | None = None


def load_schema(path: Path | None = None) -> dict[str, Any]:
    """读取 §10 JSON Schema（带缓存）。文件缺失说明 DSL 资产未取回（G0）。"""
    global _schema_cache
    if path is not None:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    if _schema_cache is None:
        if not SCHEMA_PATH.is_file():
            raise FileNotFoundError(
                f"Concept Video DSL schema missing at {SCHEMA_PATH} — "
                "video_dsl 资产未取回（见 design.md G0 门禁）。"
            )
        _schema_cache = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    return _schema_cache


def reset_schema_cache() -> None:
    """测试 / schema 更新后丢弃缓存。"""
    global _schema_cache
    _schema_cache = None


__all__ = ["SCHEMA_PATH", "TEMPLATES_PATH", "load_schema", "reset_schema_cache"]

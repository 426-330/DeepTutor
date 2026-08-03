"""Video generation capabilities (video-generation-system).

Python 编排侧的单一内聚目录：DSL 校验（§10 JSON Schema + §13 语义复查）、
版本迁移、video_spec / narration_gen 两个 capability。渲染层（Remotion）
在 remotion-worker/，本目录只产出/消费落盘产物（产物即契约，D7）。
"""

from deeptutor.capabilities.video.migrations import (
    MigrationResult,
    migrate_spec,
    register_migration,
)
from deeptutor.capabilities.video.paths import (
    slugify_series,
    spec_path_for,
    video_dir_for,
    videos_root,
)
from deeptutor.capabilities.video.validator import (
    SpecError,
    format_errors_for_llm,
    semantic_review,
    validate_schema,
    validate_spec,
)

__all__ = [
    "MigrationResult",
    "SpecError",
    "format_errors_for_llm",
    "migrate_spec",
    "register_migration",
    "semantic_review",
    "slugify_series",
    "spec_path_for",
    "validate_schema",
    "validate_spec",
    "video_dir_for",
    "videos_root",
]

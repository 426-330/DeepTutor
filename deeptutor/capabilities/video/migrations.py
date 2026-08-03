"""spec 版本迁移器（注册式）。

当前唯一迁移：v3.0 → v3.1。v3.1 相对 v3.0 只新增可选 ``style`` 块，因此
迁移是严格的超集升级：无 ``style`` 块的文件原样通过，仅 bump version 并
记录"取内建 default 主题"说明。未来 3.1 → 更高版本经
:func:`register_migration` 注册，``migrate_spec`` 沿注册链逐级迁移。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

MigrationFn = Callable[[dict[str, Any]], tuple[dict[str, Any], list[str]]]

# (from_version, to_version) → 迁移函数；逐级链式应用。
_MIGRATIONS: dict[tuple[str, str], MigrationFn] = {}

CURRENT_VERSION = "3.1"


@dataclass(frozen=True)
class MigrationResult:
    data: dict[str, Any]
    from_version: str
    to_version: str
    notes: list[str] = field(default_factory=list)

    @property
    def migrated(self) -> bool:
        return self.from_version != self.to_version


def register_migration(from_version: str, to_version: str, fn: MigrationFn) -> None:
    """注册一段版本迁移（供未来 3.1 → 后续版本扩展）。"""
    _MIGRATIONS[(str(from_version), str(to_version))] = fn


def _migrate_3_0_to_3_1(data: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """v3.0 → v3.1：无 style 块原样通过并标记默认主题（D1/§14 向后兼容）。"""
    out = dict(data)
    out["version"] = "3.1"
    notes = []
    if "style" not in out:
        notes.append("v3.0 文件无 style 块：视觉决策全部取内建 default 主题与组件默认值")
    return out, notes


register_migration("3.0", "3.1", _migrate_3_0_to_3_1)


def _next_step(version: str) -> tuple[str, str] | None:
    for from_version, to_version in _MIGRATIONS:
        if from_version == version:
            return from_version, to_version
    return None


def migrate_spec(
    data: dict[str, Any],
    *,
    target_version: str = CURRENT_VERSION,
) -> MigrationResult:
    """把 spec dict 迁移到 ``target_version``（默认当前版本）。

    未知版本或无法到达目标版本抛 ValueError；迁移只动顶层元数据，
    场景内容原样保留。
    """
    version = str(data.get("version") or "").strip()
    if not version:
        raise ValueError("spec 缺少 version 字段，无法迁移")

    notes: list[str] = []
    current = dict(data)
    from_version = version
    while version != target_version:
        step = _next_step(version)
        if step is None:
            raise ValueError(f"没有从 v{version} 到 v{target_version} 的迁移路径")
        _, to_version = step
        current, step_notes = _MIGRATIONS[step](current)
        notes.extend(step_notes)
        version = to_version
    return MigrationResult(
        data=current,
        from_version=from_version,
        to_version=version,
        notes=notes,
    )


__all__ = [
    "CURRENT_VERSION",
    "MigrationResult",
    "migrate_spec",
    "register_migration",
]

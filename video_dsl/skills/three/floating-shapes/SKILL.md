---
name: three/floating-shapes
description: 漂浮几何体特效背景（R3F）。适用：开场/过渡屏的轻量空间感背景。
params:
  type: object
  additionalProperties: false
  properties:
    count: { type: integer, minimum: 1, maximum: 30, default: 12 }
    shape: { enum: [box, sphere, torus, icosahedron], default: torus }
    color: { enum: [primary, secondary, accent, success, warning, danger, neutral], default: accent }
    speed: { type: number, minimum: 0, default: 1.0 }
always: false
---

# three/floating-shapes — 漂浮几何体背景

若干几何体缓慢漂浮、自转，作为场景背景（`background.type: particles`）。

## 引用方式

```yaml
style:
  effects:
    background:
      type: particles
      skill: three/floating-shapes
      params: { count: 12, shape: torus, color: accent, speed: 1.0 }
```

## 参数 schema（params 即组件 props）

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `count` | int | 12 | 几何体数量（≤30） |
| `shape` | enum | torus | `box` / `sphere` / `torus` / `icosahedron` |
| `color` | color token | accent | **仅 7 个 token 枚举**，禁裸 hex |
| `speed` | number | 1.0 | 漂浮速度倍率 |

## 组件契约

同 `three/particle-wave`（见该技能 SKILL.md 的 SkillProps 定义）。
组件只渲染 R3F 场景内容，不创建 Canvas；动画由 `frame` 确定性驱动。

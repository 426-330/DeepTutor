---
name: three/grid-terrain
description: 线框地形特效背景（R3F，复古合成波风）。适用：数据/趋势屏的氛围背景。
params:
  type: object
  additionalProperties: false
  properties:
    color: { enum: [primary, secondary, accent, success, warning, danger, neutral], default: secondary }
    amplitude: { type: number, minimum: 0, default: 1.0, description: 地形起伏幅度 }
    speed: { type: number, minimum: 0, default: 1.0, description: 地形滚动速度倍率 }
always: false
---

# three/grid-terrain — 线框地形背景

滚动的线框起伏地形（复古合成波风），作为场景背景（`background.type: particles`）。

## 引用方式

```yaml
style:
  effects:
    background:
      type: particles
      skill: three/grid-terrain
      params: { color: secondary, amplitude: 1.0, speed: 1.0 }
```

## 参数 schema（params 即组件 props）

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `color` | color token | secondary | **仅 7 个 token 枚举**，禁裸 hex |
| `amplitude` | number | 1.0 | 地形起伏幅度 |
| `speed` | number | 1.0 | 地形滚动速度倍率 |

## 组件契约

同 `three/particle-wave`（见该技能 SKILL.md 的 SkillProps 定义）。
组件只渲染 R3F 场景内容，不创建 Canvas；动画由 `frame` 确定性驱动。

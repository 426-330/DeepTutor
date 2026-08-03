---
name: three/particle-wave
description: 粒子波浪特效背景（R3F）。适用：概念屏/情绪屏的动态科技感背景。
  spec 的 style.effects.background 配置 type=particles 且 skill=three/particle-wave 时由 remotion-worker 渲染。
params:
  type: object
  additionalProperties: false
  properties:
    count: { type: integer, minimum: 100, maximum: 5000, default: 3000, description: 粒子数 }
    color: { enum: [primary, secondary, accent, success, warning, danger, neutral], default: primary }
    speed: { type: number, minimum: 0, default: 1.0, description: 波浪推进速度倍率 }
    amplitude: { type: number, minimum: 0, default: 0.6, description: 波幅（世界坐标单位） }
always: false
---

# three/particle-wave — 粒子波浪背景

正弦相位驱动的粒子网格波浪，作为场景背景（`background.type: particles`）。

## 引用方式

```yaml
style:
  effects:
    background:
      type: particles
      skill: three/particle-wave
      params: { count: 3000, color: primary, speed: 1.0 }
```

## 参数 schema（params 即组件 props）

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `count` | int | 3000 | 粒子数（约 60×50 网格上限 5000） |
| `color` | color token | primary | **仅 7 个 token 枚举**（primary/secondary/accent/success/warning/danger/neutral），禁裸 hex |
| `speed` | number | 1.0 | 波浪推进速度倍率 |
| `amplitude` | number | 0.6 | 波幅（世界坐标单位） |

## 组件契约（component.tsx）

默认导出 React 组件，props：

```ts
interface SkillProps {
  colors: Record<string, string>;      // 7 个 token 已解析为 hex（含派生色）
  params: Record<string, unknown>;     // defaults.json 与 spec params 合并后（token 已解析为 hex）
  width: number; height: number;       // 画布像素
  frame: number; fps: number;          // 场景内当前帧 / 帧率（确定性驱动，禁用随机时钟）
}
```

组件只渲染 R3F 场景内容（mesh/points/light），**不创建 Canvas**——由 worker 统一挂载 `ThreeCanvas`。

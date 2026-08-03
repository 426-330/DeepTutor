# 特效技能包规范（v1.0）

> 配套契约：`video_dsl/concept-video-dsl.md`（DSL §5 effects/background）、
> `video_dsl/schema/concept-video.schema.json`（backgroundEffect：type 枚举
> `none/gradient/particles`，`particles` 时允许 `skill` + `params`）。
> 本文档定义**特效技能包**的结构、存放约定与发现/注入/校验链路（设计 D8）。

---

## 1. 定位

特效技能包是**领域包的可插拔特效单元**：把一段 Remotion 特效（如 three.js
粒子背景）封装为"参数 schema + 渲染组件 + 预览 + 默认参数"的目录，供
LLM 在 spec 的 `style.effects.background` 中按标识引用：

```yaml
scenes:
  - type: concept
    style:
      effects:
        background:
          type: particles
          skill: three/particle-wave   # 必须引用已安装技能
          params: { density: 0.6, color: primary }   # 颜色参数只许 7 个 token
```

纪律与 DSL §5 一致：**params 中的颜色参数只许 7 个颜色 token**
（primary/secondary/accent/success/warning/danger/neutral），禁裸 hex；
渲染层对未注册技能标识降级为占位帧 + 告警（渲染白名单，不中断整片）。

## 2. 包结构（每个技能一个目录）

```
<skill-name>/
├── SKILL.md        # 必填。YAML frontmatter + 使用约束（人类/LLM 同读）
├── component.tsx   # 必填。特效组件（R3F 经 @remotion/three 进 worker bundle）
├── preview.png     # 必填。预览图（前端选择器与文档展示）
└── defaults.json   # 必填。params 默认值（未传参数时的兜底）
```

### 2.1 SKILL.md frontmatter

```yaml
---
name: three/particle-wave        # 必填。技能标识，建议 <namespace>/<skill> 命名
description: 粒子波浪背景。适用：情绪点/开场屏的动态背景。  # 必填
params:                          # 必填。参数 schema（JSON Schema 子集）
  type: object
  additionalProperties: false
  properties:
    density: { type: number, minimum: 0, maximum: 1, default: 0.5 }
    speed:   { type: number, minimum: 0, default: 1 }
    color:   { enum: [primary, secondary, accent, success, warning, danger, neutral], default: primary }
always: false                    # 可选。true = 所有视频生成默认注入本技能约束
---
```

- **颜色参数 MUST 用 token 枚举声明**（上例 `color`）。frontmatter 中不得
  出现 hex 色值参数——主题一致性靠 token 引用保证（色卡规范 §3）。
- frontmatter 之后的正文写使用约束与示例 YAML 片段（注入 LLM 时随
  frontmatter 一并下发）。

### 2.2 defaults.json

params schema 各参数的默认值：

```json
{ "density": 0.5, "speed": 1.0, "color": "primary" }
```

## 3. 存放约定（两个位置，用户覆盖仓库）

| 位置 | 用途 |
|---|---|
| `video_dsl/skills/` | 仓库内建技能包（进 git，随领域包分发） |
| `data/skills/` | 用户安装位（运行时数据，不进 git） |

同名技能 `data/skills/` 覆盖 `video_dsl/skills/`（同 DeepTutor 技能体系
"user shadows builtin" 纪律）。技能标识以 frontmatter `name` 为准；目录
布局建议与标识一致（`three/particle-wave` → `skills/three/particle-wave/`）。

## 4. 发现 / 注入 / 校验链路

1. **发现**：`deeptutor/capabilities/video/skills.py` 扫描两个位置，
   解析 SKILL.md frontmatter（name/description/params）与 defaults.json，
   产出技能清单。
2. **注入**：video_spec 生成时，把选定技能（用户声明 / project.yaml /
   always: true）的 name + description + params schema + 示例 YAML 注入
   LLM 上下文；LLM 只允许引用清单内的技能标识。
3. **校验**：`scenes[].style.effects.background.skill`（及顶层
   `style.effects.background.skill`）引用未安装技能时，§13 语义复查产出
   **warning**（不阻断生成；渲染层再按白名单降级占位帧）。
4. **项目级挂载**：`<video_dir>/project.yaml` 声明 `{skills: [...]}`，
   video_spec / video_pipeline 启动时读取并注入；文件不存在时回落
   always: true 技能（见 openspec design D8 分档）。

## 5. 与 DeepTutor 知识技能的区别

DeepTutor 知识技能（`deeptutor/skills/builtin/`、`data/user/workspace/skills/`，
如 quant-video-remotion）是**提示词/参考文档包**，经 skills_manifest +
read_skill 注入；特效技能包是**渲染资源包**（含 component.tsx），只被
video 系 capability 与 remotion-worker 消费。两者互补：quant-video-remotion
提供领域约束文档，特效技能包提供可渲染特效。

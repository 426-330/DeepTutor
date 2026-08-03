## ADDED Requirements

### Requirement: 特效技能包结构
特效技能 SHALL 以标准包结构发布：`SKILL.md`（名称、适用场景、参数 schema、示例 YAML 片段）、`component.tsx`（R3F 场景组件）、`preview.png`（缩略图）、`defaults.json`（默认参数）。SKILL.md 结构 MUST 符合 DeepTutor SKILL.md 规范，可直接挂载。

#### Scenario: 安装 three.js 技能
- **WHEN** 用户安装 three/particle-wave 技能包
- **THEN** 技能出现在已安装列表，其约束文档可被检索，组件进入 worker 打包管线

### Requirement: 提示词注入
video 系 capability SHALL 在用户声明技能意图（如"用粒子波浪做开场"）时检索已安装技能，将技能约束文档（模板库/色卡/组件清单）注入 LLM 上下文，产出引用该技能的合规 YAML。

#### Scenario: 声明特效生成合规 YAML
- **WHEN** 用户要求"科技感粒子开场"
- **THEN** 产出 YAML 的开场屏 background 引用 three/particle-wave 且参数符合其 schema

### Requirement: 技能参数色卡纪律
技能参数中的颜色字段 MUST 只接受 7 个枚举颜色 token，禁止裸 hex，与 DSL 全局约束一致。

#### Scenario: 裸 hex 参数被拒
- **WHEN** YAML 中技能参数 color 写 "#FF0000"
- **THEN** 校验失败并提示使用颜色 token

### Requirement: 组件打包与白名单
技能的 `component.tsx` SHALL 经打包管线进入 remotion-worker bundle 并注册进映射表；worker MUST 拒绝渲染未注册的技能组件（降级占位帧 + 告警）。

#### Scenario: 新技能渲染生效
- **WHEN** 安装技能后重新打包 worker 并渲染引用该技能的 YAML
- **THEN** 对应屏正确渲染 R3F 特效画面

### Requirement: 项目级技能挂载
系统 SHALL 支持视频项目声明默认挂载的技能。短期实现 MUST 以技能 frontmatter `always: true` 全局常驻；中期实现 SHALL 在项目元数据中声明技能列表，video 系 capability 启动时按声明挂载。

#### Scenario: 项目默认挂载
- **WHEN** 项目元数据声明挂载某领域技能包（如 quant-video-remotion）
- **THEN** 该项目内 video_spec 各轮自动携带该技能约束文档，无需用户逐次声明

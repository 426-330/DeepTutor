## ADDED Requirements

### Requirement: 四阶段顺序编排
`video_pipeline` capability SHALL 依次调度 `video_spec → asset_gen → narration_gen → video_compose`，每阶段产物落盘后才进入下一阶段。阶段间 MUST NOT 共享内存状态，产物文件即阶段契约。

#### Scenario: 一句话出片
- **WHEN** 用户输入"讲一期最大回撤"
- **THEN** video_pipeline 依次完成四阶段并产出 mp4，中间产物（YAML/素材/音频/对齐文件）全部落盘可追溯

### Requirement: 断点续跑
任一阶段失败时，系统 SHALL 保留已落盘产物，允许从失败阶段重跑，已完成阶段 MUST NOT 重复执行。

#### Scenario: 渲染失败后重跑
- **WHEN** video_compose 因 worker 故障失败
- **THEN** 修复后重跑仅从 video_compose 开始，不重新生成 spec、素材与配音

### Requirement: 单阶段独立触发
系统 SHALL 允许用户绕过 video_pipeline 单独触发任一阶段 capability，以支持局部迭代（只重配音、只改素材、改字重渲染）。

#### Scenario: 只重配音
- **WHEN** 用户对已有 YAML 单独触发 narration_gen 后触发 video_compose
- **THEN** 仅音频与成片更新，spec 与素材不变

### Requirement: 注册到 capability 体系
五个视频 capability（video_pipeline、video_spec、asset_gen、narration_gen、video_compose）SHALL 注册到 DeepTutor capability 注册表（`builtin_capabilities.py` 或 plugin loader），经 ChatOrchestrator 统一路由，并复用 `emit_capability_result()` 输出统一信封（响应载荷 + cost_summary）。

#### Scenario: 经编排器路由
- **WHEN** 用户消息被路由到 video_pipeline
- **THEN** 会话按统一 StreamBus 事件流推进，结束输出含 cost_summary 的标准结果信封

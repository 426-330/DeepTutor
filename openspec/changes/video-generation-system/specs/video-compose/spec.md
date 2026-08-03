## ADDED Requirements

### Requirement: 渲染任务契约
backend SHALL 通过 `POST /render {yaml_path, job_id}` 向 remotion-worker 提交渲染任务；任务记录 `{id, yaml_path, yaml_hash, frames, status, progress}` MUST 存 SQLite。worker SHALL 通过 WebSocket 回传进度事件与完成回调。

#### Scenario: 提交任务并收到进度
- **WHEN** backend 提交渲染任务
- **THEN** SQLite 出现对应任务记录，且前端经 WS 持续收到 progress 更新直至完成

### Requirement: 校验与 IR 规范化
worker SHALL 先以 ajv 按 DSL §10 JSON Schema 校验 YAML，再规范化为 TS IR：注入默认值、解析布局别名、合并样式链（内建主题 → style.theme → style.colors → 分镜覆盖），并读取 `.align.json` 覆盖 `duration_frames`。校验失败 MUST 拒绝渲染并返回具体错误。

#### Scenario: 样式链按优先级合并
- **WHEN** YAML 含全局 style 与某屏分镜级覆盖
- **THEN** IR 中该屏样式为覆盖后结果，其余屏取全局样式

#### Scenario: 无效 YAML 被拒
- **WHEN** 提交的 YAML 未通过 schema 校验
- **THEN** worker 返回错误详情，不产生渲染产物

### Requirement: 组件映射与渲染白名单
worker SHALL 按 DSL §12 映射表将场景 type 渲染为 Scene 组件、layout 渲染为 `src/layouts/` 布局组件，外层统一 SceneFrame（标题条 + 字幕 + 风险条）。worker MUST 只接受已注册的场景/布局/组件标识，未知标识 MUST 渲染降级为占位帧并发出告警。

#### Scenario: 未知组件降级
- **WHEN** YAML 引用未注册的特效组件标识
- **THEN** 对应位置渲染为占位帧，渲染继续，且告警事件经 WS 回传

### Requirement: 公式与算例渲染
worker SHALL 使用 KaTeX 渲染公式、Math.js 实时计算算例，公式修改 MUST 直接反映计算结果。

#### Scenario: 算例实时计算
- **WHEN** formula 场景的公式被修改后重新渲染
- **THEN** 配套 numeric_example 的计算结果随新公式更新

### Requirement: 字幕与混音
worker SHALL 将 `.align.json` 字幕轨叠加到画面，并将 BGM 与配音混音后输出。

#### Scenario: 成片含字幕与 BGM
- **WHEN** 渲染完成
- **THEN** 输出 mp4 含逐词对齐字幕与 BGM 混音轨

### Requirement: 逐帧渲染出片
worker SHALL 使用 headless Chrome 逐帧渲染并经 ffmpeg 合成 `renders/<job_id>.mp4`。

#### Scenario: 出片可播放
- **WHEN** 任务状态变为完成
- **THEN** `renders/<job_id>.mp4` 存在且时长等于各屏时长之和

### Requirement: 局部重渲染
系统 SHALL 支持仅渲染指定屏的帧区间（`--frames`）并与既有成片拼接，修改单屏时 MUST NOT 全片重渲。

#### Scenario: 单屏修改快速出片
- **WHEN** 用户仅修改第 3 屏后触发重渲染
- **THEN** 仅第 3 屏帧区间被渲染并拼入成片

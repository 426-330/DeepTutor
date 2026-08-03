## ADDED Requirements

### Requirement: 项目制首页
前端首页 SHALL 改为项目制：一个项目对应一支视频（其 YAML + 产物目录），支持创建、打开、查看产物状态。

#### Scenario: 创建视频项目
- **WHEN** 用户在首页新建项目并输入主题
- **THEN** 创建对应 `data/videos/` 条目并进入该项目工作台

### Requirement: spec 编辑器双模
前端 SHALL 提供 spec 编辑器，支持表单模式（按 DSL 字段结构化编辑）与 YAML 模式（直接编辑文本）双模切换，两模式 MUST 编辑同一份事实源且保持同步。

#### Scenario: 双模同步
- **WHEN** 用户在表单模式修改某屏标题后切到 YAML 模式
- **THEN** YAML 文本中对应 title 已同步更新

### Requirement: Remotion Player 即时预览
前端 SHALL 嵌入 Remotion Player，直接执行"YAML → parser → IR"喂给 Player 预览，spec 修改 MUST 即时反映，不触发完整渲染。

#### Scenario: 改色即时预览
- **WHEN** 用户修改 style.colors.primary
- **THEN** Player 画面立即按新色值更新，无渲染任务产生

### Requirement: 渲染任务管理
前端 SHALL 提供渲染任务管理页，展示任务状态与进度（WS 事件驱动），支持触发整片渲染与局部重渲染、查看/下载成片。

#### Scenario: 跟踪渲染进度
- **WHEN** 用户触发整片渲染
- **THEN** 任务页实时显示 progress 直至完成，完成后可在线播放或下载 mp4

### Requirement: 产物面板
DeepTutor Activity 面板 SHALL 改造为产物面板，按项目展示素材、音频、对齐文件与渲染任务，一目了然。

#### Scenario: 查看项目产物
- **WHEN** 用户打开产物面板
- **THEN** 当前项目的 assets/audio/renders 产物及其状态分类列出

### Requirement: 校验反馈可视化
编辑器 SHALL 将 JSON Schema 与语义清单的校验错误定位到具体屏与字段展示。

#### Scenario: 错误定位
- **WHEN** 当前 YAML 未通过校验
- **THEN** 编辑器标出出错场景与字段及错误原因，阻止提交渲染

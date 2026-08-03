## ADDED Requirements

### Requirement: 多源输入生成视频描述文件
系统 SHALL 接收提示词、网页 URL、图片、文档作为输入，生成符合 Concept Video DSL 的 YAML 描述文件，落盘至 `data/videos/<series_slug>_ep<NN>.yaml`。网页输入 MUST 复用 `web_fetch` 解析，文档输入 MUST 复用附件解析/MinerU 文档解析层。系统 MUST 支持任意视频主题（科普/教学/营销/资讯等），生成逻辑 MUST NOT 依赖特定领域知识。

#### Scenario: 提示词生成 spec
- **WHEN** 用户输入"做一期讲解光合作用的科普视频，7 屏"
- **THEN** 系统生成通过校验的 YAML 描述文件并落盘 `data/videos/`，包含 opening 与 7 屏 scenes

#### Scenario: URL 输入生成 spec
- **WHEN** 用户提供网页 URL 作为素材来源
- **THEN** 系统经 `web_fetch` 提取内容后生成基于该内容的 YAML 描述文件

### Requirement: 交互式澄清
系统 SHALL 在生成前通过 `ask_user` 澄清受众、长度预设（7/10/13 屏）与风格偏好（主题/主色/字体/特效），澄清结果 MUST 反映在生成的 `style` 块与场景数量中。

#### Scenario: 用户确认风格偏好
- **WHEN** 生成前系统发起 `ask_user` 且用户选择主题 quant-traditional、主色 primary=#1A5FB4
- **THEN** 产出 YAML 的 `style.theme` 为 quant-traditional 且 `style.colors.primary` 为 "#1A5FB4"

### Requirement: 骨架复制与槽位填充
系统 SHALL 按长度预设复制 `video_blueprint` 骨架，LLM 仅填充 style、PageModel 六字段（title/question/core_message/narration/visual/transition）与类型专有 content_slots，布局与元素 MUST 从场景模板库继承，不允许自由编排。

#### Scenario: 每屏 PageModel 完整
- **WHEN** 系统生成任一场景
- **THEN** 该场景包含全部六个 PageModel 字段，且 core_message 不超过 120 字

### Requirement: 两层校验与回炉
系统 SHALL 对生成的 YAML 依次执行 DSL §10 JSON Schema（draft 2020-12）机器校验与 §13 语义清单复查（如"每个 formula 必配 numeric_example"），任一不通过 MUST 携带具体错误信息回炉重新生成，直至通过或达到重试上限后向用户报错。

#### Scenario: schema 校验失败回炉
- **WHEN** 生成的 YAML 含未注册的场景 type
- **THEN** 校验失败，系统将错误详情反馈给 LLM 重新生成，不产出落盘文件

#### Scenario: 语义复查失败回炉
- **WHEN** 生成的 YAML 中 formula 场景缺少 numeric_example
- **THEN** 语义复查失败并回炉，错误信息指明缺失字段与所在场景

### Requirement: DSL v3.1 style 扩展
系统 SHALL 支持顶层与分镜级 `style` 块（theme/preset/colors/fonts/effects 五字段均可选）。`style.colors` MUST 仅允许 7 个枚举 token 键、值为 hex；场景内颜色引用 MUST 使用 token，禁止裸 hex；字体 family MUST 走白名单；特效 type 与 background.type MUST 为封闭枚举。分镜级 style 优先级 MUST 高于全局 style。

#### Scenario: 合法 token 覆盖
- **WHEN** YAML 顶层 `style.colors` 定义 `primary: "#1A5FB4"`
- **THEN** 校验通过，全部引用 primary token 的组件渲染为该色值

#### Scenario: 场景内裸 hex 被拒绝
- **WHEN** 某场景样式直接写 hex 色值而非 token
- **THEN** 校验失败并提示"场景内仅允许引用颜色 token"

#### Scenario: 分镜覆盖全局
- **WHEN** 全局 `style.colors.primary` 为蓝色且某场景 `style.colors` 将 primary 重映射为 danger
- **THEN** 该场景 primary 渲染为 danger 对应色值，其余场景不受影响

### Requirement: 领域主题可插拔
系统 SHALL 将领域差异封装为领域包（主题色卡 + 场景模板/蓝图 + 领域技能包），支持多领域内建主题并存；新增领域 MUST 仅需新增领域包并在 `style.theme` 与技能声明中选用，MUST NOT 要求修改核心 schema、parser 或渲染组件。无匹配领域包时 MUST 以内建默认主题兜底。

#### Scenario: 无领域包主题照常出片
- **WHEN** 用户生成一个无对应领域包的通用主题视频（如"介绍太阳系"）
- **THEN** 系统以内建默认主题与通用场景模板完成生成与渲染

#### Scenario: 新增领域不改核心
- **WHEN** 新增一个领域包（新主题色卡 + 模板 + 技能）
- **THEN** 该领域视频可通过 style.theme 选用新主题出片，核心代码无任何改动

### Requirement: 向后兼容 v3.0
系统 SHALL 接受无 `style` 块的 v3.0 描述文件，全部视觉决策取内建主题默认值，渲染行为与 v3.0 一致。

#### Scenario: v3.0 文件照常渲染
- **WHEN** 输入一份无 style 块的 v3.0 YAML
- **THEN** 校验通过，渲染取内建主题默认色板与字体

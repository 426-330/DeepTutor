## Why

视频生成系统已端到端验收通过，但实际使用暴露两个体验问题：

1. **内容与主题不相关**：当输入带 URL（如知乎链接）且网页抓取失败（反爬/登录墙）时，`_gather_materials` 只发一条不痛不痒的进度提示就继续，LLM 在**零素材**情况下仅凭 URL 字符串编造视频内容——产出与用户需求无关的片子，且用户全程无感知；
2. **澄清表单语言不符**：video_spec 的澄清卡片（屏数/受众/主题/主色）文案按 `context.language` 选 prompts 语言，当用户界面/输入是中文但 context.language 未正确解析为 zh 时，用户看到英文表单。

## What Changes

- **抓取失败显式化**：用户消息含 URL 但全部抓取失败时，video_spec 不再静默继续——默认直接报错中止并给出可操作建议（粘贴正文/上传文档/检查链接），可选 `allow_fetch_failure: true` override 才允许无素材生成；
- **素材接地强化**：抓取成功的材料生成结构化摘要（标题+要点摘录）注入 style 设计与逐屏生成提示词；`spec_system` 提示词明确"内容必须来自素材，禁止编造"；生成后新增一条语义复查（warning 级）：spec 的 opening.title/series 与主题或素材标题无任何重合时给出相关性提醒；
- **澄清表单中文**：澄清卡片语言按"用户输入语言优先、context.language 兜底"选择 prompts 语言（中文输入 → 中文卡片）；同时校正 en/zh prompts 的 clarify 节键值一致性。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `video-spec`：URL 抓取失败从"静默降级"改为"默认中止报错（可显式放行）"；素材摘要注入生成链路；新增相关性语义复查（warning 级）；澄清卡片语言选择改为用户输入语言优先。

## Impact

- **代码**：`deeptutor/capabilities/video/capability.py`（_gather_materials 失败语义）、`spec_agent.py`（素材摘要注入 design_style/generate_spec）、`validator.py`（相关性 warning）、`clarify.py`（语言选择）、`deeptutor/capabilities/prompts/{zh,en}/video_spec.yaml`（提示词与澄清文案）；
- **行为变更（BREAKING 语义级）**：URL 抓取失败从"继续生成"变为"默认报错中止"——依赖旧静默行为的调用方需传 `allow_fetch_failure: true`；
- **测试**：`tests/capabilities/` 新增抓取失败、相关性 warning、澄清语言选择用例；
- 无 schema/DSL/渲染层变更；无部署变更。

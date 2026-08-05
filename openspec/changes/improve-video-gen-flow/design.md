## Context

视频生成系统（change `video-generation-system`，已 53/53 完成并验收）上线使用后，用户实测反馈：输入"把这篇文章做成视频：<知乎链接>"，生成的视频内容与文章无关。排查定位：`deeptutor/capabilities/video/capability.py` 的 `_gather_materials` 在 `fetch_url_as_markdown` 失败时（知乎有登录墙/反爬）仅发一条 progress 提示，`materials` 为空字符串仍继续走 style 设计与逐屏生成——LLM 只能凭 URL 和用户一句话自由发挥，产出跑题内容。澄清卡片语言问题：clarify 文案按 `context.language` 选 `prompts/{en,zh}`，语言未解析为 zh 时中文用户看到英文表单。

## Goals / Non-Goals

**Goals:**

- 杜绝"零素材静默出片"：URL 抓取全败时默认中止并给出可操作建议；
- 有素材时，素材要点显式注入生成链路（style 设计 + 逐屏填充），提示词强约束"内容来自素材"；
- 生成后给出可机器检查的相关性信号（warning 级，不阻断）；
- 中文输入的用户看到中文澄清表单。

**Non-Goals:**

- 不做内容质量的语义评分/重写（LLM 自评相关性属增强，不在本期）；
- 不改 DSL schema、渲染层、前端组件结构；
- 不做 zhihu 等站点的专项反爬适配（登录墙站点走"中止 + 引导粘贴正文"路径）。

## Decisions

### D1 · 抓取全败默认中止，显式 override 才放行

`_gather_materials` 返回结构化结果（素材文本 + 失败 URL 列表）。判定规则：用户消息含 URL ∧ 全部抓取失败 ∧ 无附件素材 → video_spec 在 loading 阶段报错中止，错误信息给出三个可选项（粘贴正文重发 / 上传文档附件 / 加 `allow_fetch_failure: true` 强制继续）。**备选**：继续静默降级——被否，这正是用户投诉的根因；弹 ask_user 二次确认——被否，多一轮交互且中止路径已足够清晰。

### D2 · 素材摘要注入两个 LLM 调用点

抓取成功后先做一次轻量摘要（直接截取材料前 N 字符 + 首个标题，不再多调一次 LLM——保持成本与延迟不变），注入：① `design_style`（风格贴合素材领域）；② `generate_spec` 的 `materials` 占位符（已有，保留全文截断版）。`spec_system` 提示词增补硬约束："所有屏的 core_message/narration/content_slots 必须基于所给素材；素材不足时宁可减少屏数也不得编造事实"。

### D3 · 相关性语义复查（warning 级）

`semantic_review` 新增 W11：提取 spec 的 series + opening.title + 各屏 title，与"用户消息关键词 + 素材标题"做字符级 bigram 重合度检查（沿用 5.11 引入的中文 bigram 启发式，零新依赖）；完全无重合 → warning（进 `validation_warnings`，不阻断、不回炉）。纯启发式，宁可误报不错报——只作为用户可见信号。

### D4 · 澄清语言：用户输入语言优先

`clarify_prefs` 选择 prompts 语言的顺序改为：`context.language` 显式为 zh/en → 否则对用户消息做简单中文检测（含 CJK 字符即 zh）→ 默认 en。实现为纯函数 `resolve_prompt_language(message, context_language)`，可单测。en/zh prompts 的 clarify 节键值对齐核查随任务完成。

## Risks / Trade-offs

- [抓取失败中止影响既有自动化调用] → 语义级 breaking，override `allow_fetch_failure` 保留旧行为；README 与任务说明同步。
- [bigram 相关性检查误报（如全英文主题配中文素材）] → 仅 warning 级，不阻断；阈值取"零重合才报"。
- [中文检测误判（中英混输）] → 含 CJK 即判 zh，符合目标用户群；context.language 显式设置时优先，不受启发式影响。

## Migration Plan

无数据迁移。部署即生效；调用方如依赖"抓取失败也出片"的旧行为，加 `allow_fetch_failure: true`。

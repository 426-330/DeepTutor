## Why

DeepTutor 现有的可视化能力（`visualize` / `math_animator`，Manim 栈）只覆盖对话中的即兴图解与短动画，无法产出多分镜、带配音字幕、风格一致且可精修重渲染的制片级视频。本变更依据《视频生成系统 · 技术架构与开发计划》v1.4（`docs/视频生成系统-技术架构与开发计划.md`），在 DeepTutor 基座上构建 agent 驱动的**通用**可编程视频生成系统（科普/教学/营销/资讯等，不绑定单一领域）：**LLM 负责创作（产出强校验 YAML spec），代码负责保真（Remotion 严格按 spec 逐帧渲染）**。量化科普 DSL 仅作首个领域种子契约；系统核心领域无关，新领域通过"领域包"（主题色卡 + 场景模板 + 技能包）插拔扩展，不改核心 schema 与渲染层。

## What Changes

- 新增 5 个视频 capability，注册到 DeepTutor capability/plugin 体系：
  - `video_pipeline`：端到端编排入口，串联四阶段，支持断点续跑；
  - `video_spec`：多源输入（提示词/URL/图片/文档）→ 经 `ask_user` 澄清 → 生成并校验视频描述文件（YAML）；
  - `asset_gen`：插画（imagegen）/网页截图/图表数据/BGM 素材生成，产物带 `.meta.json` 可复现；
  - `narration_gen`：TTS 逐屏配音 + whisperX 词级时间戳对齐，真实时长落 `.align.json`；
  - `video_compose`：调度 remotion-worker（Node）完成 YAML→IR→逐帧渲染→mp4。
- 采纳 Concept Video DSL v3.0 为描述文件权威契约，并提出 **v3.1 扩展**（顶层/分镜级 `style` 块：颜色 token、字体、特效入 YAML）。**前置门禁**：DSL 相关四份资产（`concept-video-dsl.md`、`concept-video-scene-templates.yaml`、`量化色卡规范.md`、`skills/quant-video-remotion/`）当前不在仓库，须先取回入库；取回失败则按 §九路径 B 从零建设最小集。
- 新增 `remotion-worker` Node 服务（Express/Fastify + `@remotion/renderer` + headless Chrome + ffmpeg），含组件注册表、Scene/布局组件库、字幕/混音轨。
- 前端改造：首页项目制（project = 一个视频）、spec 编辑器（表单 + YAML 双模）、Remotion Player 即时预览、渲染任务管理页；Activity 面板改造为产物面板。
- 技能体系：特效技能包结构（SKILL.md + component.tsx + defaults.json）、渲染白名单、项目级技能挂载机制。
- runner 沙箱镜像扩展：加装 whisperX（字幕对齐）与 Chromium + Playwright（网页截图）。
- CLI 新增 `video render/preview/spec validate` 命令组，沿用 `--format json` 事件流。
- 裁剪：Knowledge Center 精简为素材库（保留 LlamaIndex，移除 GraphRAG 等重引擎）；Memory 裁剪为 L1 事件流；Quiz、Mastery Path、Learning Space 大部分、Book、Co-Writer 移除，IM Partners 保留代码不启用。`visualize`/`math_animator`（Manim）保留不动，与本系统并存（即兴可视化 vs 制片级视频）。

## Capabilities

### New Capabilities

- `video-spec`：视频描述文件（YAML）的生成、澄清交互、JSON Schema + 语义清单两层校验、DSL v3.1 style 扩展与版本兼容。
- `asset-gen`：按 spec 生成插画/截图/图表/音频素材，生成参数落 `.meta.json` 保证可复现，素材 prompt 注入主题色板保持一致性。
- `narration-gen`：narration 三段式 → TTS 逐屏配音 → whisperX 词级时间戳；真实时长写 `.align.json`，在渲染 IR 注入期覆盖 `duration_frames`，不回写 YAML。
- `video-compose`：渲染任务调度与 remotion-worker 渲染管线（校验→IR→组件映射→混音→ffmpeg），含 WS 进度事件、局部重渲染、渲染白名单降级。
- `video-pipeline`：端到端编排入口，按产物契约串联四阶段，失败断点续跑；支持绕过编排单独触发任一阶段做局部迭代。
- `video-skills`：特效技能包规范、提示词注入、渲染白名单、项目级技能挂载（短期 `always: true`，中期项目元数据声明式挂载）。
- `video-ui`：前端项目制首页、spec 编辑器（表单 + YAML 双模）、Remotion Player 预览、渲染任务管理、产物面板。

### Modified Capabilities

（无 —— `openspec/specs/` 当前无既有 spec，全部为新增。）

## Impact

- **代码**：`deeptutor/capabilities/`（新增 5 个 capability）、`deeptutor/runtime/bootstrap/builtin_capabilities.py`（注册）、`deeptutor/tools/`（复用 imagegen/web_fetch/ask_user）、`deeptutor/services/{voice,imagegen,sandbox,memory,rag}`（复用或裁剪）、`deeptutor_cli/`（新增 video 命令组）、`web/`（前端改造，新增 Remotion 依赖）、新增 `remotion-worker/` Node 服务、`Dockerfile.runner`（镜像扩展）、`docker-compose.yml`（新增 remotion-worker、可选 redis）。
- **数据**：新增 `data/videos/` 目录树（YAML 事实源 + 产物目录）；渲染任务存 SQLite（沿用 `sqlite_store` 模式）。
- **依赖**：Remotion 4.x、`@remotion/three`、ajv（worker/前端）、jsonschema（backend）、whisperX、Playwright + Chromium、KaTeX、Math.js；M4 起可选 BullMQ + Redis。
- **许可**：Remotion Company License 需在动工前核对（公司超规模需付费），已列为高风险项。
- **前置条件（G0 门禁）**：四份 DSL 资产实体须先取回入库，否则触发 M-1 从零建设路径，工期 +4–5 周。

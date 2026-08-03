## Context

DeepTutor v1.5.6 是 agent-native 学习伴侣：ChatOrchestrator 路由 UnifiedContext 到 capability（`deeptutor/runtime/orchestrator.py`、`deeptutor/runtime/bootstrap/builtin_capabilities.py`），工具系统含 `imagegen`/`videogen`（`deeptutor/tools/media_gen_tool.py`）、`web_fetch`、`ask_user`，exec 沙箱有 RunnerSidecar/Bwrap/RestrictedSubprocess 三级后端（`deeptutor/services/sandbox/backends.py`），模型层 35 个 LLM provider + TTS/STT 适配（`deeptutor/services/voice/`），前端 Next.js 16 + React 19（无任何视频/Remotion 依赖），会话存储 SQLite（`deeptutor/services/session/sqlite_store.py`）。

本变更依据 `docs/视频生成系统-技术架构与开发计划.md` v1.3。关键约束：

- **G0 资产门禁**：四份 DSL 资产（concept-video-dsl.md v3.0、concept-video-scene-templates.yaml v2.1、量化色卡规范.md、skills/quant-video-remotion/）已核验不在仓库，须先取回；取回失败走路径 B（M-1 从零建设最小集：7 场景/12 布局/单主题）。
- DeepTutor sticky 会话上下文不含技能；runner 镜像无 headless browser 与 whisperX——均为新增工作。
- 裁剪策略：fork 锁定 v1.5.6 基线，只 cherry-pick 安全修复。

## Goals / Non-Goals

**Goals:**

- 一句话（或 URL/文档）→ 多分镜、带配音字幕、风格一致的 mp4，全链路可复现、可局部迭代。
- YAML 描述文件为唯一事实源：颜色/字体/特效/分镜/口播/数据同文件，封闭枚举 + JSON Schema 校验，LLM 不自由编排。
- Python 编排 / Node 渲染职责切分；预览走 Remotion Player 不渲染，改单屏局部重渲染。
- 与既有 `visualize`/`math_animator`（Manim）并存不替代。

**Non-Goals:**

- 不做自由编排的视频编辑器（时间轴拖拽、任意图层）——可控性靠封闭枚举而非自由度。
- 不做实时/直播渲染；不追求秒级出片（预览红利由 Player 承担）。
- 不改造 Manim 能力，不引入 Manim 依赖进本系统。
- M4 之前不引入 Redis/BullMQ（内存队列起步）。

## Decisions

### D1 · 描述文件用 YAML 而非 JSON，采纳外部 DSL 而非自研 schema

LLM 生成 YAML 容错优于 JSON（无引号配平/尾逗号），人类可读可批注可注释；解析后以 JSON Schema（draft 2020-12）机器校验——生成与校验解耦。契约直接采纳《Concept Video DSL v3.0》（13 场景枚举 + PageModel 六字段 + 24 布局），本系统仅以 v3.1 扩展增补 `style` 块（theme/preset/colors/fonts/effects，顶层全局 + 分镜级覆盖）。**备选**：自研 schema——被否，重复造轮子且丢失已有模板库护栏；JSON 直写——被否，LLM 容错差、不可注释。

### D2 · 封闭枚举即可控性

场景 13 种、布局 24 种、颜色 7 个 token、图表/转场/动效全枚举 + 字数限制（标题 ≤14 字、core_message ≤120 字），LLM 自由度约束在枚举内；每支视频 = `video_blueprint` 骨架复制 + 槽位填充。v3.1 唯一开口：`style.colors` 可写 hex，但只能重定义 7 个 token 的值，场景内仍只能引用 token（特效技能参数同纪律）。**备选**：放开自由布局——被否，生成不稳定且无法校验。

### D3 · 样式经样式链合并 + theme provider 注入，组件零改动

解析链：内建主题 → `style.theme` → `style.colors` 覆盖 token 值 → 分镜 `style.colors` 重映射 → 组件取色；字体与特效同理（全局 → 分镜覆盖 → 组件默认兜底）。parser 输出的 IR 携带 StyleChain，经 theme provider 注入组件树——v3.1 扩展不触碰 §12 渲染映射与组件代码。**备选**：样式写进每个组件 props——被否，改风格要逐屏改。

### D4 · 渲染层独立为 remotion-worker（Node 服务），HTTP + WS 契约

FastAPI `POST /render {yaml_path, job_id}` → worker：YAML → ajv 校验 → 规范化 TS IR（默认值注入/布局别名解析/`.align.json` 时长覆盖）→ DSL type/layout 映射 Scene 组件与 `src/layouts/` → KaTeX/Math.js → 字幕+BGM 混音 → headless Chrome 逐帧 → ffmpeg → `renders/<job_id>.mp4`；WS 回传进度。worker 可水平扩 N 副本，M4 加 BullMQ+Redis。**备选**：Python 进程内调 Remotion CLI——被否，无进度事件、无法扩副本、进程生命周期难管。

### D5 · 双运行时 + 三端共享单一 schema 来源

Python（FastAPI）编排与模型调用；Node 渲染与 Player 预览。JSON Schema 单一来源在 DSL §10：worker 与前端 Player 用 ajv，backend 用 jsonschema，各一份语言实现。parser 在 worker 与前端 Player 之间共享 TS 实现（同一份"YAML→IR"代码喂 Player 即时预览，这是选型 Remotion 的最大交互红利）。**备选**：schema 双端各自维护——被否，必然漂移。

### D6 · 时长覆盖在 IR 注入期，不回写 YAML

whisperX 对齐产物（真实时长 + 词级 cues）落 `audio/s<NN>.align.json`；渲染时 IR 注入期读取并覆盖 DSL `duration_frames` 默认值。YAML 保持纯创作层——重配音不改事实源，git diff 干净。**备选**：回写 YAML——被否，运行期产物污染创作层。

### D7 · 端到端编排为独立 capability，产物即契约

`video_pipeline` 依次调度 `video_spec → asset_gen → narration_gen → video_compose`，阶段间不共享内存状态，只认落盘产物；任一阶段失败从断点重跑；用户可绕过编排单触发某阶段（只重配音、只改素材）。**备选**：一个巨型 capability 内含四阶段——被否，违背 DeepTutor capability 单一职责，且无法局部迭代。

### D8 · 技能注入三机制，挂载分两档落地

① 提示词注入：video 系 capability 检索已安装技能，把约束文档注入 LLM 上下文；② 渲染白名单：worker 只认已注册场景/布局/组件标识，未知降级占位帧 + 告警；③ 项目级挂载——DeepTutor sticky context 不含技能，故分档：短期 frontmatter `always: true` 全局常驻（零开发量）；中期项目元数据声明技能列表，capability 启动时挂载。特效技能包 = SKILL.md（参数 schema，颜色参数仅枚举 token）+ component.tsx（R3F，经 `@remotion/three` 进 worker bundle）+ preview.png + defaults.json。

### D9 · 沙箱镜像扩展而非新建

whisperX（词级对齐）与 Chromium + Playwright（网页截图）加装进 `Dockerfile.runner`，分层构建，whisperX 模型按需下载或独立数据卷。沿用 RunnerSidecarBackend 契约，编排层无感知。

### D10 · 数据布局：data/videos/ 一棵树，YAML 唯一格式

```
data/videos/<series_slug>_ep<NN>.yaml     # 唯一事实源（进 git）
data/videos/<series_slug>_ep<NN>/{data,assets,audio,renders}/
```

无 spec.json、无 projects/。渲染任务 `{id, yaml_path, yaml_hash, frames, status, progress}` 存 SQLite（沿用 sqlite_store 模式）。版本管理复用 git 或文件快照。

### D11 · 裁剪学习域，保留可逆性

Knowledge Center 保留 LlamaIndex pipeline 移除 GraphRAG 等重引擎；Memory 旁路 L2/L3 consolidator 只留 L1 事件流（无总开关，fork 物理旁路）；Quiz/Mastery Path/Learning Space 大部分/Book/Co-Writer 移除；IM Partners 保留代码不启用（未来分发机器人现成）。fork 锁 v1.5.6，只 cherry-pick 安全修复。

### D12 · 领域无关核心 + 领域包插拔

系统面向通用视频生成，核心（DSL schema、parser、Scene/布局组件、渲染管线、四阶段编排）不含任何量化领域假设。领域知识封装为**领域包** = 主题色卡（内建主题）+ 场景模板/蓝图 + 领域技能包（如 quant-video-remotion）；量化科普是首个领域包，新领域（教学/营销/资讯……）只需新增领域包并在 spec `style.theme` 与技能声明中选用，核心代码零改动。无领域包时以内建默认主题兜底，通用讲解结构（opening/problem/concept/formula/chart/conclusion 等场景枚举）天然跨领域。**备选**：核心内置量化语义——被否，与"通用视频生成"目标直接冲突。

## Risks / Trade-offs

- [四份 DSL 资产缺失（已核验不在仓库）] → G0 门禁先行；取回失败走路径 B：M-1 从零建设最小集（7 场景/12 布局/单主题），全量并入 M2–M3 补完，工期 +4–5 周。
- [Remotion 商业许可（公司超规模需付费）] → 动工前核对 Company License 条款并计入成本；若不可行，渲染层替换为 FFmpeg 管线（牺牲 Player 预览红利）。
- [Chrome 逐帧渲染慢] → 预览走 Player 不渲染；`--frames` 局部重渲染；M4 多 worker / Remotion Lambda 横向扩展。
- [spec 复杂度爆炸、LLM 生成不稳定] → D2 封闭枚举 + 骨架槽位填充 + §10 机器校验 + §13 语义复查，不通过带错误回炉。
- [runner 镜像膨胀（whisperX + Chromium）] → 分层构建；whisperX 模型独立数据卷按需下载。
- [上游 DeepTutor 快速漂移] → fork 锁 v1.5.6，只 cherry-pick 安全修复，不追 feature。
- [三端 schema 实现漂移（ajv×2 + jsonschema）] → schema 单一来源在 DSL §10 文档，三端从同一定义生成/同步，CI 加一致性校验。
- [TTS 中文质量参差] → provider 层可插拔，Edge-TTS 起步，预留火山/ElevenLabs 对比评测。

## Migration Plan

本变更为 fork 内新增能力，无线上数据迁移。落地顺序即路线图：G0 资产门禁 → M0 基线（fork 锁定、裁剪、CI、worker HelloWorld、runner 镜像扩展 smoke）→ M1 最小闭环（DSL + video_spec + TTS + 单场景渲染）→ M2 完整流水线（素材、字幕、前端编辑器 + Player、video_pipeline 串联）→ M3 技能体系 → M4 工程化。回滚策略：视频能力全部为新增目录与注册项，摘除 `builtin_capabilities.py` 注册行 + compose 服务即可整体下线，不影响 DeepTutor 既有功能。

## Open Questions

- 四份 DSL 资产的实际存放位置？（G0 门禁解答；决定路径 A/B）
- Remotion Company License 对本组织是否适用、成本几何？（动工前法务核对）
- 路径 B 下 7 个核心场景的具体取舍（opening/problem_hook/concept/formula/chart/conclusion/summary 是否为最小集）？
- 项目级技能挂载的元数据载体：`data/videos/` 项目级配置文件 vs settings 层，实现前定夺。

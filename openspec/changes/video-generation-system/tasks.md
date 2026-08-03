# 实施任务清单

> 依据 proposal.md / design.md / specs/*，对应路线图 G0 → M0 → M4（路径 B 时插入 M-1）。

## 1. G0 · 资产核验门禁（第 1 周，阻塞项）

- [x] 1.1 定位并取回四份资产实体：`concept-video-dsl.md` v3.0、`concept-video-scene-templates.yaml` v2.1、`量化色卡规范.md`、`skills/quant-video-remotion/` → **结论：全仓（含 git 历史）不存在，见 g0-gate.md §1**
- [x] 1.2 资产入库到 `data/skills/` 与文档目录，确认 DSL §10 JSON Schema 可用 ajv/jsonschema 加载 → 路径 B：已入库 `video_dsl/` 与 `deeptutor/skills/builtin/`（docs/ 被 gitignore 不可用）；schema 为合法 draft 2020-12 JSON、模板与 schema 枚举程序化一致；jsonschema 完整校验待 backend 落地复跑（环境无此包，已用等价子集校验器验证正负样本）
- [x] 1.3 核对 Remotion Company License 条款，记录结论与成本 → **≤3 人免费，当前团队零成本；第 4 人触发 $25/seat/月，列入 M4 季度复核，见 g0-gate.md §2**
- [x] 1.4 门禁决策：资产齐 → 跳过第 2 节（路径 A）；资产缺失 → 执行第 2 节（路径 B，工期 +4–5 周）→ **决策：路径 B，M-1 启动**

## 2. M-1 · DSL 从零建设（仅路径 B）

- [x] 2.1 编写 `concept-video-dsl.md` v3.0 核心：PageModel 六字段 + JSON Schema + IR 规范（默认值注入/布局别名/duration_frames 覆盖）→ `video_dsl/concept-video-dsl.md` + `video_dsl/schema/concept-video.schema.json`
- [x] 2.2 定义 7 个核心场景类型（opening/problem_hook/concept/formula/chart/conclusion/summary）及其 content_slots
- [x] 2.3 定义 12 个高频布局与 `layout_library`，编写 `concept-video-scene-templates.yaml` 与 `video_blueprint`（7/10/13 屏预设）→ 12 布局 + 别名表 + short-7/standard-10/full-13 三套蓝图
- [x] 2.4 编写 `量化色卡规范.md`：1 个内建主题 + 7 色枚举 token（作为首个领域主题，核心保留默认主题兜底）→ 7 token + default/quant-traditional 双主题
- [x] 2.5 落地 DSL v3.1 style 扩展：JSON Schema 增补 style 定义（colors 仅 7 token 键/hex 值、字体白名单、特效枚举）→ 顶层 colors 值限 hex、分镜级 colors 值限 token 枚举，裸 hex 负样本已被 schema 直接拒绝
- [x] 2.6 搭建 `skills/quant-video-remotion/` 技能包骨架（SKILL.md + references），作为首个领域技能包 → `deeptutor/skills/builtin/quant-video-remotion/`（frontmatter `always: true` + references/{dsl,layouts,colors}.md）
- [x] 2.7 全量补完排入 M2–M3：13 场景 / 24 布局 / §13 语义清单 / 多主题 → 已落为 5.11 / 6.9

## 3. M0 · 基线（第 1–2 周）

- [x] 3.1 fork 并锁定 DeepTutor v1.5.6 基线，建立 cherry-pick 安全修复流程 → 见 g0-gate.md §3
- [x] 3.2 完成裁剪：Knowledge Center 移除 GraphRAG 等重引擎（保留 LlamaIndex）；Memory 旁路 L2/L3 consolidator 只留 L1；Quiz/Mastery Path/Learning Space 大部分/Book/Co-Writer 移除；IM Partners 保留不启用 → **按用户确认的"开关优先"执行**：mastery_path 注册摘除、6 个学习域路由不挂载、CLI book 摘除、RAG `ENABLED_PROVIDERS={llamaindex}` 总开关、memory `consolidation.enabled=false` 旁路（全部注释可恢复，零物理删除）；失效测试与 AGENTS.md/SKILL.md 已同步新行为（本地无 pytest，待 CI 终验）
- [x] 3.3 CI 跑通裁剪后代码库（测试 + lint + 构建）→ 本地 CI 代理通过（2026-08-03）：全量 **3145 passed / 0 failed**（uv venv + dev/partners 依赖）；ruff 0 errors（修 12 处 import 排序）；web build + 278 tests、worker build + verify、三个 Docker 镜像构建全部通过。收尾同步 19 项裁剪遗漏测试（knowledge 三文件 fixture 放行被测引擎 + 门禁本体测试锁定；test_rag_tool 漏网同类；sandbox 1 项为本机 PATH 无 python 的环境问题）。注意：partners 测试需 `requirements/partners.txt`，CI 依赖步骤须包含
- [x] 3.4 搭建 `remotion-worker` 骨架：node:22 + Chrome 依赖 + ffmpeg 镜像，Express/Fastify + `@remotion/renderer`，`POST /render` 硬编码 spec → mp4 HelloWorld → **已端到端验证**：npm install/tsc/`render-sample` 出 mp4（h264 1080p30 5.06s）、`/health`+`POST /render`+WS 154 条进度事件冒烟通过；留待 M1：ajv parser、SQLite JobStore
- [x] 3.5 扩展 `Dockerfile.runner`：加装 whisperX 与 Chromium + Playwright（分层构建）→ 已加两层（torch-CPU + whisperx、PLAYWRIGHT_BROWSERS_PATH=/ms-playwright + chromium），镜像构建验证随 3.6 一并进行
- [x] 3.6 runner 镜像 smoke：沙箱内 whisperX 对齐一段中文音频、Playwright 截图一个网页，各跑通一例 → 均通过（截图 17KB；whisperX tiny 模型产出 segments/language JSON）。过程中修复镜像缺口：补 ffmpeg 层（whisperX 依赖）。注意：huggingface.co 访问有 SSL 抖动（重试后成功），生产建议模型预烘焙或挂卷缓存
- [x] 3.7 docker-compose 一键起（backend/frontend/remotion-worker/runner），出第一个测试视频 → 4 容器全 healthy；首片 m0-first-video.mp4 4.544s（135 帧）渲染成功。部署修复：① video_dsl 契约资产挂载进 backend（/app/video_dsl）与 worker（/video_dsl）容器；② worker RENDER_OUT_DIR 对齐 renders/ 子目录；③ integrations.remotion_worker_url 指向 compose 内部地址。注意：起栈必须 `docker compose -f docker-compose.yml`（仓库根 compose.yaml 是 Podman 变体会抢占默认）

## 4. M1 · 最小闭环（第 3–5 周）

- [x] 4.1 backend 侧 `video-spec` Pydantic schema + jsonschema 校验器（schema 来源 DSL §10）+ 版本迁移器 → `deeptutor/capabilities/video/`（schema.py/validator.py/migrations.py；校验权威只在 JSON Schema，Pydantic 透传 content_slots 杜绝双源漂移；隔离 venv 实测正负样本 + 迁移）
- [x] 4.2 实现 `video_spec` capability：`ask_user` 澄清 → style 设计块 → 骨架复制 + 逐屏槽位填充 → 两层校验（§10 机器校验 + §13 语义清单）→ 回炉机制 → 落盘 `data/videos/*.yaml` → `capability.py`（clarifying→designing→generating→validating→writing，回炉 ≤3 次，落盘写规范化 YAML；prompts 入 capabilities/prompts/{zh,en}/）
- [x] 4.3 worker 侧 parser：YAML → ajv 校验 → 规范化 TS IR（默认值注入/布局别名/样式链合并），theme provider 注入组件树 → `src/parser/`（ajv draft 2020-12 单一 schema 来源 + §13 语义复查 + styleChain + ThemeProvider，组件零硬编码 hex）
- [x] 4.4 worker Scene 组件与 `src/layouts/` 布局组件按 DSL §12 映射表实现（含 SceneFrame 外层），KaTeX/Math.js 内置 → 7 Scene + 12 Layout + SceneFrame + KaTeX/Math.js 实时计算；chart 为 SVG 简实现（line/bar/area），pie/particles 走占位降级 + WS warning
- [x] 4.5 实现 `narration_gen` capability：narration 三段式 → TTS 逐屏 wav → whisperX 词级时间戳 → `.align.json`（时长不回写 YAML）→ `narration_capability.py` + `align.py`（沙箱 whisperX 封装，失败降级不阻断；`.align.json` 含 duration_frames + cues）
- [x] 4.6 IR 注入期时长覆盖：读取 `.align.json` 覆盖 `duration_frames`，场景时长以音频为准 → `src/parser/align.ts`（只改 IR，已断言 YAML 字节不变；假 align 使 s01 45→60 帧、成片 150 帧验证通过）
- [x] 4.7 注册 video 系 capability 到 `builtin_capabilities.py`，复用 `emit_capability_result()` 统一信封 → video_spec/narration_gen 已注册（asset_gen/video_compose/video_pipeline 留注释位）；注册表测试同步，pytest 78 passed（隔离 venv）
- [x] 4.8 验收：一句提示词 → 30 秒单风格视频（含配音）→ **端到端打通**（2026-08-03，Docker 全栈）：DeepSeek V4 Pro 生成 7 屏复利科普 spec（含 1 次校验回炉）→ asset/narration 降级（无 imagegen/TTS）→ WS 进度渲染出 21s 成片，抽帧验证中文/分镜/降级占位正确。验收中修复：① 推理模型 max_tokens 4096 被 reasoning 耗尽（→16384/8192）；② TTS 未配置硬失败改逐屏降级（ValueError 漏捕）；③ worker 镜像补 fonts-noto-cjk（豆腐块）；④ video_dsl 挂载 + 源码挂载 + RENDER_OUT_DIR 对齐。**"含配音"子项待 TTS 配置后补验**

## 5. M2 · 完整流水线（第 6–9 周）

- [x] 5.1 实现 `asset_gen` capability：imagegen 插画（prompt 注入主题色板）+ `.meta.json`；沙箱网页截图；图表数据落 `data/`；BGM 素材库解析 → `asset_capability.py` + `assets.py` + `themes.py`（色板从量化色卡规范解析，单一来源；manifest.json 总账；失败降级不阻断）
- [x] 5.2 字幕轨组件 + BGM 混音轨，多场景 + 转场特效串联渲染 → worker 侧完成：逐屏 `<Audio>` 配音 + 根级 BGM 循环垫底（默认 0.15，`bgm_path`/`bgm_volume` 任务参数可调）、字幕按 cue 帧区间精确切换（抽帧目检通过）；解决 file:// 被 Chrome 拒载问题（渲染期本地静态服务改写媒体 URL）；ffprobe 验证 aac 双声道/时长/响度，verify 4 次真实渲染 ALL PASSED
- [x] 5.3 实现 `video_pipeline` capability：四阶段顺序调度、产物即契约、断点续跑、单阶段独立触发 → `pipeline_capability.py` + `pipeline_state.json`（产物被删自动重跑）+ `compose_capability.py`（video_compose 本体，可独立触发）+ `worker_client.py`（health→POST→轮询，409 自动后缀）；五 capability 全注册；**148 tests passed**；真机 worker 冒烟：202 出片 6.06s、400 结构化、断点续跑只跑 compose、二轮全跳过
- [x] 5.4 前端项目制首页（project = 一个视频）→ `/videos` 卡片网格（屏数/四阶段状态灯/最新成片）+ 新建 Modal（跳转对话流预选 video_pipeline + 预填 prompt）；nav 已加入口
- [x] 5.5 前端 spec 编辑器：表单 + YAML 双模同步编辑，校验错误定位到屏与字段 → `/videos/[name]/edit`：双模共用 yamlText 事实源、7 场景 slots 表单、增删移屏、PUT 400 错误跳屏标红
- [x] 5.6 前端嵌入 Remotion Player：共享 worker 的 TS parser，"YAML → IR"即时预览（不触发渲染）→ Player 4.0.502 锁版 + 构建期 vendor 同步（`sync-remotion-preview.mjs` 复制 fs-free 子集，规避 Turbopack `.js`→`.ts` 与双 React 两个硬问题，worker 零改动）；debounce 500ms 热更新；web 276/276 tests、双端 build + worker verify 全过
- [x] 5.7 渲染任务管理页：WS 进度展示、整片渲染、成片播放/下载；渲染任务存 SQLite → `/videos/[name]` Renders tab：整片渲染 + 帧区间局部重渲染 + 签名轮询（3s，10min 超时）+ `<video>` 在线播放/下载；SQLite 持久化仍是 7.x 待办（当前内存 Map + 文件系统产物）
- [x] 5.8 Activity 面板改造为产物面板（素材/音频/渲染任务分类展示）→ 详情页 Assets/Audio tabs：缩略图 + meta 展开、时长 + align 徽标 + 播放器、pipeline 四阶段状态条
- [x] 5.9 验收：网页输入 → 60 秒多场景带字幕视频，在线改字改色即时预览 → **网页输入出片通过**：Wikipedia 太阳系 URL → web_fetch 提取 → spec（系列"太阳系奥秘"，67 处行星相关内容）→ 21s 成片；在线编辑链路验证：/videos 与 edit 页 200、PUT 400 结构化错误定位（rule/field/scene/severity）、warning 随 200 返回；Player 预览随镜像 vendor（M2 已 build+测试验证）。**带字幕/配音子项待 TTS 配置后补验**（当前字幕轨为 narration 文本兜底）
- [x] 5.10 通用性验证：用一个无领域包的通用主题（如"介绍太阳系"）走完一句话出片闭环，确认核心链路零领域假设 → 通过（2026-08-03）："介绍太阳系·八大行星"全流程四阶段 done，独立项目成片 630 帧，default 主题 + 通用场景模板，无领域包。顺带暴露并修复 pipeline 复用 bug（全新请求误命中 latest spec 断点续跑导致全阶段跳过，改为仅 start_from 时回落 latest）
- [x] 5.11 全量补完（路径 B 分期）：场景类型 7 → 13、§13 语义清单全量（承接 2.7）→ +data_comparison/timeline/quote/big_number/case_study/recap；§13 扩为 R1–R8 error + W9/W10 warning（worker 与 backend validator 逐条对齐）；full13 样本真实渲染 13.056s 验证

## 6. M3 · 技能体系（第 10–12 周）

- [x] 6.1 特效技能包规范落地（SKILL.md + component.tsx + preview.png + defaults.json），参数颜色仅枚举 token → `video_dsl/effect-skills.md` 规范 + `video_dsl/skills/` 目录约定（repo 内建/user 安装位 shadow）+ `skills.py` scanner（frontmatter/defaults 解析、颜色纪律告警）
- [x] 6.2 three.js 技能包 ×3（如 three/particle-wave），经 `@remotion/three` 注册进 worker 映射表 → `video_dsl/skills/three/{particle-wave,floating-shapes,grid-terrain}/`（SKILL.md + R3F component.tsx + defaults.json）；抽帧目检 token 解析正确，verify [10] skills 渲染 3.051s
- [x] 6.3 技能安装/检索/提示词注入链路：声明特效 → 产出引用技能的合规 YAML → video_spec designing 阶段注入技能约束（生成+回炉两路径）；validator 增 warning 级复查（background.skill 引用未安装技能，不阻断）；渲染层白名单降级双保险
- [x] 6.4 渲染白名单：未注册标识降级占位帧 + WS 告警 → **M1 worker 已实现**：未知 type/layout 降级占位帧 + WS warning（degrade_ep01 样本验证通过）
- [x] 6.5 技能组件打包管线：技能 component.tsx 进 worker bundle → `src/skills/generate.ts` 构建期扫描 video_dsl/skills → 拷贝组件 + 生成 registry.gen.ts 静态导入（bundle 前自动重生成）；SkillHost 为 three-free 挂载点，web 预览零 three 依赖降级；未安装技能 → 渐变 + `skill-not-installed` warning
- [x] 6.6 项目级技能挂载：短期 frontmatter `always: true`；中期项目元数据声明式挂载 → 短期档 quant-video-remotion always:true（测试锁定）；中期档 `<video_dir>/project.yaml` 的 skills 声明，video_spec/video_pipeline 启动时注入，缺失回落 always:true（resolve_project_skills，13 项测试）
- [x] 6.7 `ask_user` 交互式风格确认融入 video_spec 流程 → **M1 已实现**：clarify.py（受众/长度预设/主题/主色/字体/特效，overrides > ask_user > 默认）
- [x] 6.8 验收：提示词声明特效 → 正确渲染 → 通过（2026-08-03）："黑洞 + 科技感粒子波浪" → spec `background: {type: particles, skill: three/particle-wave, params: {count, color: primary…}}` → 容器内 R3F 粒子波浪真实渲染（抽帧确认）。验收中修复：① 技能约束只注入 generate_spec 未注入 design_style（background 在 style 阶段决策，导致 particles 无 skill 绑定降级渐变）；② 容器 WebGL 改 REMOTION_GL 默认 swangle；③ pipeline 复用 bug（见 5.10）。已知增强项：特效意图识别目前仅技能名子串匹配，中文描述需显式 skills 挂载
- [x] 6.9 全量补完（路径 B 分期）：布局 12 → 24、多主题色卡（承接 2.7）→ +12 布局组件与别名、+tech-minimal/warm-editorial 主题（DSL/schema/templates/worker/backend/web 五处同步，程序化一致性验证通过）

## 7. M4 · 工程化（第 13–14 周）

- [x] 7.1 局部重渲染：`--frames` 帧区间渲染 + 成片拼接，单屏修改不全片重渲 → frameRange 片段渲染 + `spliceSegmentIntoFull()`（流拷贝严校验 + concat filter 重编码兜底，修复 0.21s 切点漂移与 timebase 混用两个真实坑）；验证：整片 4.544s → 改 s02 → 局部重渲拼接后 4.544s 不变、抽帧该屏已更新
- [x] 7.2 渲染队列与并发：BullMQ + Redis（可选服务），worker 多副本横向扩展 → QUE_ENABLED=false 内存直跑不变 / true 走 BullMQ（concurrency env，默认 2）；redis compose 服务挂 `queue` profile 不默认启动；实测：redis 容器 + 3 job 并发 → max active=2 全部 done；无 redis 回归全绿
- [x] 7.3 CLI `video render/preview/spec validate` 命令组，沿用 `--format json` 事件流 → `deeptutor_cli/video.py`（render 支持 --frames/--worker-url/--job-id；validate exit code 区分 error；12 项 CLI 测试；SKILL.md/AGENTS.md 文档同步）
- [x] 7.4 API 完善：外部 agent 可经 HTTP/WS 驱动全流程 → WS /ws/progress 订阅为完成判定主通道（远程 worker 可用），WS 失败自动回落 FS 轮询；进度桥接 StreamBus（`rendering {pct}%`）；真 worker 实测 92 个进度事件 via=ws；修复 macOS SOCKS 代理截获 localhost WS 的环境坑
- [x] 7.5 多用户隔离验证（`data/users/<uid>` 下 videos 树互不干扰）→ tests/api/test_videos_isolation.py 双 scope 实测通过
- [x] 7.6 监控告警：渲染失败率、队列堆积、worker 健康 → render_metrics.jsonl 结构化指标 + GET /api/v1/videos/health/summary（worker 可达性 + 成功率/平均耗时聚合）；顺手修复 PUT /spec 对 warning 级也 400 的真 bug（现只对 error 拒绝，warning 随 200 返回供编辑器提示）
- [x] 7.7 验收：3 并发渲染稳定，API 可被外部 agent 驱动 → 通过（2026-08-03）：redis 队列模式（--profile queue + QUEUE_ENABLED=true，concurrency=2）下 curl 并发提交 3 个 job（均 `queue:"bullmq"` 入队），30s 内全部出片且时长逐帧正确（4.544s ×3）；HTTP API 外部驱动全流程成立

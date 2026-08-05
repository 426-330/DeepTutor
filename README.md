# 视频生成系统（DeepTutor Fork）

Agent 驱动的可编程视频生成系统：**LLM 负责创作，代码负责保真**。模型不直接生成视频，而是生成一份强校验的 YAML 描述文件（spec），渲染层（Remotion）严格按 spec 逐帧执行。

> 本仓库是 [DeepTutor](https://github.com/HKUDS/DeepTutor) v1.5.6 的 fork（Apache 2.0），复用其 agent 编排、工具系统、exec 沙箱与模型供给层。上游原版说明见 [README.upstream.md](README.upstream.md)。

## 特性

- **一句话出片**：提示词 / 网页 URL / 图片 / 文档 → 多分镜、带配音字幕、风格一致的 mp4
- **YAML 唯一事实源**：颜色、字体、特效、分镜、口播、数据全部在同一份 YAML，封闭枚举 + JSON Schema 机器校验 + 语义复查，可复现、可微调、可局部重渲染
- **领域无关**：DSL 场景枚举是通用讲解结构（13 场景 × 24 布局 × 4 主题），领域差异以"领域包"（主题色卡 + 模板 + 技能包）插拔
- **技能可注入**：three.js 特效技能包（R3F 组件 + 参数 schema），提示词声明即可挂载渲染
- **即时预览**：前端 Remotion Player 直接执行 "YAML → IR"，改字改色秒级反馈，不触发渲染
- **局部重渲染**：改单屏只渲染该屏帧区间再拼接，不全片重渲

## 架构

```
Web UI / CLI / HTTP API
        ↓
ChatOrchestrator（DeepTutor 复用）
        ↓
video_pipeline ─→ video_spec ─→ asset_gen ─→ narration_gen ─→ video_compose
（端到端编排）   （spec 生成）  （素材）      （TTS+whisperX）  （渲染调度）
        ↓ 产物即契约，断点续跑
remotion-worker（Node）：YAML → ajv 校验 → IR → Scene/布局组件 → Chrome 逐帧 → ffmpeg → mp4
```

关键契约：

- `video_dsl/` — DSL 权威契约（`concept-video-dsl.md`）、JSON Schema（`schema/`）、场景模板与蓝图、色卡规范、特效技能包（`skills/`）
- `deeptutor/capabilities/video/` — 5 个 capability 与两层校验器
- `remotion-worker/` — 渲染服务（`POST /render` + WS 进度）
- `data/videos/` — spec YAML + 产物目录（assets/audio/renders）

## 快速开始

```bash
# 1. 起全栈（必须带 -f：仓库根 compose.yaml 是 Podman 变体，会抢占默认）
docker compose -f docker-compose.yml up -d

# 2. 配置 LLM provider：编辑 data/user/settings/model_catalog.json
#    services.llm 下加 profile（binding/api_key/models），TTS/imagegen 同理（可选）

# 3. 一句话出片
docker exec deeptutor python -m deeptutor_cli run video_pipeline \
  "做一期科普短视频：什么是复利？面向理财新手。" \
  --config skip_clarify=true --config preset=short-7
```

产物：`data/videos/<系列>_ep01/renders/*.mp4`。Web UI：<http://localhost:3782/videos>（项目列表、spec 编辑器、Player 预览、渲染管理）。

### 常用参数

| 参数 | 说明 |
|---|---|
| `preset` | 长度预设：`short-7` / `standard-10` / `full-13`（屏数） |
| `skills` | 特效技能：`["three/particle-wave"]`、`three/floating-shapes`、`three/grid-terrain` |
| `skip_clarify` | 跳过 ask_user 交互澄清（无人值守必加） |
| `start_from` | 断点续跑起始阶段（如 `video_compose`） |
| `allow_fetch_failure` | URL 抓取全部失败时仍继续生成（默认中止报错；仅 video_spec） |
| `clarify_timeout_s` | 澄清卡片等待秒数（默认 120；0/负数 = 不限时） |

### CLI

```bash
deeptutor video preview <spec.yaml>        # spec 摘要（屏数/时长/主题/校验状态）
deeptutor video spec validate <spec.yaml>  # 两层校验，error 级 exit 1
deeptutor video render <spec.yaml>         # 触发渲染（--frames 90:180 局部重渲染）
```

Provider 认证沿用上游 CLI：Provider auth (`openai-codex` OAuth login; `github-copilot` validates an existing Copilot auth session)（`deeptutor provider login <provider>`，详见 README.upstream.md）。

## 部署

| 服务 | 端口 | 说明 |
|---|---|---|
| `deeptutor` | 8001（API）/ 3782（Web） | FastAPI 编排 + Next.js 前端 |
| `remotion-worker` | 3100 | 渲染（headless Chrome + ffmpeg），可多副本 |
| `sandbox-runner` | 内部 8900 | exec 沙箱（whisperX 对齐、网页截图） |
| `redis`（可选） | — | BullMQ 渲染队列：`REMOTION_QUEUE_ENABLED=true docker compose -f docker-compose.yml --profile queue up -d` |

持久化只需挂载 `data/`；DSL 资产（`video_dsl/`）以只读卷挂载进容器，改 DSL 即时生效。

## 与上游 DeepTutor 的关系

- **fork 基线**：v1.5.6，只 cherry-pick 安全修复，不追 feature
- **裁剪（开关优先，可恢复）**：mastery_path capability、quiz/book/co_writer 路由与 CLI、GraphRAG 等重 RAG 引擎（`ENABLED_PROVIDERS={"llamaindex"}`）、Memory L2/L3 consolidator（`memory.consolidation.enabled=false`）均以注释/开关禁用，代码保留。逐项恢复方式见 `AGENTS.md`「Fork 裁剪现状」
- **保留**：`visualize` / `math_animator`（Manim 即兴可视化，与本系统并存：即兴片段 vs 制片级视频）

## 开发

```bash
# 后端测试（需 dev + partners 依赖）
pip install -e '.[dev]' && pip install -r requirements/partners.txt
pytest -q

# 前端
cd web && npm install && npm run build && npm run test:node

# 渲染 worker
cd remotion-worker && npm install && npm run build && npm run verify
```

变更管理用 [OpenSpec](https://github.com/Fission-AI/OpenSpec)：`openspec/changes/video-generation-system/` 含本系统的 proposal/design/specs/tasks 全套契约。

## 许可

- 本仓库代码：Apache 2.0（继承 DeepTutor）
- **Remotion Company License**：≤3 人团队免费，第 4 人起按 seat 付费——扩张前请复核 [remotion.dev/docs/license](https://www.remotion.dev/docs/license)
- 字体：Noto Sans SC（OFL），随镜像分发无版权问题

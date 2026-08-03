# remotion-worker

DeepTutor 通用可编程视频生成系统的独立渲染层（openspec change: `video-generation-system`，设计 D4/D5）。
FastAPI 通过 HTTP 提交渲染任务，本服务完成 **YAML spec → ajv 校验 → 规范化 TS IR → Remotion 组件渲染** → headless Chrome 逐帧 → ffmpeg 出 mp4，并通过 WebSocket 回传进度/告警/错误事件。

**M3 状态**：parser（4.3/4.6）+ 组件库（4.4）+ 配音/字幕/BGM（5.2）+ DSL 全量（5.11/6.9：13 场景 / 24 布局 / 4 主题 / §13 全量复查）+ three.js 技能体系（6.2/6.5：particles 背景真实 R3F 渲染）已接入。`POST /render` 带 `yaml_path` 时走真实流水线；不带时保留 M0 HelloWorld fallback composition。

## 本地开发

```bash
cd remotion-worker
npm install
npm run dev          # tsx watch，端口 3100（PORT 环境变量可覆盖）
```

首次渲染前确保 headless Chrome 就绪（Remotion 4 自带下载）：

```bash
npx remotion browser ensure
```

其他脚本：

```bash
npm run build          # tsc → dist/
npm start              # node dist/server.js
npm run render-sample  # 不走 HTTP，直接渲染 HelloWorld 到 <repo>/data/videos/renders/sample.mp4
npm run verify         # 端到端验证：parser 断言 + 真实渲染 + ffprobe 时长检查（见下）
npx tsx scripts/smoke-http.ts   # HTTP + WS 冒烟（自起临时 server，端口 3199）
```

`verify` 覆盖：正样本样式链/别名/默认值断言 → 渲染 + ffprobe 时长 = Σ 各屏时长；负样本（裸 hex / 未知 type）结构化拒绝；降级样本（pie 图 / particles 背景）告警 + 占位帧但渲染完成；假 `s01.align.json` 验证时长覆盖生效。`VERIFY_SKIP_RENDER=1` 时只跑 parser 断言。

## API

### `GET /health`

```bash
curl http://localhost:3100/health
# {"status":"ok"}
```

### `POST /render`

```bash
curl -X POST http://localhost:3100/render \
  -H 'Content-Type: application/json' \
  -d '{"job_id": "demo-1", "yaml_path": "data/videos/quant_ep01.yaml"}'
# 202 {"job_id":"demo-1","status":"accepted","total_frames":135,"fps":30,"warnings":[...]}
# 400 {"error":"spec validation failed","details":[{"path":"/scenes/0/type","message":"...","layer":"schema"}]}
```

- `job_id`（必填）：任务 ID，输出为 `<RENDER_OUT_DIR>/<job_id>.mp4`。重复 ID 返回 409。
- `yaml_path`（可选）：相对路径锚定仓库根。提供时先经 parser（js-yaml → ajv，schema 单一来源 `video_dsl/schema/concept-video.schema.json`）+ DSL §13 语义复查；校验失败返回 400 结构化错误（`path` + `message` + `layer`），并经 WS 推 error 事件，不产生渲染产物。省略时渲染 M0 HelloWorld fallback。
- `bgm_path`（可选，M2）：覆盖产物目录 `bgm/` 约定的 BGM 文件；文件不存在返回 400。
- `bgm_volume`（可选，M2，0–1，默认 0.15）：BGM 垫底音量（配音恒为 1.0，无 ducking）。
- `frames`（可选，tasks 7.1）：`{start, end}` 闭区间帧范围 → 局部重渲染。只渲染该区间为片段；若 `renders/<job_id>.mp4` 整片已存在，用 ffmpeg 将片段替换进对应区间（**无损流拷贝优先，切点不精确自动重编码兜底**，音轨随片段对齐），否则降级为只出片段并 WS 推 `partial-no-full` warning。响应与 done 事件带 `partial: true` / `frames` / `splice`。已完成/失败任务的 job_id 允许带 `frames` 重提交；进行中任务一律 409。
- 输出目录默认 `<仓库根>/data/videos/renders`，可用 `RENDER_OUT_DIR` 覆盖。

### 渲染队列（tasks 7.2，可选）

默认内存路径：`POST /render` 后立即渲染（现状不变）。设 `QUEUE_ENABLED=true`（配合 `REDIS_URL`，默认 `redis://localhost:6379`；`QUEUE_CONCURRENCY` 默认 2）后切换为 BullMQ：POST 入队（202 带 `queue: "bullmq"`），进程内 Worker 按并发消费；job 状态/进度写入 BullMQ Job 并镜像到内存表与 WS 事件。redis 不可达时回退立即渲染并推 `queue-unavailable` warning。compose 侧用 `docker compose --profile queue up`（redis 服务不默认启动）。

实测脚本：`scripts/smoke-queue.ts`（3 并发 job、concurrency=2、状态断言；需一次性 redis 容器）。

### 音频约定（M2，task 5.2）

schema 不含音频字段（单一来源不可扩展），音频按产物目录约定拾取（D10）：

```
<yaml同名目录>/audio/s<NN>.wav        # 每屏配音（缺失 = 该屏静默）
<yaml同名目录>/audio/s<NN>.align.json # 时长覆盖 + 字幕 cues（4.6 已接入）
<yaml同名目录>/bgm/<任意音频文件>      # 全片 BGM（缺失 = 无 BGM）
```

- 配音以 `<Audio>` 嵌入各屏 Sequence，按屏 startFrame/durationFrames 定位，超长截断；
- BGM 全片 `loop` 循环垫底，固定音量比（配音 1.0 / BGM 0.15，可用 `bgm_volume` 调）；
- 字幕区按当前帧精确匹配 cue（帧区间来自 align.json），无 align 时回落 narration 整句；
- 产物目录音频在渲染时经本地临时静态服务（`src/asset-server.ts`，127.0.0.1 + 随机端口 + token 寻址）喂给 headless Chrome——`file://` 会被 Chrome 的 URL 安全检查拒绝。

### WebSocket `/ws/progress`（同端口）

渲染过程中广播 JSON 事件（当前为全量广播，不按 job 过滤）：

```json
{"job_id":"demo-1","type":"warning","code":"chart-type-unsupported","scene":"s03","message":"..."}
{"job_id":"demo-1","status":"rendering","progress":0.42}
{"job_id":"demo-1","status":"done","progress":1,"output":"/abs/path/renders/demo-1.mp4"}
{"job_id":"demo-1","status":"error","progress":0.3,"error":"..."}
```

warning 事件 = 渲染白名单降级（未知标识 → 占位帧、particles → 渐变、图表数据缺失等），不中断渲染。

## 结构

```
src/parser/            YAML → IR（tasks 4.3/4.6）
  index.ts             管线编排：YAML → 别名预归一 → ajv → §13 → IR 构建
  validate.ts          ajv draft 2020-12，加载 video_dsl/schema/concept-video.schema.json
  templates.ts         layout_aliases（video_dsl/concept-video-scene-templates.yaml）
  styleChain.ts        样式链：内建主题 → style.theme → style.colors → 分镜覆盖（纯函数）
  themes.ts            内建主题 hex 表（量化色卡规范.md §2）
  align.ts             audio/s<NN>.align.json 时长覆盖 + 字幕 cues（D6，不回写 YAML）
  audio.ts             配音/BGM 按产物目录约定发现（audio/s<NN>.wav、bgm/）
  chartData.ts         chart.data 外链 CSV/JSON 内联进 IR
  types.ts             IR / 枚举 / 结果类型（无 fs 依赖，浏览器包可引）
src/asset-server.ts    渲染期本地静态服务：file:// 音频 → http://127.0.0.1（token 寻址）
src/skills/            特效技能管线（task 6.5）：generate.ts 扫描 video_dsl/skills/
                       → builtin/ 拷贝 + registry.gen.ts 静态注册（构建期生成，
                       bundle 前自动重跑）；renderer.tsx 为 R3F 实现（@remotion/three），
                       经 SkillHost 注入；params 颜色 token → hex 在此解析
src/components/        ThemeProvider、SceneFrame（标题条+字幕区+风险条位）、
                       Background（gradient/none/particles→SkillHost）、SkillHost
                       （three-free 技能挂载点，web 预览降级为空）、
                       Chart（手绘 SVG）、FormulaBlock（KaTeX+Math.js）、
                       PlaceholderFrame、VisualCard、animations（入场/转场）
src/layouts/           24 布局组件 + registry（DSL §12.2）
src/scenes/            13 场景组件 + registry（DSL §12.1）+ SceneShell
src/remotion/          Root（HelloWorld + ConceptVideo）、ConceptVideo composition
src/server.ts          Express + WS；parser 接线，frames 局部重渲（partial 拼接），
                       队列双路径（内存直跑 / BullMQ）
src/queue.ts           BullMQ 队列驱动（tasks 7.2）：QUEUE_ENABLED 开关、并发消费、
                       redis 不可达回退
src/partial.ts         局部重渲染拼接（tasks 7.1）：流拷贝优先 → concat filter 重编码兜底
src/render.ts          bundle() + renderMedia() 封装，frameRange 局部渲染，bundle 进程内缓存
scripts/verify.ts      CI 复用的端到端验证（一致性/§13/渲染/ffprobe 音轨/技能/局部重渲）
scripts/verify-partial.ts 局部重渲染场景快速复跑（迭代拼接逻辑用）
scripts/smoke-http.ts  HTTP + WS 冒烟（含 frames 局部重渲与无整片降级）
scripts/smoke-queue.ts BullMQ 队列冒烟（需一次性 redis 容器，见文件头注释）
scripts/still.ts       单帧渲染调试
examples/              正/负/降级/别名/音频/全量(full13)/技能(skills) 样本 + 配套资产
../video_dsl/skills/   特效技能包（SKILL.md + component.tsx(R3F) + defaults.json），
                       当前内装 three/particle-wave、three/floating-shapes、three/grid-terrain
```

## 已知缺口（M4 前）

- 局部重渲染要求 frames 区间对应时长不变的屏（跨屏/变时长区间只给 misaligned warning，不防呆）；兜底重编码路径下 head/tail 画面有轻微再编码损耗（crf 18）。
- 转场为"入场侧单播"实现（无叠化 crossfade），保证 totalFrames = Σ 各屏时长；后续可换 `@remotion/transitions`。
- 字幕无逐词高亮（当前按 cue 整句切换）；无 BGM ducking（固定音量比），音量仅经 `bgm_volume` 任务参数配置。
- 配音 wav 长于屏时长时直接截断；不做变速对齐。
- 图表为手绘 SVG 简实现（line/bar/area）；pie/scatter/histogram/heatmap 降级占位；`countUp` 动效未实现。
- R3F 技能在 SwiftShader 下偶发 "WebGL Context Lost" 告警（渲染可恢复，成片正确）；技能 preview.png 为占位。
- 队列：任务表仍为进程内存 `Map`（BullMQ 只承载排队/并发，不持久化业务任务表，重启即丢；后续换 SQLite）；多副本部署时 WS 广播为本进程内（无跨副本事件总线）。
- 无鉴权、无按 job 的 WS 订阅过滤。
- `yaml_hash` 字段仅为占位。

## Docker

```bash
docker build -t remotion-worker remotion-worker/
docker run -p 3100:3100 -v "$PWD/data/videos/renders:/app/renders" remotion-worker
```

docker-compose 集成（后续合入仓库根 `docker-compose.yml` 时的参考片段）：

```yaml
services:
  remotion-worker:
    build: ./remotion-worker
    ports: ["3100:3100"]
    volumes:
      - ./data/videos/renders:/app/renders
    environment:
      RENDER_OUT_DIR: /app/renders
```

FastAPI 侧用内部网络地址提交任务，如 `http://remotion-worker:3100/render`。

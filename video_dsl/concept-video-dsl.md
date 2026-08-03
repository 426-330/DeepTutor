# Concept Video DSL 标准（v3.1）

> 版本：3.1（v3.0 核心 + v3.1 style 扩展，单一权威契约）
> 状态：权威契约 —— 所有视频描述文件（YAML）以本文档与 §10 JSON Schema 为准
> 机器可读 schema：`video_dsl/schema/concept-video.schema.json`（JSON Schema draft 2020-12）
> 当前规模：13 场景类型（§4）× 24 布局（§12.2）× 4 内建主题（《量化色卡规范.md》）——向后兼容的纯增量扩展，version 仍为 "3.1"

---

## 1. 总述

Concept Video DSL 是"分镜 + 口播"型视频的描述文件标准。三条根本原则：

- **YAML 为唯一事实源**：颜色、字体、特效、分镜、口播、数据全部写在同一份 YAML 里（`data/videos/<series_slug>_ep<NN>.yaml`）。LLM 负责创作（产出 YAML），渲染层（Remotion）负责保真（严格按 spec 逐帧渲染），模型不直接生成视频。
- **封闭枚举即可控性**：场景类型、布局、颜色 token、转场/动效全部为封闭枚举，外加字数限制。LLM 的自由度被约束在枚举与槽位之内；每支视频 = `video_blueprint` 骨架复制 + 槽位填充，不做自由编排。
- **领域无关**：核心 schema、parser、Scene/布局组件、渲染管线不含任何领域假设。**领域包 = 主题色卡 + 场景模板/蓝图 + 领域技能包**，可插拔；量化科普是首个领域包。spec 未声明领域包（`style.theme`）时，以内建 `default` 主题兜底。

校验分两层：① §10 JSON Schema 机器校验（结构、枚举、字数）；② §13 语义复查清单（跨字段规则）。生成与校验解耦：LLM 写 YAML，机器做校验，不通过则带错误回炉。

---

## 2. 文件骨架

```yaml
version: "3.1"        # 必填，枚举 "3.0" | "3.1"（v3.0 文件无 style 块，全部取默认）
series: 量化科普       # 必填，系列名
episode: 3            # 必填，整数 ≥1
fps: 30               # 可选，枚举 24 | 25 | 30 | 60，默认 30

style: { ... }        # 可选，v3.1 设计层，见 §5

opening:              # 可选，片头信息（视频元数据，非分镜）
  title: "最大回撤是什么？"               # ≤14 字
  subtitle: "为什么同样赚30%体验天差地别"  # ≤20 字

scenes:               # 必填，至少 1 屏；每屏 = PageModel 六字段 + 类型专有 content_slots
  - type: problem_hook
    layout: split
    ...
```

文件规范：UTF-8，2 空格缩进，禁 Tab。`scenes` 顺序即播放顺序。

---

## 3. PageModel（六字段，每屏必填）

每个 `scenes[]` 元素必须包含以下六个字段，制度上保证"一页一个核心结论"：

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `title` | string | 必填 | 本屏标题，显示于标题条 |
| `question` | string | 必填 | 本屏回答的问题（导引视角） |
| `core_message` | string | 必填，≤120 字 | 本屏唯一核心结论 |
| `narration` | object | 必填 | 三段式口播稿：`opening` / `explanation` / `conclusion` 三个子字段均为 string 且必填；直接拼接作为 TTS 输入 |
| `visual` | object | 必填 | 视觉指令：`primary`（主视觉，必填）、`secondary`（辅助视觉，可选）、`emphasis`（强调点，可选） |
| `transition` | object | 必填 | 转场语义：`next_question`（引向下一屏的问题，可选但建议填写） |

PageModel 之外，每屏还有：`type`（场景类型枚举）、`layout`（布局标识）、`duration_frames`（可选，整数 ≥1，默认 90，见 §11）、`style`（可选，分镜级样式覆盖，见 §5）、以及该 `type` 专有的 content_slots（见 §4）。

---

## 4. 场景类型枚举（13 个场景）与 content_slots

`type` 为封闭枚举，取以下 13 值之一。每个类型的专有槽位（content_slots）均为该类型可选字段，但渲染组件按槽位取内容，建议按用途填满。

### 4.1 `opening` — 开场

用途：建立主题与观看预期，抓住注意力。

| 槽位 | 类型 | 说明 |
|---|---|---|
| `hook_line` | string | 开场钩子句（一句话说清"为什么要看"） |
| `key_visual` | string | 主视觉描述（供素材生成/插画引用） |
| `agenda` | string[] | 本集要点预告（可选，≤4 条） |

### 4.2 `problem_hook` — 问题钩子

用途：呈现反常识现象，制造认知冲突，许下解答承诺。

| 槽位 | 类型 | 说明 |
|---|---|---|
| `phenomenon` | string | 反常识/有冲突的现象描述 |
| `counter_question` | string | 反问：把观众的惯性答案掀掉 |
| `promise` | string | 本集承诺（"这期讲清 X"） |

### 4.3 `concept` — 概念讲解

用途：定义核心概念，配类比与要点拆解。

| 槽位 | 类型 | 说明 |
|---|---|---|
| `definition` | string | 概念的一句话定义 |
| `analogy` | string | 类比（用已知解释未知） |
| `key_points` | string[] | 要点拆解（≤4 条） |
| `misconception` | string | 常见误解澄清（可选） |

### 4.4 `formula` — 公式推导

用途：展示公式、解释变量、用数值算例落地。

| 槽位 | 类型 | 说明 |
|---|---|---|
| `formula` | string | KaTeX 语法的公式字符串 |
| `variables` | object[] | 变量表：`{symbol, meaning}` 列表 |
| `numeric_example` | string | **必填（§13 强制）**：代入真实数字的算例 |
| `derivation` | string | 推导直觉（可选，一句话） |

### 4.5 `chart` — 图表呈现

用途：用数据图表说话，给出读图结论。

| 槽位 | 类型 | 说明 |
|---|---|---|
| `chart_type` | enum | `line` / `bar` / `pie` / `scatter` / `area` / `histogram` / `heatmap` |
| `data` | string | 数据文件路径，相对该视频产物目录的 `data/` 解析 |
| `axes` | object | 轴说明：`{x, y}`（可选） |
| `insight` | string | 读图结论（这张图说明了什么） |

### 4.6 `conclusion` — 结论收束

用途：把全片收敛为可带走的结论卡。

| 槽位 | 类型 | 说明 |
|---|---|---|
| `key_cards` | string[] | **恰好 3 张（§13 强制）**要点卡 |
| `takeaway` | string | 一句话带走（全片总结论） |
| `call_to_action` | string | 行动号召（可选） |

### 4.7 `summary` — 总结回顾

用途：复盘全片要点，衔接系列下一集。

| 槽位 | 类型 | 说明 |
|---|---|---|
| `recap_points` | string[] | 回顾要点（≤5 条） |
| `next_episode` | string | 下集预告（可选） |
| `series_cta` | string | 系列关注引导（可选） |

### 4.8 `data_comparison` — 数据对比

用途：并排呈现多组关键数字，用对比制造记忆点（与 chart 互补：chart 看趋势，data_comparison 看数值并置）。

| 槽位 | 类型 | 说明 |
|---|---|---|
| `metrics` | object[] | 指标列表（**§13 要求 ≥2 条**）：`{label, value, unit?, note?}`，value 为展示字符串 |
| `insight` | string | 对比结论（这组数字说明什么） |

### 4.9 `timeline` — 时间线演进

用途：按时间/步骤顺序呈现演进过程。

| 槽位 | 类型 | 说明 |
|---|---|---|
| `events` | object[] | 节点列表（**§13 要求 ≥2 个**）：`{label, detail?}` |
| `insight` | string | 演进结论（可选） |

### 4.10 `quote` — 金句引用

用途：引用名言/金句/关键论断，情绪点与记忆点。

| 槽位 | 类型 | 说明 |
|---|---|---|
| `quote_text` | string | 金句正文（**§13 必填**） |
| `attribution` | string | 出处/作者（可选） |
| `context` | string | 引用背景补充（可选） |

### 4.11 `big_number` — 大数字冲击

用途：用一个关键数字制造冲击，聚焦单一事实。

| 槽位 | 类型 | 说明 |
|---|---|---|
| `number` | string | 大数字正文（**§13 必填**，展示字符串，如 "25%" / "3.2 倍"） |
| `unit` | string | 单位/量纲说明（可选） |
| `context` | string | 这个数字意味着什么 |
| `comparison` | string | 参照系（"相当于……"，可选） |

### 4.12 `case_study` — 案例拆解

用途：用一个具体案例走完整"背景→过程→结果→启示"链路。

| 槽位 | 类型 | 说明 |
|---|---|---|
| `case_title` | string | 案例名称 |
| `case_background` | string | 案例背景 |
| `process` | string[] | 过程步骤（≤4 步） |
| `result` | string | 结果（**§13 必填**——案例必须有落点） |
| `lesson` | string | 启示（可选） |

### 4.13 `recap` — 阶段回顾

用途：片中阶段性收束（与片尾 summary 区分：recap 承上启下，summary 收官）。

| 槽位 | 类型 | 说明 |
|---|---|---|
| `points` | string[] | 回顾要点（**§13 要求 ≥2 条**，≤6 条） |
| `bridge` | string | 承上启下过渡句（可选） |

---

## 5. v3.1 style 扩展（设计层入 YAML）

v3.1 在顶层与分镜级各增加一个可选 `style` 块，把颜色/字体/特效写进同一份 YAML。两层 `style` 结构相同，均含五个可选字段：

| 字段 | 说明 |
|---|---|
| `theme` | 内建主题标识（见《量化色卡规范.md》，当前内建 `default` / `quant-traditional`） |
| `preset` | 风格预设标识（影响留白/圆角/动效强度，由主题包提供） |
| `colors` | 颜色覆盖，**仅允许 7 个颜色 token 键**（`primary`/`secondary`/`accent`/`success`/`warning`/`danger`/`neutral`）。**顶层**：值为 hex（`#RRGGBB`），重定义 token 的值——这是 hex 在全文件中唯一合法出现处；**分镜级**：值为 token 名，做 token→token 重映射（如 `colors: { primary: danger }`），**禁裸 hex** |
| `fonts` | `title` / `body` / `number` 三个槽位，各为 `{family, weight}`；`family` 走字体白名单（见 §10 schema），`weight` 为 100–900 整数 |
| `effects` | 特效默认值：`transition {type, frames}`（type 枚举 `fade`/`wipe-left`/`slide`/`zoom`/`none`）、`entrance`（元素默认入场）、`chart_motion`（图表动效）、`background {type, skill?, params?}`（type 枚举 `none`/`gradient`/`particles`；`particles` 时允许 `skill` 引用已安装特效技能 + `params` 传参，params 中颜色参数同样只许 token） |

样式链合并顺序（低 → 高优先级）：

```
内建主题（色卡规范） → style.theme → style.colors（顶层 hex 重定义）
  → 分镜 style.colors（token 重映射）→ 组件最终取色
字体：style.fonts（全局） → 分镜 style.fonts → 组件 typography 默认兜底
特效：style.effects（全局） → 分镜 style.effects → 元素 animation 默认兜底
```

**向后兼容**：v3.0 文件无 `style` 块 → 全部取内建 `default` 主题与组件默认值，渲染行为与 v3.0 一致。

---

## 7. 长度预设（video_blueprint）

三套长度预设，定义在 `video_dsl/concept-video-scene-templates.yaml` 的 `video_blueprint` 节点。每支视频 = 选定一套蓝图复制骨架 + 填充 PageModel 与 content_slots：

| 预设 | 屏数 | 场景序列 |
|---|---|---|
| `short-7` | 7 | opening → problem_hook → concept → formula → chart → conclusion → summary |
| `standard-10` | 10 | opening → problem_hook → concept → big_number → formula → chart → data_comparison → case_study → conclusion → summary |
| `full-13` | 13 | opening → problem_hook → concept → timeline → formula → chart → big_number → data_comparison → case_study → quote → recap → conclusion → summary |

蓝图同时给出每屏建议 `layout`（见模板文件）；建议而非强制，但偏离建议应有意图。

---

## 10. JSON Schema（机器校验层）

权威机器可读 schema 独立存放：**`video_dsl/schema/concept-video.schema.json`**（JSON Schema draft 2020-12）。三端共享这一份来源：remotion-worker 与前端 Player 用 ajv，Python backend 用 jsonschema，禁止各端自维护副本。

schema 覆盖的约束（与本文档一一对应）：

- 顶层必填 `version`/`series`/`episode`/`scenes`，`version` 枚举 `"3.0"`/`"3.1"`，`fps` 枚举 24/25/30/60（默认 30）；
- `opening.title` ≤14 字、`opening.subtitle` ≤20 字；
- 场景 `type` 封闭 13 枚举（§4），`layout` 封闭 24 枚举（layout_library，见模板文件）；
- PageModel 六字段每屏必填，`core_message` ≤120 字，`narration` 三子段必填；
- `duration_frames` 整数 ≥1，默认 90（可覆盖，见 §11）；
- v3.1 `style` 块：五字段全可选；`colors` 仅允许 7 个 token 键，顶层值为 hex 格式（`^#[0-9A-Fa-f]{6}$`）、分镜级值为 token 枚举；`fonts.family` 走字体白名单；`effects.transition.type` 枚举 `fade`/`wipe-left`/`slide`/`zoom`/`none`；`background.type` 枚举 `none`/`gradient`/`particles`，`particles` 时允许 `skill` + `params`。

schema 未覆盖的跨字段规则（如 formula 必配 numeric_example）属于 §13 语义复查层，不进 schema。

---

## 11. IR 规范（YAML → IR 规范化规则）

parser 将 YAML 规范化为渲染 IR（TypeScript 对象，remotion-worker 与前端 Player 共享同一实现）。规范化规则：

1. **默认值注入**：
   - `fps` 缺省 → 30；
   - 每屏 `duration_frames` 缺省 → 90；
   - 顶层无 `style`（v3.0 文件）→ 注入 `default` 主题与组件默认字体/特效。
2. **布局别名解析**：`layout` 先经模板文件 `layout_aliases` 表归一化为规范布局 id（如 `split-screen` → `split`），未知 id 渲染降级为占位帧并告警（渲染白名单纪律）。
3. **样式链合并**：按 §5 顺序合并为 StyleChain，随 IR 经 theme provider 注入组件树——组件代码零改动。
4. **`.align.json` 时长覆盖**：渲染 IR 注入期读取 `audio/s<NN>.align.json`（narration_gen 产出的真实音频时长 + 词级 cues），覆盖该屏 `duration_frames`。**只覆盖 IR，不回写 YAML**——YAML 保持纯创作层，重配音不污染事实源。

---

## 12. 渲染映射表（供 remotion-worker 实现）

组件命名 PascalCase。外层统一包裹 `SceneFrame`（标题条 + 字幕轨 + 风险条）。

### 12.1 场景 type → Scene 组件

| DSL `type` | Scene 组件 |
|---|---|
| `opening` | `OpeningScene` |
| `problem_hook` | `ProblemHookScene` |
| `concept` | `ConceptScene` |
| `formula` | `FormulaScene` |
| `chart` | `ChartScene` |
| `conclusion` | `ConclusionScene` |
| `summary` | `SummaryScene` |
| `data_comparison` | `DataComparisonScene` |
| `timeline` | `TimelineScene` |
| `quote` | `QuoteScene` |
| `big_number` | `BigNumberScene` |
| `case_study` | `CaseStudyScene` |
| `recap` | `RecapScene` |

### 12.2 layout → 布局组件（`src/layouts/`）

| DSL `layout` | 布局组件 | 布局别名（IR 解析） |
|---|---|---|
| `full-hero` | `FullHeroLayout` | `hero`, `fullscreen` |
| `split` | `SplitLayout` | `split-screen`, `left-right` |
| `centered-text` | `CenteredTextLayout` | `center`, `centered` |
| `formula-focus` | `FormulaFocusLayout` | `formula` |
| `chart-full` | `ChartFullLayout` | `chart`, `full-chart` |
| `chart-side` | `ChartSideLayout` | `chart-caption` |
| `card-grid-3` | `CardGrid3Layout` | `three-cards`, `cards` |
| `card-list` | `CardListLayout` | `list`, `bullet-list` |
| `compare-2` | `Compare2Layout` | `compare`, `versus` |
| `timeline` | `TimelineLayout` | `steps` |
| `quote-emphasis` | `QuoteEmphasisLayout` | `quote`, `golden-sentence` |
| `title-closing` | `TitleClosingLayout` | `closing`, `end-card` |
| `full-bleed` | `FullBleedLayout` | `bleed` |
| `sidebar-left` | `SidebarLeftLayout` | `sidebar` |
| `split-40-60` | `Split4060Layout` | `asymmetric-split` |
| `stacked` | `StackedLayout` | `stack` |
| `quote-center` | `QuoteCenterLayout` | `centered-quote` |
| `timeline-horizontal` | `TimelineHorizontalLayout` | `timeline-h` |
| `comparison-2col` | `Comparison2colLayout` | `two-col` |
| `image-focus` | `ImageFocusLayout` | `image` |
| `text-focus` | `TextFocusLayout` | `text` |
| `grid-3x2` | `Grid3x2Layout` | `grid-6` |
| `overlay-caption` | `OverlayCaptionLayout` | `caption` |
| `number-spotlight` | `NumberSpotlightLayout` | `big-number` |

未注册的 type/layout/特效标识：渲染白名单降级为占位帧 + 告警，不中断整片渲染。

---

## 13. 语义复查清单

schema 通过后，按本清单做语义复查。error 级任一不通过即带错误回炉；warning 级不阻断渲染，worker 经 WS 推 warning 事件、backend 记入复查结果。

**error 级：**

1. **formula 场景必配 `numeric_example`**——公式必须落到一个代入真实数字的算例；
2. **conclusion 场景 `key_cards` 恰好 3 张**——不多不少；
3. **每屏 `core_message` ≤120 字**——一页一结论（schema 已查，复查兜底）；
4. **`opening.title` ≤14 字**——片头标题上限（schema 已查，复查兜底）；
5. **每屏 `narration.explanation` 非空**——主口播段不可缺（opening/conclusion 段允许为空）；
6. **每屏 `visual.primary` 非空**——主视觉指令不可缺（schema 只保证字段存在）；
7. **chart 场景必配 `data` 外链**——数据文件路径不可缺（无数据不成图）；
8. **新场景必填槽位**：`big_number` 必配 `number`；`quote` 必配 `quote_text`；`data_comparison` 的 `metrics` ≥2 条；`timeline` 的 `events` ≥2 个；`case_study` 必配 `result`；`recap` 的 `points` ≥2 条。

**warning 级：**

9. **非末屏建议填写 `transition.next_question`**——缺失时提醒（不阻断）；
10. **`transition.next_question` 与下一屏 `question` 呼应**——两者完全无重合（无公共连续 2 字以上子串）时提醒，防跳转断裂（启发式，仅供回炉参考）。

---

## 14. v3.1 扩展说明与向后兼容

相对 v3.0 的全部变更：

| 扩展点 | 内容 |
|---|---|
| 顶层 `style` 块 | theme / preset / colors / fonts / effects 五字段，全部可选 |
| 分镜级 `style` | 场景内同结构子集，合并优先级高于全局 |
| §10 schema 增补 | `colors` 仅 7 token 键且顶层值为 hex、分镜级值为 token；`fonts.family` 白名单；`effects.transition.type` 与 `background.type` 枚举 |
| §11 parser | IR 增加 StyleChain；§12 渲染映射不变（样式经 theme provider 注入，组件零改动） |
| 向后兼容 | v3.0 文件无 `style` → 全部取内建 `default` 主题默认值，行为不变 |

颜色纪律（v3.1 唯一开口）：hex 只允许出现在**顶层** `style.colors` 重定义 token 值；场景内（含分镜 `style.colors`、特效 `params`、素材引用）一律只能引用 token。详见《量化色卡规范.md》。

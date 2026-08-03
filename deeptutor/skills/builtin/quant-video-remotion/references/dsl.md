# DSL 要点摘要（权威：video_dsl/concept-video-dsl.md）

> 本文件仅为生成时的速查摘要；字段定义、约束与示例一律以
> `video_dsl/concept-video-dsl.md`（v3.1）与 `video_dsl/schema/concept-video.schema.json` 为准。

## 文件骨架

```yaml
version: "3.1"          # 枚举 "3.0"|"3.1"
series: 量化科普
episode: 3
fps: 30                 # 枚举 24/25/30/60，默认 30
style:                  # 可选：theme/preset/colors/fonts/effects 五字段
  theme: quant-traditional   # 4 个内建主题之一（见 references/colors.md）
opening:
  title: "…"            # ≤14 字
  subtitle: "…"         # ≤20 字
scenes: []              # ≥1 屏
```

## 每屏结构

- `type`：13 枚举 —— opening / problem_hook / concept / formula / chart / conclusion / summary /
  data_comparison / timeline / quote / big_number / case_study / recap
- `layout`：24 枚举（见 layouts.md）
- `duration_frames`：整数 ≥1，默认 90；渲染期被 `.align.json` 真实时长覆盖（不回写 YAML）
- PageModel 六字段必填：title / question / core_message(≤120字) /
  narration{opening,explanation,conclusion} / visual{primary,secondary,emphasis} /
  transition{next_question}

## 类型专有 content_slots（速查）

| type | 槽位 |
|---|---|
| opening | hook_line, key_visual, agenda(≤4) |
| problem_hook | phenomenon, counter_question, promise |
| concept | definition, analogy, key_points(≤4), misconception |
| formula | formula(KaTeX), variables[{symbol,meaning}], numeric_example(必填), derivation |
| chart | chart_type(line/bar/pie/scatter/area/histogram/heatmap), data, axes{x,y}, insight |
| conclusion | key_cards(恰好 3), takeaway, call_to_action |
| summary | recap_points(≤5), next_episode, series_cta |
| data_comparison | metrics[{label,value,unit?,note?}](≥2 条), insight |
| timeline | events[{label,detail?}](≥2 个), insight |
| quote | quote_text(必填), attribution, context |
| big_number | number(必填), unit, context, comparison |
| case_study | case_title, case_background, process(≤4), result(必填), lesson |
| recap | points(≥2 且 ≤6), bridge |

## 两层校验

1. JSON Schema（`video_dsl/schema/concept-video.schema.json`，draft 2020-12）：结构/枚举/字数；
2. 语义清单（DSL §13）：formula 必配 numeric_example、conclusion 恰好 3 卡、
   core_message ≤120 字、opening.title ≤14 字（其余条款以 DSL §13 权威清单为准）。

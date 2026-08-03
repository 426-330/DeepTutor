---
name: quant-video-remotion
description: 量化科普视频（Remotion 制片级）领域技能包。当用户要求制作量化/金融科普讲解视频、
  生成多分镜带配音字幕的 Concept Video、或编辑 data/videos/ 下的视频描述文件（YAML）时使用。
  提供 DSL 契约、场景模板与布局库、量化色卡三套权威参考。
tags:
- video
- domain
always: true
---

# 量化科普视频 · Remotion 领域技能包

本技能包是视频生成系统的**首个领域包**（领域包 = 主题色卡 + 场景模板 + 技能包）。
系统核心领域无关；本包只提供量化科普领域的主题、模板与生成护栏。

## 适用场景

- 用户要求"做一期量化科普视频 / 讲一个金融概念（回撤、夏普、波动率……）"；
- 生成或修改 Concept Video 描述文件（`data/videos/<series_slug>_ep<NN>.yaml`）；
- 为视频选择主题（`style.theme: quant-traditional`）、布局、图表类型或特效。

不适用：对话中的即兴图解/数学动画（走 `visualize` / `math_animator`）；自由编排的视频剪辑。

## DSL 契约摘要

- **YAML 是唯一事实源**：颜色/字体/特效/分镜/口播/数据同文件，UTF-8、2 空格缩进；
- **封闭枚举**：13 场景类型（opening/problem_hook/concept/formula/chart/conclusion/summary/
  data_comparison/timeline/quote/big_number/case_study/recap）、24 布局、7 颜色 token、
  4 个内建主题（default/quant-traditional/tech-minimal/warm-editorial）、fps 枚举 24/25/30/60；
- **每屏 PageModel 六字段必填**：title/question/core_message(≤120字)/narration{opening,explanation,conclusion}/visual{primary,secondary,emphasis}/transition{next_question}；
- **每支视频 = 蓝图骨架复制 + 槽位填充**：按 7/10/13 屏 video_blueprint 复制，LLM 只填
  PageModel + 类型专有 content_slots + style，不做自由编排；
- **颜色纪律**：场景内禁裸 hex，只能引用 7 个 token；hex 唯一合法出现处是顶层
  `style.colors`（重定义 token 值）；分镜 `style.colors` 只做 token→token 重映射；
- **生成后必校验**：先过 JSON Schema（`video_dsl/schema/concept-video.schema.json`），
  再过语义清单（formula 必配 numeric_example、conclusion 恰好 3 张 key_cards 等），
  不通过带错误回炉。

## References（权威文件指引）

生成/校验 YAML 前，按需精读以下参考（精简摘要见本包 references/ 目录）：

- `references/dsl.md` → 权威：`video_dsl/concept-video-dsl.md`（+ `video_dsl/schema/concept-video.schema.json`）
- `references/layouts.md` → 权威：`video_dsl/concept-video-scene-templates.yaml`
- `references/colors.md` → 权威：`video_dsl/量化色卡规范.md`

冲突时以 `video_dsl/` 下的权威文件为准，本包 references 仅为要点摘要。

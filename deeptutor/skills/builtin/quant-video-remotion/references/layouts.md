# 布局与蓝图要点摘要（权威：video_dsl/concept-video-scene-templates.yaml）

> 速查摘要；regions、别名表与蓝图完整定义以 `video_dsl/concept-video-scene-templates.yaml` 为准。

## 24 个布局（layout_library）

| layout | 用途 | 适用场景 |
|---|---|---|
| full-hero | 全屏主视觉 + 大标题 | opening |
| split | 左右分栏，文图并行 | problem_hook, concept |
| centered-text | 居中单栏文字，抛问题/金句 | problem_hook, conclusion |
| formula-focus | 公式聚焦 + 变量表 + 算例 | formula |
| chart-full | 全幅图表 + 读图结论 | chart |
| chart-side | 图表 + 侧注栏 | chart, concept |
| card-grid-3 | 三卡网格（恰好 3 卡） | conclusion |
| card-list | 纵向要点卡列表（≤5） | summary, concept |
| compare-2 | 双栏对比 A vs B | problem_hook, concept |
| timeline | 时间轴/步骤 | concept, summary |
| quote-emphasis | 金句大字强调 | problem_hook, conclusion |
| title-closing | 收尾标题卡 + 引导 | summary |
| full-bleed | 全出血主视觉铺满 + 压角标题 | opening, quote |
| sidebar-left | 左侧栏导航 + 右侧主内容 | concept, recap, case_study |
| split-40-60 | 非对称分栏（40% 文 / 60% 视觉） | concept, data_comparison, case_study |
| stacked | 上下堆叠（视觉在上文字在下） | concept, chart, case_study |
| quote-center | 居中金句 + 装饰线 | quote, conclusion |
| timeline-horizontal | 横向时间轴，节点交错 | timeline, case_study, summary |
| comparison-2col | 双列对比带列头 | data_comparison, problem_hook, concept |
| image-focus | 大图主视觉 + 角标 | chart, concept |
| text-focus | 纯文字聚焦（大字 + 小注） | problem_hook, quote, conclusion |
| grid-3x2 | 六格网格平铺 | data_comparison, recap, summary |
| overlay-caption | 全幅视觉 + 底部浮层说明 | chart, opening, case_study |
| number-spotlight | 超大数字居中聚焦 | big_number |

布局别名（如 `split-screen`→`split`、`three-cards`→`card-grid-3`）在 IR 注入期归一化；
未知布局渲染降级为占位帧并告警。

## 三套长度预设（video_blueprint）

- `short-7`：opening → problem_hook → concept → formula → chart → conclusion → summary
- `standard-10`：opening → problem_hook → concept → big_number → formula → chart → data_comparison → case_study → conclusion → summary
- `full-13`：opening → problem_hook → concept → timeline → formula → chart → big_number → data_comparison → case_study → quote → recap → conclusion → summary

用法：选定蓝图复制骨架，逐屏填 PageModel + content_slots；每屏 layout 取蓝图建议值，偏离应有意图。

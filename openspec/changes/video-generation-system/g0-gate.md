# G0 门禁记录 & Fork 基线

> 日期：2026-07-30 ｜ 对应 tasks.md §1（G0）与 3.1

## 1. 资产核验结论（tasks 1.1 / 1.2 / 1.4）

对四份资产的全仓核验（含 .gitignore 忽略文件与 git 历史，2026-07-30 两次独立核验）：

| 资产 | 结论 |
|---|---|
| `concept-video-dsl.md` v3.0 | 不在仓库任何位置（含 git 历史） |
| `concept-video-scene-templates.yaml` v2.1 | 不在仓库任何位置（含 git 历史） |
| `量化色卡规范.md` | 不在仓库任何位置（含 git 历史） |
| `skills/quant-video-remotion/` | 不在仓库任何位置（含 git 历史；内建技能仅 docx/pptx/xlsx/pdf/skill-creator） |

**门禁决策：路径 B（资产缺失，从零建设）。** M-1（tasks §2）启动，主路线图顺延，全量 13 场景/24 布局/§13 清单并入 M2–M3 补完，预计工期 18–19 周。若日后在原属机器/仓库找回 v3.0 资产，以本仓 `video_dsl/` 新建版本为权威、找回版本做对照合并（避免双权威源）。

入库位置（路径 B 新建，已脱离被 gitignore 的 docs/）：
- `video_dsl/concept-video-dsl.md` — 权威契约（v3.0 核心 + v3.1 style 扩展）
- `video_dsl/schema/concept-video.schema.json` — §10 JSON Schema（ajv/jsonschema 共用单一来源）
- `video_dsl/concept-video-scene-templates.yaml` — layout_library + video_blueprint
- `video_dsl/量化色卡规范.md` — 7 色 token + default / quant-traditional 主题
- `deeptutor/skills/builtin/quant-video-remotion/` — 首个领域技能包

## 2. Remotion 许可核对（tasks 1.3）

来源：[remotion.dev/docs/license/terms](https://www.remotion.dev/docs/license/terms)、[github.com/remotion-dev/remotion LICENSE.md](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)。

- **免费档**：个人、非营利组织、以及 **3 人及以下**的营利组织可免费使用；
- **Company License**：超出免费档须按 seat 付费（公开报价约 $25/seat/月，以官网合同为准）；
- **结论**：当前规划团队（1 全栈 + 1 后端 + M3 起 0.5 人力 ≈ 2.5 人）落在免费档内，**现阶段零许可成本**；
- **持续义务**：团队扩至第 4 人（含聚合关联公司人头）即触发付费——将"季度复核 Remotion 许可资格"列入 M4 监控项；若未来不可接受，渲染层备选为 FFmpeg 管线（牺牲 Player 预览红利，见 design.md Risks）。

## 3. Fork 基线（tasks 3.1）

- **基线**：DeepTutor v1.5.6（`deeptutor/__version__.py`，git 顶部提交 `release: v1.5.6`）。本工作区即 fork；
- **锁定规则**：不追上游 feature 分支；仅 cherry-pick 安全修复（security / data-loss / crash 三类）；
- **cherry-pick 流程**：上游打 tag → 评估影响面（限 `deeptutor/services/`、`deeptutor/tools/` 安全相关）→ 独立分支 pick → CI 绿 → 合入；
- **复核节奏**：每里程碑（M1–M4）收尾时检查一次上游安全公告，其余时间不追踪。

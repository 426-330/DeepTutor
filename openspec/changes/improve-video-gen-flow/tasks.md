# 实施任务清单

> 依据 proposal.md / design.md / specs/video-spec/spec.md。范围集中在 `deeptutor/capabilities/video/` 与 prompts。

## 1. 抓取失败显式化（D1）

- [x] 1.1 重构 `_gather_materials` 返回结构化结果：`{materials_text, failed_urls: [...], fetched: [...]}`（保持现有调用方签名兼容或同步更新）
- [x] 1.2 video_spec loading 阶段加判定：消息含 URL ∧ 全部失败 ∧ 无附件 ∧ 无 `allow_fetch_failure` → emit error 中止，错误文案含三个可操作建议（prompts zh/en 各加 `fetch_all_failed` 键）
- [x] 1.3 部分失败路径：继续生成，失败 URL 进结果 payload `warnings`
- [x] 1.4 测试：唯一 URL 全败中止 / 显式放行继续 / 多 URL 部分失败继续 + warnings

## 2. 素材接地（D2）

- [x] 2.1 素材摘要函数：标题 + 前 N 字符截取（不调 LLM），单测覆盖
- [x] 2.2 注入 `design_style`（摘要进 style 设计提示词）与 `generate_spec`（全文截断版进 materials，摘要进约束段）
- [x] 2.3 `prompts/{zh,en}/video_spec.yaml` 的 `spec_system` 增补硬约束文案：内容基于素材、素材不足减屏数、禁止编造
- [x] 2.4 测试：提示词组装含素材摘要（mock LLM 调用断言 prompt 内容）

## 3. 相关性复查（D3）

- [x] 3.1 `validator.py` 新增 W11 warning：series/opening.title/各屏 title 与用户消息+素材标题的 bigram 重合检查（复用既有 bigram 启发式），零重合 → warning
- [x] 3.2 warning 进结果 `validation_warnings`，不触发回炉
- [x] 3.3 测试：零重合出 warning / 有重合不出 / warning 不阻断

## 4. 澄清表单中文（D4）

- [x] 4.1 `clarify.py` 新增 `resolve_prompt_language(message, context_language)`：显式 zh/en > CJK 检测 > en
- [x] 4.2 video_spec capability 加载 prompts 时改用该函数结果选 en/zh 文案
- [x] 4.3 核对 prompts/zh 与 en 的 clarify 节键值一一对应（补缺失键）
- [x] 4.4 测试：中文消息 → zh、显式 en + 中文消息 → en、无语言无 CJK → en

## 5. 收尾

- [x] 5.1 README「常用参数」表补 `allow_fetch_failure` 与 `clarify_timeout_s`
- [x] 5.2 全量 pytest + ruff + py_compile 通过
- [x] 5.3 实测：知乎链接（抓取失败）→ 明确报错；Wikipedia 链接 → 素材注入出片；中文输入 → 中文澄清卡片

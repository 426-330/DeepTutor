## ADDED Requirements

### Requirement: URL 抓取失败默认中止
当用户消息包含 URL 且所有 URL 抓取失败、同时无附件素材时，video_spec SHALL 在生成前中止并报错，错误信息 MUST 包含可操作建议（粘贴正文 / 上传文档 / 使用 `allow_fetch_failure` 强制继续）。仅当 overrides 显式传 `allow_fetch_failure: true` 时 MUST 才允许无素材继续生成。部分 URL 成功时 SHALL 继续生成，失败 URL 记入结果 warnings。

#### Scenario: 唯一 URL 抓取失败
- **WHEN** 用户输入"把这篇文章做成视频：https://zhihu.com/xxx"且该 URL 抓取失败（反爬/登录墙）
- **THEN** video_spec 中止，错误信息说明抓取失败原因并列出三个可操作建议，不产生 spec 文件

#### Scenario: 显式放行
- **WHEN** 同样场景但 overrides 含 `allow_fetch_failure: true`
- **THEN** 生成继续，结果 payload 的 warnings 中含抓取失败记录

#### Scenario: 多 URL 部分失败
- **WHEN** 用户输入两个 URL，一个抓取成功一个失败
- **THEN** 生成继续（基于成功素材），失败 URL 记入结果 warnings

### Requirement: 素材接地生成
抓取成功的素材 SHALL 以摘要形式注入 style 设计与逐屏 spec 生成两个 LLM 调用点；`spec_system` 提示词 MUST 包含"内容必须基于素材、素材不足时减少屏数、禁止编造事实"的硬约束。

#### Scenario: 素材注入生成
- **WHEN** URL 抓取成功
- **THEN** style 设计与 spec 生成的提示词中均包含该素材的摘要文本

#### Scenario: 无素材纯主题生成
- **WHEN** 用户输入不含 URL 与附件（纯主题提示词）
- **THEN** 生成照常进行（主题生成是合法路径），提示词约束 LLM 围绕用户主题展开

### Requirement: 相关性语义复查
`semantic_review` SHALL 新增 warning 级检查：spec 的 series、opening.title 与各屏 title 跟"用户消息关键词 + 素材标题"做字符级重合度检查，完全无重合时产出 warning（写入结果 `validation_warnings`），MUST NOT 阻断生成或触发回炉。

#### Scenario: 明显跑题产生 warning
- **WHEN** 用户要求"介绍太阳系"而生成的 spec 标题全部与输入零重合
- **THEN** 结果 `validation_warnings` 含相关性提示，spec 照常落盘

#### Scenario: 相关时无 warning
- **WHEN** spec 标题与输入主题有重合（如"太阳系"）
- **THEN** 不产生该 warning

### Requirement: 澄清表单中文
澄清卡片的 prompts 语言选择 SHALL 按序解析：`context.language` 显式设置（zh/en）→ 用户消息含 CJK 字符判 zh → 默认 en。中文输入的用户 MUST 看到中文澄清卡片。

#### Scenario: 中文输入出中文卡片
- **WHEN** context.language 未设置且用户消息为中文
- **THEN** 澄清卡片的问题、选项、占位符均为中文

#### Scenario: 显式语言设置优先
- **WHEN** context.language="en" 且用户消息为中文
- **THEN** 澄清卡片使用英文

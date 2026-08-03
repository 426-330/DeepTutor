## ADDED Requirements

### Requirement: 逐屏 TTS 配音
系统 SHALL 将每屏 `narration.{opening, explanation, conclusion}` 三段拼接为该屏口播稿，调用 DeepTutor Settings 配置的 TTS provider 逐屏生成音频，落盘 `audio/s<NN>.wav`。

#### Scenario: 逐屏生成音频
- **WHEN** spec 含 7 屏 scenes
- **THEN** 产物目录 `audio/` 下生成 s01.wav 至 s07.wav 共 7 个音频文件

### Requirement: 词级时间戳对齐
系统 SHALL 在 exec 沙箱内运行 whisperX 对每屏音频生成词级时间戳。runner 镜像 MUST 包含 whisperX（模型可按需下载或独立数据卷）。

#### Scenario: 生成对齐文件
- **WHEN** 某屏音频生成完成
- **THEN** 沙箱产出该屏词级时间戳并写入 `audio/s<NN>.align.json`

### Requirement: 字幕轨生成
系统 SHALL 基于词级时间戳生成字幕轨 `cues: [{start, end, text}]`，写入 `.align.json` 供渲染层使用。

#### Scenario: 字幕与时间戳一致
- **WHEN** 渲染层读取某屏 `.align.json`
- **THEN** 可获得与该屏音频逐词对齐的 cues 序列

### Requirement: 真实时长不回写 YAML
系统 MUST NOT 将真实音频时长写回 YAML 描述文件。真实时长 SHALL 记录在 `.align.json`，由渲染层在 IR 注入期读取并覆盖 DSL `duration_frames` 默认值，场景时长以音频为准自动重算。

#### Scenario: 重配音不污染事实源
- **WHEN** 用户更换 TTS 音色后重跑本阶段
- **THEN** YAML 文件内容不变，仅 `.align.json` 更新，渲染时长按新音频计算

#### Scenario: 时长覆盖生效
- **WHEN** 某屏 DSL 默认 duration_frames 为 90 而真实音频为 4.2 秒（30fps）
- **THEN** 渲染 IR 中该屏时长为 126 帧

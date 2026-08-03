## ADDED Requirements

### Requirement: 插画素材生成
系统 SHALL 按 spec 中各屏 visual 描述调用 `imagegen` 工具生成插画/配图，产物落该视频产物目录 `assets/`，并在 YAML 中引用。生成 prompt MUST 注入当前主题色板描述以保持视觉一致。

#### Scenario: 生成并引用插画
- **WHEN** spec 某屏 visual 描述需要配图
- **THEN** 系统在 `assets/` 生成图片且 YAML 中该屏引用该文件路径

### Requirement: 生成参数可追溯
系统 SHALL 为每个生成的素材写旁车 `.meta.json`，记录 prompt、模型、种子等生成参数，保证可复现。

#### Scenario: 复现素材
- **WHEN** 用户使用同一 `.meta.json` 中的参数重新生成
- **THEN** 得到与原始素材一致的结果

### Requirement: 网页素材采集
系统 SHALL 通过 exec 沙箱内的 headless Chromium（Playwright）对目标网页截图，作为素材落 `assets/`。runner 镜像 MUST 包含 Chromium 与 Playwright。

#### Scenario: 网页截图落盘
- **WHEN** spec 引用某网页作为画面素材
- **THEN** 沙箱完成截图并落盘 `assets/`，YAML 中引用截图路径

### Requirement: 图表数据落盘
系统 SHALL 将用户 CSV 或接口数据落至产物目录 `data/`，供 DSL `chart_verification.data` 外链按相对路径解析。

#### Scenario: CSV 供图表引用
- **WHEN** 用户提供收益曲线 CSV
- **THEN** 文件落盘 `data/` 且图表场景的 data 外链可解析到该文件

### Requirement: 音频素材库
系统 SHALL 从本地素材库选取 BGM/音效供合成阶段混音使用。

#### Scenario: BGM 可用
- **WHEN** spec 声明需要 BGM
- **THEN** 系统从本地素材库解析出可用音频文件路径供 video_compose 混音

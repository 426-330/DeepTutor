# 色卡要点摘要（权威：video_dsl/量化色卡规范.md）

> 速查摘要；token 语义与纪律细节以 `video_dsl/量化色卡规范.md` 为准。

## 7 个颜色 token（封闭枚举）

`primary`（主色）/ `secondary`（次色）/ `accent`（点缀）/ `success`（正向）/
`warning`（警示）/ `danger`（负向）/ `neutral`（中性）

## 内建主题（4 个）

### default（中性通用 · 兜底）

| token | hex | | token | hex |
|---|---|---|---|---|
| primary | `#2563EB` | | warning | `#D97706` |
| secondary | `#64748B` | | danger | `#DC2626` |
| accent | `#8B5CF6` | | neutral | `#6B7280` |
| success | `#16A34A` | | | |

### quant-traditional（量化科普风）

| token | hex | | token | hex |
|---|---|---|---|---|
| primary | `#1A5FB4` | | warning | `#E0A100` |
| secondary | `#4A6FA5` | | danger | `#D64545` |
| accent | `#C9A227` | | neutral | `#5B6770` |
| success | `#2E9E5B` | | | |

### tech-minimal（科技极简）

| token | hex | | token | hex |
|---|---|---|---|---|
| primary | `#0284C7` | | warning | `#F59E0B` |
| secondary | `#475569` | | danger | `#EF4444` |
| accent | `#06B6D4` | | neutral | `#6B7280` |
| success | `#10B981` | | | |

### warm-editorial（暖调编辑风）

| token | hex | | token | hex |
|---|---|---|---|---|
| primary | `#C2410C` | | warning | `#B45309` |
| secondary | `#78716C` | | danger | `#B91C1C` |
| accent | `#D4A373` | | neutral | `#57534E` |
| success | `#4D7C0F` | | | |

## 引用纪律（务必遵守）

- 场景内（含分镜 style、特效 params、素材描述）**禁裸 hex**，只能写 token 名；
- hex 唯一合法出现处：顶层 `style.colors`，且键只能是 7 个 token（值 `#RRGGBB`）；
- 分镜 `style.colors` 是 token→token 重映射（如 `{ primary: danger }`），不是 hex 重定义；
- imagegen 素材 prompt 注入当前色板描述，保证视觉一致。

# video_dsl/skills/ — 仓库内建特效技能包

本目录存放**进 git 的特效技能包**（规范：`video_dsl/effect-skills.md`）。
用户安装位在 `data/skills/`（不进 git），同名技能用户位覆盖本目录。

每个技能一个目录（建议 `<namespace>/<skill>/` 布局）：

```
skills/
└── three/
    └── particle-wave/
        ├── SKILL.md        # frontmatter: name/description/params（颜色仅 7 token 枚举）
        ├── component.tsx   # 特效组件（R3F，经 @remotion/three 进 worker bundle）
        ├── preview.png     # 预览图
        └── defaults.json   # params 默认值
```

发现逻辑：`deeptutor/capabilities/video/skills.py`（扫描本目录 +
`data/skills/`）。渲染白名单：remotion-worker 只认已注册技能标识，未知
标识降级占位帧 + 告警。

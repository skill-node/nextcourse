# CourseFlow 🎓

**Agent-Native 全链路课程开发工具** — 从课程内容结构化设计到专业 Reveal.js 课件渲染的完整 AI 工作流。

## 核心理念

> 不造 App，造 Agent Skill。核心资产（组件库、视觉预设、script.md 规范）平台无关，可平滑升级为 Web 应用。

## 功能架构

```
用户输入课程主题 → /content-design → script.md → /slide-renderer → Reveal.js HTML 课件
```

### 🧠 内容引擎 (`/content-design`)
基于 ADDIE/ARCS 教学模型的三阶段结构化设计：
1. **需求分析** — 学员画像 + 课程定位
2. **结构设计** — Module/Lesson 提纲 + 风格决策
3. **脚本细化** — 逐页 `[Slide N]` 输出，带组件类名标注

### 🎨 渲染引擎 (`/slide-renderer`)
将 `script.md` 转换为离线可用的 Reveal.js HTML 课件：
- **11 套配色方案**（5 基础 + 6 高级预设）
- **Standard/Modern 双轨制**组件白名单
- **入场动画**（fade-up/left/right、zoom-in、stagger 交错延迟）
- **响应式适配**（clamp() 排版 + 多断点）
- **演讲者备注**（Reveal.js 原生支持，按 S 键）

## 视觉预设一览

| 预设 | 字体 | 风格 | 适用场景 |
|------|------|------|----------|
| `standard-default` | 系统字体 | 蓝/深灰企业风 | 企业培训通用 |
| `dark-ocean` | 系统字体 | 深蓝黑 | 投影仪暗场 |
| `bold-signal` | Archivo Black + Space Grotesk | 深色高对比 + 橙色 | 高管演讲 |
| `electric-studio` | Manrope | 黑白 + 蓝色强调 | 产品演示 |
| `creative-voltage` | Syne + Space Mono | 电蓝 + 荧光黄 | 创意分享 |
| `notebook-tabs` | Bodoni Moda + DM Sans | 纸质 + 柔和色调 | 工作坊 |
| `swiss-modern` | Archivo + Nunito | 极简黑白 + 红色 | 技术培训 |
| `dark-botanical` | Cormorant + IBM Plex Sans | 深色 + 暖色调 | 高端品牌 |

## 项目结构

```
Course_Flow/
├── .agent/skills/
│   ├── content-design/SKILL.md       # 内容引擎
│   └── slide-renderer/
│       ├── SKILL.md                  # 渲染引擎
│       └── resources/                # 模板与组件库
├── lib/                              # Reveal.js + FontAwesome（本地化）
├── shared_styles/
│   ├── base_layout.css               # 基础布局（含响应式）
│   ├── animations.css                # 动画工具库
│   ├── themes/                       # Standard/Modern 主题
│   └── color-schemes/                # 11 套配色方案
└── courses/                          # 课程文件存储
    └── [course-name]/
        ├── script.md                 # 教学脚本
        ├── index.html                # 渲染产出
        └── assets/                   # 图片资源
```

## 使用方式

在支持 Skill 的 AI Agent 环境中（如 Antigravity）：

1. **创建课程内容**：输入 `/content-design`，按引导完成课程结构化设计
2. **渲染课件**：输入 `/slide-renderer`，将 `script.md` 转换为 HTML

## 产品化路径

| 阶段 | 形态 | 复用率 |
|------|------|--------|
| V1 (当前) | Agent Skill | — |
| V2 | CLI 工具 | ~90% |
| V3 | Web App | ~70% |

## License

MIT

# ⚡ CourseFlow

**Agent-Native 全链路课程开发工具** — 从想法到专业课件，一个命令搞定。

CourseFlow 将 AI 驱动的教学设计与自动化渲染引擎融为一体，支持 CLI 和 Web 双模式操作，生成基于 Reveal.js 的专业 HTML 课件，可离线运行、零依赖部署。

---

## ✨ 核心特性

- 🤖 **AI 内容设计助手** — 基于 ADDIE/ARCS 模型，三阶段引导（需求分析→结构设计→脚本细化），自动生成结构化脚本
- 🎨 **11 套视觉预设** — 5 基础 + 6 高级配色方案，覆盖企业培训、技术分享、创意演示等场景
- 🖥️ **Web 工作台** — 浏览器内完成课程管理、内容编辑、实时预览和可视化微调
- ⌨️ **CLI 渲染引擎** — 零依赖解析器 + 组件化渲染器，一行命令完成构建
- ✏️ **可视化编辑** — 在预览中直接点击修改幻灯片文字，保存自动回写脚本
- 📦 **离线运行** — 生成的 HTML 课件带全部资源，无需网络即可演示

## 🚀 快速开始

### 1. 安装

```bash
git clone https://github.com/skill-node/Course_Flow.git
cd Course_Flow
npm install
```

### 2. 配置 AI（可选）

```bash
cp .env.example .env
# 编辑 .env，填入你的 LLM API Key
```

支持 DeepSeek、OpenAI 等 OpenAI 兼容 API。

### 3. 启动 Web UI

```bash
npm start
# → http://localhost:3000
```

### 4. CLI 渲染

```bash
# 渲染指定课程
npm run render -- --course gem_test

# 使用指定预设渲染
npm run render -- --course gem_test --preset bold-signal

# 查看所有预设
npm run list-presets
```

## 🎨 视觉预设

| 预设 | 风格 | 适用场景 |
|------|------|----------|
| `standard-default` | 蓝/深灰/绿/橙 | 企业培训通用 |
| `bold-signal` | 深色高对比 + 橙色 | 高管演讲 |
| `notebook-tabs` | 纸质 + 彩色标签 | 工作坊 |
| `swiss-modern` | 极简黑白 + 红色 | 技术培训 |
| `electric-studio` | 黑白 + 蓝色强调 | 产品演示 |
| `creative-voltage` | 电蓝 + 荧光黄 | 创意分享 |
| `dark-ocean` | 深蓝黑 | 科技感强的技术分享 |
| `dark-botanical` | 深色 + 暖色调 | 高端优雅 |
| `neon-cyber` | 深海军蓝 + 霓虹 | 未来科技 |
| `warm-sand` | 暖米色 | 长时间阅读 |
| `high-contrast` | 纯白高对比 | 强光环境 |

## 📁 项目结构

```
Course_Flow/
├── bin/                    # CLI 工具
│   ├── courseflow.js        # 命令行入口
│   └── lib/
│       ├── parser.js        # script.md 零依赖解析器
│       └── renderer.js      # HTML 组件化渲染引擎
├── server/                 # Web 服务
│   ├── index.js             # Express API（9 端点）
│   └── public/              # 前端 SPA
│       ├── index.html
│       ├── css/app.css
│       └── js/
│           ├── app.js        # 核心逻辑（路由+编辑+同步）
│           ├── ai-chat.js    # AI 对话组件
│           └── editor-inject.js  # 可视化编辑器
├── shared_styles/          # 全局样式资源
│   ├── base_layout.css
│   ├── animations.css
│   ├── themes.css
│   └── color-schemes/      # 11 套配色方案 CSS
├── lib/                    # Reveal.js 运行时
├── courses/                # 课程数据（每个子目录 = 一门课程）
├── .agent/skills/          # AI Agent 技能定义
│   ├── content-design/      # 内容设计 SKILL
│   └── slide-renderer/      # 渲染引擎 SKILL
├── .env.example            # API 配置模板
└── package.json
```

## 📖 详细文档

完整的技术架构、文件逻辑、数据流和开发指南，请参阅 [SYSTEM.md](./SYSTEM.md)。

## 📜 License

MIT

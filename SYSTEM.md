# CourseFlow 系统说明

> 全链路课程开发工具的技术架构、文件逻辑与开发指南

---

## 目录

1. [技术栈](#1-技术栈)
2. [系统架构](#2-系统架构)
3. [目录结构与文件说明](#3-目录结构与文件说明)
4. [核心数据流](#4-核心数据流)
5. [API 接口](#5-api-接口)
6. [CLI 命令](#6-cli-命令)
7. [脚本格式规范](#7-脚本格式规范)
8. [视觉预设系统](#8-视觉预设系统)
9. [AI 助手集成](#9-ai-助手集成)
10. [可视化编辑器](#10-可视化编辑器)
11. [开发与扩展](#11-开发与扩展)

---

## 1. 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **运行时** | Node.js | 服务端 + CLI，零外部依赖（除 express） |
| **Web 框架** | Express 4.x | API 服务器 + 静态文件托管 |
| **前端** | 原生 JS + CSS | 零框架 SPA，原生 DOM 操作 |
| **演示引擎** | Reveal.js 5.x | HTML 课件渲染核心 |
| **AI 接口** | OpenAI 兼容 API | 支持 DeepSeek / OpenAI / Moonshot 等 |
| **样式系统** | CSS 变量 + 配色方案 | 11 套预设 × 2 模板 = 22 种组合 |

### 设计原则

- **零依赖核心**：CLI 工具（`parser.js` / `renderer.js`）不引入任何 npm 包，完全基于 Node.js 原生 API
- **离线优先**：生成的课件包含全部资源，可脱离网络运行
- **单命令启动**：`npm start` 启动 Web UI，同时暴露 CLI 和 API

---

## 2. 系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                        浏览器 (SPA)                           │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ 仪表盘   │  │ 编辑器    │  │ 预览窗口  │  │ AI 聊天面板  │  │
│  │ app.js  │  │ app.js   │  │ iframe   │  │ ai-chat.js   │  │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │            │              │                │          │
│       └────────────┴──────┬───────┘                │          │
│                           │ HTTP                    │          │
└───────────────────────────┼─────────────────────────┘          │
                            │                                    │
┌───────────────────────────▼────────────────────────────────────┤
│                   Express API Server                           │
│              server/index.js (9 端点)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ 课程 CRUD │  │ 渲染接口  │  │ 预设查询  │  │ AI 聊天代理  │  │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └──────┬───────┘  │
│       │              │                              │          │
│       │         ┌────▼────────────┐          ┌──────▼───────┐ │
│       │         │ CLI 渲染引擎     │          │ DeepSeek API │ │
│       │         │ parser.js       │          │ (SSE 流式)   │ │
│       │         │ renderer.js     │          └──────────────┘ │
│       │         └────┬────────────┘                           │
│       │              │                                        │
│  ┌────▼──────────────▼─────┐                                  │
│  │   courses/ 文件系统      │                                  │
│  │   script.md → index.html │                                  │
│  └─────────────────────────┘                                  │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. 目录结构与文件说明

### `/bin` — CLI 工具链

| 文件 | 职责 |
|------|------|
| `courseflow.js` | CLI 入口。解析命令行参数（`render`、`list-presets`），调用底层模块 |
| `lib/parser.js` | **零依赖解析器**。正则提取 YAML frontmatter + `[Slide N]` 块，输出结构化 JSON |
| `lib/renderer.js` | **组件化渲染引擎**。读取解析结果 → 匹配 CSS 组件类 → 注入动画 → 合成 `index.html` |

#### parser.js 解析流程

```
script.md 原始文本
  ↓ extractFrontmatter()    ─ 正则提取 YAML k: v 键值对
  ↓ splitSlides()           ─ 按 [Slide N] 分割区块
  ↓ parseSlideBlock()       ─ 提取标题(#)、列表项(-)、组件数据
  ↓
{ frontmatter, slides[] }   ─ 结构化输出
```

#### renderer.js 渲染流程

```
{ frontmatter, slides[] }
  ↓ loadTemplate()          ─ 加载 standard/modern 模板 HTML
  ↓ resolveColorScheme()    ─ 匹配配色方案 CSS 文件
  ↓ buildSlideHtml()        ─ 遍历 slides，按 component 字段匹配组件模板
  ↓ injectAnimations()      ─ 注入 CSS 入场动画（fade-in、slide-up 等）
  ↓ replaceAll(placeholders) ─ 替换模板占位符
  ↓ writeFile()             ─ 输出 courses/{name}/index.html
```

### `/server` — Web 服务层

| 文件 | 职责 |
|------|------|
| `index.js` | Express 服务器。加载 `.env`，定义 9 个 API 路由，托管前端静态文件 |
| `public/index.html` | SPA 入口。极简结构：顶栏 + 动态主容器 + 模态弹窗 + Toast |
| `public/css/app.css` | 全局样式。深色玻璃态主题、课程卡片、双栏工作台、AI 面板 |
| `public/js/app.js` | 前端核心。路由（hash-less SPA）、仪表盘、工作台、编辑器表单↔script.md 双向同步 |
| `public/js/ai-chat.js` | AI 对话组件。ADDIE 三阶段系统提示词、SSE 流式读取、Markdown→HTML 渲染、脚本提取 |
| `public/js/editor-inject.js` | 可视化编辑器。注入到 Reveal.js iframe，添加 contenteditable + postMessage 通信 |

### `/shared_styles` — 样式资源

| 文件/目录 | 说明 |
|-----------|------|
| `base_layout.css` | 通用布局（grid、card、封面、模块封面等组件类） |
| `animations.css` | 入场动画关键帧定义（fade-in、slide-up、scale 等） |
| `themes.css` | Standard/Modern 模板的基础样式差异 |
| `color-schemes/*.css` | 11 套配色方案，通过 CSS 变量定义色板 |

### `/lib` — Reveal.js 运行时

打包在项目内的 Reveal.js 核心文件（`dist/reveal.js`、`plugin/`、`fonts/`），确保课件可离线运行。

### `/courses` — 课程数据

每个子目录对应一门课程：

```
courses/
└── gem_test/
    ├── script.md      # 课程脚本（唯一输入源）
    ├── index.html     # 渲染输出的 Reveal.js 课件
    └── assets/        # 课程资源（图片等）
```

### `/.agent/skills` — AI Agent 技能

| 技能 | 触发 | 说明 |
|------|------|------|
| `content-design` | `/content-design` | 内容架构师。ADDIE/ARCS 模型引导设计课程结构 |
| `slide-renderer` | `/slide-renderer` | 渲染引擎接口。将 script.md 转换为 HTML 课件 |

---

## 4. 核心数据流

### 完整工作流

```
用户想法
  │
  ▼
┌──────────────────┐     AI 助手完成三阶段引导
│  AI Content       │     1️⃣ 需求分析（学员画像、教学目标）
│  Design           │     2️⃣ 结构设计（Module → Lesson 提纲）
│  Assistant        │     3️⃣ 脚本细化（逐页 Slide 拆解）
└────────┬─────────┘
         │ 生成
         ▼
┌──────────────────┐
│   script.md       │  ← 唯一的数据源 (Single Source of Truth)
│   (Markdown)      │     YAML frontmatter + [Slide N] 块
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
  CLI       Web UI
 render     render API
    │         │
    └────┬────┘
         │ parser.js → renderer.js
         ▼
┌──────────────────┐
│  index.html       │  ← Reveal.js 课件输出
│  (可离线运行)      │
└──────────────────┘
```

### 数据双向同步（Web UI）

```
┌─────────────┐       ┌─────────────┐       ┌──────────────┐
│  编辑器表单   │ ────→ │ script.md   │ ────→ │  渲染引擎     │
│  (左栏)      │ input  │ (文件系统)   │ CLI    │  (renderer)  │
└─────────────┘       └──────┬──────┘       └──────┬───────┘
       ↑                     │                      │
       │                     │ parseScript()        │
       │                     ▼                      ▼
       │              { slides[] }          index.html
       │                     │                      │
       └─ renderSlideList() ─┘              iframe.src ──→ 预览
```

---

## 5. API 接口

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/courses` | 列出所有课程（含 slide 数量、渲染状态、最后修改） |
| GET | `/api/courses/:name` | 获取课程详情（frontmatter + slides 结构 + raw 源码） |
| POST | `/api/courses` | 新建课程（name, title, template, colorScheme） |
| PUT | `/api/courses/:name/script` | 更新 script.md 内容，返回重新解析结果 |
| DELETE | `/api/courses/:name` | 删除课程目录 |
| POST | `/api/render/:name` | 渲染课程，可选 `preset` 参数覆盖配色 |
| GET | `/api/presets` | 列出所有配色方案（含描述和分类） |
| POST | `/api/ai/chat` | AI 聊天代理（SSE 流式转发到 LLM API） |
| GET | `/api/ai/status` | 检查 AI 配置状态（是否已填入 API Key） |

### 示例：渲染课程

```bash
curl -X POST http://localhost:3000/api/render/gem_test \
  -H "Content-Type: application/json" \
  -d '{"preset": "bold-signal"}'
```

响应：

```json
{
  "success": true,
  "slideCount": 5,
  "preset": "bold-signal",
  "warnings": [],
  "previewUrl": "/courses/gem_test/index.html"
}
```

---

## 6. CLI 命令

```bash
# 渲染课程
node bin/courseflow.js render --course <name> [--preset <preset>]

# 列出所有可用预设
node bin/courseflow.js list-presets

# npm 快捷方式
npm run render -- --course gem_test --preset dark-ocean
npm run list-presets
```

---

## 7. 脚本格式规范

`script.md` 是系统的唯一数据源，格式如下：

```markdown
---
title: 课程名称
template: standard
color-scheme: bold-signal
style-preset: bold-signal
---

[Slide 1]
# 封面标题
## 副标题
- 视觉组件: .cover-slide
- 核心内容要点: 首页描述文字
- 演讲备注: 欢迎词，开场互动

[Slide 2]
# 第一章 模块标题
- 视觉组件: .module-cover .module-1
- 模块说明: 本章将介绍...

[Slide 3]
# 核心概念对比
- 视觉组件: .grid-2
- 核心内容要点: 传统方法：依赖经验判断
- 核心内容要点: 新方法：数据驱动决策
- 演讲备注: 用案例说明差异
```

### frontmatter 字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | ✅ | 课程标题 |
| `template` | ✅ | `standard`（画布风）或 `modern`（卡片风） |
| `color-scheme` | ✅ | 配色方案名称 |
| `style-preset` | 可选 | 视觉预设，优先级高于 color-scheme |

### 组件白名单

#### 通用组件

| 组件 | CSS 类 | 用途 |
|------|--------|------|
| 两栏布局 | `.grid-2` | 左右等分 |
| 三栏布局 | `.grid-3` | 三等分 |
| 代码块 | `.code-block` | 代码展示 |
| 高亮框 | `.highlight-box` | 提示信息 |

#### Standard 模板专属

| 组件 | CSS 类 |
|------|--------|
| 封面页 | `.cover-slide` |
| 结语页 | `.ending-slide` |
| 模块封面 | `.module-cover .module-1` ~ `.module-10` |
| 左图右文 | `.layout-img-left` |
| 右图左文 | `.layout-img-right` |
| 上图下文 | `.layout-img-top` |

#### Modern 模板专属

| 组件 | CSS 类 |
|------|--------|
| 封面页 | `.cover-slide` |
| 结语页 | `.ending-slide` |
| 图标卡片网格 | `.icon-card-grid` |
| 工作流节点 | `.workflow` |

---

## 8. 视觉预设系统

预设文件位于 `shared_styles/color-schemes/`，每个 `.css` 文件通过 CSS 变量定义完整色板：

```css
/* 示例：bold-signal.css */
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --text-primary: #eaeaea;
  --accent-1: #e94560;
  --accent-2: #0f3460;
  /* ... 完整的色板定义 */
}
```

渲染器通过 `style-preset` 或 `color-scheme` 字段匹配对应 CSS 文件，注入到生成的 `index.html` 中。

### 预设分类

| 类型 | 预设 | 特点 |
|------|------|------|
| **基础** | `standard-default`, `default`, `dark-ocean`, `warm-sand`, `high-contrast` | 简洁色板 |
| **高级** | `bold-signal`, `electric-studio`, `creative-voltage`, `notebook-tabs`, `swiss-modern`, `dark-botanical` | 含装饰性字体、特殊组件样式 |

---

## 9. AI 助手集成

### 配置

```env
# .env
LLM_API_KEY=sk-your-api-key
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
```

### 工作流程

AI 助手内置了 ADDIE 教学设计模型的完整系统提示词，按三个阶段引导用户：

| 阶段 | 名称 | 输出 |
|------|------|------|
| 1️⃣ | **需求分析 (Analysis)** | 学员画像、教学目标、课程定位宣言、模板/预设推荐 |
| 2️⃣ | **结构设计 (Design)** | Module → Lesson 提纲、配色匹配 |
| 3️⃣ | **脚本细化 (Development)** | 逐页 Slide 内容，含组件选择、内容密度控制 |

### 技术实现

```
浏览器 ai-chat.js
  │ POST /api/ai/chat  { messages: [...] }
  ▼
Express 代理层
  │ 原生 https.request()
  │ Stream: true
  ▼
DeepSeek API (SSE)
  │ data: {"choices":[{"delta":{"content":"..."}}]}
  ▼
Express 流式转发
  │ res.write(chunk)
  ▼
浏览器逐 token 渲染
```

### 脚本提取

当 AI 输出包含 `\`\`\`markdown ... \`\`\`` 代码块时：

1. 用户点击「📥 提取脚本」按钮
2. 正则匹配 `---` 包裹的 frontmatter + slide 内容
3. 调用 `PUT /api/courses/:name/script` 写入
4. 工作台自动刷新编辑器和预览

---

## 10. 可视化编辑器

### 原理

`editor-inject.js` 在 iframe 加载完成后被动态注入到 Reveal.js 页面中：

```
app.js (loadPreview)
  │ frame.onload → inject <script src="/js/editor-inject.js">
  ▼
editor-inject.js (iframe 内部)
  │ 添加 CSS 高亮样式
  │ 监听 hover/click 事件
  │ 设置 contenteditable
  │ postMessage 通信
  ▼
app.js (handleSlidesEdited)
  │ 合并变更到 slides[]
  │ 重新生成 script.md
  │ PUT /api/courses/:name/script
  ▼
编辑器 + 缩略图自动刷新
```

### 编辑模式交互

1. 点击工具栏「✏️ 编辑」→ iframe 内出现「编辑模式」指示器
2. hover 元素 → 虚线高亮
3. 点击元素 → 变为可编辑状态（`contenteditable="true"`）
4. 修改文字 → 点击浮动工具栏「💾 保存修改」
5. 变更通过 `postMessage` 传回父窗口 → 自动保存到 `script.md`

---

## 11. 开发与扩展

### 添加新配色方案

1. 在 `shared_styles/color-schemes/` 创建 `my-theme.css`
2. 定义所有必要的 CSS 变量（参考 `bold-signal.css`）
3. 系统自动发现新文件，无需修改代码

### 添加新组件

1. 在 `shared_styles/base_layout.css` 中定义组件 CSS 类
2. 在 `bin/lib/renderer.js` 的 `componentTemplates` 对象中添加对应 HTML 模板
3. （可选）在 `.agent/skills/content-design/SKILL.md` 的组件白名单中注册

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | Web 服务端口 |
| `LLM_API_KEY` | — | LLM API 密钥 |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` | API 基础 URL |
| `LLM_MODEL` | `deepseek-chat` | 模型名称 |

### 已知限制

- 部分配色方案下，文字颜色可能与背景色接近（CSS 变量覆盖不完整），计划后续统一修复
- AI 脚本提取依赖代码块格式，若 AI 输出格式不规范可能提取失败
- 可视化编辑器仅支持文字修改，不支持拖拽重排

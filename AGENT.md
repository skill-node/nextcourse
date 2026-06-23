# CourseFlow — Agent Reference

CourseFlow 是一个以 **AI-Native 工作流为核心的课程开发工具**。
输入：一句话主题 → 输出：可在浏览器中全屏演示的 Reveal.js HTML 幻灯片课程。

整套流程完全 CLI 驱动，任何 agent（Claude Code / OpenClaw / Hermes / 命令行）均可调用。

---

## 目录结构

```
CourseFlow/
├── AGENT.md              ← 当前文档（agent 入口）
├── DESIGN-SYSTEM.md      ← 完整组件参考手册（创作幻灯片前必读）
├── build.js              ← 课程组装脚本
├── lint-slides.js        ← 样式规范校验脚本
├── export.js             ← 课程打包脚本（生成可离线演示文件夹）
├── skills/
│   └── slide-design.md   ← 幻灯片创作 Skill 定义
├── shared_styles/        ← 全局设计系统 CSS（所有课程共用）
│   ├── base_layout.css
│   ├── tokens.css
│   ├── components.css
│   ├── animations.css
│   ├── themes/standard.css
│   └── color-schemes/    ← 11 套配色方案
└── courses/
    └── <course-name>/
        ├── course.meta.md      ← 课程元数据 + 大纲（frontmatter）
        ├── slides/
        │   ├── slide-01.html   ← 每个文件 = 一张幻灯片 <section>
        │   ├── slide-02.html
        │   └── ...
        ├── assets/             ← 课程图片（可选）
        └── deck.html           ← 由 build.js 生成，勿手动编辑
```

---

## CLI 命令参考

### 构建课程

```bash
node build.js <course-name>
```

- 读取 `courses/<name>/course.meta.md` 中的 frontmatter（标题、配色、模板）
- 按文件名顺序拼接 `courses/<name>/slides/slide-*.html`
- 生成 `courses/<name>/deck.html`

### 校验样式规范

```bash
node lint-slides.js <course-name>
```

- 扫描所有 `slide-*.html` 文件
- 检查 5 类违规：内联 style / 硬编码颜色 / 硬编码 RGB / 私自引入字体 / 使用未注册 class
- 退出码 0 = 通过，1 = 有违规（打印详细报告）

**建议在 build 前先 lint：**

```bash
node lint-slides.js <name> && node build.js <name>
```

### 打包为可离线演示文件夹

```bash
node export.js <course-name>
# 默认输出到 courses/<course-name>/export/

node export.js <course-name> ~/Desktop
# 输出到 ~/Desktop/<course-name>/
```

- 输出文件夹包含 index.html + lib/ + shared_styles/ + assets/
- 将整个文件夹拷贝到 U 盘 / 云盘 / 任意电脑，双击 index.html 即可演示
- **无需网络，无需安装任何软件**

---

## 课程创作工作流

### 流程一：从零开始设计新课程（推荐路径）

**Step 1 — 大纲设计（对话式）**

```
/course-design
```

通过对话完成三个阶段，最终生成 `course.meta.md`：

```
阶段 1 定位     → 明确受众、情境、核心价值主张
阶段 2 成果     → 用 Bloom 动词写 3-5 条可测量学习成果
阶段 3 知识架构  → 拆解模块，确定每模块主题与页数
```

**Step 2 — 幻灯片渲染**

```
/slide-design <course-name>
```

读取 `course.meta.md`，按 Merrill 第一原理逐页生成 HTML 片段，自动 build：

```
阶段 4 学习体验  → 规划每张幻灯片类型（Hook/Concept/Demo/Practice/Takeaway）
阶段 5 视觉     → 生成 slide-XX.html，组装并生成 deck.html
```

> 完整教学方法论：逆向设计（Backward Design）+ Bloom 分类法 + Merrill 第一原理

### 流程二：修改现有课程

1. 直接编辑 `courses/<name>/slides/slide-XX.html`
2. 重新运行 lint → build → 刷新浏览器

### 流程三：更换配色方案

在 `courses/<name>/course.meta.md` 的 frontmatter 中修改 `theme` 字段：

```yaml
theme: bold-signal
```

可选配色（`shared_styles/color-schemes/` 目录下）：

| 名称               | 风格描述         |
|--------------------|-----------------|
| `default`          | 通用蓝紫渐变     |
| `bold-signal`      | 深色 + 高饱和强调|
| `dark-ocean`       | 深蓝沉浸感       |
| `dark-botanical`   | 深绿自然质感     |
| `electric-studio`  | 霓虹电子风       |
| `creative-voltage` | 创意活力橙       |
| `warm-sand`        | 暖色系商务       |
| `swiss-modern`     | 极简瑞士风       |
| `notebook-tabs`    | 手记分栏风       |
| `high-contrast`    | 无障碍高对比     |
| `standard-default` | 白底经典学术     |

修改后重新 `node build.js <name>` 即生效，无需改任何幻灯片文件。

---

## 新建课程文件结构

### `course.meta.md` 格式

```yaml
---
title: "课程标题"
template: standard
theme: bold-signal
audience: "目标受众描述"
positioning: "核心价值主张（1句话）"
outcomes:
  - bloom: apply
    text: "学员能够…"
  - bloom: analyze
    text: "学员能够…"
  - bloom: create
    text: "学员能够…"
---

## 课程大纲

### 模块一：xxx（X 张）
- 小节说明...

### 模块二：xxx（X 张）
- 小节说明...
```

Bloom 动词参考：remember / understand / apply / analyze / evaluate / create

### `slide-XX.html` 格式

每个文件是一个**裸 `<section>` 片段**（无 html/head/body 标签）：

```html
<section>
  <h2>幻灯片标题</h2>
  <!-- 组件内容 -->
  <aside class="notes">演讲者备注（不在幻灯片上显示）</aside>
</section>
```

文件命名规则：`slide-01.html` … `slide-25.html`（两位数字，按顺序拼接）

---

## 设计规范核心规则（8 条铁律）

> 违反 1-5 条将被 lint-slides.js 拦截，违反 6-8 条需人工检查。

1. **禁止内联 style** — 所有样式必须通过 CSS class 实现
2. **禁止硬编码颜色** — 只允许 CSS 变量 `var(--xxx)`
3. **禁止引入新字体** — 只用设计系统已有的字体
4. **只用已注册的 class** — 组件必须在 `DESIGN-SYSTEM.md` 中有记录
5. **文字-背景必须显式配对** — 有背景色的组件必须显式设置文字色
6. **密度自律** — 每张幻灯片只传递一个核心点；H2 ≤ 15 字；列表 ≤ 6 项，每项 ≤ 20 字
7. **禁止使用占位图** — 有图片时用真实 `<img src>` 或不加图片
8. **标签文字写在 HTML 里** — 组件的说明文字（如"下一步 →"）必须写进 HTML，不依赖 `::before` 自动注入

---

## 可用组件速查

完整 HTML 示例和 DO/DON'T 规则见 `DESIGN-SYSTEM.md`。

| 类别       | 组件 class              | 用途                   |
|------------|-------------------------|------------------------|
| 布局       | `.grid-4`               | 4 列等宽网格           |
| 布局       | `.layout-text-image`    | 左文右图（需真实 img） |
| 列表       | `.pill-list`            | 带序号的胶囊列表       |
| 对比       | `.vs-box.vs-box--columns` | 横向 2-3 列对比框     |
| 概念       | `.concept-card`         | 术语+定义+示例卡       |
| 数据       | `.stats-wall`           | 核心数字展示墙         |
| 引用       | `.quote-slide`          | 大字引言幻灯片         |
| 时间线     | `.timeline`             | 横向时间轴（4节点）    |
| 四象限     | `.quadrant`             | 2×2 矩阵（支持内嵌 SVG）|
| 案例       | `.case-study`           | 三面板案例分析         |
| 表格       | `.table-compare`        | 多列对比表格           |
| 要点总结   | `.key-takeaway`         | 带行动项的总结卡       |
| 强调盒子   | `.highlight-box`        | 深色背景强调文字块     |
| 提示框     | `.callout`              | tip / warning / insight|
| 模块分隔   | `.module-divider`       | 模块封面过渡页         |
| 辅助       | `.badge`, `.tag`        | 状态标签               |
| 辅助       | `.divider-h`            | 水平分割线             |

---

## 给其他 Agent 的使用说明

### OpenClaw / Hermes / 其他 CLI Agent

这些 agent 没有 Claude Code 的 `/skill` 机制，但可以：

1. **读取本文档（AGENT.md）**获取项目全貌
2. **读取 `DESIGN-SYSTEM.md`** 获取完整组件规范
3. **读取 `skills/slide-design.md`** 获取幻灯片创作完整工作流
4. **直接调用 CLI 脚本**完成构建、校验、导出

典型调用序列：

```bash
# 1. 创建课程目录
mkdir -p courses/<name>/slides

# 2. 写 course.meta.md (frontmatter + 大纲)

# 3. 写 slide-*.html 片段（参考 DESIGN-SYSTEM.md 组件）

# 4. 校验样式
node lint-slides.js <name>

# 5. 构建
node build.js <name>

# 6. 打包交付
node export.js <name>
```

### Claude Code 专属

两个 Skill，按顺序使用：

| Skill            | 定义文件                    | 职责                                     |
|------------------|-----------------------------|------------------------------------------|
| `/course-design` | `skills/course-design.md`   | 对话式引导：定位 → 成果 → 知识架构 → 写 course.meta.md |
| `/slide-design`  | `skills/slide-design.md`    | 读 course.meta.md → 逐页生成幻灯片 → build → deck.html |

完整流程：先 `/course-design` 完成大纲，再 `/slide-design <name>` 渲染。

---

## 注意事项

- `deck.html` 是**自动生成文件**，不要手动编辑，改 `course.meta.md` 或 `slides/` 后重新 build
- `courses/<name>/export/` 是**打包输出目录**，不要把它提交到 Git（已在 .gitignore 中排除，如果没有请添加）
- 添加新 CSS 组件类型时，必须同步更新 `DESIGN-SYSTEM.md`，否则 lint 会拦截使用了新 class 的幻灯片
- FontAwesome 图标已通过 `lib/fonts/fontawesome/` 离线引入，可直接在 HTML 中使用 `<i class="fa-solid fa-xxx"></i>`

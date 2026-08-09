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
├── courseflow.js         ← 统一 CLI 入口
├── build.js              ← 课程组装（courseflow build 内部调用）
├── lint-slides.js        ← 样式校验（courseflow lint 内部调用）
├── animate-slides.js     ← 入场动画批量打入/剥离（courseflow animate 内部调用）
├── export.js             ← 离线打包（courseflow export 内部调用）
├── templates/
│   └── master_template.html  ← deck.html 母版（build.js 使用）
├── .claude/skills/
│   ├── course-design/SKILL.md  ← /course-design Skill（大纲设计）
│   └── slide-design/SKILL.md   ← /slide-design Skill（幻灯片渲染）
├── shared_styles/        ← 全局设计系统 CSS（所有课程共用）
│   ├── base_layout.css
│   ├── tokens.css
│   ├── components.css
│   ├── animations.css
│   ├── themes/standard.css
│   ├── color-schemes/    ← 8 套配色方案（颜色 + 排版特化）
│   └── font-sets/        ← 8 套字体集（与配色正交，course.meta.md 的 fontset: 指定）
└── courses/
    └── <course-name>/
        ├── course.meta.md      ← 课程元数据 + 大纲（frontmatter）
        ├── slide-plan.md       ← 每页内容规划（Phase 4 产出，人审内容用）
        ├── slides/
        │   ├── slide-01.html   ← 每个文件 = 一张幻灯片 <section>
        │   ├── slide-02.html
        │   └── ...
        ├── assets/             ← 课程图片（可选）
        └── deck.html           ← 由 build 生成，勿手动编辑
```

---

## CLI 命令参考

所有命令通过统一入口 `courseflow.js` 调用（或 `npm run <cmd>`）：

```bash
node courseflow.js list                     # 列出所有课程及状态
node courseflow.js new    <name>            # 初始化新课程目录
node courseflow.js lint   <name>            # 校验幻灯片样式规范
node courseflow.js animate <name> [--strip] # 批量打入/剥离组件入场动画（不碰手写 fragment）
node courseflow.js build  <name>            # 组装生成 deck.html
node courseflow.js render <name>            # lint + build 一步完成（推荐）
node courseflow.js export <name> [outdir]   # 打包为可离线演示文件夹
node courseflow.js notes  <name>            # 导出讲师手册 handout.md（各页演讲备注）
node courseflow.js shot   <name> [--check]  # 溢出检测 + 逐页截图到 .review/（需本机 Chrome）
```

### 各命令说明

| 命令 | 说明 |
|------|------|
| `list` | 显示 courses/ 下所有课程，标注 meta/slides/deck/export 完成状态 |
| `new <name>` | 创建 courses/\<name\>/ 目录结构 + course.meta.md 模板 |
| `lint <name>` | 扫描 slide-*.html，检查 5 类违规（内联 style / 硬编码色 / 硬编码 RGB / 新字体 / 未注册 class） |
| `animate <name>` | 按组件结构批量给 slides 打入场动画 class；`--strip` 一键剥离，`--dry` 只报告。幂等，且绝不改动手写的 `fragment`（详见 CLI_MANUAL.md） |
| `build <name>` | 读 course.meta.md frontmatter + 拼接 slides/ → 生成 deck.html |
| `render <name>` | lint 通过后再 build，是日常最常用的命令 |
| `export <name>` | 生成 courses/\<name\>/export/，只含演示必需文件，双击 index.html 即可离线演示 |
| `notes <name>` | 抽取各页 h2 + aside.notes，生成讲师手册 courses/\<name\>/handout.md |
| `shot <name>` | 用本机 Chrome headless 做溢出检测并逐页截图到 .review/，供视觉自查（`--check` 只检测不截图） |

也可以通过 npm scripts：`npm run render -- openclaw_2`

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
阶段 4 学习体验  → 输出 slide-plan.md（每页页型/标题/要点），人审内容后再继续
阶段 5 视觉     → 按 plan 生成 slide-XX.html，组装并生成 deck.html
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

| 名称               | 风格描述                     |
|--------------------|------------------------------|
| `bold-signal`      | 深灰 + 高饱和橙强调（技术/工具） |
| `dark-ocean`       | 深蓝 + 柔和点缀（数据/分析）   |
| `dark-botanical`   | 近黑 + 暖棕衬线（高端质感）    |
| `creative-voltage` | 深夜蓝 + 荧光绿（创意/年轻）   |
| `swiss-modern`     | 纯白 + 红黑极简（瑞士风）      |
| `warm-sand`        | 米白底 + 紫绿点缀（商务浅色）  |
| `notebook-tabs`    | 奶油底 + 衬线粉彩（手记/轻松） |
| `standard-default` | 白底学术蓝（严肃/学术）        |

修改后重新 `node courseflow.js render <name>` 即生效，无需改任何幻灯片文件。

---

### 流程四：更换字体集

字体是**独立于配色的一根轴**。不写 `fontset` 就用配色的默认搭档；想换就在 frontmatter 里加：

```yaml
theme: dark-botanical
fontset: editorial-serif
```

可选字体集（`shared_styles/font-sets/` 目录下）：

| 名称              | 标题字体              | 气质                          | 默认配色 |
|-------------------|-----------------------|-------------------------------|----------|
| `impact-sans`     | Archivo Black + 思源黑体 | 冲击力、工具/技术培训         | bold-signal |
| `grotesk-sans`    | Archivo + 思源黑体    | 瑞士网格、理性、战略          | swiss-modern |
| `voltage-sans`    | Syne + 思源黑体       | 创意、年轻受众                | creative-voltage |
| `modern-sans`     | 思源黑体              | 现代中性，纯中文场景最稳      | dark-ocean / warm-sand / standard-default |
| `editorial-serif` | 思源宋体              | 编辑感、克制、顾问气质        | —（skillnode 设计系统同款）|
| `garamond-serif`  | Cormorant + 思源宋体  | 优雅衬线、高端质感            | dark-botanical |
| `didone-serif`    | Bodoni Moda + 思源宋体 | 高对比衬线、时装/品牌感      | notebook-tabs |
| `system`          | 系统字体              | 零下载，快速预览              | — |

正文一律思源黑体（`system` 除外）。配对规则与铁律见 DESIGN-SYSTEM.md「字体」。

---

## 新建课程文件结构

### `course.meta.md` 格式

```yaml
---
title: "课程标题"
template: standard
theme: bold-signal
fontset: impact-sans      # 可省略，省略时用配色的默认字体集
audience: "目标受众描述"
positioning: "核心价值主张（1句话）"
outcomes:
  - { do: "动词开头的可观察行为", bloom: apply, success: "成功标准（怎样算达成）" }
  - { do: "动词开头的可观察行为", bloom: analyze, success: "成功标准" }
  - { do: "动词开头的可观察行为", bloom: create, success: "成功标准" }
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

> 违反 1-4 条将被 lint-slides.js 拦截（exit 1）；第 6 条由 lint 输出密度警告（不阻断）；5、7、8 条需人工检查。

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
3. **读取 `.claude/skills/slide-design/SKILL.md`** 获取幻灯片创作完整工作流
4. **直接调用 CLI 脚本**完成构建、校验、导出

典型调用序列：

```bash
# 1. 初始化课程目录
node courseflow.js new <name>

# 2. 编辑 course.meta.md（frontmatter + 大纲）

# 3. 写 slide-*.html 片段（参考 DESIGN-SYSTEM.md 组件）

# 4. 校验 + 构建
node courseflow.js render <name>

# 5. 打包交付
node courseflow.js export <name>
```

### Claude Code 专属

两个 Skill，按顺序使用：

| Skill            | 定义文件                    | 职责                                     |
|------------------|-----------------------------|------------------------------------------|
| `/course-design` | `.claude/skills/course-design/SKILL.md` | 对话式引导：定位 → 成果 → 知识架构 → 写 course.meta.md |
| `/slide-design`  | `.claude/skills/slide-design/SKILL.md`  | 读 course.meta.md → 逐页生成幻灯片 → build → deck.html |

完整流程：先 `/course-design` 完成大纲，再 `/slide-design <name>` 渲染。

---

## 注意事项

- `deck.html` 是**自动生成文件**，不要手动编辑，改 `course.meta.md` 或 `slides/` 后重新 build
- `courses/<name>/export/` 是**打包输出目录**，不要把它提交到 Git（已在 .gitignore 中排除，如果没有请添加）
- 添加新 CSS 组件类型时，必须同步更新 `DESIGN-SYSTEM.md`，否则 lint 会拦截使用了新 class 的幻灯片
- FontAwesome 图标已通过 `lib/fonts/fontawesome/` 离线引入，可直接在 HTML 中使用 `<i class="fa-solid fa-xxx"></i>`
- template 当前只有 `standard` 一套（V1 的 modern.css 已删除，其中有价值的 workflow / icon-card-grid 组件已迁入 `components.css`）；如需第二套版式风格，应基于 V2 令牌体系新建并在 DESIGN-SYSTEM.md 登记

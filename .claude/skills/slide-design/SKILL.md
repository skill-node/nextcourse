---
name: slide-design
description: 读取 courses/<name>/course.meta.md，按 Merrill 第一原理逐页设计幻灯片并生成 deck.html。需要一个课程名参数。
---

# /slide-design — CourseFlow V2 Slide Design Skill

## 触发方式

```
/slide-design <课程名>
```

读取 `courses/<课程名>/course.meta.md`，按 **Merrill 第一性原理**（Hook→Concept→Demo→Practice→Takeaway）为每个模块逐页设计 slide，输出到 `courses/<课程名>/slides/slide-XX.html`，最后运行 `node build.js <课程名>` 生成 `deck.html`。

**两阶段、两道人审：** Phase 4 先产出 `slide-plan.md`（纯内容，人审），确认后 Phase 5 才写 HTML（视觉，人审）。**不要跳过 Phase 4 直接写 HTML**——内容问题在 plan 里改一行字，在 HTML 里改要重排版。

---

## Phase 4：学习体验设计 → slide-plan.md（内容审阅关卡）

读 `course.meta.md` 的大纲，每个模块按此结构设计页面：

| 页型 | 作用 | 设计要求 |
|---|---|---|
| **Hook** | 引发问题意识或好奇 | 用问句或强烈对比，≤30 字 |
| **Concept** | 核心概念 + 常见误解纠正 | 单页单概念；误解用 callout--warning |
| **Demo** | 具体案例或流程演示 | 优先用 case-study / workflow / timeline |
| **Practice** | 学员动手实操的引导 | checklist 或 pill-list；指令明确 |
| **Takeaway** | 模块最核心的一句话 | key-takeaway 组件；≤3 条要点 |

**固定页面：**
- 第 1 页 封面：title + positioning
- 第 2 页 课程概览：**直接由 frontmatter 的 `outcomes` 生成**——每条成果一行（do + success），让学员开课即知道"学完能做什么、怎样算学会"
- 倒数第 2 页 学习路径/下一步；最后 1 页 致谢结束

**落盘 `courses/<课程名>/slide-plan.md`**，每页一个条目：

```markdown
## slide-03 [Hook] 你的 AI 工具，真的用"对"了吗？
- 要点: 效率天花板的 3 个信号（各 ≤20 字）
- 组件倾向: stats-wall 或 quote-slide
- 备注要点: 现场提问互动，请学员举手
```

**写完 slide-plan.md 后停下来，请用户审阅内容**（页数、顺序、每页要点、案例是否贴合）。用户确认或修改后才进入 Phase 5。

---

## Phase 5：视觉呈现（B 档选型规则）

### 选组件的决策树

```
内容类型?
  ├─ 单一概念定义        → .concept-card
  ├─ 好坏/多方案对比      → .vs-box.vs-box--columns  (2栏好坏 / 3栏加 .vs-neutral)
  ├─ 流程步骤 ≤6         → .workflow
  ├─ 时间顺序 4~6节点     → .timeline
  ├─ 2×2 关系矩阵        → .quadrant
  ├─ 数字冲击 3~4个       → .stats-wall
  ├─ 叙事案例            → .case-study
  ├─ 引用/金句           → .quote-slide
  ├─ 多项要点 3~5条       → .pill-list  或  .check-list
  ├─ 图标分类 3~4项       → .icon-card-grid
  ├─ 多方案特性表格       → .table-compare
  ├─ 模块小结            → .key-takeaway
  ├─ 左文右图            → .layout-text-image  (右侧必须有真实图片)
  ├─ 两栏等重内容         → .grid-2
  ├─ 三栏卡片            → .grid-3
  ├─ 章节分隔            → section.module-N > .module-divider
  └─ 补充说明/提示        → .callout  (.callout--tip / --warning / --insight)
```

### 题材域组件倾向（rubric ⑦ 题材贴合的依据）

| 题材 | 高频组件 | 慎用 |
|---|---|---|
| 领导力 / 软技能 | `.case-study` `.quote-slide` `.quadrant` `.vs-box` | 流程图、代码块——软技能少有标准流程 |
| AI / 技术工具 | `.workflow` `.timeline` `.check-list` `.stats-wall` | 长引用——技术课要"看得见操作" |
| HR / 制度合规 | `.vs-box`（对/错边界） `.table-compare` `.callout--warning` | 夸张视觉冲击——合规内容要克制 |
| 数据 / 分析 | `.stats-wall` `.table-compare` `.quadrant` | 纯文字页——数据课让数字说话 |
| 创意 / 设计 | `.layout-text-image` `.vs-box`（before/after） | 密集表格 |

### 铁律（lint-slides.js 会自动检查）

1. **只用登记的 class** —— 所有 class 必须在 `DESIGN-SYSTEM.md` 中有定义
2. **只用 `var(--*)` 令牌** —— 颜色、阴影、间距全部引用令牌
3. **禁止 `style=` 属性** —— 任何内联样式都是违规
4. **禁止 `<style>` 块内写死颜色** —— 不允许 `#xxx` / `rgb()` 出现
5. **禁止声明 `font-family`** —— 用 `var(--font-display)` 或 `var(--font-body)`

### 组件使用规则（lint 不检查但必须遵守）

6. **`.concept-card__example` 只用于真正的示例/类比**
   - 补充说明、典型动作、核心模式等"说明文字"→ 改用 `.highlight-box`
   - "示例"标签**在 HTML 里显式写** `<strong>示例：</strong>`，CSS 不自动插入

7. **`.key-takeaway__next` 的"下一步 →"需在 HTML 里显式写**
   - 正确: `<div class="key-takeaway__next">下一步 → 实操任务</div>`
   - 错误: `<div class="key-takeaway__next">实操任务</div>`（CSS 不自动加前缀）

8. **同一 section 内的顶层子元素已有 `gap: var(--content-gap)` 自动间距**
   - 不需要给每个组件单独加 margin；但组件内部的子元素间距需看各组件定义

### 密度纪律（保证 slide 感）

- 一页一观点
- H2 标题 ≤15 字
- 正文条目 ≤6 个
- 每个条目 ≤20 字
- 禁止长段落（段落 >3 行时改为 ul/组件）
- 演讲备注放在 `<aside class="notes">...</aside>`（不占页面空间）

---

## 工作流程

```
1. 读 course.meta.md
2. 按大纲确定页数和顺序 (封面 + 概览 + 模块 × 5页 + 结尾, 通常 20-30页)
3. [Phase 4] 写 slide-plan.md → 用户审阅内容 → 确认后继续
4. [Phase 5] 按 plan 逐页写 slides/slide-XX.html (从 01 开始，两位数补零)
5. 每写 5 页, 运行: node lint-slides.js <课程名>
   → 有违规立即修复, 再继续
6. 全部写完后: node build.js <课程名>
7. 视觉自查: node shot.js <课程名>
   → 溢出报告有问题页立即修复
   → 逐张查看 .review/slide-XX.png, 按下方 rubric 自我批判并修正, 再交用户
8. 告知用户打开 courses/<课程名>/deck.html 审阅
9. 根据用户反馈定位问题页, 修改对应 slide-XX.html（内容变化同步回 slide-plan.md）
10. 重新 node build.js <课程名>
11. 效果好的自定义布局 → 沉淀到 shared_styles/components.css + DESIGN-SYSTEM.md
```

---

## slide-XX.html 格式规范

每个文件是**一个 `<section>` 元素**（Reveal.js 的一页），不含 `<html>/<head>/<body>` 等外壳：

```html
<section>
  <h2>页面标题（≤15 字）</h2>
  <!-- B 档组件 -->
  <div class="concept-card">
    <h3 class="concept-card__term">核心术语</h3>
    <p class="concept-card__def">定义...</p>
  </div>
  <aside class="notes">演讲备注，讲师才能看到</aside>
</section>
```

章节分隔页（用彩色背景）：
```html
<section class="module-N">
  <div class="module-divider">
    <span class="module-divider__label">模块 0N</span>
    <h2 class="module-divider__title">模块标题</h2>
    <p class="module-divider__hook">引发好奇的一句问句...</p>
    <span class="module-divider__number" aria-hidden="true">0N</span>
  </div>
</section>
```

---

## 视觉审阅 Rubric（用户打开 deck.html 时对照）

| # | 检查项 | 通过标准 |
|---|---|---|
| ① | 不溢出/不滚动 | 所有内容在一屏内，无滚动条 |
| ② | 色彩对比 | 文字与背景对比清晰，无撞色 |
| ③ | 层级清晰 | 标题 > 副标题 > 正文，一眼分辨 |
| ④ | 留白/对齐 | 内容不贴边，组件间有呼吸感 |
| ⑤ | 审美一致 | 全 deck 使用同一套配色主题 |
| ⑥ | Slide 感 | 稀疏、大字、一屏一观点；不像网页 |
| ⑦ | 题材贴合 | 风格与 AI/HR 课程内容匹配 |

用户反馈问题 → 定位 `slide-XX.html` → 修改 → `node build.js` → 重新审阅。

---

## 参考文档

- 完整组件 HTML 片段 + do/don't: `DESIGN-SYSTEM.md`
- 设计令牌: `shared_styles/tokens.css`
- 组件 CSS: `shared_styles/components.css`
- 颜色方案: `shared_styles/color-schemes/*.css`
- 样式检查: `node lint-slides.js <课程名>`
- 组装输出: `node build.js <课程名>`

---
name: nextcourse-slides
description: 把已有的课程大纲变成幻灯片——读 course.meta.md，按 Merrill 第一原理逐页设计，输出 slides/slide-XX.html 并构建 deck.html。当用户说"做课件""做 PPT""做幻灯片""把大纲变成课件""生成 deck""课件排版""这页太挤了""换个配色""重新构建课件"，或已经有 course.meta.md 要出片时，用这个技能。需要一个课程名参数。还没有课程大纲的，先用 nextcourse-design。
---

# nextcourse-slides — 幻灯片设计

读取 `courses/<课程名>/course.meta.md`，按 **Merrill 第一性原理**（Hook→Concept→Demo→Practice→Takeaway）为每个模块逐页设计 slide，输出到 `courses/<课程名>/slides/slide-XX.html`，最后 `nextcourse build <课程名>` 生成 `deck.html`。

**两阶段、两道人审：** Phase 4 先产出 `slide-plan.md`（纯内容，人审），确认后 Phase 5 才写 HTML（视觉，人审）。**不要跳过 Phase 4 直接写 HTML** —— 内容问题在 plan 里改一行字，在 HTML 里改要重排版。

## 开工前：确认引擎在

```bash
nextcourse doctor
```

没这个命令就装：`npm i -g nextcourse`（或每次用 `npx -y nextcourse`）。doctor 报出的**工作目录**下面必须能找到 `courses/<课程名>/`，找不到就先 `cd` 到课程所在的目录。

如果课程根存在 `course.compose.json`，先运行 `nextcourse compose <课程名> --dry-run` 看清来源与版本。
`.build/<recipe>/slides/` 是生成物，禁止直接编辑。原样引用页回到提供方源文件修改；
只改当前课程时写入本地页或变体并更新 compose，再正式 `compose` / `render`。
`nextcourse animate` 也不会修改组合产物。

## 对话语言

**跟随用户的语言**，本文档是中文写的不代表对话和产出要用中文。幻灯片正文、讲师备注（`aside class="notes"`）、`slide-plan.md` 一律跟随 `course.meta.md` 的语言；class 名和组件名是设计系统的一部分，永远是英文。

---

## Phase 4：学习体验设计 → slide-plan.md（内容审阅关卡）

### 先看有没有蓝图

```bash
ls courses/<课程名>/course.blueprint.md
```

**存在就必须读它**（M / L 档内训课）。蓝图第五节的模块清单表给了每个模块的**时长 / 教学活动 / 产出物 / 覆盖成果**，这四样直接决定 slide 怎么排：

| 蓝图字段 | 落到 slide 上 |
|---|---|
| 教学活动 + 产出物 | 该模块必须有一张 **Activity 页**（`.activity-card`），内容与蓝图一字不差 |
| 时长 | 决定这个模块给几页（90 min 的模块给 5 页讲授页是排不下的） |
| 覆盖成果 | 模块小结页的落点要对得上这条 outcome 的 `do` |
| 全课的 evidence | 结尾前加一张 **Assessment 页**（`.rubric-table`），讲清结营考核 |

没有蓝图（S 档分享课）就按 `course.meta.md` 的大纲走，**不要**硬造 Activity / Assessment 页 —— 30 分钟的分享课没有考核。

### 页型

| 页型 | 作用 | 设计要求 |
|---|---|---|
| **Hook** | 引发问题意识或好奇 | 用问句或强烈对比，≤30 字 |
| **Concept** | 核心概念 + 常见误解纠正 | 单页单概念；误解用 callout--warning |
| **Demo** | 具体案例或流程演示 | 优先用 case-study / workflow / timeline |
| **Practice** | 学员动手实操的引导 | checklist 或 pill-list；指令明确 |
| **Activity**〔M/L〕 | 课堂活动的正式指令 | `.activity-card`：活动名 / 时间 / 分组 / 交付物 / 评分点，来自蓝图 |
| **Assessment**〔M/L〕 | 结营考核说明 | `.rubric-table`：3–4 个维度 × 2–3 个等级，来自 `package/3_rubric.md` |
| **Takeaway** | 模块最核心的一句话 | key-takeaway 组件；≤3 条要点 |

**Practice 与 Activity 的分工**：Practice 是「跟着我做一遍」的引导（讲师带），Activity 是「现在你们分组做，20 分钟后交」的正式任务（学员做）。一个模块里两者可以都有，但**只有 Activity 页要写全五要素**。

**Activity 页的完整口播指令写进 `aside.notes`，不上屏。** 屏幕上只留任务、时间、分组、交付物、评分点；「怎么开场、怎么巡场、怎么收尾」是讲师手册的内容，`nextcourse package` 会从蓝图另行生成。

**固定页面：**
- 第 1 页 封面：title + positioning
- 第 2 页 课程概览：**直接由 frontmatter 的 `outcomes` 生成** —— 每条成果一行（do + success）；M/L 档再带上 `evidence`，让学员开课就知道「学完能做什么、**怎样算学会、拿什么判定**」
- 倒数第 2 页 学习路径 / 下一步；最后 1 页 致谢结束

**落盘 `courses/<课程名>/slide-plan.md`**，每页一个条目：

```markdown
## slide-03 [Hook] 你的 AI 工具，真的用"对"了吗？
- 要点: 效率天花板的 3 个信号（各 ≤20 字）
- 组件倾向: stats-wall 或 quote-slide
- 备注要点: 现场提问互动，请学员举手
```

**写完 slide-plan.md 后停下来，请用户审阅内容**（页数、顺序、每页要点、案例是否贴合）。用户确认或修改后才进入 Phase 5。

---

## Phase 5：视觉呈现

**动手写 HTML 前先读 `references/component-picker.md`** —— 选组件的决策树、lint 查不到的组件使用规则、密度纪律都在那里。

### 铁律（`nextcourse lint` 会自动检查）

1. **只用登记的 class** —— 所有 class 必须在设计系统中有定义（`nextcourse docs design-system`）
2. **只用 `var(--*)` 令牌** —— 颜色、阴影、间距全部引用令牌
3. **禁止 `style=` 属性** —— 任何内联样式都是违规
4. **禁止 `<style>` 块内写死颜色** —— 不允许 `#xxx` / `rgb()` 出现
5. **禁止声明 `font-family`** —— 用 `var(--font-display)` 或 `var(--font-body)`

---

## 工作流程

```
1. 读 course.meta.md（M/L 档同时读 course.blueprint.md）
2. 按大纲确定页数和顺序 (封面 + 概览 + 模块 × 5页 + 结尾, 通常 20-30页)
   M/L 档另加: 每模块 1 张 Activity 页 + 全课 1 张 Assessment 页
3. [Phase 4] 写 slide-plan.md → 用户审阅内容 → 确认后继续
4. [Phase 5] 读 references/component-picker.md,
   按 plan 逐页写 slides/slide-XX.html (从 01 开始，两位数补零)
5. 每写 5 页, 运行: nextcourse lint <课程名>
   → 有违规立即修复, 再继续
6. 全部写完后: nextcourse build <课程名>
   M/L 档再跑一次: nextcourse check <课程名>
   → 页数与大纲对不上、模块缺 Activity 页都会在这里报出来
7. 视觉自查: nextcourse shot <课程名>
   → 溢出报告有问题页立即修复
   → 逐张查看 .review/slide-XX.png, 按下方 rubric 自我批判并修正, 再交用户
8. 告知用户打开 courses/<课程名>/deck.html 审阅
9. 根据用户反馈定位问题页, 修改对应 slide-XX.html（内容变化同步回 slide-plan.md）
10. 重新 nextcourse build <课程名>
11. 要发给学员时: nextcourse pdf <课程名>（配色版式原样保留；别让用户自己在浏览器里打印）
    学员要打印到纸上加 --theme print-light；不外发的页在 <section> 上写 data-print="off"
```

> 第 5–7 步的 lint / build / check / shot 也可以一步走完：`nextcourse render <课程名>` = lint + build。

---

## slide-XX.html 格式规范

每个文件是**一个 `<section>` 元素**（Reveal.js 的一页），不含 `<html>/<head>/<body>` 等外壳：

```html
<section>
  <h2>页面标题（≤15 字）</h2>
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
| ⑦ | 题材贴合 | 风格与课程题材匹配（`nextcourse docs domains`） |

用户反馈问题 → 定位 `slide-XX.html` → 修改 → `nextcourse build` → 重新审阅。

---

## 参考文档

| 要什么 | 怎么拿 |
|---|---|
| 完整组件 HTML 片段 + do/don't | `nextcourse docs design-system` |
| 题材域组件倾向 | `nextcourse docs domains` |
| 选组件 / 密度纪律 | `references/component-picker.md` |
| 目录结构与硬规则总览 | `nextcourse docs agent` |
| 全部命令 | `nextcourse docs cli` |

> 沉淀新组件要改引擎自带的 `shared_styles/components.css` 和设计系统文档 —— 那是 NextCourse 仓库里的事，用 npm 装的用户改不了自己那份（会被下次升级覆盖）。有好布局请提 issue 或 PR 回 skill-node/nextcourse。

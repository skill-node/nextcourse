# NextCourse — Agent Reference

NextCourse 是一个以 **AI-Native 工作流为核心的课程开发工具**。
输入：一句话主题或一份培训需求 → 输出：可在浏览器中全屏演示的 Reveal.js HTML 幻灯片课程，
以及 M/L 档的整套交付包（讲师手册 / 学员手册 / 量规 / 评估方案等 8 份文档 + 一张封面目录）。

整套流程完全 CLI 驱动，任何 agent（Claude Code / OpenClaw / Hermes / 命令行）均可调用。

> **本文档只有中文版**（约 300 行；连同 `DESIGN-SYSTEM.md` 共约 1300 行，全译是另一个量级的工程）。
> 面向使用者的入口是 [README.md](./README.md)（英文）/ [README.zh-CN.md](./README.zh-CN.md)（中文），
> CLI 参考两种语言都有：[CLI_MANUAL.md](./CLI_MANUAL.md) / [CLI_MANUAL.en.md](./CLI_MANUAL.en.md)。
>
> **语言约定：** 本项目的提示词和文档是中文写的，但**对话与产出跟随用户的语言**。
> 用户用英文提问，就全程英文，`course.meta.md` 与幻灯片正文也用英文
> （字段名、CSS class、组件名永远是英文，不随语言变）。
>
> 项目为 MIT 协议（[LICENSE](./LICENSE)）；vendored 的 Reveal.js / 字体 / FontAwesome
> 各有协议，见 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。
> 改动 `lib/` 或 `export.js` 的拷贝逻辑时先读那一份。

---

## 目录结构

```
nextcourse/
├── AGENTS.md             ← 约定俗成的 agent 路牌（英文，薄壳），指向本文档
├── AGENT.md              ← 当前文档（agent 入口）
├── DESIGN-SYSTEM.md      ← 完整组件参考手册（创作幻灯片前必读）
├── nextcourse.js         ← 统一 CLI 入口
├── build.js              ← 课程组装（nextcourse build 内部调用）
├── check.js              ← 教学设计闭环校验（nextcourse check 内部调用）
├── package.js            ← 交付包生成（nextcourse package 内部调用）
├── render-md.js          ← 受控子集 md→html 渲染器（零依赖，package --render 用）
├── course-model.js       ← meta / blueprint / slides 解析层（check 与 package 共用）
├── lint-slides.js        ← 样式校验（nextcourse lint 内部调用）
├── animate-slides.js     ← 入场动画批量打入/剥离（nextcourse animate 内部调用）
├── export.js             ← 离线打包（nextcourse export 内部调用）
├── templates/
│   ├── master_template.html  ← deck.html 母版（build.js 使用）
│   └── course.blueprint.md   ← 设计蓝图模板（M/L 档，new --scale 复制）
├── paths.js              ← 两个根：PKG_ROOT（引擎资产）/ WORK_ROOT（用户课程）
├── docs/domains.md       ← 题材域适配表（nextcourse docs domains）
├── .claude/skills/
│   ├── README.md                 ← 四个技能的安装说明（含各 runtime 目录对照）
│   ├── nextcourse/               ← 总控技能：分诊 + 路由
│   ├── nextcourse-design/        ← Phase 0–4 大纲设计（含 references/）
│   ├── nextcourse-delivery/      ← Phase 5–8 交付层（含 references/）
│   └── nextcourse-slides/        ← 幻灯片渲染（含 references/）
├── shared_styles/        ← 全局设计系统 CSS（所有课程共用）
│   ├── base_layout.css
│   ├── tokens.css
│   ├── components.css
│   ├── animations.css
│   ├── themes/standard.css
│   ├── color-schemes/    ← 8 套配色方案（颜色 + 排版特化）
│   └── font-sets/        ← 8 套字体集（与配色正交，course.meta.md 的 fontset: 指定）
├── examples/             ← 随仓库分发的示例课程（脱敏版，入库；只放源，不放构建产物）
│   ├── ai-agent-insurance/           ← S 档样例：60 min / 29 页
│   └── ai-agent-insurance-workshop/  ← M 档样例：1 天 / 31 页 + 蓝图 + 交付包
└── courses/              ← 用户自己的课程（整个目录 gitignore，不入库）
    └── <course-name>/
        ├── course.meta.md      ← 构建契约：元数据 + 页面级大纲（build.js 只认它）
        ├── course.blueprint.md ← 设计层真相（M/L 档；模块清单以它为准）
        ├── package/            ← 交付包（M/L 档；md 为源，html/ 为客户交付物）
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

所有命令通过统一入口 `nextcourse.js` 调用（或 `npm run <cmd>`）：

```bash
nextcourse list                     # 列出所有课程及状态
nextcourse new    <name> [--scale M|L]  # 初始化新课程目录（不带 --scale = S 档）
nextcourse check  <name>            # 教学设计闭环校验（成果 × 模块 × 证据）
nextcourse lint   <name>            # 校验幻灯片样式规范
nextcourse animate <name> [--strip] # 批量打入/剥离组件入场动画（不碰手写 fragment）
nextcourse build  <name>            # 组装生成 deck.html
nextcourse render <name>            # lint + build 一步完成（推荐）
nextcourse package <name> [--render] [--force]   # 生成交付包（M/L 档）
nextcourse export <name> [outdir] [--with-package]  # 打包为可离线演示文件夹
nextcourse notes  <name>            # 导出讲师手册 handout.md（各页演讲备注）
nextcourse pdf    <name> [out.pdf]  # 导出 PDF：一页一张幻灯片，配色版式原样保留（需本机 Chrome）
nextcourse shot   <name> [--check]  # 溢出检测 + 逐页截图到 .review/（需本机 Chrome）
```

### 各命令说明

| 命令 | 说明 |
|------|------|
| `list` | 显示 courses/ 下所有课程，标注 meta/slides/deck/export 完成状态 |
| `new <name>` | 创建 courses/\<name\>/ 目录结构 + course.meta.md 模板；`--scale M\|L` 另生成 course.blueprint.md 并在 frontmatter 补 scale/duration/class_size |
| `check <name>` | 教学逻辑校验：闭环（每条 outcome 有 module 教到 + evidence 测到）、蓝图↔大纲↔slides 一致性、Bloom 深度、活动落地（有活动的模块必须有 Activity 页）、时长核算、M/L 章节完整度；并生成 package/7_alignment.md 对齐矩阵。有 error 时 exit 1 |
| `lint <name>` | 扫描 slide-*.html，检查 5 类违规（内联 style / 硬编码色 / 硬编码 RGB / 新字体 / 未注册 class） |
| `animate <name>` | 按组件结构批量给 slides 打入场动画 class；`--strip` 一键剥离，`--dry` 只报告。幂等，且绝不改动手写的 `fragment`（详见 CLI_MANUAL.md） |
| `build <name>` | 读 course.meta.md frontmatter + 拼接 slides/ → 生成 deck.html |
| `render <name>` | lint 通过后再 build，是日常最常用的命令 |
| `package <name>` | 汇总蓝图 + 大纲 + slide 备注，生成 package/ 交付包（讲师手册 / 学员手册 / 评估方案 / 量规 / 教学设计 / 内容开发 / 行动承诺 / 数据包说明）。`--render` 另出 package/html/（客户交付物，封面 0_index.html），`--force` 覆盖已有 md（默认不覆盖）。文件名带交付序号 `1_`…`8_`（排序即客户的阅读动线，序号定义在 package.js 的 DOCS），每份文档 h1 与 &lt;title&gt; 只写功能名、课程名走小字副标题。S 档会被拒绝 |
| `export <name>` | 生成 courses/\<name\>/export/，只含演示必需文件，双击 index.html 即可离线演示；`--with-package` 把 package/html/ 一起打进去 |
| `notes <name>` | 抽取各页 h2 + aside.notes，生成讲师手册 courses/\<name\>/handout.md |
| `pdf <name>` | 用本机 Chrome headless 把 deck.html 印成 PDF，一页一张幻灯片、配色与版式原样保留，默认落在 courses/\<name\>/deck.pdf。发给学员看的课件用它，**别让用户在浏览器里 Cmd+P**——reveal 自带的 A4 打印样式会把整套配色刷成白底黑字。`--theme print-light` 出学员可打印的纸面浅色版（输出名自动带后缀，不覆盖授课版）；`--size WxH` 换纸张尺寸（默认 1600x900）；`--keep` 留下可手改的 deck.print.html，配 `--source <file>` 从手改稿打印。slide 的 `<section>` 上写 `data-print="off"` 可让该页不进 PDF（演示页 / 敏感案例），页码自动连号 |
| `shot <name>` | 用本机 Chrome headless 做溢出检测并逐页截图到 .review/，供视觉自查（`--check` 只检测不截图） |

也可以通过 npm scripts：`npm run render -- openclaw_2`

---

## 课程创作工作流

### 流程一：从零开始设计新课程（推荐路径）

**Step 1 — 大纲设计（对话式）**

```
nextcourse-design
```

通过对话完成五个阶段，最终生成 `course.meta.md`（M/L 档另出 `course.blueprint.md`）：

```
阶段 0 规格诊断  → 先定档位（S/M/L），再问学员水平、业务痛点、本期不做什么
阶段 1 定位     → 明确受众、情境、核心价值主张
阶段 2 目标体系  → Bloom 成果 3-5 条；M/L 档追加柯氏评估（默认只到 L2）
阶段 3 整体设计  → 形态、总时长、分组、一日旅程、认知负荷节奏    【M/L 档】
阶段 4 模块架构  → 模块 = 主题 + 时长 + 教学活动 + 产出物 + 覆盖成果 + 页数
```

**档位决定后面走多远。** S 档（默认，30–90 分钟分享）在阶段 0 只问一个问题就进阶段 1，
跳过阶段 3，行为与升级前完全一致；M/L 档才走全套。

**Step 1b — 交付层设计（仅 M/L 档，对话式）**

```
nextcourse-delivery <course-name>
```

先读现状（meta + blueprint + `nextcourse check`），**只补缺的阶段**，不重问已经定过的事：

```
阶段 5 教学方法与互动设计  → 每个模块的活动指令：分组 / 时间盒 / 交付物 / 讲师站位
阶段 6 评估方案          → 默认直接给 L1 问卷 + L2 考核与量规；L3/L4 问过再加
阶段 7 内容开发计划       → SME 访谈提纲、案例库、数据包脱敏规则、排期与责任人
阶段 8 运营 / TTT / 路线图 / 待确认项                              【L 档】
```

产出写进蓝图六~十一节，然后 `nextcourse package <name> --render` 交出整包。

**Step 1c — 闭环校验（M/L 档）**

```
nextcourse check <course-name>
```

error 必须清零再进入幻灯片阶段——大纲阶段改一行字，slide 阶段要重排版。

**Step 2 — 幻灯片渲染**

```
nextcourse-slides <course-name>
```

读取 `course.meta.md`（M/L 档同时读 `course.blueprint.md`），按 Merrill 第一原理逐页生成
HTML 片段，自动 build：

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

另有 `print-light`：**只给 `nextcourse pdf --theme print-light` 用**的纸面配色（纯白、无阴影、
模块封面留白），不进展板，也不要写进 `course.meta.md` 的 `theme:`。

修改后重新 `nextcourse render <name>` 即生效，无需改任何幻灯片文件。

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
| 活动指令   | `.activity-card`        | 练习页：任务/时间/分组/交付物/评分点 |
| 考核量规   | `.rubric-table`         | 结营考核说明：维度 × 等级，达标列打底色 |
| 辅助       | `.badge`, `.tag`        | 状态标签               |
| 辅助       | `.divider-h`            | 水平分割线             |

---

## 两个根：引擎在哪，课程在哪

从 V4 起 NextCourse 可以装成 npm 包，在用户自己的任意目录里用。所以「引擎自带的东西」
和「用户的课程」是两个不同的根，定义在 `paths.js`：

| 根 | 是什么 | 谁读它 |
|---|---|---|
| `PKG_ROOT` | 引擎安装位置：`lib/` `shared_styles/` `templates/` `docs/` 内置文档 | build / lint / package / export / theme-gallery |
| `WORK_ROOT` | 用户课程：`courses/<name>/`。默认取**调用时的 cwd** | 所有读写课程的地方 |

`NEXTCOURSE_HOME` 可以把 `WORK_ROOT` 钉到一个固定工作区。跑 `nextcourse doctor`
会把两个根都报出来 —— 「课程怎么不见了」几乎都是站错目录。

在仓库根目录里跑时 `WORK_ROOT` 就是仓库根，`courses/<name>/` 与 V3 是同一个路径，
所以 clone 用法一字未变。

`deck.html` 里指向引擎资产的前缀由 `build.js` 按 `{{ASSET_BASE}}` 现算：课程在仓库里
算出来是 `../..`，隔得远就退成绝对路径。`export` 会把这个前缀统一抹成 `./`。

---

## 给其他 Agent 的使用说明

### 支持 Agent Skills 的 runtime

Claude Code / Codex / Cursor / OpenCode / WorkBuddy 等都读标准 `SKILL.md`。四个技能：

| 技能 | 定义文件 | 职责 |
|---|---|---|
| `nextcourse` | `.claude/skills/nextcourse/SKILL.md` | 总控台：分诊用户卡在哪一环，路由到下面三个，串多步骤工作流 |
| `nextcourse-design` | `.claude/skills/nextcourse-design/SKILL.md` | 对话式引导：规格诊断 → 定位 → 目标体系 → 整体设计 → 模块架构 → 写 course.meta.md（+ 蓝图一~五节） |
| `nextcourse-delivery` | `.claude/skills/nextcourse-delivery/SKILL.md` | **M/L 档**：教学互动 → 评估方案 → 内容开发 → 补蓝图六~十一节 → 生成 package/ |
| `nextcourse-slides` | `.claude/skills/nextcourse-slides/SKILL.md` | 读 course.meta.md（+ 蓝图）→ 逐页生成幻灯片 → build → deck.html |

完整流程：
- **S 档**：`nextcourse-design` → `nextcourse-slides <name>`
- **M/L 档**：`nextcourse-design` → `nextcourse-delivery <name>` → `check` → `nextcourse-slides <name>` → `package --render`

方法论参考放在各技能的 `references/`（渐进加载，用到才读）：
`nextcourse-design/references/` 有 `bloom.md`、`kirkpatrick.md`、`output-templates.md`；
`nextcourse-delivery/references/` 有 `kirkpatrick.md`（柯氏指标写法与题库）、
`facilitation.md`（互动手法库）、`content-dev.md`（SME 访谈、案例卡、脱敏规则）；
`nextcourse-slides/references/component-picker.md` 是组件决策树与密度纪律。

安装说明见 `.claude/skills/README.md`。

### 不支持 Skills 的 CLI Agent

没有技能机制也能用，直接读文档 + 调 CLI：

1. **`nextcourse docs agent`** —— 本文档，项目全貌
2. **`nextcourse docs design-system`** —— 完整组件规范
3. **`nextcourse docs domains`** —— 题材域适配表
4. **读 `.claude/skills/nextcourse-slides/SKILL.md`** —— 幻灯片创作完整工作流
5. **直接调用 CLI** 完成构建、校验、导出

典型调用序列（先 `cd` 到你想放课程的目录）：

```bash
# 0. 自检，顺便确认课程会落在哪
nextcourse doctor

# 1. 初始化课程目录（企业内训加 --scale M，会一并生成设计蓝图）
nextcourse new <name> [--scale M]

# 2. 编辑 course.meta.md（frontmatter + 大纲）
#    M/L 档同时填 course.blueprint.md 一~五节，模块清单表的列名不要改

# 3. 教学逻辑校验（M/L 档，error 必须清零）
nextcourse check <name>

# 4. 写 slide-*.html 片段（组件参考 nextcourse docs design-system）

# 5. 校验 + 构建
nextcourse render <name>

# 6. 生成交付包（M/L 档）
nextcourse package <name> --render

# 7. 打包交付
nextcourse export <name> [--with-package]
```

---

## 注意事项

- `deck.html` 是**自动生成文件**，不要手动编辑，改 `course.meta.md` 或 `slides/` 后重新 build
- `courses/<name>/export/` 是**打包输出目录**，不要把它提交到 Git（已在 .gitignore 中排除，如果没有请添加）
- 添加新 CSS 组件类型时，必须同步更新 `DESIGN-SYSTEM.md`，否则 lint 会拦截使用了新 class 的幻灯片
- FontAwesome 图标已通过 `lib/fonts/fontawesome/` 离线引入，可直接在 HTML 中使用 `<i class="fa-solid fa-xxx"></i>`
- template 当前只有 `standard` 一套（V1 的 modern.css 已删除，其中有价值的 workflow / icon-card-grid 组件已迁入 `components.css`）；如需第二套版式风格，应基于 V2 令牌体系新建并在 DESIGN-SYSTEM.md 登记

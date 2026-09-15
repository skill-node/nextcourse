# NextCourse CLI 操作手册

> [English version →](./CLI_MANUAL.en.md)

## 快速回答

**修改 slide HTML 后，重建查看效果的命令是：**
```bash
npm run render <course-name>
# 或
nextcourse render <course-name>
```

---

## 完整命令参考

### 基础命令

#### `list` — 列出所有课程及状态
```bash
npm run list
```
显示项目中所有课程的概览：
- 是否有课程大纲 (`course.meta.md`)
- 幻灯片数量
- 是否已生成 `deck.html`
- 是否已打包导出

**示例输出：**
```
NextCourse — 课程列表
────────────────────────────────────────────────────────────
  python-basics               ✓ meta  ✓ 12 slides  ✓ deck  ✓ export
  advanced-django             ✓ meta  ✓ 8 slides   · deck  · export
```

---

#### `new` — 初始化新课程目录
```bash
npm run new <course-name>
# 或
nextcourse new <course-name> [--scale M|L]
```

创建新课程目录结构：
- `courses/<course-name>/course.meta.md` — 课程大纲模板
- `courses/<course-name>/slides/` — 幻灯片目录
- `courses/<course-name>/assets/` — 资源目录

**档位（`--scale`）**：不带参数 = **S 档**（30–90 分钟分享课），行为与 V2 完全一致。

| 档位 | 适用 | 额外产出 |
|---|---|---|
| S（默认） | 公开课 / 内部分享 | — |
| M | 半天 ~ 1 天企业内训 | `course.blueprint.md` 设计蓝图 + frontmatter 追加 `scale` / `duration` / `class_size` |
| L | 训练营 / 体系化项目 | 同 M，蓝图另含运营、TTT、路线图章节 |

M / L 档的 `outcomes` 用块式写法，多带 `id` / `module`（在哪教）/ `evidence`（用什么判定），
这三个字段是 `check` 做闭环校验的燃料。

**示例：**
```bash
npm run new python-basics                    # S 档
nextcourse new leadership-workshop --scale M # M 档，同时生成蓝图
```

---

### 开发工作流

#### `lint` — 校验幻灯片样式规范
```bash
npm run lint <course-name>
```

扫描 `slides/*.html`。**只报告，不改文件。**

**五类违规（任一命中即 exit 1，`render` 会因此中止）：**

| 违规 | 含义 |
|---|---|
| `inline-style` | 出现 `style="..."` 属性 |
| `hardcoded-hex` | `<style>` 块内写死十六进制色值 |
| `hardcoded-rgb` | `<style>` 块内写死 `rgb()` / `rgba()` |
| `new-font` | `<style>` 块内声明 `font-family`（应改用 `var(--font-*)` 令牌） |
| `unknown-class` | 用了未在设计系统登记的 CSS class |

**四类密度警告（报告但不阻断）：** `h2-too-long`（标题 >15 字）、
`item-too-long`（列表条目 >20 字）、`too-many-items`（单列表 >6 项）、
`long-paragraph`（段落 >80 字，建议改为列表/组件）。

> 密度阈值按中日韩全角字校准（一字一格）。英文等按词计的语言会大量误报——
> 只是警告，不会让构建失败。

---

#### `animate` — 批量打入 / 剥离组件入场动画
```bash
npm run animate <course-name>            # 按规则打上动画
npm run animate <course-name> -- --strip # 全部剥掉，回到静态
npm run animate <course-name> -- --dry   # 只报告会改什么，不写文件
```

按组件结构给 slide 元素加上 `animate-*` / `stagger-*`，实现「翻到这页，组件依次入场」。
直接改写 `slides/*.html` 源文件（不是 deck.html），改完还要 `render` 才能看到效果。

**规则**（覆盖 DESIGN-SYSTEM.md 的全部组件，不只是某门课用到的那些；
定义在 `animate-slides.js` 的 `CONTAINER_RULES` / `SOLO_BLOCKS`）：

| 组件 | 效果 |
|---|---|
| `vs-box` | 两栏左右对进；三栏时中间那栏改为上升 |
| `layout-text-image` / `layout-img-left` / `layout-img-right` | 图文左右对进 |
| `workflow` | 节点与连接线沿流向依次进入（fade-left） |
| `timeline` | 时间节点沿时间轴依次进入（fade-left） |
| `grid-2` / `grid-3` / `grid-4` / `icon-card-grid` | 卡片依次升起 |
| `stats-wall` | 数字块依次升起 |
| `quadrant` | 四个象限格依次升起 |
| `case-study__body` | 三块面板依次升起 |
| `layout-img-top` / `layout-top-bottom` | 上下块依次升起 |
| `check-list` / `pill-list` / `key-takeaway__list` | 列表项依次升起 |
| `concept-card` / `callout` / `highlight-box` / `table-compare` / `code-block` / `quote-slide` / `module-divider` / `case-study` / `key-takeaway` / 独立 `card*` | 整块升起 |

封面页 (`cover-slide`) 与结束页 (`ending-slide`) 整页跳过。
同一页内的动画元素按文档顺序统一编号 `stagger`，所以节奏是连贯的一条，
不会出现两组各自从 1 开始、撞在一起冒出来。

**通用兜底**：一页跑完所有规则仍然一个动画都没匹配上（用了清单外的组件、
或者纯手写 markup），会退而给 `<section>` 的直接块级子元素挨个打 `fade-up`，
并在输出里标 `⚙ 通用兜底`。所以「新组件上线但忘了加规则」的后果是节奏偏平，
而不是整页死板。看到这个标记，就该考虑去 `CONTAINER_RULES` 补一条专属规则。

> 新增设计系统组件时，记得同步在 `animate-slides.js` 补规则——
> 兜底能保底，但给不出「左右对进」「沿流向推进」这类贴合结构的节奏。

**与手写 `fragment` 的分工**

`animate-*` 是结构性的（哪种容器配哪个方向有规律），所以能批量生成；
`fragment`（按空格 / 点击才出现）是教学节奏性的，只有讲师知道哪句话该停下来，
必须手写。本命令对 `fragment` 只读不写：

- 自身或祖先带 `fragment` 的元素**不会**被打上 `animate-*`
- `--strip` 只摘 `animate-*` / `stagger-*` 两类 token，绝不碰 `fragment` 或其他 class

因此「手写 fragment → `--strip` → 改内容 → 重新 `animate`」可以反复来回，
手写的节奏标记始终原样保留。命令本身也是幂等的，连跑多次结果一致。

> ⚠️ **同一个元素不能既 `animate-*` 又 `fragment`。**
> `animations.css` 的 `.reveal .slides section.present .animate-fade-up` 特异性 (0,4,1)
> 压过 `reveal.css` 的 `.reveal .fragment:not(.custom){opacity:0}` (0,2,0)，翻页瞬间
> opacity 就被解到 1，按键出现时会变成硬切。要「按键触发 + 平滑」请用
> `class="fragment smooth"`。
> 不同元素各用各的完全没问题——同一页里 A、B 自动飞入，C、D 按空格再出，是推荐用法。

---

#### `build` — 组装生成 `deck.html`
```bash
npm run build <course-name>
```

将 `slides/` 目录中的所有 HTML 文件合并为单一的 `deck.html`：
- 集成 Reveal.js 和所有依赖
- 应用全局样式和配置
- 生成可独立打开的幻灯片文件

**输出文件：** `courses/<course-name>/deck.html`

---

#### `render` — Lint + Build 一步完成（推荐）
```bash
npm run render <course-name>
```

按顺序执行：
1. 运行 `lint` 校验规范
2. 若通过，运行 `build` 生成 `deck.html`

**这是修改 slide 后最常用的命令。** ✨

**示例工作流：**
```bash
# 1. 编辑 slides/slide-01.html
# 2. 重建并查看效果
npm run render python-basics

# 3. 用浏览器打开查看
open courses/python-basics/deck.html
```

---

#### `check` — 教学设计闭环校验
```bash
npm run check <course-name>
# 或
nextcourse check <course-name>
```

`lint` 管样式，`check` 管**教学逻辑**。它读 `course.meta.md` + `course.blueprint.md` +
`slides/`，校验六件事：

| 校验项 | 说明 |
|---|---|
| 闭环 | 每条 outcome 都要有 `module`（教到）和 `evidence`（测到），M/L 档缺任一即 **error** |
| 一致性 | 蓝图模块清单 ↔ meta 大纲模块 ↔ `slides/` 实际页数，三者对不上报警 |
| 深度 | Bloom 分布全落在 remember / understand → 警告「课程可能太浅」 |
| 活动落地 | 蓝图里写了教学活动的模块，幻灯片里必须有 Activity 页（`.activity-card`） |
| 时长 | 各模块时长之和 vs 声明总时长；超出即 error |
| 完整度 | M/L 档蓝图必填章节缺失提醒 |

同时生成 `package/7_alignment.md` 对齐矩阵（成果 × 模块 × 活动 × 产出 × 证据）。

**退出码**：有 error 时 `1`，只有 warning 时 `0`。S 档不强制闭环，只提示一行。

**示例输出：**
```
NextCourse Check — leadership-workshop
────────────────────────────────────────────────────────
  档位     : M · 内训课
  蓝图     : course.blueprint.md
  学习成果 : 5 条  understand×1 apply×2 analyze×1 evaluate×1
  模块     : 蓝图 4 个 / meta 大纲 4 个
  页数     : meta 声明 31 张 / slides/ 实有 31 个

  ✓  对齐矩阵已生成: courses/leadership-workshop/package/7_alignment.md

  PASS  教学设计闭环无阻断问题 — 0 error(s), 0 warning(s), 0 note(s)
```

---

### 交付工作流

#### `package` — 生成交付包（M / L 档）
```bash
npm run package <course-name>
# 或
nextcourse package <course-name> [--render] [--force]
```

汇总蓝图 + 大纲 + slide 备注，生成企业内训真正要交的那一包：

| 文件 | 谁看 |
|---|---|
| `package/1_facilitator-guide.md` | 讲师 —— 逐模块讲授要点、活动指令、对应幻灯片备注 |
| `package/2_workbook.md` | 学员 —— 练习任务、填写区、自检清单 |
| `package/3_rubric.md` | 讲师 —— 打分量规与汇总表 |
| `package/4_action-plan.md` | 学员 —— 30 天承诺 + 30/60/90 复盘 |
| `package/5_assessment.md` | 项目方 —— L1 问卷、L2 考核、评估范围声明 |
| `package/6_facilitation.md` | 讲师 / 助教 —— 时间轴、分组、积分规则 |
| `package/7_alignment.md` | 内部 —— 对齐矩阵（由 `check` 生成，本命令不碰） |
| `package/8_content-dev.md` | 项目组 —— SME 访谈、案例库、数据包、排期 |
| `package/exercises/README.md` | 项目组 —— 练习数据包规则与待建清单 |

**文件名前缀就是交付顺序。** 客户拿到的是一个文件夹，文件管理器按名字排序，
所以排序即动线：1–4 是开班当天桌上要有的，5–8 是设计与项目层的证据，
封面渲染成 `html/0_index.html` 永远排第一，封面里的文档列表也带同一套序号。
序号定义在 `package.js` 的 `DOCS`（每项一个 `no`），要调整顺序就改那里，
老课程里没有序号的旧文件会在下次运行时**自动改名**，手改过的内容不会丢。

**参数：**
- `--render` — 顺带把 `package/*.md` 渲染成 `package/html/*.html`（**客户实际拿到的东西**，
  含目录、可打印、自包含单文件）
- `--force` — 重新生成并覆盖已存在的 md（**默认不覆盖**，你的手改优先）

**md 是源，HTML 是交付物。** 和 `deck.html` 一个心智模型：改内容一律改 `package/*.md`
再重新 `--render`，HTML 永远不手改。

**文档头与标签页只写功能名。** 每份文档的 h1 是「讲师手册」「考核量规」这类**功能名**，
课程名压到下一行小字，`<title>` 同样只写功能名——客户会一次开好几份，
每份都以课程名开头的话，最该一眼认出的「这是哪一份」反而排在最后，标签页里更是全都一样。
md 里的 h1 就写功能名即可，课程名由渲染器补。

**样式全项目统一**：所有课程共用 `shared_styles/package-doc.css` 一套文档样式
（浅色、可打印），随课程 `theme` 变的只有强调色一项——取该配色的 `--primary`
压到对白底 4.5:1。想改交付包长相就改这个文件，改一处全部课程生效。

蓝图六~八节（教学方法 / 评估方案 / 内容开发）没写时，对应文档会留 `> **待补**：…` 标记
——那就是这门课离「能开班」还差的东西，跑 `nextcourse-delivery` 补齐蓝图后重跑本命令即可。

> S 档课程跑这个命令会被拒绝并提示改用 `notes`——交付包是 M/L 档的东西。

**打印验收**（`--render` 后在 Chrome 打印预览里逐项过）：
① 背景色 / 表头底色保留 ② 每页边距一致 ③ 无空白页 ④ 表格不腰斩
⑤ 标题不落页尾 ⑥ 强制分页点生效 ⑦ 导出 PDF 与预览一致

---


#### `export` — 打包为可离线演示文件夹

> M / L 档加 `--with-package` 可把 `package/html/` 一起打进离线包，
> 客户拿到的文件夹里同时有课件与交付文档（需先跑过 `package --render`）。

```bash
npm run export <course-name> [outdir]
```

生成自包含的演示文件夹：
- 演示实际用到的资源全部拷进来（Reveal.js、本课那一套字体的分片、图片、CSS），
  路径改写为相对路径 —— 不是内联进单个 HTML，而是一个可以整体拷走的文件夹
- 只挑本课用得上的东西：`lib/fonts/display` 下放着全部字体族（含两套 ~5MB 的中文），
  按本课字体集实际 `@import` 的文件挑，不整目录搬
- 第三方协议文本一并拷入（Reveal.js 的 `lib/LICENSE`、各字体的 `<slug>.LICENSE.txt`、
  FontAwesome 的 `LICENSE.txt`）—— MIT 与 SIL OFL 都要求副本随分发物走，
  交付包是独立副本，见 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)
- 双击 `index.html` 即可演示，无需联网、无需安装
- 大小取决于字体：含中文字体子集的课约 9–10 MB（自带的 29 页示例课 9.4 MB / 174 个文件）

**可选参数：**
- `outdir` — 输出目录（默认为 `courses/<course-name>/export/`）

**输出结构：**
```
export/
├── index.html          （主演示文件）
├── assets/             （课程图片素材）
├── shared_styles/      （本课用到的模板 / 配色 / 字体集）
└── lib/                （Reveal.js + 字体 + 各自的协议文本）
```

> 字体缺协议文本会直接让 `export` 失败。新增字体时按
> [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)「If you add a font」补上
> `lib/fonts/display/<slug>.LICENSE.txt`。

**示例：**
```bash
# 默认输出到 courses/python-basics/export/
npm run export python-basics

# 输出到自定义目录
npm run export python-basics /tmp/my-export
```

---

#### `notes` — 导出讲师手册
```bash
npm run notes <course-name>
```

从所有幻灯片的演讲备注（`<aside class="notes">`）生成讲师手册：

**输出文件：** `courses/<course-name>/handout.md`

**包含内容：**
- 每页幻灯片的标题编号
- 对应的演讲备注（去除 HTML 标签）
- 统计信息（总页数、有备注的页数）

**注意：** 修改备注后需重新运行此命令；不应直接编辑 `handout.md`。

**示例：**
```bash
npm run notes python-basics

# 输出示例：
# ✓  讲师手册已生成: courses/python-basics/handout.md
#    共 12 页, 其中 10 页有演讲备注
```

---

#### `pdf` — 导出 PDF（发给学员的课件）
```bash
npm run pdf <course-name>
# 或
nextcourse pdf <course-name> [output.pdf] [--theme <配色>] [--size WxH] [--keep] [--source <file>]
```

把 `deck.html` 印成一页一张幻灯片的 PDF，配色、字体、版式与屏幕上完全一致（需要本机有 Chrome）：

```
courses/<course-name>/pdf/deck.pdf              # 默认输出（授课版配色）
courses/<course-name>/pdf/deck.print-light.pdf  # 加 --theme print-light 时
```

一门课会攒下好几份 PDF（授课版 / 打印版 / 删过页的外发版 / 手工改名的那份），
所以它们统一落在 `pdf/` 下，课程根目录只留源文件。

**别让用户自己在浏览器里 Cmd+P。** reveal.css 自带一套「印在 A4 纸上」的打印样式
（`@media print`）：背景刷白、正文 20pt 纯黑、装饰全隐藏。直接打印出来的东西不能看，
不是样式坏了，是那套样式在起作用——本命令绕开的正是它。

**参数：**
- `output.pdf` — 输出路径（默认 `courses/<course-name>/pdf/deck.pdf`；给了路径就按你给的来）
- `--theme <配色>` — 换一套配色再导出，版式与字体一个像素不动。给学员打印用
  `--theme print-light`（见下）；也接受任何已有配色名。指定后输出名自动带后缀，
  不会覆盖授课版
- `--size WxH` — 纸张尺寸，默认 `1600x900`（16:9）。4:3 的投影场景用 `--size 1600x1200`
- `--keep` — 留下打印稿 `deck.print.html`（浏览器打开即是导出效果，也可以手改）
- `--source <file>` — 从课程目录里的某个文件打印，通常是手改过的 `deck.print.html`

---

##### 授课版 ≠ 发出去的版本

现场演示页、客户敏感案例往往不适合外发。两条路，按改动大小挑：

**页级去留（首选）** —— 在 `slides/slide-XX.html` 的 `<section>` 上写一个属性：

```html
<section data-print="off">
```

导出时整页摘掉。页码是 CSS 计数器，**会自动连号**，不会跳号；这条属性对演示毫无影响，
授课用的 `deck.html` 照常带着这一页。真相只有一份，在 `slides/` 里，重建不会丢。

**要改内容** —— 先 `--keep` 留下打印稿，手改完再从它打印：

```bash
nextcourse pdf my-course --keep                     # 出 PDF，并留下 deck.print.html
# 手改 deck.print.html：删半页、补一句「回去怎么练」、换张截图
nextcourse pdf my-course --source deck.print.html   # 从手改稿再印一次
```

> `deck.print.html` 是生成物：`render` 重建 `deck.html` 后它不会自动跟上，需要重新 `--keep`。
> 所以能用 `data-print="off"` 解决的，就别用它。

---

##### 学员要打印到纸上：`--theme print-light`

深色课件在纸上既费墨又难看。加一个参数就能出一份纸面浅色版，**版式布局完全不变**：

```bash
nextcourse pdf my-course --theme print-light   # → deck.print-light.pdf
```

`print-light` 派生自 `warm-sand`，按"纸"改了四组值：底色压纯白（背景不吃墨）、阴影全撤
（卡片靠 1px 发丝线分隔）、**模块封面留白只剩标题**（字号字重一个没动）、代码块翻成浅底深字。
它不进配色展板，也不要写进 `course.meta.md` 的 `theme:`——那会让你在投影上讲一份白底课件。

两个提前说清的局限：黑白打印时红/绿语义色会塌成相近的灰（课件本身用 ✓/✗ 与边框承载区分，
不是只靠颜色，所以不致命）；深色截图不会跟着变浅，那是内容问题不是主题问题。

---

##### 它做了什么（想改导出效果时看这里）

1. 复制一份 `deck.html`，给 `<html>` 加 `class="print-pdf"`，注入一条 `@page` 定死纸张尺寸；
   按需摘页、按需换掉那一行 `color-schemes/*.css`；
2. `shared_styles/base_layout.css` 的「导出 PDF」一节接手，把「一次只显示一页的演示器」
   摊平成「一页接一页的长卷」——DOM 一个节点都不挪，所以设计系统里
   所有 `.slides > section …` 选择器照常命中，屏幕什么样、纸上就什么样；
3. headless Chrome 打印，完事删掉临时拷贝（除非 `--keep`）。`deck.html` 全程不动。

> 走的不是 reveal 官方的 `?print-pdf`。那条路会把每个 section 搬进一层 `.pdf-page` 容器，
> 设计系统里的画布、组件间距、模块封面底色会一起失配——修不过来。

**自检：** 命令跑完会报页数和纸张尺寸。页数比应印页数多，说明有页内容超出画布被拆成了两页，
先跑 `nextcourse shot <name> --check` 找出是哪一页。

**发给学员前顺手做的一件事：** 文件名改成课程名（`deck.pdf` 对学员没有意义）。
含大图的课件通常 4–8 MB，微信发送没问题。

**示例：**
```bash
# 默认输出到 courses/python-basics/pdf/deck.pdf
npm run pdf python-basics

# 指定输出路径与文件名
nextcourse pdf python-basics pdf/Python基础-课件.pdf

# 学员打印版 + 4:3 投影尺寸
nextcourse pdf python-basics --theme print-light --size 1600x1200
```

---

#### `shot` — 溢出检测 + 逐页截图
```bash
npm run shot <course-name> [--check]
```

逐页截图幻灯片到 `.review/` 目录（需要本机有 Chrome）：

**功能：**
- 检测文本溢出
- 检测布局问题
- 生成每页的 PNG 截图供审查

**参数：**
- `--check` — 仅检测问题，不生成截图

**输出目录：** `courses/<course-name>/.review/`

**示例：**
```bash
# 生成所有幻灯片的截图
npm run shot python-basics

# 仅运行检测，不生成截图（走 npm 时以 - 开头的参数要用 -- 转交）
npm run shot python-basics -- --check
# 或直接走 CLI，不用 --
nextcourse shot python-basics --check
```

---

#### `themes` — 生成配色 / 字体展板
```bash
npm run themes
```

把 8 套配色 × 8 套字体集渲染成可视化展板，输出 `theme-gallery/index.html`：
每套配色一页，语义色、模块封面色、字体、组件实景与自动体检摊开在同一页上。
决定一门课长什么样时先看这里，不必逐个 CSS 文件去读令牌。

不需要课程名参数——它描述的是设计系统本身。

---

## 完整工作流示例

### 从零开始创建课程

```bash
# 1. 创建新课程目录（企业内训加 --scale M）
npm run new my-course

# 2. 设计课程大纲（在 Claude Code 中）
# 运行: nextcourse-design

# 2b. M/L 档：补评估方案与开发计划（在 Claude Code 中）
# 运行: nextcourse-delivery my-course

# 2c. M/L 档：教学设计闭环校验
npm run check my-course

# 3. 生成幻灯片（在 Claude Code 中）
# 运行: nextcourse-slides my-course

# 4. 校验并构建（编辑完成后）
npm run render my-course

# 5. 打开浏览器查看效果
open courses/my-course/deck.html

# 6. 如需进一步调整
# 编辑 slides/slide-XX.html
# 再次运行: npm run render my-course

# 7. 检查幻灯片显示效果（需要 Chrome）
npm run shot my-course

# 8. 导出讲师手册
npm run notes my-course

# 8b. M/L 档：生成交付包（讲师手册 / 学员手册 / 量规 / 评估方案）
nextcourse package my-course --render

# 9. 打包交付（M/L 档加 --with-package 带上交付文档）
npm run export my-course
# 或输出到自定义位置:
npm run export my-course ~/Desktop/delivery
```

---

## 常见场景

### 场景 1：修改 slide 内容后查看效果
```bash
npm run render <course-name>
open courses/<course-name>/deck.html
```

### 场景 2：只想检查是否有样式问题（不生成截图）
```bash
npm run shot <course-name> --check
```

### 场景 3：多次编辑迭代
```bash
# 编辑 slide → render → 查看 → 重复
npm run render my-course
open courses/my-course/deck.html
# ... 编辑文件 ...
npm run render my-course  # 再次运行
```

### 场景 4：准备交付前的检查清单
```bash
# 1. 校验所有规范
npm run render my-course

# 2. 视觉检查
npm run shot my-course

# 3. 检查讲师备注
npm run notes my-course
cat courses/my-course/handout.md

# 4. 生成最终交付包
npm run export my-course
```

---

## 命令速查表

| 命令 | 用途 | 何时用 |
|------|------|--------|
| `list` | 列出所有课程 | 项目开始时 |
| `new <name>` | 创建新课程 | 开发新课程 |
| `lint <name>` | 校验规范 | 编辑后检查 |
| `build <name>` | 生成 deck.html | 内部使用（用 render 代替） |
| `render <name>` | Lint + Build | ⭐ **最常用**，每次编辑后 |
| `export <name>` | 打包交付 | 课程完成后交付 |
| `notes <name>` | 讲师手册 | 整理演讲备注 |
| `shot <name>` | 截图检查 | 交付前视觉审查 |
| `animate <name>` | 打入/剥离入场动画 | 内容定稿后 |
| `themes` | 配色/字体展板 | 决定视觉风格时 |

---

## 技巧和最佳实践

### 1. 配合浏览器使用
```bash
# 终端执行
npm run render my-course

# 然后回浏览器按 F5 / Cmd-R 刷新已打开的 deck.html
```

> 没有热加载。`deck.html` 是一个静态文件，`render` 会重写它，但浏览器不会自己知道——
> 每次都要手动刷新。刷新后 Reveal 会回到第一页，用 URL 里的 `#/12` 可以直接回到某页。

### 2. 快速编辑循环
使用编辑器打开 `slides/` 目录，同时在浏览器中打开 `deck.html`：
```bash
# 终端 1：监控编辑
npm run render my-course  # 编辑后重新运行

# 浏览器：实时预览 deck.html
```

### 3. 批量检查多个课程
```bash
npm run list     # 查看所有课程
npm run render course1
npm run render course2
npm run render course3
```

### 4. 导出前的完整检查
```bash
npm run render my-course && npm run shot my-course && npm run export my-course
```

---

## 课程放在哪

课程落在**调用命令时所在的目录**下：`./courses/<课程名>/`。所以开工前先 `cd` 到你想放
课程的地方。

| 环境变量 | 作用 |
|---|---|
| `NEXTCOURSE_HOME` | 把工作目录钉到一个固定路径，不管在哪调用，课程都进 `$NEXTCOURSE_HOME/courses/` |
| `CHROME_PATH` | `shot` 命令用的浏览器路径（默认自动找 Chrome / Chromium） |

引擎自带的 `lib/` `shared_styles/` `templates/` 永远从包的安装位置读，跟你在哪调用无关。
两个根都会被 `nextcourse doctor` 报出来 —— **「课程怎么不见了」几乎都是站错了目录**。

在 clone 下来的仓库根目录里跑时，工作目录就是仓库根，`courses/<name>/` 与 v4 之前是
同一个路径，老用法一字未变。

```bash
nextcourse doctor
# NextCourse doctor — v4.0.0
# ✓  Node 20.11.0
# ✓  引擎位置   /usr/local/lib/node_modules/nextcourse
# ✓  工作目录   /Users/you/my-courses  (当前目录)
# ✓  课程目录   /Users/you/my-courses/courses
# ✓  Chrome     /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
# ✓  引擎资产   完整
```

---

## `nextcourse docs <name>` —— 打印内置文档

技能靠这个读设计系统，不必把几万字复制进提示词。

| 名称 | 内容 |
|---|---|
| `design-system` | 24 个组件的完整参考 —— 写幻灯片前必读 |
| `agent` | 目录结构 / 工作流 / 硬规则总览 |
| `cli` | 本手册 |
| `domains` | 题材域适配表：不同题材该用什么活动与组件 |

```bash
nextcourse docs                    # 列出可用的文档
nextcourse docs design-system      # 打印到 stdout
nextcourse docs domains | head -40
```

---

## 环境要求

- **Node.js** 20 或更高
- **零 npm 依赖** —— 整套 CLI 只用 Node 内置模块（`fs` / `path` / `child_process` / `https`），
  装完不用再装别的。`npm run *` 只是 `nextcourse *` 的快捷方式（clone 用法），不用 npm 也可以。
- **Chrome / Chromium / Edge**（仅 `shot` 命令需要；自定义路径用环境变量 `CHROME_PATH`）

安装：

```bash
npm i -g nextcourse              # 或每次用 npx -y nextcourse <命令>
npx skills add skill-node/nextcourse   # 四个 Agent Skill
```

---

## 更多信息

详细的项目设计和工作流说明见 [AGENT.md](./AGENT.md)。

# NextCourse V2 — 设计系统参考

> **唯一真相源。** `/slide-design` Skill 只读此文件。  
> 铁律: 只用登记的 class + `var(--*)` 令牌。禁止内联 `style=` / 写死十六进制颜色 / 声明新 `font-family`。  
> 违规由 `lint-slides.js` 自动拦截。

---

## 如何引用设计系统

每个 `slides/*.html` 片段会由 `build.js` 组装进 `deck.html`,deck.html 已包含以下 CSS
(**顺序即优先级,越靠后权力越大**,详见下面的「样式层级」):

```
shared_styles/base_layout.css
shared_styles/themes/<template>.css
shared_styles/tokens.css
shared_styles/components.css
shared_styles/color-schemes/<theme>.css
shared_styles/font-sets/<fontset>.css
shared_styles/animations.css
```

---

## 背景-文字色配对原则

> **系统级约定：每套配色方案的令牌已成对设计，组件必须显式引用两端——只设背景不设文字色会导致继承链失稳。**

| 背景令牌 | 配对文字令牌 | 使用场景 |
|---|---|---|
| `var(--bg-slide)` | `var(--text-heading)` | 页面主体文字 |
| `var(--bg-card)` | `var(--text-body)` | 卡片内正文 |
| `var(--bg-highlight)` | `var(--text-body)` | highlight-box、callout、concept-card__example |
| `var(--bg-code)` | `var(--text-code)` | code-block |
| `var(--bg-vs-bad)` | `var(--text-body)` | vs-bad 容器内正文 |
| `var(--bg-vs-good)` | `var(--text-body)` | vs-good 容器内正文 |
| `var(--primary)` | `var(--text-inverse)` | card-primary、case-study__panel--outcome |
| `var(--module-N)` | `var(--text-on-module)` | module-divider 彩色章节页 |

`components.css` 的 §0b 已为 `standard.css` 的缺口补上了显式 color 声明。新组件请严格遵守此表。

> **注意 `color: inherit` 的起点。** reveal.css 给 body 挂了 `.reveal-viewport { color: #000 }`,
> 类选择器压过 `standard.css` 的 `body { color: … }`。§0b 已在 `.reveal .slides > section` 上
> 显式落了 `var(--text-heading)`，继承链才有正确起点；不要移除这条，否则所有靠 inherit 取色的
> 组件（如 `.workflow-node__label`）在深色配色下会变成黑字贴黑底。

---

## 内容栏宽原则

> **同一页上下叠放的块组件必须等宽**，否则边缘参差，读起来像两套东西。

幻灯片级块组件（直接放在 `section` 下那一层）一律：

```css
width: 100%;
max-width: var(--content-max-width);   /* tokens.css，默认 80rem */
```

已按此收敛的组件：`grid-4` `layout-text-image` `concept-card` `stats-wall` `timeline`
`quadrant` `case-study` `table-compare` `key-takeaway` `pill-list` `callout`
`highlight-box` `workflow`。

唯一例外是 `.quote-slide`（68rem）——金句刻意收窄，单独占一页，不与别的组件并排。

**左侧色条类组件**（`callout` / `concept-card__example` / `highlight-box` / `key-takeaway__next`）
统一用 `border-radius: 0 var(--radius-md) var(--radius-md) 0`：左直角右圆角。
四角全圆会让左边的色条看着是弧线，与相邻的同类块对不上。

---

## 颜色令牌速查 (color-schemes/*.css 中定义)

| 令牌 | 语义 |
|---|---|
| `var(--primary)` | 主色 — 强调、数字、边框 |
| `var(--primary-dark)` | 深主色 — **只作背景**（table-compare 首列表头等），不作文字色 |
| `var(--text-title)` | h1 文字色（封面标题、结语大标题） |
| `var(--text-on-module)` | 模块封面（全屏彩色底）上的文字 |
| `var(--secondary)` | 辅助色 — 示例、tip、时间轴结束端 |
| `var(--accent)` | 强调色 — 警示、callout、次级强调 |
| `var(--danger)` | 危险色 — vs-bad、错误 |
| `var(--success)` | 成功色 — check-list、正面结果 |
| `var(--text-heading)` | 标题文字 |
| `var(--text-body)` | 正文文字 |
| `var(--text-muted)` | 弱化文字 / 注释 |
| `var(--text-inverse)` | 反色文字 (深色背景上用) |
| `var(--bg-card)` | 卡片背景 |
| `var(--bg-slide)` | 页面背景 |
| `var(--bg-highlight)` | 高亮框背景 (浅) |
| `var(--shadow-card)` | 卡片阴影 |
| `var(--shadow-hover)` | 悬浮阴影 |

---

## 配色红线 (R1–R4)

> 面向 **改 `color-schemes/*.css` 的人**，不是写 slide 的人。
> 四条都由展板自动体检：`node nextcourse.js themes` → 打开 `theme-gallery/<主题>.html`
> → 「体检」区必须归零。

**配色文件的头注释是展板的数据源**，新增配色时这几行不是装饰：

```css
/* ===================================
   Bold Signal — 高对比深色 + 亮色卡片      ← 展板标题 + 中文简介
   适用于: 高管演讲、影响力展示               ← 中文「适用于」
   EN tagline: High-contrast dark canvas with light cards   ← 英文简介
   EN use: Executive keynotes, high-impact showcases        ← 英文「适用于」
   默认字体集: impact-sans (…)               ← 与 build.js 的 DEFAULT_FONT_SET 对齐
   =================================== */
```

展板是中 / EN 双语的（`<html data-lang>` + `.l-zh` / `.l-en`，语言状态存 localStorage 的
`lang` 键，和 nextskill.cc 主站同一个约定）。漏写 `EN tagline:` / `EN use:` 不会报错，
只会让英文版那一栏退回中文 —— `node theme-gallery.js` 跑完会在末尾点名缺哪几套。

**R1 · 全屏红色只留一次，且放末位**
全屏铺色的页只有三类：封面、十个模块封面、封底。其中红/橘红家族
（HSL 色相 `≤35°` 或 `≥340°` 且饱和度 `>25%`）最多允许 **1 个**，且必须是
`--module-10`。授课时整屏红色过于刺激，连着翻到几次会让人疲劳；但完全没有红
又丢掉了配色的性格，所以留一个、放在最少被课程用到的末位。
*课程侧要用，直接在该页写 `class="module-10"` 即可，属于个性化微调。*
注意：这条只管**全屏底色**。`--primary` / `--accent` / `--danger` 本身是不是红色不受限制
（swiss-modern 的红就是它的身份），红色照常出现在标题、数字、边框、callout 上。

**R2 · 模块色不得占用语义色**
`--module-*` 不得与 `--danger` / `--success` 精确同色；与 `--accent` 同色最多 1 处。
学员在一份 deck 里反复看到某个色代表"错误 / 正面 / 警示"，突然拿它当章节封面会串味。
与 `--primary` / `--primary-dark` / `--secondary` 同色是惯例，不受限。

**R3 · 十个模块色两两不得完全相同**
否则翻到新模块时看不出换了章。

**R4 · 全屏页标题对比度 ≥ 4.5:1**
比 WCAG 大字的 3:1 严一档 —— 会议室投影 + 环境光下 3:1 会糊。
量的是「实际渲染出来的标题色 vs 实际渲染出来的底色」，不是令牌的字面值。

**R5 · 语义色必须能当文字用**
`--primary` / `--secondary` / `--accent` / `--success` / `--danger` 落在 `--bg-slide` 上要 ≥4.5:1。
这五个在 `standard.css` / `components.css` 里全都被当**文字色**引用——`.text-*`、
`.vs-good h3` / `.vs-bad h3`、`.stat-item__number`、`.icon-card__icon`。
不达标不会报错，只会让那些规则**看不见**（notebook-tabs 的五个粉彩语义色一度只有 1.6:1）。
需要大面积铺色时用 `--bg-vs-good` / `--bg-vs-bad` / `--bg-highlight` 这类填充令牌，
或在配色文件里单独覆盖 `.card-*`，**不要**为了铺色把语义色调浅。

**必备令牌**
`themes/` 和 `components/` 里凡是裸用 `var(--x)`（不写兜底值）的令牌，配色必须全部定义。
少一个不会报错，只会让那条规则**静默失效**。`node nextcourse.js themes` 会在结尾审计并退出码报错。

---

## 间距令牌速查 (tokens.css 中定义)

`--space-1(4px)` `--space-2(8px)` `--space-3(12px)` `--space-4(16px)` `--space-5(20px)` `--space-6(24px)` `--space-8(32px)` `--space-10(40px)` `--space-12(48px)` `--space-16(64px)`

---

## 动画类 (animations.css)

```
.animate-fade-up    .animate-fade-left    .animate-fade-right    .animate-zoom-in
.stagger-1 … .stagger-12                  （交错延迟，每级 0.1s）
```

**两套机制，触发路径不同，不要混淆：**

| | class | 触发时机 |
|---|---|---|
| 翻页即播 | `animate-*` + `stagger-*` | CSS 的 `section.present`，切到这页自动跑 |
| 按键才出 | `fragment`（Reveal.js 原生） | 按空格 / → / 点击，推进一次出一个 |

同一页里不同元素各用各的完全没问题，这是推荐用法——A、B 翻页自动飞入，
C、D 按空格再逐个出。两组选择器互不匹配，不会互相干扰。

⚠️ **但同一个元素不能同时挂这两类 class。**
`.reveal .slides section.present .animate-fade-up` 特异性 (0,4,1) 压过 reveal.css 的
`.reveal .fragment:not(.custom){opacity:0}` (0,2,0)：翻页瞬间 opacity 就被解到 1，
元素只剩 reveal 的 `visibility:hidden` 藏着，按键出现时是硬切、没有过渡。
要「按键触发 + 平滑」，用 `class="fragment smooth"`（`.smooth` / `.bounce` 是
animations.css 里专为 fragment 准备的缓动增强）。

`animate-*` / `stagger-*` 不必手写，`nextcourse animate <name>` 按组件结构批量生成，
`--strip` 一键还原；它不会碰你手写的 `fragment`。见 CLI_MANUAL.md。

---

## 配色方案列表

| 方案名 | 适合场景 |
|---|---|
| `bold-signal` | 深灰 + 高饱和橙 — 技术/工具培训 |
| `dark-ocean` | 深蓝 + 柔和点缀 — 数据/分析 |
| `dark-botanical` | 近黑 + 暖棕衬线 — 高端质感、领导力 |
| `creative-voltage` | 深夜蓝 + 荧光绿 — 创意、新趋势 |
| `swiss-modern` | 纯白 + 红黑极简 — 管理、战略 |
| `warm-sand` | 米白 + 紫绿点缀 — 商务浅色、HR 培训 |
| `notebook-tabs` | 奶油 + 衬线粉彩 — 工作坊、互动 |
| `standard-default` | 白底学术蓝 — 严肃、学术、安全通用 |

---

## 样式层级

> **顺序即优先级。** 同特异性下后加载者胜，`!important` 也一样。层级排错会让整层声明静默失效——
> 早期配色排在主题之前，各配色为 h1/h2 写的 `font-weight` 和 `--font-body` 就是这么全体阵亡的。

```
1. lib/dist/reveal.css        第三方运行时基线
2. base_layout.css            画布与响应式变量
3. themes/<template>.css      通用主题：所有配色共享的排版与结构
4. tokens.css                 设计令牌
5. components.css             组件库
6. color-schemes/<scheme>.css 配色特化：颜色 + 字重/字距/斜体
7. font-sets/<set>.css        字体族最终裁定
8. animations.css             纯工具类
```

权威定义在 `templates/master_template.html` 的注释里，改动前先读那段。

两条推论：

- **越具体的层排越后。** 配色比通用主题具体，字体集比配色更专一，所以是这个顺序。
- **CSS 自定义属性在「使用时」解析**，不是声明时。所以把 `:root` 令牌块挪到后面
  不会影响任何 `var(--*)` 消费方——重排只影响真正的属性规则。

### `!important` 使用规约

全库已清理完毕：`themes/standard.css` 55→7、`color-schemes/*.css` 91→5、`components.css` 54→2、
`font-sets/*.css` 8→0、`animations.css` 10→9、`base_layout.css` 3→3，**合计 221 → 26**。
**新写的规则默认不带 `!important`**，只有两类例外：

| 类别 | 场景 | 现存位置 |
|---|---|---|
| **A. 压行内样式 / 压第三方的高特异性选择器** | 别无他法 | ① `standard.css` 的 `.reveal .slides>section { display: flex !important }`——reveal.js 给每个 section 写行内 `style="display:block"`；② 5 套深色配色的 `body { background: … !important }`——reveal.js 把 `.reveal-viewport` 挂在 `<body>` 上，reveal.css 的 `.reveal-viewport{background-color:#fff}` (0,1,0) 打得过 `body` (0,0,1)；③ `base_layout.css` 隐藏 reveal 自带控件 + `prefers-reduced-motion` 降级（无障碍惯例，必须压一切） |
| **B. 工具类** | 语义上就是「最后一句话」，且特异性天生偏低 | `standard.css` 的 `.text-*` / `.font-bold` 6 条；`components.css` 的 `.text-secondary` / `.text-inverse` 2 条；`animations.css` 的 `.stagger-*`（要压同文件 `.reveal .slides section .animate-fade-up` 的 `transition` 简写）和 `.fragment.smooth/.bounce` |

需要压过别的规则时用**特异性**和**文件内顺序**，不要用 `!important`：

- 加 `.reveal ` 前缀把 (0,1,1) 提到 (0,2,1)——例如 `.reveal .cover-slide h2` 压 `.reveal h2`。
- 选择器要写到能赢的长度——配色层想改整页底色得写 `.reveal .slides>section.cover-slide` (0,3,1)，
  光写 `.cover-slide` (0,1,0) 赢不了 standard.css 的 `.reveal .slides>section` (0,2,1)。
- 同特异性时靠先后顺序——`standard.css` 里 `.card-primary h3` 必须排在 `.vs-good h3` **之后**，
  因为 slide 里存在 `.card-primary > .vs-good` 嵌套，卡片的 `--text-on-*` 配对令牌要有最终解释权。

**为什么 `!important` 是有害的：** 它一旦写下，后面每一层都必须同样端出 `!important` 才压得动，
而后面那层写的通常是 `.card-primary` (0,1,0) 这种低特异性选择器，端出来照样输——结果不是「覆盖失败」
而是**静默失效**，没有任何报错。清理时挖出来的一串就是这么来的：dark-botanical 的渐变卡片、
`.key-takeaway__title` / `.case-study__title` / `.concept-card__term` 的全部组件排版、
`.text-muted` 工具类、notebook-tabs 的模块分隔页底色、swiss-modern 的 60px 封面短线。

**另一个同样的坑是「最后一层写死具体值」**：`animations.css` 曾有一条
`.reveal .slides section.present .divider { width: 100px }` (0,3,1)，作为最后一层把宽度焊死，
逼得三套配色各自用 `!important` 抢回来。animations.css 是纯工具层，不该参与配色博弈。

### 怎么判断一条 `!important` 还「承重」

把它单独去掉，用 headless Chrome 重新 dump 全部元素的 `getComputedStyle`，与改动前逐字段比对
（`shot.js` 同款手法，无差异 = 摆设）。这套 diff 比截图敏感得多，还能一眼看出「哪条规则终于生效了」。

⚠️ **两个已知的假阴性，别被骗**：
1. **dump 没取的属性测不出来**——最初的属性表里没有 `transition*`，于是 `animations.css`
   的 `.stagger-*` 被误判成摆设。
2. **课件里没用到的 markup 测不出来**——`.fragment.smooth` / `.fragment.bounce` 目前仍没有
   任何课件在用，那几条无论如何都测不出差异。这类要靠人读规则判断。
   （`.stagger-*` 曾经也在这一列，自 `nextcourse animate` 上线后 workbuddy-insurance
   已大量使用，不再是盲区。）

### components.css 的「一对规则」写法

`components.css` 的 BEM 类名是 (0,1,0)，天生压不过 `standard.css` 的 `.reveal p` / `.reveal h2` (0,1,1)，
从前靠 `!important` 硬压。现在改成把**只有那几条必须赢的声明**单独拆进带 `.reveal ` 前缀的规则：

```css
.callout          { background: …; padding: …; }   /* 盒子样式，留在 (0,1,0) */
.reveal .callout  { color: var(--text-body); }     /* 会和 .reveal p 撞车的，提到 (0,2,1) */
```

**别把两条合并回去。** 合并等于把盒子样式也一起提到 (0,2,1)，实测会踩两个坑：

- `.callout--tip` / `--warning` / `--insight` 的背景色被 `.reveal .callout` 的 background 压掉，
  三种语气的标注框变成同一个颜色；
- `.table-compare` 的斑马行（`tbody tr:nth-child(even) td`）被 `.reveal .table-compare td` 压掉。

新增组件按同样方式写：盒子样式留裸类名，只有 `color`（偶尔 `font-size` / `font-weight` / `margin`）才加前缀。

**判断哪些属性要加前缀**：看这个组件的标签是什么。`.reveal h1/h2/h3` 管着
`font-size / font-weight / color / line-height / margin-bottom`，`.reveal p, .reveal li` 管着
`font-size / line-height / color / margin-bottom`——组件如果是这几个标签之一，
凡是想覆盖这几个属性的声明都得进带前缀的那条，否则静默失效。
`.concept-card__def` 就踩过这个坑：它是 `<p>`，`font-size` 的 clamp 上限 1.25rem 一直被
`.reveal p` 的 1.1rem 压着，`margin: 0` 被 0.8rem 顶开，「定义」这一行在概念卡里没了分量。
（已修）

---

## 字体

字体是**独立于配色的一根轴**：配色决定「什么颜色」，字体集（`shared_styles/font-sets/*.css`）
决定「什么字」。`course.meta.md` 里写 `fontset: <名称>` 即可换，不写则用配色的默认搭档
（映射见 `build.js` 的 `DEFAULT_FONT_SET`，同时登记在各配色文件头注释里）。

### 现有字体集

| 名称 | 标题 | 正文 | 气质 | 默认配色 |
|---|---|---|---|---|
| `impact-sans` | Archivo Black + 思源黑体 | 思源黑体 | 冲击力、工具/技术培训 | bold-signal |
| `grotesk-sans` | Archivo + 思源黑体 | 思源黑体 | 瑞士网格、理性、战略 | swiss-modern |
| `voltage-sans` | Syne + 思源黑体 | 思源黑体 | 创意、年轻受众 | creative-voltage |
| `modern-sans` | 思源黑体 | 思源黑体 | 现代中性，纯中文最稳 | dark-ocean / warm-sand / standard-default |
| `editorial-serif` | 思源宋体 | 思源黑体 | 编辑感、克制、顾问气质 | —（skillnode 设计系统同款） |
| `garamond-serif` | Cormorant + 思源宋体 | 思源黑体 | 优雅衬线、高端质感 | dark-botanical |
| `didone-serif` | Bodoni Moda + 思源宋体 | 思源黑体 | 高对比衬线、时装/品牌感 | notebook-tabs |
| `system` | 系统字体 | 系统字体 | 零下载，快速预览 | — |

思源黑体 = Noto Sans SC，思源宋体 = Noto Serif SC，均为 SIL OFL 开源**可变字体**（单文件覆盖全字重）。

### 三条铁律

1. **禁止 CDN `@import`。** 课件要在无外网的教室里放，CSS `@import` 是渲染阻塞资源——
   遇到「连了 wifi 但出不去」的网络会等到超时才出画面（实测 34s vs 3s）。一律引
   `lib/fonts/display/` 下的本地文件。
2. **中文字体必须显式写进栈里。** 拉丁字体没有汉字字形；只写 `'Archivo Black', sans-serif`
   会让中文标题落到浏览器的通用默认字体，Mac 一套 Windows 一套，不受控。
3. **衬线配衬线，非衬线配非衬线。** 拉丁 Display 是衬线，中文 Display 就得走宋体一路。
   CSS 没法根据配色自动挑中文字体，所以字体集是**整套配对**，不拆成「配色管拉丁、字体集管中文」。

### 本地字体资产

`lib/fonts/display/`，共 11 MB：拉丁 Display 各 1 个 latin 分片（9.6–45 KB），
两套中文各 101 个 unicode-range 分片（思源黑体 4.3 MB / 思源宋体 5.7 MB）。
分片机制让浏览器**只下载页面真正用到的那几片**，一门课通常 10~20 片。

新增字体：改 `vendor-fonts.js` 顶部的 `FAMILIES`（中文字体加 `sliced: true`），
跑 `node vendor-fonts.js`（需联网），再写一个新的 `font-sets/*.css`。
`export.js` 整目录拷贝 `lib/fonts/`，交付包自动带上。

**正文不用拉丁 Web 字体。** 课件正文是中文，拉丁正文字体对中文一个字都管不着。
原来 5 套配色各自 `@import` 的 Space Grotesk / Space Mono / IBM Plex Sans / DM Sans / Nunito
还因为层级排错而**从未生效过**，已全部删除。

---

## 组件参考

### § 0 封面页 (.cover-slide) — *来自 standard.css*

```html
<section class="cover-slide">
  <h1>课程标题</h1>
  <div class="divider"></div>
  <h2>副标题 / 讲师名</h2>
  <p class="text-muted">日期 · 场合</p>
</section>
```

✅ DO: h1 是课程名, h2 是副标题或讲师, 保持文字精简  
❌ DON'T: 在封面堆砌议程内容; 不要内联 color

---

### § 1 章节分隔页 (.module-divider + .module-N)

```html
<section class="module-1">
  <div class="module-divider">
    <span class="module-divider__label">模块 01</span>
    <h2 class="module-divider__title">AI 时代的人才选拔</h2>
    <p class="module-divider__hook">当算法能比你更准地预测候选人表现，HR 的价值在哪里？</p>
    <span class="module-divider__number" aria-hidden="true">01</span>
  </div>
</section>
```

✅ DO: `module-N`(N=1~10) 提供彩色背景; hook 是引发好奇的问句; 装饰数字加 `aria-hidden="true"`  
❌ DON'T: 不要在分隔页放正文内容; 不要在 section 上写 style=

---

### § 2 概念定义卡 (.concept-card)

```html
<section>
  <h2>大语言模型</h2>
  <div class="concept-card">
    <h3 class="concept-card__term">提示工程 (Prompt Engineering)</h3>
    <p class="concept-card__def">
      通过精心设计输入文本来引导语言模型产出符合预期的输出内容，是与 AI 协作的核心技能。
    </p>
    <div class="concept-card__example">
      <strong>示例：</strong>把 AI 当作一个极其博学但完全听话的实习生，提示工程就是你给它的工作简报。
    </div>
  </div>
</section>
```

✅ DO: 一页只讲一个概念; 示例用类比或场景; "示例"标签**显式写在 HTML 里**  
✅ DO: `.concept-card__example` 只用于真正的示例/类比，其他补充说明改用 `.highlight-box`  
❌ DON'T: 不要在一页放 2+ 个概念定义  
❌ DON'T: 不要把"核心模式""典型动作"等说明文字放进 `.concept-card__example`（应用 `.highlight-box`）

---

### § 3 双/三栏对比 (.vs-box + .vs-box--columns)

**两栏 (好/坏):**
```html
<section>
  <h2>传统 vs AI 驱动的绩效评估</h2>
  <div class="vs-box vs-box--columns">
    <div class="vs-bad">
      <h3>❌ 传统方式</h3>
      <ul>
        <li>年度打分, 滞后 12 个月</li>
        <li>主观偏差大</li>
      </ul>
    </div>
    <div class="vs-good">
      <h3>✅ AI 辅助方式</h3>
      <ul>
        <li>实时数据, 季度复盘</li>
        <li>多维度客观评分</li>
      </ul>
    </div>
  </div>
</section>
```

**三栏 (A / B / C 比较):**
```html
<div class="vs-box vs-box--columns">
  <div class="vs-bad">
    <h3>方案 A</h3>
    <p>…</p>
  </div>
  <div class="vs-neutral">
    <h3>方案 B</h3>
    <p>…</p>
  </div>
  <div class="vs-good">
    <h3>方案 C ✅</h3>
    <p>…</p>
  </div>
</div>
```

✅ DO: 列数 ≤3; 每栏标题用图标/颜色区分; 对比维度平行  
❌ DON'T: 不要在对比框内嵌入图片; 不要超过 4 个 li 条目

---

### § 4 流程步骤 (.workflow) — *components.css*

```html
<section>
  <h2>AI 招聘流程</h2>
  <div class="workflow">
    <div class="workflow-node">
      <div class="workflow-node__icon primary">📋</div>
      <div class="workflow-node__label">岗位需求分析</div>
    </div>
    <div class="workflow-line"></div>
    <div class="workflow-node">
      <div class="workflow-node__icon accent">🤖</div>
      <div class="workflow-node__label">AI 初筛</div>
    </div>
    <div class="workflow-line"></div>
    <div class="workflow-node">
      <div class="workflow-node__icon secondary">👤</div>
      <div class="workflow-node__label">人工面试</div>
    </div>
  </div>
</section>
```

✅ DO: 步骤 ≤6; 节点用 emoji 或图标; 每步只写动词短语  
✅ DO: label 控制在 8 个汉字内 (节点限宽 132px, 超出会自动折行, 3 行以上会显得头重脚轻)  
❌ DON'T: 不要在工作流内嵌长段文字  
❌ DON'T: label 里不要手写 `<br>` 强制换行 — 组件已按 132px 自动折行, 手动换行会让各节点高度参差

---

### § 5 时间轴 (.timeline) — 横向

```html
<section>
  <h2>生成式 AI 发展里程碑</h2>
  <div class="timeline">
    <div class="timeline__item">
      <div class="timeline__dot"></div>
      <div class="timeline__period">2017</div>
      <div class="timeline__label">Transformer 架构<br>发布</div>
    </div>
    <div class="timeline__item timeline__item--secondary">
      <div class="timeline__dot"></div>
      <div class="timeline__period">2020</div>
      <div class="timeline__label">GPT-3 问世</div>
    </div>
    <div class="timeline__item timeline__item--accent">
      <div class="timeline__dot"></div>
      <div class="timeline__period">2022</div>
      <div class="timeline__label">ChatGPT 发布</div>
    </div>
    <div class="timeline__item">
      <div class="timeline__dot"></div>
      <div class="timeline__period">2024</div>
      <div class="timeline__label">多模态 AI<br>普及</div>
    </div>
  </div>
</section>
```

✅ DO: 节点 4~6 个; period 用年份或简短日期; label ≤2 行  
❌ DON'T: 不要让时间轴超过画面宽度 (节点 >6 时改用竖向或分页)

---

### § 6 四象限矩阵 (.quadrant)

```html
<section>
  <h2>AI 风险评估矩阵</h2>
  <div class="quadrant">
    <div class="quadrant__axis-label">
      <span>← 低影响</span>
      <span>高影响 →</span>
    </div>
    <div class="quadrant__cells">
      <div class="quadrant__cell quadrant__cell--a">
        <div class="quadrant__cell-title">监控</div>
        <p class="quadrant__cell-items">高概率 · 低影响<br>建立预警机制</p>
      </div>
      <div class="quadrant__cell quadrant__cell--b">
        <div class="quadrant__cell-title">优先处理 ⚡</div>
        <p class="quadrant__cell-items">高概率 · 高影响<br>立即制定应对计划</p>
      </div>
      <div class="quadrant__cell quadrant__cell--c">
        <div class="quadrant__cell-title">可接受</div>
        <p class="quadrant__cell-items">低概率 · 低影响<br>定期复查即可</p>
      </div>
      <div class="quadrant__cell quadrant__cell--d">
        <div class="quadrant__cell-title">应急预案</div>
        <p class="quadrant__cell-items">低概率 · 高影响<br>制定预案但无需常态关注</p>
      </div>
    </div>
    <div class="quadrant__axis-label">
      <span>← 低概率</span>
      <span>高概率 →</span>
    </div>
  </div>
</section>
```

✅ DO: 每格 ≤3 行文字; 轴标签说明维度; 可内嵌 SVG 替换 CSS 轴线  
❌ DON'T: 不要在格内放项目符号列表 (会很挤); 不要省略轴标签

---

### § 7 统计数字墙 (.stats-wall)

```html
<section>
  <h2>AI 对 HR 工作的影响</h2>
  <div class="stats-wall">
    <div class="stat-item">
      <span class="stat-item__number">85%</span>
      <span class="stat-item__label">的 HR 认为 AI 将改变招聘方式</span>
      <span class="stat-item__source">LinkedIn 人才趋势报告 2024</span>
    </div>
    <div class="stat-item stat-item--accent">
      <span class="stat-item__number">3×</span>
      <span class="stat-item__label">AI 辅助简历筛选比人工快 3 倍</span>
    </div>
    <div class="stat-item stat-item--secondary">
      <span class="stat-item__number">62%</span>
      <span class="stat-item__label">企业计划 2025 年前增加 AI HR 工具投入</span>
      <span class="stat-item__source">Gartner 2024</span>
    </div>
  </div>
</section>
```

✅ DO: 数字 3~4 个; 数字后跟简短注释; 重要统计注明来源  
❌ DON'T: 不要超过 4 个数字 (画面太满); 数字不要超过 4 位 (用万/亿等缩写)

---

### § 8 引用金句 (.quote-slide)

```html
<section>
  <div class="quote-slide">
    <blockquote class="quote-slide__text">
      AI 不会取代人类，但懂得使用 AI 的人，会取代不懂的人。
    </blockquote>
    <div class="quote-slide__divider"></div>
    <cite class="quote-slide__source">— Kai-Fu Lee，创新工场创始人</cite>
  </div>
</section>
```

✅ DO: 引用 ≤30 字最佳; 来源真实可查; 适合模块开场和结尾  
❌ DON'T: 不要引用无法核实的话; 不要在引用页加其他内容

---

### § 9 案例卡 (.case-study)

```html
<section>
  <div class="case-study">
    <div class="case-study__header">
      <span class="tag">案例</span>
      <h3 class="case-study__title">某零售集团 AI 招聘转型</h3>
    </div>
    <div class="case-study__body">
      <div class="case-study__panel">
        <span class="case-study__panel-label">背景</span>
        <p>每年招聘 5000+ 名门店员工，HR 团队 8 人，筛选效率极低。</p>
      </div>
      <div class="case-study__panel">
        <span class="case-study__panel-label">挑战</span>
        <p>简历质量参差不齐，初筛占用 HR 60% 工时，offer 接受率仅 40%。</p>
      </div>
      <div class="case-study__panel case-study__panel--outcome">
        <span class="case-study__panel-label">结果</span>
        <p>引入 AI 筛选后，初筛时间缩短 70%，offer 接受率提升至 68%。</p>
      </div>
    </div>
  </div>
</section>
```

✅ DO: 三栏对应「背景/挑战/结果」或「情境/行动/结果」; 结果栏用主色背景突出  
❌ DON'T: 不要把案例和其他内容混在同一页

---

### § 10 图标卡片组 (.icon-card-grid) — *components.css*

```html
<section>
  <h2>AI 给 HR 带来的三大变化</h2>
  <div class="icon-card-grid">
    <div class="icon-card">
      <div class="icon-card__icon primary">🔍</div>
      <h3>精准匹配</h3>
      <p>从简历关键词到多维能力图谱</p>
    </div>
    <div class="icon-card">
      <div class="icon-card__icon accent">⚡</div>
      <h3>效率提升</h3>
      <p>筛选时间缩短 70%</p>
    </div>
    <div class="icon-card">
      <div class="icon-card__icon secondary">📊</div>
      <h3>数据决策</h3>
      <p>用数据替代直觉和偏见</p>
    </div>
  </div>
</section>
```

✅ DO: 每组 3~4 张; 图标语义准确; 每张 ≤2 行说明  
❌ DON'T: 不要超过 4 张 (画面太满)

---

### § 11 表格对比 (.table-compare)

```html
<section>
  <h2>三种绩效评估方式对比</h2>
  <table class="table-compare">
    <thead>
      <tr>
        <th>维度</th>
        <th>传统打分</th>
        <th class="col--highlight">OKR</th>
        <th>AI 辅助</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>评估频率</td>
        <td>年度</td>
        <td class="col--highlight">季度</td>
        <td>实时</td>
      </tr>
      <tr>
        <td>主观程度</td>
        <td>高</td>
        <td class="col--highlight">中</td>
        <td>低</td>
      </tr>
      <tr>
        <td>实施成本</td>
        <td>低</td>
        <td class="col--highlight">中</td>
        <td>高(初期)</td>
      </tr>
      <tr>
        <td>员工接受度</td>
        <td>低</td>
        <td class="col--highlight">高</td>
        <td>待培养</td>
      </tr>
    </tbody>
  </table>
</section>
```

✅ DO: 列数 ≤4; 行数 ≤6; 用 `col--highlight` 标出推荐列; 第一列是对比维度  
❌ DON'T: 不要把表格塞满整页

---

### § 12 检查清单 (.check-list) — *来自 standard.css*

```html
<section>
  <h2>AI 提示词质量自检清单</h2>
  <ul class="check-list">
    <li>指定了 AI 的角色和背景</li>
    <li>明确了输出格式 (列表/段落/表格)</li>
    <li>提供了 1~2 个示例 (few-shot)</li>
    <li>设置了字数或长度限制</li>
    <li>说明了受众是谁</li>
  </ul>
</section>
```

✅ DO: 条目 ≤7 条; 每条以动词或名词短语开头; 配合 `.fragment` 逐条显示  
❌ DON'T: 不要把清单做成段落文字

---

### § 13 模块小结 (.key-takeaway)

```html
<section>
  <div class="key-takeaway">
    <span class="key-takeaway__label">本模块要点</span>
    <h2 class="key-takeaway__title">AI 不替代判断，它放大判断</h2>
    <ol class="key-takeaway__list">
      <li>AI 擅长处理大量重复性信息筛选，人擅长情境判断与共情</li>
      <li>把 AI 当协作工具，而不是决策者</li>
      <li>数据质量决定 AI 输出质量——垃圾进，垃圾出</li>
    </ol>
    <div class="key-takeaway__next">下一步 → 下一模块将带你实操 AI 提示词设计</div>
  </div>
</section>
```

✅ DO: 要点 2~3 条; 标题是整个模块最核心的一句话; 结尾衔接下一模块  
✅ DO: `.key-takeaway__next` 的内容需**显式写"下一步 →"**（CSS 不自动加前缀）  
❌ DON'T: 不要把要点写成长句; 不要超过 3 条

---

### § 14 胶囊要点列表 (.pill-list)

```html
<section>
  <h2>五条 AI 使用原则</h2>
  <ol class="pill-list">
    <li>AI 输出必须经过人类判断后才能使用</li>
    <li>保护员工隐私数据，不送入公共 AI 服务</li>
    <li>定期校验 AI 结果的准确性和公平性</li>
    <li>向团队透明说明 AI 的使用方式</li>
    <li>建立 AI 使用日志和审计机制</li>
  </ol>
</section>
```

✅ DO: 条目 3~5 个; 每条 ≤20 字; 顺序有意义时用有序列表  
❌ DON'T: 不要超过 5 条 (改用两栏网格或分页)

---

### § 15 标注框 (.callout)

```html
<!-- 洞察 (默认 primary) -->
<div class="callout callout--insight">
  <span class="callout__icon">🔍</span>
  <div class="callout__body">
    <span class="callout__title">关键洞察</span>
    85% 的 HR 工作将被 AI 增强，而非被替代——关键在于如何重新定义 HR 的价值。
  </div>
</div>

<!-- 提示 (secondary 色) -->
<div class="callout callout--tip">
  <span class="callout__icon">💡</span>
  <div class="callout__body">
    <span class="callout__title">实践建议</span>
    下周在你的一个真实 HR 任务中尝试使用 AI，记录节省的时间。
  </div>
</div>

<!-- 警告 (accent 色) -->
<div class="callout callout--warning">
  <span class="callout__icon">⚠️</span>
  <div class="callout__body">
    <span class="callout__title">注意</span>
    未经验证的 AI 评分不应直接用于录用/淘汰决策。
  </div>
</div>
```

✅ DO: 每页最多 1 个 callout; 用于补充最重要的上下文或行动提示  
❌ DON'T: 不要把 callout 当正文容器来堆内容

---

### § 16 图文并排 (.layout-text-image)

```html
<section>
  <div class="layout-text-image">
    <div class="layout-text-image__content">
      <h2>AI 如何分析面试录像</h2>
      <ul>
        <li>情绪识别: 检测表情变化与紧张度</li>
        <li>语言流畅性: 语速、停顿、词汇丰富度</li>
        <li>内容相关性: 关键词与岗位要求匹配</li>
      </ul>
      <div class="callout callout--warning">
        <span class="callout__icon">⚠️</span>
        <div class="callout__body">面试 AI 存在潜在偏见，需结合人工复核使用。</div>
      </div>
    </div>
    <div class="layout-text-image__media">
      <img src="../assets/interview-ai.png" alt="AI 分析面试示意图">
    </div>
  </div>
</section>
```

✅ DO: 右侧必须是真实图片 (有实际 src); 左侧可以是文字 + 子组件组合  
❌ DON'T: 不要用占位符色块代替图片; 无图时改用 `.grid-2` 或其他组件

---

### § 17 高亮框 (.highlight-box) — *来自 standard.css*

```html
<div class="highlight-box">
  核心原则: 用 AI 扩展人的能力，而不是用 AI 绕过人的判断。
</div>
```

✅ DO: 用于页面内最重要的一句话; 放在页面底部或核心概念旁  
❌ DON'T: 每页只用一个; 不要用于列表内容

---

### § 18 代码块 / Prompt 示例 (.code-block) — *来自 standard.css*

```html
<div class="code-block">
  <pre>你是一位资深 HR 顾问。
请根据以下岗位描述，生成 5 个结构化面试问题，
每个问题后附上评分维度（满分 5 分）。

岗位: 产品经理
核心要求: 数据分析、跨部门协作、用户洞察</pre>
</div>
```

✅ DO: 展示真实可用的 Prompt; 代码用等宽字体; 适合 AI 课程实操环节  
❌ DON'T: 不要用代码块展示非代码内容

---

### § 19 结尾页 (.ending-slide) — *来自 standard.css*

```html
<section class="ending-slide">
  <h1>谢谢</h1>
  <div class="ending-slide__divider"></div>
  <p>问题 & 讨论</p>
  <p class="text-muted">联系方式: your@email.com</p>
</section>
```

---

### § 20 图片等式 (.img-equation) — *components.css*

多份原始素材 → 一个成品，用于展示「AI 一次合成」的结果。

```html
<section>
  <h2>场景④：图文一次出成品</h2>
  <div class="img-equation">
    <figure class="img-equation__item">
      <img src="assets/src-1.jpg" alt="住院结算单">
      <figcaption class="img-equation__caption">① 住院结算单</figcaption>
    </figure>
    <span class="img-equation__op">+</span>
    <figure class="img-equation__item">
      <img src="assets/src-2.jpg" alt="费用明细">
      <figcaption class="img-equation__caption">② 费用明细</figcaption>
    </figure>
    <span class="img-equation__op img-equation__op--eq">=</span>
    <figure class="img-equation__item img-equation__item--result">
      <img src="assets/output.jpg" alt="AI 生成的宣传长图">
      <figcaption class="img-equation__caption">一次生成的宣传长图</figcaption>
    </figure>
  </div>
</section>
```

✅ DO: 素材 2–3 份（含运算符最多 7 个直接子元素）；成品必须带 `--result`，它比素材大约 1.8 倍
且有主色描边；caption 控制在一行；素材图先压到 800px 内、成品压到 1100px 内再入库
❌ DON'T: 不要包 `__inputs` 中间层（会让入场动画退化成整块淡入）；不要用 `--result` 标两张图；
素材超过 3 份改用 `.grid-4` + 一句结论，等式排不下

尺寸令牌：`--img-equation-input-h` (190px) / `--img-equation-result-h` (340px)，在 `tokens.css`。
这两个值是「标题 + 等式 + 一个 callout」在 16:9 页面上的上限，再加内容就该拆页。

---

### § 21 提示词对比 (.prompt-compare) — *components.css*

承载**逐字原文**的提示词改前/改后对比。

```html
<section>
  <h2>同一个需求，两种提示词</h2>
  <div class="prompt-compare">
    <div class="prompt-compare__col prompt-compare__col--before">
      <div class="prompt-compare__label">❌ 第一次写的</div>
      <p class="prompt-compare__text">…提示词原文，100~200 字…</p>
      <div class="prompt-compare__verdict">数字全靠嘴报，三张图没交代分工</div>
    </div>
    <div class="prompt-compare__col prompt-compare__col--after">
      <div class="prompt-compare__label">✅ 改后</div>
      <p class="prompt-compare__text">…提示词原文…</p>
      <div class="prompt-compare__verdict">每张图的身份、主次、成品用途全部写死</div>
    </div>
  </div>
</section>
```

**与 `.vs-box--columns` 的分工**（别混用）：

| | `.vs-box--columns` | `.prompt-compare` |
|---|---|---|
| 放什么 | 提炼过的短句要点（≤4 条 li） | 未经改写的提示词原文 |
| 教学意图 | 讲清「差在哪几个维度」 | 让学员看见真实写法 |
| 字号 | 1rem | 0.9rem / 行距 1.85 |
| 密度 lint | 照常检查 | `__text` 豁免 long-paragraph |

✅ DO: 固定两栏（改前在左）；每栏底部用 `__verdict` 落一句判语，这是讲课的落点；
原文一字不改，包括错别字和口语
❌ DON'T: 不要放三栏；不要把原文改写成要点（那是 vs-box 的活）；
`__text` 超过 250 字就该截取核心段落，再长学员读不完

---

## 组合示例 — 一页内的 B 档自由组合

当没有现成组件时，用基础原子自由组合:

```html
<!-- 左文字列表 + 右统计数字 (自由组合) -->
<section>
  <h2>为什么 HR 需要学 AI？</h2>
  <div class="grid-2">
    <div>
      <ul>
        <li>AI 正在改写招聘、培训、绩效评估的规则</li>
        <li>不懂 AI 的 HR 会失去候选人最真实的行为数据</li>
        <li>掌握 AI 工具的 HR 效率提升 3 倍以上</li>
      </ul>
    </div>
    <div class="stats-wall" style="flex-direction:column">
      <!-- 用 stats-wall 放在网格右列 -->
    </div>
  </div>
</section>
```

> ⚠️ 上面示例里的 `style="flex-direction:column"` **违反铁律**——  
> 正确做法: 把这种布局变体沉淀成 `.stats-wall--vertical` 添加到 `components.css`

---

## 新组件沉淀规则

当你设计了一个好的定制布局并通过了 lint + 人工审阅:

1. 在 `shared_styles/components.css` 末尾添加新组件 CSS (只用 `var(--*)`)
2. 在本文件对应章节添加 HTML 片段示例 + do/don't
3. 若是块级组件, 把类名加进 components.css §N「相邻块组件的垂直呼吸」那张选择器表
4. 在 `animate-slides.js` 的 `CONTAINER_RULES` / `SOLO_BLOCKS` 补一条入场动画规则
5. 下次同类内容直接复用, 不要重发明

> 第 3 步的背景：`.reveal .slides>section` 是没有 `gap` 的 flex 列，块间距全靠组件自己的
> margin。历史上只有 `.workflow` 和 `.highlight-box` 写了外边距，于是两个都没写的组件
> 相邻会贴死——workbuddy slide-05 的 `.concept-card + .callout` 就撞上过。
> §N 那条规则是兜底，但它按类名点名，漏登记的新组件享受不到。

> 第 4 步别跳过。漏了不会报错——`nextcourse animate` 有通用兜底，
> 会给这一页的块级子元素挨个打 `fade-up`，并在输出里标 `⚙ 通用兜底`。
> 页面不会死板，但拿不到「左右对进」「沿流向推进」这类贴合结构的节奏。
> 看到那个标记，就是在提醒你这里缺一条规则。

> 第 3 步别跳过。漏了不会报错——`nextcourse animate` 有通用兜底，
> 会给这一页的块级子元素挨个打 `fade-up`，并在输出里标 `⚙ 通用兜底`。
> 页面不会死板，但拿不到「左右对进」「沿流向推进」这类贴合结构的节奏。
> 看到那个标记，就是在提醒你这里缺一条规则。

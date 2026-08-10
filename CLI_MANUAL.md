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
nextcourse new <course-name>
```

创建新课程目录结构：
- `courses/<course-name>/course.meta.md` — 课程大纲模板
- `courses/<course-name>/slides/` — 幻灯片目录
- `courses/<course-name>/assets/` — 资源目录

**示例：**
```bash
npm run new python-basics
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

### 交付工作流

#### `export` — 打包为可离线演示文件夹
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
node nextcourse.js shot python-basics --check
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
# 1. 创建新课程目录
npm run new my-course

# 2. 设计课程大纲（在 Claude Code 中）
# 运行: /course-design

# 3. 生成幻灯片（在 Claude Code 中）
# 运行: /slide-design my-course

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

# 9. 打包交付
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

## 环境要求

- **Node.js** 20.x
- **零 npm 依赖** —— 整套 CLI 只用 Node 内置模块（`fs` / `path` / `child_process` / `https`），
  clone 下来不用 `npm install` 就能跑。`npm run *` 只是 `node nextcourse.js *` 的快捷方式，
  不用 npm 也可以。
- **Chrome / Chromium / Edge**（仅 `shot` 命令需要；自定义路径用环境变量 `CHROME_PATH`）

---

## 更多信息

详细的项目设计和工作流说明见 [AGENT.md](./AGENT.md)。

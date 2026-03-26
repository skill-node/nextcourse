---
name: slide-renderer
description: 课件渲染引擎。将 content-design 生成的 script.md 转换为基于 Reveal.js 的专业 HTML 课件。支持 Standard/Modern 双轨制模板和 12+ 套视觉预设。使用 /slide-renderer 触发。
---

# 课件渲染引擎 (Slide Renderer)

## 目标

将 `script.md` 中的教学脚本精准转化为符合白名单协议的 Reveal.js HTML 课件。产出完整的离线演示网页，保留演讲者备注等授课功能。

## 核心原则

1. **零滚动** — 每页幻灯片必须在 100vh 内完整展示，严禁垂直滚动条
2. **组件白名单** — 只使用已定义的 CSS 组件类名，确保一致性
3. **视觉卓越** — 融合 frontend-slides 的动画和设计质感，拒绝平庸
4. **离线可用** — 所有资源本地化，脱离网络即可运行

---

## 操作流程

### Step 1：读取 script.md

解析指定路径下的 `script.md` 文件：
- 提取 YAML frontmatter：`title`, `template`, `color-scheme`, `style-preset`
- 逐页解析 `[Slide N]` 结构：标题、内容、视觉组件、组件内容、演讲备注

### Step 2：选择模板与风格

根据 frontmatter 的 `template` 字段选择基础模板：
- `template: standard` → 使用 `resources/master_template.html`，链接 standard 主题
- `template: modern` → 使用 `resources/master_template.html`，链接 modern 主题

根据 `style-preset` 或 `color-scheme` 选择视觉预设：
- 如果指定了 `style-preset`，优先使用对应的预设 CSS
- 否则使用 `color-scheme` 对应的配色文件

### Step 3：组件匹配与 HTML 生成

针对每个 `[Slide]`，根据视觉组件字段匹配白名单组件：

1. 读取 `resources/component-library.html` 获取 HTML 模板片段
2. 根据组件类名选择对应模板
3. 填充标题、内容、图片等数据
4. 如有组件内容（JSON），解析并填充到对应位置

### Step 4：组装与输出

1. 在课程目录中创建 `index.html`
2. 复制 master 模板
3. 替换占位符：
   - `{{COURSE_TITLE}}` → 课程标题
   - `{{COLOR_SCHEME}}` → 配色文件名
   - `{{SLIDES_CONTENT}}` → 所有生成的 `<section>` 片段
4. 如果有 `style-preset`，在 `<head>` 中插入对应的预设内联样式
5. 在浏览器中打开 `index.html`

### Step 5：动画注入

根据 style-preset 的特征，为组件添加入场动画：
- 默认：`fragment fade-up` 渐进式显示（Reveal.js 内置）
- 可选：根据感觉匹配动画（参考下方动画指南）

---

## 资源路径约定

```
Course_Flow/
├── lib/                          # Reveal.js + FontAwesome（本地化）
├── shared_styles/
│   ├── base_layout.css           # 通用基础布局（含响应式规则）
│   ├── animations.css            # 动画工具库
│   ├── themes/
│   │   ├── standard.css          # Standard 风格主题
│   │   └── modern.css            # Modern 风格主题
│   └── color-schemes/
│       ├── standard-default.css  # Standard 默认配色
│       ├── default.css           # Modern 默认配色
│       ├── dark-ocean.css        # 深海配色
│       ├── warm-sand.css         # 暖沙配色
│       ├── high-contrast.css     # 高对比配色
│       ├── bold-signal.css       # 高对比深色 + 橙色
│       ├── electric-studio.css   # 黑白 + 蓝色强调
│       ├── creative-voltage.css  # 电蓝 + 荧光黄
│       ├── notebook-tabs.css     # 纸质 + 柔和色调
│       ├── swiss-modern.css      # 极简黑白 + 红色
│       └── dark-botanical.css    # 深色 + 暖色调
├── courses/
│   └── [course-name]/
│       ├── script.md             # 内容脚本
│       ├── index.html            # 渲染产出
│       └── assets/               # 图片资源
└── .agent/skills/slide-renderer/
    └── resources/
        ├── master_template.html      # Reveal.js 骨架
        └── component-library.html    # 白名单组件 HTML 模板
```

**路径规则**：课件中所有静态资源引用路径从 `courses/[name]/` 向上跳两级：
- Reveal.js: `../../lib/dist/reveal.css`
- 主题样式: `../../shared_styles/themes/standard.css`
- 配色: `../../shared_styles/color-schemes/[scheme].css`
- 图片: `./assets/[image]`

---

## 白名单组件 HTML 模板

> 在生成 HTML 时，参考 `resources/component-library.html` 中的完整模板。以下为快速索引：

### 封面页 (.cover-slide)
```html
<section class="cover-slide">
    <h1>课程标题</h1>
    <h2>副标题</h2>
    <p>描述文字</p>
    <aside class="notes">演讲备注</aside>
</section>
```

### 模块封面 (.module-cover .module-N)
```html
<section class="module-cover module-1">
    <h1>模块标题</h1>
    <p>模块说明</p>
</section>
```

### 两栏布局 (.grid-2)
```html
<section>
    <h2>页面标题</h2>
    <div class="grid-2">
        <div>左侧内容</div>
        <div>右侧内容</div>
    </div>
    <aside class="notes">演讲备注</aside>
</section>
```

### 三栏布局 (.grid-3)
```html
<section>
    <h2>页面标题</h2>
    <div class="grid-3">
        <div class="card">卡片1</div>
        <div class="card">卡片2</div>
        <div class="card">卡片3</div>
    </div>
</section>
```

### 图文混排 (.layout-img-left / .layout-img-right / .layout-img-top)
```html
<section>
    <h2>页面标题</h2>
    <div class="layout-img-left">
        <div class="img-container">
            <img src="./assets/image.png" alt="描述">
        </div>
        <div>
            <h3>内容标题</h3>
            <p>内容描述</p>
        </div>
    </div>
</section>
```

### 对比组件 (.vs-good / .vs-bad)
```html
<div class="grid-2">
    <div class="vs-bad">
        <h3>负面示例</h3>
        <ul><li>要点</li></ul>
    </div>
    <div class="vs-good">
        <h3>正面示例</h3>
        <ul><li>要点</li></ul>
    </div>
</div>
```

### 工作流 (.workflow) — Modern 专属
```html
<div class="workflow">
    <div class="workflow-node">
        <i class="fas fa-cog"></i>
        <h4>步骤1</h4>
        <p>描述</p>
    </div>
    <div class="workflow-line"></div>
    <div class="workflow-node">
        <i class="fas fa-brain"></i>
        <h4>步骤2</h4>
        <p>描述</p>
    </div>
</div>
```

---

## 动画指南

### Reveal.js 内置动画

使用 Reveal.js 的 `fragment` 类实现渐进式显示：

```html
<!-- 依次显示 -->
<p class="fragment fade-up">段落1</p>
<p class="fragment fade-up">段落2</p>

<!-- 可用动画类型 -->
<!-- fragment fade-up / fade-in / fade-left / fade-right -->
<!-- fragment grow / shrink / zoom-in -->
<!-- fragment highlight-blue / highlight-red / highlight-green -->
```

### 自定义入场动画（animations.css）

切换到当前 slide 时自动触发：

```html
<!-- 从左滑入 -->
<div class="vs-bad animate-fade-left">...</div>

<!-- 从右滑入 -->
<div class="vs-good animate-fade-right">...</div>

<!-- 从下浮入 + 交错延迟（卡片依次入场）-->
<div class="card animate-fade-up stagger-1">卡片1</div>
<div class="card animate-fade-up stagger-2">卡片2</div>
<div class="card animate-fade-up stagger-3">卡片3</div>

<!-- 缩放入场 -->
<div class="animate-zoom-in">...</div>
```

### 背景装饰类

```html
<section class="bg-grid">  <!-- 科技感网格 -->
<section class="bg-glow">   <!-- 优雅光晕 -->
<section class="bg-dots">   <!-- 创意粒子 -->
```

### 感觉-动画匹配表

| 课程感觉 | 推荐动画 | CSS 增强 |
|----------|----------|----------|
| 专业/沉稳 | `fade-up`（200-300ms） | 无额外效果 |
| 科技/未来感 | `fade-up` + 霓虹光晕 | `box-shadow` 渐变发光 |
| 活泼/友好 | `zoom-in` + 弹性 | `bounce` 缓动函数 |
| 优雅/高端 | `fade-in`（慢速 0.8-1s） | 渐变背景 |
| 编辑/杂志 | `fade-up` + 交错延迟 | 粗体字下划线动画 |

### 背景增强（可选，根据 style-preset 添加）

```css
/* 渐变网格 — 适合科技感 */
.slide-bg-grid {
    background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 50px 50px;
}

/* 柔和光晕 — 适合优雅感 */
.slide-bg-glow {
    background:
        radial-gradient(ellipse at 20% 80%, rgba(120, 0, 255, 0.15) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(0, 255, 200, 0.1) 0%, transparent 50%);
}
```

---

## 配色方案速查

### 基础配色（无特殊字体）

| 方案 | 文件 | 适用模板 | 说明 |
|------|------|----------|------|
| `standard-default` | `standard-default.css` | Standard | 蓝/深灰/绿/橙 企业培训通用 |
| `default` | `default.css` | Modern | 浅色靛蓝 |
| `dark-ocean` | `dark-ocean.css` | Modern | 深蓝黑，投影仪暗场 |
| `warm-sand` | `warm-sand.css` | Modern | 暖米色，护眼 |
| `high-contrast` | `high-contrast.css` | Modern | 纯白高对比 |

### 高级视觉预设（含 Google Fonts + 增强效果）

| 预设 | 文件 | 字体 | 风格 | 适用场景 |
|------|------|------|------|----------|
| `bold-signal` | `bold-signal.css` | Archivo Black + Space Grotesk | 深色高对比 + 橙色 | 高管演讲、影响力展示 |
| `electric-studio` | `electric-studio.css` | Manrope | 黑白 + 蓝色强调 | 精致产品演示、专业技术 |
| `creative-voltage` | `creative-voltage.css` | Syne + Space Mono | 电蓝 + 荧光黄 + 霓虹 | 创意分享、年轻受众 |
| `notebook-tabs` | `notebook-tabs.css` | Bodoni Moda + DM Sans | 纸质 + 柔和色调 | 工作坊、互动培训 |
| `swiss-modern` | `swiss-modern.css` | Archivo + Nunito | 极简黑白 + 红色 | 专业技术培训 |
| `dark-botanical` | `dark-botanical.css` | Cormorant + IBM Plex Sans | 深色 + 暖色调 | 高端场合、品牌展示 |

> **注意**：高级预设使用 Google Fonts 加载字体，需要网络连接加载字体。字体缓存后可离线使用。

---

## 结构性红线 (Hard Rules)

1. **颜色引用**：所有颜色必须通过 CSS 变量调用（`var(--xxx)`），严禁硬编码
2. **布局安全**：严禁产生垂直滚动条
3. **路径一致**：所有资源引用使用相对路径 `../../lib/`、`../../shared_styles/`
4. **字体规范**：使用系统中文字体 + 本地 FontAwesome 图标
5. **备注保留**：`<aside class="notes">` 用于演讲者备注（按 S 键查看）
6. **组件纯净**：只使用白名单中定义的组件类名

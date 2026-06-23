# CourseFlow V2 — 设计系统参考

> **唯一真相源。** `/slide-design` Skill 只读此文件。  
> 铁律: 只用登记的 class + `var(--*)` 令牌。禁止内联 `style=` / 写死十六进制颜色 / 声明新 `font-family`。  
> 违规由 `lint-slides.js` 自动拦截。

---

## 如何引用设计系统

每个 `slides/*.html` 片段会由 `build.js` 组装进 `deck.html`,deck.html 已包含以下 CSS(按此顺序):

```
shared_styles/base_layout.css
shared_styles/color-schemes/<theme>.css
shared_styles/tokens.css
shared_styles/themes/standard.css
shared_styles/components.css
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
| `var(--primary)` | `var(--text-inverse)` | card-primary、module-divider、case-study__panel--outcome |
| `var(--module-N)` | `var(--text-inverse)` | module-divider 彩色章节页 |

`components.css` 的 §0b 已为 `standard.css` 的缺口补上了显式 color 声明。新组件请严格遵守此表。

---

## 颜色令牌速查 (color-schemes/*.css 中定义)

| 令牌 | 语义 |
|---|---|
| `var(--primary)` | 主色 — 标题、强调、数字、边框 |
| `var(--primary-dark)` | 深主色 — 封面标题、深色背景 |
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

## 间距令牌速查 (tokens.css 中定义)

`--space-1(4px)` `--space-2(8px)` `--space-3(12px)` `--space-4(16px)` `--space-5(20px)` `--space-6(24px)` `--space-8(32px)` `--space-10(40px)` `--space-12(48px)` `--space-16(64px)`

---

## 动画类 (animations.css)

```
.animate-fade-up    .animate-fade-left    .animate-fade-right    .animate-zoom-in
```

Reveal.js 逐步显示: 在元素上加 `class="fragment"`,可叠加动画类。

---

## 配色方案列表

| 方案名 | 适合场景 |
|---|---|
| `default` | 靛蓝 — 通用 |
| `bold-signal` | 深色 + 橙红 — 高管演讲、影响力展示 |
| `dark-ocean` | 深蓝 — 技术/AI 主题 |
| `dark-botanical` | 深绿 — 自然、可持续 |
| `electric-studio` | 亮色 + 电气蓝 — 创意、设计 |
| `creative-voltage` | 紫色 — 创新、新趋势 |
| `swiss-modern` | 黑白极简 — 管理、战略 |
| `warm-sand` | 暖米色 — 人文、HR 培训 |
| `notebook-tabs` | 米黄 + 色标签 — 工作坊、互动 |
| `standard-default` | 中性蓝灰 — 安全通用 |
| `high-contrast` | 纯黑白 — 无障碍 |

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

### § 4 流程步骤 (.workflow) — *来自 standard.css*

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
❌ DON'T: 不要在工作流内嵌长段文字

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

### § 10 图标卡片组 (.icon-card-grid) — *来自 standard.css*

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
3. 下次同类内容直接复用, 不要重发明

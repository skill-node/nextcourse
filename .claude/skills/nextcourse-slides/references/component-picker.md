# 组件选型与密度纪律

**进入 Phase 5（动手写 HTML）时读这一份，Phase 4 规划阶段用不上。**

组件的完整 HTML 片段和 do/don't 跑 `nextcourse docs design-system`。

## 选组件的决策树

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
  ├─ 课堂活动指令         → .activity-card          〔M/L 档，内容来自蓝图〕
  ├─ 考核评分标准         → .rubric-table           〔M/L 档，来自 package/3_rubric.md〕
  ├─ 模块小结            → .key-takeaway
  ├─ 左文右图            → .layout-text-image  (右侧必须有真实图片)
  ├─ 两栏等重内容         → .grid-2
  ├─ 三栏卡片            → .grid-3
  ├─ 章节分隔            → section.module-N > .module-divider
  └─ 补充说明/提示        → .callout  (.callout--tip / --warning / --insight)
```

题材不同，高频组件也不同（rubric ⑦「题材贴合」的依据）：`nextcourse docs domains` 的第二张表给出每个题材的高频组件与慎用项。

## 组件使用规则（lint 不检查，但必须遵守）

1. **`.concept-card__example` 只用于真正的示例 / 类比**
   - 补充说明、典型动作、核心模式等"说明文字"→ 改用 `.highlight-box`
   - "示例"标签**在 HTML 里显式写** `<strong>示例：</strong>`，CSS 不自动插入

2. **`.key-takeaway__next` 的"下一步 →"需在 HTML 里显式写**
   - 正确：`<div class="key-takeaway__next">下一步 → 实操任务</div>`
   - 错误：`<div class="key-takeaway__next">实操任务</div>`（CSS 不自动加前缀）

3. **同一 section 内的顶层子元素已有 `gap: var(--content-gap)` 自动间距**
   - 不需要给每个组件单独加 margin；但组件内部的子元素间距需看各组件定义

## 密度纪律（保证 slide 感）

- 一页一观点
- H2 标题 ≤15 字
- 正文条目 ≤6 个
- 每个条目 ≤20 字
- 禁止长段落（段落 >3 行时改为 ul / 组件）
- 演讲备注放在 `<aside class="notes">...</aside>`（不占页面空间）

> 字数上限按中日韩全角字计。换成英文等按词计的语言时按等宽折算，别照搬字数。

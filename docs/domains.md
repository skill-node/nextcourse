# 题材域适配表

> `nextcourse docs domains` 打印本文件。
>
> 这张表原先在 course-design 和 slide-design 两个技能里各存了一份投影，
> 内容重叠但字段不同，改一处忘一处。现在收在这里当唯一事实来源：
> 设计阶段看「教学形态重点 / Practice 形式 / 推荐 theme」，
> 做课件时看「高频组件 / 慎用」。

识别课程所属题材后，按此表调整引导重点、模块结构、配色与组件选择。**推荐值都可以被用户覆盖** —— 用户明确说了要什么，就按用户的来，不要拿这张表去争辩。

---

## 设计层（course.meta.md / course.blueprint.md 阶段）

| 题材 | 教学形态重点 | Practice 形式 | 推荐 theme |
|---|---|---|---|
| 领导力 / 软技能 | 案例讨论驱动：真实情境 → 多方视角 → 反思。Demo 页多用案例与金句，少用流程图 | 情境研讨、角色扮演、自评量表（不是"动手操作"） | `warm-sand` 或 `dark-botanical` |
| AI / 技术工具 | Demo 驱动：先看到效果再讲原理。每模块必须有可跟做的操作演示 | 动手任务 + 检查清单验收 | `bold-signal` |
| HR / 制度合规 | 场景判断驱动：对/错边界、政策条文 → 具体情境判断。多用对比和判断题 | 情景判断题、合规检查清单 | `standard-default` |
| 数据 / 分析 | 图表与数字驱动：结论先行，数据佐证 | 读图任务、指标计算 | `dark-ocean` |
| 创意 / 设计 | 视觉范例驱动：好坏对比、before/after | 点评练习、改稿任务 | `creative-voltage` |

其他风格补充：极简瑞士 `swiss-modern`（管理 / 战略）、手记粉彩 `notebook-tabs`（工作坊 / 互动）。全部 8 套配色见 `nextcourse docs agent` 的配色表。

**Bloom 分布的题材惯性**：领导力 / 合规类成果多落在 analyze / evaluate 层（判断与决策），技术类多落在 apply / create 层（操作与搭建）。如果起草的分布与这条惯性不符，向用户确认是否有意为之 —— 是确认，不是纠正。

---

## 课件层（写 slides/*.html 阶段）

| 题材 | 高频组件 | 慎用 |
|---|---|---|
| 领导力 / 软技能 | `.case-study` `.quote-slide` `.quadrant` `.vs-box` | 流程图、代码块 —— 软技能少有标准流程 |
| AI / 技术工具 | `.workflow` `.timeline` `.check-list` `.stats-wall` | 长引用 —— 技术课要"看得见操作" |
| HR / 制度合规 | `.vs-box`（对/错边界） `.table-compare` `.callout--warning` | 夸张视觉冲击 —— 合规内容要克制 |
| 数据 / 分析 | `.stats-wall` `.table-compare` `.quadrant` | 纯文字页 —— 数据课让数字说话 |
| 创意 / 设计 | `.layout-text-image` `.vs-box`（before/after） | 密集表格 |

组件的完整定义与用法见 `nextcourse docs design-system`。

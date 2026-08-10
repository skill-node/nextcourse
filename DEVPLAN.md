# NextCourse v2 开发计划(合并版)

> 本文件合并两份输入:
> 1. 仓库根目录 `2.0devplan.md`(逐文件诊断 + 教学模型选型 + JSON/TS 重构方案)
> 2. v2 分支前期的架构 Review(根因分析 + agent-native + 视觉自校验路线)
>
> 已确认的方向(用户拍板):**Agent/CLI 驱动 · 改造现有静态 HTML 管线 · Claude 模型驱动并做视觉自校验。**
> `2.0devplan.md` 保留为输入归档,本文件为唯一执行计划。

---

## 1. 背景与目标

NextCourse 的目标:**从课程想法 → 课程大纲 → HTML slide 的完整流程。** 用 HTML(而非 PPT)呈现,因为 HTML 表达力强、可精确控制、可离线运行。

当前 V1 在交互、思路讨论、大纲形成、slide 生成四方面都不理想。本计划是一次以"解决项目目标"为出发点的重构,不受 V1 框架约束。

---

## 2. 诊断结论(两份分析的共识)

| 根因 | 证据 | 后果 |
|---|---|---|
| 自研 `script.md` DSL 是头号缺陷 | `parser.js:119` 双 try-catch 救 JSON;`server/index.js:503` 140 行 prompt 教格式 | AI 产出不可靠、解析脆弱 |
| **DSL 把 HTML 表达力锁死成 ~12 组件** | `renderer.js:115` 硬编码 if 分发,白名单外全退化为 `<ul>` | slide 表达力被降维,立项前提失效 |
| AI 用错方式:单轮、无工具、看不到自己输出 | `/api/ai/chat`、`generate-script` 盲生成;`renderer.js:90` 密度告警补丁 | 内容溢出/撞色/层级乱无法自纠 |
| 规范在 4 处重复并已漂移 | SKILL ×2 + `ai-chat.js` + `server/index.js`;`视觉组件`vs`组件`、`neon-cyber` 不存在 | 多真相源 = 必然不一致 |
| 自建 SPA + 聊天代理过度工程 | `app.js` 1851 行、`server/index.js` 866 行(含重复 DELETE 路由) | 维护成本高,不解决对话质量 |
| `.agent/skills` 名不副实 | 只是 md 文档,无 agent 运行时调用 | "文档即代码"假象 |

---

## 3. 教学模型:逆向设计 + Bloom + Merrill(采纳自 `2.0devplan.md` §2)

放弃 ADDIE(瀑布、易产出"知识堆砌"、且 V1 的"四阶段"本就不是真 ADDIE)。改用**逆向设计**为骨、**Bloom 认知分层**校准难度、**Merrill 示范-练习-反馈**充实单模块体验。

这是解决"思路讨论 / 大纲形成效果不好"的核心。五阶段:

```
Phase 1 定位        谁在学 / 为什么学 / 一句话价值主张
Phase 2 行为成果 ★  学完能做哪 3-5 件事(动词开头)+ Bloom 层级 + 成功标准   ← 质量闸门
Phase 3 知识架构    达成目标需要哪些知识/技能 + 依赖关系 + 心智模型纠错
Phase 4 学习体验    每模块:Hook → Concept(+常见误解) → Demo → Practice → Key Takeaway
Phase 5 视觉呈现    slide 类型/版式匹配 + 配色模板 + 动画策略
```

**Phase 2 是闸门:** 若行为目标大多停留在记忆-理解层,Skill 必须提醒"课程可能太浅",回退重做。各阶段的具体引导话术见 §6 Skill 定义。

---

## 4. 目标架构

```
想法
 └─[/course-design] ── Phase 1-3 ─► course.meta.md  (定位/行为成果/大纲, 结构化可校验)  ← 人审
 └─[/slide-design]  ── Phase 4-5 ─► slides/*.html   (agent 直写 HTML, 设计系统约束)
                                        ▲    │
                                        │    ▼  build → Playwright 逐页截图
                                        └──── 看截图: 溢出?撞色?层级?留白? → 改 (循环)
                                             │
                                             ▼
                                         deck.html  (零依赖离线交付)
```

三个决定性变化:
1. **教学结构结构化、可校验**(采纳 devplan 可靠性洞见);**slide 是 HTML 而非封闭 schema**(解除表达力天花板)。
2. **锁死风格、放开布局(B 档)** —— 见 §4.1,这是本项目的核心设计原则。
3. **视觉自校验闭环** —— 模型终于看得见自己的产物,这是质量最大杠杆。

### 4.1 核心原则:锁死风格,放开布局(B 档)

V1 的 12 组件方案把两件本该分开的事**捆在一起锁死**,导致布局表达力被钉死。本项目把它们拆开:

| 层 | 策略 | 内容 |
|---|---|---|
| **风格层(look)** | **锁死** | 字体、配色令牌、间距刻度、卡片质感、阴影、圆角、动画词汇、16:9 画布、页眉页脚。这是用户筛选的审美与"deck 感"来源,**只能引用不能新造**。 |
| **布局层(composition)** | **放开(受控)** | 内容怎么排——两栏、时间轴、象限、对比、统计墙、带标注图示。agent 自由组合,但只能用设计系统的令牌与组件。 |

**B 档定义:** 组件库覆盖 ~80% 常见页(成品组件);遇到放不进去的长尾,允许 agent 用**令牌 + 基础原子(网格/卡片/排版)**组合定制布局,风格仍被令牌 + linter 锁死;好布局沉淀回组件库,词汇越用越丰富。

**"slide 感"保证(与 markdown/HTML 之争无关):** 全屏、翻页、入场/翻页动画、演讲者备注、单机离线、可拷贝,全部由 **Reveal.js 外壳 + 固定 16:9 画布**保证;一屏一观点、不滚动、内容稀疏,由**画布锁定 + 教学模型 Phase 4 一句话 Key Takeaway** 的密度纪律保证。无论 section 由谁写,产物都是 keynote 式课件而非网页。

**一致性靠"约束 + 检查"而非"构造即保证":** 放开布局的代价是不再像 12 模板那样"只可能产出 12 种长相"。用 §6.2 的 linter(卡样式)+ §7 的视觉回环(卡审美一致性)把偏离风险压到很低。

---

## 5. 关键设计决策(及与 `2.0devplan.md` 的分歧)

| 议题 | `2.0devplan.md` 主张 | 本计划决定 | 理由 |
|---|---|---|---|
| slide 表达 | `course.json` + Zod 封闭 11 类型 + Handlebars | **锁死风格 + 放开布局(B 档):令牌/组件锁死,布局自由组合**(§4.1) | 封闭 schema 把风格与布局捆死,重锁表达力(同 12 组件天花板);B 档只锁风格、放开布局,既保审美又解天花板 |
| 教学结构表达 | 同上塞进 `course.json` | **`course.meta.md`(frontmatter + markdown)结构化、可校验** | 内容规整处保留可靠性红利;长文叙述用 md 比 JSON 友好、diff 友好 |
| 可靠性来源 | Zod 静态校验 | **视觉回环 + 轻量校验**(密度/资源/必填) | agent 能渲染回看自纠,封闭 schema 不再必要 |
| 语言/工具链 | 全量 TS 重写 + Commander + Handlebars | **沿用 Node/JS 增量改造**,新增极少脚本 | "改造现有管线"而非另起;降低迁移风险,先验证质量再谈工程化 |
| Reveal.js | 改 npm 依赖 | **保留 vendored `lib/`** | 离线零依赖是硬需求,交付物自带全部资源 |
| 视觉回环 | 无 | **一等公民**(`shot` 命令 + skill 内置批判) | 用户明确选择,质量最大杠杆 |
| 教学模型 | 逆向设计+Bloom+Merrill | **全盘采纳** | 直击思路/大纲质量问题 |

> 工程化(TS/Zod/Handlebars)不是被否决,而是**推迟**:先用最小改造跑通"agent 直写 HTML + 视觉回环 + 五阶段引导",拿到质量对比证据后,再决定是否值得引入 TS 重写。见路线图 Phase D。

---

## 6. 工件、目录与 Skill

### 6.1 每门课的工件

```
courses/<name>/
  course.meta.md   # Phase 1-3: frontmatter(title/template/theme) + 定位/行为成果/大纲
  slides/          # Phase 4-5: section_01.html ... 每页一个 HTML 片段
  deck.html        # 组装后的离线 Reveal 课件(交付物)
  assets/          # 图片
  .review/         # 截图自校验中间产物(PNG + 批注), gitignore
```

`course.meta.md` 示例(frontmatter 可被轻量校验):
```markdown
---
title: ...
template: standard
theme: bold-signal
audience: ...
positioning: 一句话价值主张
outcomes:
  - { do: "动词开头的行为", bloom: apply, success: "成功标准" }
---
## 大纲
### 模块一 ...
- 课时 / Hook / Key Takeaway ...
```

### 6.2 单一真相源:设计系统(令牌 + 组件 + 文档 + linter)

把散落 4 处的规范合并成**一套**设计系统,作为 `/slide-design` 读取的唯一参考:

- `tokens.css` —— 配色/字体/间距令牌(`var(--*)`),**锁死,只能引用不能新造**(11 套配色按此组织)
- `components.css` —— 用户审定的成品组件类(覆盖 ~80% 常见页)+ 基础原子(网格/卡片/排版),供 B 档自由组合
- `DESIGN-SYSTEM.md` —— 每个组件配可复制 HTML 片段 + do/don't + 适配哪套配色 + 排版/留白约束 + 动画类
- **`lint-slides` 校验** —— 扫描 `slides/*.html`,发现内联 `style=`、写死 hex 颜色、`font-family`、或未登记 class → 打回。**从机制上保证 agent 不能破坏审美**(B 档一致性的第一道闸)。

顺手修掉 `视觉组件`/`组件` 漂移与 `neon-cyber` 缺失。

### 6.3 Skills(取代自建聊天 + 4 处 prompt)

**`/course-design <主题>` — Phase 1-3 → `course.meta.md`**
- Phase 1 定位:学员日常最痛苦的是什么?什么场景会用到?学完能做什么、不再受什么困扰?
- Phase 2 行为成果(闸门):学完能做哪 3-5 件事(动词开头)?各属 Bloom 哪层?多在记忆-理解层则提醒太浅。
- Phase 3 知识架构:达成每个目标需要哪些知识?有无严格先后?最常见的心智模型错误?
- 每阶段结束人审确认后落盘。

**`/slide-design <课程名>` — Phase 4-5 → `slides/*.html` + `deck.html`**
- 读 `course.meta.md` 大纲 → 逐模块设计学习体验(Hook→Concept→Demo→Practice→Takeaway)
- 按内容选版式(B 档):常见类型直接取 `components.css` 成品组件;长尾用令牌 + 原子组合定制布局
- **铁律**:只用登记的 class + `var(--*)`,禁内联 style / 写死颜色 / 新字体(由 `lint-slides` 兜底)
- 写完即跑 `lint-slides` + 视觉回环(§7),按截图自我批判并修正,直到通过
- 效果好的定制布局,沉淀回 `components.css` + `DESIGN-SYSTEM.md` 成为正式组件
- 全程 HTML,资源相对路径,离线可用

### 6.4 Skill vs 自建聊天

| 维度 | 自建聊天(V1) | Claude Code Skill |
|---|---|---|
| 模型 | DeepSeek 单轮 | Claude Opus/Sonnet + 工具 + 视觉 |
| 工具 | 无 | 读写文件、跑渲染、看截图、迭代 |
| 代码 | ~2700 行 JS | 几个 md + 少量脚本 |
| 维护 | 改前端 prompt | 改 markdown |

---

## 7. 视觉自校验闭环(质量核心)

```
agent 写 slides/*.html
  → node lint-slides <course>   # 样式闸: 内联style/写死颜色/新字体/未登记class → 打回
  → node build.js <course>      # 纯组装: meta frontmatter + 片段 → deck.html (无 DSL 解析)
  → 用户本地浏览器打开 deck.html 浏览/审阅
  → 反馈问题页(溢出?撞色?层级?留白?slide感?)
  → agent 定位问题 → 改 HTML → 重新 lint/组装
  → 用户确认通过为止
```

**批判 rubric(人审时对照):** ① 溢出/不滚动 ② 撞色(对比度) ③ 层级清晰 ④ 留白/对齐 ⑤ **审美一致性**(和全 deck 同一套主题) ⑥ **slide 感而非网页感**(稀疏、大字、一屏一观点) ⑦ 是否贴合 AI/HR 题材表达。

- 取代 V1 "盲生成 + 6 条密度告警补丁"和 Playwright 截图方案:本地浏览器直接反馈效率更高、无需无头浏览器依赖。
- `lint-slides` 是第一道闸(机制层),人审是第二道闸(感知层)。

---

## 8. 需新建 / 删除

**新建(极少):**
- 设计系统:`tokens.css` + `components.css`(整理自 `shared_styles/`)+ `DESIGN-SYSTEM.md`
- `lint-slides.js`(样式锁:内联 style / 写死颜色 / 新字体 / 未登记 class → 打回)
- `build.js`(组装,比现 `renderer.js` 简单一个量级)
- `skills/course-design.md`、`skills/slide-design.md`
- 轻量校验:density / 资源存在 / frontmatter 必填(可后置)

**保留(真资产):** `shared_styles/`、`lib/`(离线 Reveal+字体)、`courses/`(回归样本)、"一课一目录"。

**删除(确认新管线稳定后):** `bin/lib/parser.js`、`renderer.js` 组件分发、整个 `server/`、`server/public/js/*`、自研 `[Slide N]` DSL、4 处重复 prompt、`.ai_session.json`/`.ai_context.json`(对话由 Claude Code 管理)。

---

## 9. 路线图(降风险:新旧并存,验证后再删)

> 全程在 `v2` 分支。旧管线保留可跑,直到新管线质量验证通过再删。

**Phase A — 设计系统(令牌 + 组件库 + 文档 + linter)(1 天)** ✅ 完成
- [x] 拆出 `shared_styles/tokens.css`(间距/圆角/动画/组件尺寸令牌,锁死)
- [x] `shared_styles/components.css` — 19 个 B 档组件(词汇表已用户确认):layout-text-image、vs-box--columns、vs-neutral、module-divider、concept-card、stats-wall、quote-slide、timeline、quadrant、case-study、table-compare、key-takeaway、pill-list、callout、badge、grid-4、icon-text、divider-h 等
- [x] `DESIGN-SYSTEM.md` — 每个组件含可复制 HTML 片段 + do/don't + 组合示例 + 沉淀规则
- [x] `lint-slides.js` — 拦截 inline-style / hardcoded-hex / hardcoded-rgb / new-font / unknown-class，自动从设计系统 CSS 提取白名单，测试通过
- [x] 视觉回环改为本地浏览器人审(去掉 Playwright/shot.js)
- 验收 ✓: linter 能正确拦截 4 类违规并报告；组件覆盖 AI/HR 题材所有常见页型

**Phase B — slide 出片闭环** ✅ 完成
- [x] `build.js` 跑通（视觉回环改为本地浏览器人审，去掉 shot.js）
- [x] `skills/slide-design.md`（Phase 4-5 + B 档组合规则 + lint + 视觉回环 rubric）
- [x] `openclaw_2` 课程 25 张幻灯片按 B 档出片，用户浏览器验证通过
- 验收 ✓：lint 全部通过，build 成功，用户人审质量确认

**Phase C — 课程设计引导** ✅ 完成
- [x] `skills/course-design.md`（逆向设计 + Bloom + Merrill 五阶段 + 引导话术）
- [x] 轻量校验：frontmatter 必填由 build.js 读取时自然暴露，无需独立校验器
- 验收 ✓：`/course-design` 触发五阶段对话式引导，输出 `course.meta.md`

**Phase D — 收尾与工程化** ✅ 完成
- [x] 删除旧管线：`server/`（V1 SPA + Express）、`bin/`（V1 parser/renderer）已删除
- [x] 删除 `.agent/`（V1 Skills），已从 git 移除并加入 gitignore
- [x] 课程内容（`courses/`）移出 git 跟踪，加入 gitignore
- [x] CLI 化：`nextcourse.js` 统一入口（list / new / lint / build / render / export）
- [x] `export.js`：离线打包（路径修正 + 拷贝 lib/ + shared_styles/）
- [x] `AGENT.md`：全 agent 兼容的完整项目文档
- [x] 分支整理：`v1` 保留历史，`main` = V2 主线，`v2` 分支已删除
- [ ] TS + Zod：**评估后跳过** — agent 自纠 + lint 已足够可靠，引入 TS 重写收益不足以覆盖迁移成本
- [ ] PDF/PPTX 导出：**推迟** — 需 headless 浏览器依赖，待有实际需求时再做
- [ ] 课程模板库：**推迟** — `openclaw_2` 作为参考样本，模板库待积累后提炼

---

## 10. 不做的事(边界,采纳自 `2.0devplan.md`)

- ❌ Web SaaS / 认证 / 数据库 / 多租户
- ❌ 拖拽式 WYSIWYG 编辑器
- ❌ 多人实时协作
- ❌ 代码内集成 LLM API(对话交给 Claude Code)
- ❌ 复杂 SPA(删除所有前端 UI 代码)

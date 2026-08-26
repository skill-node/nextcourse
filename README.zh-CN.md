# NextCourse

**一个先陪你设计课程，再把课件和整套交付包一起做出来的智能体。**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-20.x-informational.svg)](https://nodejs.org)
[![Dependencies: zero](https://img.shields.io/badge/npm%20dependencies-0-success.svg)](./package.json)
[![Output](https://img.shields.io/badge/output-Reveal.js%20deck%20%2B%20delivery%20pack-orange.svg)](https://course.skillnode.ai/package/)

[English →](./README.md) · [在线看一门完整的 29 页课 ↗](https://course.skillnode.ai/demo/) · [在线看一套 9 份的交付包 ↗](https://course.skillnode.ai/package/) · [主题展板 ↗](https://course.skillnode.ai/gallery/)

---

作为职业讲师，一年要交付几十场培训。真正花时间的从来不是讲台上那两小时，是备课：定位反复摇摆、
学习成果写成一句正确的废话、幻灯片改到半夜还是不像样。同一门课换个受众，又几乎从头再来一遍。

**NextCourse 的大部分力气都花在幻灯片之前那一段：** 课程定位、学习成果、知识架构。
那部分想通了，幻灯片只是顺手的事 —— 而且它是被大纲**推导**出来的，不是被套模板套出来的。

## 这不是一个 PPT 生成器

网上已经有太多把主题变成幻灯片的智能体和 skill 了。那是这件事里较小的一半，
也是 NextCourse 花力气最少的一半。

|  | PPT 生成器 | NextCourse |
|---|---|---|
| **起点** | 「我已经想清楚了」 | 「我要设计一门课」 |
| **输入** | 你写好的主题或提纲 | 一场对话，一次问一件事 |
| **决定什么** | 排版 | 受众、成果、顺序 —— **然后**才是排版 |
| **教学设计** | 没有建模 | Bloom 分层成果、Merrill 第一性原理 |
| **产物** | 一份课件 | 一份能审、能改、能进版本库的大纲，再由它推导出课件 |

PPT 生成器的前提是你已经知道这门课讲给谁、要让人学会什么、内容该怎么排。
可这恰恰是备课里最难、最耗时、也最容易糊弄过去的一段。

课程设计的判断仍然由你来做。它负责的是把这些判断一条条问清楚、记下来，然后严格地执行。

## 课程设计：一次问一件事

在 Claude Code 里运行 `/course-design`。全程对话式，最后落成一份人能读、能改、
能进版本库的文件，而不是一个不透明的黑箱。

**0 · 规格与需求诊断** —— 第一个问题是「这门课多长、什么场合」，因为它决定后面要问多少东西。
30 分钟的公开分享和一天的企业内训，需要的设计深度差一个量级，用同一套流程伺候两者，
不是把轻的搞重，就是把重的做浅（见下节「分档」）。
内训档还会追问一件很多人不问的事：**本期明确不做什么**——只问「要什么」不问「不要什么」，
课程一定会越做越胖。

**1 · 定位** —— 受众是谁、在什么场景下用、为什么是这门课而不是别的。
它先问一两个问题就停下来等你，不会一口气吐出一整份方案让你被动接受。

**2 · 学习成果** —— 3–5 条，每条用 Bloom 动词开头，并配一条成功标准。
这是整门课的地基，后面所有东西都从这里推导：

```yaml
# course.meta.md
outcomes:
  - do:      "判断一项日常工作是否值得交给智能体"
    bloom:   analyze
    success: "对给定的 3 个工作场景说出该用聊天框、该用智能体、
              还是不该用 AI，并讲出理由"
```

`do` 是动词开头的可观察行为，`bloom` 是认知层级，`success` 是验收标准。
「让学员了解 AI 的应用」不是学习成果，是一句没法验收的话 —— 成果必须能写出考题。
三条成果如果全停在「记住 / 理解」，它会直接提醒你这门课可能太浅。
**这是个质量闸门，不是建议。**

**3 · 知识架构** —— 拆模块，模块内部按 **Hook → Concept → Demo → Practice → Takeaway**
（Merrill 第一性原理）排布，每个模块只留一句学员离场时说得出的话。

### 一条自己踩出来的规矩：骨架与案例分层

同一门课常常要讲给不同行业的人听。如果行业案例渗进了通用模块，换一次受众就等于重写一门课。
所以大纲里会写死一条约束：**通用骨架的模块不许出现行业案例**，案例集中在一个模块里 ——
换受众时只重写那一层。

## 分档：轻的保持轻，重的才上重装备

一门 60 分钟的公开分享，不需要柯氏评估、不需要考核量规、不需要学员手册。
硬套一整套企业内训的方法论，只会把工具变成负担。所以有三档：

| 档位 | 适用 | 产出 |
|---|---|---|
| **S · 分享课**（默认） | 30–90 分钟，公开课 / 内部分享 | `course.meta.md` + 课件 |
| **M · 内训课** | 半天 ~ 一天，企业内训 | ＋设计蓝图 ＋交付包 |
| **L · 培训项目** | 训练营 / 体系化项目 | ＋运营、TTT、实施路线图 |

`nextcourse new <name>` 不带参数就是 S 档，**行为与升级前一字不差**——
这是硬约束，轻量场景不该为了别人的复杂度付费。要内训档加 `--scale M`。

## 企业内训：从大纲到交付包

真实的内训交付，课件只是其中一件。学员手册、练习数据包、评分量规、评估问卷、
行动承诺书——这些才是「这门课能不能落地」的分水岭。

`/course-delivery <课程名>` 接着 `/course-design` 往下做：教学互动设计、
柯氏评估方案（**默认只做 L1 + L2**，L3/L4 要先确认基线数据由谁提供）、内容开发计划。
然后一条命令交出整包：

```bash
node nextcourse.js package <name> --render
```

```
package/
├── 1_facilitator-guide.md  讲师手册（逐模块讲授要点 / 活动指令 / 幻灯片备注）
├── 2_workbook.md           学员手册（练习任务 / 填写区 / 自检清单）
├── 3_rubric.md             考核量规（维度 × 等级，每格都是可观察行为）
├── 4_action-plan.md        学员 30 天行动承诺书
├── 5_assessment.md         评估方案（L1 问卷 + L2 考核）
├── 6_facilitation.md       教学设计（时间轴 / 分组 / 积分规则）
├── 7_alignment.md          对齐矩阵（由 check 生成）
├── 8_content-dev.md        内容开发计划（SME 访谈 / 案例库 / 脱敏规则 / 排期）
└── html/                   客户实际拿到的东西：双击即读，打印不掉样式，封面是 0_index.html
```

**md 是源，HTML 是交付物** —— 和 `deck.html` 完全一样的心智模型：改内容一律改 md，
再重新渲染，HTML 永远不手改。渲染器是手写的受控子集（约 300 行），
因为这个项目**零 npm 依赖**是刻意的护城河，不会为了渲染 markdown 引一个包进来。

### 一个会报错的逆向设计

学习成果多写两个字段之后，「教了但不测、测了但没教」这件事就能被机器抓住：

```yaml
outcomes:
  - id: LO3
    do:       "使用办公智能体完成一项真实工作任务"
    bloom:    apply
    success:  "成品无需返工可直接使用"
    module:   3                        # 在哪个模块教
    evidence: "结营作战包 A 项"          # 用什么证据判定达成
```

`nextcourse check <name>` 校验的不是样式，是教学逻辑：

- 每条成果都有模块教到、有证据测到，缺一样就报错；
- 蓝图的模块清单、大纲的页数、`slides/` 的实际文件数三者对不上就报警；
- Bloom 分布全落在「记住 / 理解」——警告这门课可能太浅；
- 各模块时长之和超过声明总时长，直接报错；
- 蓝图里写了教学活动的模块，幻灯片里必须有对应的活动指令页。

逆向设计（Backward Design）在多数课程里是句口号，因为没人查。这里它是个会报错的检查。

## 幻灯片：大纲定稿之后的事

`/slide-design <课程名>`，中间有两道人审关卡 —— 因为内容问题在 plan 里改一行字，
在 HTML 里改要重排版。

- **内容先过关。** 先出逐页 `slide-plan.md` 交你审，确认了才开始写标记。不在错的内容上花排版时间。
- **页型有语义。** 每页先定它是 Hook、Concept、Demo、Practice 还是 Takeaway，
  页型决定这页能用 24 个登记组件里的哪几个。
- **机器能查的不留给眼睛。** 行内样式、写死的色值、私自引入的 `font-family`、
  没登记过的 class —— 五类违规直接让构建失败；再用无头 Chrome 逐页截图，检测内容有没有溢出屏幕。
- **换视觉只改一行。** 配色（8 套）与字体（8 套字体集）是独立的一层，换皮肤不动任何一页幻灯片。
- **交付物是一个文件夹。** 字体、脚本、图片、协议文本全打包在里面。
  会议室网不通、客户电脑没装东西，双击也能开始讲。

## 为什么产出是 HTML 而不是 PPT

这一层是刻意选的，而且它是整个论证的另一半。

幻灯片写成 HTML，它才是**AI Native 的产品**：改一句话就只动那一句，全课换套配色只改一行，
每条排版规则都能被机器逐页检查 —— 上面那套 lint 和截图自查能存在，前提就是它是 HTML。
PPT 是个二进制包，模型只能隔着一层去猜，猜出来的既不够灵活，也没法被检查。

因为底座是 Reveal.js，投影真正需要的东西一样不少：
双屏讲师备注、PDF 导出、fragment 与转场、离线播放、方向键翻页、任意画幅比例。

代价是对习惯了 PPT 的讲师有一点学习成本：不再是拖文本框、调字号，而是把力气放回内容本身。
这笔交换还有一层更长远的理由：讲师的工作越来越多要经过 AI，
**能被模型读取、比对、校验的文件格式才会产生复利**。选 HTML 而不选 `.pptx`，
就是选择在一种你的工具真的能理解的格式里工作。不过讲师这一行，突破自己的舒适区应该已是家常便饭了。

## 快速开始

需要 **Node 20.x**；截图自查那一步还需要本机装有 **Chrome / Chromium / Edge**。
**没有任何 npm 依赖要装** —— 整套 CLI 只用 Node 内置模块。

```bash
git clone https://github.com/skill-node/nextcourse.git
cd nextcourse
```

然后在 Claude Code 里：

```
/course-design                 # 对话式：规格 → 定位 → 学习成果 → 整体设计 → 模块架构
/course-delivery <课程名>       # 内训档：教学互动 → 评估方案 → 内容开发计划
/slide-design <课程名>          # 内容计划 → 人审 → 幻灯片
```

以及在命令行里：

```bash
node nextcourse.js render <name>   # lint + 构建 deck.html（推荐）
node nextcourse.js check  <name>   # 教学设计闭环校验（成果 × 模块 × 证据）
node nextcourse.js package <name> --render   # 生成交付包 md + 客户 HTML（M/L 档）
node nextcourse.js shot   <name>   # 溢出检测 + 逐页截图自查
node nextcourse.js export <name> --with-package   # 打包为可离线演示文件夹
node nextcourse.js animate <name>  # 批量打入入场动画（--strip 剥离）
node nextcourse.js themes          # 生成配色 / 字体展板
```

`node nextcourse.js` 不带参数会列出全部命令，完整参考见 [CLI_MANUAL.md](./CLI_MANUAL.md)。

### 跑一遍自带的示例课

[`examples/`](./examples) 里带了**同一个主题的两档样例**，正好用来看分档到底差在哪：

| 样例 | 档位 | 内容 |
|---|---|---|
| `ai-agent-insurance` | S · 分享课 | 60 分钟，29 页，就是[在线 demo](https://course.skillnode.ai/demo/) 那一门 |
| `ai-agent-insurance-workshop` | M · 内训课 | 1 天，31 页，另有设计蓝图 + 完整交付包，就是[在线 demo](https://course.skillnode.ai/package/) 那一套 |

两门课的案例素材都已全部替换为虚构示例。拷进工作区跑一遍：

```bash
cp -R examples/ai-agent-insurance-workshop courses/
node nextcourse.js check   ai-agent-insurance-workshop   # 教学设计闭环：0 error 0 warning
node nextcourse.js render  ai-agent-insurance-workshop   # lint + 构建课件
node nextcourse.js package ai-agent-insurance-workshop --render   # 交付包 HTML
```

建议先读 `course.blueprint.md` 和 `course.meta.md` —— 这个项目真正讲的是那两个文件，不是那份课件。
交付包里的 `7_alignment.md`（对齐矩阵）值得单独看一眼：成果 × 模块 × 活动 × 证据，一张表看完这门课的闭环。

## 仓库结构

```
nextcourse/
├── AGENT.md                     ← 完整文档（所有 Agent 入口）
├── CLI_MANUAL.md                ← CLI 操作手册（完整命令参考）
├── DESIGN-SYSTEM.md             ← 组件参考手册（24 个组件）
├── nextcourse.js                ← 统一 CLI 入口
├── build.js                     ← 课程组装
├── check.js                     ← 教学设计闭环校验
├── package.js                   ← 交付包生成
├── render-md.js                 ← 受控子集 md → html 渲染器（零依赖）
├── lint-slides.js               ← 样式闸（5 类违规检测）
├── animate-slides.js            ← 入场动画批量打入 / 剥离
├── export.js                    ← 离线打包
├── shot.js                      ← 溢出检测 + 逐页截图
├── templates/                   ← deck.html 母版 + 设计蓝图模板（M/L 档）
├── shared_styles/               ← 设计系统（8 套配色 · 8 套字体集 · 组件库）
├── lib/                         ← Reveal.js + 网络字体（vendored，离线可用）
├── .claude/skills/
│   ├── course-design/SKILL.md   ← /course-design
│   ├── course-delivery/         ← /course-delivery（含柯氏评估等方法论参考）
│   └── slide-design/SKILL.md    ← /slide-design
├── examples/                    ← 自带示例课程
└── courses/                     ← 你的课程（gitignore）
```

## 语言

智能体**跟随你的语言**：用英文提问，整场对话、大纲和幻灯片都会是英文。

文档不对称，装作没这回事不诚实：

| 文档 | 语言 |
|---|---|
| `README.md` / `README.zh-CN.md` | 英文 + 中文 |
| `CLI_MANUAL.md` | 中文，另有英文版 [`CLI_MANUAL.en.md`](./CLI_MANUAL.en.md) |
| `AGENT.md`、`DESIGN-SYSTEM.md` | **仅中文**（约 1300 行，全译是另一个量级的工程） |
| `.claude/skills/*/SKILL.md` | 中文提示词 —— 但里面明确要求智能体用用户的语言回话 |

一个已知的粗糙处：lint 的**密度警告**（标题 ≤15 字、列表条目 ≤20 字）是按中日韩全角字校准的，
在英文幻灯片上会误报。它只是警告，永远不会让构建失败，但在改成按书写系统区分之前会有噪音。

## 协议

MIT，见 [LICENSE](./LICENSE)。随便用、随便 fork、用它备课、拿它做的培训去收费都可以。

NextCourse 为了让导出的课件能离线播放，打包了 Reveal.js、Font Awesome Free 和七套网络字体。
这些有各自的协议（MIT · CC BY 4.0 · SIL OFL 1.1），全部列在
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) 里，并且会被拷进每一个导出文件夹。

## 状态

这个工具没有商业化打算。它在真实交付里每周被改，
开源是因为：如果你也靠讲课吃饭，它应该用得上。欢迎提 issue 和 fork，但不承诺 roadmap。

作者 Kurtlee —— 20 年 HR 总监，亲手把 AI 写成产品。更多见
[nextskill.cc](https://nextskill.cc)。

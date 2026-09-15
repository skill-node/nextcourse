---
name: nextcourse
description: 课程开发总控台。判断用户卡在哪一环，路由到对应的专项技能，并把多步骤工作流串起来执行。当用户说"帮我做一门课""从头到尾走一遍""我要开一门培训课""不知道从哪下手""课程怎么做""帮我搞个培训""要给客户做一门课""这门课怎么规划"，或同时提出跨多个环节的需求（如"设计一门课顺便把课件和讲师手册都出了"）时触发。单一环节的需求应直接使用对应专项技能，不必经过本技能。
---

# nextcourse — 课程开发总控台

NextCourse 把一门课拆成三层，每层一个技能：

| 层 | 技能 | 产出 |
|---|---|---|
| 教学设计 | `nextcourse-design` | `course.meta.md`（+ M/L 档 `course.blueprint.md` 一~五节） |
| 视觉呈现 | `nextcourse-slides` | `slides/slide-XX.html` → `deck.html` |
| 交付层 | `nextcourse-delivery` | 蓝图六~十一节 + 讲师手册 / 学员手册 / 量规 / 评估方案 |

本技能负责**判断该从哪一层进**，然后把该走的路串起来。

---

## 第一步：确认引擎在，并弄清课程放哪

```bash
nextcourse doctor
```

- **命令不存在** → 装：`npm i -g nextcourse`。不想全局装就每条命令都写 `npx -y nextcourse`。
- **doctor 报出的「工作目录」** 就是课程要落的地方（`<工作目录>/courses/<name>/`）。这是新用户唯一容易懵的地方 —— 如果那不是用户想放的位置，先 `cd` 过去再开始，别等生成完了再搬。

已经有课程的，先看一眼有什么：

```bash
nextcourse list
```

---

## 第二步：分诊 —— 用户到底卡在哪

| 用户说的话 | 真正的瓶颈 | 去哪 |
|---|---|---|
| 「想做一门课，还没想好讲什么」 | 没有教学设计 | `nextcourse-design` |
| 「有个主题 / 有份资料，帮我变成课」 | 同上 | `nextcourse-design` |
| 「大纲有了，帮我做成课件」 | 缺视觉呈现 | `nextcourse-slides` |
| 「课件做好了，客户要讲师手册」 | 缺交付层 | `nextcourse-delivery` |
| 「这页太挤了 / 换个配色」 | 单页修改 | `nextcourse-slides` |
| 「要打包发给客户 / 拷到别的电脑讲」 | 只是导出 | 直接 `nextcourse export <name> --with-package` |
| 「把课件发给学员 / 要个 PDF」 | 只是导出 | 直接 `nextcourse pdf <name>`；**别教用户在浏览器里 Cmd+P**，reveal 自带的 A4 打印样式会把配色刷成白底黑字 |
| 「学员要打印出来 / 深色太费墨」 | 只是导出 | `nextcourse pdf <name> --theme print-light`（纸面浅色版，版式不变） |
| 「这几页不适合外发」 | 只是导出 | 在那几页的 `<section>` 上加 `data-print="off"`，再导一次；页码会自动连号 |
| 「一门课从头到尾」 | 全链路 | 见下面工作流 A |

**判断不了就问一句**：「你现在手上已经有什么了？—— 只有一个主题、已经有大纲、还是课件都做完了？」不要凭猜进入某个 Phase。

---

## 第三步：三条标准工作流

### A · 新课全链路

```
nextcourse-design            → 定档位(S/M/L)、成果、模块  ← 有人审关卡
   ↓  S 档到这里就可以做课件了
nextcourse-delivery <name>   → 【M/L 档】评估方案 + 交付包
   ↓
nextcourse check <name>      → 教学设计闭环校验, error 必须清零
   ↓
nextcourse-slides <name>     → 逐页设计 → deck.html      ← 有两道人审关卡
   ↓
nextcourse export <name> --with-package   → 打包交付
```

**档位在第一步就定死，别中途改。** S 档（30–90 min 分享课）走完 design 直接进 slides，不要给它硬塞蓝图和交付包；M/L 档（半天以上的内训 / 训练营）才走全程。

### B · 只出课件

用户已经有大纲或已有 `course.meta.md`：直接 `nextcourse-slides <name>`。没有 `course.meta.md` 但用户手上有大纲文字 —— 先用 `nextcourse-design` 把它落成 meta，不要跳过，`build` 只认这个文件。

### C · 只补交付包

课件已经做完，客户临时要手册：直接 `nextcourse-delivery <name>`。它会先读现状再只问缺的，不会从头问一遍。

---

## 硬性关卡（不要替用户跳过）

1. **档位判断** —— design 的第一个问题，决定后面问多少、产出多少。
2. **`slide-plan.md` 人审** —— slides 技能在写 HTML 前必须停下来让用户过内容。内容问题在 plan 里改一行字，在 HTML 里改要重排版。
3. **`nextcourse check` 清零** —— M/L 档出交付包前，error 必须是 0。warning 逐条念给用户判断，别自作主张改。
4. **视觉自查** —— `nextcourse shot <name>` 出的截图要自己逐张看过、按 rubric 修完，再交给用户。

---

## 常用命令速查

```bash
nextcourse doctor                          # 自检 + 报出工作目录
nextcourse list                            # 有哪些课、各自到哪一步了
nextcourse new <name> [--scale M|L]        # 建课程目录
nextcourse check <name>                    # 教学设计闭环校验
nextcourse render <name>                   # lint + build，出 deck.html
nextcourse package <name> --render         # 出交付包 md + 客户看的 HTML
nextcourse export <name> --with-package    # 打包成可离线演示的文件夹
nextcourse pdf <name> [--theme print-light]  # 导出 PDF：一页一张幻灯片，配色版式原样保留
nextcourse shot <name>                     # 溢出检测 + 逐页截图（需本机 Chrome）
nextcourse docs <name>                     # design-system / agent / cli / domains
```

课程默认落在**当前目录**的 `courses/<name>/`。想固定到一处就设 `NEXTCOURSE_HOME`。

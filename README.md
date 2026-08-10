# NextCourse V2

**AI-Native 课程开发工具** — 从一句话主题到可离线演示的 Reveal.js HTML 幻灯片，全流程 CLI 驱动。

> 完整文档请看 [AGENT.md](./AGENT.md)（适用于所有 Agent / CLI 工具）

---

## 快速开始

### 1. 安装

```bash
git clone https://github.com/skill-node/nextcourse.git
cd nextcourse
npm install
```

### 2. 设计课程大纲（对话式）

在 Claude Code 中运行：

```
/course-design
```

AI 引导你完成三个阶段：定位 → 学习成果 → 知识架构，最终生成 `courses/<name>/course.meta.md`。

### 3. 生成幻灯片

```
/slide-design <course-name>
```

AI 按大纲逐页生成幻灯片 HTML 片段，自动组装成 `deck.html`。

### 4. 加入场动画（可选）

```bash
node nextcourse.js animate <course-name>            # 按组件结构批量打上入场动画
node nextcourse.js animate <course-name> --strip    # 一键剥离，回到静态
```

翻到某页时组件依次入场（左右对进 / 沿流程推进 / 依次升起），规则按组件结构自动匹配。
命令是幂等的，且不会碰你手写的 `fragment`（按空格才出现的节奏标记），
两者可以在同一页共存。详见 [CLI_MANUAL.md](./CLI_MANUAL.md)。

### 5. 校验 / 构建 / 导出

```bash
node nextcourse.js render <course-name>   # 校验 + 生成 deck.html（推荐）
node nextcourse.js shot   <course-name>   # 溢出检测 + 逐页截图自查
node nextcourse.js export <course-name>   # 打包为可离线演示文件夹
```

完整命令参考见 [CLI_MANUAL.md](./CLI_MANUAL.md)。

---

## 项目结构

```
nextcourse/
├── AGENT.md           ← 完整文档（所有 Agent 入口）
├── CLI_MANUAL.md      ← CLI 操作手册（完整命令参考）
├── DESIGN-SYSTEM.md   ← 组件参考手册（19 个 B 档组件）
├── nextcourse.js      ← 统一 CLI 入口
├── build.js           ← 课程组装
├── lint-slides.js     ← 样式校验（5 类违规检测）
├── animate-slides.js  ← 入场动画批量打入 / 剥离
├── export.js          ← 离线打包
├── templates/         ← deck.html 母版
├── .claude/skills/    ← Claude Code Skill 定义
│   ├── course-design/SKILL.md   ← /course-design（大纲设计）
│   └── slide-design/SKILL.md    ← /slide-design（幻灯片渲染）
├── shared_styles/     ← 设计系统 CSS（8 套配色 + 组件库）
├── lib/               ← Reveal.js（vendored，离线可用）
└── courses/           ← 课程内容（gitignore，本地保留）
```

---

## 版本

- **V2**（当前 `main`）— CLI + Agent-Native 设计系统，B 档组件库，lint/build/export 工具链
- **V1**（`v1` 分支）— Web 工作台 + SPA 前端版本

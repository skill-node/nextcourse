# NextCourse 的四个技能

这四个目录是标准 [Agent Skills](https://code.claude.com/docs/en/skills)（`SKILL.md` + YAML frontmatter），不绑定任何一家 runtime。Claude Code、Codex、Cursor、OpenCode、WorkBuddy 等都读同一份格式。

| 技能 | 什么时候用 |
|---|---|
| `nextcourse` | 总控台。用户说「帮我做一门课」但没说卡在哪一环时，从这里进 |
| `nextcourse-design` | 从零设计课程：规格 → 定位 → 学习成果 → 整体设计 → 模块架构 |
| `nextcourse-delivery` | M/L 档交付层：教学互动 → 评估方案 → 内容开发 → 讲师手册等八份交付物 |
| `nextcourse-slides` | 把大纲变成幻灯片：逐页设计 → `deck.html` |

## 安装

```bash
npx skills add skill-node/nextcourse     # 装技能
npm i -g nextcourse                      # 装引擎（技能靠它干活）
```

技能本身只有提示词，真正干活的构建、校验、打包由 `nextcourse` 命令完成。两样都要装。不想全局装引擎的话，把命令换成 `npx -y nextcourse <子命令>` 一样能用。

### runtime 不支持自动安装时

各家的技能目录不一样，手动拷进去即可：

| Runtime | 项目级 | 全局 |
|---|---|---|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Codex | `.agents/skills/` | `~/.codex/skills/` |
| Cursor | `.agents/skills/` | `~/.cursor/skills/` |
| OpenCode | `.agents/skills/` | `~/.config/opencode/skills/` |

```bash
git clone https://github.com/skill-node/nextcourse.git
cp -R nextcourse/.claude/skills/nextcourse* ~/.claude/skills/
```

## 关于课程放在哪

课程落在**调用 agent 时所在的目录**下：`./courses/<课程名>/`。所以开工前先 `cd` 到你想放课程的地方。想固定到一处就设环境变量 `NEXTCOURSE_HOME`。

拿不准就跑 `nextcourse doctor` —— 它会把当前工作目录报出来。

## 改这些文件

这里是四个技能的**唯一来源**。别往 `.agents/skills/` 之类的地方拷副本，那份副本会静默漂移（2026-08-10 清掉的那一份还写着项目的旧名字 CourseFlow）。

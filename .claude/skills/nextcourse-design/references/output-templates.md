# 输出文件模板

要动笔写文件时读这一份。

## S 档：`courses/<name>/course.meta.md`

```markdown
---
title: "完整课程标题"
template: standard
theme: bold-signal
audience: "受众描述（来自 Phase 1）"
positioning: "价值主张（来自 Phase 1，1 句话）"
outcomes:
  - { do: "动词开头的行为", bloom: apply, success: "成功标准" }
  - { do: "动词开头的行为", bloom: analyze, success: "成功标准" }
  - { do: "动词开头的行为", bloom: create, success: "成功标准" }
---

## 课程大纲

### 封面与概览（2 张）
- 封面页：标题 + 核心价值主张
- 课程概览：目标 + 大纲

### 模块一：XXX（X 张）
- Hook：...
- Concept：...
- Demo：...（具体案例内容）
- Takeaway：...

### 收尾（2 张）
- 学习路径 / 下一步行动
- 致谢结束
```

## M / L 档：frontmatter 追加字段

全部可选，`build.js` 不依赖它们，所以对现有课程零影响。outcomes 改用块式写法带上 `id` / `module` / `evidence`：

```yaml
scale: M                        # S | M | L
duration: "1 天（有效 6.5h）"
class_size: "20–30 人，4–5 人一组"
blueprint: course.blueprint.md
outcomes:
  - id: LO1
    do: "..."
    bloom: apply
    success: "..."
    module: 2
    evidence: "结营实操考核 · A 项"
```

**模块的编号与名称以蓝图为准**，`course.meta.md` 按同样编号展开到页。`### 模块二：XXX（6 张）` 里的页数要写 —— `nextcourse check` 会拿它和 `slides/` 实际文件数对账。

## M / L 档另出：`courses/<name>/course.blueprint.md`

模板由 `nextcourse new <name> --scale M` 自动复制到课程目录。本技能负责填**一~五节**：

| 节 | 内容 | 来自 |
|---|---|---|
| 一、需求诊断与规格 | 档位 / 交付形态 / 学员水平 / 痛点北极星 / **本期不做什么** | Phase 0 |
| 二、课程定位 | 受众画像 / 核心情境 / 价值主张 | Phase 1 |
| 三、目标体系 | 学习成果表 + 柯氏层级（默认 L1+L2） | Phase 2 |
| 四、课程整体设计 | 形态 / 分组 / 认知负荷节奏 / 一日旅程 | Phase 3 |
| 五、模块架构 | **模块清单表**（列名别改，`check` 解析它）+ 模块详述 | Phase 4 |

第五节的模块清单表列名必须是 `# / 模块 / 时长 / 教学活动 / 产出物 / 覆盖成果` —— `nextcourse check` 和 `nextcourse package` 都解析这张表。

六节之后（教学方法、评估方案、内容开发、运营 TTT、路线图）由 `nextcourse-delivery` 技能补，本技能不写、也不要提前占坑。

**不要在两份文件里重复写同一件事**：模块清单只写在蓝图，页面级拆分只写在 meta。

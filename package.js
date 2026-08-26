#!/usr/bin/env node
/**
 * package.js — NextCourse V3 交付包生成
 *
 * 读 course.blueprint.md + course.meta.md + slides/，汇总出企业内训真正要交的东西：
 *   package/1_facilitator-guide.md 讲师手册
 *   package/2_workbook.md          学员手册
 *   package/3_rubric.md            考核量规
 *   package/4_action-plan.md       学员行动承诺书
 *   package/5_assessment.md        评估方案 (柯氏 L1 问卷 / L2 考核)
 *   package/6_facilitation.md      教学设计 (时间轴 / 分组 / 积分)
 *   package/7_alignment.md         对齐矩阵 —— 由 nextcourse check 生成, 本命令不碰
 *   package/8_content-dev.md       内容开发计划
 *   package/exercises/README.md    练习数据包说明
 *
 * **文件名前缀是交付顺序，不是装饰。** 客户拿到的是一个文件夹，文件管理器按名字排序，
 * 于是排序就是他们的阅读顺序：1–4 是开班当天桌上要有的，5–8 是设计与项目层的证据。
 * 封面渲染成 0_index.html，永远排第一。序号由 DOCS 的 no 决定，改序号就改那里。
 *
 * **md 是源，HTML 是交付物。** --render 把 md 渲染成 package/html/*.html，
 * 那才是客户实际拿到的东西；HTML 永远不手改，改 md 再重新渲染（和 deck.html 一个心智模型）。
 *
 * 已存在的 md 默认不覆盖（你的手改优先），要重新生成加 --force。
 *
 * 用法:
 *   node package.js <course-name>            生成/补齐 package/*.md
 *   node package.js <course-name> --render   顺带渲染 package/html/
 *   node package.js <course-name> --force    重新生成，覆盖已有 md
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { loadCourse, mapSlidesToModules, isBlank, label, ALIGNMENT_FILE } = require('./course-model');
const { wrapDocument, accentFromTheme } = require('./render-md');

const { PKG_ROOT, WORK_ROOT, pkg, requireCourse } = require('./paths');

// ─── 参数 ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const courseName = argv.find(a => !a.startsWith('--'));
const RENDER = argv.includes('--render');
const FORCE  = argv.includes('--force');

if (!courseName) {
    console.error('Usage: node package.js <course-name> [--render] [--force]');
    process.exit(1);
}

requireCourse(courseName, 'package');

const course = loadCourse(WORK_ROOT, courseName);
if (!course) {
    console.error(`ERROR: course.meta.md not found at courses/${courseName}/course.meta.md`);
    process.exit(1);
}
if (!course.isMPlus || !course.hasBlueprint) {
    console.error(`ERROR: 交付包是 M / L 档的东西，${courseName} 现在是 ${course.scale} 档${
        course.hasBlueprint ? '' : '，也没有 course.blueprint.md'}。`);
    console.error('       先把 frontmatter 改成 scale: M 并补上蓝图（/course-design 或 /course-delivery），');
    console.error('       只想要讲师备注的话用 nextcourse notes。');
    process.exit(1);
}
if (!course.modules.length) {
    console.error('ERROR: 蓝图第五节没解析到模块清单表，交付包没法按模块展开。');
    console.error('       表头需要含「模块」「时长」两列，列名别改。');
    process.exit(1);
}

const PKG_DIR = path.join(course.dir, 'package');
const { meta, title, outcomes, modules, details } = course;
const slideMap = mapSlidesToModules(course);

// ─── 小工具 ──────────────────────────────────────────────────────────────────

const v = (x, fallback = '') => (isBlank(x) ? fallback : String(x).trim());
const TODO = t => `> **待补**：${t}`;

function outcomesOf(mod) {
    return outcomes.filter(o => o.modules.includes(mod.no)
        || mod.outcomes.some(id => id.toUpperCase() === o.id.toUpperCase()));
}

function detailField(mod, ...names) {
    const d = details[mod.no];
    if (!d) return '';
    for (const n of names) {
        const k = Object.keys(d.fields).find(key => key.includes(n));
        if (k && !isBlank(d.fields[k])) return d.fields[k];
    }
    return '';
}

// 蓝图里已经写了的章节直接搬进交付包；没写就给骨架 + 待补标记
function sectionBody(...keywords) {
    const s = course.section(...keywords);
    if (!s || !s.body) return null;
    // 章节里的 ## 降一级，免得和交付文档自己的层级打架
    return s.body.replace(/^###/gm, '####').trim();
}

// h1 只写功能名: 课程名由渲染器放到下一行小字 (见 render-md.js wrapDocument)。
// 生成溯源写成 md 注释: 改 md 的人看得到, 客户拿到的 HTML 里不会出现内部课程名
const HEADER = (kind, note) => [
    `# ${kind}`,
    '',
    `<!-- 由 \`nextcourse package ${courseName}\` 生成，数据源：${course.blueprintName} + course.meta.md${
        slideMap ? ' + slides/' : ''}。`,
    '     md 是源，package/html/ 是交付物：改这里，然后重新 --render，不要手改 HTML。 -->',
    '',
    `> ${note}`,
    '',
    `**课程规格**：${v(meta.duration, '时长未定')} · ${v(meta.class_size, '班级规模未定')} · ${
        modules.length} 个模块 · ${outcomes.length} 条学习成果`,
    '',
].join('\n');

// ─── 1. 讲师手册 ─────────────────────────────────────────────────────────────

function facilitatorGuide() {
    const out = [HEADER('讲师手册', '这份是给站在台前的人看的：每个模块讲什么、怎么带活动、学员会卡在哪。')];

    out.push('## 开课前检查', '',
        '- [ ] 场地与分组：' + v(meta.class_size, '（班级规模未定）'),
        '- [ ] 设备：投影 / 音响 / 白板 / 便利贴 / 计时器',
        '- [ ] 学员材料：学员手册（workbook）人手一份，练习数据包已分发',
        '- [ ] 讲师材料：deck.html 离线包已拷到授课机并试放一遍',
        '- [ ] 评估：L1 问卷与 L2 考核表已准备（见 5_assessment.md / 3_rubric.md）',
        '');

    const timeline = course.findTable('时间', '环节') || course.findTable('时间', '时长');
    if (timeline) {
        out.push('## 当日时间轴', '');
        out.push(`| ${timeline.header.join(' | ')} |`);
        out.push(`|${timeline.header.map(() => '---').join('|')}|`);
        for (const r of timeline.rows) out.push(`| ${timeline.header.map(h => r[h] || '').join(' | ')} |`);
        out.push('');
    }

    for (const m of modules) {
        const los = outcomesOf(m);
        out.push('<!-- pagebreak -->', '', `## 模块 ${m.no} · ${label(m.name)}`, '');
        out.push(`**时长** ${v(m.duration, '待定')}　**教学活动** ${v(m.activity, '待定')}　**学员产出** ${v(m.deliverable, '待定')}`, '');

        out.push('### 本模块要拿下的成果', '');
        if (los.length) {
            for (const o of los) out.push(`- **${o.id}** ${v(o.do)}　_达成标准：${v(o.success, '待补')}_`);
        } else {
            out.push(TODO('本模块没挂任何学习成果，先在蓝图模块清单里补「覆盖成果」'));
        }
        out.push('');

        const problem = detailField(m, '解决的问题', '问题');
        const points  = detailField(m, '关键内容', '内容要点', '要点');
        if (!isBlank(problem)) out.push('### 这个模块解决什么问题', '', problem, '');
        out.push('### 讲授要点', '');
        out.push(isBlank(points) ? TODO('从蓝图模块详述的「关键内容」补要点，或直接在这里写') : points);
        out.push('');

        out.push('### 活动指令（照着念）', '');
        out.push(`1. **交代任务**：${v(m.activity, '（活动形式待定）')}——${v(m.deliverable, '产出物待定')}`);
        out.push('2. **交代时间**：___ 分钟，计时器可见');
        out.push(`3. **交代分组**：${v(meta.class_size, '分组方式待定')}`);
        out.push('4. **交代交付物与评分点**：见 3_rubric.md 对应维度');
        out.push('5. **收尾**：抽 2–3 组分享，讲师只点评「符合评分点的地方」和「一个可改进点」');
        out.push('');

        if (slideMap && slideMap[m.no] && slideMap[m.no].length) {
            const pages = slideMap[m.no];
            out.push('### 对应幻灯片与备注', '');
            for (const s of pages) {
                out.push(`**${s.file}**${s.title ? ` · ${s.title}` : ''}`);
                out.push('');
                out.push(s.notes ? s.notes : '_（本页无演讲备注）_');
                out.push('');
            }
        }

        out.push('### 学员常见卡点', '');
        out.push(TODO('第一次授课后回填：学员在这个模块最常问什么、最常做错什么'));
        out.push('');
        out.push('### 讲师踩坑提醒', '');
        out.push(TODO('第一次授课后回填：时间容易超在哪、哪个例子讲不通要换'));
        out.push('');
    }

    return out.join('\n') + '\n';
}

// ─── 2. 学员手册 ─────────────────────────────────────────────────────────────

function workbook() {
    const out = [HEADER('学员手册', '这份是发到学员手上的：练习在这里做，清单在这里勾，结束后带回工位继续用。')];

    out.push('## 这一天你会带走什么', '');
    for (const m of modules) {
        out.push(`- **模块 ${m.no} ${label(m.name)}** → ${v(m.deliverable, '（产出物待定）')}`);
    }
    out.push('');
    out.push('## 学完你应该能做到', '');
    for (const o of outcomes) {
        out.push(`- [ ] **${o.id}** ${v(o.do)}　_（${v(o.success, '成功标准待补')}）_`);
    }
    out.push('');

    for (const m of modules) {
        const los = outcomesOf(m);
        out.push('<!-- pagebreak -->', '', `## 模块 ${m.no} · ${label(m.name)}`, '');
        out.push(`> 本模块产出：**${v(m.deliverable, '待定')}**　｜　时长 ${v(m.duration, '待定')}`, '');

        out.push('### 练习任务', '');
        out.push(`**做什么**：${v(m.activity, '（活动待定）')}`, '');
        out.push('**你的答案 / 成果**：', '');
        out.push('<!-- fill:6 -->', '');

        out.push('### 自检清单', '');
        if (los.length) {
            for (const o of los) out.push(`- [ ] ${v(o.success, v(o.do))}`);
        } else {
            out.push('- [ ] （自检项待补）');
        }
        out.push('- [ ] 我的产出可以直接拿回工位用，不需要再返工', '');

        out.push('### 记下来', '');
        out.push('**这个模块对我最有用的一句话**：', '');
        out.push('<!-- fill:2 -->', '');
        out.push('**回去我要先改的一件事**：', '');
        out.push('<!-- fill:2 -->', '');
    }

    out.push('<!-- pagebreak -->', '', '## 速查卡', '');
    out.push(TODO('把课上最常用的公式 / 步骤 / 话术压成一页，学员回工位只会看这一页'));
    out.push('');
    return out.join('\n') + '\n';
}

// ─── 3. 评估方案 ─────────────────────────────────────────────────────────────

function assessment() {
    const out = [HEADER('评估方案', '柯氏评估默认只做 L1（反应）+ L2（学习）。要 L3/L4 得先谈基线数据由谁提供。')];

    const fromBlueprint = sectionBody('评估方案');
    if (fromBlueprint) {
        out.push('## 评估设计（来自蓝图）', '', fromBlueprint, '');
    } else {
        out.push('## 评估层级', '');
        out.push('| 层级 | 关注 | 方法 | 目标值 |');
        out.push('|---|---|---|---|');
        out.push('| L1 反应 | 满意度与相关性 | 结营问卷 | ≥ 4.5 / 5 |');
        out.push('| L2 学习 | 知识与技能掌握 | 实操考核 + 量规 | ≥ 80% 学员达标 |');
        out.push('');
        out.push('**本课程评估范围到 L2。** 需要向业务负责人证明业务结果时，再追加 L3（行为）/ L4（业务指标），');
        out.push('前提是先确认基线数据由谁提供、口径是什么——需要基线才能定值的指标，目标值后标 `*`。');
        out.push('');
    }

    out.push('<!-- pagebreak -->', '', '## L1 · 结营问卷', '');
    out.push('1–5 分制，1 = 完全不同意，5 = 完全同意。', '');
    out.push('| # | 题目 | 评分 |');
    out.push('|---|---|---|');
    [
        '课程内容与我的实际工作直接相关',
        '讲师把内容讲清楚了，我能跟上',
        '练习环节让我真的动了手，不只是听',
        '我拿到的产出物回工位能直接用',
        '课程时长与节奏安排合理',
        '我愿意把这门课推荐给同事',
    ].forEach((q, i) => out.push(`| ${i + 1} | ${q} | ☐1 ☐2 ☐3 ☐4 ☐5 |`));
    out.push('');
    out.push('**开放题**', '');
    out.push('- 今天最有用的一件事是什么？');
    out.push('- 哪个环节应该砍掉或缩短？');
    out.push('- 你希望补充什么内容？');
    out.push('');

    out.push('<!-- pagebreak -->', '', '## L2 · 实操考核', '');
    out.push('考核任务直接取自各条学习成果的判定证据（evidence），评分见 `3_rubric.md`。', '');
    out.push('| 成果 | 考核任务 | 判定证据 | 达标线 |');
    out.push('|---|---|---|---|');
    for (const o of outcomes) {
        out.push(`| ${o.id} | ${v(o.do)} | ${v(o.evidence, '**待补**')} | ${v(o.success, '**待补**')} |`);
    }
    out.push('');
    out.push('**判定规则**：全部达标项 ≥ 80% 视为通过；未通过的学员在结营后 2 周内补交产出物。', '');

    out.push('## L3 / L4（默认不做）', '');
    out.push('本课程评估范围到 L2。若委托方需要行为与业务结果证据，需先确认三件事：', '');
    out.push('1. **基线数据由谁提供**（姓名 + 部门）；');
    out.push('2. **口径是什么**（指标定义、统计周期、剔除规则）；');
    out.push('3. **追踪节奏**（30 / 60 / 90 天谁来收数据）。', '');
    out.push('三件事没落实之前，写进方案的 L3/L4 指标全是空指标——写明范围本身就是专业度。', '');
    return out.join('\n') + '\n';
}

// ─── 4. 考核量规 ─────────────────────────────────────────────────────────────

function rubric() {
    const out = [HEADER('考核量规', 'L2 实操考核的评分表。维度来自学习成果，等级描述必须写成可观察的行为，不能写「较好」「一般」。')];

    out.push('## 使用说明', '');
    out.push('- 每个维度独立打分，不做加权平均掩盖短板；');
    out.push('- **达标**是及格线，不是理想态；「优秀」留给确实超出预期的产出；');
    out.push('- 评分时只看**交上来的产出物**，不看课堂表现印象。', '');

    for (const o of outcomes) {
        out.push(`## ${o.id} · ${v(o.do)}`, '');
        out.push(`**判定证据**：${v(o.evidence, '**待补**')}　｜　**达标线**：${v(o.success, '**待补**')}`, '');
        out.push('| 等级 | 行为描述 | 分值 |');
        out.push('|---|---|---|');
        out.push('| 优秀 | **待补**：比达标线多做到什么（写成可观察的行为，不写「更好」） | 4 |');
        out.push(`| 达标 | ${v(o.success, '**待补**')} | 3 |`);
        out.push('| 待改进 | **待补**：产出物完成但关键要素缺失（列出是哪个要素） | 2 |');
        out.push('| 未达标 | **待补**：未提交，或与任务要求不符 | 1 |');
        out.push('');
    }

    out.push('<!-- pagebreak -->', '', '## 汇总表（讲师填）', '');
    out.push(`| 学员 | ${outcomes.map(o => o.id).join(' | ')} | 合计 | 是否达标 |`);
    out.push(`|---|${outcomes.map(() => '---').join('|')}|---|---|`);
    for (let i = 0; i < 5; i++) {
        out.push(`|  | ${outcomes.map(() => ' ').join(' | ')} |  |  |`);
    }
    out.push('');
    return out.join('\n') + '\n';
}

// ─── 5. 教学设计 ─────────────────────────────────────────────────────────────

function facilitation() {
    const out = [HEADER('教学设计', '时间轴、分组、互动手法与积分规则。讲师手册讲「讲什么」，这份讲「怎么组织」。')];

    const fromBlueprint = sectionBody('教学方法', '互动设计');
    const design = sectionBody('整体设计');

    if (design) out.push('## 整体设计（来自蓝图）', '', design, '');
    if (fromBlueprint) {
        out.push('## 教学方法与互动设计（来自蓝图）', '', fromBlueprint, '');
    } else {
        out.push('## 教学方法与互动设计', '');
        out.push(TODO('运行 `/course-delivery` 补齐蓝图的「教学方法与互动设计」章节，再重跑 `nextcourse package`'));
        out.push('');
        out.push('缺省建议（可直接用）：', '');
        out.push('- **每 90 分钟必须切换形态**——讲授 → 动手 → 讨论 → 互评，午后第一段绝不安排纯讲授；');
        out.push('- **每个模块至少一次小组互动**，人均发言机会 ≥ 1 次；');
        out.push('- **产出物当场交**，不留到课后，否则落地率骤降。', '');
    }

    out.push('## 分组方案', '');
    out.push(`- 班级规模：${v(meta.class_size, '**待补**')}`);
    out.push('- 分组原则：按业务线 / 经验水平混编，避免同部门抱团');
    out.push('- 每组设 1 名组长，负责计时与汇报', '');

    out.push('## 模块节奏表', '');
    out.push('| # | 模块 | 时长 | 教学活动 | 产出物 |');
    out.push('|---|---|---|---|---|');
    for (const m of modules) {
        out.push(`| ${m.no} | ${label(m.name)} | ${v(m.duration, '—')} | ${v(m.activity, '—')} | ${v(m.deliverable, '—')} |`);
    }
    const sum = modules.reduce((a, m) => a + (m.minutes || 0), 0);
    out.push('');
    out.push(`模块时长合计 **${sum} min**${meta.duration ? `，声明总时长 ${v(meta.duration)}` : ''}——差额是开场、收尾、茶歇与缓冲。`, '');

    out.push('## 游戏化与积分（可选）', '');
    out.push('| 行为 | 积分 |');
    out.push('|---|---|');
    out.push('| 小组按时提交产出物 | +2 |');
    out.push('| 被选为示范案例 | +3 |');
    out.push('| 给别组提出被采纳的改进意见 | +2 |');
    out.push('| 主动分享自己的失败案例 | +1 |');
    out.push('');
    out.push('积分只用于结营即时兑现（小奖品 / 优先选题），不进任何考核记录。', '');
    return out.join('\n') + '\n';
}

// ─── 6. 内容开发计划 ─────────────────────────────────────────────────────────

function contentDev() {
    const out = [HEADER('内容开发计划', '课程要落地，缺的从来不是 PPT，是案例、数据包和讲师。这份写清楚谁在什么时候交什么。')];

    const fromBlueprint = sectionBody('内容开发');
    if (fromBlueprint) {
        out.push('## 开发计划（来自蓝图）', '', fromBlueprint, '');
    } else {
        out.push(TODO('运行 `/course-delivery` 补齐蓝图的「内容开发计划」章节，再重跑 `nextcourse package`。下面是骨架。'), '');
    }

    out.push('## SME 访谈提纲', '');
    out.push('每位业务专家 45–60 分钟，目标是拿到**具体案例**，不是抽象方法论。', '');
    out.push('1. 这件事做得好的人和做得差的人，差别最先出现在哪一步？');
    out.push('2. 最近一次做砸的例子是什么？当时是怎么判断的？');
    out.push('3. 新人最常犯的三个错误？');
    out.push('4. 你自己的判断标准是什么？（逼出隐性知识）');
    out.push('5. 有没有一份真实材料可以脱敏后当课堂案例？', '');

    out.push('## 案例库需求', '');
    out.push('| 模块 | 案例数 | 覆盖维度 | 来源 | 责任人 | 交付日期 |');
    out.push('|---|---|---|---|---|---|');
    for (const m of modules) {
        out.push(`| ${m.no} ${label(m.name)} | 2–3 | ${v(m.activity, '待定')} | SME 访谈 / 历史项目 |  |  |`);
    }
    out.push('');

    out.push('## 练习数据包', '');
    out.push('| 模块 | 数据包 | 形态 | 脱敏要求 | 责任人 |');
    out.push('|---|---|---|---|---|');
    for (const m of modules) {
        out.push(`| ${m.no} | ${v(m.deliverable, '待定')}的输入材料 | 表格 / 文档 / 图片 | 去除姓名、手机号、保单号、金额精确值 |  |`);
    }
    out.push('');
    out.push('> **脱敏是硬规则**：真实客户材料一律不得直接进课件与数据包，替换为等价的虚构数据。', '');

    out.push('## 排期', '');
    out.push('| 里程碑 | 交付物 | 责任人 | 日期 |');
    out.push('|---|---|---|---|');
    out.push('| SME 访谈完成 | 访谈纪要 |  |  |');
    out.push('| 案例库定稿 | 案例卡 × N |  |  |');
    out.push('| 数据包脱敏完成 | exercises/ |  |  |');
    out.push('| 课件与手册定稿 | deck + package |  |  |');
    out.push('| 试讲与修订 | 修订清单 |  |  |');
    out.push('');
    return out.join('\n') + '\n';
}

// ─── 7. 行动承诺书 ───────────────────────────────────────────────────────────

function actionPlan() {
    const out = [HEADER('行动承诺书', '培训的效果不发生在教室里。这一页学员当场填、当场拍照，30 天后原样拿出来对。')];

    out.push('## 我的 30 天承诺', '');
    out.push('**姓名**：____________　**部门**：____________　**日期**：____________', '');
    out.push('### 我要改变的一件事', '');
    out.push('（只写一件。写三件等于一件都不做。）', '');
    out.push('<!-- fill:3 -->', '');
    out.push('### 我会怎么做', '');
    out.push('| 什么时候 | 做什么 | 怎么算做到了 |');
    out.push('|---|---|---|');
    out.push('| 第 1 周 |  |  |');
    out.push('| 第 2–3 周 |  |  |');
    out.push('| 第 4 周 |  |  |');
    out.push('');
    out.push('### 我会用课上的哪个产出物', '');
    for (const m of modules) out.push(`- [ ] ${v(m.deliverable, `模块 ${m.no} 产出物`)}`);
    out.push('');
    out.push('### 谁会知道我在做这件事', '');
    out.push('（找一个人当见证人——有人看着，完成率会翻倍。）', '');
    out.push('<!-- fill:2 -->', '');

    out.push('<!-- pagebreak -->', '', '## 30 / 60 / 90 天复盘', '');
    out.push('| 节点 | 我做到了什么 | 卡在哪 | 下一步 |');
    out.push('|---|---|---|---|');
    out.push('| 30 天 |  |  |  |');
    out.push('| 60 天 |  |  |  |');
    out.push('| 90 天 |  |  |  |');
    out.push('');
    out.push('> 讲师侧：30 天复盘是 L3（行为）证据的最低成本来源。即使不做完整 L3 追踪，', '');
    out.push('> 也建议在第 30 天发一次这张表，回收率通常在 40–60%。', '');
    return out.join('\n') + '\n';
}

// ─── 8. 练习数据包说明 ───────────────────────────────────────────────────────

function exercisesReadme() {
    return [
        `# 练习数据包`,
        '',
        '课堂练习用的案例卡、样例数据与话术卡放在本目录。',
        '',
        '## 规则',
        '',
        '1. **一律脱敏**：真实客户材料不得直接进入本目录，姓名 / 手机号 / 单号 / 精确金额全部替换为虚构等价数据；',
        '2. **一个练习一个子目录**，命名 `m<模块号>-<练习名>/`；',
        '3. 每个子目录放一份 `README.md` 说明：这份数据给哪个模块用、学员要拿它做什么、正确答案长什么样。',
        '',
        '## 待建清单',
        '',
        ...modules.map(m => `- [ ] \`m${m.no}-${(v(m.deliverable, 'exercise')).slice(0, 12)}\` — 模块 ${m.no} ${label(m.name)}：${v(m.activity, '活动待定')}`),
        '',
    ].join('\n');
}

// ─── 写入 ────────────────────────────────────────────────────────────────────

// no = 交付顺序, 直接写进文件名。1–4 开班当天要用, 5–8 设计与项目层证据。
// 对齐矩阵占 7 号但由 check.js 生成 (见 ALIGNMENT_FILE), 这里不建、只渲染。
const DOCS = [
    { no: 1, stem: 'facilitator-guide', kind: '讲师手册',     build: facilitatorGuide },
    { no: 2, stem: 'workbook',          kind: '学员手册',     build: workbook },
    { no: 3, stem: 'rubric',            kind: '考核量规',     build: rubric },
    { no: 4, stem: 'action-plan',       kind: '行动承诺书',   build: actionPlan },
    { no: 5, stem: 'assessment',        kind: '评估方案',     build: assessment },
    { no: 6, stem: 'facilitation',      kind: '教学设计',     build: facilitation },
    { no: 8, stem: 'content-dev',       kind: '内容开发计划', build: contentDev },
];
for (const d of DOCS) d.file = `${d.no}_${d.stem}.md`;
DOCS.push({ file: path.join('exercises', 'README.md'), kind: '练习数据包', build: exercisesReadme });

// 交付顺序是 V3 之后才有的。老课程的 package/ 里是没有序号的旧名字，
// 直接生成会变成新旧两份并存 —— 认出旧名字就地改名, 手改过的内容一个字不丢。
function migrateLegacyNames() {
    const renamed = [];
    for (const doc of DOCS) {
        if (!doc.no) continue;
        const legacy = path.join(PKG_DIR, `${doc.stem}.md`);
        const dest   = path.join(PKG_DIR, doc.file);
        if (fs.existsSync(legacy) && !fs.existsSync(dest)) {
            fs.renameSync(legacy, dest);
            renamed.push(`${doc.stem}.md → ${doc.file}`);
        }
    }
    const legacyAlign = path.join(PKG_DIR, 'alignment.md');
    const destAlign   = path.join(PKG_DIR, ALIGNMENT_FILE);
    if (fs.existsSync(legacyAlign) && !fs.existsSync(destAlign)) {
        fs.renameSync(legacyAlign, destAlign);
        renamed.push(`alignment.md → ${ALIGNMENT_FILE}`);
    }
    return renamed;
}

fs.mkdirSync(path.join(PKG_DIR, 'exercises'), { recursive: true });
const migrated = migrateLegacyNames();

const written = [];
const skipped = [];
for (const doc of DOCS) {
    const dest = path.join(PKG_DIR, doc.file);
    if (fs.existsSync(dest) && !FORCE) { skipped.push(doc); continue; }
    fs.writeFileSync(dest, doc.build(), 'utf8');
    written.push(doc);
}

// ─── 渲染 ────────────────────────────────────────────────────────────────────

let rendered = [];
if (RENDER) {
    const cssPath = pkg('shared_styles', 'package-doc.css');
    if (!fs.existsSync(cssPath)) {
        console.error(`ERROR: 样式缺失 ${path.relative(PKG_ROOT, cssPath)}`);
        process.exit(1);
    }
    const css    = fs.readFileSync(cssPath, 'utf8');
    const accent = accentFromTheme(PKG_ROOT, meta.theme || 'standard-default');
    const htmlDir = path.join(PKG_DIR, 'html');
    fs.mkdirSync(htmlDir, { recursive: true });

    // 序号已经写进文件名, sort() 出来就是交付顺序 (0_index 由下面单独写)
    // 对齐矩阵由 check 生成, 这里只负责渲染它
    const mdFiles = fs.readdirSync(PKG_DIR).filter(f => f.endsWith('.md')).sort();

    // 旧名字渲染出来的 html 是残留物, 留着会和新序号文件并排出现在客户那边。
    // 只删我们自己旧版生成过的那几个名字, 不扫荡整个目录 —— 别人放进来的东西不归我们管。
    const stale = [...DOCS.filter(d => d.no).map(d => `${d.stem}.html`), 'alignment.html', 'index.html'];
    for (const f of stale) {
        const p = path.join(htmlDir, f);
        if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    for (const f of mdFiles) {
        const md = fs.readFileSync(path.join(PKG_DIR, f), 'utf8');
        const docTitle = (md.match(/^#\s+(.*)$/m) || [, f.replace(/\.md$/, '')])[1];
        fs.writeFileSync(
            path.join(htmlDir, f.replace(/\.md$/, '.html')),
            wrapDocument({ title: docTitle, subtitle: title, md, css, accent }),
            'utf8'
        );
        rendered.push(f.replace(/\.md$/, '.html'));
    }

    // 客户打开的第一扇门
    const indexMd = [
        `# 交付包`,
        '',
        `> ${v(meta.duration, '')}${meta.class_size ? ` · ${v(meta.class_size)}` : ''} · ${modules.length} 个模块 · ${outcomes.length} 条学习成果`,
        '',
        '## 文档',
        '',
        // 链接文字带上文件名里的序号, 客户在目录里和在本页看到的是同一个顺序
        ...mdFiles.map(f => {
            const known = DOCS.find(d => path.basename(d.file) === f);
            const kind = known ? known.kind
                : (f === ALIGNMENT_FILE ? '对齐矩阵' : f.replace(/^\d+_/, '').replace(/\.md$/, ''));
            const no = (f.match(/^(\d+)_/) || [, ''])[1];
            return `- [${no ? `${no} · ` : ''}${kind}](./${f.replace(/\.md$/, '.html')})`;
        }),
        '',
        '## 课程模块',
        '',
        '| # | 模块 | 时长 | 学员产出 |',
        '|---|---|---|---|',
        ...modules.map(m => `| ${m.no} | ${label(m.name)} | ${v(m.duration, '—')} | ${v(m.deliverable, '—')} |`),
        '',
        '---',
        '',
        '本页与各文档由 NextCourse 生成。**HTML 不要手改**——改对应的 `package/*.md` 后重新运行',
        '`nextcourse package <课程名> --render`。',
        '',
    ].join('\n');
    // 0_ 前缀让封面在文件管理器里永远排第一 —— 客户拿到的是文件夹, 排序就是动线
    fs.writeFileSync(
        path.join(htmlDir, '0_index.html'),
        wrapDocument({ title: '交付包', subtitle: title, md: indexMd, css, accent, toc: false }),
        'utf8'
    );
    rendered.push('0_index.html');
}

// ─── 报告 ────────────────────────────────────────────────────────────────────

console.log(`\nNextCourse Package — ${courseName}`);
console.log('─'.repeat(56));
console.log(`  档位     : ${course.scale}　模块 ${modules.length} 个　成果 ${outcomes.length} 条`);
console.log(`  幻灯片   : ${course.slides.length} 页${slideMap ? '（已按模块映射进讲师手册）' : '（页数与大纲对不上，讲师手册不做映射）'}`);
console.log('');
for (const r of migrated) console.log(`  ↻  改名  ${r}（旧名字没有交付序号）`);
if (migrated.length) console.log('');
for (const d of written) console.log(`  ✓  生成  ${d.file.padEnd(24)} ${d.kind}`);
for (const d of skipped) console.log(`  ·  跳过  ${d.file.padEnd(24)} ${d.kind}（已存在，--force 覆盖）`);
if (RENDER) {
    console.log('');
    console.log(`  ✓  渲染  package/html/  ${rendered.length} 个文件（客户交付物）`);
}

console.log(`\n${'─'.repeat(56)}`);
console.log('  md 是源，HTML 是交付物：改内容一律改 package/*.md，再重新 --render。');
if (!fs.existsSync(path.join(PKG_DIR, ALIGNMENT_FILE))) {
    console.log(`  对齐矩阵还没有——跑一次 nextcourse check ${courseName}。`);
}
if (RENDER) {
    console.log(`  打印验收：Chrome 打开 package/html/0_index.html → 打印预览，逐项过 7 条清单。`);
}
console.log('');

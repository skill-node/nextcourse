#!/usr/bin/env node
/**
 * check.js — NextCourse V3 教学设计闭环校验
 *
 * lint 管样式, check 管教学逻辑。输入见 course-model.js:
 *   course.meta.md / course.blueprint.md / slides/*.html
 *
 * 校验项:
 *   1. 一致性  : blueprint 模块清单 ↔ meta 大纲 ↔ slides/ 实际页数
 *   2. 闭环    : 每条 outcome 至少被 1 个模块教到 + 有 1 条判定证据
 *   3. 深度    : Bloom 分布, 全落在 remember/understand 则警告「课程太浅」
 *   4. 活动落地: 蓝图里有教学活动的模块, 幻灯片里必须有对应 Activity 页
 *   5. 时长    : 各模块时长之和 vs 声明总时长 (含休息与缓冲)
 *   6. 完整度  : M/L 档必填章节缺失提醒
 *   7. 产出    : 写出 package/7_alignment.md 对齐矩阵 (M/L 档)
 *
 * 退出码: 有 error 时 1, 只有 warning 时 0
 *
 * 用法: node check.js <course-name>
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { loadCourse, mapSlidesToModules, isBlank, label, parseMinutes, ALIGNMENT_FILE } = require('./course-model');

const ROOT = __dirname;

// ─── 参数 ────────────────────────────────────────────────────────────────────
const [,, courseName] = process.argv;
if (!courseName) {
    console.error('Usage: node check.js <course-name>');
    process.exit(1);
}

const course = loadCourse(ROOT, courseName);
if (!course) {
    console.error(`ERROR: course.meta.md not found at ${path.join(ROOT, 'courses', courseName, 'course.meta.md')}`);
    process.exit(1);
}

const {
    meta, scale, isMPlus, outcomes, headings,
    blueprintName, hasBlueprint, sections, modules, blueprintOutcomeIds,
    slides, declaredPages,
} = course;

const SCALE_LABEL = { S: 'S · 分享课', M: 'M · 内训课', L: 'L · 培训项目' };
const bpHeads = sections.map(s => s.title);
const slideCount = slides.length;

// ─── 校验 ────────────────────────────────────────────────────────────────────

const issues = [];
const add  = (level, code, msg) => issues.push({ level, code, msg });
const err  = (code, msg) => add('error', code, msg);
const warn = (code, msg) => add('warn', code, msg);
const info = (code, msg) => add('info', code, msg);

// 1) 档位与完整度
if (!['S', 'M', 'L'].includes(scale)) {
    err('scale', `scale: "${meta.scale}" 不是 S / M / L`);
}
if (isMPlus && !hasBlueprint) {
    err('scale', `${scale} 档缺少设计蓝图 ${blueprintName}——从 templates/course.blueprint.md 复制一份`);
}
if (isMPlus && hasBlueprint) {
    const REQUIRED = ['需求诊断', '定位', '目标体系', '整体设计', '模块架构'];
    for (const key of REQUIRED) {
        if (!bpHeads.some(h => h.includes(key))) {
            err('scale', `蓝图缺少必填章节: 含「${key}」的 ## 标题`);
        }
    }
    const LATER = ['评估方案', '内容开发'];
    const missingLater = LATER.filter(k => !bpHeads.some(h => h.includes(k)));
    if (missingLater.length) {
        info('scale', `蓝图待补章节 (${missingLater.join(' / ')})——运行 /course-delivery ${courseName}`);
    }
    if (isBlank(meta.duration)) warn('scale', 'frontmatter 缺 duration，时长核算跳过');
    if (isBlank(meta.class_size)) warn('scale', 'frontmatter 缺 class_size（分组与互动设计依赖它）');
}
if (!isMPlus && hasBlueprint) {
    info('scale', `存在 ${blueprintName} 但 scale 为 S——如果这是内训课，把 frontmatter 改成 scale: M`);
}

// 2) 学习成果本身
const BLOOM = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
if (outcomes.length === 0) {
    err('outcome', 'frontmatter 里没有 outcomes');
} else {
    if (outcomes.length < 3) warn('outcome', `只有 ${outcomes.length} 条学习成果（建议 3–5 条）`);
    if (outcomes.length > 5) warn('outcome', `有 ${outcomes.length} 条学习成果（建议不超过 5 条，宁缺毋滥）`);

    for (const o of outcomes) {
        if (!o.bloom) warn('outcome', `${o.id} 没写 bloom`);
        else if (!BLOOM.includes(o.bloom)) warn('outcome', `${o.id} 的 bloom "${o.bloom}" 不是 Bloom 六层之一`);
        if (isBlank(o.do)) err('outcome', `${o.id} 的 do 为空`);
        if (isBlank(o.success)) warn('outcome', `${o.id} 没写 success（成功标准）`);
    }
    if (!outcomes.some(o => BLOOM.indexOf(o.bloom) >= 2)) {
        warn('depth', '全部成果停留在 remember / understand 层——课程可能太浅，至少 1 条应达到 apply 及以上');
    }
}

// 3) 闭环: 教到 + 测到
// S 档不强制闭环（30 分钟的分享课没有考核），只在末尾提示一句，不逐条刷屏
const openLoop = { module: [], evidence: [] };
const closure = isMPlus
    ? (code, msg) => err(code, msg)
    : (code, msg, id, kind) => openLoop[kind].push(id);
for (const o of outcomes) {
    if (isBlank(o.module)) {
        closure('closure', `${o.id} 没指定 module（在哪个模块教）`, o.id, 'module');
    } else if (modules.length) {
        for (const n of o.modules) {
            const mod = modules.find(m => m.no === n);
            if (!mod) {
                err('closure', `${o.id} 指向模块 ${n}，但蓝图模块清单里没有这个编号`);
            } else if (mod.outcomes.length && !mod.outcomes.some(x => x.toUpperCase() === o.id.toUpperCase())) {
                warn('closure', `${o.id} 声称在模块 ${n} 教，但模块 ${n} 的「覆盖成果」里没有它（两边对不上）`);
            }
        }
    }
    if (isBlank(o.evidence)) {
        closure('closure', `${o.id} 没有 evidence（用什么证据判定达成）`, o.id, 'evidence');
    }
}
if (openLoop.module.length || openLoop.evidence.length) {
    const parts = [];
    if (openLoop.module.length) parts.push(`${openLoop.module.join(' ')} 没写 module`);
    if (openLoop.evidence.length) parts.push(`${openLoop.evidence.join(' ')} 没写 evidence`);
    info('closure', `S 档不强制闭环（${parts.join('；')}）——要做「教到 × 测到」的强校验，把 scale 改成 M`);
}
for (const m of modules) {
    for (const id of m.outcomes) {
        if (!outcomes.some(o => o.id.toUpperCase() === id.toUpperCase())) {
            err('closure', `模块 ${m.no} 覆盖成果写了 ${id}，但 outcomes 里没有这条`);
        }
    }
    if (!m.outcomes.length) warn('closure', `模块 ${m.no}「${label(m.name)}」没写覆盖成果（它在教哪条 outcome？）`);
    if (isBlank(m.deliverable)) warn('closure', `模块 ${m.no}「${label(m.name)}」没有产出物——学员从这个模块带走什么？`);
}
if (blueprintOutcomeIds.length) {
    const metaIds = outcomes.map(o => o.id.toUpperCase());
    for (const id of blueprintOutcomeIds) {
        if (!metaIds.includes(id.toUpperCase())) {
            warn('drift', `蓝图目标体系里的 ${id} 在 course.meta.md 的 outcomes 里不存在`);
        }
    }
    for (const id of metaIds) {
        if (!blueprintOutcomeIds.some(x => x.toUpperCase() === id)) {
            warn('drift', `outcomes 里的 ${id} 没写进蓝图的目标体系表`);
        }
    }
}

// 4) 一致性: blueprint ↔ meta ↔ slides
const metaModules = headings.filter(h => h.no !== null);
if (modules.length) {
    modules.forEach((m, i) => {
        if (m.no !== i + 1) warn('drift', `蓝图模块编号不连续: 第 ${i + 1} 行写的是 ${m.no}`);
    });
    if (metaModules.length && metaModules.length !== modules.length) {
        err('drift', `蓝图有 ${modules.length} 个模块，course.meta.md 大纲里有 ${metaModules.length} 个`);
    }
    for (const mm of metaModules) {
        const bm = modules.find(m => m.no === mm.no);
        if (!bm) { err('drift', `meta 大纲的模块 ${mm.no}「${label(mm.name)}」不在蓝图模块清单里`); continue; }
        // 两边都还是模板占位时不比名字, 那只是「都没填」, 不是漂移
        const named = !isBlank(bm.name) && !isBlank(mm.name) && !/^（.*）$/.test(mm.name);
        if (named && !bm.name.includes(mm.name) && !mm.name.includes(bm.name)) {
            warn('drift', `模块 ${mm.no} 名称不一致: 蓝图「${bm.name}」 vs meta「${mm.name}」（蓝图为准）`);
        }
    }
} else if (isMPlus && hasBlueprint) {
    err('drift', '蓝图第五节没解析到模块清单表（需要含「模块」「时长」两列的表格，列名别改）');
}

if (slideCount === 0) {
    info('pages', 'slides/ 还没有页面——运行 /slide-design 生成');
} else if (declaredPages === 0) {
    info('pages', 'meta 大纲没标页数（### 标题里写「（6 张）」），页数一致性跳过');
} else if (declaredPages !== slideCount) {
    warn('pages', `meta 大纲声明 ${declaredPages} 张，slides/ 实有 ${slideCount} 个`);
}

// 5) 幻灯片与蓝图活动的对账（M/L 档，且页数对得上才做映射）
const slideMap = isMPlus ? mapSlidesToModules(course) : null;
if (slideMap) {
    for (const m of modules) {
        if (isBlank(m.activity)) continue;
        const pages = slideMap[m.no] || [];
        if (!pages.some(s => s.has('activity-card'))) {
            warn('slides', `模块 ${m.no}「${label(m.name)}」蓝图里有活动「${m.activity}」，但这几页里没有 Activity 页（.activity-card）——学员看不到任务、时间与评分点`);
        }
    }
    if (!slides.some(s => s.has('rubric-table'))) {
        info('slides', '全 deck 没有 Assessment 页（.rubric-table）——结营要考核的话，学员应该在课上看到评分标准');
    }
} else if (isMPlus && slideCount && declaredPages !== slideCount) {
    info('slides', '页数与大纲对不上，Activity 页对账跳过（先把 meta 大纲的「（N 张）」改准）');
}

// 6) 时长核算
if (modules.length) {
    const unparsed = modules.filter(m => m.minutes === null);
    if (unparsed.length) {
        warn('duration', `模块时长无法解析: ${unparsed.map(m => `模块 ${m.no}「${m.duration}」`).join(', ')}（写成 60 min 或 1.5h）`);
    }
    const sum = modules.reduce((a, m) => a + (m.minutes || 0), 0);
    const total = parseMinutes(meta.duration);
    if (total && sum) {
        const gap = total - sum;
        const ratio = Math.abs(gap) / total;
        if (gap < 0) {
            err('duration', `模块时长合计 ${sum} min 超过声明总时长 ${total} min（超 ${-gap} min）`);
        } else if (ratio > 0.4) {
            warn('duration', `模块时长合计 ${sum} min，声明总时长 ${total} min，缺口 ${gap} min（占 ${Math.round(ratio * 100)}%）——开场收尾休息真占这么多？`);
        }
    } else if (!total && !isBlank(meta.duration)) {
        info('duration', `duration「${meta.duration}」解析不出分钟数，时长核算跳过`);
    }
}

// ─── 对齐矩阵 ────────────────────────────────────────────────────────────────

let alignmentPath = null;
if (isMPlus && hasBlueprint && outcomes.length) {
    const pkgDir = path.join(course.dir, 'package');
    fs.mkdirSync(pkgDir, { recursive: true });
    const cell = v => (isBlank(v) ? '—' : String(v).replace(/\|/g, '\\|'));
    const rows = outcomes.map(o => {
        const mods = o.modules.map(n => modules.find(m => m.no === n)).filter(Boolean);
        return `| ${o.id} | ${cell(o.do)} | ${o.bloom || '—'} | ${
            mods.length ? mods.map(m => `${m.no} ${label(m.name)}`).join('<br>') : cell(o.module)} | ${
            cell(mods.map(m => m.activity).filter(v => !isBlank(v)).join('；'))} | ${
            cell(mods.map(m => m.deliverable).filter(v => !isBlank(v)).join('；'))} | ${cell(o.evidence)} |`;
    });
    const orphan = modules.filter(m => !outcomes.some(o => o.modules.includes(m.no)));
    const md = [
        // h1 只写功能名, 课程名由 render-md 放到下一行小字 —— 与 package.js 同一口径
        `# 对齐矩阵`,
        '',
        '> 由 `nextcourse check` 自动生成，勿手改。',
        `> 数据源：\`${blueprintName}\` 模块清单 + \`course.meta.md\` outcomes。`,
        `> 生成时间：${new Date().toISOString().slice(0, 10)}`,
        '',
        '| 成果 | 学完能做到 | Bloom | 在哪教 | 教学活动 | 学员产出 | 判定证据 |',
        '|---|---|---|---|---|---|---|',
        ...rows,
        '',
        orphan.length
            ? `**没有挂上任何学习成果的模块**：${orphan.map(m => `${m.no}「${label(m.name)}」`).join('、')}——要么补 outcome，要么砍掉。`
            : '**每个模块都挂到了学习成果。**',
        '',
    ].join('\n');
    // 老课程里可能还躺着没有交付序号的 alignment.md, 就地改名, 别留两份
    const legacy = path.join(pkgDir, 'alignment.md');
    alignmentPath = path.join(pkgDir, ALIGNMENT_FILE);
    if (fs.existsSync(legacy) && !fs.existsSync(alignmentPath)) fs.renameSync(legacy, alignmentPath);
    fs.writeFileSync(alignmentPath, md, 'utf8');
}

// ─── 报告 ────────────────────────────────────────────────────────────────────

const errors   = issues.filter(i => i.level === 'error');
const warnings = issues.filter(i => i.level === 'warn');
const infos    = issues.filter(i => i.level === 'info');

const bloomTally = outcomes.reduce((acc, o) => {
    const k = o.bloom || '?';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
}, {});

console.log(`\nNextCourse Check — ${courseName}`);
console.log('─'.repeat(56));
console.log(`  档位     : ${SCALE_LABEL[scale] || scale}${meta.scale ? '' : '  (未声明，按 S 处理)'}`);
console.log(`  蓝图     : ${hasBlueprint ? blueprintName : '(无)'}`);
console.log(`  学习成果 : ${outcomes.length} 条  ${
    Object.entries(bloomTally).map(([k, v]) => `${k}×${v}`).join(' ') || ''}`);
console.log(`  模块     : 蓝图 ${modules.length} 个 / meta 大纲 ${metaModules.length} 个`);
console.log(`  页数     : meta 声明 ${declaredPages || '—'} 张 / slides/ 实有 ${slideCount} 个`);

const ICON = { error: '✗', warn: '⚠', info: '·' };
if (issues.length) {
    console.log('');
    for (const level of ['error', 'warn', 'info']) {
        for (const it of issues.filter(i => i.level === level)) {
            const line = `  ${ICON[level]}  [${it.code.padEnd(8)}]  ${it.msg}`;
            if (level === 'error') console.error(line); else console.log(line);
        }
    }
}

if (alignmentPath) {
    console.log(`\n  ✓  对齐矩阵已生成: ${path.relative(ROOT, alignmentPath)}`);
}

console.log(`\n${'─'.repeat(56)}`);
const tail = `${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} note(s)`;
if (errors.length === 0) {
    console.log(`  PASS  教学设计闭环无阻断问题 — ${tail}\n`);
    process.exit(0);
} else {
    console.error(`  FAIL  ${tail}\n`);
    process.exit(1);
}

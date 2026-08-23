#!/usr/bin/env node
/**
 * check.js — NextCourse V3 教学设计闭环校验
 *
 * lint 管样式, check 管教学逻辑。读取:
 *   courses/<name>/course.meta.md        构建契约 (frontmatter + 页面级大纲)
 *   courses/<name>/course.blueprint.md   设计层真相 (M / L 档)
 *   courses/<name>/slides/*.html         实际页数
 *
 * 校验项:
 *   1. 一致性  : blueprint 模块清单 ↔ meta 大纲 ↔ slides/ 实际页数
 *   2. 闭环    : 每条 outcome 至少被 1 个模块教到 + 有 1 条判定证据
 *   3. 深度    : Bloom 分布, 全落在 remember/understand 则警告「课程太浅」
 *   4. 时长    : 各模块时长之和 vs 声明总时长 (含休息与缓冲)
 *   5. 完整度  : M/L 档必填章节缺失提醒
 *   6. 产出    : 写出 package/alignment.md 对齐矩阵 (M/L 档)
 *
 * 退出码: 有 error 时 1, 只有 warning 时 0
 *
 * 用法: node check.js <course-name>
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;

// ─── 参数 ────────────────────────────────────────────────────────────────────
const [,, courseName] = process.argv;
if (!courseName) {
    console.error('Usage: node check.js <course-name>');
    process.exit(1);
}

const COURSE_DIR = path.join(ROOT, 'courses', courseName);
const META_PATH  = path.join(COURSE_DIR, 'course.meta.md');
if (!fs.existsSync(META_PATH)) {
    console.error(`ERROR: course.meta.md not found at ${META_PATH}`);
    process.exit(1);
}

// ─── 通用解析工具 ────────────────────────────────────────────────────────────

// 「中文书名号占位」= 模板没填, 一律当空处理
const PLACEHOLDER = /^[「『][\s\S]*[」』]$/;

function isBlank(v) {
    return !v || !String(v).trim() || PLACEHOLDER.test(String(v).trim());
}

// 报告里显示名称: 占位符统一显示成「未填」, 免得出现「「模块名」」这种套娃
function label(v) {
    return isBlank(v) ? '未填' : String(v).replace(/^[「『]|[」』]$/g, '');
}

function unquote(v) {
    const s = String(v).trim();
    if (/^".*"$/.test(s) || /^'.*'$/.test(s)) return s.slice(1, -1);
    return s;
}

// 逗号分隔但要跳过引号内的逗号: {do: "a, b", bloom: apply}
function splitTopLevel(s, sep = ',') {
    const out = [];
    let cur = '', quote = null;
    for (const ch of s) {
        if (quote) {
            if (ch === quote) quote = null;
            cur += ch;
        } else if (ch === '"' || ch === "'") {
            quote = ch; cur += ch;
        } else if (ch === sep) {
            out.push(cur); cur = '';
        } else {
            cur += ch;
        }
    }
    if (cur.trim()) out.push(cur);
    return out;
}

function splitKV(line) {
    const i = line.indexOf(':');
    if (i < 1) return null;
    return [line.slice(0, i).trim(), unquote(line.slice(i + 1))];
}

/**
 * frontmatter 解析: 标量 + outcomes 列表。
 * outcomes 两种写法都支持——
 *   - { do: "...", bloom: apply, success: "..." }          流式 (S 档模板)
 *   - id: LO1                                              块式 (M/L 档模板)
 *     do: "..."
 */
function parseFrontmatter(src) {
    const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const result = { scalars: {}, outcomes: [] };
    if (!m) return result;

    const lines = m[1].split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim() || /^\s*#/.test(line)) continue;
        if (/^\S/.test(line)) {
            const kv = splitKV(line);
            if (!kv) continue;
            const [key, val] = kv;
            if (key === 'outcomes' && !val) {
                let item = null;
                while (i + 1 < lines.length && (!lines[i + 1].trim() || /^\s/.test(lines[i + 1]))) {
                    const sub = lines[++i];
                    if (!sub.trim()) continue;
                    const dash = sub.match(/^\s*-\s*(.*)$/);
                    if (dash) {
                        item = {};
                        result.outcomes.push(item);
                        const body = dash[1].trim();
                        if (body.startsWith('{')) {
                            for (const part of splitTopLevel(body.replace(/^\{|\}\s*$/g, ''))) {
                                const p = splitKV(part);
                                if (p) item[p[0]] = p[1];
                            }
                        } else {
                            const p = splitKV(body);
                            if (p) item[p[0]] = p[1];
                        }
                    } else if (item) {
                        const p = splitKV(sub);
                        if (p) item[p[0]] = p[1];
                    }
                }
            } else {
                result.scalars[key] = val;
            }
        }
    }
    return result;
}

// markdown 表格 → 对象数组 (以表头单元格为 key)
function parseTables(lines) {
    const tables = [];
    for (let i = 0; i < lines.length; i++) {
        if (!/^\s*\|/.test(lines[i])) continue;
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) continue;
        const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const header = cells(lines[i]);
        const rows = [];
        let j = i + 2;
        for (; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
            const vals = cells(lines[j]);
            const obj = {};
            header.forEach((h, k) => { obj[h] = vals[k] === undefined ? '' : vals[k]; });
            rows.push(obj);
        }
        tables.push({ header, rows });
        i = j;
    }
    return tables;
}

// "1 天（有效 6.5h）" → 390 ; "90 分钟" → 90 ; "半天" → null
function parseMinutes(s) {
    if (!s) return null;
    const h = String(s).match(/(\d+(?:\.\d+)?)\s*(?:h\b|hr|hours?|小时)/i);
    if (h) return Math.round(parseFloat(h[1]) * 60);
    const m = String(s).match(/(\d+(?:\.\d+)?)\s*(?:min\b|minutes?|分钟|分\b)/i);
    if (m) return Math.round(parseFloat(m[1]));
    return null;
}

const CN_NUM = { 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10 };

function moduleNo(text) {
    const m = String(text).match(/模块\s*([一二三四五六七八九十]|\d+)/);
    if (!m) return null;
    return CN_NUM[m[1]] || parseInt(m[1], 10);
}

function outcomeIds(text) {
    return String(text).match(/\bLO\d+/gi) || [];
}

// ─── 读取三份输入 ────────────────────────────────────────────────────────────

const metaSrc = fs.readFileSync(META_PATH, 'utf8');
const { scalars: meta, outcomes: rawOutcomes } = parseFrontmatter(metaSrc);

const scale = (meta.scale || 'S').toUpperCase();
const SCALE_LABEL = { S: 'S · 分享课', M: 'M · 内训课', L: 'L · 培训项目' };
const isMPlus = scale === 'M' || scale === 'L';

// 没写 id 的按顺序补 LO1..LOn, 后面的矩阵才有得引用
const outcomes = rawOutcomes.map((o, i) => ({
    id: o.id || `LO${i + 1}`,
    do: o.do || '',
    bloom: (o.bloom || '').toLowerCase(),
    success: o.success || '',
    module: o.module || '',
    evidence: o.evidence || '',
    hasId: !!o.id,
}));

// meta 正文: ### 标题（N 张）
const metaHeadings = [];
for (const line of metaSrc.split(/\r?\n/)) {
    const h = line.match(/^###\s+(.*?)\s*$/);
    if (!h) continue;
    const text = h[1];
    const pages = text.match(/[（(]\s*(\d+)\s*张/);
    metaHeadings.push({
        text,
        no: moduleNo(text),
        pages: pages ? parseInt(pages[1], 10) : null,
        name: text.replace(/^模块\s*[一二三四五六七八九十\d]+\s*[:：]?\s*/, '')
                  .replace(/[（(][^）)]*[）)]\s*$/, '').trim(),
    });
}

// blueprint
const blueprintName = meta.blueprint || 'course.blueprint.md';
const BP_PATH = path.join(COURSE_DIR, blueprintName);
const hasBlueprint = fs.existsSync(BP_PATH);
// 注释掉的章节不算数 (模板里 六~十一 节就是注释掉的)
const bpSrc   = hasBlueprint ? fs.readFileSync(BP_PATH, 'utf8').replace(/<!--[\s\S]*?-->/g, '') : '';
const bpLines = bpSrc.split(/\r?\n/);
const bpHeads = bpLines.filter(l => /^##\s/.test(l)).map(l => l.replace(/^##\s+/, '').trim());
const bpTables = parseTables(bpLines);

function findTable(...keywords) {
    return bpTables.find(t => keywords.every(k => t.header.some(h => h.includes(k))));
}

const modTable = findTable('模块', '时长');
const bpModules = modTable ? modTable.rows.map(r => {
    const col = n => r[Object.keys(r).find(k => k.includes(n))] || '';
    return {
        no: parseInt(r['#'] || col('#') || '', 10),
        name: col('模块'),
        duration: col('时长'),
        activity: col('活动'),
        deliverable: col('产出'),
        outcomes: outcomeIds(col('覆盖') || col('成果')),
    };
}).filter(m => !isNaN(m.no)) : [];

const loTable = findTable('id', 'Bloom') || findTable('id', 'bloom');
const bpOutcomeIds = loTable ? loTable.rows.map(r => (r['id'] || r['ID'] || '').trim()).filter(Boolean) : [];

// slides
const SLIDES_DIR = path.join(COURSE_DIR, 'slides');
const slideCount = fs.existsSync(SLIDES_DIR)
    ? fs.readdirSync(SLIDES_DIR).filter(f => f.endsWith('.html')).length
    : 0;

// ─── 校验 ────────────────────────────────────────────────────────────────────

const issues = [];
const add = (level, code, msg) => issues.push({ level, code, msg });
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
if (outcomes.length === 0) {
    err('outcome', 'frontmatter 里没有 outcomes');
} else {
    if (outcomes.length < 3) warn('outcome', `只有 ${outcomes.length} 条学习成果（建议 3–5 条）`);
    if (outcomes.length > 5) warn('outcome', `有 ${outcomes.length} 条学习成果（建议不超过 5 条，宁缺毋滥）`);

    const BLOOM = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
    for (const o of outcomes) {
        if (!o.bloom) warn('outcome', `${o.id} 没写 bloom`);
        else if (!BLOOM.includes(o.bloom)) warn('outcome', `${o.id} 的 bloom "${o.bloom}" 不是 Bloom 六层之一`);
        if (isBlank(o.do)) err('outcome', `${o.id} 的 do 为空`);
        if (isBlank(o.success)) warn('outcome', `${o.id} 没写 success（成功标准）`);
    }
    const deep = outcomes.filter(o => BLOOM.indexOf(o.bloom) >= 2);
    if (deep.length === 0) {
        warn('depth', '全部成果停留在 remember / understand 层——课程可能太浅，至少 1 条应达到 apply 及以上');
    }
}

// 3) 闭环: 教到 + 测到
// S 档不强制闭环（30 分钟的分享课没有考核），只在末尾提示一句，不逐条刷屏
const openLoop = { module: [], evidence: [] };
const closure = isMPlus
    ? err
    : (code, msg, id, kind) => openLoop[kind].push(id);
for (const o of outcomes) {
    if (isBlank(o.module)) {
        closure('closure', `${o.id} 没指定 module（在哪个模块教）`, o.id, 'module');
    } else if (bpModules.length) {
        const nos = String(o.module).split(/[、,，\s/]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n));
        for (const n of nos) {
            const mod = bpModules.find(m => m.no === n);
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
for (const m of bpModules) {
    for (const id of m.outcomes) {
        if (!outcomes.some(o => o.id.toUpperCase() === id.toUpperCase())) {
            err('closure', `模块 ${m.no} 覆盖成果写了 ${id}，但 outcomes 里没有这条`);
        }
    }
    if (!m.outcomes.length) warn('closure', `模块 ${m.no}「${label(m.name)}」没写覆盖成果（它在教哪条 outcome？）`);
    if (isBlank(m.deliverable)) warn('closure', `模块 ${m.no}「${label(m.name)}」没有产出物——学员从这个模块带走什么？`);
}
if (bpOutcomeIds.length) {
    const metaIds = outcomes.map(o => o.id.toUpperCase());
    for (const id of bpOutcomeIds) {
        if (!metaIds.includes(id.toUpperCase())) {
            warn('drift', `蓝图目标体系里的 ${id} 在 course.meta.md 的 outcomes 里不存在`);
        }
    }
    for (const id of metaIds) {
        if (!bpOutcomeIds.some(x => x.toUpperCase() === id)) {
            warn('drift', `outcomes 里的 ${id} 没写进蓝图的目标体系表`);
        }
    }
}

// 4) 一致性: blueprint ↔ meta ↔ slides
const metaModules = metaHeadings.filter(h => h.no !== null);
if (bpModules.length) {
    bpModules.forEach((m, i) => {
        if (m.no !== i + 1) warn('drift', `蓝图模块编号不连续: 第 ${i + 1} 行写的是 ${m.no}`);
    });
    if (metaModules.length && metaModules.length !== bpModules.length) {
        err('drift', `蓝图有 ${bpModules.length} 个模块，course.meta.md 大纲里有 ${metaModules.length} 个`);
    }
    for (const mm of metaModules) {
        const bm = bpModules.find(m => m.no === mm.no);
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

const declaredPages = metaHeadings.reduce((n, h) => n + (h.pages || 0), 0);
if (slideCount === 0) {
    info('pages', 'slides/ 还没有页面——运行 /slide-design 生成');
} else if (declaredPages === 0) {
    info('pages', 'meta 大纲没标页数（### 标题里写「（6 张）」），页数一致性跳过');
} else if (declaredPages !== slideCount) {
    warn('pages', `meta 大纲声明 ${declaredPages} 张，slides/ 实有 ${slideCount} 个`);
}

// 5) 时长核算
if (bpModules.length) {
    const mins = bpModules.map(m => parseMinutes(m.duration));
    const unparsed = bpModules.filter((m, i) => mins[i] === null);
    if (unparsed.length) {
        warn('duration', `模块时长无法解析: ${unparsed.map(m => `模块 ${m.no}「${m.duration}」`).join(', ')}（写成 60 min 或 1.5h）`);
    }
    const sum = mins.reduce((a, b) => a + (b || 0), 0);
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
    const pkgDir = path.join(COURSE_DIR, 'package');
    fs.mkdirSync(pkgDir, { recursive: true });
    const cell = v => (isBlank(v) ? '—' : String(v).replace(/\|/g, '\\|'));
    const rows = outcomes.map(o => {
        const nos = String(o.module).split(/[、,，\s/]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n));
        const mods = nos.map(n => bpModules.find(m => m.no === n)).filter(Boolean);
        return `| ${o.id} | ${cell(o.do)} | ${o.bloom || '—'} | ${
            mods.length ? mods.map(m => `${m.no} ${label(m.name)}`).join('<br>') : cell(o.module)} | ${
            cell(mods.map(m => m.activity).filter(Boolean).join('；'))} | ${
            cell(mods.map(m => m.deliverable).filter(Boolean).join('；'))} | ${cell(o.evidence)} |`;
    });
    const orphan = bpModules.filter(m => !outcomes.some(o =>
        String(o.module).split(/[、,，\s/]+/).map(n => parseInt(n, 10)).includes(m.no)));
    const md = [
        `# ${unquote(meta.title || courseName)} — 对齐矩阵`,
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
            ? `**没有挂上任何学习成果的模块**：${orphan.map(m => `${m.no}「${m.name}」`).join('、')}——要么补 outcome，要么砍掉。`
            : '**每个模块都挂到了学习成果。**',
        '',
    ].join('\n');
    alignmentPath = path.join(pkgDir, 'alignment.md');
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
console.log(`  模块     : 蓝图 ${bpModules.length} 个 / meta 大纲 ${metaModules.length} 个`);
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

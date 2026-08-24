'use strict';
/**
 * course-model.js — 课程数据模型（零依赖）
 *
 * 把 courses/<name>/ 下三份输入读成一个对象，供 check.js 与 package.js 共用：
 *   course.meta.md       构建契约: frontmatter (含 outcomes) + 页面级大纲
 *   course.blueprint.md  设计层真相: 章节 + 模块清单表 + 模块详述   (M / L 档)
 *   slides/*.html        实际页数 + 演讲备注
 *
 * 这里只做**解析**，不做判断。所有「该不该报警」的规则都在 check.js 里，
 * 所有「生成什么文档」的规则都在 package.js 里。
 */

const fs   = require('fs');
const path = require('path');

// 对齐矩阵由 check.js 写、package.js 渲染, 文件名带交付序号 (见 package.js 抬头),
// 两边必须一致 —— 所以名字放在这里, 别在任何一边写字面量。
const ALIGNMENT_FILE = '7_alignment.md';

// ─── 小工具 ──────────────────────────────────────────────────────────────────

// 「中文书名号占位」= 模板没填, 一律当空处理
const PLACEHOLDER = /^[「『][\s\S]*[」』]$/;

function isBlank(v) {
    const s = String(v == null ? '' : v).trim();
    return !s || s === '—' || s === '-' || PLACEHOLDER.test(s);
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

// 「3」「1、2」「2 / 3」→ [3] / [1,2] / [2,3]
function moduleRefs(v) {
    return String(v == null ? '' : v)
        .split(/[、,，\s/]+/)
        .map(n => parseInt(n, 10))
        .filter(n => !isNaN(n));
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
        if (!/^\S/.test(line)) continue;
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

// ─── 载入 ────────────────────────────────────────────────────────────────────

/**
 * @param {string} root  仓库根目录
 * @param {string} name  课程名
 * @returns {object|null} null 表示课程或 meta 不存在
 */
function loadCourse(root, name) {
    const dir      = path.join(root, 'courses', name);
    const metaPath = path.join(dir, 'course.meta.md');
    if (!fs.existsSync(metaPath)) return null;

    const metaSrc = fs.readFileSync(metaPath, 'utf8');
    const { scalars: meta, outcomes: rawOutcomes } = parseFrontmatter(metaSrc);

    const scale = (meta.scale || 'S').toUpperCase();

    // 没写 id 的按顺序补 LO1..LOn, 后面的矩阵才有得引用
    const outcomes = rawOutcomes.map((o, i) => ({
        id: o.id || `LO${i + 1}`,
        do: o.do || '',
        bloom: (o.bloom || '').toLowerCase(),
        success: o.success || '',
        module: o.module || '',
        modules: moduleRefs(o.module),
        evidence: o.evidence || '',
        hasId: !!o.id,
    }));

    // meta 正文: ### 标题（N 张）
    const headings = [];
    for (const line of metaSrc.split(/\r?\n/)) {
        const h = line.match(/^###\s+(.*?)\s*$/);
        if (!h) continue;
        const text = h[1];
        const pages = text.match(/[（(]\s*(\d+)\s*张/);
        headings.push({
            text,
            no: moduleNo(text),
            pages: pages ? parseInt(pages[1], 10) : null,
            name: text.replace(/^模块\s*[一二三四五六七八九十\d]+\s*[:：]?\s*/, '')
                      .replace(/[（(][^）)]*[）)]\s*$/, '').trim(),
        });
    }

    // ── 蓝图 ──
    const blueprintName = meta.blueprint || 'course.blueprint.md';
    const bpPath = path.join(dir, blueprintName);
    const hasBlueprint = fs.existsSync(bpPath);
    // 注释掉的章节不算数 (模板里 六~十一 节就是注释掉的)
    const bpSrc   = hasBlueprint ? fs.readFileSync(bpPath, 'utf8').replace(/<!--[\s\S]*?-->/g, '') : '';
    const bpLines = bpSrc.split(/\r?\n/);

    // ## 章节 → { title, body }
    const sections = [];
    let cur = null;
    for (const line of bpLines) {
        const h = line.match(/^##\s+(.*?)\s*$/);
        if (h) { cur = { title: h[1], lines: [] }; sections.push(cur); continue; }
        if (cur) cur.lines.push(line);
    }
    for (const s of sections) s.body = s.lines.join('\n').trim();

    const section = (...keywords) =>
        sections.find(s => keywords.some(k => s.title.includes(k))) || null;

    const bpTables = parseTables(bpLines);
    const findTable = (...keywords) =>
        bpTables.find(t => keywords.every(k => t.header.some(h => h.toLowerCase().includes(k.toLowerCase()))));

    const modTable = findTable('模块', '时长');
    const modules = modTable ? modTable.rows.map(r => {
        const col = n => r[Object.keys(r).find(k => k.includes(n))] || '';
        return {
            no: parseInt(r['#'] || col('#') || '', 10),
            name: col('模块'),
            duration: col('时长'),
            minutes: parseMinutes(col('时长')),
            activity: col('活动'),
            deliverable: col('产出'),
            outcomes: outcomeIds(col('覆盖') || col('成果')),
        };
    }).filter(m => !isNaN(m.no)) : [];

    // #### 模块 1 · 名称 → 详述字段 (解决的问题 / 关键内容 / 教学活动 / 产出物 …)
    const details = {};
    let dcur = null;
    for (const line of bpLines) {
        const h = line.match(/^####\s+(.*?)\s*$/);
        if (h) {
            const no = moduleNo(h[1]);
            dcur = no ? (details[no] = { title: h[1], fields: {}, lines: [] }) : null;
            continue;
        }
        if (!dcur) continue;
        dcur.lines.push(line);
        const f = line.match(/^\s*[-*]\s*\*\*(.+?)\*\*\s*[:：]\s*(.*)$/);
        if (f) dcur.fields[f[1].trim()] = f[2].trim();
    }
    for (const no of Object.keys(details)) details[no].body = details[no].lines.join('\n').trim();

    const loTable = findTable('id', 'bloom');
    const blueprintOutcomeIds = loTable
        ? loTable.rows.map(r => (r['id'] || r['ID'] || '').trim()).filter(Boolean)
        : [];

    // ── slides ──
    const slidesDir = path.join(dir, 'slides');
    const slideFiles = fs.existsSync(slidesDir)
        ? fs.readdirSync(slidesDir).filter(f => f.endsWith('.html')).sort()
        : [];
    const stripTags = s => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const slides = slideFiles.map(f => {
        const src  = fs.readFileSync(path.join(slidesDir, f), 'utf8');
        const h2   = src.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
        const note = src.match(/<aside\b[^>]*class\s*=\s*["'][^"']*\bnotes\b[^"']*["'][^>]*>([\s\S]*?)<\/aside>/i);
        return {
            file: f,
            title: h2 ? stripTags(h2[1]) : '',
            notes: note ? stripTags(note[1]) : '',
            html: src,
            has: cls => new RegExp(`class\\s*=\\s*["'][^"']*\\b${cls}\\b`).test(src),
        };
    });

    return {
        name, dir, metaPath, metaSrc,
        meta, title: unquote(meta.title || name),
        scale, isMPlus: scale === 'M' || scale === 'L',
        outcomes, headings,
        blueprintName, blueprintPath: bpPath, hasBlueprint,
        blueprintSrc: bpSrc, sections, section, tables: bpTables, findTable,
        modules, details, blueprintOutcomeIds,
        slides,
        declaredPages: headings.reduce((n, h) => n + (h.pages || 0), 0),
    };
}

/**
 * 把 slides 按 meta 大纲的页数顺序切给各模块。
 * 只在「声明页数 == 实际页数」时可信，对不上就返回 null（宁可不映射，也不给错映射）。
 */
function mapSlidesToModules(course) {
    if (!course.slides.length || course.declaredPages !== course.slides.length) return null;
    const map = {};
    let cursor = 0;
    for (const h of course.headings) {
        const n = h.pages || 0;
        if (h.no !== null) map[h.no] = course.slides.slice(cursor, cursor + n);
        cursor += n;
    }
    return map;
}

module.exports = {
    ALIGNMENT_FILE,
    isBlank, label, unquote, splitTopLevel, splitKV,
    parseMinutes, moduleNo, outcomeIds, moduleRefs,
    parseFrontmatter, parseTables,
    loadCourse, mapSlidesToModules,
};

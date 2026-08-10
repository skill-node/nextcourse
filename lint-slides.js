#!/usr/bin/env node
/**
 * lint-slides.js — NextCourse V2 样式闸
 *
 * 扫描 courses/<name>/slides/*.html, 发现违规即报告并以 exit 1 结束
 *
 * 违规类型 (exit 1):
 *   1. inline-style   : 出现 style="..." 属性
 *   2. hardcoded-hex  : <style> 块内写死十六进制颜色 (#xxx / #xxxxxx)
 *   3. hardcoded-rgb  : <style> 块内写死 rgb()/rgba()
 *   4. new-font       : <style> 块内声明 font-family (应用 var(--font-*) 令牌)
 *   5. unknown-class  : 使用了未在设计系统登记的 CSS class
 *
 * 密度警告 (报告但不阻断, 对应设计规范"密度自律"):
 *   - h2-too-long     : H2 标题 > 15 字
 *   - item-too-long   : 列表条目 > 20 字
 *   - too-many-items  : 单个列表 > 6 项
 *   - long-paragraph  : 段落 > 80 字 (应改为列表/组件)
 *
 * 用法:
 *   node lint-slides.js <course-name>        # 扫描指定课程
 *   node lint-slides.js openclaw_2
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;

// ─── 参数 ───────────────────────────────────────────────────────────────────
const [,, courseName] = process.argv;
if (!courseName) {
    console.error('Usage: node lint-slides.js <course-name>');
    process.exit(1);
}

const SLIDES_DIR = path.join(ROOT, 'courses', courseName, 'slides');
if (!fs.existsSync(SLIDES_DIR)) {
    console.error(`ERROR: slides/ not found at ${SLIDES_DIR}`);
    process.exit(1);
}

// ─── 构建已登记 class 白名单 ────────────────────────────────────────────────
function extractClassesFromCss(css) {
    const classes = new Set();
    // 匹配 .className{ 或 .className 后接空格/换行/,/:
    const re = /\.(-?[a-zA-Z_][\w-]*)(?=[^{]*[{,\s:])/g;
    let m;
    while ((m = re.exec(css)) !== null) {
        classes.add(m[1]);
    }
    return classes;
}

// 课程实际使用的 template (决定加载哪套 theme CSS 进白名单,
// 避免 standard 课程用了 modern-only 的 class 却通过 lint)
function courseTemplate() {
    const metaPath = path.join(ROOT, 'courses', courseName, 'course.meta.md');
    if (!fs.existsSync(metaPath)) return 'standard';
    const m = fs.readFileSync(metaPath, 'utf8').match(/^template:\s*["']?([\w-]+)["']?\s*$/m);
    return m ? m[1] : 'standard';
}

// 设计系统文件 (自动提取 class)
const DESIGN_CSS = [
    path.join(ROOT, 'shared_styles', 'themes', `${courseTemplate()}.css`),
    path.join(ROOT, 'shared_styles', 'components.css'),
    path.join(ROOT, 'shared_styles', 'animations.css'),
    path.join(ROOT, 'shared_styles', 'base_layout.css'),
];

const ALLOWED = new Set([
    // Reveal.js 运行时 class
    'reveal', 'slides', 'present', 'past', 'future', 'visible',
    'fragment', 'current-fragment', 'has-dark-background',
    'r-fit-text', 'r-stack', 'r-hstack', 'r-vstack',
    // Reveal.js 演讲备注
    'notes',
    // HTML 语义 class (无限制)
    'sr-only',
    // 工具
    'clearfix',
]);

for (const f of DESIGN_CSS) {
    if (fs.existsSync(f)) {
        const classes = extractClassesFromCss(fs.readFileSync(f, 'utf8'));
        for (const c of classes) ALLOWED.add(c);
    }
}

// ─── 扫描 ────────────────────────────────────────────────────────────────────
const htmlFiles = fs.readdirSync(SLIDES_DIR)
    .filter(f => f.endsWith('.html'))
    .sort();

if (htmlFiles.length === 0) {
    console.log('No .html files found in slides/ — nothing to lint.');
    process.exit(0);
}

let totalViolations = 0;
let totalWarnings   = 0;
const violationLog  = [];
const warningLog    = [];

// 密度阈值 (对应设计规范"密度自律")
const DENSITY = { h2: 15, item: 20, listItems: 6, paragraph: 80 };

for (const file of htmlFiles) {
    const filePath = path.join(SLIDES_DIR, file);
    const src      = fs.readFileSync(filePath, 'utf8');
    const violations = [];
    const warnings   = [];

    // ── 1. inline style= ────────────────────────────────────────────────────
    const inlineRe = /\bstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi;
    for (const m of src.matchAll(inlineRe)) {
        const preview = m[0].length > 70 ? m[0].slice(0, 70) + '…' : m[0];
        violations.push({ type: 'inline-style', detail: preview });
    }

    // ── 2-4. <style> 块内容 ──────────────────────────────────────────────────
    const styleBlockRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    for (const sm of src.matchAll(styleBlockRe)) {
        const block = sm[1];

        // 写死 hex 颜色
        const hexRe = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
        for (const hm of block.matchAll(hexRe)) {
            violations.push({ type: 'hardcoded-hex', detail: hm[0] });
        }

        // rgb/rgba
        if (/\brgba?\s*\(/.test(block)) {
            violations.push({ type: 'hardcoded-rgb', detail: 'rgb()/rgba() in <style>' });
        }

        // font-family
        if (/\bfont-family\s*:/.test(block)) {
            violations.push({ type: 'new-font', detail: 'font-family: declared in <style> — use var(--font-display) or var(--font-body)' });
        }
    }

    // ── 5. 未登记 class ──────────────────────────────────────────────────────
    const classRe = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    const unknownSet = new Set();

    for (const cm of src.matchAll(classRe)) {
        const classList = (cm[1] || cm[2]).split(/\s+/).filter(Boolean);
        for (const cls of classList) {
            if (unknownSet.has(cls)) continue;

            // 跳过: module-N / fragment index / Reveal data 类
            if (/^module-\d+$/.test(cls))               continue;
            if (/^(r-|has-|no-|data-)[\w-]+$/.test(cls)) continue;
            // 跳过 Tailwind-like 单字母断点前缀 (md: sm: 等, 如果将来引入)
            if (/^[a-z]{2}:/.test(cls))                  continue;

            if (!ALLOWED.has(cls)) {
                unknownSet.add(cls);
                violations.push({ type: 'unknown-class', detail: `.${cls}` });
            }
        }
    }

    // ── 6. 密度警告 (不阻断) ─────────────────────────────────────────────────
    // 演讲备注不上屏, 不参与密度检查
    const visible = src
        .replace(/<aside\b[^>]*class\s*=\s*["'][^"']*\bnotes\b[^"']*["'][\s\S]*?<\/aside>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    const textOf = s => s.replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, '');
    const clip   = (s, n) => { const c = [...s]; return c.length > n ? c.slice(0, n).join('') + '…' : s; };

    for (const m of visible.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)) {
        const t = textOf(m[1]);
        if ([...t].length > DENSITY.h2) {
            warnings.push({ type: 'h2-too-long', detail: `${[...t].length} 字 (≤${DENSITY.h2}): "${clip(t, 18)}"` });
        }
    }
    for (const m of visible.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
        const t = textOf(m[1]);
        if ([...t].length > DENSITY.item) {
            warnings.push({ type: 'item-too-long', detail: `${[...t].length} 字 (≤${DENSITY.item}): "${clip(t, 18)}"` });
        }
    }
    for (const m of visible.matchAll(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi)) {
        const n = (m[2].match(/<li\b/gi) || []).length;
        if (n > DENSITY.listItems) {
            warnings.push({ type: 'too-many-items', detail: `${n} 项 (≤${DENSITY.listItems})` });
        }
    }
    for (const m of visible.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
        const t = textOf(m[1]);
        // .prompt-compare__text 承载的是提示词原文, 逐字上屏才有教学价值
        // (见 DESIGN-SYSTEM.md § 20)。它超长不是版面失控, 不报警。
        if (/\bprompt-compare__text\b/.test(m[0])) continue;
        if ([...t].length > DENSITY.paragraph) {
            warnings.push({ type: 'long-paragraph', detail: `${[...t].length} 字 (≤${DENSITY.paragraph}), 建议改为列表/组件` });
        }
    }

    // ── 汇总 ─────────────────────────────────────────────────────────────────
    if (violations.length > 0) {
        violationLog.push({ file, violations });
        totalViolations += violations.length;
    }
    if (warnings.length > 0) {
        warningLog.push({ file, warnings });
        totalWarnings += warnings.length;
    }
}

// ─── 输出报告 ────────────────────────────────────────────────────────────────
const checked = htmlFiles.length;
const failed  = violationLog.length;
const passed  = checked - failed;

console.log(`\nNextCourse Lint — ${courseName}/slides/`);
console.log(`${'─'.repeat(50)}`);

// 先输出通过的文件 (无违规; 有密度警告标 ⚠)
for (const f of htmlFiles) {
    if (violationLog.find(v => v.file === f)) continue;
    const w = warningLog.find(v => v.file === f);
    console.log(w ? `  ⚠  ${f}  (${w.warnings.length} warning(s))` : `  ✓  ${f}`);
}

// 再输出违规文件
for (const { file, violations } of violationLog) {
    console.error(`\n  ✗  ${file}  (${violations.length} violation(s))`);
    for (const { type, detail } of violations) {
        console.error(`       [${type.padEnd(16)}]  ${detail}`);
    }
}

// 密度警告详情
if (totalWarnings > 0) {
    console.log(`\n  密度警告 (不阻断构建, 但建议处理):`);
    for (const { file, warnings } of warningLog) {
        for (const { type, detail } of warnings) {
            console.log(`       ${file}  [${type.padEnd(14)}]  ${detail}`);
        }
    }
}

console.log(`\n${'─'.repeat(50)}`);
const warnNote = totalWarnings > 0 ? `, ${totalWarnings} density warning(s)` : '';
if (totalViolations === 0) {
    console.log(`  PASS  ${passed}/${checked} files clean${warnNote}.\n`);
    process.exit(0);
} else {
    console.error(`  FAIL  ${failed}/${checked} files have violations (${totalViolations} total)${warnNote}.\n`);
    process.exit(1);
}

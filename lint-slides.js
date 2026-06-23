#!/usr/bin/env node
/**
 * lint-slides.js — CourseFlow V2 样式闸
 *
 * 扫描 courses/<name>/slides/*.html, 发现违规即报告并以 exit 1 结束
 *
 * 违规类型:
 *   1. inline-style   : 出现 style="..." 属性
 *   2. hardcoded-hex  : <style> 块内写死十六进制颜色 (#xxx / #xxxxxx)
 *   3. hardcoded-rgb  : <style> 块内写死 rgb()/rgba()
 *   4. new-font       : <style> 块内声明 font-family (应用 var(--font-*) 令牌)
 *   5. unknown-class  : 使用了未在设计系统登记的 CSS class
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

// 设计系统文件 (自动提取 class)
const DESIGN_CSS = [
    path.join(ROOT, 'shared_styles', 'themes',  'standard.css'),
    path.join(ROOT, 'shared_styles', 'components.css'),
    path.join(ROOT, 'shared_styles', 'animations.css'),
    path.join(ROOT, 'shared_styles', 'base_layout.css'),
    path.join(ROOT, 'shared_styles', 'themes',  'modern.css'),
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
const violationLog  = [];

for (const file of htmlFiles) {
    const filePath = path.join(SLIDES_DIR, file);
    const src      = fs.readFileSync(filePath, 'utf8');
    const violations = [];

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

    // ── 汇总 ─────────────────────────────────────────────────────────────────
    if (violations.length > 0) {
        violationLog.push({ file, violations });
        totalViolations += violations.length;
    }
}

// ─── 输出报告 ────────────────────────────────────────────────────────────────
const checked = htmlFiles.length;
const failed  = violationLog.length;
const passed  = checked - failed;

console.log(`\nCourseFlow Lint — ${courseName}/slides/`);
console.log(`${'─'.repeat(50)}`);

// 先输出通过的文件
for (const f of htmlFiles) {
    if (!violationLog.find(v => v.file === f)) {
        console.log(`  ✓  ${f}`);
    }
}

// 再输出违规文件
for (const { file, violations } of violationLog) {
    console.error(`\n  ✗  ${file}  (${violations.length} violation(s))`);
    for (const { type, detail } of violations) {
        console.error(`       [${type.padEnd(16)}]  ${detail}`);
    }
}

console.log(`\n${'─'.repeat(50)}`);
if (totalViolations === 0) {
    console.log(`  PASS  ${passed}/${checked} files clean.\n`);
    process.exit(0);
} else {
    console.error(`  FAIL  ${failed}/${checked} files have violations (${totalViolations} total).\n`);
    process.exit(1);
}

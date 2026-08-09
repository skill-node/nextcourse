#!/usr/bin/env node
/**
 * build.js — CourseFlow V2 deck assembler
 *
 * 读取 courses/<name>/course.meta.md + courses/<name>/slides/*.html
 * 组装成 courses/<name>/deck.html (零依赖离线 Reveal.js 课件)
 *
 * Usage: node build.js <course-name>
 *        node build.js openclaw_2
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;

// ─── 参数 ────────────────────────────────────────────────────────────────────
const [,, courseName] = process.argv;
if (!courseName) {
    console.error('Usage: node build.js <course-name>');
    process.exit(1);
}

const COURSE_DIR  = path.join(ROOT, 'courses', courseName);
const META_PATH   = path.join(COURSE_DIR, 'course.meta.md');
const SLIDES_DIR  = path.join(COURSE_DIR, 'slides');
const DECK_PATH   = path.join(COURSE_DIR, 'deck.html');
const TMPL_PATH   = path.join(ROOT, 'templates', 'master_template.html');

// ─── 校验 ────────────────────────────────────────────────────────────────────
for (const [label, p] of [
    ['course.meta.md', META_PATH],
    ['slides/',        SLIDES_DIR],
    ['master_template', TMPL_PATH],
]) {
    if (!fs.existsSync(p)) {
        console.error(`ERROR: ${label} not found at ${p}`);
        process.exit(1);
    }
}

// ─── 解析 frontmatter ────────────────────────────────────────────────────────
function parseFrontmatter(content) {
    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return {};
    const fm = {};
    for (const line of m[1].split(/\r?\n/)) {
        const colon = line.indexOf(':');
        if (colon < 1) continue;
        const key = line.slice(0, colon).trim();
        let val = line.slice(colon + 1).trim();
        // 去掉成对的包裹引号: title: "xxx" → xxx
        if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
        if (key && val) fm[key] = val;
    }
    return fm;
}

// 配色 → 默认字体集。字体与配色是两根正交的轴，但每套配色有个「原配」搭档；
// course.meta.md 写 fontset: 可以覆盖（例如给严肃课程配 editorial-serif）。
// 这份映射与各配色文件头注释里的「默认字体集」保持一致。
const DEFAULT_FONT_SET = {
    'bold-signal':      'impact-sans',
    'creative-voltage': 'voltage-sans',
    'dark-botanical':   'garamond-serif',
    'notebook-tabs':    'didone-serif',
    'swiss-modern':     'grotesk-sans',
    'dark-ocean':       'modern-sans',
    'warm-sand':        'modern-sans',
    'standard-default': 'modern-sans',
};

const meta     = parseFrontmatter(fs.readFileSync(META_PATH, 'utf8'));
const title    = meta.title    || courseName;
const template = meta.template || 'standard';
const theme    = meta.theme    || 'standard-default';
const fontSet  = meta.fontset  || DEFAULT_FONT_SET[theme] || 'modern-sans';

// theme / template / fontset 必须对应实际存在的 CSS 文件，否则 deck 会静默无样式
const themeCss    = path.join(ROOT, 'shared_styles', 'color-schemes', `${theme}.css`);
const templateCss = path.join(ROOT, 'shared_styles', 'themes', `${template}.css`);
const fontSetCss  = path.join(ROOT, 'shared_styles', 'font-sets', `${fontSet}.css`);
if (!fs.existsSync(themeCss)) {
    const available = fs.readdirSync(path.join(ROOT, 'shared_styles', 'color-schemes'))
        .filter(f => f.endsWith('.css')).map(f => f.replace(/\.css$/, '')).join(', ');
    console.error(`ERROR: theme "${theme}" 不存在 (course.meta.md)`);
    console.error(`       可选: ${available}`);
    process.exit(1);
}
if (!fs.existsSync(templateCss)) {
    console.error(`ERROR: template "${template}" 不存在 (course.meta.md), 可选: standard`);
    process.exit(1);
}
if (!fs.existsSync(fontSetCss)) {
    const available = fs.readdirSync(path.join(ROOT, 'shared_styles', 'font-sets'))
        .filter(f => f.endsWith('.css')).map(f => f.replace(/\.css$/, '')).join(', ');
    console.error(`ERROR: fontset "${fontSet}" 不存在 (course.meta.md)`);
    console.error(`       可选: ${available}`);
    process.exit(1);
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── 收集 slides ────────────────────────────────────────────────────────────
const slideFiles = fs.readdirSync(SLIDES_DIR)
    .filter(f => f.endsWith('.html'))
    .sort();

if (slideFiles.length === 0) {
    console.error(`ERROR: no .html files found in ${SLIDES_DIR}`);
    process.exit(1);
}

const slidesContent = slideFiles
    .map(f => {
        const src = fs.readFileSync(path.join(SLIDES_DIR, f), 'utf8').trim();
        return `            <!-- ${f} -->\n            ${src.replace(/\n/g, '\n            ')}`;
    })
    .join('\n\n');

// ─── 组装 ────────────────────────────────────────────────────────────────────
const tmpl = fs.readFileSync(TMPL_PATH, 'utf8');
const deck = tmpl
    .replace(/\{\{COURSE_TITLE\}\}/g,    escapeHtml(title))
    .replace(/\{\{COLOR_SCHEME\}\}/g,    theme)
    .replace(/\{\{FONT_SET\}\}/g,        fontSet)
    .replace(/\{\{TEMPLATE\}\}/g,        template)
    .replace(/\{\{SLIDES_CONTENT\}\}/g,  () => slidesContent);

fs.writeFileSync(DECK_PATH, deck, 'utf8');

console.log(`\nCourseFlow Build — ${courseName}`);
console.log(`${'─'.repeat(40)}`);
console.log(`  Theme    : ${theme}`);
console.log(`  Font set : ${fontSet}${meta.fontset ? '' : ' (配色默认)'}`);
console.log(`  Template : ${template}`);
console.log(`  Slides   : ${slideFiles.length}`);
console.log(`  Output   : ${DECK_PATH}`);
console.log(`\n  ✓  Build complete. Open deck.html in your browser.\n`);

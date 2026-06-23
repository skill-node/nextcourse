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
const TMPL_PATH   = path.join(ROOT, '.agent', 'skills', 'slide-renderer',
                               'resources', 'master_template.html');

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
        const val = line.slice(colon + 1).trim();
        if (key && val) fm[key] = val;
    }
    return fm;
}

const meta     = parseFrontmatter(fs.readFileSync(META_PATH, 'utf8'));
const title    = meta.title    || courseName;
const template = meta.template || 'standard';
const theme    = meta.theme    || 'default';

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
    .replace(/\{\{COURSE_TITLE\}\}/g,    title)
    .replace(/\{\{COLOR_SCHEME\}\}/g,    theme)
    .replace(/\{\{TEMPLATE\}\}/g,        template)
    .replace(/\{\{SLIDES_CONTENT\}\}/g,  slidesContent)
    .replace(/\{\{STYLE_PRESET_CSS\}\}/g, '');

fs.writeFileSync(DECK_PATH, deck, 'utf8');

console.log(`\nCourseFlow Build — ${courseName}`);
console.log(`${'─'.repeat(40)}`);
console.log(`  Theme    : ${theme}`);
console.log(`  Template : ${template}`);
console.log(`  Slides   : ${slideFiles.length}`);
console.log(`  Output   : ${DECK_PATH}`);
console.log(`\n  ✓  Build complete. Open deck.html in your browser.\n`);

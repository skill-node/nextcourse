#!/usr/bin/env node
/**
 * export.js — CourseFlow 课程导出工具
 *
 * 将课程打包成独立文件夹，可直接拷贝到 U 盘 / 云盘 / 其他电脑使用。
 * 打开 export/index.html 即可演示，无需网络、无需安装任何依赖。
 *
 * Usage:
 *   node export.js <course-name>              # 输出到 courses/<name>/export/
 *   node export.js <course-name> <输出目录>   # 输出到指定目录
 *
 * Examples:
 *   node export.js openclaw_2
 *   node export.js openclaw_2 ~/Desktop
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;

// ─── 参数 ────────────────────────────────────────────────────────────────────
const [,, courseName, outputBase] = process.argv;
if (!courseName) {
    console.error('Usage: node export.js <course-name> [output-dir]');
    process.exit(1);
}

const COURSE_DIR = path.join(ROOT, 'courses', courseName);
const DECK_PATH  = path.join(COURSE_DIR, 'deck.html');

if (!fs.existsSync(DECK_PATH)) {
    console.error(`ERROR: deck.html not found at ${DECK_PATH}`);
    console.error(`       Run 'node build.js ${courseName}' first.`);
    process.exit(1);
}

// 输出目录: 默认 courses/<name>/export/
const EXPORT_DIR = outputBase
    ? path.join(path.resolve(outputBase), courseName)
    : path.join(COURSE_DIR, 'export');

// ─── 工具函数 ────────────────────────────────────────────────────────────────
function copyDir(src, dest) {
    if (!fs.existsSync(src)) return 0;
    fs.mkdirSync(dest, { recursive: true });
    let count = 0;
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath  = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            count += copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
            count++;
        }
    }
    return count;
}

function dirSize(dir) {
    if (!fs.existsSync(dir)) return 0;
    let size = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        size += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size;
    }
    return size;
}

// ─── 1. 清空并重建输出目录 ───────────────────────────────────────────────────
if (fs.existsSync(EXPORT_DIR)) {
    fs.rmSync(EXPORT_DIR, { recursive: true, force: true });
}
fs.mkdirSync(EXPORT_DIR, { recursive: true });

// ─── 2. 处理 deck.html → index.html (修正所有相对路径) ──────────────────────
// 原始路径基于 courses/<name>/deck.html 位置:
//   ../../lib/           → ./lib/
//   ../../shared_styles/ → ./shared_styles/
//   ../assets/           → ./assets/      (slide 内图片)
let html = fs.readFileSync(DECK_PATH, 'utf8');
html = html
    .replace(/\.\.\/\.\.\/lib\//g,          './lib/')
    .replace(/\.\.\/\.\.\/shared_styles\//g, './shared_styles/')
    .replace(/\.\.\/assets\//g,             './assets/');

fs.writeFileSync(path.join(EXPORT_DIR, 'index.html'), html, 'utf8');

// ─── 3. 拷贝依赖 (只拷贝演示实际需要的文件) ──────────────────────────────────
let fileCount = 1; // index.html

// Reveal.js 运行时: dist/ + 图标字体 + notes 插件 (演讲者视图)
// lib/ 其余为开发文件 (examples/test/js/css 等), 不进交付包
for (const sub of ['dist', 'fonts', path.join('plugin', 'notes')]) {
    fileCount += copyDir(
        path.join(ROOT, 'lib', sub),
        path.join(EXPORT_DIR, 'lib', sub)
    );
}

// 设计系统 CSS: 只拷贝 index.html 实际引用的文件 (theme/template 各 1 套)
const cssRefs = [...html.matchAll(/\.\/shared_styles\/([\w./-]+\.css)/g)]
    .map(m => m[1]);
for (const rel of new Set(cssRefs)) {
    const src  = path.join(ROOT, 'shared_styles', rel);
    const dest = path.join(EXPORT_DIR, 'shared_styles', rel);
    if (!fs.existsSync(src)) {
        console.error(`ERROR: deck 引用的样式不存在: shared_styles/${rel}`);
        process.exit(1);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    fileCount++;
}

// 课程图片素材 (如果有)
const assetsDir = path.join(COURSE_DIR, 'assets');
if (fs.existsSync(assetsDir)) {
    fileCount += copyDir(assetsDir, path.join(EXPORT_DIR, 'assets'));
}

// ─── 4. 结果报告 ─────────────────────────────────────────────────────────────
const sizeMB = (dirSize(EXPORT_DIR) / 1024 / 1024).toFixed(1);

console.log(`\nCourseFlow Export — ${courseName}`);
console.log(`${'─'.repeat(50)}`);
console.log(`  输出目录 : ${EXPORT_DIR}`);
console.log(`  文件总数 : ${fileCount}`);
console.log(`  打包大小 : ${sizeMB} MB`);
console.log(`\n  ✓  完成。`);
console.log(`     将整个 "${path.basename(EXPORT_DIR)}" 文件夹`);
console.log(`     拷贝到 U 盘 / 云盘 / 任意电脑`);
console.log(`     双击 index.html 即可演示（无需联网）\n`);

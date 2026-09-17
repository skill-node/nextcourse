#!/usr/bin/env node
/**
 * export.js — NextCourse 课程导出工具
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

const { PKG_ROOT, pkg, courseDir, assetBase, requireCourse } = require('./paths');

// ─── 参数 ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const WITH_PACKAGE = args.includes('--with-package');
function optionValue(flag) {
    const direct = args.find(value => value.startsWith(`${flag}=`));
    if (direct) return direct.slice(flag.length + 1);
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
}
const audience = optionValue('--audience') || 'student';
if (!['student', 'facilitator'].includes(audience)) {
    console.error('ERROR: --audience must be student or facilitator');
    process.exit(1);
}
const positional = [];
for (let index = 0; index < args.length; index++) {
    if (args[index] === '--audience') { index++; continue; }
    if (args[index].startsWith('--audience=')) continue;
    if (!args[index].startsWith('--')) positional.push(args[index]);
}
const [courseName, outputBase] = positional;
if (!courseName) {
    console.error('Usage: node export.js <course-name> [output-dir] [--with-package] [--audience student|facilitator]');
    process.exit(1);
}

requireCourse(courseName, 'export');

const COURSE_DIR = courseDir(courseName);
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
// deck.html 里指向引擎资产的前缀由 build.js 按 {{ASSET_BASE}} 算出 —— 课程在仓库里
// 时是 "../.."，装成 npm 包后是别的路径。这里算出同一个前缀再抹平：
//   <ASSET_BASE>/lib/           → ./lib/
//   <ASSET_BASE>/shared_styles/ → ./shared_styles/
//   ../assets/                  → ./assets/      (slide 内图片)
// "../.." 那条单独再抹一遍，兜住 V3 时期生成、还没重新 build 过的旧 deck。
const BASE = assetBase(courseName);
const esc  = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let html = fs.readFileSync(DECK_PATH, 'utf8');
for (const prefix of new Set([BASE, '../..'])) {
    html = html
        .replace(new RegExp(`${esc(prefix)}/lib/`, 'g'),           './lib/')
        .replace(new RegExp(`${esc(prefix)}/shared_styles/`, 'g'), './shared_styles/');
}
html = html.replace(/\.\.\/assets\//g, './assets/');

fs.writeFileSync(path.join(EXPORT_DIR, 'index.html'), html, 'utf8');

// ─── 3. 拷贝依赖 (只拷贝演示实际需要的文件) ──────────────────────────────────
let fileCount = 1; // index.html

// Reveal.js 运行时: dist/ + 图标字体 + notes 插件 (演讲者视图)
// lib/ 其余为开发文件 (examples/test/js/css 等), 不进交付包
// 注意 lib/fonts/display 不在这里整目录拷贝 —— 那里放着全部字体族(含两套 ~5MB 的中文),
// 一门课只用得上其中一套, 下面按本课字体集实际引用的文件挑。
for (const sub of ['dist', path.join('fonts', 'fontawesome'), path.join('plugin', 'notes')]) {
    fileCount += copyDir(
        pkg('lib', sub),
        path.join(EXPORT_DIR, 'lib', sub)
    );
}

// Reveal.js 的 MIT 声明。MIT 要求"副本或实质部分"都保留声明,
// 交付包里带着 dist/ 就是一份副本, 所以这一个文件必须跟着走。
fs.copyFileSync(pkg('lib', 'LICENSE'), path.join(EXPORT_DIR, 'lib', 'LICENSE'));
fileCount++;

// 设计系统 CSS: 只拷贝 index.html 实际引用的文件 (template/配色/字体集 各 1 套)
const cssRefs = [...html.matchAll(/\.\/shared_styles\/([\w./-]+\.css)/g)]
    .map(m => m[1]);
for (const rel of new Set(cssRefs)) {
    const src  = pkg('shared_styles', rel);
    const dest = path.join(EXPORT_DIR, 'shared_styles', rel);
    if (!fs.existsSync(src)) {
        console.error(`ERROR: deck 引用的样式不存在: shared_styles/${rel}`);
        process.exit(1);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    fileCount++;

    // 字体集会 @import lib/fonts/display/<slug>.css, 那个 CSS 又引一堆 .woff2 分片。
    // 顺着这条链把用到的字体文件挑出来 —— 中文字体动辄 100 个分片 5MB, 不能整目录搬。
    if (!rel.startsWith('font-sets/')) continue;
    const setCss = fs.readFileSync(src, 'utf8');
    for (const m of setCss.matchAll(/@import url\('\.\.\/\.\.\/lib\/fonts\/display\/([\w.-]+\.css)'\)/g)) {
        const faceRel  = path.join('fonts', 'display', m[1]);
        const faceSrc  = pkg('lib', faceRel);
        const faceDest = path.join(EXPORT_DIR, 'lib', faceRel);
        if (!fs.existsSync(faceSrc)) {
            console.error(`ERROR: 字体集引用的 @font-face 文件不存在: lib/${faceRel}`);
            process.exit(1);
        }
        fs.mkdirSync(path.dirname(faceDest), { recursive: true });
        fs.copyFileSync(faceSrc, faceDest);
        fileCount++;

        // 字体的协议文本跟着字体走: SIL OFL 1.1 要求副本随字体一起分发,
        // 交付包是要发给客户的独立副本, 所以这里不能只留在仓库里。
        // 约定文件名 <slug>.LICENSE.txt, 见 THIRD-PARTY-NOTICES.md。
        const licSrc = faceSrc.replace(/\.css$/, '.LICENSE.txt');
        if (!fs.existsSync(licSrc)) {
            console.error(`ERROR: 字体缺少协议文本: ${path.relative(PKG_ROOT, licSrc)}`);
            console.error('       见 THIRD-PARTY-NOTICES.md「If you add a font」。');
            process.exit(1);
        }
        fs.copyFileSync(licSrc, faceDest.replace(/\.css$/, '.LICENSE.txt'));
        fileCount++;

        const faceCss = fs.readFileSync(faceSrc, 'utf8');
        for (const w of faceCss.matchAll(/url\('\.\/([\w.-]+\.woff2)'\)/g)) {
            fs.copyFileSync(
                path.join(path.dirname(faceSrc),  w[1]),
                path.join(path.dirname(faceDest), w[1])
            );
            fileCount++;
        }
    }
}

// 课程图片素材 (如果有)
const assetsDir = path.join(COURSE_DIR, 'assets');
if (fs.existsSync(assetsDir)) {
    fileCount += copyDir(assetsDir, path.join(EXPORT_DIR, 'assets'));
}

// 交付包 (M/L 档, --with-package)。只带 html/ —— 那是客户交付物;
// md 是我们的源文件, 不进客户手里的包。
let packagedDocs = 0;
if (WITH_PACKAGE) {
    const audiencePackage = path.join(COURSE_DIR, 'package', audience);
    const isComposedPackage = fs.existsSync(audiencePackage);
    const pkgHtml = isComposedPackage ? path.join(audiencePackage, 'html') : path.join(COURSE_DIR, 'package', 'html');
    if (!fs.existsSync(pkgHtml)) {
        console.error(`ERROR: package HTML 不存在。先运行 'nextcourse package ${courseName} --render'`);
        process.exit(1);
    }
    packagedDocs = copyDir(pkgHtml, isComposedPackage ? path.join(EXPORT_DIR, 'package', 'html') : path.join(EXPORT_DIR, 'package'));
    if (isComposedPackage) {
        packagedDocs += copyDir(path.join(audiencePackage, 'materials'), path.join(EXPORT_DIR, 'package', 'materials'));
    }
    fileCount += packagedDocs;
}

// ─── 4. 结果报告 ─────────────────────────────────────────────────────────────
const sizeMB = (dirSize(EXPORT_DIR) / 1024 / 1024).toFixed(1);

console.log(`\nNextCourse Export — ${courseName}`);
console.log(`${'─'.repeat(50)}`);
console.log(`  输出目录 : ${EXPORT_DIR}`);
console.log(`  文件总数 : ${fileCount}`);
console.log(`  打包大小 : ${sizeMB} MB`);
if (WITH_PACKAGE) console.log(`  交付包   : package/ ${packagedDocs} 个文件（${audience}）`);
console.log(`\n  ✓  完成。`);
console.log(`     将整个 "${path.basename(EXPORT_DIR)}" 文件夹`);
console.log(`     拷贝到 U 盘 / 云盘 / 任意电脑`);
console.log(`     双击 index.html 即可演示（无需联网）`);
if (WITH_PACKAGE) {
    const composedEntry = fs.existsSync(path.join(EXPORT_DIR, 'package', 'html', '0_index.html'));
    console.log(`     交付文档在 ${composedEntry ? 'package/html/0_index.html' : 'package/0_index.html'}\n`);
} else console.log('');

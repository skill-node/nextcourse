#!/usr/bin/env node
/**
 * pdf.js — 把 deck.html 导成一页一张幻灯片的 PDF（配色 / 字体 / 版式原样保留）
 *
 * 用本机已装的 Chrome（headless）打印，零 npm 依赖，与 shot.js 同一条路子。
 *
 * ── 为什么不能让用户自己在浏览器里 Cmd+P ──────────────────────────────────
 * reveal.css 自带一套「印在 A4 纸上」的打印样式（`@media print` + `html:not(.print-pdf)`）：
 * 背景刷白、正文 20pt 纯黑、装饰全隐藏。它是给"把讲义印成纸"设计的，
 * 一按打印，整套配色当场作废——用户看到的"打印出来不正常"就是这个。
 *
 * ── 那为什么不用 reveal 官方的 ?print-pdf ─────────────────────────────────
 * 它会把每个 section 搬进一层 .pdf-page 容器，于是设计系统里所有
 * `.slides > section …` 选择器集体失配：画布、组件间距、模块封面底色全没了。
 * 所以这里走另一条路：DOM 保持原样，只做两件事——
 *   1. 给 <html> 加 class="print-pdf"，让 reveal 那套 A4 样式自己失效
 *      （shared_styles/base_layout.css「导出 PDF」一节接手，把演示器摊平成长卷）；
 *   2. 注入一条 @page 定死纸张尺寸，让一个 section 正好占一页。
 * 两条都只改一份临时拷贝，deck.html 一个字节不动。
 *
 * 顺带的好处：没有 reveal 的异步重排，打印时机不再是薛定谔的——
 * 之前走 ?print-pdf 每三四次就有一次在重排完成前抢先印出一张 Letter 长条。
 *
 * Usage:
 *   node pdf.js <course-name>                  # → courses/<name>/deck.pdf
 *   node pdf.js <course-name> ~/Desktop/x.pdf  # 指定输出文件
 *   node pdf.js <course-name> --size 1920x1080 # 换纸张尺寸（默认 1600x900，16:9）
 *   node pdf.js <course-name> --keep           # 保留临时拷贝，用浏览器打开即可预览导出效果
 *
 * 自定义浏览器路径: 环境变量 CHROME_PATH
 */

'use strict';

const { spawn } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const { courseDir, requireCourse, findChrome } = require('./paths');

// ─── 参数 ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const KEEP = args.includes('--keep');

let SLIDE_W = 1600, SLIDE_H = 900;
const sizeIdx = args.findIndex(a => a === '--size' || a.startsWith('--size='));
if (sizeIdx !== -1) {
    const raw = args[sizeIdx].includes('=')
        ? args[sizeIdx].split('=')[1]
        : args[sizeIdx + 1];
    const m = /^(\d{3,5})x(\d{3,5})$/i.exec(raw || '');
    if (!m) {
        console.error('ERROR: --size 的格式是 宽x高，例如 --size 1920x1080');
        process.exit(1);
    }
    SLIDE_W = Number(m[1]);
    SLIDE_H = Number(m[2]);
    args.splice(sizeIdx, args[sizeIdx].includes('=') ? 1 : 2);
}

const [courseName, outputArg] = args.filter(a => !a.startsWith('--'));
if (!courseName) {
    console.error('Usage: node pdf.js <course-name> [output.pdf] [--size WxH] [--keep]');
    process.exit(1);
}

requireCourse(courseName, 'pdf');

const COURSE_DIR = courseDir(courseName);
const DECK_PATH  = path.join(COURSE_DIR, 'deck.html');
if (!fs.existsSync(DECK_PATH)) {
    console.error(`ERROR: deck.html not found at ${DECK_PATH}`);
    console.error(`       先跑 'nextcourse render ${courseName}'`);
    process.exit(1);
}

const OUT_PATH = outputArg
    ? path.resolve(outputArg)
    : path.join(COURSE_DIR, 'deck.pdf');
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

const CHROME = findChrome();
if (!CHROME) {
    console.error('ERROR: 未找到 Chrome/Chromium。请安装 Chrome 或设置 CHROME_PATH 环境变量。');
    process.exit(1);
}

const slideCount = fs.readdirSync(path.join(COURSE_DIR, 'slides'))
    .filter(f => f.endsWith('.html')).length;

console.log(`\nNextCourse PDF — ${courseName} (${slideCount} slides, ${SLIDE_W}×${SLIDE_H})`);
console.log('─'.repeat(50));

// ─── 1. 造打印用的临时拷贝 ───────────────────────────────────────────────────
// 必须放在课程目录里：deck.html 用 ../../lib、../../shared_styles 这样的相对路径
// 指回引擎资产，挪到别处样式就全丢了。
const SRC_PATH = path.join(COURSE_DIR, '.deck.print.html');

let html = fs.readFileSync(DECK_PATH, 'utf8');
const htmlTag = /<html\b[^>]*>/i.exec(html);
if (!htmlTag) {
    console.error('ERROR: deck.html 里找不到 <html> 标签，文件可能不完整');
    process.exit(1);
}
const withClass = /\bclass\s*=\s*(["'])(.*?)\1/i.test(htmlTag[0])
    ? htmlTag[0].replace(/\bclass\s*=\s*(["'])(.*?)\1/i, (_, q, v) => `class=${q}${v} print-pdf${q}`)
    : htmlTag[0].replace(/>$/, ' class="print-pdf">');
html = html.replace(htmlTag[0], withClass);

// @page 只能是字面值，不能吃 CSS 变量，所以尺寸在这里注入而不是写在样式表里。
// 放 </head> 前，保证排在所有样式表之后。
const pageCss = `<style>
    /* nextcourse pdf 注入：@page 只吃字面值，不吃 CSS 变量，所以尺寸在这里落地；
       同一组尺寸再以变量形式给 base_layout.css 的「导出 PDF」一节用 */
    @page { size: ${SLIDE_W}px ${SLIDE_H}px; margin: 0; }
    :root { --pdf-page-w: ${SLIDE_W}px; --pdf-page-h: ${SLIDE_H}px; }
</style>
`;
html = html.replace(/<\/head>/i, `${pageCss}</head>`);

fs.writeFileSync(SRC_PATH, html, 'utf8');

// ─── 2. 打印 ─────────────────────────────────────────────────────────────────
// headless Chrome 把 PDF 写完之后不会自己退出（写完约十几秒，之后还要挂三分钟才收摊），
// 所以不等它：盯着输出文件，写完整了就把它收掉。
// "写完整"的判据是文件尾部出现 %%EOF 且大小连着几轮不再变——PDF 的结尾标记，
// 只看文件存在会拿到一个写到一半的半成品。
const POLL_MS     = 400;
const STABLE_ROUNDS = 3;
const HARD_LIMIT_MS = 300000;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-pdf-'));
if (fs.existsSync(OUT_PATH)) fs.rmSync(OUT_PATH);

// 每次给一个干净的临时 profile：共用默认 profile 时两次 Chrome 会互相抢锁，
// 抢输的那次会安静地退化成"没跑 JS 就打印"。
const child = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--user-data-dir=${profile}`,
    `--window-size=${SLIDE_W},${SLIDE_H}`,
    '--virtual-time-budget=15000',
    '--no-pdf-header-footer',
    `--print-to-pdf=${OUT_PATH}`,
    `file://${SRC_PATH.split(path.sep).join('/')}`,
], { stdio: ['ignore', 'ignore', 'pipe'] });

let stderr = '';
child.stderr.on('data', d => { stderr += d; });

function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function looksComplete() {
    if (!fs.existsSync(OUT_PATH)) return 0;
    const size = fs.statSync(OUT_PATH).size;
    if (size < 1024) return 0;
    const fd = fs.openSync(OUT_PATH, 'r');
    const tail = Buffer.alloc(64);
    fs.readSync(fd, tail, 0, 64, Math.max(0, size - 64));
    fs.closeSync(fd);
    return tail.includes('%%EOF') ? size : 0;
}

const started = Date.now();
let lastSize = -1, stable = 0, done = false;
while (Date.now() - started < HARD_LIMIT_MS) {
    sleepSync(POLL_MS);
    const size = looksComplete();
    if (size && size === lastSize) {
        if (++stable >= STABLE_ROUNDS) { done = true; break; }
    } else {
        stable = 0;
    }
    lastSize = size;
    if (child.exitCode !== null && !size) break;   // Chrome 自己退了又没产出 = 失败
}

child.kill('SIGKILL');
fs.rmSync(profile, { recursive: true, force: true });
if (KEEP) {
    console.log(`  ·  预览用拷贝保留在 ${SRC_PATH}（浏览器直接打开即可）`);
} else {
    fs.rmSync(SRC_PATH, { force: true });
}

if (!done) {
    console.error('\nERROR: Chrome 没有写出完整的 PDF。');
    console.error(stderr.split('\n').filter(l => /ERROR|FATAL/.test(l)).slice(-5).join('\n'));
    process.exit(1);
}

// ─── 3. 自检 ─────────────────────────────────────────────────────────────────
// 纸张尺寸是"样式有没有生效"的凭据：@page 没吃上的话印出来是打印机默认的 Letter。
// 页数对不上则多半是某页内容超出画布被浏览器拆成了两页。
const raw    = fs.readFileSync(OUT_PATH).toString('latin1');
const box    = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(raw);
const pages  = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
const sizeMB = (fs.statSync(OUT_PATH).size / 1024 / 1024).toFixed(1);
const wpt    = box ? Math.round(Number(box[1])) : 0;

console.log(`  ✓  ${OUT_PATH}`);
console.log(`     ${pages} 页 · ${sizeMB} MB`);

let bad = false;
if (wpt !== Math.round(SLIDE_W * 0.75)) {
    console.log(`  !  纸张尺寸不对（${box ? box[1] + '×' + box[2] : '未知'} pt，期望 ${SLIDE_W * 0.75}×${SLIDE_H * 0.75}）`);
    console.log(`     @page 没生效，多半是 deck.html 过旧或样式表缺失，重跑 'nextcourse render ${courseName}'`);
    bad = true;
}
if (pages !== slideCount) {
    console.log(`  !  页数与幻灯片数不一致（PDF ${pages} 页 / slides ${slideCount} 张）`);
    console.log(`     多出来的页是某一页内容超出画布被拆开了，跑 'nextcourse shot ${courseName} --check' 看是哪一页`);
    bad = true;
}
console.log('');
process.exit(bad ? 1 : 0);

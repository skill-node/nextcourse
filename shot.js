#!/usr/bin/env node
/**
 * shot.js — NextCourse 视觉自校验（截图 + 溢出检测）
 *
 * 用系统已安装的 Chrome/Chromium (headless) 完成两件事，零 npm 依赖：
 *   1. 溢出检测 : 加载 deck.html?check=overflow，读取模板内置自检脚本的报告
 *   2. 逐页截图 : 输出 courses/<name>/.review/slide-NN.png，供 agent/人工审阅
 *
 * Usage:
 *   node shot.js <course-name>            # 溢出检测 + 全部页截图
 *   node shot.js <course-name> --check    # 只做溢出检测（快）
 *
 * 自定义浏览器路径: 环境变量 CHROME_PATH
 */

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;

// ─── 参数 ────────────────────────────────────────────────────────────────────
const [,, courseName, flag] = process.argv;
if (!courseName) {
    console.error('Usage: node shot.js <course-name> [--check]');
    process.exit(1);
}
const checkOnly = flag === '--check';

const COURSE_DIR = path.join(ROOT, 'courses', courseName);
const DECK_PATH  = path.join(COURSE_DIR, 'deck.html');
if (!fs.existsSync(DECK_PATH)) {
    console.error(`ERROR: deck.html not found. Run 'node build.js ${courseName}' first.`);
    process.exit(1);
}

// ─── 定位浏览器 ──────────────────────────────────────────────────────────────
function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
    ].filter(Boolean);
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
}

const CHROME = findChrome();
if (!CHROME) {
    console.error('ERROR: 未找到 Chrome/Chromium。请安装 Chrome 或设置 CHROME_PATH 环境变量。');
    process.exit(1);
}

function chrome(args) {
    return spawnSync(CHROME, [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        ...args,
    ], { encoding: 'utf8', timeout: 60000 });
}

const slideCount = fs.readdirSync(path.join(COURSE_DIR, 'slides'))
    .filter(f => f.endsWith('.html')).length;

console.log(`\nNextCourse Shot — ${courseName} (${slideCount} slides)`);
console.log('─'.repeat(50));

// ─── 1. 溢出检测 ─────────────────────────────────────────────────────────────
// 模板内置脚本在 ?check=overflow 时遍历所有页，把结果写进 <pre id="overflow-report">
const checkUrl = `file://${DECK_PATH}?check=overflow`;
const res = chrome(['--window-size=1600,900', '--virtual-time-budget=10000', '--dump-dom', checkUrl]);
// 取最后一次出现的报告节点（脚本源码中可能出现同名字符串）
const dom = res.stdout || '';
const marker = '<pre id="overflow-report">';
const start  = dom.lastIndexOf(marker);
const end    = start >= 0 ? dom.indexOf('</pre>', start) : -1;
const reportMatch = end > start ? [null, dom.slice(start + marker.length, end)] : null;

if (!reportMatch) {
    console.error('  ⚠  溢出检测失败（未取到报告，可能是旧版 deck.html，请重新 build）');
} else {
    const report = reportMatch[1].trim();
    if (report.startsWith('OVERFLOW 0')) {
        console.log('  ✓  溢出检测: 所有页面均在一屏内');
    } else {
        console.log('  ✗  溢出检测: 以下页面内容超出画布');
        for (const line of report.split('\n').slice(1)) {
            console.log(`       ${line}`);
        }
    }
}

// ─── 2. 逐页截图 ─────────────────────────────────────────────────────────────
let exitCode = reportMatch && !reportMatch[1].trim().startsWith('OVERFLOW 0') ? 1 : 0;

if (!checkOnly) {
    const REVIEW_DIR = path.join(COURSE_DIR, '.review');
    fs.rmSync(REVIEW_DIR, { recursive: true, force: true });
    fs.mkdirSync(REVIEW_DIR, { recursive: true });

    process.stdout.write('  截图: ');
    let ok = 0;
    for (let i = 0; i < slideCount; i++) {
        const png = path.join(REVIEW_DIR, `slide-${String(i + 1).padStart(2, '0')}.png`);
        const r = chrome([
            '--window-size=1600,900',
            '--virtual-time-budget=5000',
            `--screenshot=${png}`,
            `file://${DECK_PATH}#/${i}`,
        ]);
        if (r.status === 0 && fs.existsSync(png)) {
            ok++;
            process.stdout.write('▪');
        } else {
            process.stdout.write('✗');
        }
    }
    console.log(`\n  ✓  ${ok}/${slideCount} 张截图已保存到 courses/${courseName}/.review/`);
    console.log('     供 agent 视觉自查或人工快速翻阅');
}

console.log('');
process.exit(exitCode);

'use strict';
/**
 * paths.js — 两个根的唯一定义处
 *
 * NextCourse 从 V4 起可以装成 npm 包、在用户自己的任意目录里用，所以
 * 「引擎在哪」和「课程在哪」不再是同一个地方，必须分开：
 *
 *   PKG_ROOT   引擎自带的资产 —— lib/ shared_styles/ templates/ 内置文档
 *              永远是这个包自己的安装位置，与用户在哪调用无关。
 *
 *   WORK_ROOT  用户的课程 —— courses/<name>/
 *              默认取调用时的 cwd。所以在仓库根目录里跑，WORK_ROOT 就是仓库根，
 *              解析出的 courses/<name>/ 与 V3 的 __dirname/courses/<name>/ 是同一个
 *              路径，老用法零破坏。
 *
 * NEXTCOURSE_HOME 可以把 WORK_ROOT 钉到一个固定工作区，适合"课程集中放一处"的人。
 */

const fs   = require('fs');
const path = require('path');

const PKG_ROOT = __dirname;

const WORK_ROOT = process.env.NEXTCOURSE_HOME
    ? path.resolve(process.env.NEXTCOURSE_HOME)
    : process.cwd();

const COURSES_DIR = path.join(WORK_ROOT, 'courses');

/** 引擎自带资产的绝对路径 */
function pkg(...segments) {
    return path.join(PKG_ROOT, ...segments);
}

/** 某门课的目录 */
function courseDir(name) {
    const contextDir = process.env.NEXTCOURSE_CONTEXT_DIR;
    const contextName = process.env.NEXTCOURSE_CONTEXT_NAME;
    if (contextDir && (!contextName || contextName === name)) return path.resolve(contextDir);
    return path.join(COURSES_DIR, name);
}

/**
 * 从 courses/<name>/deck.html 指回引擎资产的前缀，用于 {{ASSET_BASE}}。
 *
 * 课程在仓库里时算出来正好是 "../.."，与 V3 硬编码的一致，deck.html 逐字节不变。
 *
 * 课程离引擎很远时（用户在 ~/work/foo 里建课、引擎在 npx 缓存里），相对路径会长成
 * "../../../../../../../Users/..." 这种东西——能用，但看着像坏了。超过 4 层就改用绝对
 * 路径：deck.html 是 file:// 页面，href 以 / 开头会解析回文件系统根，结果一样但短得多。
 */
const REL_DEPTH_LIMIT = 4;

function assetBase(name) {
    const rel = path.relative(courseDir(name), PKG_ROOT);
    const tooFar = !rel
        || path.isAbsolute(rel)
        || rel.split(path.sep).filter(s => s === '..').length > REL_DEPTH_LIMIT;
    if (tooFar) return PKG_ROOT.split(path.sep).join('/');
    return rel.split(path.sep).join('/');
}

/**
 * 本机的 Chrome/Chromium 在哪 —— shot（截图）、pdf（导出）、doctor 三处都要问，
 * 所以答案只留这一份。CHROME_PATH 环境变量优先，方便用别的 Chromium 系浏览器。
 */
function findChrome() {
    return [
        process.env.CHROME_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
    ].filter(Boolean).find(p => fs.existsSync(p)) || null;
}

/**
 * 课程必须存在才继续。路径语义变了之后，"找不到课程"是最容易踩的一脚，
 * 所以这里把找过的位置和当前 WORK_ROOT 一起报出来。
 */
function requireCourse(name, script) {
    const dir = courseDir(name);
    if (fs.existsSync(dir)) return dir;
    console.error(`ERROR: 找不到课程 "${name}"`);
    console.error(`       期望位置: ${dir}`);
    console.error(`       当前工作根: ${WORK_ROOT}${process.env.NEXTCOURSE_HOME ? '  (来自 NEXTCOURSE_HOME)' : '  (当前目录)'}`);
    if (fs.existsSync(COURSES_DIR)) {
        const found = fs.readdirSync(COURSES_DIR, { withFileTypes: true })
            .filter(e => e.isDirectory() && !e.name.startsWith('.'))
            .map(e => e.name);
        console.error(found.length
            ? `       这里有: ${found.join(', ')}`
            : `       courses/ 是空的`);
    } else {
        console.error(`       这里还没有 courses/ 目录 —— 先 cd 到你的课程目录，或跑 nextcourse new ${name}`);
    }
    if (script) console.error(`       用法: nextcourse ${script} <course-name>`);
    process.exit(1);
}

module.exports = { PKG_ROOT, WORK_ROOT, COURSES_DIR, pkg, courseDir, assetBase, requireCourse, findChrome };

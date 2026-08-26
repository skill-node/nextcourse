#!/usr/bin/env node
/**
 * nextcourse — NextCourse 统一 CLI
 *
 * 课程落在调用者当前目录的 courses/<name>/（或 NEXTCOURSE_HOME 指定的工作区），
 * 引擎自带的 lib/ shared_styles/ templates/ 永远从包自身读。两个根见 paths.js。
 *
 * 命令:
 *   nextcourse doctor                   自检：Node / 引擎资产 / Chrome / 工作目录
 *   nextcourse docs   [name]            打印内置文档
 *   nextcourse list                     列出所有课程及状态
 *   nextcourse new    <name> [--scale]  初始化新课程目录
 *   nextcourse check  <name>            校验教学设计闭环（成果 × 模块 × 证据）
 *   nextcourse lint   <name>            校验幻灯片样式规范
 *   nextcourse animate <name> [--strip] 批量打入/剥离组件入场动画
 *   nextcourse build  <name>            组装生成 deck.html
 *   nextcourse render <name>            lint + build 一步完成
 *   nextcourse package <name> [--render] 生成交付包 package/（讲师手册 / 学员手册 / 量规…）
 *   nextcourse export <name> [outdir]   打包为可离线演示文件夹
 *   nextcourse themes                   生成配色/字体展板（theme-gallery/）
 *
 * 工作流:
 *   1. nextcourse-design           设计课程大纲（Agent Skill）
 *   2. nextcourse-slides <name>    生成幻灯片（Agent Skill）
 *   3. nextcourse render <name>    校验 + 构建
 *   4. nextcourse export <name>    打包交付
 */

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const { PKG_ROOT, WORK_ROOT, COURSES_DIR, pkg, courseDir } = require('./paths');

const VERSION = require('./package.json').version;
const [,, cmd, ...rest] = process.argv;

// ─── 工具 ────────────────────────────────────────────────────────────────────

// 子进程继承调用者的 cwd —— 它们各自 require('./paths') 时要算出同一个 WORK_ROOT。
// V3 这里写死 { cwd: ROOT }，那是课程被锁在仓库里的根因。
function run(script, args = []) {
    const result = spawnSync(
        process.execPath,
        [pkg(script), ...args],
        { stdio: 'inherit' }
    );
    return result.status ?? 0;
}

function die(msg) {
    console.error(`ERROR: ${msg}`);
    process.exit(1);
}

function requireName(cmd) {
    if (!rest[0]) die(`Usage: nextcourse ${cmd} <course-name>`);
    return rest[0];
}

// ─── 命令 ────────────────────────────────────────────────────────────────────

const commands = {

    list() {
        const coursesDir = COURSES_DIR;
        if (!fs.existsSync(coursesDir)) {
            console.log(`\n  (${WORK_ROOT} 下还没有 courses/)\n`);
            return;
        }
        const entries = fs.readdirSync(coursesDir, { withFileTypes: true })
            .filter(e => e.isDirectory() && !e.name.startsWith('.'));
        if (entries.length === 0) {
            console.log('\n  (暂无课程)\n');
            return;
        }

        console.log(`\nNextCourse — 课程列表  (${coursesDir})`);
        console.log('─'.repeat(60));
        for (const e of entries) {
            const dir = path.join(coursesDir, e.name);
            const hasMeta  = fs.existsSync(path.join(dir, 'course.meta.md'));
            const slidesDir = path.join(dir, 'slides');
            const slideCount = fs.existsSync(slidesDir)
                ? fs.readdirSync(slidesDir).filter(f => f.endsWith('.html')).length
                : 0;
            const hasDeck  = fs.existsSync(path.join(dir, 'deck.html'));
            const hasExport = fs.existsSync(path.join(dir, 'export', 'index.html'));
            const flags = [
                hasMeta     ? '✓ meta'           : '✗ meta',
                slideCount  ? `✓ ${slideCount} slides` : '✗ slides',
                hasDeck     ? '✓ deck'            : '· deck',
                hasExport   ? '✓ export'          : '· export',
            ].join('  ');
            console.log(`  ${e.name.padEnd(24)} ${flags}`);
        }
        console.log('');
    },

    new() {
        const name = requireName('new');
        const dir  = courseDir(name);
        if (fs.existsSync(dir)) die(`课程 "${name}" 已存在: ${dir}`);

        // 档位: 不带 --scale = S 档（轻量分享课），与 V2 行为完全一致
        const scaleArg = rest.slice(1).find(a => a.startsWith('--scale'));
        let scale = 'S';
        if (scaleArg) {
            scale = (scaleArg.includes('=')
                ? scaleArg.split('=')[1]
                : rest[rest.indexOf(scaleArg) + 1] || '').toUpperCase();
            if (!['S', 'M', 'L'].includes(scale)) {
                die('--scale 只能是 S / M / L（S 分享课 · M 内训课 · L 培训项目）');
            }
        }
        const isMPlus = scale === 'M' || scale === 'L';

        fs.mkdirSync(path.join(dir, 'slides'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });

        // S 档 frontmatter 保持 V2 原样；M/L 才追加设计层字段（build.js 一律不依赖）
        const meta = isMPlus ? `---
title: "${name}"
template: standard
theme: bold-signal
scale: ${scale}
duration: "1 天（有效 6.5h）"
class_size: "20–30 人，4–5 人一组"
blueprint: course.blueprint.md
audience: "目标受众"
positioning: "核心价值主张（1句话）"
outcomes:
  - id: LO1
    do: "动词开头的行为"
    bloom: apply
    success: "成功标准"
    module: 1
    evidence: "用什么证据判定达成"
  - id: LO2
    do: "动词开头的行为"
    bloom: analyze
    success: "成功标准"
    module: 2
    evidence: "用什么证据判定达成"
  - id: LO3
    do: "动词开头的行为"
    bloom: create
    success: "成功标准"
    module: 3
    evidence: "用什么证据判定达成"
---

## 课程大纲

<!-- 模块的编号与名称以 course.blueprint.md 第五节为准，这里按同样编号展开到页 -->

### 模块一：（标题）（6 张）
- ...

### 模块二：（标题）（6 张）
- ...

### 模块三：（标题）（6 张）
- ...
` : `---
title: "${name}"
template: standard
theme: bold-signal
audience: "目标受众"
positioning: "核心价值主张（1句话）"
outcomes:
  - { do: "动词开头的行为", bloom: apply, success: "成功标准" }
  - { do: "动词开头的行为", bloom: analyze, success: "成功标准" }
  - { do: "动词开头的行为", bloom: create, success: "成功标准" }
---

## 课程大纲

### 模块一：（标题）
- ...

### 模块二：（标题）
- ...
`;
        fs.writeFileSync(path.join(dir, 'course.meta.md'), meta, 'utf8');

        if (isMPlus) {
            const tmpl = pkg('templates', 'course.blueprint.md');
            if (!fs.existsSync(tmpl)) die(`蓝图模板缺失: ${tmpl}`);
            fs.copyFileSync(tmpl, path.join(dir, 'course.blueprint.md'));
        }

        console.log(`\n  ✓  课程目录已创建: ${dir}  (${scale} 档)`);
        if (isMPlus) {
            console.log(`     course.blueprint.md  设计层真相（模块清单以它为准）`);
            console.log(`     course.meta.md       构建契约（页面级大纲）`);
        } else {
            console.log(`     编辑 course.meta.md 填写大纲`);
        }
        console.log(`     或让 agent 跑 nextcourse-design 技能做对话式设计\n`);
    },

    check() {
        process.exit(run('check.js', [requireName('check')]));
    },

    package() {
        const name = requireName('package');
        process.exit(run('package.js', [name, ...rest.slice(1)]));
    },

    lint() {
        process.exit(run('lint-slides.js', [requireName('lint')]));
    },

    animate() {
        const name = requireName('animate');
        process.exit(run('animate-slides.js', [name, ...rest.slice(1)]));
    },

    build() {
        process.exit(run('build.js', [requireName('build')]));
    },

    render() {
        const name = requireName('render');
        const lintCode = run('lint-slides.js', [name]);
        if (lintCode !== 0) process.exit(lintCode);
        process.exit(run('build.js', [name]));
    },

    export() {
        const name = requireName('export');
        process.exit(run('export.js', [name, ...rest.slice(1)]));
    },

    shot() {
        const name = requireName('shot');
        process.exit(run('shot.js', [name, ...rest.slice(1)]));
    },

    themes() {
        process.exit(run('theme-gallery.js', rest));
    },

    notes() {
        const name      = requireName('notes');
        const slidesDir = path.join(courseDir(name), 'slides');
        if (!fs.existsSync(slidesDir)) die(`slides/ not found: ${slidesDir}`);
        const files = fs.readdirSync(slidesDir).filter(f => f.endsWith('.html')).sort();
        if (files.length === 0) die('slides/ 目录为空');

        let title = name;
        const metaPath = path.join(courseDir(name), 'course.meta.md');
        if (fs.existsSync(metaPath)) {
            const m = fs.readFileSync(metaPath, 'utf8').match(/^title:\s*["']?(.+?)["']?\s*$/m);
            if (m) title = m[1];
        }

        const stripTags = s => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        const out = [
            `# ${title} — 讲师手册`,
            '',
            '> 由 `nextcourse notes` 自动生成，来源为各 slide 的演讲备注（aside.notes）。',
            '> 修改备注请编辑 slides/slide-XX.html 后重新生成，不要直接改本文件。',
            '',
        ];
        let noteCount = 0;
        files.forEach((f, i) => {
            const src  = fs.readFileSync(path.join(slidesDir, f), 'utf8');
            const h2   = src.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
            const note = src.match(/<aside\b[^>]*class\s*=\s*["'][^"']*\bnotes\b[^"']*["'][^>]*>([\s\S]*?)<\/aside>/i);
            if (note) noteCount++;
            out.push(`## ${String(i + 1).padStart(2, '0')}. ${h2 ? stripTags(h2[1]) : '(无标题页)'}`);
            out.push('');
            out.push(note ? stripTags(note[1]) : '_（本页无备注）_');
            out.push('');
        });

        const outPath = path.join(courseDir(name), 'handout.md');
        fs.writeFileSync(outPath, out.join('\n'), 'utf8');
        console.log(`\n  ✓  讲师手册已生成: ${outPath}`);
        console.log(`     共 ${files.length} 页, 其中 ${noteCount} 页有演讲备注`);
        if (fs.existsSync(path.join(courseDir(name), 'course.blueprint.md'))) {
            console.log(`     （M/L 档: nextcourse package ${name} 出的讲师手册按模块组织, 还带活动指令与评分点）`);
        }
        console.log('');
    },

    // 技能的第一步统一调它: 确认引擎在、Node 版本够、Chrome 有没有,
    // 并把当前的 WORK_ROOT 报出来 —— 路径语义是新用户最容易懵的地方。
    doctor() {
        const nodeMajor = Number(process.versions.node.split('.')[0]);
        const chrome = [
            process.env.CHROME_PATH,
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium',
        ].filter(Boolean).find(p => fs.existsSync(p));

        const ok = s => `  ✓  ${s}`;
        const no = s => `  ✗  ${s}`;
        const meh = s => `  ·  ${s}`;

        console.log(`\nNextCourse doctor — v${VERSION}`);
        console.log('─'.repeat(60));
        console.log(nodeMajor >= 20
            ? ok(`Node ${process.versions.node}`)
            : no(`Node ${process.versions.node} —— 需要 20 或更高`));
        console.log(ok(`引擎位置   ${PKG_ROOT}`));
        console.log(ok(`工作目录   ${WORK_ROOT}${process.env.NEXTCOURSE_HOME ? '  (NEXTCOURSE_HOME)' : '  (当前目录)'}`));
        console.log(fs.existsSync(COURSES_DIR)
            ? ok(`课程目录   ${COURSES_DIR}`)
            : meh(`课程目录   还没有 —— nextcourse new <name> 会建`));
        console.log(chrome
            ? ok(`Chrome     ${chrome}`)
            : meh('Chrome     未找到 —— shot（截图/溢出检测）不可用，其余命令不受影响'));

        // 资产完整性: npm 打包漏文件的话，这里会先炸而不是等到 build 出一个没样式的 deck
        const missing = ['lib/dist/reveal.js', 'shared_styles/tokens.css', 'templates/master_template.html']
            .filter(rel => !fs.existsSync(pkg(rel)));
        console.log(missing.length
            ? no(`引擎资产缺失: ${missing.join(', ')}`)
            : ok('引擎资产   完整'));
        console.log('');
        process.exit(nodeMajor >= 20 && missing.length === 0 ? 0 : 1);
    },

    // 把内置文档打到 stdout。技能靠这个读设计系统, 不必把几万字复制进提示词。
    docs() {
        const REGISTRY = {
            'design-system': ['DESIGN-SYSTEM.md', '24 个组件的完整参考 —— 写幻灯片前必读'],
            'agent':         ['AGENT.md',         '目录结构 / 工作流 / 硬规则总览'],
            'cli':           ['CLI_MANUAL.md',    '全部命令的详细说明'],
            'domains':       ['docs/domains.md',  '题材域适配表：不同主题该用什么活动与组件'],
        };
        const key = rest[0];
        if (!key || !REGISTRY[key]) {
            console.log('\n内置文档:\n');
            for (const [k, [, desc]] of Object.entries(REGISTRY)) {
                console.log(`  nextcourse docs ${k.padEnd(15)} ${desc}`);
            }
            console.log('');
            process.exit(key ? 1 : 0);
        }
        const file = pkg(REGISTRY[key][0]);
        if (!fs.existsSync(file)) die(`文档缺失: ${REGISTRY[key][0]}（引擎安装不完整，跑 nextcourse doctor）`);
        process.stdout.write(fs.readFileSync(file, 'utf8'));
    },

    version() {
        console.log(VERSION);
    },

    help() {
        console.log(`
NextCourse V${VERSION.split('.')[0]} — 课程开发工具

命令:
  nextcourse doctor                   自检：Node / 引擎资产 / Chrome / 工作目录
  nextcourse docs   [name]            打印内置文档（design-system / agent / cli / domains）
  nextcourse list                     列出所有课程及状态
  nextcourse new    <name> [--scale M|L]
                                      初始化新课程目录（不带 --scale = S 档轻量分享课）
  nextcourse check  <name>            校验教学设计闭环：成果 × 模块 × 证据 + 时长 + 页数
  nextcourse lint   <name>            校验幻灯片样式规范
  nextcourse animate <name> [--strip] 批量打入/剥离组件入场动画（不碰手写 fragment）
  nextcourse build  <name>            组装生成 deck.html
  nextcourse render <name>            lint + build 一步完成（推荐）
  nextcourse package <name> [--render] [--force]
                                      生成交付包 package/*.md（--render 另出客户看的 HTML）
  nextcourse export <name> [outdir] [--with-package]
                                      打包为可离线演示文件夹
  nextcourse notes  <name>            导出讲师手册 handout.md（各页演讲备注）
  nextcourse shot   <name> [--check]  溢出检测 + 逐页截图到 .review/（需本机 Chrome）
  nextcourse themes                   生成配色/字体展板 theme-gallery/index.html

工作流（从零开始）:
  nextcourse-design             ← 技能: 对话式设计大纲（S 档止于此）
  nextcourse-delivery <name>    ← 技能: M/L 档补评估方案与开发计划
  nextcourse check <name>       ← M/L 档: 校验教学设计闭环
  nextcourse-slides <name>      ← 技能: 生成幻灯片
  nextcourse render <name>      ← 校验 + 构建 deck.html
  nextcourse package <name> --render   ← M/L 档: 交出讲师手册/学员手册/量规
  nextcourse export <name> --with-package  ← 打包，拷贝到任意电脑演示

档位（--scale，只影响设计层，不影响构建）:
  S 分享课   30–90 min，只有 course.meta.md + deck（默认）
  M 内训课   半天~1 天，追加 course.blueprint.md 设计蓝图
  L 培训项目 训练营 / 体系化项目，蓝图追加运营与路线图章节

课程放在哪:
  默认是你当前所在目录下的 courses/<name>/，所以先 cd 到你想放课程的地方。
  想固定到一处就设 NEXTCOURSE_HOME=/path/to/workspace。
  当前工作目录: ${WORK_ROOT}

文档: nextcourse docs agent（完整说明）
`);
    },
};

// ─── 入口 ────────────────────────────────────────────────────────────────────

if (!cmd || cmd === '--help' || cmd === '-h') {
    commands.help();
    process.exit(0);
}

if (cmd === '--version' || cmd === '-v') {
    commands.version();
    process.exit(0);
}

if (!commands[cmd]) {
    console.error(`未知命令: ${cmd}`);
    console.error(`运行 nextcourse --help 查看可用命令`);
    process.exit(1);
}

commands[cmd]();

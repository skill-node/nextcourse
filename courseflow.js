#!/usr/bin/env node
/**
 * courseflow — CourseFlow V2 统一 CLI
 *
 * 命令:
 *   courseflow list                     列出所有课程及状态
 *   courseflow new    <name>            初始化新课程目录
 *   courseflow lint   <name>            校验幻灯片样式规范
 *   courseflow build  <name>            组装生成 deck.html
 *   courseflow render <name>            lint + build 一步完成
 *   courseflow export <name> [outdir]   打包为可离线演示文件夹
 *
 * 工作流:
 *   1. /course-design              设计课程大纲（Claude Code Skill）
 *   2. /slide-design <name>        生成幻灯片（Claude Code Skill）
 *   3. courseflow render <name>    校验 + 构建
 *   4. courseflow export <name>    打包交付
 */

'use strict';

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const [,, cmd, ...rest] = process.argv;

// ─── 工具 ────────────────────────────────────────────────────────────────────

function run(script, args = []) {
    const result = spawnSync(
        process.execPath,
        [path.join(ROOT, script), ...args],
        { cwd: ROOT, stdio: 'inherit' }
    );
    return result.status ?? 0;
}

function die(msg) {
    console.error(`ERROR: ${msg}`);
    process.exit(1);
}

function requireName(cmd) {
    if (!rest[0]) die(`Usage: courseflow ${cmd} <course-name>`);
    return rest[0];
}

// ─── 命令 ────────────────────────────────────────────────────────────────────

const commands = {

    list() {
        const coursesDir = path.join(ROOT, 'courses');
        if (!fs.existsSync(coursesDir)) {
            console.log('\n  (暂无课程)\n');
            return;
        }
        const entries = fs.readdirSync(coursesDir, { withFileTypes: true })
            .filter(e => e.isDirectory());
        if (entries.length === 0) {
            console.log('\n  (暂无课程)\n');
            return;
        }

        console.log('\nCourseFlow — 课程列表');
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
        const dir  = path.join(ROOT, 'courses', name);
        if (fs.existsSync(dir)) die(`课程 "${name}" 已存在: ${dir}`);

        fs.mkdirSync(path.join(dir, 'slides'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });

        const meta = `---
title: "${name}"
template: standard
theme: bold-signal
audience: "目标受众"
positioning: "核心价值主张（1句话）"
outcomes:
  - bloom: apply
    text: "学员能够…"
  - bloom: analyze
    text: "学员能够…"
  - bloom: create
    text: "学员能够…"
---

## 课程大纲

### 模块一：（标题）
- ...

### 模块二：（标题）
- ...
`;
        fs.writeFileSync(path.join(dir, 'course.meta.md'), meta, 'utf8');

        console.log(`\n  ✓  课程目录已创建: courses/${name}/`);
        console.log(`     编辑 course.meta.md 填写大纲`);
        console.log(`     或在 Claude Code 中运行 /course-design 进行对话式设计\n`);
    },

    lint() {
        process.exit(run('lint-slides.js', [requireName('lint')]));
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

    help() {
        console.log(`
CourseFlow V2 — 课程开发工具

命令:
  courseflow list                     列出所有课程及状态
  courseflow new    <name>            初始化新课程目录（含 course.meta.md 模板）
  courseflow lint   <name>            校验幻灯片样式规范
  courseflow build  <name>            组装生成 deck.html
  courseflow render <name>            lint + build 一步完成（推荐）
  courseflow export <name> [outdir]   打包为可离线演示文件夹

工作流（从零开始）:
  /course-design                ← Claude Code: 对话式设计大纲
  /slide-design <name>          ← Claude Code: 生成幻灯片
  courseflow render <name>      ← 校验 + 构建 deck.html
  courseflow export <name>      ← 打包，拷贝到任意电脑演示

文档: AGENT.md（完整说明）
`);
    },
};

// ─── 入口 ────────────────────────────────────────────────────────────────────

if (!cmd || cmd === '--help' || cmd === '-h') {
    commands.help();
    process.exit(0);
}

if (!commands[cmd]) {
    console.error(`未知命令: ${cmd}`);
    console.error(`运行 courseflow --help 查看可用命令`);
    process.exit(1);
}

commands[cmd]();

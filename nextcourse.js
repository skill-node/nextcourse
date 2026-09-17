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
 *   nextcourse compose <name> [--recipe] 预览候选或从已接受 lock 生成视图
 *   nextcourse validate <name>          纯校验组合课（不写报告或生成物）
 *   nextcourse trace <name> <id>        查看实例、实体或当前页的来源链
 *   nextcourse impact <source-id>       查看直接／传递使用者
 *   nextcourse sync <name>              预览或接受上游更新计划
 *   nextcourse check  <name>            校验教学设计闭环（成果 × 模块 × 证据）
 *   nextcourse lint   <name>            校验幻灯片样式规范
 *   nextcourse animate <name> [--strip] 批量打入/剥离组件入场动画
 *   nextcourse build  <name>            组装生成 deck.html
 *   nextcourse render <name>            lint + build 一步完成
 *   nextcourse package <name> [--render] 生成独立或组合课程交付包
 *   nextcourse pdf    <name> [out.pdf]  导出 PDF（保留配色版式；--theme print-light 出学员打印版）
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
const crypto = require('crypto');
const fs   = require('fs');
const path = require('path');

const { PKG_ROOT, WORK_ROOT, COURSES_DIR, pkg, courseDir, findChrome } = require('./paths');
const {
    planRecipeLock,
    materializeRecipe,
    validateRecipe,
    validateWorkspace,
    traceSource,
    impactSource,
    planCourseUpdate,
    applyCourseUpdate,
    packageComposedCourse,
} = require('./composition');

const VERSION = require('./package.json').version;
const [,, cmd, ...rest] = process.argv;

// ─── 工具 ────────────────────────────────────────────────────────────────────

// 子进程继承调用者的 cwd —— 它们各自 require('./paths') 时要算出同一个 WORK_ROOT。
// V3 这里写死 { cwd: ROOT }，那是课程被锁在仓库里的根因。
function run(script, args = [], extraEnv = {}) {
    const result = spawnSync(
        process.execPath,
        [pkg(script), ...args],
        { stdio: 'inherit', env: { ...process.env, ...extraEnv } }
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

function optionValue(flag) {
    const direct = rest.find(value => value.startsWith(`${flag}=`));
    if (direct) return direct.slice(flag.length + 1);
    const index = rest.indexOf(flag);
    return index >= 0 ? rest[index + 1] : null;
}

function withoutOption(args, flag) {
    const output = [];
    for (let index = 0; index < args.length; index++) {
        if (args[index] === flag) { index++; continue; }
        if (args[index].startsWith(`${flag}=`)) continue;
        output.push(args[index]);
    }
    return output;
}

function printDiagnostics(diagnostics) {
    for (const item of diagnostics || []) {
        const mark = item.severity === 'warning' ? 'WARN' : 'ERROR';
        console.error(`  ${mark} ${item.code}${item.path ? ` ${item.path}` : ''}: ${item.message}`);
    }
}

function printJson(value) {
    process.stdout.write(`${JSON.stringify(value, (key, item) => key === 'applyPlan' ? undefined : item, 2)}\n`);
}

function resolvedContext(name, recipeId) {
    const sourceDir = path.join(COURSES_DIR, name);
    if (!fs.existsSync(path.join(sourceDir, 'course.compose.json'))) return { composed: false, dir: sourceDir, env: {} };
    const result = materializeRecipe(WORK_ROOT, name, recipeId);
    if (!result.materialized) {
        printDiagnostics(result.diagnostics);
        die(`组合视图不可用；先运行 nextcourse compose ${name}${recipeId ? ` --recipe ${recipeId}` : ''}`);
    }
    return {
        composed: true,
        dir: result.outputDir,
        recipeId: recipeId || JSON.parse(fs.readFileSync(path.join(result.outputDir, 'build.manifest.json'), 'utf8')).recipeId,
        env: {
            NEXTCOURSE_CONTEXT_DIR: result.outputDir,
            NEXTCOURSE_CONTEXT_NAME: name,
        },
    };
}

// ─── 命令 ────────────────────────────────────────────────────────────────────

const commands = {

    compose() {
        const name = requireName('compose');
        const recipeId = optionValue('--recipe');
        const currentLockPath = path.join(COURSES_DIR, name, 'course.lock.json');
        if (!rest.includes('--dry-run') && fs.existsSync(currentLockPath)) {
            let currentLock = null;
            try { currentLock = JSON.parse(fs.readFileSync(currentLockPath, 'utf8')); } catch { /* normal plan reports it below */ }
            const composePath = path.join(COURSES_DIR, name, 'course.compose.json');
            const composeHash = fs.existsSync(composePath)
                ? `sha256:${crypto.createHash('sha256').update(fs.readFileSync(composePath)).digest('hex')}`
                : null;
            if (currentLock && currentLock.composeHash === composeHash && (!recipeId || currentLock.recipeId === recipeId)) {
                const materialized = materializeRecipe(WORK_ROOT, name, recipeId);
                printDiagnostics(materialized.diagnostics);
                if (!materialized.materialized) process.exit(1);
                console.log(`\nNextCourse compose — ${name}/${currentLock.recipeId}`);
                console.log('─'.repeat(60));
                console.log(`  使用现有 lock；未检查或接受上游更新`);
                console.log(`  ✓ view     ${materialized.outputDir} (${materialized.pageCount} slides)\n`);
                return;
            }
        }
        const plan = planRecipeLock(WORK_ROOT, name, recipeId);
        printDiagnostics(plan.diagnostics);
        if (!plan.valid) process.exit(1);
        console.log(`\nNextCourse compose — ${name}/${plan.recipeId}`);
        console.log('─'.repeat(60));
        for (const reference of plan.lock.references) {
            console.log(`  ${reference.occurrenceId} → ${reference.ref}@${reference.version}`);
            console.log(`    ${reference.exportPath.join(' → ')}`);
        }
        console.log(`  plan ${plan.planId}`);
        if (rest.includes('--dry-run')) {
            console.log('  dry-run：未写入 lock、快照或构建视图\n');
            return;
        }
        console.error(`\nERROR: 尚无与当前配方匹配的已接受 lock。先运行 nextcourse sync ${name} --dry-run，`);
        console.error(`       审阅后用 nextcourse sync ${name} --apply <plan-id> 接受，再重新 compose。`);
        process.exit(1);
    },

    validate() {
        const name = requireName('validate');
        const result = validateRecipe(WORK_ROOT, name, optionValue('--recipe'));
        if (rest.includes('--json')) printJson(result);
        else {
            console.log(`\nNextCourse validate — ${name}/${result.recipeId || '-'}`);
            console.log('─'.repeat(60));
            printDiagnostics(result.diagnostics);
            console.log(`  ${result.valid ? '✓' : '✗'} ${result.valid ? '校验通过' : '校验失败'}（纯读取，未写文件）`);
            if (result.estimatedMinutes !== undefined) console.log(`  预计时长   ${result.estimatedMinutes} min`);
            if (result.generated && result.generated.present) console.log(`  构建视图   ${result.generated.clean ? 'clean' : 'drift'}`);
            console.log('');
        }
        if (!result.valid) process.exit(1);
    },

    trace() {
        const name = requireName('trace');
        const query = rest[1];
        if (!query) die('Usage: nextcourse trace <course-name> <entity-or-instance-id> [--recipe <id>]');
        const result = traceSource(WORK_ROOT, name, query, optionValue('--recipe'));
        if (rest.includes('--json')) printJson(result);
        else {
            console.log(`\nNextCourse trace — ${name}/${result.recipeId || '-'} · ${query}`);
            console.log('─'.repeat(60));
            printDiagnostics(result.diagnostics);
            for (const match of result.matches) {
                console.log(`  ${match.occurrenceId}  ${match.contentMode || '-'} / ${match.updatePolicy || '-'}`);
                if (match.exportPath.length) console.log(`    ${match.exportPath.join(' → ')} @ ${match.version}`);
                else console.log(`    local → ${match.pages.map(page => page.sourcePath).join(', ')}`);
                for (const page of match.pages) console.log(`    page ${page.index}: ${page.entityId} → ${page.output}`);
                if (match.variant) console.log(`    variant ${match.variant.path} (baseline ${match.variant.baselineHash})`);
            }
            if (!result.found) console.log('  未找到匹配的来源记录');
            console.log('');
        }
        if (!result.found || result.diagnostics.some(item => item.severity === 'error')) process.exit(1);
    },

    impact() {
        const sourceId = requireName('impact');
        const result = impactSource(WORK_ROOT, sourceId);
        if (rest.includes('--json')) printJson(result);
        else {
            console.log(`\nNextCourse impact — ${sourceId}`);
            console.log('─'.repeat(60));
            printDiagnostics(result.diagnostics);
            for (const item of result.impacts) {
                console.log(`  ${item.relation.padEnd(10)} ${item.courseName}/${item.recipeId} · ${item.occurrenceId}`);
                console.log(`    ${item.requestedRef} → ${item.resolvedRef}@${item.version} · ${item.frozen ? 'frozen' : 'manual'} · ${item.locked ? 'locked' : 'unlocked'}`);
            }
            console.log(`  ${result.direct} direct · ${result.transitive} transitive\n`);
        }
        if (!result.valid) process.exit(1);
    },

    sync() {
        const name = requireName('sync');
        const recipeId = optionValue('--recipe');
        const requestedPlanId = optionValue('--apply');
        const plan = planCourseUpdate(WORK_ROOT, name, recipeId);
        if (requestedPlanId) {
            const result = applyCourseUpdate(plan, requestedPlanId);
            if (rest.includes('--json')) printJson({ ...result, planId: plan.planId, conflicts: plan.conflicts });
            else {
                printDiagnostics(result.diagnostics);
                if (result.applied) console.log(`\n  ✓ update applied  ${name}/${plan.recipeId} · ${plan.planId}\n`);
            }
            if (!result.applied) process.exit(1);
            return;
        }
        if (rest.includes('--json')) printJson(plan);
        else {
            console.log(`\nNextCourse sync — ${name}/${plan.recipeId || '-'}`);
            console.log('─'.repeat(60));
            printDiagnostics(plan.diagnostics);
            for (const change of plan.changes) {
                console.log(`  ${change.status.padEnd(16)} ${change.occurrenceId} · ${change.requestedRef}`);
                if (change.diff.from || change.diff.to) {
                    console.log(`    ${change.diff.from ? `${change.diff.from.version} ${change.diff.from.contentHash}` : '(new)'}`);
                    console.log(`    → ${change.diff.to ? `${change.diff.to.version} ${change.diff.to.contentHash}` : '(removed)'}`);
                }
                if (change.conflict) console.log(`    CONFLICT ${change.conflict}`);
                if (change.diff.files.length) console.log(`    ${change.diff.files.map(file => `${file.status}:${file.path}`).join(', ')}`);
            }
            console.log(`  plan ${plan.planId || '-'}`);
            console.log(`  ${plan.applicable ? `接受：nextcourse sync ${name} --apply ${plan.planId}` : '计划不可应用；先处理上方错误或冲突'}`);
            console.log('  preview：未写入源、lock、快照、构建视图或对齐矩阵\n');
        }
        if (!plan.valid) process.exit(1);
    },

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
        if (rest.includes('--workspace')) {
            const result = validateWorkspace(WORK_ROOT);
            if (rest.includes('--json')) printJson(result);
            else {
                console.log(`\nNextCourse check --workspace — ${WORK_ROOT}`);
                console.log('─'.repeat(60));
                printDiagnostics(result.diagnostics);
                for (const course of result.courses) console.log(`  ${course.valid ? '✓' : '✗'} ${course.courseName} (${course.kind})`);
                console.log('  纯读取；未写对齐矩阵或构建产物\n');
            }
            if (!result.valid) process.exit(1);
            return;
        }
        const name = requireName('check');
        const context = resolvedContext(name, optionValue('--recipe'));
        process.exit(run('check.js', [name], context.env));
    },

    package() {
        const name = requireName('package');
        if (fs.existsSync(path.join(COURSES_DIR, name, 'course.compose.json'))) {
            const recipeId = optionValue('--recipe');
            resolvedContext(name, recipeId);
            const result = packageComposedCourse(WORK_ROOT, PKG_ROOT, name, recipeId, { render: rest.includes('--render') });
            printDiagnostics(result.diagnostics);
            if (!result.packaged) process.exit(1);
            console.log(`\nNextCourse Package — ${name}/${result.plan.recipeId}`);
            console.log('─'.repeat(60));
            for (const file of result.writtenSources) console.log(`  ✓ source   ${file}`);
            if (!result.writtenSources.length) console.log('  · source   已存在，未覆盖人工 Markdown');
            console.log(`  ✓ student  ${path.join(result.outputRoot, 'student')}`);
            console.log(`  ✓ teacher  ${path.join(result.outputRoot, 'facilitator')}`);
            console.log(`  ${rest.includes('--render') ? '✓ HTML 已渲染' : '· 未渲染 HTML；加 --render 生成交付页面'}\n`);
            return;
        }
        process.exit(run('package.js', [name, ...rest.slice(1)]));
    },

    lint() {
        const name = requireName('lint');
        const context = resolvedContext(name, optionValue('--recipe'));
        process.exit(run('lint-slides.js', [name], context.env));
    },

    animate() {
        const name = requireName('animate');
        if (fs.existsSync(path.join(COURSES_DIR, name, 'course.compose.json'))) {
            die(`组合课不能修改 .build 产物；请修改本地源／变体，或先回到提供该页的共享源`);
        }
        process.exit(run('animate-slides.js', [name, ...rest.slice(1)]));
    },

    build() {
        const name = requireName('build');
        const context = resolvedContext(name, optionValue('--recipe'));
        process.exit(run('build.js', [name], context.env));
    },

    render() {
        const name = requireName('render');
        const context = resolvedContext(name, optionValue('--recipe'));
        const lintCode = run('lint-slides.js', [name], context.env);
        if (lintCode !== 0) process.exit(lintCode);
        process.exit(run('build.js', [name], context.env));
    },

    export() {
        const name = requireName('export');
        const context = resolvedContext(name, optionValue('--recipe'));
        if (context.composed) {
            const buildCode = run('build.js', [name], context.env);
            if (buildCode !== 0) process.exit(buildCode);
        }
        process.exit(run('export.js', [name, ...withoutOption(rest.slice(1), '--recipe')], context.env));
    },

    pdf() {
        const name = requireName('pdf');
        const context = resolvedContext(name, optionValue('--recipe'));
        if (context.composed) {
            const buildCode = run('build.js', [name], context.env);
            if (buildCode !== 0) process.exit(buildCode);
        }
        process.exit(run('pdf.js', [name, ...withoutOption(rest.slice(1), '--recipe')], context.env));
    },

    shot() {
        const name = requireName('shot');
        const context = resolvedContext(name, optionValue('--recipe'));
        if (context.composed) {
            const buildCode = run('build.js', [name], context.env);
            if (buildCode !== 0) process.exit(buildCode);
        }
        process.exit(run('shot.js', [name, ...withoutOption(rest.slice(1), '--recipe')], context.env));
    },

    themes() {
        process.exit(run('theme-gallery.js', rest));
    },

    notes() {
        const name      = requireName('notes');
        const context   = resolvedContext(name, optionValue('--recipe'));
        const activeDir = context.dir;
        const slidesDir = path.join(activeDir, 'slides');
        if (!fs.existsSync(slidesDir)) die(`slides/ not found: ${slidesDir}`);
        const files = fs.readdirSync(slidesDir).filter(f => f.endsWith('.html')).sort();
        if (files.length === 0) die('slides/ 目录为空');

        let title = name;
        const metaPath = path.join(activeDir, 'course.meta.md');
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

        const outPath = path.join(activeDir, 'handout.md');
        fs.writeFileSync(outPath, out.join('\n'), 'utf8');
        console.log(`\n  ✓  讲师手册已生成: ${outPath}`);
        console.log(`     共 ${files.length} 页, 其中 ${noteCount} 页有演讲备注`);
        if (fs.existsSync(path.join(activeDir, 'course.blueprint.md'))) {
            console.log(`     （M/L 档: nextcourse package ${name} 出的讲师手册按模块组织, 还带活动指令与评分点）`);
        }
        console.log('');
    },

    // 技能的第一步统一调它: 确认引擎在、Node 版本够、Chrome 有没有,
    // 并把当前的 WORK_ROOT 报出来 —— 路径语义是新用户最容易懵的地方。
    doctor() {
        const nodeMajor = Number(process.versions.node.split('.')[0]);
        const chrome = findChrome();

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
            : meh('Chrome     未找到 —— shot（截图/溢出检测）与 pdf（导出）不可用，其余命令不受影响'));

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
  nextcourse compose <name> [--recipe <id>] [--dry-run]
                                      预览候选；已有已接受 lock 时只重建隔离视图
  nextcourse validate <name> [--recipe <id>] [--json]
                                      纯校验组合课，不写报告、lock 或构建视图
  nextcourse trace <name> <entity-or-instance-id> [--recipe <id>] [--json]
                                      查看实例、实体或当前页码的完整来源链
  nextcourse impact <source-id> [--json]
                                      查看工作区内直接／传递使用者及冻结状态
  nextcourse sync <name> [--recipe <id>] [--dry-run] [--json]
  nextcourse sync <name> --apply <plan-id>
                                      预览更新；仅接受匹配当前基线且无冲突的计划
  nextcourse check  <name>            兼容校验：教学闭环并按旧行为写报告
  nextcourse check --workspace [--json]
                                      纯校验工作区组合契约、快照与漂移
  nextcourse lint   <name>            校验幻灯片样式规范
  nextcourse animate <name> [--strip] 批量打入/剥离组件入场动画（不碰手写 fragment）
  nextcourse build  <name>            组装生成 deck.html
  nextcourse render <name>            lint + build 一步完成（推荐）
  nextcourse package <name> [--recipe <id>] [--render] [--force]
                                      独立 M/L 或组合 slides+lab/full 交付包
  nextcourse pdf    <name> [out.pdf] [--theme <配色>] [--size WxH] [--keep] [--source <file>]
                                      导出 PDF：一页一张幻灯片，配色版式原样保留（需本机 Chrome）
                                      --theme print-light 出学员可打印的浅色版
                                      slide 上写 data-print="off" 的页不进 PDF
  nextcourse export <name> [outdir] [--with-package] [--audience student|facilitator]
                                      打包为可离线演示文件夹
  nextcourse notes  <name>            导出讲师手册 handout.md（各页演讲备注）
  nextcourse shot   <name> [--check]  溢出检测 + 逐页截图到 .review/（需本机 Chrome）
  nextcourse themes                   生成配色/字体展板 theme-gallery/index.html

工作流（从零开始）:
  nextcourse-design             ← 技能: 对话式设计大纲（S 档止于此）
  nextcourse-delivery <name>    ← 技能: M/L 档补评估方案与开发计划
  nextcourse check <name>       ← M/L 档: 校验教学设计闭环
  nextcourse-slides <name>      ← 技能: 生成幻灯片
  nextcourse compose <name>     ← 组合课: 锁定引用并生成 .build/<recipe>/
  nextcourse sync <name>        ← 组合课: 预览上游更新并用 plan ID 显式接受
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

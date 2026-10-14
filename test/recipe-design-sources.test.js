'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { planRecipeLock, applyLockPlan, materializeRecipe, validateRecipe, packageComposedCourse, planCourseUpdate, applyCourseUpdate } = require('../composition');
const { DIAGNOSTIC_CODES: C } = require('../composition/diagnostics');
const ROOT = path.resolve(__dirname, '..');
function setup(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-design-source-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.cpSync(path.join(__dirname, 'fixtures/composition-workspace'), root, { recursive: true });
    const dir = path.join(root, 'courses/office');
    fs.mkdirSync(path.join(dir, 'design'), { recursive: true });
    const compose = JSON.parse(fs.readFileSync(path.join(dir, 'course.compose.json')));
    const meta = fs.readFileSync(path.join(dir, 'course.meta.md'), 'utf8');
    fs.writeFileSync(path.join(dir, 'design/workshop.md'), meta.replace(/^title:.*$/m, 'title: "Workshop title"'));
    fs.writeFileSync(path.join(dir, 'design/short.md'), meta.replace(/^title:.*$/m, 'title: "Short course title"'));
    compose.recipes.workshop.designSources = { meta: 'design/workshop.md' };
    compose.recipes['page-variant'].designSources = { meta: 'design/short.md' };
    fs.writeFileSync(path.join(dir, 'course.compose.json'), JSON.stringify(compose));
    return { root, dir, compose };
}
function accept(root, recipe) {
    const plan = planRecipeLock(root, 'office', recipe);
    assert.equal(plan.valid, true, JSON.stringify(plan.diagnostics));
    assert.equal(applyLockPlan(plan).applied, true);
}

test('each recipe uses its own design source in build and delivery, preserving all authoritative Markdown', t => {
    const { root, dir } = setup(t);
    for (const [recipe, title] of [['workshop', 'Workshop title'], ['page-variant', 'Short course title']]) {
        accept(root, recipe);
        const result = materializeRecipe(root, 'office', recipe);
        assert.equal(result.materialized, true, JSON.stringify(result.diagnostics));
        assert.match(fs.readFileSync(path.join(result.outputDir, 'course.meta.md'), 'utf8'), new RegExp(title));
        const run = spawnSync(process.execPath, [path.join(ROOT, 'nextcourse.js'), 'build', 'office', '--recipe', recipe], { cwd: root, env: { ...process.env, NEXTCOURSE_HOME: root }, encoding: 'utf8' });
        assert.equal(run.status, 0, run.stderr + run.stdout);
        assert.match(fs.readFileSync(path.join(result.outputDir, 'deck.html'), 'utf8'), new RegExp(`<title>${title}</title>`));
    }
    const before = fs.readFileSync(path.join(dir, 'design/workshop.md'));
    const packed = packageComposedCourse(root, ROOT, 'office', 'workshop', { render: true });
    assert.equal(packed.packaged, true, JSON.stringify(packed.diagnostics));
    assert.match(fs.readFileSync(path.join(dir, 'package-src/workshop/student/2_workbook.md'), 'utf8'), /Workshop title/);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'design/workshop.md')), before);
});

test('local design edits invalidate a pending acceptance plan and refresh a previously generated view', t => {
    const { root, dir } = setup(t);
    const pending = planRecipeLock(root, 'office', 'workshop');
    fs.appendFileSync(path.join(dir, 'design/workshop.md'), '\nNew design note\n');
    const refused = applyLockPlan(pending);
    assert.equal(refused.applied, false);
    assert(refused.diagnostics.some(d => d.code === C.PLAN_STALE));
    accept(root, 'workshop');
    const first = materializeRecipe(root, 'office', 'workshop');
    assert.equal(first.materialized, true);
    fs.appendFileSync(path.join(dir, 'design/workshop.md'), '\nAnother local design edit\n');
    const second = materializeRecipe(root, 'office', 'workshop');
    assert.equal(second.materialized, true);
    assert.notEqual(second.reused, true);
    assert.match(fs.readFileSync(path.join(second.outputDir, 'course.meta.md'), 'utf8'), /Another local design edit/);
});

test('check CLI reads the selected composed design view instead of the root metadata', t => {
    const { root, dir } = setup(t);
    const invalidRoot = '---\ntitle: "Root must not be checked"\n---\n';
    fs.writeFileSync(path.join(dir, 'course.meta.md'), invalidRoot);
    for (const [recipe, file, count] of [['workshop', 'workshop.md', 3], ['page-variant', 'short.md', 4]]) {
        const metadata = ['---', 'title: "Recipe-specific check"', 'scale: S', 'outcomes:',
            ...Array.from({ length: count }, (_, i) => `  - { do: "Selected outcome ${i + 1}", bloom: apply, success: "Observable output" }`),
            '---', ''].join('\n');
        fs.writeFileSync(path.join(dir, 'design', file), metadata);
        accept(root, recipe);
        const result = spawnSync(process.execPath, [path.join(ROOT, 'nextcourse.js'), 'check', 'office', '--recipe', recipe], {
            cwd: root, env: { ...process.env, NEXTCOURSE_HOME: root }, encoding: 'utf8',
        });
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, new RegExp(`学习成果 : ${count} 条`));
        assert.match(result.stdout, /PASS/);
    }
    assert.equal(fs.readFileSync(path.join(dir, 'course.meta.md'), 'utf8'), invalidRoot);
});

test('composed M check keeps diagnostic alignment outside the generated delivery package', t => {
    const { root, dir, compose } = setup(t);
    const meta = ['---', 'title: "M check workflow"', 'scale: M', 'duration: "45 min"', 'class_size: "12"',
        'outcomes:', ...[1, 2, 3].map(i => `  - { id: LO${i}, do: "Rewrite ${i}", bloom: apply, module: "1", success: "Clear prompt", evidence: "Submitted prompt ${i}" }`),
        '---', '## 课程大纲', '### 模块1：提示词（3张）', ''].join('\n');
    const blueprint = ['# 蓝图', '## 一、需求诊断', '12 people', '## 二、课程定位', 'Prompt rewriting',
        '## 三、目标体系', 'LO1 LO2 LO3', '## 四、整体设计', 'Practice and review', '## 五、模块架构',
        '| # | 模块 | 时长 | 教学活动 | 产出物 | 覆盖成果 |', '|---|---|---|---|---|---|',
        '| 1 | 提示词 | 45 min | 改写练习 | Clear prompt | LO1 LO2 LO3 |', ''].join('\n');
    fs.writeFileSync(path.join(dir, 'design/workshop.md'), meta);
    fs.writeFileSync(path.join(dir, 'design/workshop-blueprint.md'), blueprint);
    compose.recipes.workshop.designSources.blueprint = 'design/workshop-blueprint.md';
    fs.writeFileSync(path.join(dir, 'course.compose.json'), JSON.stringify(compose));
    accept(root, 'workshop');
    const runCheck = () => spawnSync(process.execPath, [path.join(ROOT, 'nextcourse.js'), 'check', 'office', '--recipe', 'workshop'], {
        cwd: root, env: { ...process.env, NEXTCOURSE_HOME: root }, encoding: 'utf8',
    });
    let checked = runCheck();
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    const view = path.join(dir, '.build/workshop');
    assert(fs.existsSync(path.join(view, 'checks/7_alignment.md')));
    assert(!fs.existsSync(path.join(view, 'package')));
    let packed = packageComposedCourse(root, ROOT, 'office', 'workshop', { render: true });
    assert.equal(packed.packaged, true, JSON.stringify(packed.diagnostics));
    const manifest = fs.readFileSync(path.join(packed.outputRoot, 'package.manifest.json'));
    checked = runCheck();
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    assert.deepEqual(fs.readFileSync(path.join(packed.outputRoot, 'package.manifest.json')), manifest);
    packed = packageComposedCourse(root, ROOT, 'office', 'workshop', { render: true });
    assert.equal(packed.packaged, true, JSON.stringify(packed.diagnostics));
    assert.equal(fs.readFileSync(path.join(dir, 'design/workshop.md'), 'utf8'), meta);
});

test('replacing a public unit with a different identity does not require a fake version bump', t => {
    const { root, dir, compose } = setup(t);
    accept(root, 'workshop');
    const provider = path.join(root, 'courses/prompt-engineering');
    const unit = JSON.parse(fs.readFileSync(path.join(provider, 'units/prompt-basics/unit.json')));
    unit.id = 'prompt-engineering:unit:prompt-replacement';
    fs.writeFileSync(path.join(provider, 'units/prompt-basics/replacement.json'), JSON.stringify(unit));
    const exportsPath = path.join(provider, 'course.exports.json');
    const exports = JSON.parse(fs.readFileSync(exportsPath));
    exports.exports.push({ id: unit.id, kind: 'unit', title: 'Replacement', version: '1.0.0', source: 'units/prompt-basics/replacement.json' });
    fs.writeFileSync(exportsPath, JSON.stringify(exports));
    compose.recipes.workshop.groups[0].items[0].ref = unit.id;
    fs.writeFileSync(path.join(dir, 'course.compose.json'), JSON.stringify(compose));
    const plan = planCourseUpdate(root, 'office', 'workshop');
    assert.equal(plan.applicable, true, JSON.stringify(plan.conflicts));
    assert(!plan.conflicts.some(c => c.type === 'version-not-bumped'));
    assert.equal(applyCourseUpdate(plan).applied, true);
    const view = materializeRecipe(root, 'office', 'workshop');
    assert.equal(view.materialized, true, JSON.stringify(view.diagnostics));
});

test('missing and escaping design paths block composition before writing a lock', t => {
    const { root, dir, compose } = setup(t);
    fs.unlinkSync(path.join(dir, 'design/workshop.md'));
    assert.equal(planRecipeLock(root, 'office', 'workshop').valid, false);
    compose.recipes.workshop.designSources.meta = '../outside.md';
    fs.writeFileSync(path.join(dir, 'course.compose.json'), JSON.stringify(compose));
    assert(planRecipeLock(root, 'office', 'workshop').diagnostics.some(d => d.code === C.PATH_INVALID));
});

test('pagePlan takes precedence over legacy selection in instructional evidence checks', t => {
    const { root, dir, compose } = setup(t);
    compose.recipes.workshop.groups[0].items[0].pagePlan = ['prompt-engineering:page:prompt-framework'];
    fs.writeFileSync(path.join(dir, 'course.compose.json'), JSON.stringify(compose));
    accept(root, 'workshop');
    const result = validateRecipe(root, 'office', 'workshop');
    assert(result.diagnostics.some(d => d.code === C.OUTCOME_EVIDENCE_MISSING && d.details?.occurrenceId === 'office-prompt'));
});

test('local page occurrences preserve their HTML and linked assets and participate in stale-plan protection', t => {
    const { root, dir, compose } = setup(t);
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'cover.html'), '<section><h1>Local cover</h1><img src="assets/cover.svg"></section>');
    fs.writeFileSync(path.join(dir, 'assets/cover.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    compose.recipes.workshop.groups.unshift({id:'opening',title:'Opening',moduleNumber:null,items:[{id:'local-cover',contentMode:'local',updatePolicy:'frozen',local:{id:'office:page:cover',path:'cover.html'}}]});
    fs.writeFileSync(path.join(dir, 'course.compose.json'), JSON.stringify(compose));
    const pending = planRecipeLock(root, 'office', 'workshop');
    assert.equal(pending.valid, true, JSON.stringify(pending.diagnostics));
    fs.appendFileSync(path.join(dir, 'assets/cover.svg'), '\n');
    assert.equal(applyLockPlan(pending).applied, false);
    accept(root, 'workshop');
    const result = materializeRecipe(root, 'office', 'workshop');
    assert.equal(result.materialized, true, JSON.stringify(result.diagnostics));
    assert.deepEqual(fs.readFileSync(path.join(result.outputDir, 'slides/slide-01.html')), fs.readFileSync(path.join(dir, 'cover.html')));
    assert.deepEqual(fs.readFileSync(path.join(result.outputDir, 'assets/cover.svg')), fs.readFileSync(path.join(dir, 'assets/cover.svg')));
});

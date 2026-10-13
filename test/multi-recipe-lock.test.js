'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const {
    planRecipeLock, applyLockPlan, materializeRecipe, validateRecipe,
    traceSource, impactSource, planCourseUpdate, applyCourseUpdate,
    planDeliveryPackage, recipeLockPath,
} = require('../composition');
const { DIAGNOSTIC_CODES: C } = require('../composition/diagnostics');
const ROOT = path.resolve(__dirname, '..');
function workspace(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-multi-lock-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.cpSync(path.join(__dirname, 'fixtures/composition-workspace'), dir, { recursive: true });
    return dir;
}
function accept(root, recipe) {
    const plan = planRecipeLock(root, 'office', recipe);
    assert.equal(plan.valid, true, JSON.stringify(plan.diagnostics));
    const result = applyLockPlan(plan);
    assert.equal(result.applied, true, JSON.stringify(result.diagnostics));
    return result.lockPath;
}
function cli(root, ...args) {
    const run = spawnSync(process.execPath, [path.join(ROOT, 'nextcourse.js'), ...args], { cwd: root, env: { ...process.env, NEXTCOURSE_HOME: root }, encoding: 'utf8' });
    assert.equal(run.status, 0, `${args.join(' ')}\n${run.stdout}\n${run.stderr}`);
    return run.stdout;
}

test('recipe locks coexist through build, trace, impact and delivery without overwriting the default', t => {
    const root = workspace(t);
    const defaultPath = accept(root, 'workshop');
    const original = fs.readFileSync(defaultPath);
    const variantPath = accept(root, 'page-variant');
    assert.match(variantPath, /course\.locks[\/]page-variant\.lock\.json$/);
    assert.deepEqual(fs.readFileSync(defaultPath), original);
    for (const recipe of ['workshop', 'page-variant']) {
        assert.equal(materializeRecipe(root, 'office', recipe).materialized, true);
        assert.equal(validateRecipe(root, 'office', recipe).valid, true);
        assert.equal(traceSource(root, 'office', '1', recipe).recipeId, recipe);
        cli(root, 'compose', 'office', '--recipe', recipe);
        cli(root, 'build', 'office', '--recipe', recipe);
    }
    assert.equal(planDeliveryPackage(root, 'office', 'workshop').valid, true);
    const impacts = impactSource(root, 'prompt-engineering:page:prompt-practice').impacts;
    assert(impacts.some(item => item.recipeId === 'page-variant' && item.locked));
    assert.deepEqual(fs.readFileSync(defaultPath), original);
});

test('changing a different recipe keeps the accepted recipe usable while changes to its own recipe block builds', t => {
    const root = workspace(t);
    const lockPath = accept(root, 'workshop');
    const original = fs.readFileSync(lockPath);
    const composePath = path.join(root, 'courses/office/course.compose.json');
    const compose = JSON.parse(fs.readFileSync(composePath));
    compose.recipes['page-variant'].title = 'Another recipe changed';
    fs.writeFileSync(composePath, JSON.stringify(compose));
    assert.equal(validateRecipe(root, 'office', 'workshop').valid, true);
    assert.equal(materializeRecipe(root, 'office', 'workshop').materialized, true);
    cli(root, 'compose', 'office', '--recipe', 'workshop');
    cli(root, 'package', 'office', '--recipe', 'workshop', '--render');
    assert.deepEqual(fs.readFileSync(lockPath), original);
    compose.recipes.workshop.durationMinutes = 46;
    fs.writeFileSync(composePath, JSON.stringify(compose));
    assert.equal(materializeRecipe(root, 'office', 'workshop').materialized, false);
    assert(validateRecipe(root, 'office', 'workshop').diagnostics.some(d => d.code === C.SOURCE_DRIFT));
});

test('legacy non-default locks remain readable and migrate without overwriting another recipe', t => {
    const root = workspace(t);
    const originalPath = accept(root, 'page-variant');
    const legacy = path.join(root, 'courses/office/course.lock.json');
    const lock = JSON.parse(fs.readFileSync(originalPath));
    delete lock.recipeHash;
    fs.writeFileSync(legacy, JSON.stringify(lock));
    fs.unlinkSync(originalPath);
    assert.equal(materializeRecipe(root, 'office', 'page-variant').materialized, true);
    const legacyBytes = fs.readFileSync(legacy);
    const defaultPath = accept(root, 'workshop');
    assert.notEqual(defaultPath, legacy);
    assert.deepEqual(fs.readFileSync(legacy), legacyBytes);
    const update = planCourseUpdate(root, 'office', 'page-variant');
    assert.equal(update.applicable, true, JSON.stringify(update.diagnostics));
    assert.equal(applyCourseUpdate(update, update.planId).applied, true);
    assert(fs.existsSync(originalPath));
    assert.deepEqual(fs.readFileSync(legacy), legacyBytes);
    assert.equal(materializeRecipe(root, 'office', 'workshop').materialized, true);
});

test('a newly created lock invalidates a previously planned first lock before any overwrite', t => {
    const root = workspace(t);
    const waiting = planCourseUpdate(root, 'office', 'page-variant');
    assert.equal(waiting.applicable, true);
    const acceptedPath = accept(root, 'page-variant');
    const bytes = fs.readFileSync(acceptedPath);
    const stale = applyCourseUpdate(waiting, waiting.planId);
    assert.equal(stale.applied, false);
    assert(stale.diagnostics.some(d => d.code === C.PLAN_STALE));
    assert.deepEqual(fs.readFileSync(acceptedPath), bytes);
    const compose = JSON.parse(fs.readFileSync(path.join(root, 'courses/office/course.compose.json')));
    assert.equal(recipeLockPath(path.join(root, 'courses/office'), compose, '../../escape'), path.join(root, 'courses/office/course.lock.json'));
});

test('long courses retain actual module labels while cycling the ten registered color classes', t => {
    const root = workspace(t);
    const dir = path.join(root, 'courses/office');
    const composePath = path.join(dir, 'course.compose.json');
    const compose = JSON.parse(fs.readFileSync(composePath));
    compose.recipes.workshop.groups[0].moduleNumber = 11;
    fs.writeFileSync(composePath, JSON.stringify(compose));
    fs.writeFileSync(path.join(dir, 'units/review/slides/01-review.html'), '<section class="module-__MODULE_N__" data-role="divider"><span class="module-divider__number">__MODULE_NO__</span><h2>Review</h2></section>');
    accept(root, 'workshop');
    const result = materializeRecipe(root, 'office', 'workshop');
    assert.equal(result.materialized, true, JSON.stringify(result.diagnostics));
    const html = fs.readFileSync(path.join(result.outputDir, 'slides/slide-03.html'), 'utf8');
    assert.match(html, /class="module-1"/);
    assert.match(html, /module-divider__number">11</);
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath));
    assert.equal(manifest.pages[2].moduleNumber, 11);
});

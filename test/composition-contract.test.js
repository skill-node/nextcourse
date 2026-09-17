'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const COMPOSITION_WORKSPACE = path.join(__dirname, 'fixtures', 'composition-workspace');
const INDEPENDENT_WORKSPACE = path.join(__dirname, 'fixtures', 'independent-workspace');
const {
    validateExportsManifest,
    validateComposeManifest,
    validateLockManifest,
    validateUnit,
    validateCase,
} = require('../composition/contracts');
const { DIAGNOSTIC_CODES } = require('../composition/diagnostics');
const { captureBaseline, contentFingerprint } = require('../composition/baseline');
const { buildCatalog } = require('../composition/catalog');
const { resolveExport } = require('../composition/resolver');
const { planRecipeLock, applyLockPlan, loadSnapshot } = require('../composition/lock');
const { materializeRecipe } = require('../composition/materialize');
const { planDeliveryPackage, packageComposedCourse } = require('../composition/delivery');
const {
    validateRecipe,
    validateWorkspace,
    traceSource,
    impactSource,
    planCourseUpdate,
    applyCourseUpdate,
} = require('../composition/maintenance');

function json(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(COMPOSITION_WORKSPACE, relativePath), 'utf8'));
}

test('all published schema documents are valid JSON with schemaVersion 1', () => {
    const schemaDir = path.join(ROOT, 'composition', 'schemas');
    const files = fs.readdirSync(schemaDir).filter(file => file.endsWith('.schema.json')).sort();
    assert.deepEqual(files, [
        'case.schema.json',
        'course.compose.schema.json',
        'course.exports.schema.json',
        'course.lock.schema.json',
        'unit.schema.json',
    ]);
    for (const file of files) {
        const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, file), 'utf8'));
        assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
        assert.equal(schema.properties.schemaVersion.const, 1);
    }
});

test('the isolated nested/re-export composition fixtures satisfy v1 contracts', () => {
    const manifests = [
        'courses/prompt-engineering/course.exports.json',
        'courses/ai-foundations/course.exports.json',
        'courses/workbuddy/course.exports.json',
    ];
    for (const file of manifests) assert.deepEqual(validateExportsManifest(json(file)), { valid: true, diagnostics: [] });
    assert.deepEqual(
        validateUnit(json('courses/prompt-engineering/units/prompt-basics/unit.json')),
        { valid: true, diagnostics: [] }
    );
    assert.deepEqual(
        validateCase(json('courses/prompt-engineering/units/prompt-basics/cases/rewrite-request/case.json')),
        { valid: true, diagnostics: [] }
    );
    assert.deepEqual(validateComposeManifest(json('courses/office/course.compose.json')), { valid: true, diagnostics: [] });
    assert.deepEqual(validateLockManifest(json('courses/office/course.lock.json')), { valid: true, diagnostics: [] });
});

test('business validation catches identity, traversal, and occurrence collisions', () => {
    const exportsDoc = json('courses/prompt-engineering/course.exports.json');
    exportsDoc.exports[0].id = 'another-owner:unit:prompt-basics';
    exportsDoc.exports[0].source = '../outside.json';
    const exportCodes = validateExportsManifest(exportsDoc).diagnostics.map(item => item.code);
    assert(exportCodes.includes(DIAGNOSTIC_CODES.ENTITY_OWNER_MISMATCH));
    assert(exportCodes.includes(DIAGNOSTIC_CODES.PATH_INVALID));

    const composeDoc = json('courses/office/course.compose.json');
    composeDoc.recipes.workshop.groups[0].items[1].id = 'office-prompt';
    const composeCodes = validateComposeManifest(composeDoc).diagnostics.map(item => item.code);
    assert(composeCodes.includes(DIAGNOSTIC_CODES.OCCURRENCE_DUPLICATE));
});

test('diagnostic codes are stable and unique', () => {
    const values = Object.values(DIAGNOSTIC_CODES);
    assert.equal(new Set(values).size, values.length);
    assert(values.every(value => /^NC_COMPOSE_[A-Z0-9_]+$/.test(value)));
});

test('workspace catalog expands a three-hop public re-export chain', () => {
    const catalog = buildCatalog(COMPOSITION_WORKSPACE);
    assert.deepEqual(catalog.diagnostics, []);
    const resolution = resolveExport(catalog, 'workbuddy:unit:prompt-basics');
    assert.equal(resolution.resolved, true);
    assert.equal(resolution.ref, 'prompt-engineering:unit:prompt-basics');
    assert.equal(resolution.version, '1.0.0');
    assert.deepEqual(resolution.exportPath, [
        'workbuddy:unit:prompt-basics',
        'ai-foundations:unit:prompt-basics',
        'prompt-engineering:unit:prompt-basics',
    ]);
    assert.deepEqual(resolution.files.map(file => file.path), [
        'units/prompt-basics/assets/checklist.txt',
        'units/prompt-basics/cases/rewrite-request/case.json',
        'units/prompt-basics/cases/rewrite-request/facilitator/answer.md',
        'units/prompt-basics/cases/rewrite-request/generate.js',
        'units/prompt-basics/cases/rewrite-request/shared/rubric.md',
        'units/prompt-basics/cases/rewrite-request/student/brief.html',
        'units/prompt-basics/cases/rewrite-request/student/data/sample.json',
        'units/prompt-basics/slides/01-framework.html',
        'units/prompt-basics/slides/02-practice.html',
        'units/prompt-basics/unit.json',
    ]);
    assert.deepEqual(resolution.assets, ['prompt-engineering:asset:prompt-checklist']);
});

test('entity recursion cycles stop with the full path', () => {
    const resolution = resolveExport(buildCatalog(COMPOSITION_WORKSPACE), 'cycle-a:unit:loop');
    assert.equal(resolution.resolved, false);
    const cycle = resolution.diagnostics.find(item => item.code === DIAGNOSTIC_CODES.REFERENCE_CYCLE);
    assert(cycle);
    assert.deepEqual(cycle.details.cycle, [
        'cycle-a:unit:loop@1.0.0',
        'cycle-b:unit:loop@1.0.0',
        'cycle-a:unit:loop@1.0.0',
    ]);
});

test('two courses may re-export each other when the entity paths do not recurse', () => {
    const catalog = buildCatalog(COMPOSITION_WORKSPACE);
    const fromA = resolveExport(catalog, 'mutual-a:unit:beta');
    const fromB = resolveExport(catalog, 'mutual-b:unit:alpha');
    assert.equal(fromA.resolved, true, JSON.stringify(fromA.diagnostics));
    assert.equal(fromA.ref, 'mutual-b:unit:beta');
    assert.equal(fromB.resolved, true, JSON.stringify(fromB.diagnostics));
    assert.equal(fromB.ref, 'mutual-a:unit:alpha');
});

test('diamond references remain three occurrences and produce a warning', () => {
    const plan = planRecipeLock(COMPOSITION_WORKSPACE, 'office', 'diamond');
    assert.equal(plan.valid, true);
    assert.equal(plan.lock.references.length, 3);
    assert.deepEqual(plan.lock.references.map(item => item.occurrenceId), ['via-workbuddy', 'via-ai', 'direct-prompt']);
    const duplicate = plan.diagnostics.find(item => item.code === DIAGNOSTIC_CODES.DUPLICATE_PATH);
    assert(duplicate);
    assert.equal(duplicate.severity, 'warning');
});

test('different requested versions of one terminal entity block locking', () => {
    const plan = planRecipeLock(COMPOSITION_WORKSPACE, 'office', 'version-conflict');
    assert.equal(plan.valid, false);
    assert.equal(plan.lock, null);
    assert(plan.diagnostics.some(item => item.code === DIAGNOSTIC_CODES.VERSION_CONFLICT));
});

test('lock snapshots rebuild their source closure after the upstream disappears', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-lock-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });

    const plan = planRecipeLock(temporaryRoot, 'office', 'workshop');
    assert.equal(plan.valid, true, JSON.stringify(plan.diagnostics));
    const applied = applyLockPlan(plan);
    assert.equal(applied.applied, true, JSON.stringify(applied.diagnostics));
    const lock = JSON.parse(fs.readFileSync(path.join(temporaryRoot, 'courses', 'office', 'course.lock.json'), 'utf8'));
    assert.equal(lock.references.length, 1);

    fs.renameSync(
        path.join(temporaryRoot, 'courses', 'prompt-engineering'),
        path.join(temporaryRoot, 'prompt-engineering.offline')
    );
    const snapshot = loadSnapshot(path.join(temporaryRoot, 'courses'), lock.references[0]);
    assert.equal(snapshot.valid, true, JSON.stringify(snapshot.diagnostics));
    assert.deepEqual(snapshot.manifest.files.map(file => file.path), [
        'units/prompt-basics/assets/checklist.txt',
        'units/prompt-basics/cases/rewrite-request/case.json',
        'units/prompt-basics/cases/rewrite-request/facilitator/answer.md',
        'units/prompt-basics/cases/rewrite-request/generate.js',
        'units/prompt-basics/cases/rewrite-request/shared/rubric.md',
        'units/prompt-basics/cases/rewrite-request/student/brief.html',
        'units/prompt-basics/cases/rewrite-request/student/data/sample.json',
        'units/prompt-basics/slides/01-framework.html',
        'units/prompt-basics/slides/02-practice.html',
        'units/prompt-basics/unit.json',
    ]);

    const missing = loadSnapshot(path.join(temporaryRoot, 'courses'), {
        ...lock.references[0],
        snapshotPath: '.nextcourse/objects/sha256/missing',
    });
    assert.equal(missing.valid, false);
    assert.equal(missing.diagnostics[0].code, DIAGNOSTIC_CODES.SNAPSHOT_MISSING);

    fs.appendFileSync(path.join(snapshot.dir, snapshot.manifest.files[0].storedPath), '\ncorrupt\n');
    const corrupt = loadSnapshot(path.join(temporaryRoot, 'courses'), lock.references[0]);
    assert.equal(corrupt.valid, false);
    assert.equal(corrupt.diagnostics[0].code, DIAGNOSTIC_CODES.HASH_INVALID);
});

test('a changed input invalidates a lock plan before any snapshot write', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-stale-plan-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    const existingLockPath = path.join(temporaryRoot, 'courses', 'office', 'course.lock.json');
    const existingLock = fs.readFileSync(existingLockPath, 'utf8');

    const plan = planRecipeLock(temporaryRoot, 'office', 'workshop');
    const sourcePath = path.join(temporaryRoot, 'courses', 'prompt-engineering', 'units', 'prompt-basics', 'slides', '01-framework.html');
    fs.appendFileSync(sourcePath, '\n<!-- concurrent edit -->\n');
    const applied = applyLockPlan(plan);
    assert.equal(applied.applied, false);
    assert(applied.diagnostics.some(item => item.code === DIAGNOSTIC_CODES.PLAN_STALE));
    assert.equal(fs.readFileSync(existingLockPath, 'utf8'), existingLock);
    assert(!fs.existsSync(path.join(temporaryRoot, 'courses', '.nextcourse')));
});

test('local pages and linked assets participate in stale-plan protection', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-local-stale-plan-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    const plan = planRecipeLock(temporaryRoot, 'office', 'workshop');
    assert.equal(plan.valid, true, JSON.stringify(plan.diagnostics));
    const inputPaths = plan.inputs.map(input => input.workspacePath);
    assert(inputPaths.includes('courses/office/variants/office-prompt.html'));
    assert(inputPaths.includes('courses/office/assets/office-example.html'));
    assert(inputPaths.includes('courses/office/units/review/slides/01-review.html'));
    fs.appendFileSync(path.join(temporaryRoot, 'courses', 'office', 'assets', 'office-example.html'), '\n<!-- changed -->\n');
    const result = applyLockPlan(plan);
    assert.equal(result.applied, false);
    assert(result.diagnostics.some(item => item.code === DIAGNOSTIC_CODES.PLAN_STALE));
    assert(!fs.existsSync(path.join(temporaryRoot, 'courses', '.nextcourse')));
});

test('a locked unit materializes selection, local replacement, local unit, and asset closure', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-materialize-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    const plan = planRecipeLock(temporaryRoot, 'office', 'workshop');
    assert.equal(applyLockPlan(plan).applied, true);

    const result = materializeRecipe(temporaryRoot, 'office', 'workshop');
    assert.equal(result.materialized, true, JSON.stringify(result.diagnostics));
    assert.equal(result.pageCount, 3);
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
    assert.deepEqual(manifest.pages.map(page => [page.entityId, page.contentMode]), [
        ['prompt-engineering:page:prompt-framework', 'reference'],
        ['office:page:prompt-practice', 'local'],
        ['office:page:review-output', 'local'],
    ]);
    assert.equal(manifest.assets.length, 2);
    assert.deepEqual(manifest.assets.map(asset => [asset.origin, asset.path]).sort(), [
        ['local', 'assets/office-example.html'],
        ['snapshot', 'assets/prompt-engineering/units/prompt-basics/assets/checklist.txt'],
    ]);
    for (const asset of manifest.assets) assert(fs.existsSync(path.join(result.outputDir, asset.path)));
    assert.match(
        fs.readFileSync(path.join(result.outputDir, 'slides', 'slide-01.html'), 'utf8'),
        /assets\/prompt-engineering\/units\/prompt-basics\/assets\/checklist\.txt/
    );
    assert.match(fs.readFileSync(path.join(result.outputDir, 'slides', 'slide-02.html'), 'utf8'), /办公室需求/);
    assert.match(fs.readFileSync(path.join(result.outputDir, 'slides', 'slide-02.html'), 'utf8'), /assets\/office-example\.html/);
    assert(fs.existsSync(path.join(result.outputDir, 'course.meta.md')));

    fs.appendFileSync(path.join(result.outputDir, 'slides', 'slide-01.html'), '\n<!-- hand edit -->\n');
    const drift = materializeRecipe(temporaryRoot, 'office', 'workshop');
    assert.equal(drift.materialized, false);
    assert(drift.diagnostics.some(item => item.code === DIAGNOSTIC_CODES.GENERATED_DRIFT));
});

test('a page variant uses its local full replacement and keeps the locked baseline', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-variant-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    const plan = planRecipeLock(temporaryRoot, 'office', 'page-variant');
    assert.equal(applyLockPlan(plan).applied, true);
    const result = materializeRecipe(temporaryRoot, 'office', 'page-variant');
    assert.equal(result.materialized, true, JSON.stringify(result.diagnostics));
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
    assert.equal(manifest.pages[0].contentMode, 'variant');
    assert.equal(manifest.pages[0].ref, 'prompt-engineering:page:prompt-practice');
    assert.match(fs.readFileSync(path.join(result.outputDir, 'slides', 'slide-01.html'), 'utf8'), /办公室需求/);
});

test('an external page operation is locked and materialized without adding module decoration', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-external-operation-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    const plan = planRecipeLock(temporaryRoot, 'office', 'external-operation');
    assert.equal(plan.valid, true, JSON.stringify(plan.diagnostics));
    assert.deepEqual(plan.lock.references.map(reference => reference.occurrenceId), ['local-with-external-insert.op1']);
    assert.equal(applyLockPlan(plan).applied, true);
    const result = materializeRecipe(temporaryRoot, 'office', 'external-operation');
    assert.equal(result.materialized, true, JSON.stringify(result.diagnostics));
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
    assert.equal(manifest.groups[0].moduleNumber, null);
    assert.deepEqual(manifest.pages.map(page => page.entityId), [
        'prompt-engineering:page:prompt-practice',
        'office:page:review-output',
    ]);
    assert.doesNotMatch(fs.readFileSync(path.join(result.outputDir, 'slides', 'slide-01.html'), 'utf8'), /module-\d+/);
});

test('compose dry-run is pure and build writes only to the resolved recipe view', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-compose-cli-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    const lockPath = path.join(temporaryRoot, 'courses', 'office', 'course.lock.json');
    const initialLock = fs.readFileSync(lockPath, 'utf8');
    const env = { ...process.env, NEXTCOURSE_HOME: temporaryRoot };
    const cli = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'nextcourse.js'), ...args], {
        cwd: temporaryRoot,
        env,
        encoding: 'utf8',
    });

    const preview = cli('compose', 'office', '--recipe', 'workshop', '--dry-run');
    assert.equal(preview.status, 0, `${preview.stdout}\n${preview.stderr}`);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), initialLock);
    assert(!fs.existsSync(path.join(temporaryRoot, 'courses', '.nextcourse')));
    assert(!fs.existsSync(path.join(temporaryRoot, 'courses', 'office', '.build')));

    fs.rmSync(lockPath);
    const syncPreview = cli('sync', 'office', '--recipe', 'workshop', '--json');
    assert.equal(syncPreview.status, 0, `${syncPreview.stdout}\n${syncPreview.stderr}`);
    const planId = JSON.parse(syncPreview.stdout).planId;
    const syncApply = cli('sync', 'office', '--recipe', 'workshop', '--apply', planId, '--json');
    assert.equal(syncApply.status, 0, `${syncApply.stdout}\n${syncApply.stderr}`);
    const compose = cli('compose', 'office', '--recipe', 'workshop');
    assert.equal(compose.status, 0, `${compose.stdout}\n${compose.stderr}`);
    const build = cli('build', 'office', '--recipe', 'workshop');
    assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
    assert(fs.existsSync(path.join(temporaryRoot, 'courses', 'office', '.build', 'workshop', 'deck.html')));
    assert(!fs.existsSync(path.join(temporaryRoot, 'courses', 'office', 'deck.html')));
});

test('pure validation checks locked snapshots and instructional budget without writing', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-validate-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    const plan = planRecipeLock(temporaryRoot, 'office', 'workshop');
    assert.equal(applyLockPlan(plan).applied, true);
    const before = fs.readdirSync(path.join(temporaryRoot, 'courses', 'office')).sort();

    const result = validateRecipe(temporaryRoot, 'office', 'workshop');
    assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
    assert.equal(result.estimatedMinutes, 35);
    assert.deepEqual(fs.readdirSync(path.join(temporaryRoot, 'courses', 'office')).sort(), before);
    assert(!fs.existsSync(path.join(temporaryRoot, 'courses', 'office', '.build')));

    const workspace = validateWorkspace(temporaryRoot);
    assert.equal(workspace.valid, true, JSON.stringify(workspace.diagnostics));
    assert(workspace.courses.some(course => course.courseName === 'office' && course.kind === 'composed'));

    const materialized = materializeRecipe(temporaryRoot, 'office', 'workshop');
    assert.equal(materialized.materialized, true);
    fs.appendFileSync(path.join(materialized.outputDir, 'slides', 'slide-01.html'), '\n<!-- generated drift -->\n');
    const drift = validateRecipe(temporaryRoot, 'office', 'workshop');
    assert.equal(drift.valid, false);
    assert(drift.diagnostics.some(item => item.code === DIAGNOSTIC_CODES.GENERATED_DRIFT));
});

test('trace and impact expose nested provenance, pages, and direct versus transitive use', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-maintenance-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    const plan = planRecipeLock(temporaryRoot, 'office', 'workshop');
    assert.equal(applyLockPlan(plan).applied, true);
    assert.equal(materializeRecipe(temporaryRoot, 'office', 'workshop').materialized, true);

    const trace = traceSource(temporaryRoot, 'office', 'office-prompt', 'workshop');
    assert.equal(trace.found, true, JSON.stringify(trace.diagnostics));
    const reference = trace.matches.find(match => match.exportPath.length > 0);
    assert.deepEqual(reference.exportPath, [
        'workbuddy:unit:prompt-basics',
        'ai-foundations:unit:prompt-basics',
        'prompt-engineering:unit:prompt-basics',
    ]);
    assert.equal(reference.pages[0].index, 1);

    const direct = impactSource(temporaryRoot, 'workbuddy:unit:prompt-basics');
    assert(direct.direct >= 1);
    assert.equal(direct.transitive, 0);
    const transitive = impactSource(temporaryRoot, 'prompt-engineering:unit:prompt-basics');
    assert(transitive.direct >= 1);
    assert(transitive.transitive >= 1);
    assert(transitive.impacts.some(item => item.locked));
    assert(transitive.impacts.some(item => !item.locked));
});

test('update plans require version bumps, reject stale baselines, and apply an accepted plan', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-sync-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    const initial = planRecipeLock(temporaryRoot, 'office', 'workshop');
    assert.equal(applyLockPlan(initial).applied, true);
    const baselinePlan = planCourseUpdate(temporaryRoot, 'office', 'workshop');
    fs.appendFileSync(path.join(temporaryRoot, 'courses', 'office', 'assets', 'office-example.html'), '\n<!-- local baseline change -->\n');
    const localChangedPlan = planCourseUpdate(temporaryRoot, 'office', 'workshop');
    assert.notEqual(localChangedPlan.planId, baselinePlan.planId, 'all local inputs must participate in the plan ID');
    const sourceSlide = path.join(temporaryRoot, 'courses', 'prompt-engineering', 'units', 'prompt-basics', 'slides', '01-framework.html');
    fs.appendFileSync(sourceSlide, '\n<!-- changed without release -->\n');

    const conflict = planCourseUpdate(temporaryRoot, 'office', 'workshop');
    assert.equal(conflict.applicable, false);
    assert(conflict.conflicts.some(item => item.type === 'version-not-bumped'));
    assert.equal(applyCourseUpdate(conflict).applied, false);
    const lockedBuild = materializeRecipe(temporaryRoot, 'office', 'workshop');
    assert.equal(lockedBuild.materialized, true, JSON.stringify(lockedBuild.diagnostics));
    const lockedManifest = JSON.parse(fs.readFileSync(lockedBuild.manifestPath, 'utf8'));
    assert.equal(lockedManifest.pages[0].version, '1.0.0', 'ordinary materialization must keep the old lock');

    const exportPath = path.join(temporaryRoot, 'courses', 'prompt-engineering', 'course.exports.json');
    const unitPath = path.join(temporaryRoot, 'courses', 'prompt-engineering', 'units', 'prompt-basics', 'unit.json');
    const aiExportPath = path.join(temporaryRoot, 'courses', 'ai-foundations', 'course.exports.json');
    const exportsDoc = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    exportsDoc.exports.find(entry => entry.id === 'prompt-engineering:unit:prompt-basics').version = '1.1.0';
    fs.writeFileSync(exportPath, `${JSON.stringify(exportsDoc, null, 2)}\n`);
    const unit = JSON.parse(fs.readFileSync(unitPath, 'utf8'));
    unit.version = '1.1.0';
    fs.writeFileSync(unitPath, `${JSON.stringify(unit, null, 2)}\n`);
    const aiExports = JSON.parse(fs.readFileSync(aiExportPath, 'utf8'));
    aiExports.exports[0].target.version = '1.1.0';
    fs.writeFileSync(aiExportPath, `${JSON.stringify(aiExports, null, 2)}\n`);

    const stale = planCourseUpdate(temporaryRoot, 'office', 'workshop');
    assert.equal(stale.applicable, true, JSON.stringify(stale.diagnostics));
    fs.appendFileSync(sourceSlide, '\n<!-- concurrent change -->\n');
    const rejected = applyCourseUpdate(stale);
    assert.equal(rejected.applied, false);
    assert(rejected.diagnostics.some(item => item.code === DIAGNOSTIC_CODES.PLAN_STALE));

    const accepted = planCourseUpdate(temporaryRoot, 'office', 'workshop');
    assert.equal(accepted.applicable, true, JSON.stringify(accepted.diagnostics));
    assert.notEqual(accepted.planId, stale.planId);
    const applied = applyCourseUpdate(accepted, accepted.planId);
    assert.equal(applied.applied, true, JSON.stringify(applied.diagnostics));
    const lock = JSON.parse(fs.readFileSync(path.join(temporaryRoot, 'courses', 'office', 'course.lock.json'), 'utf8'));
    assert.equal(lock.references[0].version, '1.1.0');
});

test('frozen updates stay pinned and variant updates require three-way review', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-sync-policy-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });

    const variantInitial = planRecipeLock(temporaryRoot, 'office', 'page-variant');
    assert.equal(applyLockPlan(variantInitial).applied, true);
    const pagePath = path.join(temporaryRoot, 'courses', 'prompt-engineering', 'units', 'prompt-basics', 'slides', '02-practice.html');
    const exportPath = path.join(temporaryRoot, 'courses', 'prompt-engineering', 'course.exports.json');
    fs.appendFileSync(pagePath, '\n<!-- upstream page release -->\n');
    const exportsDoc = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    exportsDoc.exports.find(entry => entry.id === 'prompt-engineering:page:prompt-practice').version = '1.1.0';
    fs.writeFileSync(exportPath, `${JSON.stringify(exportsDoc, null, 2)}\n`);
    const variantPlan = planCourseUpdate(temporaryRoot, 'office', 'page-variant');
    assert.equal(variantPlan.applicable, false);
    assert(variantPlan.conflicts.some(item => item.type === 'variant-three-way-review'));
    const variant = variantPlan.changes.find(change => change.occurrenceId === 'office-prompt-page').variant;
    assert(variant.baselineHash && variant.upstreamHash && variant.localHash);

    const composePath = path.join(temporaryRoot, 'courses', 'office', 'course.compose.json');
    const compose = JSON.parse(fs.readFileSync(composePath, 'utf8'));
    compose.recipes.workshop.groups[0].items[0].updatePolicy = 'frozen';
    fs.writeFileSync(composePath, `${JSON.stringify(compose, null, 2)}\n`);
    const workshopInitial = planRecipeLock(temporaryRoot, 'office', 'workshop');
    assert.equal(applyLockPlan(workshopInitial).applied, true);
    const pinnedHash = workshopInitial.lock.references[0].contentHash;
    const unitPath = path.join(temporaryRoot, 'courses', 'prompt-engineering', 'units', 'prompt-basics', 'unit.json');
    const unit = JSON.parse(fs.readFileSync(unitPath, 'utf8'));
    unit.version = '1.1.0';
    fs.writeFileSync(unitPath, `${JSON.stringify(unit, null, 2)}\n`);
    exportsDoc.exports.find(entry => entry.id === 'prompt-engineering:unit:prompt-basics').version = '1.1.0';
    fs.writeFileSync(exportPath, `${JSON.stringify(exportsDoc, null, 2)}\n`);
    const aiPath = path.join(temporaryRoot, 'courses', 'ai-foundations', 'course.exports.json');
    const ai = JSON.parse(fs.readFileSync(aiPath, 'utf8'));
    ai.exports[0].target.version = '1.1.0';
    fs.writeFileSync(aiPath, `${JSON.stringify(ai, null, 2)}\n`);
    const frozenPlan = planCourseUpdate(temporaryRoot, 'office', 'workshop');
    assert.equal(frozenPlan.applicable, true, JSON.stringify(frozenPlan.diagnostics));
    assert.equal(frozenPlan.changes.find(change => change.occurrenceId === 'office-prompt').status, 'available-frozen');
    assert.equal(frozenPlan.proposedLock.references.find(reference => reference.occurrenceId === 'office-prompt').contentHash, pinnedHash);
});

test('maintenance CLI commands expose the same machine-readable domain results', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-maintenance-cli-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    const initial = planRecipeLock(temporaryRoot, 'office', 'workshop');
    assert.equal(applyLockPlan(initial).applied, true);
    assert.equal(materializeRecipe(temporaryRoot, 'office', 'workshop').materialized, true);
    const env = { ...process.env, NEXTCOURSE_HOME: temporaryRoot };
    const cli = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'nextcourse.js'), ...args], {
        cwd: temporaryRoot,
        env,
        encoding: 'utf8',
    });

    const validateRun = cli('validate', 'office', '--json');
    assert.equal(validateRun.status, 0, `${validateRun.stdout}\n${validateRun.stderr}`);
    assert.equal(JSON.parse(validateRun.stdout).valid, true);
    const traceRun = cli('trace', 'office', '1', '--json');
    assert.equal(traceRun.status, 0, `${traceRun.stdout}\n${traceRun.stderr}`);
    assert.equal(JSON.parse(traceRun.stdout).matches[0].pages[0].index, 1);
    const impactRun = cli('impact', 'prompt-engineering:unit:prompt-basics', '--json');
    assert.equal(impactRun.status, 0, `${impactRun.stdout}\n${impactRun.stderr}`);
    assert(JSON.parse(impactRun.stdout).transitive >= 1);
    const workspaceRun = cli('check', '--workspace', '--json');
    assert.equal(workspaceRun.status, 0, `${workspaceRun.stdout}\n${workspaceRun.stderr}`);
    assert.equal(JSON.parse(workspaceRun.stdout).valid, true);
    const syncRun = cli('sync', 'office', '--json');
    assert.equal(syncRun.status, 0, `${syncRun.stdout}\n${syncRun.stderr}`);
    const syncPlan = JSON.parse(syncRun.stdout);
    assert.equal(syncPlan.applicable, true);
    const applyRun = cli('sync', 'office', '--apply', syncPlan.planId, '--json');
    assert.equal(applyRun.status, 0, `${applyRun.stdout}\n${applyRun.stderr}`);
    assert.equal(JSON.parse(applyRun.stdout).applied, true);
});

test('case contracts reject student answers and stale generated material hashes', t => {
    const invalid = json('courses/prompt-engineering/units/prompt-basics/cases/rewrite-request/case.json');
    invalid.materials.find(material => material.id === 'answer').audience = 'both';
    const validation = validateCase(invalid);
    assert.equal(validation.valid, false);
    assert(validation.diagnostics.some(item => item.code === DIAGNOSTIC_CODES.DELIVERY_AUDIENCE_LEAK));

    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-case-hash-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    fs.appendFileSync(
        path.join(temporaryRoot, 'courses', 'prompt-engineering', 'units', 'prompt-basics', 'cases', 'rewrite-request', 'student', 'data', 'sample.json'),
        '\n'
    );
    const plan = planRecipeLock(temporaryRoot, 'office', 'workshop');
    assert.equal(plan.valid, false);
    assert(plan.diagnostics.some(item => item.code === DIAGNOSTIC_CODES.GENERATOR_OUTPUT_INVALID));
});

test('student material cannot reach a facilitator answer through nested links', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-case-leak-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    const briefPath = path.join(temporaryRoot, 'courses', 'prompt-engineering', 'units', 'prompt-basics', 'cases', 'rewrite-request', 'student', 'brief.html');
    fs.appendFileSync(briefPath, '\n<a href="../facilitator/answer.md">答案</a>\n');
    const lockPlan = planRecipeLock(temporaryRoot, 'office', 'workshop');
    assert.equal(lockPlan.valid, true, JSON.stringify(lockPlan.diagnostics));
    assert.equal(applyLockPlan(lockPlan).applied, true);
    const delivery = planDeliveryPackage(temporaryRoot, 'office', 'workshop');
    assert.equal(delivery.valid, false);
    assert(delivery.diagnostics.some(item => item.code === DIAGNOSTIC_CODES.DELIVERY_AUDIENCE_LEAK));
});

test('S plus lab package keeps editable sources and physically separates student answers', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-package-lab-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    const lockPlan = planRecipeLock(temporaryRoot, 'office', 'workshop');
    assert.equal(applyLockPlan(lockPlan).applied, true, JSON.stringify(lockPlan.diagnostics));
    assert.equal(materializeRecipe(temporaryRoot, 'office', 'workshop').materialized, true);

    const deliveryPlan = planDeliveryPackage(temporaryRoot, 'office', 'workshop');
    assert.equal(deliveryPlan.valid, true, JSON.stringify(deliveryPlan.diagnostics));
    assert.equal(deliveryPlan.deliveryProfile, 'slides+lab');
    assert.equal(deliveryPlan.cases.length, 1);
    const packaged = packageComposedCourse(temporaryRoot, ROOT, 'office', 'workshop', { render: true });
    assert.equal(packaged.packaged, true, JSON.stringify(packaged.diagnostics));
    const studentRoot = path.join(packaged.outputRoot, 'student');
    const facilitatorRoot = path.join(packaged.outputRoot, 'facilitator');
    assert(fs.existsSync(path.join(studentRoot, 'html', '2_workbook.html')));
    assert(fs.existsSync(path.join(studentRoot, 'materials', 'prompt-engineering', 'rewrite-request', 'student', 'brief.html')));
    assert(fs.existsSync(path.join(studentRoot, 'materials', 'prompt-engineering', 'rewrite-request', 'student', 'data', 'sample.json')));
    assert(!fs.existsSync(path.join(studentRoot, 'materials', 'prompt-engineering', 'rewrite-request', 'facilitator', 'answer.md')));
    assert(fs.existsSync(path.join(facilitatorRoot, 'materials', 'prompt-engineering', 'rewrite-request', 'facilitator', 'answer.md')));
    assert(fs.existsSync(path.join(facilitatorRoot, 'materials', 'prompt-engineering', 'rewrite-request', 'generate.js')));

    const workbookSource = path.join(packaged.sourceRoot, 'student', '2_workbook.md');
    fs.appendFileSync(workbookSource, '\n人工补充内容。\n');
    const rerun = packageComposedCourse(temporaryRoot, ROOT, 'office', 'workshop', { render: true });
    assert.equal(rerun.packaged, true, JSON.stringify(rerun.diagnostics));
    assert.match(fs.readFileSync(workbookSource, 'utf8'), /人工补充内容/);
    assert.match(fs.readFileSync(path.join(rerun.outputRoot, 'student', 'html', '2_workbook.html'), 'utf8'), /人工补充内容/);

    fs.appendFileSync(path.join(rerun.outputRoot, 'student', 'html', '2_workbook.html'), '\n<!-- hand edit -->\n');
    const drift = packageComposedCourse(temporaryRoot, ROOT, 'office', 'workshop', { render: true });
    assert.equal(drift.packaged, false);
    assert(drift.diagnostics.some(item => item.code === DIAGNOSTIC_CODES.GENERATED_DRIFT));
});

test('full delivery requires and preserves all eight authored package sources', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-package-full-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    const courseDir = path.join(temporaryRoot, 'courses', 'office');
    const composePath = path.join(courseDir, 'course.compose.json');
    const compose = JSON.parse(fs.readFileSync(composePath, 'utf8'));
    compose.recipes.workshop.deliveryProfile = 'full';
    fs.writeFileSync(composePath, `${JSON.stringify(compose, null, 2)}\n`);

    const sourceFiles = [
        'facilitator/1_facilitator-guide.md',
        'student/2_workbook.md',
        'facilitator/3_rubric.md',
        'student/4_action-plan.md',
        'facilitator/5_assessment.md',
        'facilitator/6_facilitation.md',
        'facilitator/7_alignment.md',
        'facilitator/8_content-dev.md',
    ];
    const sourceRoot = path.join(courseDir, 'package-src', 'workshop');
    for (const [index, relativePath] of sourceFiles.entries()) {
        const filePath = path.join(sourceRoot, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `# 人工交付文档 ${index + 1}\n\n保留内容 ${relativePath}\n`);
    }
    const before = new Map(sourceFiles.map(relativePath => [relativePath, fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')]));
    const lockPlan = planRecipeLock(temporaryRoot, 'office', 'workshop');
    assert.equal(applyLockPlan(lockPlan).applied, true, JSON.stringify(lockPlan.diagnostics));
    assert.equal(materializeRecipe(temporaryRoot, 'office', 'workshop').materialized, true);
    const packaged = packageComposedCourse(temporaryRoot, ROOT, 'office', 'workshop', { render: true });
    assert.equal(packaged.packaged, true, JSON.stringify(packaged.diagnostics));
    assert.deepEqual(packaged.writtenSources, []);
    for (const relativePath of sourceFiles) {
        assert.equal(fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8'), before.get(relativePath));
    }
    assert(fs.existsSync(path.join(packaged.outputRoot, 'student', 'html', '4_action-plan.html')));
    assert(fs.existsSync(path.join(packaged.outputRoot, 'facilitator', 'html', '8_content-dev.html')));
});

test('public cases referenced by local units receive their own locked snapshot occurrence', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-local-case-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    const localUnitPath = path.join(temporaryRoot, 'courses', 'office', 'units', 'review', 'unit.json');
    const localUnit = JSON.parse(fs.readFileSync(localUnitPath, 'utf8'));
    localUnit.cases = ['prompt-engineering:case:rewrite-request'];
    fs.writeFileSync(localUnitPath, `${JSON.stringify(localUnit, null, 2)}\n`);
    const plan = planRecipeLock(temporaryRoot, 'office', 'workshop');
    assert.equal(plan.valid, true, JSON.stringify(plan.diagnostics));
    assert(plan.lock.references.some(reference => reference.occurrenceId === 'office-review.case1'));
    assert.equal(applyLockPlan(plan).applied, true);
    const validation = validateRecipe(temporaryRoot, 'office', 'workshop');
    assert.equal(validation.valid, true, JSON.stringify(validation.diagnostics));
    const delivery = planDeliveryPackage(temporaryRoot, 'office', 'workshop');
    assert.equal(delivery.valid, true, JSON.stringify(delivery.diagnostics));
    assert.equal(delivery.cases.length, 1);
});

test('composed package CLI and audience-aware export default to a student-safe bundle', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-package-cli-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(COMPOSITION_WORKSPACE, temporaryRoot, { recursive: true });
    const lockPlan = planRecipeLock(temporaryRoot, 'office', 'workshop');
    assert.equal(applyLockPlan(lockPlan).applied, true);
    const env = { ...process.env, NEXTCOURSE_HOME: temporaryRoot };
    const cli = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'nextcourse.js'), ...args], {
        cwd: temporaryRoot,
        env,
        encoding: 'utf8',
    });
    const packageRun = cli('package', 'office', '--recipe', 'workshop', '--render');
    assert.equal(packageRun.status, 0, `${packageRun.stdout}\n${packageRun.stderr}`);
    const buildRun = cli('build', 'office', '--recipe', 'workshop');
    assert.equal(buildRun.status, 0, `${buildRun.stdout}\n${buildRun.stderr}`);
    const exportRun = cli('export', 'office', '--recipe', 'workshop', '--with-package');
    assert.equal(exportRun.status, 0, `${exportRun.stdout}\n${exportRun.stderr}`);
    const exportRoot = path.join(temporaryRoot, 'courses', 'office', '.build', 'workshop', 'export');
    assert(fs.existsSync(path.join(exportRoot, 'package', 'html', '0_index.html')));
    assert(fs.existsSync(path.join(exportRoot, 'package', 'materials', 'prompt-engineering', 'rewrite-request', 'student', 'data', 'sample.json')));
    assert(!fs.existsSync(path.join(exportRoot, 'package', 'materials', 'prompt-engineering', 'rewrite-request', 'facilitator', 'answer.md')));

    const facilitatorBase = path.join(temporaryRoot, 'facilitator-export');
    const facilitatorRun = cli('export', 'office', facilitatorBase, '--recipe', 'workshop', '--with-package', '--audience', 'facilitator');
    assert.equal(facilitatorRun.status, 0, `${facilitatorRun.stdout}\n${facilitatorRun.stderr}`);
    assert(fs.existsSync(path.join(facilitatorBase, 'office', 'package', 'materials', 'prompt-engineering', 'rewrite-request', 'facilitator', 'answer.md')));
});

test('source baselines are deterministic and exclude generated artifacts', () => {
    const first = captureBaseline(path.join(INDEPENDENT_WORKSPACE, 'courses', 'independent-s'));
    const second = captureBaseline(path.join(INDEPENDENT_WORKSPACE, 'courses', 'independent-s'));
    assert.deepEqual(first, second);
    assert.equal(first.counts.slide, 1);
    assert.equal(first.slides[0].moduleClass, 'module-1');
    assert(!first.files.some(file => file.path === 'deck.html' || file.path === 'handout.md'));
});

test('content fingerprints ignore assembly decoration but preserve teaching content', () => {
    const source = '<section class="module-__MODULE_N__"><h2>同一页</h2><p>正文</p><aside class="notes">讲师备注</aside></section>';
    const assembled = '<!-- copied from source --><section class="module-1"><h2>同一页</h2><p class="animate-fade-up stagger-1">正文</p><aside class="notes">讲师备注</aside></section>';
    const changed = assembled.replace('正文', '不同正文');
    assert.equal(contentFingerprint(source), contentFingerprint(assembled));
    assert.equal(
        contentFingerprint(source),
        contentFingerprint(source.replace('讲师备注', '按本班行业补充一个口头案例'))
    );
    assert.notEqual(contentFingerprint(source), contentFingerprint(changed));
});

test('S, M, and L independent fixtures retain the legacy build and notes paths', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-contract-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(path.join(INDEPENDENT_WORKSPACE, 'courses'), path.join(temporaryRoot, 'courses'), { recursive: true });

    for (const name of ['independent-s', 'independent-m', 'independent-l']) {
        const courseDir = path.join(temporaryRoot, 'courses', name);
        const before = captureBaseline(courseDir).sourceHash;
        for (const command of ['build', 'notes']) {
            const run = spawnSync(process.execPath, [path.join(ROOT, 'nextcourse.js'), command, name], {
                cwd: temporaryRoot,
                env: { ...process.env, NEXTCOURSE_HOME: temporaryRoot },
                encoding: 'utf8',
            });
            assert.equal(run.status, 0, `${command} ${name} failed:\n${run.stdout}\n${run.stderr}`);
        }
        assert(fs.existsSync(path.join(courseDir, 'deck.html')));
        assert(fs.existsSync(path.join(courseDir, 'handout.md')));
        assert.equal(captureBaseline(courseDir).sourceHash, before);
        assert(!fs.existsSync(path.join(courseDir, 'course.compose.json')));
        assert(!fs.existsSync(path.join(courseDir, 'course.lock.json')));
    }
});

test('the legacy S-course package rejection remains unchanged', t => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-package-contract-'));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    fs.cpSync(path.join(INDEPENDENT_WORKSPACE, 'courses'), path.join(temporaryRoot, 'courses'), { recursive: true });
    const run = spawnSync(process.execPath, [path.join(ROOT, 'nextcourse.js'), 'package', 'independent-s'], {
        cwd: temporaryRoot,
        env: { ...process.env, NEXTCOURSE_HOME: temporaryRoot },
        encoding: 'utf8',
    });
    assert.notEqual(run.status, 0);
    assert.match(`${run.stdout}\n${run.stderr}`, /S 档|M\/L/);
});

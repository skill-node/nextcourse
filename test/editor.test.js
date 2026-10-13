'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const FIXTURE = path.join(__dirname, 'fixtures', 'composition-workspace');
const { sha256 } = require('../composition/baseline');
const { planRecipeLock, applyLockPlan } = require('../composition/lock');
const { planDeliveryPackage } = require('../composition/delivery');
const {
    openRecipeDraft,
    applyRecipeDraftOperation,
    undoRecipeDraft,
    saveRecipeDraft,
    listComposeHistory,
    restoreComposeHistory,
    planIndependentComposition,
    createCompositionFromIndependent,
} = require('../composition/editor');

function workspace(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-editor-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.cpSync(FIXTURE, root, { recursive: true });
    return root;
}

function apply(draft, operation) {
    const result = applyRecipeDraftOperation(draft, operation);
    assert.equal(result.applied, true, JSON.stringify(result.diagnostics));
    return result.view;
}

function addPromptSequence(root) {
    const courseDir = path.join(root, 'courses', 'prompt-engineering');
    const sequenceDir = path.join(courseDir, 'sequences');
    fs.mkdirSync(sequenceDir, { recursive: true });
    const sequence = {
        schemaVersion: 1,
        id: 'prompt-engineering:sequence:prompt-module',
        version: '1.0.0',
        title: '提示词完整模块',
        durationMinutes: 30,
        items: [
            { id: 'prompt-core', ref: 'prompt-engineering:unit:prompt-basics', plannedMinutes: 20 },
            { id: 'prompt-recap', ref: 'prompt-engineering:unit:prompt-basics', plannedMinutes: 10 },
        ],
    };
    fs.writeFileSync(path.join(sequenceDir, 'prompt-module.json'), `${JSON.stringify(sequence, null, 2)}\n`);
    const exportsPath = path.join(courseDir, 'course.exports.json');
    const exportsDoc = JSON.parse(fs.readFileSync(exportsPath, 'utf8'));
    exportsDoc.exports.push({
        id: sequence.id,
        kind: 'sequence',
        version: sequence.version,
        title: sequence.title,
        source: 'sequences/prompt-module.json',
    });
    fs.writeFileSync(exportsPath, `${JSON.stringify(exportsDoc, null, 2)}\n`);
    return sequence;
}

test('recipe drafts apply structured composition operations and undo without writing source', t => {
    const root = workspace(t);
    const composePath = path.join(root, 'courses', 'office', 'course.compose.json');
    const before = fs.readFileSync(composePath, 'utf8');
    const opened = openRecipeDraft(root, 'office', 'workshop');
    assert.equal(opened.opened, true, JSON.stringify(opened.diagnostics));
    const draft = opened.draft;

    apply(draft, { type: 'set_recipe', patch: { title: '办公室提示词工作坊', durationMinutes: 55 } });
    apply(draft, { type: 'add_group', group: { id: 'practice', title: '迁移练习', items: [] } });
    apply(draft, {
        type: 'insert_item',
        groupId: 'practice',
        item: {
            id: 'prompt-copy',
            ref: 'prompt-engineering:unit:prompt-basics',
            contentMode: 'reference',
            updatePolicy: 'manual',
            plannedMinutes: 12,
        },
    });
    apply(draft, { type: 'move_item', itemId: 'office-review', groupId: 'practice', index: 0 });
    apply(draft, { type: 'copy_item', itemId: 'prompt-copy', newId: 'prompt-recap', groupId: 'prompt', index: 1 });
    apply(draft, { type: 'set_pages', itemId: 'prompt-copy', pages: { include: ['prompt-engineering:page:prompt-practice'] } });
    apply(draft, { type: 'set_item', itemId: 'prompt-copy', patch: { updatePolicy: 'frozen', outcomeMap: { 'write-clear-prompt': ['LO2'] } } });

    assert.equal(draft.compose.recipes.workshop.title, '办公室提示词工作坊');
    assert.deepEqual(draft.compose.recipes.workshop.groups[1].items.map(item => item.id), ['office-review', 'prompt-copy']);
    assert.equal(draft.compose.recipes.workshop.groups[0].items[1].id, 'prompt-recap');
    assert.equal(draft.dirty, true);
    assert.equal(fs.readFileSync(composePath, 'utf8'), before, 'draft operations must stay in memory');

    const undone = undoRecipeDraft(draft);
    assert.equal(undone.undone, true);
    assert.deepEqual(draft.compose.recipes.workshop.groups[1].items[1].outcomeMap, undefined);
});

test('draft validation rejects malformed operations without changing the draft', t => {
    const root = workspace(t);
    const { draft } = openRecipeDraft(root, 'office', 'workshop');
    const before = JSON.stringify(draft.compose);
    const duplicate = applyRecipeDraftOperation(draft, {
        type: 'copy_item', itemId: 'office-prompt', newId: 'office-review', groupId: 'prompt', index: 0,
    });
    assert.equal(duplicate.applied, false);
    assert.equal(duplicate.diagnostics[0].code, 'NC_COMPOSE_EDIT_OPERATION_INVALID');
    assert.equal(JSON.stringify(draft.compose), before);

    const invalidPolicy = applyRecipeDraftOperation(draft, {
        type: 'set_item', itemId: 'office-prompt', patch: { updatePolicy: 'always' },
    });
    assert.equal(invalidPolicy.applied, false);
    assert(invalidPolicy.diagnostics.some(entry => entry.code === 'NC_COMPOSE_UPDATE_POLICY_INVALID'));
    assert.equal(JSON.stringify(draft.compose), before);
});

test('atomic draft save preserves history and refuses an external edit conflict', t => {
    const root = workspace(t);
    const composePath = path.join(root, 'courses', 'office', 'course.compose.json');
    const opened = openRecipeDraft(root, 'office', 'workshop');
    apply(opened.draft, { type: 'set_recipe', patch: { durationMinutes: 50 } });

    const external = JSON.parse(fs.readFileSync(composePath, 'utf8'));
    external.recipes.workshop.durationMinutes = 48;
    fs.writeFileSync(composePath, `${JSON.stringify(external, null, 2)}\n`);
    const conflict = saveRecipeDraft(opened.draft, opened.view.baselineHash);
    assert.equal(conflict.saved, false);
    assert.equal(conflict.conflict, true);
    assert.equal(JSON.parse(fs.readFileSync(composePath, 'utf8')).recipes.workshop.durationMinutes, 48);

    const reopened = openRecipeDraft(root, 'office', 'workshop');
    const baselineBytes = fs.readFileSync(composePath);
    const baselineHash = sha256(baselineBytes);
    apply(reopened.draft, { type: 'set_recipe', patch: { durationMinutes: 60 } });
    const saved = saveRecipeDraft(reopened.draft, reopened.view.baselineHash);
    assert.equal(saved.saved, true, JSON.stringify(saved.diagnostics));
    assert.equal(saved.unchanged, false);
    assert.equal(JSON.parse(fs.readFileSync(composePath, 'utf8')).recipes.workshop.durationMinutes, 60);
    const historyPath = path.join(root, 'courses', 'office', saved.historyPath);
    assert.equal(sha256(fs.readFileSync(historyPath)), baselineHash);
    assert.equal(reopened.draft.dirty, false);
    assert.equal(reopened.draft.history.length, 0);
});

test('a case override replaces delivery materials without changing the shared unit', t => {
    const root = workspace(t);
    const promptDir = path.join(root, 'courses', 'prompt-engineering');
    const sourceCaseDir = path.join(promptDir, 'units', 'prompt-basics', 'cases', 'rewrite-request');
    const alternateCaseDir = path.join(promptDir, 'units', 'prompt-basics', 'cases', 'alternate-request');
    fs.cpSync(sourceCaseDir, alternateCaseDir, { recursive: true });
    const alternatePath = path.join(alternateCaseDir, 'case.json');
    const alternate = JSON.parse(fs.readFileSync(alternatePath, 'utf8'));
    alternate.id = 'prompt-engineering:case:alternate-request';
    alternate.title = '办公室邮件改写';
    fs.writeFileSync(alternatePath, `${JSON.stringify(alternate, null, 2)}\n`);
    const exportsPath = path.join(promptDir, 'course.exports.json');
    const exportsDoc = JSON.parse(fs.readFileSync(exportsPath, 'utf8'));
    exportsDoc.exports.push({
        id: alternate.id,
        kind: 'case',
        version: alternate.version,
        title: alternate.title,
        source: 'units/prompt-basics/cases/alternate-request/case.json',
    });
    fs.writeFileSync(exportsPath, `${JSON.stringify(exportsDoc, null, 2)}\n`);

    const opened = openRecipeDraft(root, 'office', 'workshop');
    apply(opened.draft, {
        type: 'set_case_override',
        itemId: 'office-prompt',
        from: 'prompt-engineering:case:rewrite-request',
        to: alternate.id,
    });
    assert.equal(saveRecipeDraft(opened.draft, opened.view.baselineHash).saved, true);
    const lockPlan = planRecipeLock(root, 'office', 'workshop');
    assert.equal(lockPlan.valid, true, JSON.stringify(lockPlan.diagnostics));
    const unitReference = lockPlan.lock.references.find(entry => entry.occurrenceId === 'office-prompt');
    assert(!unitReference.cases.includes('prompt-engineering:case:rewrite-request'));
    assert(lockPlan.lock.references.some(entry => entry.occurrenceId === 'office-prompt.case-override1' && entry.ref === alternate.id));
    assert.equal(applyLockPlan(lockPlan).applied, true);
    const delivery = planDeliveryPackage(root, 'office', 'workshop');
    assert.equal(delivery.valid, true, JSON.stringify(delivery.diagnostics));
    assert.deepEqual(delivery.cases.map(record => record.id), [alternate.id]);
});

test('saved composition history can be restored with the same concurrency guard', t => {
    const root = workspace(t);
    const first = openRecipeDraft(root, 'office', 'workshop');
    apply(first.draft, { type: 'set_recipe', patch: { durationMinutes: 70 } });
    const saved = saveRecipeDraft(first.draft, first.view.baselineHash);
    assert.equal(saved.saved, true);
    const history = listComposeHistory(root, 'office');
    assert.equal(history.valid, true);
    assert.equal(history.versions.length, 1);

    const stale = restoreComposeHistory(root, 'office', history.versions[0].id, 'sha256:' + '0'.repeat(64));
    assert.equal(stale.restored, false);
    assert.equal(stale.conflict, true);

    const restored = restoreComposeHistory(root, 'office', history.versions[0].id, history.currentHash);
    assert.equal(restored.restored, true, JSON.stringify(restored.diagnostics));
    const compose = JSON.parse(fs.readFileSync(path.join(root, 'courses', 'office', 'course.compose.json'), 'utf8'));
    assert.equal(compose.recipes.workshop.durationMinutes, 45);
    assert(fs.existsSync(path.join(root, 'courses', 'office', restored.recoveryPath)));
});

test('an independent course converts to a stable baseline composition without rewriting slides', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-convert-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.cpSync(path.join(__dirname, 'fixtures', 'independent-workspace'), root, { recursive: true });
    const courseDir = path.join(root, 'courses', 'independent-m');
    const slidePath = path.join(courseDir, 'slides', 'slide-01.html');
    const before = fs.readFileSync(slidePath);

    const plan = planIndependentComposition(root, 'independent-m');
    assert.equal(plan.valid, true, JSON.stringify(plan.diagnostics));
    assert.equal(plan.pageCount, 1);
    assert.equal(plan.compose.recipes.baseline.groups.length, 1);
    assert.match(plan.compose.recipes.baseline.groups[0].items[0].pagePlan[0], /^independent-m:page:slide-01-[a-f0-9]{10}$/);

    const created = createCompositionFromIndependent(root, 'independent-m');
    assert.equal(created.created, true, JSON.stringify(created.diagnostics));
    assert.deepEqual(fs.readFileSync(slidePath), before);
    const compose = JSON.parse(fs.readFileSync(path.join(courseDir, 'course.compose.json'), 'utf8'));
    const item = compose.recipes.baseline.groups[0].items[0];
    const descriptor = JSON.parse(fs.readFileSync(path.join(courseDir, item.local.path), 'utf8'));
    assert.deepEqual(item.pagePlan, descriptor.pages.map(page => page.id));
    assert.equal(path.resolve(path.dirname(path.join(courseDir, item.local.path)), descriptor.pages[0].path), slidePath);

    const lockPlan = planRecipeLock(root, 'independent-m', 'baseline');
    assert.equal(lockPlan.valid, true, JSON.stringify(lockPlan.diagnostics));
    assert.equal(createCompositionFromIndependent(root, 'independent-m').conflict, true);
});

test('baseline conversion preserves unnumbered opening, interlude and closing pages in source order', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-convert-wrappers-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const dir = path.join(root, 'courses', 'wrapped');
    fs.mkdirSync(path.join(dir, 'slides'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'course.meta.md'), `---
 title: Wrapped course
---
## 课程大纲
### 开场（2 张）
### 模块一：内容（1 张）
### 过渡（1 张）
### 模块二：练习（1 张）
### 收尾（2 张）
`);
    const files = Array.from({ length: 7 }, (_, i) => `slide-0${i + 1}.html`);
    const numbers = [null, null, 1, null, 2, null, null];
    files.forEach((file, i) => fs.writeFileSync(path.join(dir, 'slides', file), `<section${numbers[i] === null ? '' : ` class="module-${numbers[i]}"`}><h2>Page ${i + 1}</h2></section>`));
    function checkPlan() {
        const plan = planIndependentComposition(root, 'wrapped');
        assert.equal(plan.valid, true, JSON.stringify(plan.diagnostics));
        const unit = plan.descriptors[0].value;
        const groups = plan.compose.recipes.baseline.groups;
        assert.deepEqual(unit.pages.map(page => page.path), files.map(file => `slides/${file}`));
        assert.deepEqual(groups.map(group => group.moduleNumber), [null, 1, null, 2, null]);
        assert.equal(new Set(groups.map(group => group.id)).size, groups.length);
        assert.deepEqual(groups.flatMap(group => group.items).flatMap(item => item.pagePlan), unit.pages.map(page => page.id));
        assert.equal(plan.pageCount, unit.pages.length);
        return plan;
    }
    checkPlan();
    // Without a trustworthy declared page count, HTML module classes still
    // preserve separate unnumbered runs instead of collecting them at the front.
    fs.writeFileSync(path.join(dir, 'course.meta.md'), '---\ntitle: Wrapped course\n---\n');
    checkPlan();
    assert.equal(createCompositionFromIndependent(root, 'wrapped').created, true);
    const lock = planRecipeLock(root, 'wrapped', 'baseline');
    assert.equal(lock.valid, true, JSON.stringify(lock.diagnostics));
    assert.equal(applyLockPlan(lock).applied, true);
    const { materializeRecipe } = require('../composition/materialize');
    const built = materializeRecipe(root, 'wrapped', 'baseline');
    assert.equal(built.materialized, true, JSON.stringify(built.diagnostics));
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.build', 'baseline', 'build.manifest.json')));
    assert.equal(manifest.pages.length, files.length);
});

test('page plans make page order explicit and materialization follows it', t => {
    const root = workspace(t);
    const opened = openRecipeDraft(root, 'office', 'workshop');
    const pageIds = ['office:page:prompt-practice', 'prompt-engineering:page:prompt-framework'];
    apply(opened.draft, { type: 'set_page_plan', itemId: 'office-prompt', pagePlan: pageIds });
    apply(opened.draft, {
        type: 'move_page', itemId: 'office-prompt', pageId: pageIds[1], index: 0, availablePages: pageIds,
    });
    assert.deepEqual(opened.draft.compose.recipes.workshop.groups[0].items[0].pagePlan, pageIds.slice().reverse());
    assert.equal(saveRecipeDraft(opened.draft, opened.view.baselineHash).saved, true);
    const lockPlan = planRecipeLock(root, 'office', 'workshop');
    assert.equal(lockPlan.valid, true, JSON.stringify(lockPlan.diagnostics));
    assert.equal(applyLockPlan(lockPlan).applied, true);
    const { materializeRecipe } = require('../composition/materialize');
    const materialized = materializeRecipe(root, 'office', 'workshop');
    assert.equal(materialized.materialized, true, JSON.stringify(materialized.diagnostics));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'courses', 'office', '.build', 'workshop', 'build.manifest.json'), 'utf8'));
    assert.deepEqual(manifest.pages.slice(0, 2).map(page => page.entityId), pageIds.slice().reverse());
});

test('a public sequence expands into one module atomically and remains locked as its source', t => {
    const root = workspace(t);
    const sequence = addPromptSequence(root);
    const opened = openRecipeDraft(root, 'office', 'workshop');
    const result = applyRecipeDraftOperation(opened.draft, {
        type: 'insert_sequence',
        ref: sequence.id,
        version: sequence.version,
        groupId: 'prompt-module',
        index: 1,
    });
    assert.equal(result.applied, true, JSON.stringify(result.diagnostics));
    const group = opened.draft.compose.recipes.workshop.groups[1];
    assert.deepEqual(group.sourceSequence, { ref: sequence.id, version: sequence.version });
    assert.deepEqual(group.items.map(item => item.id), ['prompt-core', 'prompt-recap']);
    assert.deepEqual(group.items.map(item => item.ref), [
        'prompt-engineering:unit:prompt-basics',
        'prompt-engineering:unit:prompt-basics',
    ]);
    assert.equal(saveRecipeDraft(opened.draft, opened.view.baselineHash).saved, true);
    const lockPlan = planRecipeLock(root, 'office', 'workshop');
    assert.equal(lockPlan.valid, true, JSON.stringify(lockPlan.diagnostics));
    assert(lockPlan.lock.references.some(entry => entry.occurrenceId === 'prompt-module.sequence' && entry.ref === sequence.id));
});

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sha256 } = require('./baseline');
const {
    INSTANCE_ID_RE,
    validateComposeManifest,
} = require('./contracts');
const { DIAGNOSTIC_CODES: C, diagnostic } = require('./diagnostics');
const { loadCourse, parseMinutes, mapSlidesToModules } = require('../course-model');
const { buildCatalog } = require('./catalog');
const { resolveExport } = require('./resolver');

function clone(value) {
    return structuredClone(value);
}

function serialize(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

function editError(message, pointer = '/operation', details) {
    return diagnostic(C.EDIT_OPERATION_INVALID, message, pointer, 'error', details);
}

function readCompose(workRoot, courseName) {
    const root = path.resolve(workRoot);
    if (!INSTANCE_ID_RE.test(courseName || '')) {
        return { valid: false, diagnostics: [editError('Course name is not a safe identifier.', '/courseName')] };
    }
    const courseDir = path.join(root, 'courses', courseName);
    const composePath = path.join(courseDir, 'course.compose.json');
    if (!fs.existsSync(composePath)) {
        return { valid: false, diagnostics: [diagnostic(C.REFERENCE_NOT_FOUND, `Composition file not found for ${courseName}.`, `courses/${courseName}/course.compose.json`)] };
    }
    try {
        const bytes = fs.readFileSync(composePath);
        const compose = JSON.parse(bytes.toString('utf8'));
        const validation = validateComposeManifest(compose);
        return {
            valid: validation.valid,
            diagnostics: validation.diagnostics,
            root,
            courseDir,
            composePath,
            bytes,
            hash: sha256(bytes),
            compose,
        };
    } catch (error) {
        return { valid: false, diagnostics: [diagnostic(C.DOCUMENT_INVALID, `Cannot read course.compose.json: ${error.message}`, `courses/${courseName}/course.compose.json`)] };
    }
}

function draftView(draft) {
    const recipe = draft.compose.recipes[draft.recipeId];
    return {
        id: draft.id,
        courseName: draft.courseName,
        courseId: draft.compose.courseId,
        recipeId: draft.recipeId,
        baselineHash: draft.baselineHash,
        revision: draft.revision,
        dirty: draft.dirty,
        canUndo: draft.history.length > 0,
        recipe: clone(recipe),
        diagnostics: clone(draft.diagnostics || []),
    };
}

function openRecipeDraft(workRoot, courseName, recipeId) {
    const read = readCompose(workRoot, courseName);
    if (!read.valid) return { opened: false, diagnostics: read.diagnostics };
    const selectedRecipe = recipeId || read.compose.defaultRecipe;
    if (!INSTANCE_ID_RE.test(selectedRecipe || '') || !read.compose.recipes[selectedRecipe]) {
        return { opened: false, diagnostics: [diagnostic(C.RECIPE_NOT_FOUND, `Recipe not found: ${selectedRecipe}.`, '/recipeId')] };
    }
    const draft = {
        id: crypto.randomUUID(),
        workRoot: read.root,
        courseName,
        courseDir: read.courseDir,
        composePath: read.composePath,
        recipeId: selectedRecipe,
        baselineHash: read.hash,
        baselineCanonical: JSON.stringify(read.compose),
        compose: clone(read.compose),
        revision: 0,
        dirty: false,
        history: [],
        diagnostics: [],
    };
    return { opened: true, draft, view: draftView(draft), diagnostics: [] };
}

function locateGroup(recipe, groupId) {
    const index = recipe.groups.findIndex(group => group.id === groupId);
    return index === -1 ? null : { group: recipe.groups[index], index };
}

function locateItem(recipe, itemId) {
    for (let groupIndex = 0; groupIndex < recipe.groups.length; groupIndex++) {
        const group = recipe.groups[groupIndex];
        const itemIndex = group.items.findIndex(item => item.id === itemId);
        if (itemIndex !== -1) return { group, groupIndex, item: group.items[itemIndex], itemIndex };
    }
    return null;
}

function ensureId(value, label, pointer = '/operation') {
    if (!INSTANCE_ID_RE.test(value || '')) throw editError(`${label} must be a stable lowercase identifier.`, pointer);
}

function integerOrDelete(target, key, value, label) {
    if (value === null || value === undefined || value === '') {
        delete target[key];
        return;
    }
    if (!Number.isInteger(value) || value < 0) throw editError(`${label} must be a non-negative integer.`);
    target[key] = value;
}

function uniqueOccurrence(recipe, id, ignoreId = null) {
    const existing = locateItem(recipe, id);
    if (existing && id !== ignoreId) throw editError(`Occurrence ID already exists: ${id}.`, '/operation/item/id');
}

function uniqueGroup(recipe, id, ignoreId = null) {
    const existing = locateGroup(recipe, id);
    if (existing && id !== ignoreId) throw editError(`Group ID already exists: ${id}.`, '/operation/group/id');
}

function requireGroup(recipe, id) {
    const found = locateGroup(recipe, id);
    if (!found) throw editError(`Group not found: ${id}.`, '/operation/groupId');
    return found;
}

function requireItem(recipe, id) {
    const found = locateItem(recipe, id);
    if (!found) throw editError(`Occurrence not found: ${id}.`, '/operation/itemId');
    return found;
}

function insertAt(array, index, value) {
    const target = index === undefined || index === null ? array.length : index;
    if (!Number.isInteger(target) || target < 0 || target > array.length) throw editError(`Insertion index ${target} is outside the valid range.`);
    array.splice(target, 0, value);
}

function applyOperationToRecipe(recipe, operation) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw editError('Operation must be an object.');
    const type = operation.type;
    if (type === 'set_recipe') {
        const patch = operation.patch || {};
        if ('title' in patch) {
            if (patch.title === null || patch.title === '') delete recipe.title;
            else if (typeof patch.title !== 'string' || !patch.title.trim()) throw editError('Recipe title must be non-empty.');
            else recipe.title = patch.title.trim();
        }
        if ('durationMinutes' in patch) integerOrDelete(recipe, 'durationMinutes', patch.durationMinutes, 'Recipe duration');
        if ('deliveryProfile' in patch) recipe.deliveryProfile = patch.deliveryProfile;
        return;
    }

    if (type === 'add_group') {
        const group = clone(operation.group || {});
        ensureId(group.id, 'Group ID', '/operation/group/id');
        uniqueGroup(recipe, group.id);
        if (!Array.isArray(group.items)) group.items = [];
        insertAt(recipe.groups, operation.index, group);
        return;
    }
    if (type === 'set_group') {
        const found = requireGroup(recipe, operation.groupId);
        const patch = operation.patch || {};
        if ('title' in patch) found.group.title = String(patch.title || '').trim();
        if ('plannedMinutes' in patch) integerOrDelete(found.group, 'plannedMinutes', patch.plannedMinutes, 'Group duration');
        if ('moduleNumber' in patch) {
            if (patch.moduleNumber === undefined || patch.moduleNumber === '') delete found.group.moduleNumber;
            else if (patch.moduleNumber === null) found.group.moduleNumber = null;
            else if (!Number.isInteger(patch.moduleNumber) || patch.moduleNumber < 1) throw editError('Module number must be null or a positive integer.');
            else found.group.moduleNumber = patch.moduleNumber;
        }
        return;
    }
    if (type === 'remove_group') {
        const found = requireGroup(recipe, operation.groupId);
        recipe.groups.splice(found.index, 1);
        return;
    }
    if (type === 'move_group') {
        const found = requireGroup(recipe, operation.groupId);
        const [group] = recipe.groups.splice(found.index, 1);
        insertAt(recipe.groups, operation.index, group);
        return;
    }
    if (type === 'split_group') {
        const found = requireGroup(recipe, operation.groupId);
        const at = operation.at;
        if (!Number.isInteger(at) || at < 0 || at > found.group.items.length) throw editError('Split position is outside the group.');
        const group = clone(operation.group || {});
        ensureId(group.id, 'New group ID', '/operation/group/id');
        uniqueGroup(recipe, group.id);
        group.items = found.group.items.splice(at);
        insertAt(recipe.groups, found.index + 1, group);
        return;
    }
    if (type === 'merge_group') {
        const source = requireGroup(recipe, operation.sourceGroupId);
        const target = requireGroup(recipe, operation.targetGroupId);
        if (source.group.id === target.group.id) throw editError('A group cannot be merged into itself.');
        target.group.items.push(...source.group.items);
        recipe.groups.splice(source.index, 1);
        return;
    }

    if (type === 'insert_item') {
        const target = requireGroup(recipe, operation.groupId).group;
        const item = clone(operation.item || {});
        ensureId(item.id, 'Occurrence ID', '/operation/item/id');
        uniqueOccurrence(recipe, item.id);
        insertAt(target.items, operation.index, item);
        return;
    }
    if (type === 'remove_item') {
        const found = requireItem(recipe, operation.itemId);
        found.group.items.splice(found.itemIndex, 1);
        return;
    }
    if (type === 'copy_item') {
        const found = requireItem(recipe, operation.itemId);
        ensureId(operation.newId, 'New occurrence ID', '/operation/newId');
        uniqueOccurrence(recipe, operation.newId);
        const target = requireGroup(recipe, operation.groupId || found.group.id).group;
        const copied = clone(found.item);
        copied.id = operation.newId;
        insertAt(target.items, operation.index, copied);
        return;
    }
    if (type === 'move_item') {
        const found = requireItem(recipe, operation.itemId);
        const target = requireGroup(recipe, operation.groupId).group;
        const [item] = found.group.items.splice(found.itemIndex, 1);
        insertAt(target.items, operation.index, item);
        return;
    }
    if (type === 'set_item') {
        const found = requireItem(recipe, operation.itemId);
        const patch = operation.patch || {};
        if ('plannedMinutes' in patch) integerOrDelete(found.item, 'plannedMinutes', patch.plannedMinutes, 'Occurrence duration');
        if ('updatePolicy' in patch) found.item.updatePolicy = patch.updatePolicy;
        if ('outcomeMap' in patch) {
            if (patch.outcomeMap === null) delete found.item.outcomeMap;
            else found.item.outcomeMap = clone(patch.outcomeMap);
        }
        return;
    }
    if (type === 'set_pages') {
        const item = requireItem(recipe, operation.itemId).item;
        if (operation.pages === null) delete item.pages;
        else item.pages = clone(operation.pages);
        return;
    }
    if (type === 'set_page_plan') {
        const item = requireItem(recipe, operation.itemId).item;
        if (operation.pagePlan === null) delete item.pagePlan;
        else item.pagePlan = clone(operation.pagePlan);
        return;
    }
    if (type === 'reset_pages') {
        const item = requireItem(recipe, operation.itemId).item;
        delete item.pages;
        delete item.pagePlan;
        return;
    }
    if (type === 'move_page') {
        const item = requireItem(recipe, operation.itemId).item;
        const plan = Array.isArray(item.pagePlan) ? item.pagePlan.slice() : clone(operation.availablePages || []);
        const currentIndex = plan.indexOf(operation.pageId);
        if (currentIndex === -1) throw editError(`Page is not available in the current plan: ${operation.pageId}.`, '/operation/pageId');
        const [pageId] = plan.splice(currentIndex, 1);
        insertAt(plan, operation.index, pageId);
        item.pagePlan = plan;
        return;
    }
    if (type === 'replace_ref') {
        const item = requireItem(recipe, operation.itemId).item;
        item.ref = operation.ref;
        item.contentMode = 'reference';
        delete item.local;
        delete item.variant;
        delete item.pages;
        delete item.operations;
        delete item.caseOverrides;
        return;
    }
    if (type === 'set_case_override') {
        const item = requireItem(recipe, operation.itemId).item;
        if (item.contentMode === 'local' && !item.local) throw editError('Local occurrence is missing its descriptor.');
        const overrides = item.caseOverrides || [];
        const existing = overrides.find(entry => entry.from === operation.from);
        if (existing) existing.to = operation.to;
        else overrides.push({ from: operation.from, to: operation.to });
        item.caseOverrides = overrides;
        return;
    }
    if (type === 'remove_case_override') {
        const item = requireItem(recipe, operation.itemId).item;
        const next = (item.caseOverrides || []).filter(entry => entry.from !== operation.from);
        if (next.length) item.caseOverrides = next;
        else delete item.caseOverrides;
        return;
    }
    throw editError(`Unsupported edit operation: ${type || '(missing)'}.`, '/operation/type');
}

function slug(value, fallback = 'item') {
    const clean = String(value || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '');
    return clean || fallback;
}

function slideModuleNumber(html) {
    const match = String(html).match(/\bmodule-(\d+)\b/i);
    return match ? Number(match[1]) : null;
}

function convertedOutcome(outcome, index) {
    return {
        id: slug(outcome.id || `lo-${index + 1}`, `lo-${index + 1}`),
        do: outcome.do || '完成原课程中的学习任务',
        bloom: ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'].includes(outcome.bloom) ? outcome.bloom : 'understand',
        evidence: outcome.evidence || outcome.success || '原课件中的活动与讲师观察',
    };
}

function planIndependentComposition(workRoot, courseName) {
    const root = path.resolve(workRoot);
    if (!INSTANCE_ID_RE.test(courseName || '')) return { valid: false, diagnostics: [editError('Course name is not a safe identifier.', '/courseName')] };
    const courseDir = path.join(root, 'courses', courseName);
    const composePath = path.join(courseDir, 'course.compose.json');
    if (!fs.existsSync(courseDir)) return { valid: false, diagnostics: [diagnostic(C.REFERENCE_NOT_FOUND, `Course directory not found: ${courseName}.`, `courses/${courseName}`)] };
    if (fs.existsSync(composePath)) return { valid: false, conflict: true, diagnostics: [diagnostic(C.EDIT_CONFLICT, `${courseName} already has a composition file.`, `courses/${courseName}/course.compose.json`)] };
    const course = loadCourse(root, courseName);
    if (!course || !course.slides.length) return { valid: false, diagnostics: [diagnostic(C.REFERENCE_NOT_FOUND, `${courseName} has no slides to convert.`, `courses/${courseName}/slides`)] };

    const declared = mapSlidesToModules(course);
    const buckets = [];
    const usedBucketKeys = new Set();
    function addBucket(number, title, slides) {
        if (!slides.length) return;
        const base = number === null ? 'transition' : `module-${number}`;
        let key = base;
        let suffix = 2;
        while (usedBucketKeys.has(key)) key = `${base}-${suffix++}`;
        usedBucketKeys.add(key);
        const heading = course.headings.find(item => item.no === number);
        const module = course.modules.find(item => item.no === number);
        buckets.push({ key, number, title: title || (module && module.name) || (heading && heading.name) || (number === null ? '过渡页面' : `模块 ${number}`), slides });
    }
    if (declared) {
        // The module map deliberately excludes unnumbered headings. A baseline
        // conversion must instead preserve every heading's slice in source order.
        let cursor = 0;
        for (const heading of course.headings) {
            const count = heading.pages || 0;
            addBucket(heading.no, heading.name, course.slides.slice(cursor, cursor + count));
            cursor += count;
        }
    } else {
        const hasExplicitModules = course.slides.some(slide => slideModuleNumber(slide.html) !== null);
        for (const slide of course.slides) {
            const number = hasExplicitModules ? slideModuleNumber(slide.html) : 1;
            const last = buckets[buckets.length - 1];
            if (last && last.number === number) last.slides.push(slide);
            else addBucket(number, null, [slide]);
        }
    }
    const nonempty = buckets.filter(entry => entry.slides.length);
    const totalMinutes = parseMinutes(course.meta.duration);
    const fallbackPerPage = totalMinutes === null ? 0 : Math.max(1, Math.round(totalMinutes / course.slides.length));
    const usedPageIds = new Set();
    const allPages = [];
    const unitId = `${courseName}:unit:baseline`;
    const descriptorPath = '.nextcourse-baseline.unit.json';
    const groups = nonempty.map((entry, groupIndex) => {
        const localId = slug(entry.key, `module-${groupIndex + 1}`);
        const pages = entry.slides.map(slide => {
            const digest = sha256(Buffer.from(slide.html, 'utf8')).slice('sha256:'.length, 'sha256:'.length + 10);
            const base = `${courseName}:page:${slug(path.basename(slide.file, '.html'))}-${digest}`;
            let id = base;
            let suffix = 2;
            while (usedPageIds.has(id)) id = `${base}-${suffix++}`;
            usedPageIds.add(id);
            return { id, path: `slides/${slide.file}`, estimatedMinutes: fallbackPerPage, role: 'concept' };
        });
        allPages.push(...pages);
        const moduleMinutes = course.modules.find(item => item.no === entry.number)?.minutes;
        const plannedMinutes = moduleMinutes ?? pages.reduce((sum, page) => sum + page.estimatedMinutes, 0);
        return {
            id: localId,
            title: entry.title,
            moduleNumber: entry.number,
            ...(plannedMinutes ? { plannedMinutes } : {}),
            items: [{
                id: `baseline-${localId}`,
                contentMode: 'local',
                updatePolicy: 'frozen',
                local: { id: unitId, path: descriptorPath },
                ...(plannedMinutes ? { plannedMinutes } : {}),
                pagePlan: pages.map(page => page.id),
            }],
        };
    });
    const outcomes = course.outcomes.map(convertedOutcome);
    const descriptors = [{
        relativePath: descriptorPath,
        value: {
            schemaVersion: 1,
            id: unitId,
            version: '1.0.0',
            title: course.title,
            durationMinutes: totalMinutes ?? allPages.reduce((sum, page) => sum + page.estimatedMinutes, 0),
            outcomes: outcomes.length ? outcomes : [{ id: 'baseline', do: '完成原课程中的学习任务', bloom: 'understand', evidence: '原课件中的活动与讲师观察' }],
            pages: allPages,
        },
    }];
    const compose = {
        schemaVersion: 1,
        courseId: courseName,
        defaultRecipe: 'baseline',
        recipes: {
            baseline: {
                selection: 'explicit',
                title: `${course.title} · 基线组合`,
                ...(totalMinutes === null ? {} : { durationMinutes: totalMinutes }),
                deliveryProfile: 'slides',
                groups,
            },
        },
    };
    const validation = validateComposeManifest(compose);
    return { valid: validation.valid, diagnostics: validation.diagnostics, root, courseDir, composePath, compose, descriptors, pageCount: course.slides.length };
}

function createCompositionFromIndependent(workRoot, courseName) {
    const plan = planIndependentComposition(workRoot, courseName);
    if (!plan.valid) return { created: false, conflict: Boolean(plan.conflict), diagnostics: plan.diagnostics };
    const adapterPath = path.join(plan.courseDir, plan.descriptors[0].relativePath);
    if (fs.existsSync(adapterPath)) return { created: false, conflict: true, diagnostics: [diagnostic(C.EDIT_CONFLICT, 'Baseline adapter already exists; inspect it before retrying conversion.', path.relative(plan.root, adapterPath))] };
    try {
        writeAtomic(adapterPath, Buffer.from(serialize(plan.descriptors[0].value), 'utf8'), 0o644);
        writeAtomic(plan.composePath, Buffer.from(serialize(plan.compose), 'utf8'), 0o644);
        return { created: true, courseName, recipeId: 'baseline', pageCount: plan.pageCount, groupCount: plan.compose.recipes.baseline.groups.length, diagnostics: [] };
    } catch (error) {
        if (!fs.existsSync(plan.composePath) && fs.existsSync(adapterPath)) fs.rmSync(adapterPath, { force: true });
        return { created: false, conflict: false, diagnostics: [diagnostic(C.DOCUMENT_INVALID, `Could not create baseline composition: ${error.message}`, `courses/${courseName}`)] };
    }
}

function applySequenceOperation(draft, compose, operation) {
    const recipe = compose.recipes[draft.recipeId];
    ensureId(operation.groupId, 'Group ID', '/operation/groupId');
    uniqueGroup(recipe, operation.groupId);
    const resolution = resolveExport(buildCatalog(draft.workRoot), operation.ref, operation.version || null);
    if (!resolution.resolved || resolution.kind !== 'sequence' || !resolution.descriptor) {
        const details = resolution.diagnostics && resolution.diagnostics.find(item => item.severity === 'error');
        throw editError(details ? details.message : `Reusable sequence not found: ${operation.ref}.`, '/operation/ref');
    }
    const items = [];
    resolution.descriptor.items.forEach((entry, index) => {
        const seed = entry.id || entry.ref.split(':').at(-1) || `item-${index + 1}`;
        let id = slug(seed, `item-${index + 1}`);
        let suffix = 2;
        while (locateItem(recipe, id) || items.slice(0, index).some(item => item.id === id)) id = `${slug(seed, `item-${index + 1}`)}-${suffix++}`;
        items.push({
            id,
            ref: entry.ref,
            contentMode: 'reference',
            updatePolicy: 'manual',
            ...(entry.plannedMinutes === undefined ? {} : { plannedMinutes: entry.plannedMinutes }),
        });
    });
    const group = {
        id: operation.groupId,
        title: String(operation.title || resolution.descriptor.title).trim(),
        ...(operation.moduleNumber === undefined ? {} : { moduleNumber: operation.moduleNumber }),
        ...(resolution.descriptor.durationMinutes === undefined ? {} : { plannedMinutes: resolution.descriptor.durationMinutes }),
        sourceSequence: { ref: resolution.ref, version: resolution.version },
        items,
    };
    insertAt(recipe.groups, operation.index, group);
}

function applyRecipeDraftOperation(draft, operation) {
    const next = clone(draft.compose);
    try {
        if (operation && operation.type === 'insert_sequence') applySequenceOperation(draft, next, operation);
        else applyOperationToRecipe(next.recipes[draft.recipeId], operation);
    } catch (error) {
        const item = error && error.code ? error : editError(error.message || String(error));
        return { applied: false, diagnostics: [item], view: draftView(draft) };
    }
    const validation = validateComposeManifest(next);
    if (!validation.valid) return { applied: false, diagnostics: validation.diagnostics, view: draftView(draft) };
    draft.history.push(clone(draft.compose));
    if (draft.history.length > 100) draft.history.shift();
    draft.compose = next;
    draft.revision++;
    draft.dirty = JSON.stringify(next) !== draft.baselineCanonical;
    draft.diagnostics = validation.diagnostics;
    return { applied: true, diagnostics: validation.diagnostics, view: draftView(draft) };
}

function undoRecipeDraft(draft) {
    const previous = draft.history.pop();
    if (!previous) return { undone: false, diagnostics: [editError('There is no draft operation to undo.')], view: draftView(draft) };
    draft.compose = previous;
    draft.revision++;
    draft.dirty = JSON.stringify(previous) !== draft.baselineCanonical;
    draft.diagnostics = validateComposeManifest(previous).diagnostics;
    return { undone: true, diagnostics: draft.diagnostics, view: draftView(draft) };
}

function writeAtomic(target, bytes, mode) {
    const directory = path.dirname(target);
    const temporary = path.join(directory, `.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.tmp`);
    let fd = null;
    try {
        fd = fs.openSync(temporary, 'wx', mode);
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = null;
        fs.renameSync(temporary, target);
        try {
            const directoryFd = fs.openSync(directory, 'r');
            fs.fsyncSync(directoryFd);
            fs.closeSync(directoryFd);
        } catch { /* Directory fsync is not supported on every platform. */ }
    } catch (error) {
        if (fd !== null) fs.closeSync(fd);
        if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
        throw error;
    }
}

function preserveBaseline(draft, bytes, baselineHash) {
    const historyDir = path.join(draft.courseDir, '.nextcourse', 'history', 'compose');
    fs.mkdirSync(historyDir, { recursive: true });
    const filename = `${baselineHash.slice('sha256:'.length)}.json`;
    const target = path.join(historyDir, filename);
    if (!fs.existsSync(target)) writeAtomic(target, bytes, 0o600);
    return path.relative(draft.courseDir, target).split(path.sep).join('/');
}

function saveRecipeDraft(draft, expectedBaselineHash = draft && draft.baselineHash) {
    if (!draft || expectedBaselineHash !== draft.baselineHash) {
        return { saved: false, conflict: true, diagnostics: [diagnostic(C.EDIT_CONFLICT, 'Draft baseline does not match the requested save baseline.', '/baselineHash')] };
    }
    const current = readCompose(draft.workRoot, draft.courseName);
    if (!current.valid) return { saved: false, conflict: false, diagnostics: current.diagnostics };
    if (current.hash !== draft.baselineHash) {
        return {
            saved: false,
            conflict: true,
            currentHash: current.hash,
            diagnostics: [diagnostic(C.EDIT_CONFLICT, 'course.compose.json changed outside this draft; reload before saving.', 'course.compose.json', 'error', {
                expected: draft.baselineHash,
                actual: current.hash,
            })],
        };
    }
    const validation = validateComposeManifest(draft.compose);
    if (!validation.valid) return { saved: false, conflict: false, diagnostics: validation.diagnostics };
    const bytes = Buffer.from(serialize(draft.compose), 'utf8');
    const nextHash = sha256(bytes);
    if (nextHash === current.hash) {
        draft.dirty = false;
        draft.baselineCanonical = JSON.stringify(draft.compose);
        draft.history = [];
        return { saved: true, unchanged: true, composeHash: nextHash, diagnostics: validation.diagnostics, view: draftView(draft) };
    }
    try {
        const historyPath = preserveBaseline(draft, current.bytes, current.hash);
        const mode = fs.statSync(draft.composePath).mode & 0o777;
        writeAtomic(draft.composePath, bytes, mode);
        draft.baselineHash = nextHash;
        draft.baselineCanonical = JSON.stringify(draft.compose);
        draft.dirty = false;
        draft.history = [];
        draft.revision++;
        return {
            saved: true,
            unchanged: false,
            composeHash: nextHash,
            previousHash: current.hash,
            historyPath,
            diagnostics: validation.diagnostics,
            view: draftView(draft),
        };
    } catch (error) {
        return { saved: false, conflict: false, diagnostics: [diagnostic(C.DOCUMENT_INVALID, `Could not save composition atomically: ${error.message}`, 'course.compose.json')] };
    }
}

function listComposeHistory(workRoot, courseName) {
    const read = readCompose(workRoot, courseName);
    if (!read.valid) return { valid: false, diagnostics: read.diagnostics, versions: [] };
    const historyDir = path.join(read.courseDir, '.nextcourse', 'history', 'compose');
    if (!fs.existsSync(historyDir)) return { valid: true, diagnostics: [], currentHash: read.hash, versions: [] };
    const versions = fs.readdirSync(historyDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && /^[a-f0-9]{64}\.json$/.test(entry.name))
        .map(entry => {
            const filePath = path.join(historyDir, entry.name);
            const stats = fs.statSync(filePath);
            return {
                id: entry.name.slice(0, -'.json'.length),
                composeHash: `sha256:${entry.name.slice(0, -'.json'.length)}`,
                savedAt: stats.mtime.toISOString(),
                path: path.relative(read.courseDir, filePath).split(path.sep).join('/'),
            };
        })
        .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
    return { valid: true, diagnostics: [], currentHash: read.hash, versions };
}

function restoreComposeHistory(workRoot, courseName, historyId, expectedCurrentHash) {
    const current = readCompose(workRoot, courseName);
    if (!current.valid) return { restored: false, conflict: false, diagnostics: current.diagnostics };
    if (current.hash !== expectedCurrentHash) {
        return {
            restored: false,
            conflict: true,
            currentHash: current.hash,
            diagnostics: [diagnostic(C.EDIT_CONFLICT, 'course.compose.json changed before history could be restored.', 'course.compose.json')],
        };
    }
    if (!/^[a-f0-9]{64}$/.test(historyId || '')) {
        return { restored: false, conflict: false, diagnostics: [editError('History ID is invalid.', '/historyId')] };
    }
    const historyPath = path.join(current.courseDir, '.nextcourse', 'history', 'compose', `${historyId}.json`);
    if (!fs.existsSync(historyPath)) {
        return { restored: false, conflict: false, diagnostics: [diagnostic(C.REFERENCE_NOT_FOUND, 'Saved composition version was not found.', historyPath)] };
    }
    try {
        const bytes = fs.readFileSync(historyPath);
        if (sha256(bytes) !== `sha256:${historyId}`) {
            return { restored: false, conflict: false, diagnostics: [diagnostic(C.HASH_INVALID, 'Saved composition version does not match its content hash.', historyPath)] };
        }
        const compose = JSON.parse(bytes.toString('utf8'));
        const validation = validateComposeManifest(compose);
        if (!validation.valid) return { restored: false, conflict: false, diagnostics: validation.diagnostics };
        const holder = { courseDir: current.courseDir };
        const recoveryPath = preserveBaseline(holder, current.bytes, current.hash);
        const mode = fs.statSync(current.composePath).mode & 0o777;
        writeAtomic(current.composePath, bytes, mode);
        return {
            restored: true,
            composeHash: `sha256:${historyId}`,
            previousHash: current.hash,
            recoveryPath,
            diagnostics: validation.diagnostics,
        };
    } catch (error) {
        return { restored: false, conflict: false, diagnostics: [diagnostic(C.DOCUMENT_INVALID, `Could not restore composition atomically: ${error.message}`, historyPath)] };
    }
}

module.exports = {
    planIndependentComposition,
    createCompositionFromIndependent,
    openRecipeDraft,
    draftView,
    applyRecipeDraftOperation,
    undoRecipeDraft,
    saveRecipeDraft,
    listComposeHistory,
    restoreComposeHistory,
};

'use strict';

const fs = require('fs');
const path = require('path');
const { sha256 } = require('./baseline');
const { buildCatalog } = require('./catalog');
const { validateComposeManifest, validateLockManifest, validateUnit } = require('./contracts');
const { DIAGNOSTIC_CODES: C, diagnostic } = require('./diagnostics');
const { planRecipeLock, applyLockPlan, loadSnapshot } = require('./lock');
const { resolveInside, resolveExport } = require('./resolver');
const { verifyGeneratedView } = require('./materialize');
const { planDeliveryPackage } = require('./delivery');

function readJson(filePath, diagnostics, displayPath, required = true) {
    if (!fs.existsSync(filePath)) {
        if (required) diagnostics.push(diagnostic(C.REFERENCE_NOT_FOUND, `File not found: ${displayPath}.`, displayPath));
        return null;
    }
    try {
        const bytes = fs.readFileSync(filePath);
        return { value: JSON.parse(bytes.toString('utf8')), bytes, hash: sha256(bytes), path: filePath };
    } catch (error) {
        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `Cannot read JSON: ${error.message}`, displayPath));
        return null;
    }
}

function selectedRecipe(compose, recipeId, diagnostics) {
    const id = recipeId || compose.defaultRecipe;
    const recipe = compose.recipes && compose.recipes[id];
    if (!recipe) diagnostics.push(diagnostic(C.RECIPE_NOT_FOUND, `Recipe not found: ${id}.`, '/recipeId'));
    return { id, recipe };
}

function recipeOccurrences(recipe) {
    const occurrences = new Map();
    for (const group of (recipe && recipe.groups) || []) {
        for (const item of group.items || []) {
            occurrences.set(item.id, { item, group, operation: null });
            for (let index = 0; index < (item.operations || []).length; index++) {
                const operation = item.operations[index];
                if (operation.with && operation.with.ref) {
                    occurrences.set(`${item.id}.op${index + 1}`, { item, group, operation });
                }
            }
        }
    }
    return occurrences;
}

function occurrenceContext(occurrences, occurrenceId) {
    if (occurrences.has(occurrenceId)) return occurrences.get(occurrenceId);
    const derived = String(occurrenceId).match(/^(.*)\.(?:asset|case)\d+$/);
    return derived ? occurrences.get(derived[1]) || null : null;
}

function snapshotJson(coursesRoot, reference, diagnostics) {
    const snapshot = loadSnapshot(coursesRoot, reference);
    diagnostics.push(...snapshot.diagnostics);
    if (!snapshot.valid) return null;
    const file = snapshot.manifest.files.find(entry => `${entry.courseId}/${entry.path}` === reference.sourcePath);
    if (!file) {
        diagnostics.push(diagnostic(C.SNAPSHOT_MISSING, `Snapshot does not contain ${reference.sourcePath}.`, reference.sourcePath));
        return null;
    }
    const filePath = resolveInside(snapshot.dir, file.storedPath);
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `Cannot parse locked source: ${error.message}`, reference.sourcePath));
        return null;
    }
}

function instructionalDiagnostics(courseDir, coursesRoot, recipe, lock, diagnostics) {
    const locked = new Map(lock.references.map(reference => [reference.occurrenceId, reference]));
    const priorOutcomes = new Set();
    let estimatedMinutes = 0;

    for (const group of recipe.groups || []) {
        for (const item of group.items || []) {
            let unit = null;
            if (item.contentMode === 'local' && item.local && item.local.id.includes(':unit:')) {
                const filePath = resolveInside(courseDir, item.local.path);
                if (filePath && fs.existsSync(filePath)) {
                    try { unit = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
                    catch (error) { diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `Cannot parse local unit: ${error.message}`, item.local.path)); }
                }
            } else {
                const reference = locked.get(item.id);
                if (reference && reference.ref.includes(':unit:')) unit = snapshotJson(coursesRoot, reference, diagnostics);
            }
            if (!unit) {
                if (Number.isInteger(item.plannedMinutes)) estimatedMinutes += item.plannedMinutes;
                continue;
            }
            const validation = validateUnit(unit);
            diagnostics.push(...validation.diagnostics.map(entry => ({ ...entry, occurrenceId: item.id })));
            if (!validation.valid) continue;

            for (const prerequisite of unit.prerequisites || []) {
                if (prerequisite.required !== false && !priorOutcomes.has(prerequisite.capability)) {
                    diagnostics.push(diagnostic(
                        C.PREREQUISITE_MISSING,
                        `Required capability is not supplied earlier in this recipe: ${prerequisite.capability}.`,
                        `/items/${item.id}/prerequisites`,
                        'warning',
                        { occurrenceId: item.id, capability: prerequisite.capability }
                    ));
                }
            }

            let pages = unit.pages.slice();
            if (item.pages && Array.isArray(item.pages.include)) {
                const included = new Set(item.pages.include);
                pages = pages.filter(page => included.has(page.id));
            }
            if (item.pages && Array.isArray(item.pages.omit)) {
                const omitted = new Set(item.pages.omit);
                pages = pages.filter(page => !omitted.has(page.id));
            }
            const evidenceRoles = new Set(['practice', 'assessment']);
            if (unit.outcomes.length && !pages.some(page => evidenceRoles.has(page.role))) {
                diagnostics.push(diagnostic(
                    C.OUTCOME_EVIDENCE_MISSING,
                    `Selected pages for ${item.id} contain no practice or assessment evidence.`,
                    `/items/${item.id}/pages`,
                    'warning',
                    { occurrenceId: item.id, outcomes: unit.outcomes.map(outcome => outcome.id) }
                ));
            }
            estimatedMinutes += Number.isInteger(item.plannedMinutes)
                ? item.plannedMinutes
                : pages.reduce((sum, page) => sum + page.estimatedMinutes, 0);
            for (const outcome of unit.outcomes) priorOutcomes.add(outcome.id);
        }
    }

    if (Number.isInteger(recipe.durationMinutes) && estimatedMinutes > recipe.durationMinutes) {
        diagnostics.push(diagnostic(
            C.DURATION_OVER_BUDGET,
            `Recipe is ${estimatedMinutes - recipe.durationMinutes} minutes over budget; content was not trimmed.`,
            '/durationMinutes',
            'warning',
            { budgetMinutes: recipe.durationMinutes, estimatedMinutes, deltaMinutes: estimatedMinutes - recipe.durationMinutes }
        ));
    }
    return estimatedMinutes;
}

/** Pure validation for a composed course. It never materializes or writes reports. */
function validateRecipe(workRoot, courseName, recipeId) {
    const root = path.resolve(workRoot);
    const coursesRoot = path.join(root, 'courses');
    const courseDir = path.join(coursesRoot, courseName);
    const diagnostics = [];
    const composeRead = readJson(path.join(courseDir, 'course.compose.json'), diagnostics, `courses/${courseName}/course.compose.json`);
    const lockRead = readJson(path.join(courseDir, 'course.lock.json'), diagnostics, `courses/${courseName}/course.lock.json`);
    if (!composeRead || !lockRead) return { valid: false, kind: 'composed', courseName, diagnostics };

    const composeValidation = validateComposeManifest(composeRead.value);
    const lockValidation = validateLockManifest(lockRead.value);
    diagnostics.push(...composeValidation.diagnostics, ...lockValidation.diagnostics);
    const selected = selectedRecipe(composeRead.value, recipeId, diagnostics);
    const lock = lockRead.value;
    if (lock.courseId !== composeRead.value.courseId) {
        diagnostics.push(diagnostic(C.COURSE_ID_INVALID, 'Lock and compose courseId values differ.', '/courseId'));
    }
    if (selected.recipe && lock.recipeId !== selected.id) {
        diagnostics.push(diagnostic(C.RECIPE_NOT_FOUND, `Lock is for ${lock.recipeId}; requested ${selected.id}.`, '/recipeId'));
    }
    if (lock.composeHash !== composeRead.hash) {
        diagnostics.push(diagnostic(C.SOURCE_DRIFT, 'course.compose.json changed after this lock was created.', 'course.compose.json'));
    }

    const expected = recipeOccurrences(selected.recipe);
    const actual = new Map((lock.references || []).map(reference => [reference.occurrenceId, reference]));
    for (const [occurrenceId, context] of expected) {
        if (context.item.contentMode !== 'local' || context.operation) {
            if (!actual.has(occurrenceId)) diagnostics.push(diagnostic(C.LOCK_REFERENCE_INVALID, `Lock is missing ${occurrenceId}.`, `/references/${occurrenceId}`));
        }
    }
    for (const reference of lock.references || []) {
        if (!occurrenceContext(expected, reference.occurrenceId)) {
            diagnostics.push(diagnostic(C.LOCK_REFERENCE_INVALID, `Lock contains stale occurrence ${reference.occurrenceId}.`, `/references/${reference.occurrenceId}`));
        }
        const snapshot = loadSnapshot(coursesRoot, reference);
        diagnostics.push(...snapshot.diagnostics.map(entry => ({ ...entry, occurrenceId: reference.occurrenceId })));
    }

    let estimatedMinutes = 0;
    let delivery = null;
    if (selected.recipe && composeValidation.valid && lockValidation.valid) {
        estimatedMinutes = instructionalDiagnostics(courseDir, coursesRoot, selected.recipe, lock, diagnostics);
        if (['slides+lab', 'full'].includes(selected.recipe.deliveryProfile)) {
            const deliveryPlan = planDeliveryPackage(root, courseName, selected.id);
            diagnostics.push(...deliveryPlan.diagnostics.map(entry => ({ ...entry, domain: 'delivery' })));
            delivery = {
                valid: deliveryPlan.valid,
                profile: deliveryPlan.deliveryProfile,
                cases: deliveryPlan.cases.map(record => ({ id: record.id, version: record.version })),
            };
        }
    }

    const outputDir = path.join(courseDir, '.build', selected.id || '');
    let generated = { present: fs.existsSync(outputDir), clean: null };
    if (generated.present) {
        const drift = verifyGeneratedView(outputDir);
        let reason = drift.reason || null;
        if (drift.clean) {
            const manifest = readBuildManifest(courseDir, selected.id);
            if (!manifest || manifest.composeHash !== lock.composeHash || manifest.sourceManifestHash !== lock.sourceManifestHash) {
                reason = 'generated view was built from a different lock baseline';
            }
        }
        generated = { present: true, clean: drift.clean && !reason, reason };
        if (!generated.clean) diagnostics.push(diagnostic(C.GENERATED_DRIFT, reason, path.relative(root, outputDir).split(path.sep).join('/')));
    }
    return {
        valid: diagnostics.every(entry => entry.severity !== 'error'),
        kind: 'composed',
        courseName,
        courseId: composeRead.value.courseId,
        recipeId: selected.id,
        estimatedMinutes,
        generated,
        delivery,
        diagnostics,
    };
}

/** Pure workspace validation. Independent courses are listed but left to legacy check. */
function validateWorkspace(workRoot) {
    const catalog = buildCatalog(workRoot);
    const diagnostics = [...catalog.diagnostics];
    const courses = [];
    for (const course of catalog.courses) {
        const composePath = path.join(course.dir, 'course.compose.json');
        if (!fs.existsSync(composePath)) {
            courses.push({ courseName: course.directoryName, kind: 'independent', valid: true, diagnostics: [] });
            continue;
        }
        const result = validateRecipe(workRoot, course.directoryName);
        courses.push(result);
        diagnostics.push(...result.diagnostics.map(entry => ({ ...entry, course: course.directoryName })));
    }
    return { valid: diagnostics.every(entry => entry.severity !== 'error'), courses, diagnostics };
}

function readBuildManifest(courseDir, recipeId) {
    const filePath = path.join(courseDir, '.build', recipeId, 'build.manifest.json');
    if (!fs.existsSync(filePath)) return null;
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch { return null; }
}

/** Resolve an occurrence, stable entity ID, or current page number to its full provenance. */
function traceSource(workRoot, courseName, query, recipeId) {
    const root = path.resolve(workRoot);
    const courseDir = path.join(root, 'courses', courseName);
    const diagnostics = [];
    const composeRead = readJson(path.join(courseDir, 'course.compose.json'), diagnostics, `courses/${courseName}/course.compose.json`);
    const lockRead = readJson(path.join(courseDir, 'course.lock.json'), diagnostics, `courses/${courseName}/course.lock.json`);
    if (!composeRead || !lockRead) return { found: false, courseName, query, matches: [], diagnostics };
    const selected = selectedRecipe(composeRead.value, recipeId, diagnostics);
    const manifest = readBuildManifest(courseDir, selected.id);
    const occurrenceMap = recipeOccurrences(selected.recipe);
    const requestedPage = /^\d+$/.test(String(query)) ? Number(query) : null;
    const matches = [];

    for (const reference of lockRead.value.references || []) {
        const pages = manifest ? manifest.pages.filter(page => page.occurrenceId === reference.occurrenceId) : [];
        const pageHit = requestedPage !== null && pages.some(page => page.index === requestedPage);
        const entityHit = reference.ref === query || (reference.exportPath || []).includes(query)
            || (reference.dependencyPath || []).includes(query) || pages.some(page => page.entityId === query || page.ref === query);
        if (reference.occurrenceId !== query && !pageHit && !entityHit) continue;
        const context = occurrenceContext(occurrenceMap, reference.occurrenceId);
        matches.push({
            occurrenceId: reference.occurrenceId,
            contentMode: context ? context.item.contentMode : null,
            updatePolicy: context ? context.item.updatePolicy : null,
            requestedRef: reference.exportPath && reference.exportPath[0],
            resolvedRef: reference.ref,
            version: reference.version,
            contentHash: reference.contentHash,
            snapshotPath: reference.snapshotPath,
            exportPath: reference.exportPath,
            dependencyPath: reference.dependencyPath,
            pages: pages.map(page => ({ index: page.index, entityId: page.entityId, output: page.output, sourcePath: page.sourcePath })),
            variant: context && context.item.variant ? { ...context.item.variant } : null,
        });
    }

    if (manifest) {
        for (const page of manifest.pages) {
            if (page.contentMode === 'reference') continue;
            if (page.occurrenceId !== query && page.entityId !== query && page.index !== requestedPage) continue;
            const context = occurrenceMap.get(page.occurrenceId);
            matches.push({
                occurrenceId: page.occurrenceId,
                contentMode: page.contentMode,
                updatePolicy: context ? context.item.updatePolicy : null,
                requestedRef: page.ref,
                resolvedRef: page.ref,
                version: page.version,
                contentHash: page.sourceHash,
                snapshotPath: null,
                exportPath: [],
                dependencyPath: [],
                pages: [{ index: page.index, entityId: page.entityId, output: page.output, sourcePath: page.sourcePath }],
                variant: context && context.item.variant ? { ...context.item.variant } : null,
            });
        }
    }
    return { found: matches.length > 0, courseName, courseId: composeRead.value.courseId, recipeId: selected.id, query, matches, diagnostics };
}

/** Find direct and transitive consumers of a public entity across every course and recipe. */
function impactSource(workRoot, sourceId) {
    const root = path.resolve(workRoot);
    const coursesRoot = path.join(root, 'courses');
    const diagnostics = [];
    const impacts = [];
    if (!fs.existsSync(coursesRoot)) return { sourceId, impacts, diagnostics, valid: true };
    const directories = fs.readdirSync(coursesRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name, 'en'));
    const catalog = buildCatalog(root);
    diagnostics.push(...catalog.diagnostics);
    for (const directory of directories) {
        const courseDir = path.join(coursesRoot, directory.name);
        const composeRead = readJson(path.join(courseDir, 'course.compose.json'), diagnostics, `courses/${directory.name}/course.compose.json`, false);
        const lockRead = readJson(path.join(courseDir, 'course.lock.json'), diagnostics, `courses/${directory.name}/course.lock.json`, false);
        if (!composeRead) continue;
        for (const [recipeId, recipe] of Object.entries(composeRead.value.recipes || {})) {
            const occurrences = recipeOccurrences(recipe);
            let references;
            let locked;
            if (lockRead && lockRead.value.recipeId === recipeId) {
                references = lockRead.value.references || [];
                locked = true;
            } else {
                references = [];
                locked = false;
                for (const [occurrenceId, context] of occurrences) {
                    const requestedRef = context.operation ? context.operation.with.ref : context.item.ref;
                    if (!requestedRef || (!context.operation && context.item.contentMode === 'local')) continue;
                    const itemDiagnostics = [];
                    const resolution = resolveExport(catalog, requestedRef, null, { diagnostics: itemDiagnostics });
                    if (!resolution.resolved) {
                        if (requestedRef === sourceId) diagnostics.push(...itemDiagnostics.map(entry => ({ ...entry, course: directory.name, recipeId, occurrenceId })));
                        continue;
                    }
                    references.push({
                        occurrenceId,
                        ref: resolution.ref,
                        version: resolution.version,
                        contentHash: resolution.contentHash,
                        exportPath: resolution.exportPath,
                        dependencyPath: resolution.dependencyPath,
                    });
                }
            }
            for (const reference of references) {
                const pathIndex = (reference.exportPath || []).indexOf(sourceId);
                const dependencyIndex = (reference.dependencyPath || []).indexOf(sourceId);
                if (reference.ref !== sourceId && pathIndex === -1 && dependencyIndex === -1) continue;
                const context = occurrenceContext(occurrences, reference.occurrenceId);
                const requestedRef = reference.exportPath && reference.exportPath[0];
                impacts.push({
                    courseName: directory.name,
                    courseId: composeRead.value.courseId,
                    recipeId,
                    occurrenceId: reference.occurrenceId,
                    relation: requestedRef === sourceId ? 'direct' : 'transitive',
                    requestedRef,
                    resolvedRef: reference.ref,
                    version: reference.version,
                    contentHash: reference.contentHash,
                    updatePolicy: context ? context.item.updatePolicy : null,
                    frozen: Boolean(context && context.item.updatePolicy === 'frozen'),
                    locked,
                    exportPath: reference.exportPath,
                });
            }
        }
    }
    impacts.sort((a, b) => `${a.courseName}\0${a.recipeId}\0${a.occurrenceId}`.localeCompare(`${b.courseName}\0${b.recipeId}\0${b.occurrenceId}`, 'en'));
    return {
        sourceId,
        valid: diagnostics.every(entry => entry.severity !== 'error'),
        direct: impacts.filter(item => item.relation === 'direct').length,
        transitive: impacts.filter(item => item.relation === 'transitive').length,
        impacts,
        diagnostics,
    };
}

function referenceDiff(oldReference, candidateReference, oldSnapshot, candidateSnapshot) {
    const oldFiles = new Map((oldSnapshot && oldSnapshot.manifest.files || []).map(file => [`${file.courseId}/${file.path}`, file.hash]));
    const newFiles = new Map((candidateSnapshot && candidateSnapshot.files || []).map(file => [`${file.courseId}/${file.path}`, file.hash]));
    const files = [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort().map(file => ({
        path: file,
        status: !oldFiles.has(file) ? 'added' : !newFiles.has(file) ? 'removed' : oldFiles.get(file) === newFiles.get(file) ? 'unchanged' : 'changed',
        oldHash: oldFiles.get(file) || null,
        newHash: newFiles.get(file) || null,
    })).filter(file => file.status !== 'unchanged');
    return {
        from: oldReference ? { ref: oldReference.ref, version: oldReference.version, contentHash: oldReference.contentHash } : null,
        to: candidateReference ? { ref: candidateReference.ref, version: candidateReference.version, contentHash: candidateReference.contentHash } : null,
        files,
    };
}

/** Create a deterministic, no-write update plan against the current lock baseline. */
function planCourseUpdate(workRoot, courseName, recipeId) {
    const root = path.resolve(workRoot);
    const courseDir = path.join(root, 'courses', courseName);
    const coursesRoot = path.join(root, 'courses');
    const diagnostics = [];
    const composeRead = readJson(path.join(courseDir, 'course.compose.json'), diagnostics, `courses/${courseName}/course.compose.json`);
    if (!composeRead) return { valid: false, applicable: false, courseName, diagnostics, changes: [], conflicts: [] };
    const selected = selectedRecipe(composeRead.value, recipeId, diagnostics);
    const lockPath = path.join(courseDir, 'course.lock.json');
    const lockRead = readJson(lockPath, diagnostics, `courses/${courseName}/course.lock.json`, false);
    if (lockRead) diagnostics.push(...validateLockManifest(lockRead.value).diagnostics);
    const candidate = planRecipeLock(root, courseName, selected.id);
    diagnostics.push(...candidate.diagnostics);
    if (!candidate.lock) return { valid: false, applicable: false, courseName, recipeId: selected.id, diagnostics, changes: [], conflicts: [] };

    const policies = recipeOccurrences(selected.recipe);
    const oldByOccurrence = new Map(((lockRead && lockRead.value.references) || []).map(reference => [reference.occurrenceId, reference]));
    const candidateByOccurrence = new Map(candidate.lock.references.map(reference => [reference.occurrenceId, reference]));
    const candidateSnapshots = new Map(candidate.snapshots.map(snapshot => [snapshot.contentHash, snapshot]));
    const targetReferences = [];
    const changes = [];
    const conflicts = [];
    const occurrenceIds = [...new Set([...oldByOccurrence.keys(), ...candidateByOccurrence.keys()])].sort();

    for (const occurrenceId of occurrenceIds) {
        const oldReference = oldByOccurrence.get(occurrenceId) || null;
        const candidateReference = candidateByOccurrence.get(occurrenceId) || null;
        const context = occurrenceContext(policies, occurrenceId);
        const frozen = Boolean(context && context.item.updatePolicy === 'frozen');
        const changed = !oldReference || !candidateReference
            || oldReference.ref !== candidateReference.ref
            || oldReference.version !== candidateReference.version
            || oldReference.contentHash !== candidateReference.contentHash
            || JSON.stringify(oldReference.exportPath) !== JSON.stringify(candidateReference.exportPath);
        let oldSnapshot = null;
        if (oldReference) {
            const loaded = loadSnapshot(coursesRoot, oldReference);
            if (loaded.valid) oldSnapshot = loaded;
            else diagnostics.push(...loaded.diagnostics.map(entry => ({ ...entry, occurrenceId })));
        }
        const candidateSnapshot = candidateReference && candidateSnapshots.get(candidateReference.contentHash);
        let status = !oldReference ? 'added' : !candidateReference ? 'removed' : changed ? 'update' : 'unchanged';
        let conflict = null;
        if (changed && oldReference && candidateReference && oldReference.version === candidateReference.version
            && oldReference.contentHash !== candidateReference.contentHash && !frozen) {
            conflict = 'version-not-bumped';
        }
        if (changed && context && context.item.contentMode === 'variant' && !frozen) conflict = 'variant-three-way-review';
        if (changed && frozen) status = 'available-frozen';
        if (conflict) conflicts.push({ occurrenceId, type: conflict, baseline: oldReference && oldReference.contentHash, candidate: candidateReference && candidateReference.contentHash });
        if (candidateReference || oldReference) {
            changes.push({
                occurrenceId,
                status,
                frozen,
                conflict,
                requestedRef: (candidateReference || oldReference).exportPath[0],
                exportPath: (candidateReference || oldReference).exportPath,
                diff: referenceDiff(oldReference, candidateReference, oldSnapshot, candidateSnapshot),
                variant: context && context.item.variant ? {
                    path: context.item.variant.path,
                    baselineHash: context.item.variant.baselineHash,
                    upstreamHash: candidateReference && candidateReference.contentHash,
                    localHash: (() => {
                        const localPath = resolveInside(courseDir, context.item.variant.path);
                        return localPath && fs.existsSync(localPath) ? sha256(fs.readFileSync(localPath)) : null;
                    })(),
                } : null,
            });
        }
        if (frozen && oldReference) targetReferences.push(oldReference);
        else if (candidateReference) targetReferences.push(candidateReference);
    }

    const targetLock = { ...candidate.lock, references: targetReferences };
    const usedHashes = new Set(targetReferences.map(reference => reference.contentHash));
    const targetSnapshots = candidate.snapshots.filter(snapshot => usedHashes.has(snapshot.contentHash));
    const inputs = candidate.inputs.slice();
    if (lockRead) inputs.push({ path: lockPath, workspacePath: `courses/${courseName}/course.lock.json`, hash: lockRead.hash });
    const baselineLockHash = lockRead ? lockRead.hash : null;
    const identity = {
        courseName,
        recipeId: selected.id,
        baselineLockHash,
        candidatePlanId: candidate.planId,
        inputBaseline: inputs.map(input => ({ path: input.workspacePath, hash: input.hash }))
            .sort((a, b) => a.path.localeCompare(b.path, 'en')),
        targetLock,
        conflicts,
    };
    const planId = sha256(Buffer.from(JSON.stringify(identity), 'utf8'));
    const valid = candidate.valid && diagnostics.every(entry => entry.severity !== 'error');
    const applicable = valid && conflicts.length === 0;
    return {
        valid,
        applicable,
        planId,
        baselineLockHash,
        courseName,
        recipeId: selected.id,
        changes,
        conflicts,
        diagnostics,
        proposedLock: targetLock,
        inputs,
        applyPlan: {
            ...candidate,
            valid: applicable,
            lock: applicable ? targetLock : null,
            snapshots: targetSnapshots,
            inputs,
        },
    };
}

function applyCourseUpdate(plan, expectedPlanId = plan && plan.planId) {
    const diagnostics = [...((plan && plan.diagnostics) || [])];
    if (!plan || !expectedPlanId || expectedPlanId !== plan.planId) {
        diagnostics.push(diagnostic(C.PLAN_STALE, 'Update plan ID does not match the current plan.', '/planId'));
        return { applied: false, diagnostics };
    }
    if (!plan.applicable || !plan.applyPlan) return { applied: false, diagnostics, conflicts: plan.conflicts || [] };
    return applyLockPlan(plan.applyPlan);
}

module.exports = {
    validateRecipe,
    validateWorkspace,
    traceSource,
    impactSource,
    planCourseUpdate,
    applyCourseUpdate,
};

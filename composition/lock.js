'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildCatalog } = require('./catalog');
const { resolveInside, resolveExport, contentHash } = require('./resolver');
const { sha256 } = require('./baseline');
const { validateComposeManifest, validateLockManifest, validateUnit } = require('./contracts');
const { DIAGNOSTIC_CODES: C, diagnostic } = require('./diagnostics');

const { recipeHash, recipeLockPath } = require('./recipe-lock');
const { recipeDesignSources } = require('./design-sources');

const ENGINE_VERSION = require('../package.json').version;

function readJsonFile(filePath, diagnostics, displayPath) {
    try {
        const bytes = fs.readFileSync(filePath);
        return { value: JSON.parse(bytes.toString('utf8')), bytes, hash: sha256(bytes) };
    } catch (error) {
        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `Cannot read JSON: ${error.message}`, displayPath));
        return null;
    }
}

function uniqueInputs(inputs) {
    const result = new Map();
    for (const input of inputs) result.set(input.workspacePath, input);
    return [...result.values()].sort((a, b) => a.workspacePath < b.workspacePath ? -1 : a.workspacePath > b.workspacePath ? 1 : 0);
}

function planRecipeLock(workRoot, courseName, recipeId) {
    const catalog = buildCatalog(workRoot);
    const diagnostics = [...catalog.diagnostics];
    const courseDir = path.join(catalog.coursesRoot, courseName);
    const composePath = path.join(courseDir, 'course.compose.json');
    if (!fs.existsSync(courseDir)) {
        diagnostics.push(diagnostic(C.REFERENCE_NOT_FOUND, `Course directory not found: ${courseName}.`, `courses/${courseName}`));
        return { valid: false, diagnostics, workRoot: catalog.root, coursesRoot: catalog.coursesRoot, courseName };
    }
    const composeRead = readJsonFile(composePath, diagnostics, `courses/${courseName}/course.compose.json`);
    if (!composeRead) return { valid: false, diagnostics, workRoot: catalog.root, coursesRoot: catalog.coursesRoot, courseName };
    const compose = composeRead.value;
    const validation = validateComposeManifest(compose);
    diagnostics.push(...validation.diagnostics);
    const selectedRecipe = recipeId || compose.defaultRecipe;
    const recipe = compose.recipes && compose.recipes[selectedRecipe];
    if (!recipe) diagnostics.push(diagnostic(C.RECIPE_NOT_FOUND, `Recipe not found: ${selectedRecipe}.`, '/recipeId'));
    if (!validation.valid || !recipe || diagnostics.some(item => item.severity === 'error')) {
        return { valid: false, diagnostics, workRoot: catalog.root, coursesRoot: catalog.coursesRoot, courseName, recipeId: selectedRecipe };
    }

    const inputs = [{
        path: composePath,
        workspacePath: `courses/${courseName}/course.compose.json`,
        hash: composeRead.hash,
    }];
    const references = [];
    const snapshots = new Map();
    const bindings = [];

    function addLocalInput(relativePath, pointer, scanDependencies = false) {
        const absolutePath = resolveInside(courseDir, relativePath);
        if (!absolutePath || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
            diagnostics.push(diagnostic(C.REFERENCE_NOT_FOUND, `Local source not found: ${relativePath}.`, pointer));
            return null;
        }
        const bytes = fs.readFileSync(absolutePath);
        inputs.push({ path: absolutePath, workspacePath: path.relative(catalog.root, absolutePath).split(path.sep).join('/'), hash: sha256(bytes) });
        if (scanDependencies) {
            const html = bytes.toString('utf8');
            for (const match of html.matchAll(/\b(?:src|href)=(['"])([^'"]+)\1/gi)) {
                const value = match[2];
                if (/^(?:https?:|data:|#|mailto:|javascript:|\/)/i.test(value)) continue;
                const pathPart = value.split(/[?#]/, 1)[0];
                const sourceDir = path.posix.dirname(relativePath);
                const candidates = [pathPart, path.posix.normalize(path.posix.join(sourceDir, pathPart))];
                const dependency = candidates.find(candidate => {
                    const candidatePath = resolveInside(courseDir, candidate);
                    return candidatePath && fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile();
                });
                if (dependency) addLocalInput(dependency, `${pointer}/${pathPart}`);
                else diagnostics.push(diagnostic(C.REFERENCE_NOT_FOUND, `Local page dependency not found: ${pathPart}.`, pointer));
            }
        }
        return { absolutePath, bytes };
    }

    function addReference(occurrenceId, ref, requestedVersion = null) {
        const itemDiagnostics = [];
        const resolution = resolveExport(catalog, ref, requestedVersion, { diagnostics: itemDiagnostics });
        diagnostics.push(...itemDiagnostics.map(entry => ({ ...entry, occurrenceId })));
        if (resolution.ref && resolution.version) {
            bindings.push({ occurrenceId, ref: resolution.ref, version: resolution.version, exportPath: resolution.exportPath || [] });
        }
        if (!resolution.resolved) return { resolution, reference: null };
        inputs.push(...resolution.manifestInputs);
        inputs.push(...resolution.files.map(file => ({ path: file.absolutePath, workspacePath: file.workspacePath, hash: file.hash })));
        const digest = resolution.contentHash.slice('sha256:'.length);
        const snapshotPath = `.nextcourse/objects/sha256/${digest}`;
        snapshots.set(resolution.contentHash, {
            contentHash: resolution.contentHash,
            snapshotPath,
            files: resolution.files,
        });
        const reference = {
            occurrenceId,
            ref: resolution.ref,
            version: resolution.version,
            contentHash: resolution.contentHash,
            snapshotPath,
            sourcePath: resolution.sourcePath,
            exportPath: resolution.exportPath,
            dependencyPath: resolution.dependencyPath,
            assets: resolution.assets,
            cases: resolution.cases,
            deliveryFiles: resolution.deliveryFiles,
        };
        references.push(reference);
        return { resolution, reference };
    }

    const design = recipeDesignSources(courseDir, recipe);
    diagnostics.push(...design.diagnostics);
    for (const file of design.files) inputs.push({
        path: file.absolutePath,
        workspacePath: path.relative(catalog.root, file.absolutePath).split(path.sep).join('/'),
        hash: file.hash,
    });

    for (const group of recipe.groups) {
        if (group.sourceSequence) addReference(`${group.id}.sequence`, group.sourceSequence.ref, group.sourceSequence.version);
        for (const item of group.items) {
            if (item.contentMode === 'local') {
                const local = addLocalInput(item.local.path, `/recipes/${selectedRecipe}/items/${item.id}/local/path`, item.local.id.includes(':page:'));
                if (local) {
                    if (item.local.id.includes(':unit:')) {
                        try {
                            const localUnit = JSON.parse(local.bytes.toString('utf8'));
                            const unitValidation = validateUnit(localUnit);
                            diagnostics.push(...unitValidation.diagnostics.map(entry => ({ ...entry, source: item.local.path })));
                            const descriptorDir = path.posix.dirname(item.local.path);
                            for (const page of localUnit.pages || []) {
                                const pagePath = path.posix.normalize(path.posix.join(descriptorDir, page.path));
                                addLocalInput(pagePath, `${item.local.path}/pages/${page.id}`, true);
                            }
                            (localUnit.assets || []).forEach((dependencyRef, dependencyIndex) => {
                                addReference(`${item.id}.asset${dependencyIndex + 1}`, dependencyRef);
                            });
                            const usedOverrides = new Set();
                            (localUnit.cases || []).forEach((dependencyRef, dependencyIndex) => {
                                const overrideIndex = (item.caseOverrides || []).findIndex(entry => entry.from === dependencyRef);
                                if (overrideIndex === -1) addReference(`${item.id}.case${dependencyIndex + 1}`, dependencyRef);
                                else {
                                    usedOverrides.add(overrideIndex);
                                    addReference(`${item.id}.case-override${overrideIndex + 1}`, item.caseOverrides[overrideIndex].to);
                                }
                            });
                            (item.caseOverrides || []).forEach((override, overrideIndex) => {
                                if (!usedOverrides.has(overrideIndex)) diagnostics.push(diagnostic(
                                    C.ITEM_INVALID,
                                    `Case ${override.from} is not used by ${item.local.id}.`,
                                    `/recipes/${selectedRecipe}/items/${item.id}/caseOverrides/${overrideIndex}/from`
                                ));
                            });
                        } catch (error) {
                            diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `Cannot parse local unit: ${error.message}`, item.local.path));
                        }
                    }
                }
            } else {
                const added = addReference(item.id, item.ref);
                if (added && added.resolution && added.resolution.kind === 'unit') {
                    for (let caseIndex = 0; caseIndex < (item.caseOverrides || []).length; caseIndex++) {
                        const override = item.caseOverrides[caseIndex];
                        if (!(added.resolution.cases || []).includes(override.from)) {
                            diagnostics.push(diagnostic(
                                C.ITEM_INVALID,
                                `Case ${override.from} is not used by ${item.ref}.`,
                                `/recipes/${selectedRecipe}/items/${item.id}/caseOverrides/${caseIndex}/from`
                            ));
                            continue;
                        }
                        if (added.reference) added.reference.cases = (added.reference.cases || []).filter(caseId => caseId !== override.from);
                        addReference(`${item.id}.case-override${caseIndex + 1}`, override.to);
                    }
                } else if ((item.caseOverrides || []).length) {
                    diagnostics.push(diagnostic(C.ITEM_INVALID, 'Case overrides require a unit occurrence.', `/recipes/${selectedRecipe}/items/${item.id}/caseOverrides`));
                }
                if (item.variant) addLocalInput(item.variant.path, `/recipes/${selectedRecipe}/items/${item.id}/variant/path`, true);
            }

            for (let operationIndex = 0; operationIndex < (item.operations || []).length; operationIndex++) {
                const source = item.operations[operationIndex].with;
                if (source && source.ref) addReference(`${item.id}.op${operationIndex + 1}`, source.ref);
                else if (source && source.path) addLocalInput(source.path, `/recipes/${selectedRecipe}/items/${item.id}/operations/${operationIndex}/with/path`, true);
            }
        }
    }

    const byEntity = new Map();
    for (const binding of bindings) {
        if (!byEntity.has(binding.ref)) byEntity.set(binding.ref, []);
        byEntity.get(binding.ref).push(binding);
    }
    for (const [ref, occurrences] of byEntity) {
        const versions = [...new Set(occurrences.map(item => item.version))];
        if (versions.length > 1) {
            diagnostics.push(diagnostic(C.VERSION_CONFLICT, `${ref} resolves to multiple versions: ${versions.join(', ')}.`, '/recipes', 'error', { ref, versions, occurrences }));
        } else if (occurrences.length > 1) {
            diagnostics.push(diagnostic(C.DUPLICATE_PATH, `${ref}@${versions[0]} appears through ${occurrences.length} occurrences; all are preserved.`, '/recipes', 'warning', { ref, version: versions[0], occurrences }));
        }
    }

    const allInputs = uniqueInputs(inputs);
    const exportManifestInputs = allInputs.filter(input => input.workspacePath.endsWith('/course.exports.json'));
    const sourceManifestHash = sha256(Buffer.from(exportManifestInputs.map(input => `${input.workspacePath}\0${input.hash}`).join('\n'), 'utf8'));
    const lock = {
        schemaVersion: 1,
        courseId: compose.courseId,
        recipeId: selectedRecipe,
        engineVersion: ENGINE_VERSION,
        composeHash: composeRead.hash,
        recipeHash: recipeHash(compose, selectedRecipe),
        sourceManifestHash,
        references,
    };
    const lockValidation = validateLockManifest(lock);
    diagnostics.push(...lockValidation.diagnostics);
    const valid = !diagnostics.some(item => item.severity === 'error');
    const lockPath = recipeLockPath(courseDir, compose, selectedRecipe, true);
    const baselineLockHash = fs.existsSync(lockPath) ? sha256(fs.readFileSync(lockPath)) : null;
    const planIdentity = JSON.stringify({ recipeId: selectedRecipe, composeHash: composeRead.hash, sourceManifestHash, references, lockPath: path.relative(courseDir, lockPath), baselineLockHash, inputBaseline: allInputs.map(input => ({ path: input.workspacePath, hash: input.hash })) });
    return {
        valid,
        planId: sha256(Buffer.from(planIdentity, 'utf8')),
        diagnostics,
        workRoot: catalog.root,
        coursesRoot: catalog.coursesRoot,
        courseName,
        courseDir,
        recipeId: selectedRecipe,
        lockPath,
        baselineLockHash,
        inputs: allInputs,
        snapshots: [...snapshots.values()],
        lock: valid ? lock : null,
    };
}

function snapshotTarget(coursesRoot, snapshotPath) {
    return resolveInside(coursesRoot, snapshotPath);
}

function snapshotManifest(snapshot) {
    return {
        schemaVersion: 1,
        contentHash: snapshot.contentHash,
        files: snapshot.files.map(file => ({
            courseId: file.courseId,
            path: file.path,
            storedPath: `files/${file.courseId}/${file.path}`,
            bytes: file.bytes,
            hash: file.hash,
        })),
    };
}

function verifySnapshotDirectory(target, expectedHash) {
    const manifestPath = path.join(target, 'object.json');
    if (!fs.existsSync(manifestPath)) return false;
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { return false; }
    if (manifest.contentHash !== expectedHash || !Array.isArray(manifest.files)) return false;
    const reconstructed = [];
    for (const file of manifest.files) {
        const absolutePath = resolveInside(target, file.storedPath);
        if (!absolutePath || !fs.existsSync(absolutePath)) return false;
        const bytes = fs.readFileSync(absolutePath);
        const hash = sha256(bytes);
        if (hash !== file.hash || bytes.length !== file.bytes) return false;
        reconstructed.push({ courseId: file.courseId, path: file.path, hash, bytes: bytes.length });
    }
    return contentHash(reconstructed) === expectedHash;
}

function writeSnapshot(coursesRoot, snapshot) {
    const target = snapshotTarget(coursesRoot, snapshot.snapshotPath);
    if (!target) throw new Error(`Unsafe snapshot path: ${snapshot.snapshotPath}`);
    if (fs.existsSync(target)) {
        if (!verifySnapshotDirectory(target, snapshot.contentHash)) throw new Error(`Snapshot is corrupt: ${target}`);
        return target;
    }
    const parent = path.dirname(target);
    fs.mkdirSync(parent, { recursive: true });
    const temporary = fs.mkdtempSync(path.join(parent, '.tmp-'));
    try {
        const manifest = snapshotManifest(snapshot);
        for (let index = 0; index < snapshot.files.length; index++) {
            const source = snapshot.files[index];
            const stored = manifest.files[index].storedPath;
            const destination = resolveInside(temporary, stored);
            if (!destination) throw new Error(`Unsafe stored path: ${stored}`);
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.copyFileSync(source.absolutePath, destination);
        }
        fs.writeFileSync(path.join(temporary, 'object.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
        if (!verifySnapshotDirectory(temporary, snapshot.contentHash)) {
            throw new Error(`Snapshot changed while it was being copied: ${snapshot.contentHash}`);
        }
        fs.renameSync(temporary, target);
    } catch (error) {
        fs.rmSync(temporary, { recursive: true, force: true });
        if (fs.existsSync(target) && verifySnapshotDirectory(target, snapshot.contentHash)) return target;
        throw error;
    }
    if (!verifySnapshotDirectory(target, snapshot.contentHash)) throw new Error(`Snapshot verification failed: ${target}`);
    return target;
}

function applyLockPlan(plan) {
    const diagnostics = [...(plan.diagnostics || [])];
    if (!plan.valid || !plan.lock) return { applied: false, diagnostics };
    for (const input of plan.inputs) {
        if (!fs.existsSync(input.path) || sha256(fs.readFileSync(input.path)) !== input.hash) {
            diagnostics.push(diagnostic(C.PLAN_STALE, `Input changed after planning: ${input.workspacePath}.`, input.workspacePath));
        }
    }
    if (diagnostics.some(item => item.severity === 'error')) return { applied: false, diagnostics };

    const lockPath = plan.lockPath;
    if (!lockPath || (fs.existsSync(lockPath) ? sha256(fs.readFileSync(lockPath)) : null) !== plan.baselineLockHash) {
        diagnostics.push(diagnostic(C.PLAN_STALE, 'Recipe lock changed after planning.', lockPath || '/lockPath'));
        return { applied: false, diagnostics };
    }
    let temporaryLock = null;
    try {
        for (const snapshot of plan.snapshots) writeSnapshot(plan.coursesRoot, snapshot);
        fs.mkdirSync(path.dirname(lockPath), { recursive: true });
        temporaryLock = `${lockPath}.tmp-${process.pid}-${crypto.randomUUID()}`;
        fs.writeFileSync(temporaryLock, `${JSON.stringify(plan.lock, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
        fs.renameSync(temporaryLock, lockPath);
        temporaryLock = null;
        return { applied: true, diagnostics, lockPath };
    } catch (error) {
        if (temporaryLock && fs.existsSync(temporaryLock)) fs.rmSync(temporaryLock, { force: true });
        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `Could not apply lock plan: ${error.message}`, path.relative(plan.workRoot, lockPath).split(path.sep).join('/')));
        return { applied: false, diagnostics };
    }
}

function loadSnapshot(coursesRoot, reference) {
    const target = snapshotTarget(path.resolve(coursesRoot), reference.snapshotPath);
    if (!target || !fs.existsSync(target)) {
        return { valid: false, diagnostics: [diagnostic(C.SNAPSHOT_MISSING, `Snapshot not found: ${reference.snapshotPath}.`, reference.snapshotPath)] };
    }
    if (!verifySnapshotDirectory(target, reference.contentHash)) {
        return { valid: false, diagnostics: [diagnostic(C.HASH_INVALID, `Snapshot failed integrity verification: ${reference.snapshotPath}.`, reference.snapshotPath)] };
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(target, 'object.json'), 'utf8'));
    return { valid: true, diagnostics: [], dir: target, manifest };
}

module.exports = {
    ENGINE_VERSION,
    planRecipeLock,
    applyLockPlan,
    loadSnapshot,
    verifySnapshotDirectory,
};

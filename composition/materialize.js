'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sha256 } = require('./baseline');
const { entityParts, validateComposeManifest, validateLockManifest, validateUnit } = require('./contracts');
const { DIAGNOSTIC_CODES: C, diagnostic } = require('./diagnostics');
const { resolveInside } = require('./resolver');
const { loadSnapshot } = require('./lock');

function readJson(filePath, diagnostics, displayPath) {
    try {
        const bytes = fs.readFileSync(filePath);
        return { value: JSON.parse(bytes.toString('utf8')), bytes, hash: sha256(bytes) };
    } catch (error) {
        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `Cannot read JSON: ${error.message}`, displayPath));
        return null;
    }
}

function snapshotFile(snapshot, sourcePath) {
    return snapshot.manifest.files.find(file => `${file.courseId}/${file.path}` === sourcePath) || null;
}

function readSnapshotText(snapshot, sourcePath, diagnostics) {
    const file = snapshotFile(snapshot, sourcePath);
    if (!file) {
        diagnostics.push(diagnostic(C.SNAPSHOT_MISSING, `Snapshot does not contain ${sourcePath}.`, sourcePath));
        return null;
    }
    const absolutePath = resolveInside(snapshot.dir, file.storedPath);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
        diagnostics.push(diagnostic(C.SNAPSHOT_MISSING, `Snapshot file is missing: ${file.storedPath}.`, sourcePath));
        return null;
    }
    return { text: fs.readFileSync(absolutePath, 'utf8'), file, absolutePath };
}

function localPage(courseDir, id, relativePath, diagnostics) {
    const absolutePath = resolveInside(courseDir, relativePath);
    if (!absolutePath || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
        diagnostics.push(diagnostic(C.REFERENCE_NOT_FOUND, `Local page not found: ${relativePath}.`, relativePath));
        return null;
    }
    const bytes = fs.readFileSync(absolutePath);
    return {
        id,
        html: bytes.toString('utf8'),
        hash: sha256(bytes),
        contentMode: 'local',
        localPath: relativePath,
        absolutePath,
    };
}

function pagesFromUnitDescriptor(unit, descriptorSourcePath, readPage, diagnostics) {
    const validation = validateUnit(unit);
    diagnostics.push(...validation.diagnostics);
    if (!validation.valid) return [];
    const descriptorDir = path.posix.dirname(descriptorSourcePath);
    const pages = [];
    for (const page of unit.pages) {
        const sourcePath = path.posix.normalize(path.posix.join(descriptorDir, page.path));
        const loaded = readPage(page, sourcePath);
        if (loaded) pages.push({ id: page.id, ...loaded, sourcePath });
    }
    return pages;
}

function selectPages(pages, selection, diagnostics, pointer) {
    let selected = pages.slice();
    if (selection && Array.isArray(selection.include)) {
        const byId = new Map(pages.map(page => [page.id, page]));
        selected = [];
        for (const id of selection.include) {
            if (!byId.has(id)) diagnostics.push(diagnostic(C.REFERENCE_NOT_FOUND, `Selected page not found: ${id}.`, pointer));
            else selected.push(byId.get(id));
        }
    }
    if (selection && Array.isArray(selection.omit)) {
        const available = new Set(pages.map(page => page.id));
        for (const id of selection.omit) {
            if (!available.has(id)) diagnostics.push(diagnostic(C.REFERENCE_NOT_FOUND, `Omitted page not found: ${id}.`, pointer));
        }
        const omitted = new Set(selection.omit);
        selected = selected.filter(page => !omitted.has(page.id));
    }
    return selected;
}

function applyOperations(pages, operations, courseDir, diagnostics, pointer, resolveExternal) {
    const selected = pages.slice();
    for (let index = 0; index < (operations || []).length; index++) {
        const operation = operations[index];
        const targetIndexes = selected.map((page, pageIndex) => page.id === operation.target ? pageIndex : -1).filter(value => value >= 0);
        if (targetIndexes.length !== 1) {
            diagnostics.push(diagnostic(C.REFERENCE_NOT_FOUND, `Operation target must resolve once: ${operation.target}.`, `${pointer}/operations/${index}/target`));
            continue;
        }
        const replacement = operation.with.path
            ? localPage(courseDir, operation.with.id, operation.with.path, diagnostics)
            : resolveExternal(index, operation.with.ref);
        if (!replacement) continue;
        const targetIndex = targetIndexes[0];
        if (operation.op === 'replace') selected.splice(targetIndex, 1, replacement);
        else if (operation.op === 'insert_before') selected.splice(targetIndex, 0, replacement);
        else selected.splice(targetIndex + 1, 0, replacement);
    }
    return selected;
}

function addModuleClass(html, moduleNumber) {
    if (moduleNumber === null) return String(html);
    const moduleClass = `module-${moduleNumber}`;
    let output = String(html)
        .replaceAll('__MODULE_N__', String(moduleNumber))
        .replaceAll('__MODULE_NO__', String(moduleNumber).padStart(2, '0'));
    return output.replace(/<section\b([^>]*)>/i, (match, attributes) => {
        if (!/\bdata-role=(['"])divider\1/i.test(attributes) && !/\bmodule-\d+\b/.test(attributes)) return match;
        const classMatch = attributes.match(/\bclass=(['"])([^'"]*)\1/i);
        if (!classMatch) return `<section class="${moduleClass}"${attributes}>`;
        const classes = classMatch[2].split(/\s+/).filter(Boolean).map(value => /^module-\d+$/.test(value) ? moduleClass : value);
        if (!classes.includes(moduleClass)) classes.push(moduleClass);
        const updated = attributes.replace(classMatch[0], `class=${classMatch[1]}${classes.join(' ')}${classMatch[1]}`);
        return `<section${updated}>`;
    });
}

function relativeReferences(html) {
    const references = [];
    for (const match of String(html).matchAll(/\b(src|href)=(['"])([^'"]+)\2/gi)) {
        const value = match[3];
        if (/^(?:https?:|data:|#|mailto:|javascript:|\/)/i.test(value)) continue;
        const pathPart = value.split(/[?#]/, 1)[0];
        if (!pathPart) continue;
        references.push({ value, pathPart });
    }
    return references;
}

function replaceReference(html, from, to) {
    return String(html).replace(/\b(src|href)=(['"])([^'"]+)\2/gi, (match, attribute, quote, value) => {
        if (value !== from) return match;
        const suffix = value.slice(value.split(/[?#]/, 1)[0].length);
        return `${attribute}=${quote}${to}${suffix}${quote}`;
    });
}

function prepareSnapshotPage(page, snapshot) {
    let html = page.html;
    const sourceDir = path.posix.dirname(page.sourcePath);
    const courseId = page.sourcePath.split('/')[0];
    const available = new Set(snapshot.manifest.files.map(file => `${file.courseId}/${file.path}`));
    for (const reference of relativeReferences(html)) {
        const candidates = [
            path.posix.normalize(`${courseId}/${reference.pathPart}`),
            path.posix.normalize(path.posix.join(sourceDir, reference.pathPart)),
        ];
        const matched = candidates.find(candidate => available.has(candidate));
        if (matched) html = replaceReference(html, reference.value, `assets/${matched}`);
    }
    return { ...page, html };
}

function prepareLocalPage(page, courseDir, diagnostics, assets) {
    let html = page.html;
    const sourceRelative = page.localPath || page.sourcePath;
    const sourceDir = path.posix.dirname(sourceRelative);
    for (const reference of relativeReferences(html)) {
        const candidates = [reference.pathPart, path.posix.normalize(path.posix.join(sourceDir, reference.pathPart))];
        let matched = null;
        for (const candidate of candidates) {
            const absolutePath = resolveInside(courseDir, candidate);
            if (absolutePath && fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
                matched = { relativePath: candidate, absolutePath };
                break;
            }
        }
        if (!matched) {
            diagnostics.push(diagnostic(C.REFERENCE_NOT_FOUND, `Local page dependency not found: ${reference.pathPart}.`, sourceRelative));
            continue;
        }
        const outputPath = matched.relativePath;
        assets.set(outputPath, { outputPath, source: matched.relativePath, absolutePath: matched.absolutePath, origin: 'local' });
        html = replaceReference(html, reference.value, outputPath);
    }
    return { ...page, html };
}

function verifyGeneratedView(outputDir) {
    const manifestPath = path.join(outputDir, 'build.manifest.json');
    if (!fs.existsSync(manifestPath)) return { clean: false, reason: 'missing build.manifest.json' };
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { return { clean: false, reason: 'invalid build.manifest.json' }; }
    for (const output of manifest.outputs || []) {
        const absolutePath = resolveInside(outputDir, output.path);
        if (!absolutePath || !fs.existsSync(absolutePath) || sha256(fs.readFileSync(absolutePath)) !== output.hash) {
            return { clean: false, reason: `generated file changed: ${output.path}` };
        }
    }
    return { clean: true };
}

function reusableGeneratedView(outputDir, lock, groups, pageRecords, localAssets) {
    const manifestPath = path.join(outputDir, 'build.manifest.json');
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch { return false; }
    if (manifest.composeHash !== lock.composeHash || manifest.sourceManifestHash !== lock.sourceManifestHash) return false;
    const pages = pageRecords.map(({ html, ...page }) => page);
    if (JSON.stringify(manifest.groups) !== JSON.stringify(groups) || JSON.stringify(manifest.pages) !== JSON.stringify(pages)) return false;
    const existingLocal = new Map((manifest.assets || []).filter(asset => asset.origin === 'local').map(asset => [asset.source, asset.hash]));
    if (existingLocal.size !== localAssets.size) return false;
    for (const asset of localAssets.values()) {
        if (!fs.existsSync(asset.absolutePath) || existingLocal.get(asset.source) !== sha256(fs.readFileSync(asset.absolutePath))) return false;
    }
    return true;
}

function materializeRecipe(workRoot, courseName, recipeId, options = {}) {
    const root = path.resolve(workRoot);
    const coursesRoot = path.join(root, 'courses');
    const courseDir = path.join(coursesRoot, courseName);
    const diagnostics = [];
    const composeRead = readJson(path.join(courseDir, 'course.compose.json'), diagnostics, `courses/${courseName}/course.compose.json`);
    const lockRead = readJson(path.join(courseDir, 'course.lock.json'), diagnostics, `courses/${courseName}/course.lock.json`);
    if (!composeRead || !lockRead) return { materialized: false, diagnostics };
    const composeValidation = validateComposeManifest(composeRead.value);
    const lockValidation = validateLockManifest(lockRead.value);
    diagnostics.push(...composeValidation.diagnostics, ...lockValidation.diagnostics);
    if (!composeValidation.valid || !lockValidation.valid) return { materialized: false, diagnostics };

    const selectedRecipe = recipeId || composeRead.value.defaultRecipe;
    const recipe = composeRead.value.recipes[selectedRecipe];
    const lock = lockRead.value;
    if (!recipe || lock.recipeId !== selectedRecipe) {
        diagnostics.push(diagnostic(C.RECIPE_NOT_FOUND, `Lock is for ${lock.recipeId}; requested ${selectedRecipe}.`, '/recipeId'));
    }
    if (lock.composeHash !== composeRead.hash) {
        diagnostics.push(diagnostic(C.SOURCE_DRIFT, 'course.compose.json changed after this lock was created.', 'course.compose.json'));
    }
    if (diagnostics.some(item => item.severity === 'error')) return { materialized: false, diagnostics };

    const references = new Map(lock.references.map(reference => [reference.occurrenceId, reference]));
    const loadedSnapshots = new Map();
    const consumedSnapshotFiles = new Set();
    const deliverySnapshotFiles = new Set();
    const localAssets = new Map();
    const pageRecords = [];
    const groups = [];
    let pageNumber = 0;

    for (const reference of lock.references) {
        for (const sourcePath of reference.deliveryFiles || []) {
            deliverySnapshotFiles.add(`${reference.contentHash}\0${sourcePath}`);
        }
    }

    function externalOperationPage(occurrenceId, ref, pointer) {
        const reference = references.get(occurrenceId);
        if (!reference || reference.ref !== ref) {
            diagnostics.push(diagnostic(C.LOCK_REFERENCE_INVALID, `Lock has no operation source ${occurrenceId}.`, pointer));
            return null;
        }
        const parts = entityParts(reference.ref);
        if (!parts || parts.kind !== 'page') {
            diagnostics.push(diagnostic(C.ITEM_INVALID, `Operation source must resolve to a page: ${ref}.`, pointer));
            return null;
        }
        const snapshot = loadSnapshot(coursesRoot, reference);
        diagnostics.push(...snapshot.diagnostics);
        if (!snapshot.valid) return null;
        loadedSnapshots.set(reference.contentHash, snapshot);
        const loaded = readSnapshotText(snapshot, reference.sourcePath, diagnostics);
        if (!loaded) return null;
        consumedSnapshotFiles.add(`${reference.contentHash}\0${reference.sourcePath}`);
        return {
            id: reference.ref,
            html: loaded.text,
            hash: loaded.file.hash,
            sourcePath: reference.sourcePath,
            contentMode: 'reference',
            ref: reference.ref,
            version: reference.version,
            snapshotPath: reference.snapshotPath,
            snapshotHash: reference.contentHash,
        };
    }

    for (let groupIndex = 0; groupIndex < recipe.groups.length; groupIndex++) {
        const group = recipe.groups[groupIndex];
        const moduleNumber = group.moduleNumber === undefined ? groupIndex + 1 : group.moduleNumber;
        const groupRecord = { id: group.id, title: group.title, moduleNumber, pages: [] };
        for (let itemIndex = 0; itemIndex < group.items.length; itemIndex++) {
            const item = group.items[itemIndex];
            const pointer = `/recipes/${selectedRecipe}/groups/${groupIndex}/items/${itemIndex}`;
            let pages = [];
            if (item.contentMode === 'local') {
                const descriptorPath = resolveInside(courseDir, item.local.path);
                if (!descriptorPath || !fs.existsSync(descriptorPath)) {
                    diagnostics.push(diagnostic(C.REFERENCE_NOT_FOUND, `Local unit not found: ${item.local.path}.`, `${pointer}/local/path`));
                    continue;
                }
                let unit;
                try { unit = JSON.parse(fs.readFileSync(descriptorPath, 'utf8')); }
                catch (error) {
                    diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `Cannot parse local unit: ${error.message}`, item.local.path));
                    continue;
                }
                pages = pagesFromUnitDescriptor(unit, item.local.path, (page, sourcePath) => {
                    const local = localPage(courseDir, page.id, sourcePath, diagnostics);
                    return local && { ...local, contentMode: 'local' };
                }, diagnostics);
            } else {
                const reference = references.get(item.id);
                if (!reference) {
                    diagnostics.push(diagnostic(C.LOCK_REFERENCE_INVALID, `Lock has no occurrence ${item.id}.`, `${pointer}/id`));
                    continue;
                }
                const snapshot = loadSnapshot(coursesRoot, reference);
                diagnostics.push(...snapshot.diagnostics);
                if (!snapshot.valid) continue;
                loadedSnapshots.set(reference.contentHash, snapshot);
                const parts = entityParts(reference.ref);
                const entrypoint = readSnapshotText(snapshot, reference.sourcePath, diagnostics);
                if (!entrypoint || !parts) continue;
                consumedSnapshotFiles.add(`${reference.contentHash}\0${reference.sourcePath}`);
                if (parts.kind === 'unit') {
                    let unit;
                    try { unit = JSON.parse(entrypoint.text); }
                    catch (error) {
                        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `Cannot parse locked unit: ${error.message}`, reference.sourcePath));
                        continue;
                    }
                    pages = pagesFromUnitDescriptor(unit, reference.sourcePath, (page, sourcePath) => {
                        const loaded = readSnapshotText(snapshot, sourcePath, diagnostics);
                        consumedSnapshotFiles.add(`${reference.contentHash}\0${sourcePath}`);
                        return loaded && {
                            html: loaded.text,
                            hash: loaded.file.hash,
                            contentMode: item.contentMode,
                            ref: page.id,
                            version: reference.version,
                            snapshotPath: reference.snapshotPath,
                            snapshotHash: reference.contentHash,
                        };
                    }, diagnostics);
                } else if (parts.kind === 'page') {
                    pages = [{
                        id: reference.ref,
                        html: entrypoint.text,
                        hash: entrypoint.file.hash,
                        sourcePath: reference.sourcePath,
                        contentMode: item.contentMode,
                        ref: reference.ref,
                        version: reference.version,
                        snapshotPath: reference.snapshotPath,
                        snapshotHash: reference.contentHash,
                    }];
                } else {
                    diagnostics.push(diagnostic(C.ITEM_INVALID, `Recipe item cannot materialize ${parts.kind} as slides.`, pointer));
                    continue;
                }
                if (item.contentMode === 'variant') {
                    if (item.variant.baselineHash !== reference.contentHash) {
                        diagnostics.push(diagnostic(C.SOURCE_DRIFT, `Variant baseline no longer matches ${reference.ref}.`, `${pointer}/variant/baselineHash`));
                        continue;
                    }
                    if (pages.length !== 1) {
                        diagnostics.push(diagnostic(C.ITEM_INVALID, 'v1 page variants require a page export, not a multi-page unit.', `${pointer}/variant`));
                        continue;
                    }
                    const variant = localPage(courseDir, pages[0].id, item.variant.path, diagnostics);
                    if (!variant) continue;
                    pages = [{ ...variant, contentMode: 'variant', ref: reference.ref, version: reference.version, baselineHash: reference.contentHash }];
                }
            }
            pages = selectPages(pages, item.pages, diagnostics, `${pointer}/pages`);
            pages = applyOperations(pages, item.operations, courseDir, diagnostics, pointer, (operationIndex, ref) =>
                externalOperationPage(`${item.id}.op${operationIndex + 1}`, ref, `${pointer}/operations/${operationIndex}/with/ref`));
            for (const page of pages) {
                pageNumber++;
                const outputPath = `slides/slide-${String(pageNumber).padStart(2, '0')}.html`;
                const snapshot = page.snapshotHash && loadedSnapshots.get(page.snapshotHash);
                const prepared = snapshot
                    ? prepareSnapshotPage(page, snapshot)
                    : prepareLocalPage(page, courseDir, diagnostics, localAssets);
                const record = {
                    index: pageNumber,
                    output: outputPath,
                    groupId: group.id,
                    moduleNumber,
                    occurrenceId: item.id,
                    entityId: page.id,
                    contentMode: page.contentMode,
                    ref: page.ref || null,
                    version: page.version || null,
                    sourcePath: page.sourcePath || page.localPath,
                    sourceHash: page.hash,
                    html: addModuleClass(prepared.html, moduleNumber),
                };
                pageRecords.push(record);
                groupRecord.pages.push(pageNumber);
            }
        }
        groups.push(groupRecord);
    }
    if (diagnostics.some(item => item.severity === 'error')) return { materialized: false, diagnostics };

    const buildRoot = path.join(courseDir, '.build');
    const outputDir = path.join(buildRoot, selectedRecipe);
    if (fs.existsSync(outputDir) && !options.force) {
        const drift = verifyGeneratedView(outputDir);
        if (!drift.clean) {
            diagnostics.push(diagnostic(C.GENERATED_DRIFT, drift.reason, path.relative(root, outputDir).split(path.sep).join('/')));
            return { materialized: false, diagnostics };
        }
        if (reusableGeneratedView(outputDir, lock, groups, pageRecords, localAssets)) {
            return {
                materialized: true,
                reused: true,
                diagnostics,
                outputDir,
                manifestPath: path.join(outputDir, 'build.manifest.json'),
                pageCount: pageRecords.length,
            };
        }
    }
    fs.mkdirSync(buildRoot, { recursive: true });
    const temporary = fs.mkdtempSync(path.join(buildRoot, `.tmp-${selectedRecipe}-`));
    const outputs = [];
    try {
        for (const sourceName of ['course.meta.md', 'course.blueprint.md']) {
            const sourcePath = path.join(courseDir, sourceName);
            if (!fs.existsSync(sourcePath)) continue;
            const destination = path.join(temporary, sourceName);
            fs.copyFileSync(sourcePath, destination);
            outputs.push({ path: sourceName, hash: sha256(fs.readFileSync(destination)) });
        }
        fs.mkdirSync(path.join(temporary, 'slides'), { recursive: true });
        for (const page of pageRecords) {
            const destination = path.join(temporary, page.output);
            fs.writeFileSync(destination, page.html, 'utf8');
            outputs.push({ path: page.output, hash: sha256(fs.readFileSync(destination)) });
        }

        const copiedAssets = [];
        for (const [contentHash, snapshot] of loadedSnapshots) {
            for (const file of snapshot.manifest.files) {
                const sourcePath = `${file.courseId}/${file.path}`;
                if (consumedSnapshotFiles.has(`${contentHash}\0${sourcePath}`)) continue;
                if (deliverySnapshotFiles.has(`${contentHash}\0${sourcePath}`)) continue;
                const source = resolveInside(snapshot.dir, file.storedPath);
                const outputPath = `assets/${sourcePath}`;
                const destination = resolveInside(temporary, outputPath);
                if (!source || !destination) continue;
                fs.mkdirSync(path.dirname(destination), { recursive: true });
                fs.copyFileSync(source, destination);
                const hash = sha256(fs.readFileSync(destination));
                outputs.push({ path: outputPath, hash });
                copiedAssets.push({ path: outputPath, hash, source: sourcePath, origin: 'snapshot' });
            }
        }
        for (const asset of localAssets.values()) {
            const destination = resolveInside(temporary, asset.outputPath);
            if (!destination) continue;
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.copyFileSync(asset.absolutePath, destination);
            const hash = sha256(fs.readFileSync(destination));
            outputs.push({ path: asset.outputPath, hash });
            copiedAssets.push({ path: asset.outputPath, hash, source: asset.source, origin: asset.origin });
        }
        const manifest = {
            schemaVersion: 1,
            courseId: composeRead.value.courseId,
            recipeId: selectedRecipe,
            composeHash: lock.composeHash,
            sourceManifestHash: lock.sourceManifestHash,
            groups,
            pages: pageRecords.map(({ html, ...page }) => page),
            assets: copiedAssets,
            outputs: outputs.slice().sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
        };
        fs.writeFileSync(path.join(temporary, 'build.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

        let backup = null;
        if (fs.existsSync(outputDir)) {
            backup = `${outputDir}.old-${crypto.randomUUID()}`;
            fs.renameSync(outputDir, backup);
        }
        try {
            fs.renameSync(temporary, outputDir);
            if (backup) fs.rmSync(backup, { recursive: true, force: true });
        } catch (error) {
            if (backup && !fs.existsSync(outputDir)) fs.renameSync(backup, outputDir);
            throw error;
        }
        return { materialized: true, diagnostics, outputDir, manifestPath: path.join(outputDir, 'build.manifest.json'), pageCount: pageRecords.length };
    } catch (error) {
        if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true, force: true });
        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `Could not materialize recipe: ${error.message}`, `.build/${selectedRecipe}`));
        return { materialized: false, diagnostics };
    }
}

module.exports = { addModuleClass, relativeReferences, prepareSnapshotPage, prepareLocalPage, verifyGeneratedView, reusableGeneratedView, materializeRecipe };

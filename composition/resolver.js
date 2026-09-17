'use strict';

const fs = require('fs');
const path = require('path');
const { sha256 } = require('./baseline');
const { entityParts, validateUnit, validateCase } = require('./contracts');
const { DIAGNOSTIC_CODES: C, diagnostic } = require('./diagnostics');

function relativeToWork(catalog, absolutePath) {
    return path.relative(catalog.root, absolutePath).split(path.sep).join('/');
}

function resolveInside(root, relativePath) {
    const absolute = path.resolve(root, relativePath);
    const prefix = `${path.resolve(root)}${path.sep}`;
    return absolute.startsWith(prefix) ? absolute : null;
}

function readSourceFile(catalog, course, relativePath, diagnostics, pointer) {
    const absolutePath = resolveInside(course.dir, relativePath);
    if (!absolutePath) {
        diagnostics.push(diagnostic(C.PATH_INVALID, `Source path escapes course ${course.courseId}.`, pointer));
        return null;
    }
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
        diagnostics.push(diagnostic(C.REFERENCE_NOT_FOUND, `Source file not found: ${relativePath}.`, pointer));
        return null;
    }
    const bytes = fs.readFileSync(absolutePath);
    return {
        courseId: course.courseId,
        path: relativePath.split(path.sep).join('/'),
        absolutePath,
        workspacePath: relativeToWork(catalog, absolutePath),
        bytes: bytes.length,
        hash: sha256(bytes),
    };
}

function contentHash(files) {
    const canonical = files.slice()
        .sort((a, b) => `${a.courseId}/${a.path}`.localeCompare(`${b.courseId}/${b.path}`, 'en'))
        .map(file => `${file.courseId}/${file.path}\0${file.hash}\0${file.bytes}`)
        .join('\n');
    return sha256(Buffer.from(canonical, 'utf8'));
}

function mergeFiles(...groups) {
    const byIdentity = new Map();
    for (const file of groups.flat()) byIdentity.set(`${file.courseId}/${file.path}`, file);
    return [...byIdentity.values()].sort((a, b) => `${a.courseId}/${a.path}`.localeCompare(`${b.courseId}/${b.path}`, 'en'));
}

function linkedPaths(text) {
    const values = [];
    for (const match of String(text).matchAll(/\b(?:src|href)=(['"])([^'"]+)\1/gi)) values.push(match[2]);
    for (const match of String(text).matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi)) values.push(match[2]);
    return values.filter(value => !/^(?:https?:|data:|#|mailto:|javascript:|\/)/i.test(value));
}

function readFileClosure(catalog, course, relativePath, diagnostics, pointer, files, visited = new Set()) {
    const normalized = path.posix.normalize(relativePath);
    if (visited.has(normalized)) return;
    visited.add(normalized);
    const file = readSourceFile(catalog, course, normalized, diagnostics, pointer);
    if (!file) return;
    files.push(file);
    if (!/\.(?:html?|css)$/i.test(normalized)) return;
    const text = fs.readFileSync(file.absolutePath, 'utf8');
    const sourceDir = path.posix.dirname(normalized);
    for (const value of linkedPaths(text)) {
        const pathPart = value.split(/[?#]/, 1)[0];
        if (!pathPart) continue;
        const dependency = path.posix.normalize(path.posix.join(sourceDir, pathPart));
        readFileClosure(catalog, course, dependency, diagnostics, `${pointer}/${pathPart}`, files, visited);
    }
}

function resolveExport(catalog, ref, requestedVersion, options = {}) {
    const diagnostics = options.diagnostics || [];
    const stack = options.stack || [];
    const entry = catalog.exportsById.get(ref);
    const requested = requestedVersion || (entry && entry.version) || null;
    const key = `${ref}@${requested || '?'}`;
    const cycleAt = stack.indexOf(key);
    if (cycleAt !== -1) {
        const cycle = [...stack.slice(cycleAt), key];
        diagnostics.push(diagnostic(C.REFERENCE_CYCLE, `Reference cycle: ${cycle.join(' -> ')}`, '/ref', 'error', { cycle }));
        return { resolved: false, ref, version: requested, diagnostics, cycle };
    }
    if (!entry) {
        diagnostics.push(diagnostic(C.REFERENCE_NOT_FOUND, `Public export not found: ${ref}.`, '/ref', 'error', { ref, requestedVersion: requested }));
        return { resolved: false, ref, version: requested, diagnostics };
    }
    if (requested && entry.version !== requested) {
        diagnostics.push(diagnostic(
            C.VERSION_CONFLICT,
            `${ref} requires ${requested}, but the workspace only exposes ${entry.version}.`,
            '/version',
            'error',
            { ref, requested, available: entry.version }
        ));
        return { resolved: false, ref, version: requested, availableVersion: entry.version, diagnostics };
    }

    const nextStack = [...stack, key];
    if (entry.target) {
        const downstream = resolveExport(catalog, entry.target.ref, entry.target.version, { diagnostics, stack: nextStack });
        const currentManifest = { path: entry.manifestPath, workspacePath: relativeToWork(catalog, entry.manifestPath), hash: entry.manifestHash };
        const manifestInputs = [...new Map([currentManifest, ...(downstream.manifestInputs || [])].map(input => [input.workspacePath, input])).values()];
        if (!downstream.resolved) {
            return {
                ...downstream,
                requestedRef: ref,
                manifestInputs,
                exportPath: [entry.id, ...(downstream.exportPath || [])],
                dependencyPath: [entry.id, ...(downstream.dependencyPath || [])],
            };
        }
        return {
            ...downstream,
            requestedRef: ref,
            requestedVersion: entry.version,
            manifestInputs,
            exportPath: [entry.id, ...downstream.exportPath],
            dependencyPath: [entry.id, ...downstream.dependencyPath],
        };
    }

    const source = readSourceFile(catalog, entry.course, entry.source, diagnostics, `/exports/${entry.id}/source`);
    if (!source) return { resolved: false, ref, version: entry.version, diagnostics, exportPath: [entry.id], dependencyPath: [entry.id] };
    let files = [source];
    let assets = [];
    let cases = [];
    let deliveryFiles = [];
    const manifestInputs = [{ path: entry.manifestPath, workspacePath: relativeToWork(catalog, entry.manifestPath), hash: entry.manifestHash }];

    if (entry.kind === 'unit') {
        let unit;
        try {
            unit = JSON.parse(fs.readFileSync(source.absolutePath, 'utf8'));
        } catch (error) {
            diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `Cannot parse unit ${entry.id}: ${error.message}`, source.workspacePath));
            return { resolved: false, ref, version: entry.version, diagnostics, exportPath: [entry.id], dependencyPath: [entry.id] };
        }
        const validation = validateUnit(unit);
        diagnostics.push(...validation.diagnostics.map(item => ({ ...item, source: source.workspacePath })));
        if (!validation.valid) return { resolved: false, ref, version: entry.version, diagnostics, exportPath: [entry.id], dependencyPath: [entry.id] };
        if (unit.id !== entry.id || unit.version !== entry.version) {
            diagnostics.push(diagnostic(
                C.EXPORT_TARGET_INVALID,
                `Export ${entry.id}@${entry.version} does not match unit ${unit.id}@${unit.version}.`,
                source.workspacePath
            ));
            return { resolved: false, ref, version: entry.version, diagnostics, exportPath: [entry.id], dependencyPath: [entry.id] };
        }
        const descriptorDir = path.posix.dirname(entry.source);
        for (const page of unit.pages) {
            const relativePath = path.posix.normalize(path.posix.join(descriptorDir, page.path));
            const file = readSourceFile(catalog, entry.course, relativePath, diagnostics, `${source.workspacePath}/pages/${page.id}`);
            if (file) files.push(file);
        }

        for (const [field, expectedKind] of [['assets', 'asset'], ['cases', 'case']]) {
            for (const dependencyRef of unit[field] || []) {
                const parts = entityParts(dependencyRef);
                if (!parts || parts.kind !== expectedKind) continue;
                const dependency = resolveExport(catalog, dependencyRef, null, { diagnostics, stack: nextStack });
                if (!dependency.resolved) continue;
                files = mergeFiles(files, dependency.files);
                manifestInputs.push(...dependency.manifestInputs);
                if (field === 'assets') assets.push(dependency.ref);
                else {
                    cases.push(dependency.ref);
                    deliveryFiles.push(...(dependency.deliveryFiles || dependency.files.map(file => `${file.courseId}/${file.path}`)));
                }
            }
        }
    } else if (entry.kind === 'case') {
        let caseDoc;
        try {
            caseDoc = JSON.parse(fs.readFileSync(source.absolutePath, 'utf8'));
        } catch (error) {
            diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `Cannot parse case ${entry.id}: ${error.message}`, source.workspacePath));
            return { resolved: false, ref, version: entry.version, diagnostics, exportPath: [entry.id], dependencyPath: [entry.id] };
        }
        const validation = validateCase(caseDoc);
        diagnostics.push(...validation.diagnostics.map(item => ({ ...item, source: source.workspacePath })));
        if (!validation.valid) return { resolved: false, ref, version: entry.version, diagnostics, exportPath: [entry.id], dependencyPath: [entry.id] };
        if (caseDoc.id !== entry.id || caseDoc.version !== entry.version) {
            diagnostics.push(diagnostic(
                C.EXPORT_TARGET_INVALID,
                `Export ${entry.id}@${entry.version} does not match case ${caseDoc.id}@${caseDoc.version}.`,
                source.workspacePath
            ));
            return { resolved: false, ref, version: entry.version, diagnostics, exportPath: [entry.id], dependencyPath: [entry.id] };
        }
        const descriptorDir = path.posix.dirname(entry.source);
        const visited = new Set([entry.source]);
        for (const material of caseDoc.materials) {
            const materialPath = path.posix.normalize(path.posix.join(descriptorDir, material.path));
            readFileClosure(catalog, entry.course, materialPath, diagnostics, `${source.workspacePath}/materials/${material.id}`, files, visited);
            for (const dependency of material.dependencies || []) {
                const dependencyPath = path.posix.normalize(path.posix.join(descriptorDir, dependency));
                readFileClosure(catalog, entry.course, dependencyPath, diagnostics, `${source.workspacePath}/materials/${material.id}/dependencies`, files, visited);
            }
        }
        if (caseDoc.generator) {
            const scriptPath = path.posix.normalize(path.posix.join(descriptorDir, caseDoc.generator.script));
            readFileClosure(catalog, entry.course, scriptPath, diagnostics, `${source.workspacePath}/generator/script`, files, visited);
            for (const [index, output] of caseDoc.generator.outputs.entries()) {
                const outputPath = path.posix.normalize(path.posix.join(descriptorDir, output.path));
                const before = files.length;
                readFileClosure(catalog, entry.course, outputPath, diagnostics, `${source.workspacePath}/generator/outputs/${index}`, files, visited);
                const outputFile = files.find(file => file.courseId === entry.course.courseId && file.path === outputPath);
                if (files.length === before && !outputFile) continue;
                if (outputFile && outputFile.hash !== output.hash) {
                    diagnostics.push(diagnostic(
                        C.GENERATOR_OUTPUT_INVALID,
                        `Generated output hash does not match: ${output.path}.`,
                        `${source.workspacePath}/generator/outputs/${index}/hash`,
                        'error',
                        { expected: output.hash, actual: outputFile.hash }
                    ));
                }
            }
        }
        deliveryFiles = files.map(file => `${file.courseId}/${file.path}`);
    }

    files = mergeFiles(files);
    const uniqueManifests = new Map(manifestInputs.map(input => [input.workspacePath, input]));
    return {
        resolved: diagnostics.every(item => item.severity !== 'error'),
        requestedRef: ref,
        requestedVersion: entry.version,
        ref: entry.id,
        version: entry.version,
        kind: entry.kind,
        title: entry.title,
        sourcePath: `${entry.course.courseId}/${source.path}`,
        contentHash: contentHash(files),
        files,
        assets: [...new Set(assets)],
        cases: [...new Set(cases)],
        deliveryFiles: [...new Set(deliveryFiles)].sort(),
        manifestInputs: [...uniqueManifests.values()],
        exportPath: [entry.id],
        dependencyPath: [entry.id],
        diagnostics,
    };
}

module.exports = { resolveInside, readSourceFile, contentHash, resolveExport };

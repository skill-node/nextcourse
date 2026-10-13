'use strict';

const fs = require('fs');
const path = require('path');
const { buildCatalog } = require('../composition/catalog');
const { resolveExport } = require('../composition/resolver');
const { listComposeHistory } = require('../composition/editor');
const {
    validateRecipe,
    validateWorkspace,
    traceSource,
    planCourseUpdate,
} = require('../composition/maintenance');
const { parseFrontmatter } = require('../course-model');

function readJson(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch { return null; }
}

function readCourseTitle(courseDir, fallback) {
    const metaPath = path.join(courseDir, 'course.meta.md');
    if (!fs.existsSync(metaPath)) return fallback;
    try {
        const meta = parseFrontmatter(fs.readFileSync(metaPath, 'utf8')).scalars;
        return String(meta.title || fallback).replace(/^['"]|['"]$/g, '');
    } catch {
        return fallback;
    }
}

function recipeOptions(compose) {
    return Object.entries((compose && compose.recipes) || {}).map(([id, recipe]) => ({
        id,
        title: recipe.title || id,
        durationMinutes: recipe.durationMinutes ?? null,
        deliveryProfile: recipe.deliveryProfile || 'slides',
        groupCount: (recipe.groups || []).length,
        itemCount: (recipe.groups || []).reduce((sum, group) => sum + (group.items || []).length, 0),
    }));
}

function diagnosticSummary(diagnostics) {
    return (diagnostics || []).reduce((summary, item) => {
        if (item.severity === 'warning') summary.warnings++;
        else summary.errors++;
        return summary;
    }, { errors: 0, warnings: 0 });
}

function localItemPages(courseDir, item, applySelection = true) {
    if (item.contentMode !== 'local' || !item.local || !item.local.id.includes(':unit:')) return [];
    const descriptor = readJson(path.join(courseDir, item.local.path));
    if (!descriptor || !Array.isArray(descriptor.pages)) return [];
    const descriptorDir = path.posix.dirname(item.local.path);
    let pages = descriptor.pages.map(page => ({
        title: page.id,
        entityId: page.id,
        contentMode: 'local',
        output: path.posix.normalize(path.posix.join(descriptorDir, page.path)),
        previewSource: 'course',
    }));
    if (applySelection && Array.isArray(item.pagePlan)) {
        const byId = new Map(pages.map(page => [page.entityId, page]));
        pages = item.pagePlan.map(id => byId.get(id)).filter(Boolean);
    } else if (applySelection && item.pages && Array.isArray(item.pages.include)) {
        const included = new Set(item.pages.include);
        pages = pages.filter(page => included.has(page.entityId));
    } else if (applySelection && item.pages && Array.isArray(item.pages.omit)) {
        const omitted = new Set(item.pages.omit);
        pages = pages.filter(page => !omitted.has(page.entityId));
    }
    return pages;
}

/**
 * Read-only workspace projection for Studio. Validation stays in the composition
 * domain; this module only shapes its results for a human-facing interface.
 */
function workspaceView(workRoot) {
    const root = path.resolve(workRoot);
    const validation = validateWorkspace(root);
    const catalog = buildCatalog(root);
    const validationByName = new Map(validation.courses.map(course => [course.courseName, course]));
    const courses = catalog.courses.map(course => {
        const compose = readJson(path.join(course.dir, 'course.compose.json'));
        const courseValidation = validationByName.get(course.directoryName);
        const slidesDir = path.join(course.dir, 'slides');
        const slideCount = fs.existsSync(slidesDir)
            ? fs.readdirSync(slidesDir).filter(file => file.endsWith('.html')).length
            : 0;
        return {
            name: course.directoryName,
            title: readCourseTitle(course.dir, course.directoryName),
            courseId: (compose && compose.courseId) || course.courseId || null,
            kind: compose ? 'composed' : 'independent',
            defaultRecipe: compose ? compose.defaultRecipe : null,
            recipes: recipeOptions(compose),
            exportCount: course.manifest ? course.manifest.exports.length : 0,
            slideCount,
            valid: courseValidation ? courseValidation.valid : true,
            diagnostics: diagnosticSummary(courseValidation && courseValidation.diagnostics),
        };
    });
    return {
        root,
        valid: validation.valid,
        summary: {
            courses: courses.length,
            composed: courses.filter(course => course.kind === 'composed').length,
            exports: catalog.exportsById.size,
            ...diagnosticSummary(validation.diagnostics),
        },
        courses,
        diagnostics: validation.diagnostics,
    };
}

function publicLibrary(workRoot) {
    const catalog = buildCatalog(workRoot);
    return Array.from(catalog.exportsById.values())
        .map(entry => {
            const resolution = resolveExport(catalog, entry.id, entry.version);
            let descriptor = null;
            if (resolution.resolved && resolution.kind === 'sequence') {
                descriptor = resolution.descriptor;
            } else if (resolution.resolved && ['unit', 'case'].includes(resolution.kind)) {
                const source = (resolution.files || []).find(file => `${file.courseId}/${file.path}` === resolution.sourcePath);
                if (source) {
                    try { descriptor = JSON.parse(fs.readFileSync(source.absolutePath, 'utf8')); }
                    catch { descriptor = null; }
                }
            }
            return {
                id: entry.id,
                resolvedId: resolution.ref || entry.id,
                kind: entry.kind,
                version: entry.version,
                title: entry.title || entry.id,
                owner: entry.course.courseId || entry.course.directoryName,
                courseName: entry.course.directoryName,
                reexported: Boolean(entry.target),
                sourcePath: resolution.sourcePath || null,
                durationMinutes: descriptor && Number.isInteger(descriptor.durationMinutes) ? descriptor.durationMinutes : null,
                pages: descriptor && Array.isArray(descriptor.pages) ? descriptor.pages.map(page => ({
                    id: page.id,
                    role: page.role,
                    estimatedMinutes: page.estimatedMinutes,
                })) : [],
                outcomes: descriptor && Array.isArray(descriptor.outcomes) ? descriptor.outcomes.map(outcome => ({
                    id: outcome.id,
                    do: outcome.do,
                    bloom: outcome.bloom,
                    evidence: outcome.evidence,
                })) : [],
                cases: resolution.cases || [],
                items: descriptor && Array.isArray(descriptor.items) ? descriptor.items.map(item => ({
                    id: item.id || null,
                    ref: item.ref,
                    plannedMinutes: item.plannedMinutes ?? null,
                })) : [],
            };
        })
        .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
}

function courseView(workRoot, courseName, requestedRecipe) {
    const root = path.resolve(workRoot);
    const courseDir = path.join(root, 'courses', courseName);
    const compose = readJson(path.join(courseDir, 'course.compose.json'));
    if (!compose) {
        if (!fs.existsSync(courseDir)) return null;
        const slidesDir = path.join(courseDir, 'slides');
        const slideFiles = fs.existsSync(slidesDir)
            ? fs.readdirSync(slidesDir).filter(file => file.endsWith('.html')).sort()
            : [];
        const pages = slideFiles.map((file, index) => ({
            index: index + 1,
            title: file,
            entityId: file,
            contentMode: 'local',
            output: `slides/${file}`,
        }));
        return {
            name: courseName,
            title: readCourseTitle(courseDir, courseName),
            courseId: null,
            kind: 'independent',
            recipeId: 'independent',
            recipes: [{ id: 'independent', durationMinutes: null, deliveryProfile: 'slides', groupCount: 1, itemCount: 1 }],
            recipe: {
                title: '现有课件',
                durationMinutes: null,
                deliveryProfile: 'slides',
                groups: [{
                    id: 'existing-slides',
                    title: '现有课件',
                    moduleNumber: null,
                    plannedMinutes: null,
                    items: [{
                        id: 'independent-slides',
                        title: slideFiles.length ? `${slideFiles.length} 张现有页面` : '尚无课件页面',
                        ref: null,
                        contentMode: 'local',
                        updatePolicy: 'frozen',
                        plannedMinutes: null,
                        selectedPages: null,
                        operationCount: 0,
                        outcomeMap: {},
                        caseOverrides: [],
                        pages,
                        source: null,
                        diagnostics: [],
                    }],
                }],
            },
            validation: {
                valid: true,
                estimatedMinutes: null,
                generated: { present: fs.existsSync(path.join(courseDir, 'deck.html')), clean: null },
                diagnostics: [],
                summary: { errors: 0, warnings: 0 },
            },
            update: { valid: true, applicable: false, planId: null, changes: [], conflicts: [] },
            preview: { available: pages.length > 0, pageCount: pages.length, pages },
        };
    }
    const recipeId = requestedRecipe && compose.recipes[requestedRecipe]
        ? requestedRecipe
        : compose.defaultRecipe;
    const recipe = compose.recipes[recipeId];
    if (!recipe) return null;

    const validation = validateRecipe(root, courseName, recipeId);
    const update = planCourseUpdate(root, courseName, recipeId);
    const manifest = readJson(path.join(courseDir, '.build', recipeId, 'build.manifest.json'));
    const history = listComposeHistory(root, courseName);
    const pagesByOccurrence = new Map();
    for (const page of (manifest && manifest.pages) || []) {
        if (!pagesByOccurrence.has(page.occurrenceId)) pagesByOccurrence.set(page.occurrenceId, []);
        pagesByOccurrence.get(page.occurrenceId).push({
            index: page.index,
            title: page.entityId,
            entityId: page.entityId,
            contentMode: page.contentMode,
            output: page.output,
            previewSource: 'build',
        });
    }

    if (!manifest) {
        let pageIndex = 0;
        for (const group of recipe.groups || []) {
            for (const item of group.items || []) {
                const pages = localItemPages(courseDir, item).map(page => ({ ...page, occurrenceId: item.id, index: ++pageIndex }));
                if (pages.length) pagesByOccurrence.set(item.id, pages);
            }
        }
    }

    const groups = (recipe.groups || []).map((group, groupIndex) => ({
        id: group.id,
        title: group.title,
        moduleNumber: group.moduleNumber === undefined ? groupIndex + 1 : group.moduleNumber,
        plannedMinutes: group.plannedMinutes ?? null,
        sourceSequence: group.sourceSequence || null,
        items: (group.items || []).map(item => {
            const query = item.id;
            const trace = traceSource(root, courseName, query, recipeId);
            return {
                id: item.id,
                title: item.ref || (item.local && item.local.id) || item.id,
                ref: item.ref || null,
                contentMode: item.contentMode,
                updatePolicy: item.updatePolicy,
                plannedMinutes: item.plannedMinutes ?? null,
                selectedPages: item.pages || null,
                pagePlan: item.pagePlan || null,
                availablePages: item.contentMode === 'local'
                    ? localItemPages(courseDir, item, false)
                    : (pagesByOccurrence.get(item.id) || []),
                operationCount: (item.operations || []).length,
                outcomeMap: item.outcomeMap || {},
                caseOverrides: item.caseOverrides || [],
                pages: pagesByOccurrence.get(item.id) || [],
                source: trace.matches[0] || null,
                diagnostics: trace.diagnostics,
            };
        }),
    }));

    return {
        name: courseName,
        title: readCourseTitle(courseDir, courseName),
        courseId: compose.courseId,
        kind: 'composed',
        recipeId,
        composeHash: history.currentHash || null,
        history: history.versions || [],
        recipes: recipeOptions(compose),
        recipe: {
            title: recipe.title || recipeId,
            durationMinutes: recipe.durationMinutes ?? null,
            deliveryProfile: recipe.deliveryProfile || 'slides',
            groups,
        },
        validation: {
            valid: validation.valid,
            estimatedMinutes: validation.estimatedMinutes ?? null,
            generated: validation.generated || { present: false, clean: null },
            diagnostics: validation.diagnostics,
            summary: diagnosticSummary(validation.diagnostics),
        },
        update: {
            valid: update.valid,
            applicable: update.applicable,
            planId: update.planId || null,
            changes: update.changes || [],
            conflicts: update.conflicts || [],
        },
        preview: pagesByOccurrence.size ? {
            available: true,
            pageCount: [...pagesByOccurrence.values()].reduce((sum, pages) => sum + pages.length, 0),
            pages: [...pagesByOccurrence.values()].flat().map(page => ({
                index: page.index,
                entityId: page.entityId,
                occurrenceId: page.occurrenceId,
                contentMode: page.contentMode,
                output: page.output,
                previewSource: page.previewSource,
            })),
        } : { available: false, pageCount: 0, pages: [] },
    };
}

module.exports = { workspaceView, courseView, publicLibrary, diagnosticSummary };

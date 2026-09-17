'use strict';

const fs = require('fs');
const path = require('path');
const { sha256 } = require('./baseline');
const { validateExportsManifest } = require('./contracts');
const { DIAGNOSTIC_CODES: C, diagnostic } = require('./diagnostics');

function buildCatalog(workRoot) {
    const root = path.resolve(workRoot);
    const coursesRoot = path.join(root, 'courses');
    const courses = [];
    const exportsById = new Map();
    const coursesById = new Map();
    const diagnostics = [];

    if (!fs.existsSync(coursesRoot)) return { root, coursesRoot, courses, coursesById, exportsById, diagnostics };

    const directories = fs.readdirSync(coursesRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

    for (const entry of directories) {
        const courseDir = path.join(coursesRoot, entry.name);
        const manifestPath = path.join(courseDir, 'course.exports.json');
        const course = { directoryName: entry.name, dir: courseDir, manifestPath: null, manifest: null, manifestHash: null };
        courses.push(course);
        if (!fs.existsSync(manifestPath)) continue;

        let bytes;
        let manifest;
        try {
            bytes = fs.readFileSync(manifestPath);
            manifest = JSON.parse(bytes.toString('utf8'));
        } catch (error) {
            diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `Cannot read course.exports.json: ${error.message}`, `courses/${entry.name}/course.exports.json`));
            continue;
        }
        course.manifestPath = manifestPath;
        course.manifest = manifest;
        course.manifestHash = sha256(bytes);
        const validation = validateExportsManifest(manifest);
        diagnostics.push(...validation.diagnostics.map(item => ({ ...item, course: entry.name })));
        if (!validation.valid) continue;

        course.courseId = manifest.courseId;
        if (coursesById.has(manifest.courseId)) {
            diagnostics.push(diagnostic(
                C.ENTITY_DUPLICATE,
                `courseId ${manifest.courseId} is registered by more than one directory.`,
                `courses/${entry.name}/course.exports.json/courseId`,
                'error',
                { directories: [coursesById.get(manifest.courseId).directoryName, entry.name] }
            ));
            continue;
        }
        coursesById.set(manifest.courseId, course);

        for (const exported of manifest.exports) {
            if (exportsById.has(exported.id)) {
                diagnostics.push(diagnostic(
                    C.ENTITY_DUPLICATE,
                    `Export ${exported.id} is registered more than once.`,
                    `courses/${entry.name}/course.exports.json`,
                    'error'
                ));
                continue;
            }
            exportsById.set(exported.id, { ...exported, course, manifestPath, manifestHash: course.manifestHash });
        }
    }
    return { root, coursesRoot, courses, coursesById, exportsById, diagnostics };
}

module.exports = { buildCatalog };

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sha256 } = require('./baseline');
const { validateCase, validateComposeManifest, validateLockManifest } = require('./contracts');
const { DIAGNOSTIC_CODES: C, diagnostic } = require('./diagnostics');
const { loadSnapshot } = require('./lock');
const { resolveInside } = require('./resolver');
const { wrapDocument, accentFromTheme } = require('../render-md');

function readJson(filePath, diagnostics, displayPath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `Cannot read JSON: ${error.message}`, displayPath));
        return null;
    }
}

function linkedPaths(text) {
    const values = [];
    for (const match of String(text).matchAll(/\b(?:src|href)=(['"])([^'"]+)\1/gi)) values.push(match[2]);
    for (const match of String(text).matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi)) values.push(match[2]);
    return values.filter(value => !/^(?:https?:|data:|#|mailto:|javascript:|\/)/i.test(value));
}

function snapshotFiles(snapshot) {
    const files = new Map();
    for (const file of snapshot.manifest.files) {
        const sourcePath = `${file.courseId}/${file.path}`;
        const absolutePath = resolveInside(snapshot.dir, file.storedPath);
        if (absolutePath) files.set(sourcePath, { ...file, sourcePath, absolutePath });
    }
    return files;
}

function descriptorRelative(descriptorSourcePath, relativePath) {
    const courseId = descriptorSourcePath.split('/')[0];
    const coursePath = descriptorSourcePath.slice(courseId.length + 1);
    return `${courseId}/${path.posix.normalize(path.posix.join(path.posix.dirname(coursePath), relativePath))}`;
}

function materialClosure(caseRecord, material, diagnostics) {
    const output = new Map();
    const queue = [
        descriptorRelative(caseRecord.sourcePath, material.path),
        ...(material.dependencies || []).map(dependency => descriptorRelative(caseRecord.sourcePath, dependency)),
    ];
    const caseRoot = `${caseRecord.sourcePath.split('/')[0]}/${path.posix.dirname(caseRecord.sourcePath.slice(caseRecord.sourcePath.indexOf('/') + 1))}`;
    while (queue.length) {
        const sourcePath = queue.shift();
        if (output.has(sourcePath)) continue;
        if (sourcePath !== caseRoot && !sourcePath.startsWith(`${caseRoot}/`)) {
            diagnostics.push(diagnostic(C.PATH_INVALID, `Case dependency escapes its case directory: ${sourcePath}.`, caseRecord.sourcePath));
            continue;
        }
        const file = caseRecord.files.get(sourcePath);
        if (!file) {
            diagnostics.push(diagnostic(C.ASSET_MISSING, `Locked case material is missing: ${sourcePath}.`, caseRecord.sourcePath));
            continue;
        }
        output.set(sourcePath, file);
        if (!/\.(?:html?|css)$/i.test(sourcePath)) continue;
        const text = fs.readFileSync(file.absolutePath, 'utf8');
        const sourceDir = path.posix.dirname(sourcePath);
        for (const value of linkedPaths(text)) {
            const pathPart = value.split(/[?#]/, 1)[0];
            if (pathPart) queue.push(path.posix.normalize(path.posix.join(sourceDir, pathPart)));
        }
    }
    return [...output.values()];
}

function audienceFiles(caseRecord, audience, diagnostics) {
    const output = new Map();
    const allowed = audience === 'student'
        ? material => material.audience === 'student' || material.audience === 'both'
        : () => true;
    const materialsByPath = new Map(caseRecord.doc.materials.map(material => [descriptorRelative(caseRecord.sourcePath, material.path), material]));
    for (const material of caseRecord.doc.materials.filter(allowed)) {
        for (const file of materialClosure(caseRecord, material, diagnostics)) {
            const declared = materialsByPath.get(file.sourcePath);
            if (audience === 'student' && declared && !allowed(declared)) {
                diagnostics.push(diagnostic(
                    C.DELIVERY_AUDIENCE_LEAK,
                    `Student material links facilitator-only material ${declared.id}.`,
                    caseRecord.sourcePath,
                    'error',
                    { caseId: caseRecord.doc.id, materialId: material.id, leakedMaterialId: declared.id }
                ));
                continue;
            }
            output.set(file.sourcePath, file);
        }
    }
    if (audience === 'facilitator' && caseRecord.doc.generator) {
        for (const relativePath of [
            caseRecord.doc.generator.script,
            ...caseRecord.doc.generator.outputs.map(entry => entry.path),
        ]) {
            const sourcePath = descriptorRelative(caseRecord.sourcePath, relativePath);
            const file = caseRecord.files.get(sourcePath);
            if (file) output.set(sourcePath, file);
        }
    }
    return [...output.values()];
}

function planDeliveryPackage(workRoot, courseName, recipeId) {
    const root = path.resolve(workRoot);
    const coursesRoot = path.join(root, 'courses');
    const courseDir = path.join(coursesRoot, courseName);
    const diagnostics = [];
    const composePath = path.join(courseDir, 'course.compose.json');
    const lockPath = path.join(courseDir, 'course.lock.json');
    const compose = readJson(composePath, diagnostics, `courses/${courseName}/course.compose.json`);
    const lock = readJson(lockPath, diagnostics, `courses/${courseName}/course.lock.json`);
    if (!compose || !lock) return { valid: false, diagnostics, courseName, cases: [] };
    diagnostics.push(...validateComposeManifest(compose).diagnostics, ...validateLockManifest(lock).diagnostics);
    const composeHash = sha256(fs.readFileSync(composePath));
    if (lock.composeHash !== composeHash) {
        diagnostics.push(diagnostic(C.SOURCE_DRIFT, 'course.compose.json changed after this lock was accepted.', 'course.compose.json'));
    }
    const selectedRecipe = recipeId || compose.defaultRecipe;
    const recipe = compose.recipes && compose.recipes[selectedRecipe];
    if (!recipe || lock.recipeId !== selectedRecipe) {
        diagnostics.push(diagnostic(C.RECIPE_NOT_FOUND, `Accepted lock is not for recipe ${selectedRecipe}.`, '/recipeId'));
    }
    if (!recipe || !['slides+lab', 'full'].includes(recipe.deliveryProfile)) {
        diagnostics.push(diagnostic(C.DELIVERY_PROFILE_INVALID, 'Composed package requires deliveryProfile slides+lab or full.', `/recipes/${selectedRecipe}/deliveryProfile`));
    }
    if (recipe && recipe.deliveryProfile === 'full') {
        const sourceRoot = path.join(courseDir, 'package-src', selectedRecipe);
        const required = [
            'facilitator/1_facilitator-guide.md',
            'student/2_workbook.md',
            'facilitator/3_rubric.md',
            'student/4_action-plan.md',
            'facilitator/5_assessment.md',
            'facilitator/6_facilitation.md',
            'facilitator/7_alignment.md',
            'facilitator/8_content-dev.md',
        ];
        const missing = required.filter(relativePath => !fs.existsSync(path.join(sourceRoot, relativePath)));
        if (missing.length) {
            diagnostics.push(diagnostic(
                C.DELIVERY_PROFILE_INVALID,
                `full delivery is missing ${missing.length} package source document(s).`,
                `package-src/${selectedRecipe}`,
                'error',
                { missing }
            ));
        }
    }
    const cases = new Map();
    for (const reference of lock.references || []) {
        const wanted = new Set(reference.cases || []);
        if (reference.ref && reference.ref.includes(':case:')) wanted.add(reference.ref);
        if (!wanted.size) continue;
        const snapshot = loadSnapshot(coursesRoot, reference);
        diagnostics.push(...snapshot.diagnostics);
        if (!snapshot.valid) continue;
        const files = snapshotFiles(snapshot);
        for (const file of files.values()) {
            if (!file.path.endsWith('.json')) continue;
            let doc;
            try { doc = JSON.parse(fs.readFileSync(file.absolutePath, 'utf8')); } catch { continue; }
            if (!doc || !wanted.has(doc.id)) continue;
            const validation = validateCase(doc);
            diagnostics.push(...validation.diagnostics.map(entry => ({ ...entry, source: file.sourcePath })));
            if (!validation.valid) continue;
            const record = {
                id: doc.id,
                version: doc.version,
                title: doc.title,
                doc,
                sourcePath: file.sourcePath,
                contentHash: reference.contentHash,
                snapshotPath: reference.snapshotPath,
                files,
            };
            record.studentFiles = audienceFiles(record, 'student', diagnostics);
            record.facilitatorFiles = audienceFiles(record, 'facilitator', diagnostics);
            cases.set(doc.id, record);
        }
        for (const caseId of wanted) {
            if (!cases.has(caseId)) diagnostics.push(diagnostic(C.CASE_ANSWER_MISSING, `Locked case descriptor not found: ${caseId}.`, reference.snapshotPath));
        }
    }
    if (recipe && ['slides+lab', 'full'].includes(recipe.deliveryProfile) && cases.size === 0) {
        diagnostics.push(diagnostic(C.CASE_ANSWER_MISSING, 'slides+lab/full delivery requires at least one locked case.', `/recipes/${selectedRecipe}`));
    }
    return {
        valid: diagnostics.every(entry => entry.severity !== 'error'),
        diagnostics,
        root,
        coursesRoot,
        courseDir,
        courseName,
        courseId: compose.courseId,
        recipeId: selectedRecipe,
        deliveryProfile: recipe && recipe.deliveryProfile,
        cases: [...cases.values()].sort((a, b) => a.id.localeCompare(b.id, 'en')),
    };
}

function casePackagePath(caseId) {
    const [ownerId, , localId] = caseId.split(':');
    return path.posix.join(ownerId, localId);
}

function materialLink(caseRecord, material) {
    return `../materials/${casePackagePath(caseRecord.id)}/${material.path}`;
}

function studentWorkbook(plan, title) {
    const out = [`# 学员练习手册`, '', `> ${title} · ${plan.deliveryProfile}`, ''];
    for (const caseRecord of plan.cases) {
        const doc = caseRecord.doc;
        out.push(`## ${doc.title}`, '', `**输入**：${doc.input}`, '', `**任务**：${doc.task}`, '', `**预期产出**：${doc.expectedOutput}`, '');
        out.push('### 练习材料', '');
        for (const material of doc.materials.filter(entry => entry.audience === 'student' || entry.audience === 'both')) {
            out.push(`- [${material.title}](${materialLink(caseRecord, material)}) · ${material.role}`);
        }
        out.push('', '### 我的产出', '', '<!-- fill:6 -->', '');
    }
    return `${out.join('\n')}\n`;
}

function facilitatorGuide(plan, title) {
    const out = [`# 讲师运行手册`, '', `> ${title} · ${plan.deliveryProfile}`, ''];
    for (const caseRecord of plan.cases) {
        const doc = caseRecord.doc;
        out.push(`## ${doc.title}`, '', `**任务**：${doc.task}`, '', `**验收产出**：${doc.expectedOutput}`, '');
        out.push('### 材料与发放', '');
        for (const material of doc.materials) {
            out.push(`- [${material.title}](${materialLink(caseRecord, material)}) · ${material.role} · ${material.audience}`);
        }
        const answer = doc.materials.find(entry => entry.id === doc.answerMaterial);
        const rubric = doc.materials.find(entry => entry.id === doc.rubricMaterial);
        out.push('', `**参考答案**：${answer ? `[${answer.title}](${materialLink(caseRecord, answer)})` : '缺失'}`);
        out.push('', `**验收量规**：${rubric ? `[${rubric.title}](${materialLink(caseRecord, rubric)})` : '缺失'}`, '');
        if (doc.generator) {
            out.push('### 材料生成记录', '', `- 脚本：\`${doc.generator.script}\``, `- seed：\`${doc.generator.seed}\``,
                `- 参数：\`${JSON.stringify(doc.generator.parameters)}\``,
                ...doc.generator.outputs.map(entry => `- 产物：\`${entry.path}\` · \`${entry.hash}\``), '');
        }
    }
    return `${out.join('\n')}\n`;
}

function metaTitle(courseDir, fallback) {
    const metaPath = path.join(courseDir, 'course.meta.md');
    if (!fs.existsSync(metaPath)) return fallback;
    const match = fs.readFileSync(metaPath, 'utf8').match(/^title:\s*["']?(.+?)["']?\s*$/m);
    return match ? match[1] : fallback;
}

function verifyGeneratedPackage(outputRoot) {
    const manifestPath = path.join(outputRoot, 'package.manifest.json');
    if (!fs.existsSync(outputRoot)) return { clean: true };
    if (!fs.existsSync(manifestPath)) return { clean: false, reason: 'missing package.manifest.json' };
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch { return { clean: false, reason: 'invalid package.manifest.json' }; }
    for (const output of manifest.outputs || []) {
        const filePath = resolveInside(outputRoot, output.path);
        if (!filePath || !fs.existsSync(filePath) || sha256(fs.readFileSync(filePath)) !== output.hash) {
            return { clean: false, reason: `generated package file changed: ${output.path}` };
        }
    }
    return { clean: true };
}

function writeIfMissing(filePath, content) {
    if (fs.existsSync(filePath)) return false;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, { encoding: 'utf8', flag: 'wx' });
    return true;
}

function copyAudienceMaterials(plan, audience, destination, outputs) {
    for (const caseRecord of plan.cases) {
        const files = audience === 'student' ? caseRecord.studentFiles : caseRecord.facilitatorFiles;
        const courseId = caseRecord.sourcePath.split('/')[0];
        const descriptorPath = caseRecord.sourcePath.slice(courseId.length + 1);
        const descriptorDir = path.posix.dirname(descriptorPath);
        for (const file of files) {
            const relativeCoursePath = file.sourcePath.slice(file.sourcePath.indexOf('/') + 1);
            const relativeToCase = path.posix.relative(descriptorDir, relativeCoursePath);
            const outputPath = path.posix.join(audience, 'materials', casePackagePath(caseRecord.id), relativeToCase);
            const target = resolveInside(destination, outputPath);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(file.absolutePath, target);
            outputs.push({ path: outputPath, hash: sha256(fs.readFileSync(target)), audience, caseId: caseRecord.id });
        }
    }
}

function renderAudienceSources(sourceDir, audienceDir, title, css, accent, outputs) {
    const htmlDir = path.join(audienceDir, 'html');
    fs.mkdirSync(htmlDir, { recursive: true });
    const files = fs.existsSync(sourceDir) ? fs.readdirSync(sourceDir).filter(file => file.endsWith('.md')).sort() : [];
    for (const file of files) {
        const md = fs.readFileSync(path.join(sourceDir, file), 'utf8');
        if (/\]\(\.\.\/\.\.\/|\]\([^)]*facilitator\//i.test(md) && path.basename(sourceDir) === 'student') {
            throw new Error(`Student Markdown links outside its material package: ${file}`);
        }
        const docTitle = (md.match(/^#\s+(.*)$/m) || [, file.replace(/\.md$/, '')])[1];
        const outputPath = path.join(htmlDir, file.replace(/\.md$/, '.html'));
        fs.writeFileSync(outputPath, wrapDocument({ title: docTitle, subtitle: title, md, css, accent }), 'utf8');
        outputs.push({ path: path.relative(path.dirname(audienceDir), outputPath).split(path.sep).join('/'), hash: sha256(fs.readFileSync(outputPath)) });
    }
    const indexMd = ['# 交付包', '', ...files.map(file => `- [${file.replace(/^\d+_/, '').replace(/\.md$/, '')}](./${file.replace(/\.md$/, '.html')})`), ''].join('\n');
    const indexPath = path.join(htmlDir, '0_index.html');
    fs.writeFileSync(indexPath, wrapDocument({ title: '交付包', subtitle: title, md: indexMd, css, accent, toc: false }), 'utf8');
    outputs.push({ path: path.relative(path.dirname(audienceDir), indexPath).split(path.sep).join('/'), hash: sha256(fs.readFileSync(indexPath)) });
}

function packageComposedCourse(workRoot, packageRoot, courseName, recipeId, options = {}) {
    const plan = planDeliveryPackage(workRoot, courseName, recipeId);
    const diagnostics = [...plan.diagnostics];
    if (!plan.valid) return { packaged: false, diagnostics, plan };
    const buildRoot = path.join(plan.courseDir, '.build', plan.recipeId);
    const outputRoot = path.join(buildRoot, 'package');
    const existing = verifyGeneratedPackage(outputRoot);
    if (!existing.clean) {
        diagnostics.push(diagnostic(C.GENERATED_DRIFT, existing.reason, path.relative(plan.root, outputRoot).split(path.sep).join('/')));
        return { packaged: false, diagnostics, plan };
    }
    const title = metaTitle(plan.courseDir, courseName);
    const sourceRoot = path.join(plan.courseDir, 'package-src', plan.recipeId);
    const writtenSources = [];
    const studentSource = path.join(sourceRoot, 'student', '2_workbook.md');
    const facilitatorSource = path.join(sourceRoot, 'facilitator', '1_facilitator-guide.md');
    if (writeIfMissing(studentSource, studentWorkbook(plan, title))) writtenSources.push(studentSource);
    if (writeIfMissing(facilitatorSource, facilitatorGuide(plan, title))) writtenSources.push(facilitatorSource);

    fs.mkdirSync(buildRoot, { recursive: true });
    const temporary = fs.mkdtempSync(path.join(buildRoot, '.tmp-package-'));
    const outputs = [];
    try {
        copyAudienceMaterials(plan, 'student', temporary, outputs);
        copyAudienceMaterials(plan, 'facilitator', temporary, outputs);
        if (options.render) {
            const cssPath = path.join(packageRoot, 'shared_styles', 'package-doc.css');
            const css = fs.readFileSync(cssPath, 'utf8');
            const metaPath = path.join(plan.courseDir, 'course.meta.md');
            const theme = fs.existsSync(metaPath) ? ((fs.readFileSync(metaPath, 'utf8').match(/^theme:\s*["']?(.+?)["']?\s*$/m) || [])[1] || 'standard-default') : 'standard-default';
            const accent = accentFromTheme(packageRoot, theme);
            renderAudienceSources(path.join(sourceRoot, 'student'), path.join(temporary, 'student'), title, css, accent, outputs);
            renderAudienceSources(path.join(sourceRoot, 'facilitator'), path.join(temporary, 'facilitator'), title, css, accent, outputs);
        }
        const sourceHashes = [];
        for (const audience of ['student', 'facilitator']) {
            const dir = path.join(sourceRoot, audience);
            for (const file of fs.readdirSync(dir).filter(entry => entry.endsWith('.md')).sort()) {
                sourceHashes.push({ path: `${audience}/${file}`, hash: sha256(fs.readFileSync(path.join(dir, file))) });
            }
        }
        const manifest = {
            schemaVersion: 1,
            courseId: plan.courseId,
            recipeId: plan.recipeId,
            deliveryProfile: plan.deliveryProfile,
            cases: plan.cases.map(record => ({ id: record.id, version: record.version, contentHash: record.contentHash })),
            sources: sourceHashes,
            outputs: outputs.slice().sort((a, b) => a.path.localeCompare(b.path, 'en')),
        };
        fs.writeFileSync(path.join(temporary, 'package.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
        let backup = null;
        if (fs.existsSync(outputRoot)) {
            backup = `${outputRoot}.old-${crypto.randomUUID()}`;
            fs.renameSync(outputRoot, backup);
        }
        try {
            fs.renameSync(temporary, outputRoot);
            if (backup) fs.rmSync(backup, { recursive: true, force: true });
        } catch (error) {
            if (backup && !fs.existsSync(outputRoot)) fs.renameSync(backup, outputRoot);
            throw error;
        }
        return { packaged: true, diagnostics, plan, sourceRoot, outputRoot, writtenSources, outputs: manifest.outputs };
    } catch (error) {
        if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true, force: true });
        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `Could not build composed package: ${error.message}`, `package-src/${plan.recipeId}`));
        return { packaged: false, diagnostics, plan, sourceRoot, writtenSources };
    }
}

module.exports = { planDeliveryPackage, packageComposedCourse, verifyGeneratedPackage };

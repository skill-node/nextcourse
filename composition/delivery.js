'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sha256 } = require('./baseline');
const { validateCase, validateComposeManifest, validateLockManifest } = require('./contracts');
const { DIAGNOSTIC_CODES: C, diagnostic } = require('./diagnostics');
const { loadSnapshot } = require('./lock');
const { recipeLockPath, lockMatchesRecipe } = require('./recipe-lock');
const { recipeDesignSources } = require('./design-sources');
const { resolveInside } = require('./resolver');
const { wrapDocument, accentFromTheme } = require('../render-md');
const { documentInfo, rewriteMarkdownLinks, writeCatalog } = require('../delivery-navigation');

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
    const compose = readJson(composePath, diagnostics, `courses/${courseName}/course.compose.json`);
    if (!compose) return { valid: false, diagnostics, courseName, cases: [] };
    const selectedRecipe = recipeId || compose.defaultRecipe;
    const lockPath = recipeLockPath(courseDir, compose, selectedRecipe);
    const lock = readJson(lockPath, diagnostics, path.relative(root, lockPath).split(path.sep).join('/'));
    if (!compose || !lock) return { valid: false, diagnostics, courseName, cases: [] };
    diagnostics.push(...validateComposeManifest(compose).diagnostics, ...validateLockManifest(lock).diagnostics);
    const composeHash = sha256(fs.readFileSync(composePath));
    if (!lockMatchesRecipe(lock, compose, composeHash, selectedRecipe)) {
        diagnostics.push(diagnostic(C.SOURCE_DRIFT, 'course.compose.json changed after this lock was accepted.', 'course.compose.json'));
    }
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
    const design = recipe && recipeDesignSources(courseDir, recipe);
    if (design) diagnostics.push(...design.diagnostics);
    return {
        valid: diagnostics.every(entry => entry.severity !== 'error'),
        diagnostics,
        metaPath: design && design.files.find(file => file.output === 'course.meta.md')?.absolutePath,
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
    const relativePath = `../materials/${casePackagePath(caseRecord.id)}/${material.path}`;
    return relativePath.split('/').map(segment => encodeURIComponent(segment)
        .replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
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

function metaTitle(metaPath, fallback) {
    if (!(metaPath && fs.existsSync(metaPath))) return fallback;
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

function renderAudienceSources(sourceDir, audienceDir, title, css, accent, outputs, plan, metadata) {
    const audience = path.basename(audienceDir);
    const htmlDir = path.join(audienceDir, 'html');
    fs.mkdirSync(htmlDir, { recursive: true });
    const files = fs.existsSync(sourceDir) ? fs.readdirSync(sourceDir).filter(file => file.endsWith('.md')).sort((a,b)=>a.localeCompare(b,'en',{numeric:true})) : [];
    const rendered = [];
    // Material task/answer/rubric Markdown uses the existing document renderer.
    for (const record of plan.cases) {
        const descriptorDir = path.posix.dirname(record.sourcePath.slice(record.sourcePath.indexOf('/') + 1));
        for (const file of audience === 'student' ? record.studentFiles : record.facilitatorFiles) {
            if (!file.sourcePath.endsWith('.md')) continue;
            const coursePath = file.sourcePath.slice(file.sourcePath.indexOf('/') + 1);
            const relative = path.posix.join('materials', casePackagePath(record.id), path.posix.relative(descriptorDir, coursePath));
            const md = fs.readFileSync(file.absolutePath, 'utf8');
            rendered.push({ output: path.join(audienceDir, relative.replace(/\.md$/, '.html')), md, title: (md.match(/^#\s+(.+)$/m)||[])[1] || record.title });
        }
    }
    const documents = [];
    for (const file of files) {
        const md = fs.readFileSync(path.join(sourceDir, file), 'utf8');
        if (/\]\(\.\.\/\.\.\/|\]\([^)]*facilitator\//i.test(md) && audience === 'student') {
            throw new Error(`Student Markdown links outside its material package: ${file}`);
        }
        const info = documentInfo(file, md, audience);
        documents.push({ ...info, href: `html/${file.replace(/\.md$/, '.html')}`, location: `${audience}/html/${file.replace(/\.md$/, '.html')}` });
        rendered.push({ output: path.join(htmlDir, file.replace(/\.md$/, '.html')), md, title: info.title });
    }
    for (const row of rendered) fs.writeFileSync(row.output, wrapDocument({title:row.title, subtitle:title, md:row.md, css, accent}));
    for (const row of rendered) {
        fs.writeFileSync(row.output, wrapDocument({title:row.title, subtitle:title, md:rewriteMarkdownLinks(row.md,row.output,audienceDir), css, accent}));
        outputs.push({path: path.relative(path.dirname(audienceDir), row.output).split(path.sep).join('/'), hash:sha256(fs.readFileSync(row.output))});
    }
    const maintenanceFiles = [];
    const isMaintenance = (record, relative, audienceValue) => {
        if (audience !== 'facilitator' || audienceValue === 'student' || audienceValue === 'both') return false;
        const script = record.doc.generator?.script;
        const scriptDir = script && path.posix.dirname(script);
        return (metadata.cases?.[record.id]?.maintenancePaths || []).includes(relative) || relative === script || (scriptDir && scriptDir !== '.' && relative.startsWith(scriptDir+'/'));
    };
    for (const record of plan.cases) {
        const descriptorDir = path.posix.dirname(record.sourcePath.slice(record.sourcePath.indexOf('/')+1));
        for (const file of record.facilitatorFiles) {
            const relative = path.posix.relative(descriptorDir,file.sourcePath.slice(file.sourcePath.indexOf('/')+1));
            const declared = record.doc.materials.find(m=>m.path===relative);
            if (isMaintenance(record,relative,declared?.audience || 'facilitator')) {
                const target = `materials/${casePackagePath(record.id)}/${relative}`;
                maintenanceFiles.push(target);
                if (relative.endsWith('.md')) maintenanceFiles.push(target.replace(/\.md$/,'.html'));
            }
        }
    }
    const roleNames = { input:'练习输入', worksheet:'任务说明', answer:'讲师参考答案', rubric:'案例评分量规', reference:'参考材料', output:'产出示例' };
    const cases = plan.cases.slice().sort((a,b)=>a.id.localeCompare(b.id,'en')).map(record => {
        const spec = metadata.cases?.[record.id] || {};
        const rows = record.doc.materials.filter(m => (audience !== 'student' || m.audience !== 'facilitator') && !isMaintenance(record,m.path,m.audience)).map(m => {
            const href = `materials/${casePackagePath(record.id)}/${m.path.replace(/\.md$/, '.html')}`;
            const basename = path.posix.basename(m.path);
            const materialMd = m.path.endsWith('.md') ? fs.readFileSync(path.join(audienceDir,'materials',casePackagePath(record.id),m.path),'utf8') : '';
            const humanTitle = (materialMd.match(/^#\s+(.+)$/m)||[])[1] || m.title;
            const label = /^(?:task|answer|rubric)\.md$/.test(basename) ? ({'task.md':'任务说明','answer.md':'讲师参考答案','rubric.md':'评分量规'})[basename] : humanTitle;
            return {title:label, href, description:roleNames[m.role]||'案例材料', location:`${audience}/${href}`};
        });
        if (audience === 'facilitator') for (const release of spec.releases || []) {
            for (const rel of release.paths) {
                const material = record.doc.materials.find(m=>m.path === rel && m.audience !== 'facilitator');
                if (!material) throw new Error(`Release path is not a student material: ${record.id}/${rel}`);
                const source = path.join(audienceDir,'materials',casePackagePath(record.id),rel);
                const target = path.join(audienceDir,'release',casePackagePath(record.id),`stage-${release.stage}`,path.posix.basename(rel));
                fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
                outputs.push({path:path.relative(path.dirname(audienceDir),target).split(path.sep).join('/'),hash:sha256(fs.readFileSync(target))});
                rows.push({title:`第${release.stage}阶段发放：${path.posix.basename(rel)}`, href:path.relative(audienceDir,target).split(path.sep).join('/'), description:release.when, location:path.relative(path.dirname(audienceDir),target).split(path.sep).join('/')});
            }
        }
        return { title:record.title, description:[spec.stage,spec.description].filter(Boolean).join(' · '), rows };
    });
    const stageOrder = d => d.stage.startsWith('课前') ? 0 : d.stage==='课中' ? 1 : 2;
    documents.sort((a,b)=>stageOrder(a)-stageOrder(b));
    const catalog = {documents,cases,maintenanceFiles};
    const catalogPath = path.join(audienceDir,'catalog.json');
    fs.writeFileSync(catalogPath,JSON.stringify(catalog,null,2)+'\n');
    outputs.push({path:path.relative(path.dirname(audienceDir),catalogPath).split(path.sep).join('/'),hash:sha256(fs.readFileSync(catalogPath))});
    const sections = [
        {title:audience==='student'?'学员资料':'授课资料',open:true,rows:documents.filter(d=>d.kind!=='design' && d.kind!=='technical')},
        {title:'课件技术说明',rows:documents.filter(d=>d.kind==='technical')},
        {title:'课程设计参考',rows:documents.filter(d=>d.kind==='design')},
        {title:audience==='student'?'案例与练习材料':'案例、答案与发放材料',open:true,rows:cases},
    ];
    for (const [file,prefix] of [[path.join(audienceDir,'index.html'),''],[path.join(htmlDir,'0_index.html'),'../']]) {
        writeCatalog({file,title:audience==='student'?'学员资料':'授课资料',subtitle:title,sections,css,prefix,intro:audience==='student'?'按讲师指定时点使用材料；课后按任务要求提交作品。':'讲师版包含参考答案与量规。给学员发放时使用独立学员目录；分阶段案例按指定时点逐项发放。'});
        outputs.push({path:path.relative(path.dirname(audienceDir),file).split(path.sep).join('/'),hash:sha256(fs.readFileSync(file))});
    }
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
    const title = metaTitle(plan.metaPath, courseName);
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
        const metadataPath = path.join(sourceRoot, 'delivery.json');
        const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath,'utf8')) : {};
        for (const [id,spec] of Object.entries(metadata.cases || {})) {
            if (!plan.cases.some(c=>c.id===id)) throw new Error(`Unknown delivery case ${id}`);
            if (!spec || typeof spec !== 'object' || (spec.releases && !Array.isArray(spec.releases))) throw new Error(`Invalid delivery schedule ${id}`);
            if (spec.maintenancePaths && (!Array.isArray(spec.maintenancePaths) || spec.maintenancePaths.some(p=>!plan.cases.find(c=>c.id===id).doc.materials.some(m=>m.path===p && m.audience==='facilitator')))) throw new Error(`Invalid facilitator maintenance path ${id}`);
            for (const release of spec.releases || []) if (!Number.isSafeInteger(release.stage) || release.stage<1 || !Array.isArray(release.paths) || !release.paths.length || release.paths.some(p=>typeof p!=='string')) throw new Error(`Invalid release stage ${id}`);
        }
        copyAudienceMaterials(plan, 'student', temporary, outputs);
        copyAudienceMaterials(plan, 'facilitator', temporary, outputs);
        if (options.render) {
            const cssPath = path.join(packageRoot, 'shared_styles', 'package-doc.css');
            const css = fs.readFileSync(cssPath, 'utf8');
            const metaPath = plan.metaPath;
            const theme = (metaPath && fs.existsSync(metaPath)) ? ((fs.readFileSync(metaPath, 'utf8').match(/^theme:\s*["']?(.+?)["']?\s*$/m) || [])[1] || 'standard-default') : 'standard-default';
            const accent = accentFromTheme(packageRoot, theme);
            renderAudienceSources(path.join(sourceRoot, 'student'), path.join(temporary, 'student'), title, css, accent, outputs, plan, metadata);
            renderAudienceSources(path.join(sourceRoot, 'facilitator'), path.join(temporary, 'facilitator'), title, css, accent, outputs, plan, metadata);
        }
        const sourceHashes = [];
        if (fs.existsSync(path.join(sourceRoot,'delivery.json'))) sourceHashes.push({path:'delivery.json',hash:sha256(fs.readFileSync(path.join(sourceRoot,'delivery.json')))});
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

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'composition-workspace');
const { planRecipeLock, applyLockPlan } = require('../composition/lock');
const { materializeRecipe } = require('../composition/materialize');
const { workspaceView, courseView, publicLibrary } = require('../studio/model');
const { createStudioServer, LOOPBACK_HOST, inlinePreviewImages } = require('../studio/server');
const { createCompositionFromIndependent } = require('../composition/editor');

function preparedWorkspace(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-studio-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.cpSync(FIXTURE, root, { recursive: true });
    const plan = planRecipeLock(root, 'office', 'workshop');
    assert.equal(plan.valid, true, JSON.stringify(plan.diagnostics));
    assert.equal(applyLockPlan(plan).applied, true);
    assert.equal(materializeRecipe(root, 'office', 'workshop').materialized, true);
    return root;
}

function request(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, options, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve({
                status: response.statusCode,
                headers: response.headers,
                body: Buffer.concat(chunks).toString('utf8'),
            }));
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

test('studio read model projects workspace, recipes, provenance, diagnostics, and public content', t => {
    const workRoot = preparedWorkspace(t);
    const workspace = workspaceView(workRoot);
    assert.equal(workspace.summary.courses, 10);
    assert.equal(workspace.summary.composed, 1);
    assert(workspace.summary.exports >= 10);
    const office = workspace.courses.find(course => course.name === 'office');
    assert.equal(office.kind, 'composed');
    assert.equal(office.defaultRecipe, 'workshop');
    assert.equal(office.slideCount, 0);

    const course = courseView(workRoot, 'office', 'workshop');
    assert.equal(course.recipeId, 'workshop');
    assert.equal(course.preview.available, true);
    assert.equal(course.preview.pageCount, 3);
    assert.equal(course.recipe.groups[0].items[0].source.exportPath[0], 'workbuddy:unit:prompt-basics');
    assert.equal(course.recipe.groups[0].items[0].source.exportPath.at(-1), 'prompt-engineering:unit:prompt-basics');
    assert.equal(course.validation.valid, true, JSON.stringify(course.validation.diagnostics));

    const promptDir = path.join(workRoot, 'courses', 'prompt-engineering');
    fs.mkdirSync(path.join(promptDir, 'sequences'), { recursive: true });
    const sequence = {
        schemaVersion: 1,
        id: 'prompt-engineering:sequence:prompt-module',
        version: '1.0.0',
        title: '提示词完整模块',
        durationMinutes: 20,
        items: [{ id: 'prompt-core', ref: 'prompt-engineering:unit:prompt-basics', plannedMinutes: 20 }],
    };
    fs.writeFileSync(path.join(promptDir, 'sequences', 'prompt-module.json'), `${JSON.stringify(sequence, null, 2)}\n`);
    const exportsPath = path.join(promptDir, 'course.exports.json');
    const exportsDoc = JSON.parse(fs.readFileSync(exportsPath, 'utf8'));
    exportsDoc.exports.push({ id: sequence.id, kind: 'sequence', version: sequence.version, title: sequence.title, source: 'sequences/prompt-module.json' });
    fs.writeFileSync(exportsPath, `${JSON.stringify(exportsDoc, null, 2)}\n`);
    const library = publicLibrary(workRoot);
    assert(library.some(item => item.id === 'prompt-engineering:unit:prompt-basics' && item.kind === 'unit'));
    assert(library.some(item => item.id === 'workbuddy:unit:prompt-basics' && item.reexported));
    assert(library.some(item => item.id === sequence.id && item.kind === 'sequence' && item.items[0].ref === 'prompt-engineering:unit:prompt-basics'));
});

test('studio opens independent courses without creating composition files', t => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-studio-independent-'));
    t.after(() => fs.rmSync(workRoot, { recursive: true, force: true }));
    fs.cpSync(path.join(__dirname, 'fixtures', 'independent-workspace'), workRoot, { recursive: true });
    const courseDir = path.join(workRoot, 'courses', 'independent-s');
    const before = fs.readdirSync(courseDir).sort();
    const course = courseView(workRoot, 'independent-s');
    assert.equal(course.kind, 'independent');
    assert.equal(course.preview.available, true);
    assert.equal(course.preview.pageCount, 1);
    assert.equal(course.recipe.groups[0].items[0].contentMode, 'local');
    assert.deepEqual(fs.readdirSync(courseDir).sort(), before);
    assert(!fs.existsSync(path.join(courseDir, 'course.compose.json')));
    assert.equal(workspaceView(workRoot).courses.find(item => item.name === 'independent-s').slideCount, 1);

    const converted = createCompositionFromIndependent(workRoot, 'independent-s');
    assert.equal(converted.created, true, JSON.stringify(converted.diagnostics));
    const composed = courseView(workRoot, 'independent-s', 'baseline');
    assert.equal(composed.kind, 'composed');
    assert.equal(composed.recipe.groups.length, 1);
    assert.equal(composed.recipe.groups[0].items[0].pages.length, 1);
    assert.equal(composed.recipe.groups[0].items[0].pagePlan.length, 1);
    assert.equal(composed.preview.available, true);
    assert.equal(composed.preview.pages[0].previewSource, 'course');
});

test('studio server is loopback-only, session-gated, origin-checked, draft-scoped, and sandboxes previews', async t => {
    const workRoot = preparedWorkspace(t);
    const independentDir = path.join(workRoot, 'courses', 'independent-s');
    fs.cpSync(path.join(__dirname, 'fixtures', 'independent-workspace', 'courses', 'independent-s'), independentDir, { recursive: true });
    const independentSlide = fs.readFileSync(path.join(independentDir, 'slides', 'slide-01.html'));
    const studio = createStudioServer({ workRoot, token: 'test-session' });
    t.after(async () => studio.server.listening && studio.close());
    const listening = await studio.listen(0);
    assert.equal(listening.host, LOOPBACK_HOST);
    const origin = `http://${LOOPBACK_HOST}:${listening.port}`;

    assert.equal((await request(`${origin}/`)).status, 403);
    const shell = await request(`${origin}/?session=test-session`);
    assert.equal(shell.status, 200);
    assert.match(shell.body, /NextCourse Studio/);
    assert.match(shell.headers['content-security-policy'], /frame-src 'self'/);

    const workspace = await request(`${origin}/api/workspace`, {
        headers: { 'X-NextCourse-Session': 'test-session', Origin: origin },
    });
    assert.equal(workspace.status, 200);
    assert.equal(JSON.parse(workspace.body).summary.composed, 1);

    const wrongOrigin = await request(`${origin}/api/workspace`, {
        headers: { 'X-NextCourse-Session': 'test-session', Origin: 'https://example.test' },
    });
    assert.equal(wrongOrigin.status, 403);
    assert.equal((await request(`${origin}/api/workspace`, {
        method: 'POST',
        headers: { 'X-NextCourse-Session': 'test-session', Origin: origin },
    })).status, 405);

    const opened = await request(`${origin}/api/drafts`, {
        method: 'POST',
        headers: { 'X-NextCourse-Session': 'test-session', Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseName: 'office', recipeId: 'workshop' }),
    });
    assert.equal(opened.status, 201, opened.body);
    const draft = JSON.parse(opened.body);
    const changed = await request(`${origin}/api/drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'X-NextCourse-Session': 'test-session', Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: { type: 'set_recipe', patch: { durationMinutes: 50 } } }),
    });
    assert.equal(changed.status, 200, changed.body);
    assert.equal(JSON.parse(changed.body).recipe.durationMinutes, 50);
    const savedDraft = JSON.parse(changed.body);
    const saved = await request(`${origin}/api/drafts/${draft.id}/save`, {
        method: 'POST',
        headers: { 'X-NextCourse-Session': 'test-session', Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ baselineHash: savedDraft.baselineHash }),
    });
    assert.equal(saved.status, 200, saved.body);
    assert.equal(JSON.parse(fs.readFileSync(path.join(workRoot, 'courses', 'office', 'course.compose.json'), 'utf8')).recipes.workshop.durationMinutes, 50);

    const preview = await request(`${origin}/preview/office/workshop/1?session=test-session`);
    assert.equal(preview.status, 200);
    assert.match(preview.headers['content-security-policy'], /^sandbox;/);
    assert.match(preview.body, /prompt-engineering:page:prompt-framework/);

    const converted = await request(`${origin}/api/courses/independent-s/composition`, {
        method: 'POST',
        headers: { 'X-NextCourse-Session': 'test-session', Origin: origin, 'Content-Type': 'application/json' },
        body: '{}',
    });
    assert.equal(converted.status, 201, converted.body);
    const convertedBody = JSON.parse(converted.body);
    assert.equal(convertedBody.conversion.recipeId, 'baseline');
    assert.equal(convertedBody.draft.recipe.groups[0].items[0].pagePlan.length, 1);
    assert(studio.drafts.has(convertedBody.draft.id));
    assert.deepEqual(fs.readFileSync(path.join(independentDir, 'slides', 'slide-01.html')), independentSlide);
    const baselinePreview = await request(`${origin}/preview/independent-s/baseline/1?session=test-session`);
    assert.equal(baselinePreview.status, 200, baselinePreview.body);
    assert.match(baselinePreview.body, /独立 S 课/);
});

test('studio static shell provides search, course outline, inspector tabs, and keyboard focus targets', () => {
    const html = fs.readFileSync(path.join(ROOT, 'studio', 'static', 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'studio', 'static', 'app.css'), 'utf8');
    assert.match(html, /id="search"/);
    assert.match(html, /id="outline" tabindex="-1"/);
    assert.match(html, /data-inspector="source"/);
    assert.match(html, /data-inspector="settings"/);
    assert.match(html, /id="save-edit"/);
    assert.match(html, /id="restore-edit"/);
    assert.match(html, /data-inspector="diagnostics"/);
    assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(fs.readFileSync(path.join(ROOT, 'studio', 'static', 'app.js'), 'utf8'), /转换为组合课/);
    assert.match(css, /\.page-tree/);
});

test('isolated previews inline local images without exposing arbitrary paths', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nextcourse-preview-image-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(path.join(root, 'assets', 'pixel.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const output = inlinePreviewImages(
        '<section><img src="assets/pixel.png"><img src="../secret.png"><img src="https://example.test/a.png"></section>',
        root
    );
    assert.match(output, /src="data:image\/png;base64,/);
    assert.match(output, /src="\.\.\/secret\.png"/);
    assert.match(output, /src="https:\/\/example\.test\/a\.png"/);
});

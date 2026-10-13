'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { workspaceView, courseView, publicLibrary } = require('./model');
const {
    openRecipeDraft,
    applyRecipeDraftOperation,
    undoRecipeDraft,
    saveRecipeDraft,
    restoreComposeHistory,
    createCompositionFromIndependent,
} = require('../composition/editor');

const LOOPBACK_HOST = '127.0.0.1';
const STATIC_ROOT = path.join(__dirname, 'static');

function json(res, status, value) {
    const body = Buffer.from(JSON.stringify(value));
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
}

function text(res, status, body, contentType, headers = {}) {
    const bytes = Buffer.from(body);
    res.writeHead(status, {
        'Content-Type': contentType,
        'Content-Length': bytes.length,
        'X-Content-Type-Options': 'nosniff',
        ...headers,
    });
    res.end(bytes);
}

function requestJson(req, limit = 256 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > limit) {
                const error = new Error('request_too_large');
                error.status = 413;
                reject(error);
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                const text = Buffer.concat(chunks).toString('utf8');
                resolve(text ? JSON.parse(text) : {});
            } catch {
                const error = new Error('invalid_json');
                error.status = 400;
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

function safeSegment(value) {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(value) ? value : null;
}

function inside(root, relativePath) {
    const target = path.resolve(root, relativePath);
    return target === root || target.startsWith(`${root}${path.sep}`) ? target : null;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function inlinePreviewImages(slideHtml, buildRoot) {
    const mimeTypes = new Map([
        ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
        ['.gif', 'image/gif'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'],
    ]);
    return String(slideHtml).replace(/\bsrc=(['"])([^'"]+)\1/gi, (attribute, quote, reference) => {
        if (/^(?:data:|https?:|\/|#)/i.test(reference)) return attribute;
        const cleanReference = reference.split(/[?#]/, 1)[0];
        const mimeType = mimeTypes.get(path.extname(cleanReference).toLowerCase());
        const filePath = mimeType && inside(buildRoot, cleanReference);
        if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return attribute;
        const dataUrl = `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`;
        return `src=${quote}${dataUrl}${quote}`;
    });
}

function previewDocument(slideHtml, title, buildRoot) {
    const prepared = inlinePreviewImages(slideHtml, buildRoot);
    const section = prepared.match(/<section\b[\s\S]*?<\/section>/i);
    const content = section ? section[0] : `<section><pre>${escapeHtml(slideHtml)}</pre></section>`;
    return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>
*{box-sizing:border-box}html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#e6e8e3;color:#18201d;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;padding:24px}
section{width:min(100%,960px);aspect-ratio:16/9;overflow:auto;background:#fff;padding:7%;box-shadow:0 18px 50px rgba(24,32,29,.13);border:1px solid #cfd3cc}h1,h2,h3{line-height:1.12;margin:0 0 .65em}h2{font-size:clamp(28px,4vw,52px)}p,li{font-size:clamp(14px,1.65vw,22px);line-height:1.55}img{max-width:100%;max-height:55vh}aside.notes{display:none}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cfd3cc;padding:.55em;text-align:left}
</style></head><body>${content}</body></html>`;
}

function createStudioServer(options = {}) {
    const workRoot = path.resolve(options.workRoot || process.cwd());
    const token = options.token || crypto.randomBytes(24).toString('base64url');
    const drafts = new Map();
    let origin = null;

    const server = http.createServer(async (req, res) => {
        try {
            const requestUrl = new URL(req.url, origin || `http://${LOOPBACK_HOST}`);
            const requestOrigin = req.headers.origin;
            if (requestOrigin && origin && requestOrigin !== origin) {
                return json(res, 403, { error: 'origin_not_allowed' });
            }
            const readMethod = ['GET', 'HEAD'].includes(req.method);
            if (!readMethod && requestOrigin !== origin) return json(res, 403, { error: 'origin_required' });

            if (requestUrl.pathname === '/') {
                if (!readMethod) return json(res, 405, { error: 'method_not_allowed' });
                if (requestUrl.searchParams.get('session') !== token) {
                    return text(res, 403, 'Studio session is missing or expired.', 'text/plain; charset=utf-8');
                }
                const template = fs.readFileSync(path.join(STATIC_ROOT, 'index.html'), 'utf8');
                const body = template.replace('__NEXTCOURSE_SESSION__', token);
                return text(res, 200, body, 'text/html; charset=utf-8', {
                    'Cache-Control': 'no-store',
                    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
                    'Referrer-Policy': 'no-referrer',
                });
            }
            if (requestUrl.pathname === '/app.css' || requestUrl.pathname === '/app.js') {
                if (!readMethod) return json(res, 405, { error: 'method_not_allowed' });
                const name = requestUrl.pathname.slice(1);
                const body = fs.readFileSync(path.join(STATIC_ROOT, name));
                return text(res, 200, body, name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', {
                    'Cache-Control': 'no-store',
                });
            }

            const suppliedToken = req.headers['x-nextcourse-session'] || requestUrl.searchParams.get('session');
            if (suppliedToken !== token) return json(res, 403, { error: 'session_invalid' });

            if (requestUrl.pathname === '/api/workspace' && readMethod) return json(res, 200, workspaceView(workRoot));
            if (requestUrl.pathname === '/api/library' && readMethod) return json(res, 200, { items: publicLibrary(workRoot) });

            if (requestUrl.pathname === '/api/drafts' && req.method === 'POST') {
                const body = await requestJson(req);
                const courseName = safeSegment(body.courseName);
                const recipeId = safeSegment(body.recipeId);
                if (!courseName || !recipeId) return json(res, 400, { error: 'invalid_identifier' });
                const opened = openRecipeDraft(workRoot, courseName, recipeId);
                if (!opened.opened) return json(res, 422, { error: 'draft_invalid', diagnostics: opened.diagnostics });
                drafts.set(opened.draft.id, opened.draft);
                return json(res, 201, opened.view);
            }

            const draftMatch = requestUrl.pathname.match(/^\/api\/drafts\/([^/]+)(?:\/(undo|save))?$/);
            if (draftMatch) {
                const draftId = safeSegment(decodeURIComponent(draftMatch[1]));
                const action = draftMatch[2] || null;
                const draft = draftId && drafts.get(draftId);
                if (!draft) return json(res, 404, { error: 'draft_not_found' });
                if (!action && req.method === 'PATCH') {
                    const body = await requestJson(req);
                    const result = applyRecipeDraftOperation(draft, body.operation);
                    return result.applied
                        ? json(res, 200, result.view)
                        : json(res, 422, { error: 'operation_invalid', diagnostics: result.diagnostics, draft: result.view });
                }
                if (!action && req.method === 'DELETE') {
                    drafts.delete(draftId);
                    return json(res, 200, { discarded: true });
                }
                if (action === 'undo' && req.method === 'POST') {
                    const result = undoRecipeDraft(draft);
                    return result.undone
                        ? json(res, 200, result.view)
                        : json(res, 409, { error: 'nothing_to_undo', diagnostics: result.diagnostics, draft: result.view });
                }
                if (action === 'save' && req.method === 'POST') {
                    const body = await requestJson(req);
                    const result = saveRecipeDraft(draft, body.baselineHash);
                    if (!result.saved) return json(res, result.conflict ? 409 : 422, {
                        error: result.conflict ? 'external_edit_conflict' : 'save_failed',
                        diagnostics: result.diagnostics,
                        currentHash: result.currentHash || null,
                    });
                    return json(res, 200, result);
                }
                return json(res, 405, { error: 'method_not_allowed' });
            }

            const restoreMatch = requestUrl.pathname.match(/^\/api\/courses\/([^/]+)\/history\/([a-f0-9]{64})\/restore$/);
            if (restoreMatch && req.method === 'POST') {
                const courseName = safeSegment(decodeURIComponent(restoreMatch[1]));
                if (!courseName) return json(res, 400, { error: 'invalid_identifier' });
                const body = await requestJson(req);
                const result = restoreComposeHistory(workRoot, courseName, restoreMatch[2], body.currentHash);
                if (!result.restored) return json(res, result.conflict ? 409 : 422, {
                    error: result.conflict ? 'external_edit_conflict' : 'restore_failed',
                    diagnostics: result.diagnostics,
                    currentHash: result.currentHash || null,
                });
                return json(res, 200, result);
            }

            const conversionMatch = requestUrl.pathname.match(/^\/api\/courses\/([^/]+)\/composition$/);
            if (conversionMatch && req.method === 'POST') {
                const courseName = safeSegment(decodeURIComponent(conversionMatch[1]));
                if (!courseName) return json(res, 400, { error: 'invalid_identifier' });
                const result = createCompositionFromIndependent(workRoot, courseName);
                if (!result.created) return json(res, result.conflict ? 409 : 422, {
                    error: result.conflict ? 'conversion_conflict' : 'conversion_failed',
                    diagnostics: result.diagnostics,
                });
                const opened = openRecipeDraft(workRoot, courseName, result.recipeId);
                if (!opened.opened) return json(res, 422, { error: 'draft_invalid', diagnostics: opened.diagnostics });
                drafts.set(opened.draft.id, opened.draft);
                return json(res, 201, { conversion: result, draft: opened.view });
            }

            const courseMatch = requestUrl.pathname.match(/^\/api\/courses\/([^/]+)$/);
            if (courseMatch && readMethod) {
                const courseName = safeSegment(decodeURIComponent(courseMatch[1]));
                const recipeId = requestUrl.searchParams.get('recipe');
                if (!courseName || (recipeId && !safeSegment(recipeId))) return json(res, 400, { error: 'invalid_identifier' });
                const value = courseView(workRoot, courseName, recipeId);
                return value ? json(res, 200, value) : json(res, 404, { error: 'course_or_recipe_not_found' });
            }

            const previewMatch = requestUrl.pathname.match(/^\/preview\/([^/]+)\/([^/]+)\/(\d+)$/);
            if (previewMatch && readMethod) {
                const courseName = safeSegment(decodeURIComponent(previewMatch[1]));
                const recipeId = safeSegment(decodeURIComponent(previewMatch[2]));
                const pageNumber = Number(previewMatch[3]);
                if (!courseName || !recipeId || !Number.isInteger(pageNumber) || pageNumber < 1) {
                    return text(res, 400, 'Invalid preview target.', 'text/plain; charset=utf-8');
                }
                const independent = recipeId === 'independent';
                let buildRoot = independent
                    ? path.join(workRoot, 'courses', courseName)
                    : path.join(workRoot, 'courses', courseName, '.build', recipeId);
                let page;
                if (independent) {
                    const slidesDir = inside(buildRoot, 'slides');
                    const files = slidesDir && fs.existsSync(slidesDir)
                        ? fs.readdirSync(slidesDir).filter(file => file.endsWith('.html')).sort()
                        : [];
                    const file = files[pageNumber - 1];
                    page = file ? { index: pageNumber, entityId: file, output: `slides/${file}` } : null;
                } else {
                    const manifestPath = inside(buildRoot, 'build.manifest.json');
                    if (manifestPath && fs.existsSync(manifestPath)) {
                        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                        page = (manifest.pages || []).find(entry => entry.index === pageNumber);
                    } else {
                        const view = courseView(workRoot, courseName, recipeId);
                        page = view && view.preview.pages.find(entry => entry.index === pageNumber && entry.previewSource === 'course');
                        if (page) buildRoot = path.join(workRoot, 'courses', courseName);
                    }
                }
                const slidePath = page && inside(buildRoot, page.output);
                if (!slidePath || !fs.existsSync(slidePath)) return text(res, 404, 'Preview page is missing.', 'text/plain; charset=utf-8');
                const body = previewDocument(fs.readFileSync(slidePath, 'utf8'), page.entityId, buildRoot);
                return text(res, 200, body, 'text/html; charset=utf-8', {
                    'Cache-Control': 'no-store',
                    'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
                    'Referrer-Policy': 'no-referrer',
                });
            }

            if (!readMethod) return json(res, 405, { error: 'method_not_allowed' });
            return json(res, 404, { error: 'not_found' });
        } catch (error) {
            return json(res, error.status || 500, { error: error.message === 'invalid_json' ? 'invalid_json' : error.message === 'request_too_large' ? 'request_too_large' : 'studio_failure', message: error.message });
        }
    });

    server.on('listening', () => {
        const address = server.address();
        origin = `http://${LOOPBACK_HOST}:${address.port}`;
    });

    return {
        server,
        token,
        workRoot,
        drafts,
        listen(port = 4317) {
            return new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, LOOPBACK_HOST, () => {
                    server.removeListener('error', reject);
                    resolve({
                        host: LOOPBACK_HOST,
                        port: server.address().port,
                        url: `${origin}/?session=${encodeURIComponent(token)}`,
                    });
                });
            });
        },
        close() {
            return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        },
    };
}

module.exports = { createStudioServer, LOOPBACK_HOST, inlinePreviewImages };

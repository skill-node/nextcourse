#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const GENERATED_DIRS = new Set(['.build', '.review', 'archive', 'export', 'pdf', 'theme-gallery', 'node_modules']);
const GENERATED_FILES = new Set(['.DS_Store', 'deck.html', 'deck.print.html', 'handout.md']);

function sha256(value) {
    return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

/**
 * 用于判断「是否仍是同一教学页」的指纹，不用于 lock 或字节恢复。
 *
 * 旧 assemble/animate 流程会给复用页加来源注释、动画 class，并把模块分隔页的
 * __MODULE_*__ 占位符替换为当前课程编号，讲师备注也允许针对班级单独调整。
 * 这些都不应让内容复用误判为分叉；屏幕正文、结构、data-* 和资产路径仍参与指纹，
 * 备注另由 notesHash 独立追踪。
 */
function contentFingerprint(html) {
    let normalized = String(html)
        .replace(/<aside\b[^>]*class=["'][^"']*\bnotes\b[^"']*["'][^>]*>[\s\S]*?<\/aside>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    normalized = normalized.replace(/\sclass=(['"])([^'"]*)\1/g, (match, quote, value) => {
        const classes = value.split(/\s+/)
            .filter(item => item && !/^animate-/.test(item) && !/^stagger-/.test(item))
            .map(item => /^module-\d+$/.test(item) ? 'module-__MODULE_N__' : item);
        return classes.length ? ` class=${quote}${classes.join(' ')}${quote}` : '';
    });
    normalized = normalized
        .replace(/模块\s+\d+\s+·/g, '模块 __MODULE_NO__ ·')
        .replace(/(<span class="module-divider__number"[^>]*>)\d+(<\/span>)/g, '$1__MODULE_NO__$2')
        .replace(/\s+>/g, '>')
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><')
        .trim();
    return sha256(Buffer.from(normalized, 'utf8'));
}

function toPosix(value) {
    return value.split(path.sep).join('/');
}

function classify(relativePath) {
    if (relativePath === 'course.meta.md' || relativePath === 'course.blueprint.md' || relativePath === 'slide-plan.md') return 'design';
    if (relativePath === 'course.compose.json' || relativePath === 'course.exports.json' || relativePath === 'course.lock.json') return 'composition';
    if (/^(slides|slides-src)\//.test(relativePath) && relativePath.endsWith('.html')) return 'slide';
    if (/^modules\//.test(relativePath)) return 'unit';
    if (/^recipes\//.test(relativePath)) return 'recipe';
    if (/^cases\//.test(relativePath)) return 'case';
    if (/^assets\//.test(relativePath)) return 'asset';
    if (/^(materials|package|package-src)\//.test(relativePath)) return 'delivery';
    if (/^tools\//.test(relativePath)) return 'tool';
    return 'other';
}

function shouldInclude(relativePath) {
    const parts = relativePath.split('/');
    if (parts.some(part => GENERATED_DIRS.has(part))) return false;
    if (GENERATED_FILES.has(parts[parts.length - 1])) return false;
    if (parts.includes('__pycache__') || parts[parts.length - 1].endsWith('.pyc')) return false;
    if (parts[0] === 'package' && !relativePath.endsWith('.md')) return false;
    return true;
}

function walk(root, dir = root, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
        const absolute = path.join(dir, entry.name);
        const relative = toPosix(path.relative(root, absolute));
        if (!shouldInclude(relative)) continue;
        if (entry.isDirectory()) walk(root, absolute, files);
        else if (entry.isFile()) files.push(relative);
    }
    return files;
}

function extractSlide(relativePath, bytes) {
    if (!relativePath.endsWith('.html') || !/^(slides|slides-src)\//.test(relativePath)) return null;
    const html = bytes.toString('utf8');
    const open = html.match(/<section\b([^>]*)>/i);
    const attributes = open ? open[1] : '';
    const pageId = (attributes.match(/\bdata-page=["']([^"']+)["']/i) || [])[1] || null;
    const moduleId = (attributes.match(/\bdata-module=["']([^"']+)["']/i) || [])[1] || null;
    const classValue = (attributes.match(/\bclass=["']([^"']+)["']/i) || [])[1] || '';
    const moduleClass = classValue.split(/\s+/).find(item => /^module-\d+$/.test(item)) || null;
    const notes = (html.match(/<aside\b[^>]*class=["'][^"']*\bnotes\b[^"']*["'][^>]*>([\s\S]*?)<\/aside>/i) || [])[1] || '';
    const assetRefs = [];
    for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
        const value = match[1];
        if (!/^(?:https?:|data:|#|mailto:|javascript:)/i.test(value)) assetRefs.push(value);
    }
    return {
        path: relativePath,
        pageId,
        moduleId,
        moduleClass,
        contentFingerprint: contentFingerprint(html),
        notesHash: sha256(Buffer.from(notes, 'utf8')),
        assetRefs: [...new Set(assetRefs)].sort(),
    };
}

function captureBaseline(directory) {
    const root = path.resolve(directory);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`Not a directory: ${root}`);
    const paths = walk(root);
    const files = [];
    const slides = [];
    for (const relativePath of paths) {
        const bytes = fs.readFileSync(path.join(root, relativePath));
        const record = {
            path: relativePath,
            kind: classify(relativePath),
            bytes: bytes.length,
            hash: sha256(bytes),
        };
        files.push(record);
        const slide = extractSlide(relativePath, bytes);
        if (slide) slides.push(slide);
    }
    const fileDigestInput = files.map(file => `${file.path}\0${file.hash}\0${file.bytes}`).join('\n');
    const slideOrderInput = slides.map(slide => `${slide.path}\0${slide.pageId || ''}\0${slide.moduleId || ''}\0${slide.moduleClass || ''}\0${slide.notesHash}`).join('\n');
    const counts = {};
    for (const file of files) counts[file.kind] = (counts[file.kind] || 0) + 1;
    return {
        schemaVersion: 1,
        kind: 'source-baseline',
        name: path.basename(root),
        sourceHash: sha256(Buffer.from(fileDigestInput, 'utf8')),
        slideOrderHash: sha256(Buffer.from(slideOrderInput, 'utf8')),
        counts,
        files,
        slides,
    };
}

function main(argv) {
    let output = null;
    const args = [];
    for (let index = 0; index < argv.length; index++) {
        if (argv[index] === '--output') output = argv[++index];
        else args.push(argv[index]);
    }
    if (args.length !== 1) {
        console.error('Usage: node composition/baseline.js <course-or-library-dir> [--output file.json]');
        return 1;
    }
    const json = `${JSON.stringify(captureBaseline(args[0]), null, 2)}\n`;
    if (output) {
        fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
        fs.writeFileSync(output, json, 'utf8');
        console.log(path.resolve(output));
    } else {
        process.stdout.write(json);
    }
    return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { GENERATED_DIRS, GENERATED_FILES, sha256, contentFingerprint, classify, shouldInclude, captureBaseline };

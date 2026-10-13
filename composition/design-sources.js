'use strict';
const fs = require('fs');
const path = require('path');
const { sha256 } = require('./baseline');
const { resolveInside } = require('./resolver');
const { DIAGNOSTIC_CODES: C, diagnostic } = require('./diagnostics');

function recipeDesignSources(courseDir, recipe) {
    const files = [];
    const diagnostics = [];
    for (const [key, output] of [['meta', 'course.meta.md'], ['blueprint', 'course.blueprint.md']]) {
        const explicit = recipe.designSources && recipe.designSources[key];
        const source = explicit || output;
        const absolutePath = resolveInside(courseDir, source);
        if (!absolutePath || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
            if (explicit) diagnostics.push(diagnostic(C.REFERENCE_NOT_FOUND, `Recipe design source not found: ${source}.`, `/designSources/${key}`));
            continue;
        }
        files.push({ source, output, absolutePath, hash: sha256(fs.readFileSync(absolutePath)) });
    }
    return { valid: diagnostics.length === 0, files, diagnostics };
}
module.exports = { recipeDesignSources };

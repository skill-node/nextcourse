'use strict';

const fs = require('fs');
const path = require('path');
const { sha256 } = require('./baseline');
const { INSTANCE_ID_RE } = require('./contracts');

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
}

function recipeHash(compose, recipeId) {
    return sha256(Buffer.from(JSON.stringify(canonical({
        schemaVersion: compose.schemaVersion,
        courseId: compose.courseId,
        recipeId,
        recipe: compose.recipes && compose.recipes[recipeId],
    }))));
}

function recipeLockPath(courseDir, compose, recipeId, forWrite = false) {
    const legacy = path.join(courseDir, 'course.lock.json');
    // Invalid IDs are diagnosed by the caller, never interpolated into a path.
    if (!INSTANCE_ID_RE.test(recipeId || '')) return legacy;
    const dedicated = path.join(courseDir, 'course.locks', `${recipeId}.lock.json`);
    if (fs.existsSync(dedicated)) return dedicated;
    let oldRecipe = null;
    if (fs.existsSync(legacy)) {
        try { oldRecipe = JSON.parse(fs.readFileSync(legacy, 'utf8')).recipeId; } catch { /* caller diagnoses a selected malformed lock */ }
    }
    if (!forWrite && oldRecipe === recipeId) return legacy;
    if (recipeId === compose.defaultRecipe && !(forWrite && oldRecipe && oldRecipe !== recipeId)) return legacy;
    return dedicated;
}

function lockMatchesRecipe(lock, compose, composeHash, recipeId) {
    if (!lock || lock.courseId !== compose.courseId || lock.recipeId !== recipeId) return false;
    return lock.recipeHash !== undefined
        ? lock.recipeHash === recipeHash(compose, recipeId)
        : lock.composeHash === composeHash;
}

module.exports = { recipeHash, recipeLockPath, lockMatchesRecipe };

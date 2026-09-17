'use strict';

const path = require('path');
const { DIAGNOSTIC_CODES: C, diagnostic } = require('./diagnostics');

const SCHEMA_VERSION = 1;
const ENTITY_KINDS = Object.freeze(['unit', 'sequence', 'page', 'case', 'asset']);
const CONTENT_MODES = Object.freeze(['reference', 'variant', 'local']);
const UPDATE_POLICIES = Object.freeze(['manual', 'frozen']);
const DELIVERY_PROFILES = Object.freeze(['slides', 'slides+lab', 'full']);
const BLOOM_LEVELS = Object.freeze(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']);
const MATERIAL_AUDIENCES = Object.freeze(['student', 'facilitator', 'both']);
const MATERIAL_ROLES = Object.freeze(['input', 'worksheet', 'reference', 'answer', 'rubric']);

const ID_PART = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';
const COURSE_ID_RE = new RegExp(`^${ID_PART}$`);
const ENTITY_ID_RE = new RegExp(`^(${ID_PART}):(${ENTITY_KINDS.join('|')}):(${ID_PART})$`);
const INSTANCE_ID_RE = new RegExp(`^${ID_PART}$`);
const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSafeRelativePath(value) {
    if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value)) return false;
    const normalized = path.posix.normalize(value);
    return normalized === value && normalized !== '..' && !normalized.startsWith('../') && !normalized.includes('/../');
}

function entityParts(value) {
    const match = typeof value === 'string' ? value.match(ENTITY_ID_RE) : null;
    return match ? { ownerId: match[1], kind: match[2], localId: match[3] } : null;
}

function validateHeader(doc, diagnostics) {
    if (!isObject(doc)) {
        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'Document must be a JSON object.', ''));
        return false;
    }
    if (doc.schemaVersion !== SCHEMA_VERSION) {
        diagnostics.push(diagnostic(
            C.SCHEMA_VERSION_UNSUPPORTED,
            `schemaVersion must be ${SCHEMA_VERSION}.`,
            '/schemaVersion',
            'error',
            { supported: [SCHEMA_VERSION], received: doc.schemaVersion }
        ));
    }
    if (!COURSE_ID_RE.test(doc.courseId || '')) {
        diagnostics.push(diagnostic(C.COURSE_ID_INVALID, 'courseId must be a stable lowercase identifier.', '/courseId'));
    }
    return true;
}

function validateVersion(value, pointer, diagnostics) {
    if (!VERSION_RE.test(value || '')) {
        diagnostics.push(diagnostic(C.VERSION_INVALID, 'Version must be an exact SemVer value.', pointer));
    }
}

function validatePath(value, pointer, diagnostics) {
    if (!isSafeRelativePath(value)) {
        diagnostics.push(diagnostic(C.PATH_INVALID, 'Path must be normalized, relative, and stay inside the course.', pointer));
    }
}

function validateEntity(value, pointer, diagnostics, expected = {}) {
    const parts = entityParts(value);
    if (!parts) {
        diagnostics.push(diagnostic(C.ENTITY_ID_INVALID, 'Entity ID must be <owner-id>:<kind>:<local-id>.', pointer));
        return null;
    }
    if (expected.ownerId && parts.ownerId !== expected.ownerId) {
        diagnostics.push(diagnostic(C.ENTITY_OWNER_MISMATCH, `Entity owner must be ${expected.ownerId}.`, pointer));
    }
    if (expected.kind && parts.kind !== expected.kind) {
        diagnostics.push(diagnostic(C.ENTITY_KIND_MISMATCH, `Entity kind must be ${expected.kind}.`, pointer));
    }
    return parts;
}

function result(diagnostics) {
    return { valid: diagnostics.every(item => item.severity !== 'error'), diagnostics };
}

function validateExportsManifest(doc) {
    const diagnostics = [];
    if (!validateHeader(doc, diagnostics)) return result(diagnostics);
    if (!Array.isArray(doc.exports)) {
        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'exports must be an array.', '/exports'));
        return result(diagnostics);
    }
    if (doc.aliases !== undefined) {
        if (!Array.isArray(doc.aliases)) diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'aliases must be an array.', '/aliases'));
        else {
            const aliases = new Set();
            doc.aliases.forEach((alias, index) => {
                if (!COURSE_ID_RE.test(alias || '')) diagnostics.push(diagnostic(C.COURSE_ID_INVALID, 'Alias must be a stable lowercase identifier.', `/aliases/${index}`));
                if (aliases.has(alias)) diagnostics.push(diagnostic(C.ENTITY_DUPLICATE, `Duplicate alias ${alias}.`, `/aliases/${index}`));
                aliases.add(alias);
            });
        }
    }
    const seen = new Set();
    doc.exports.forEach((entry, index) => {
        const pointer = `/exports/${index}`;
        if (!isObject(entry)) {
            diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'Export entry must be an object.', pointer));
            return;
        }
        const parts = validateEntity(entry.id, `${pointer}/id`, diagnostics, { ownerId: doc.courseId, kind: entry.kind });
        if (!ENTITY_KINDS.includes(entry.kind)) {
            diagnostics.push(diagnostic(C.ENTITY_KIND_MISMATCH, `kind must be one of: ${ENTITY_KINDS.join(', ')}.`, `${pointer}/kind`));
        }
        if (typeof entry.title !== 'string' || !entry.title.trim()) {
            diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'Export title is required.', `${pointer}/title`));
        }
        validateVersion(entry.version, `${pointer}/version`, diagnostics);
        if (seen.has(entry.id)) diagnostics.push(diagnostic(C.ENTITY_DUPLICATE, `Duplicate export ${entry.id}.`, `${pointer}/id`));
        if (parts) seen.add(entry.id);

        const hasSource = typeof entry.source === 'string';
        const hasTarget = isObject(entry.target);
        if (hasSource === hasTarget) {
            diagnostics.push(diagnostic(C.EXPORT_TARGET_INVALID, 'Export must declare exactly one of source or target.', pointer));
        }
        if (hasSource) validatePath(entry.source, `${pointer}/source`, diagnostics);
        if (hasTarget) {
            validateEntity(entry.target.ref, `${pointer}/target/ref`, diagnostics, { kind: entry.kind });
            validateVersion(entry.target.version, `${pointer}/target/version`, diagnostics);
        }
    });
    return result(diagnostics);
}

function validatePageSource(value, pointer, diagnostics) {
    if (!isObject(value)) {
        diagnostics.push(diagnostic(C.ITEM_INVALID, 'Page source must be an object.', pointer));
        return;
    }
    const hasRef = typeof value.ref === 'string';
    const hasPath = typeof value.path === 'string';
    if (hasRef === hasPath) diagnostics.push(diagnostic(C.ITEM_INVALID, 'Page source must have exactly one of ref or path.', pointer));
    if (hasRef) validateEntity(value.ref, `${pointer}/ref`, diagnostics, { kind: 'page' });
    if (hasPath) {
        validateEntity(value.id, `${pointer}/id`, diagnostics, { kind: 'page' });
        validatePath(value.path, `${pointer}/path`, diagnostics);
    }
}

function validateComposeManifest(doc) {
    const diagnostics = [];
    if (!validateHeader(doc, diagnostics)) return result(diagnostics);
    if (!isObject(doc.recipes) || Object.keys(doc.recipes).length === 0) {
        diagnostics.push(diagnostic(C.RECIPE_INVALID, 'recipes must contain at least one recipe.', '/recipes'));
        return result(diagnostics);
    }
    if (!INSTANCE_ID_RE.test(doc.defaultRecipe || '') || !doc.recipes[doc.defaultRecipe]) {
        diagnostics.push(diagnostic(C.RECIPE_NOT_FOUND, 'defaultRecipe must name an existing recipe.', '/defaultRecipe'));
    }

    for (const [recipeId, recipe] of Object.entries(doc.recipes)) {
        const recipePath = `/recipes/${recipeId}`;
        if (!INSTANCE_ID_RE.test(recipeId) || !isObject(recipe) || !Array.isArray(recipe.groups)) {
            diagnostics.push(diagnostic(C.RECIPE_INVALID, 'Recipe ID and groups are invalid.', recipePath));
            continue;
        }
        if (recipe.selection !== 'explicit') {
            diagnostics.push(diagnostic(C.RECIPE_INVALID, 'selection must be explicit; v1 never auto-trims content.', `${recipePath}/selection`));
        }
        if (recipe.durationMinutes !== undefined && (!Number.isInteger(recipe.durationMinutes) || recipe.durationMinutes < 0)) {
            diagnostics.push(diagnostic(C.RECIPE_INVALID, 'durationMinutes must be a non-negative integer.', `${recipePath}/durationMinutes`));
        }
        if (recipe.deliveryProfile !== undefined && !DELIVERY_PROFILES.includes(recipe.deliveryProfile)) {
            diagnostics.push(diagnostic(C.RECIPE_INVALID, `deliveryProfile must be one of: ${DELIVERY_PROFILES.join(', ')}.`, `${recipePath}/deliveryProfile`));
        }
        const groups = new Set();
        const occurrences = new Set();
        recipe.groups.forEach((group, groupIndex) => {
            const groupPath = `${recipePath}/groups/${groupIndex}`;
            if (!isObject(group) || !INSTANCE_ID_RE.test(group.id || '') || !Array.isArray(group.items)) {
                diagnostics.push(diagnostic(C.RECIPE_INVALID, 'Group requires a stable id and items array.', groupPath));
                return;
            }
            if (typeof group.title !== 'string' || !group.title.trim()) {
                diagnostics.push(diagnostic(C.RECIPE_INVALID, 'Group title is required.', `${groupPath}/title`));
            }
            if (group.moduleNumber !== undefined && group.moduleNumber !== null
                && (!Number.isInteger(group.moduleNumber) || group.moduleNumber < 1)) {
                diagnostics.push(diagnostic(C.RECIPE_INVALID, 'moduleNumber must be null or a positive integer.', `${groupPath}/moduleNumber`));
            }
            if (group.plannedMinutes !== undefined && (!Number.isInteger(group.plannedMinutes) || group.plannedMinutes < 0)) {
                diagnostics.push(diagnostic(C.RECIPE_INVALID, 'plannedMinutes must be a non-negative integer.', `${groupPath}/plannedMinutes`));
            }
            if (groups.has(group.id)) diagnostics.push(diagnostic(C.GROUP_DUPLICATE, `Duplicate group ${group.id}.`, `${groupPath}/id`));
            groups.add(group.id);
            group.items.forEach((item, itemIndex) => {
                const itemPath = `${groupPath}/items/${itemIndex}`;
                if (!isObject(item) || !INSTANCE_ID_RE.test(item.id || '')) {
                    diagnostics.push(diagnostic(C.ITEM_INVALID, 'Item requires a stable occurrence id.', itemPath));
                    return;
                }
                if (occurrences.has(item.id)) diagnostics.push(diagnostic(C.OCCURRENCE_DUPLICATE, `Duplicate occurrence ${item.id}.`, `${itemPath}/id`));
                occurrences.add(item.id);
                if (!CONTENT_MODES.includes(item.contentMode)) {
                    diagnostics.push(diagnostic(C.CONTENT_MODE_INVALID, `contentMode must be one of: ${CONTENT_MODES.join(', ')}.`, `${itemPath}/contentMode`));
                }
                if (!UPDATE_POLICIES.includes(item.updatePolicy)) {
                    diagnostics.push(diagnostic(C.UPDATE_POLICY_INVALID, `updatePolicy must be one of: ${UPDATE_POLICIES.join(', ')}.`, `${itemPath}/updatePolicy`));
                }
                if (item.plannedMinutes !== undefined && (!Number.isInteger(item.plannedMinutes) || item.plannedMinutes < 0)) {
                    diagnostics.push(diagnostic(C.ITEM_INVALID, 'plannedMinutes must be a non-negative integer.', `${itemPath}/plannedMinutes`));
                }
                if (item.outcomeMap !== undefined && !isObject(item.outcomeMap)) {
                    diagnostics.push(diagnostic(C.ITEM_INVALID, 'outcomeMap must be an object of source outcomes to local outcome arrays.', `${itemPath}/outcomeMap`));
                } else if (isObject(item.outcomeMap)) {
                    for (const [sourceOutcome, localOutcomes] of Object.entries(item.outcomeMap)) {
                        if (!sourceOutcome || !Array.isArray(localOutcomes) || localOutcomes.length === 0 || localOutcomes.some(value => typeof value !== 'string' || !value)) {
                            diagnostics.push(diagnostic(C.ITEM_INVALID, 'Each outcomeMap entry needs one or more local outcome IDs.', `${itemPath}/outcomeMap/${sourceOutcome}`));
                        }
                    }
                }
                if (item.contentMode === 'local') {
                    validateEntity(item.local && item.local.id, `${itemPath}/local/id`, diagnostics, { ownerId: doc.courseId });
                    validatePath(item.local && item.local.path, `${itemPath}/local/path`, diagnostics);
                    if (item.ref !== undefined) diagnostics.push(diagnostic(C.ITEM_INVALID, 'Local items cannot retain an active ref.', `${itemPath}/ref`));
                } else {
                    validateEntity(item.ref, `${itemPath}/ref`, diagnostics);
                    if (item.local !== undefined) diagnostics.push(diagnostic(C.ITEM_INVALID, 'Referenced items cannot declare local.', `${itemPath}/local`));
                }
                if (item.contentMode === 'variant') {
                    if (!isObject(item.variant)) {
                        diagnostics.push(diagnostic(C.VARIANT_BASELINE_MISSING, 'Variant requires a replacement path and baseline hash.', `${itemPath}/variant`));
                    } else {
                        validatePath(item.variant.path, `${itemPath}/variant/path`, diagnostics);
                        if (!SHA256_RE.test(item.variant.baselineHash || '')) {
                            diagnostics.push(diagnostic(C.VARIANT_BASELINE_MISSING, 'Variant baselineHash must be sha256:<64 hex>.', `${itemPath}/variant/baselineHash`));
                        }
                    }
                } else if (item.variant !== undefined) {
                    diagnostics.push(diagnostic(C.ITEM_INVALID, 'variant is only valid for contentMode=variant.', `${itemPath}/variant`));
                }
                if (item.pages) {
                    for (const [key, values] of Object.entries(item.pages)) {
                        if (!['include', 'omit'].includes(key) || !Array.isArray(values)) {
                            diagnostics.push(diagnostic(C.ITEM_INVALID, 'pages accepts include and omit arrays only.', `${itemPath}/pages/${key}`));
                            continue;
                        }
                        values.forEach((id, pageIndex) => validateEntity(id, `${itemPath}/pages/${key}/${pageIndex}`, diagnostics, { kind: 'page' }));
                    }
                }
                if (item.operations !== undefined && !Array.isArray(item.operations)) {
                    diagnostics.push(diagnostic(C.ITEM_INVALID, 'operations must be an array.', `${itemPath}/operations`));
                } else if (Array.isArray(item.operations)) item.operations.forEach((operation, operationIndex) => {
                    const operationPath = `${itemPath}/operations/${operationIndex}`;
                    if (!isObject(operation) || !['insert_before', 'insert_after', 'replace'].includes(operation.op)) {
                        diagnostics.push(diagnostic(C.ITEM_INVALID, 'Operation must be insert_before, insert_after, or replace.', operationPath));
                        return;
                    }
                    validateEntity(operation.target, `${operationPath}/target`, diagnostics, { kind: 'page' });
                    validatePageSource(operation.with, `${operationPath}/with`, diagnostics);
                });
            });
        });
    }
    return result(diagnostics);
}

function validateLockManifest(doc) {
    const diagnostics = [];
    if (!validateHeader(doc, diagnostics)) return result(diagnostics);
    if (!INSTANCE_ID_RE.test(doc.recipeId || '')) diagnostics.push(diagnostic(C.RECIPE_INVALID, 'recipeId is invalid.', '/recipeId'));
    validateVersion(doc.engineVersion, '/engineVersion', diagnostics);
    for (const [key, value] of [['composeHash', doc.composeHash], ['sourceManifestHash', doc.sourceManifestHash]]) {
        if (!SHA256_RE.test(value || '')) diagnostics.push(diagnostic(C.HASH_INVALID, `${key} must be sha256:<64 hex>.`, `/${key}`));
    }
    if (!Array.isArray(doc.references)) {
        diagnostics.push(diagnostic(C.LOCK_REFERENCE_INVALID, 'references must be an array.', '/references'));
        return result(diagnostics);
    }
    const occurrences = new Set();
    doc.references.forEach((entry, index) => {
        const pointer = `/references/${index}`;
        if (!isObject(entry) || !INSTANCE_ID_RE.test(entry.occurrenceId || '')) {
            diagnostics.push(diagnostic(C.LOCK_REFERENCE_INVALID, 'Locked reference requires occurrenceId.', pointer));
            return;
        }
        if (occurrences.has(entry.occurrenceId)) diagnostics.push(diagnostic(C.OCCURRENCE_DUPLICATE, `Duplicate locked occurrence ${entry.occurrenceId}.`, `${pointer}/occurrenceId`));
        occurrences.add(entry.occurrenceId);
        validateEntity(entry.ref, `${pointer}/ref`, diagnostics);
        validateVersion(entry.version, `${pointer}/version`, diagnostics);
        if (!SHA256_RE.test(entry.contentHash || '')) diagnostics.push(diagnostic(C.HASH_INVALID, 'contentHash must be sha256:<64 hex>.', `${pointer}/contentHash`));
        validatePath(entry.snapshotPath, `${pointer}/snapshotPath`, diagnostics);
        validatePath(entry.sourcePath, `${pointer}/sourcePath`, diagnostics);
        if (!Array.isArray(entry.exportPath) || entry.exportPath.length === 0) {
            diagnostics.push(diagnostic(C.LOCK_REFERENCE_INVALID, 'exportPath must preserve the full public-interface chain.', `${pointer}/exportPath`));
        } else {
            entry.exportPath.forEach((id, pathIndex) => validateEntity(id, `${pointer}/exportPath/${pathIndex}`, diagnostics));
        }
        if (!Array.isArray(entry.dependencyPath) || entry.dependencyPath.length === 0) {
            diagnostics.push(diagnostic(C.LOCK_REFERENCE_INVALID, 'dependencyPath must preserve the full expansion chain.', `${pointer}/dependencyPath`));
        } else {
            entry.dependencyPath.forEach((id, pathIndex) => validateEntity(id, `${pointer}/dependencyPath/${pathIndex}`, diagnostics));
        }
        for (const [key, kind] of [['assets', 'asset'], ['cases', 'case']]) {
            if (entry[key] === undefined) continue;
            if (!Array.isArray(entry[key])) diagnostics.push(diagnostic(C.LOCK_REFERENCE_INVALID, `${key} must be an array.`, `${pointer}/${key}`));
            else entry[key].forEach((id, itemIndex) => validateEntity(id, `${pointer}/${key}/${itemIndex}`, diagnostics, { kind }));
        }
        if (entry.deliveryFiles !== undefined) {
            if (!Array.isArray(entry.deliveryFiles)) diagnostics.push(diagnostic(C.LOCK_REFERENCE_INVALID, 'deliveryFiles must be an array.', `${pointer}/deliveryFiles`));
            else entry.deliveryFiles.forEach((file, fileIndex) => validatePath(file, `${pointer}/deliveryFiles/${fileIndex}`, diagnostics));
        }
    });
    return result(diagnostics);
}

function validateUnit(doc) {
    const diagnostics = [];
    if (!isObject(doc)) {
        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'Unit must be a JSON object.', ''));
        return result(diagnostics);
    }
    if (doc.schemaVersion !== SCHEMA_VERSION) {
        diagnostics.push(diagnostic(C.SCHEMA_VERSION_UNSUPPORTED, `schemaVersion must be ${SCHEMA_VERSION}.`, '/schemaVersion'));
    }
    const unitParts = validateEntity(doc.id, '/id', diagnostics, { kind: 'unit' });
    validateVersion(doc.version, '/version', diagnostics);
    if (typeof doc.title !== 'string' || !doc.title.trim()) diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'Unit title is required.', '/title'));
    if (!Number.isInteger(doc.durationMinutes) || doc.durationMinutes < 0) {
        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'durationMinutes must be a non-negative integer.', '/durationMinutes'));
    }
    if (!Array.isArray(doc.outcomes) || doc.outcomes.length === 0) {
        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'Unit requires at least one outcome.', '/outcomes'));
    } else {
        const outcomes = new Set();
        doc.outcomes.forEach((outcome, index) => {
            const pointer = `/outcomes/${index}`;
            if (!isObject(outcome) || !INSTANCE_ID_RE.test(outcome.id || '') || typeof outcome.do !== 'string' || !outcome.do.trim()
                || !BLOOM_LEVELS.includes(outcome.bloom) || typeof outcome.evidence !== 'string' || !outcome.evidence.trim()) {
                diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'Outcome requires id, do, Bloom level, and evidence.', pointer));
                return;
            }
            if (outcomes.has(outcome.id)) diagnostics.push(diagnostic(C.ENTITY_DUPLICATE, `Duplicate outcome ${outcome.id}.`, `${pointer}/id`));
            outcomes.add(outcome.id);
        });
    }
    if (doc.prerequisites !== undefined) {
        if (!Array.isArray(doc.prerequisites)) diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'prerequisites must be an array.', '/prerequisites'));
        else doc.prerequisites.forEach((prerequisite, index) => {
            if (!isObject(prerequisite) || typeof prerequisite.capability !== 'string' || !prerequisite.capability.trim()
                || (prerequisite.required !== undefined && typeof prerequisite.required !== 'boolean')) {
                diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'Prerequisite requires capability and optional boolean required.', `/prerequisites/${index}`));
            }
        });
    }
    if (!Array.isArray(doc.pages) || doc.pages.length === 0) {
        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'Unit requires at least one page.', '/pages'));
    } else {
        const pages = new Set();
        doc.pages.forEach((page, index) => {
            const pointer = `/pages/${index}`;
            if (!isObject(page)) {
                diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'Page entry must be an object.', pointer));
                return;
            }
            validateEntity(page.id, `${pointer}/id`, diagnostics, { kind: 'page', ownerId: unitParts && unitParts.ownerId });
            validatePath(page.path, `${pointer}/path`, diagnostics);
            if (!Number.isInteger(page.estimatedMinutes) || page.estimatedMinutes < 0) {
                diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'estimatedMinutes must be a non-negative integer.', `${pointer}/estimatedMinutes`));
            }
            if (!['activation', 'concept', 'demo', 'practice', 'assessment', 'takeaway', 'transition'].includes(page.role)) {
                diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'Page role is invalid.', `${pointer}/role`));
            }
            if (pages.has(page.id)) diagnostics.push(diagnostic(C.ENTITY_DUPLICATE, `Duplicate page ${page.id}.`, `${pointer}/id`));
            pages.add(page.id);
        });
    }
    for (const [key, kind] of [['cases', 'case'], ['assets', 'asset']]) {
        if (doc[key] === undefined) continue;
        if (!Array.isArray(doc[key])) diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `${key} must be an array.`, `/${key}`));
        else doc[key].forEach((id, index) => validateEntity(id, `/${key}/${index}`, diagnostics, { kind }));
    }
    return result(diagnostics);
}

function validateCase(doc) {
    const diagnostics = [];
    if (!isObject(doc)) {
        diagnostics.push(diagnostic(C.DOCUMENT_INVALID, 'Case must be a JSON object.', ''));
        return result(diagnostics);
    }
    if (doc.schemaVersion !== SCHEMA_VERSION) {
        diagnostics.push(diagnostic(C.SCHEMA_VERSION_UNSUPPORTED, `schemaVersion must be ${SCHEMA_VERSION}.`, '/schemaVersion'));
    }
    validateEntity(doc.id, '/id', diagnostics, { kind: 'case' });
    validateVersion(doc.version, '/version', diagnostics);
    for (const field of ['title', 'input', 'task', 'expectedOutput']) {
        if (typeof doc[field] !== 'string' || !doc[field].trim()) {
            diagnostics.push(diagnostic(C.DOCUMENT_INVALID, `${field} is required.`, `/${field}`));
        }
    }
    if (!Array.isArray(doc.materials) || doc.materials.length === 0) {
        diagnostics.push(diagnostic(C.CASE_MATERIAL_INVALID, 'Case requires at least one material.', '/materials'));
    } else {
        const ids = new Set();
        doc.materials.forEach((material, index) => {
            const pointer = `/materials/${index}`;
            if (!isObject(material) || !INSTANCE_ID_RE.test(material.id || '')) {
                diagnostics.push(diagnostic(C.CASE_MATERIAL_INVALID, 'Material requires a stable local id.', `${pointer}/id`));
                return;
            }
            if (ids.has(material.id)) diagnostics.push(diagnostic(C.ENTITY_DUPLICATE, `Duplicate material ${material.id}.`, `${pointer}/id`));
            ids.add(material.id);
            if (typeof material.title !== 'string' || !material.title.trim()) {
                diagnostics.push(diagnostic(C.CASE_MATERIAL_INVALID, 'Material title is required.', `${pointer}/title`));
            }
            validatePath(material.path, `${pointer}/path`, diagnostics);
            if (!MATERIAL_ROLES.includes(material.role)) {
                diagnostics.push(diagnostic(C.CASE_MATERIAL_INVALID, `role must be one of: ${MATERIAL_ROLES.join(', ')}.`, `${pointer}/role`));
            }
            if (!MATERIAL_AUDIENCES.includes(material.audience)) {
                diagnostics.push(diagnostic(C.CASE_MATERIAL_INVALID, `audience must be one of: ${MATERIAL_AUDIENCES.join(', ')}.`, `${pointer}/audience`));
            }
            if (material.role === 'answer' && material.audience !== 'facilitator') {
                diagnostics.push(diagnostic(C.DELIVERY_AUDIENCE_LEAK, 'Answer materials must be facilitator-only.', `${pointer}/audience`));
            }
            if (material.dependencies !== undefined) {
                if (!Array.isArray(material.dependencies)) diagnostics.push(diagnostic(C.CASE_MATERIAL_INVALID, 'dependencies must be an array.', `${pointer}/dependencies`));
                else material.dependencies.forEach((dependency, dependencyIndex) => validatePath(dependency, `${pointer}/dependencies/${dependencyIndex}`, diagnostics));
            }
        });
        for (const [field, role] of [['answerMaterial', 'answer'], ['rubricMaterial', 'rubric']]) {
            const material = doc.materials.find(entry => entry.id === doc[field]);
            if (!material || material.role !== role) {
                diagnostics.push(diagnostic(C.CASE_ANSWER_MISSING, `${field} must name a ${role} material.`, `/${field}`));
            }
        }
    }
    if (doc.generator !== undefined) {
        const generator = doc.generator;
        if (!isObject(generator)) diagnostics.push(diagnostic(C.GENERATOR_OUTPUT_INVALID, 'generator must be an object.', '/generator'));
        else {
            validatePath(generator.script, '/generator/script', diagnostics);
            if (!isObject(generator.parameters)) diagnostics.push(diagnostic(C.GENERATOR_OUTPUT_INVALID, 'generator.parameters must be an object.', '/generator/parameters'));
            if (!['string', 'number'].includes(typeof generator.seed)) diagnostics.push(diagnostic(C.GENERATOR_OUTPUT_INVALID, 'generator.seed must be a string or number.', '/generator/seed'));
            if (!Array.isArray(generator.outputs) || generator.outputs.length === 0) {
                diagnostics.push(diagnostic(C.GENERATOR_OUTPUT_INVALID, 'generator.outputs must not be empty.', '/generator/outputs'));
            } else generator.outputs.forEach((output, index) => {
                if (!isObject(output)) {
                    diagnostics.push(diagnostic(C.GENERATOR_OUTPUT_INVALID, 'Generator output must be an object.', `/generator/outputs/${index}`));
                    return;
                }
                validatePath(output.path, `/generator/outputs/${index}/path`, diagnostics);
                if (!SHA256_RE.test(output.hash || '')) diagnostics.push(diagnostic(C.HASH_INVALID, 'Generator output hash must be sha256:<64 hex>.', `/generator/outputs/${index}/hash`));
            });
        }
    }
    return result(diagnostics);
}

module.exports = {
    SCHEMA_VERSION,
    ENTITY_KINDS,
    CONTENT_MODES,
    UPDATE_POLICIES,
    DELIVERY_PROFILES,
    BLOOM_LEVELS,
    MATERIAL_AUDIENCES,
    MATERIAL_ROLES,
    COURSE_ID_RE,
    ENTITY_ID_RE,
    INSTANCE_ID_RE,
    VERSION_RE,
    SHA256_RE,
    isSafeRelativePath,
    entityParts,
    validateExportsManifest,
    validateComposeManifest,
    validateLockManifest,
    validateUnit,
    validateCase,
};

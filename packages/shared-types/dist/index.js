"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JSON_SCHEMA_DRAFT4_URI = void 0;
exports.isSchemaObject = isSchemaObject;
exports.toSchemaObject = toSchemaObject;
exports.sanitizeSchemaDefinitionName = sanitizeSchemaDefinitionName;
exports.getSchemaRefName = getSchemaRefName;
exports.createSchemaDefinitionRef = createSchemaDefinitionRef;
exports.normalizeSchemaNode = normalizeSchemaNode;
exports.normalizeSchemaDocument = normalizeSchemaDocument;
exports.resolveSchemaPrimaryType = resolveSchemaPrimaryType;
exports.findUnsupportedVisualSchemaKeywords = findUnsupportedVisualSchemaKeywords;
exports.JSON_SCHEMA_DRAFT4_URI = 'http://json-schema.org/draft-04/schema#';
function isPlainObject(input) {
    return !!input && typeof input === 'object' && !Array.isArray(input);
}
function isSchemaObject(input) {
    return isPlainObject(input);
}
function toSchemaObject(input) {
    return isPlainObject(input) ? input : {};
}
function sanitizeSchemaDefinitionName(input) {
    const source = String(input || '').trim();
    const normalized = source.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    return normalized || 'Definition';
}
function getSchemaRefName(ref) {
    const source = typeof ref === 'string' ? ref : '';
    if (!source) {
        return '';
    }
    const segment = source.split('/').filter(Boolean).pop() || '';
    return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}
function createSchemaDefinitionRef(name) {
    return `#/definitions/${sanitizeSchemaDefinitionName(name)}`;
}
function normalizeSchemaNode(input) {
    const source = toSchemaObject(input);
    if (Object.keys(source).length === 0) {
        return {};
    }
    const next = { ...source };
    if (!next.type) {
        if (typeof next.$ref === 'string' && next.$ref.trim()) {
            next.type = 'ref';
        }
        else if (isPlainObject(next.properties)) {
            next.type = 'object';
        }
        else if (isPlainObject(next.items)) {
            next.type = 'array';
        }
    }
    if (isPlainObject(next.$defs)) {
        next.definitions = {
            ...toSchemaObject(next.definitions),
            ...toSchemaObject(next.$defs)
        };
        delete next.$defs;
    }
    return next;
}
function normalizeSchemaDocument(input) {
    const node = normalizeSchemaNode(input);
    const definitions = toSchemaObject(node.definitions);
    if (Object.keys(definitions).length > 0) {
        node.definitions = definitions;
    }
    else {
        delete node.definitions;
    }
    if (!node.$schema) {
        node.$schema = exports.JSON_SCHEMA_DRAFT4_URI;
    }
    return node;
}
function resolveSchemaPrimaryType(input) {
    const node = normalizeSchemaNode(input);
    const rawType = node.type;
    if (typeof rawType === 'string' && rawType.trim()) {
        return rawType.trim().toLowerCase();
    }
    if (Array.isArray(rawType)) {
        const normalized = rawType.map(item => String(item || '').trim().toLowerCase()).filter(Boolean);
        const primary = normalized.find(item => item !== 'null');
        if (primary) {
            return primary;
        }
        if (normalized.length > 0) {
            return normalized[0];
        }
    }
    if (typeof node.$ref === 'string' && node.$ref.trim()) {
        return 'ref';
    }
    if (isPlainObject(node.properties) || Object.prototype.hasOwnProperty.call(node, 'additionalProperties')) {
        return 'object';
    }
    if (isPlainObject(node.items)) {
        return 'array';
    }
    if (Array.isArray(node.enum) && node.enum.length > 0) {
        const sample = node.enum[0];
        if (typeof sample === 'number') {
            return Number.isInteger(sample) ? 'integer' : 'number';
        }
        if (typeof sample === 'boolean') {
            return 'boolean';
        }
        if (sample === null) {
            return 'null';
        }
        return 'string';
    }
    return 'string';
}
function findUnsupportedVisualSchemaKeywords(input) {
    const unsupported = new Set();
    function visit(nodeInput) {
        const node = toSchemaObject(nodeInput);
        if (Object.keys(node).length === 0) {
            return;
        }
        ['allOf', 'anyOf', 'oneOf', 'not', 'patternProperties', 'prefixItems'].forEach(key => {
            if (Object.prototype.hasOwnProperty.call(node, key)) {
                unsupported.add(key);
            }
        });
        Object.values(toSchemaObject(node.properties)).forEach(visit);
        Object.values(toSchemaObject(node.definitions)).forEach(visit);
        if (isPlainObject(node.items)) {
            visit(node.items);
        }
        if (isPlainObject(node.additionalProperties)) {
            visit(node.additionalProperties);
        }
    }
    visit(normalizeSchemaDocument(input));
    return Array.from(unsupported);
}

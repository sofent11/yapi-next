import json5 from 'json5';
import {
  getSchemaRefName,
  normalizeSchemaDocument,
  normalizeSchemaNode,
  resolveSchemaPrimaryType,
  toSchemaObject
} from '@yapi-next/shared-types';

function getMockValueForType(
  type: string,
  schema: Record<string, any>,
  definitions: Record<string, unknown>,
  visitedRefs: Set<string>,
  depth: number
): any {
  if (schema.default !== undefined) return schema.default;
  if (schema.example !== undefined) return schema.example;
  if (schema.mock && schema.mock.mock !== undefined) {
    return schema.mock.mock;
  }

  if (depth > 12) {
    if (type === 'array') return [];
    if (type === 'object') return {};
    if (type === 'null') return null;
    if (type === 'boolean') return false;
    if (type === 'number' || type === 'integer') return 0;
    return '';
  }

  switch (type) {
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      if (schema.items) {
        return [generateMockFromJsonSchema(schema.items, definitions, visitedRefs, depth + 1)];
      }
      return [];
    case 'object': {
      const obj: Record<string, any> = {};
      Object.entries(toSchemaObject(schema.properties)).forEach(([key, value]) => {
        obj[key] = generateMockFromJsonSchema(value, definitions, visitedRefs, depth + 1);
      });
      if (schema.additionalProperties === true) {
        obj.key = '';
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        obj.key = generateMockFromJsonSchema(
          schema.additionalProperties as Record<string, unknown>,
          definitions,
          visitedRefs,
          depth + 1
        );
      }
      return obj;
    }
    case 'null':
      return null;
    default:
      return '';
  }
}

export function generateMockFromJsonSchema(
  schema: unknown,
  definitionsInput?: Record<string, unknown>,
  visitedRefs: Set<string> = new Set(),
  depth = 0
): any {
  if (!schema || typeof schema !== 'object') {
    return '';
  }

  const node = normalizeSchemaNode(schema) as Record<string, any>;
  const definitions = definitionsInput || toSchemaObject((schema as Record<string, unknown>).definitions);

  if (typeof node.$ref === 'string') {
    const refName = getSchemaRefName(node.$ref);
    if (!refName) {
      return {};
    }
    if (visitedRefs.has(refName)) {
      return {};
    }
    const target = definitions[refName];
    if (!target || typeof target !== 'object') {
      return {};
    }
    const nextVisitedRefs = new Set(visitedRefs);
    nextVisitedRefs.add(refName);
    return generateMockFromJsonSchema(target, definitions, nextVisitedRefs, depth + 1);
  }

  const type = resolveSchemaPrimaryType(node);
  return getMockValueForType(type, node, definitions, visitedRefs, depth);
}

export function generateMockStringFromJsonSchema(schemaStr: string): string {
  if (!schemaStr) return '{}';
  try {
    const parsed = normalizeSchemaDocument(json5.parse(schemaStr));
    const mockObj = generateMockFromJsonSchema(parsed, toSchemaObject(parsed.definitions));
    return JSON.stringify(mockObj, null, 2);
  } catch (_err) {
    return '{}';
  }
}

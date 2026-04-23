import json5 from 'json5';
import {
  JSON_SCHEMA_DRAFT4_URI,
  findUnsupportedVisualSchemaKeywords,
  getSchemaRefName,
  normalizeSchemaDocument,
  normalizeSchemaNode,
  resolveSchemaPrimaryType,
  toSchemaObject
} from '@yapi-next/shared-types';
import type {
  SchemaDefinitionDraft,
  SchemaFieldRow,
  SchemaFieldType
} from './SchemaVisualEditor.types';

export const DRAFT4_SCHEMA_URI = JSON_SCHEMA_DRAFT4_URI;
export const ROOT_ID = '__root__';

export const FIELD_TYPES: Array<{ label: string; value: SchemaFieldType }> = [
  { label: 'string', value: 'string' },
  { label: 'number', value: 'number' },
  { label: 'integer', value: 'integer' },
  { label: 'boolean', value: 'boolean' },
  { label: 'array', value: 'array' },
  { label: 'object', value: 'object' },
  { label: 'ref', value: 'ref' },
  { label: 'null', value: 'null' }
];

export function createId(seed?: string): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${seed || ''}`;
}

export function toObject(input: unknown): Record<string, unknown> {
  return toSchemaObject(input);
}

export function resolveNodeType(record: Record<string, unknown>): SchemaFieldType {
  const type = resolveSchemaPrimaryType(record);
  if (FIELD_TYPES.some(item => item.value === type)) {
    return type as SchemaFieldType;
  }
  return 'string';
}

export function normalizeNodeSchema(input: unknown): Record<string, unknown> | null {
  const node = normalizeSchemaNode(input);
  if (Object.keys(node).length === 0) return null;
  return node;
}

export function parseMaybeJson(input: string): unknown {
  const text = String(input || '').trim();
  if (!text) return undefined;
  try {
    return json5.parse(text);
  } catch (_err) {
    return text;
  }
}

export function inferPrimitiveSchema(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (typeof value === 'string') return { type: 'string' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  return { type: 'string' };
}

export function mergeInferredSchemas(schemas: Record<string, unknown>[]): Record<string, unknown> {
  if (schemas.length === 0) return { type: 'string' };
  if (schemas.length === 1) return schemas[0];

  const typeList = schemas.map(schema => resolveSchemaPrimaryType(schema));
  const uniqueTypes = Array.from(new Set(typeList));
  if (uniqueTypes.length > 1) {
    if (uniqueTypes.length === 2 && uniqueTypes.includes('null')) {
      const nonNull = schemas.find(schema => resolveSchemaPrimaryType(schema) !== 'null');
      return nonNull || { type: 'string' };
    }
    return schemas[0];
  }

  const type = uniqueTypes[0];
  if (type === 'object') {
    const objectSchemas = schemas.map(schema => toObject(schema));
    const keySet = new Set<string>();
    objectSchemas.forEach(schema => {
      Object.keys(toObject(schema.properties)).forEach(key => keySet.add(key));
    });

    const properties: Record<string, unknown> = {};
    Array.from(keySet).forEach(key => {
      const childSchemas = objectSchemas
        .map(schema => toObject(toObject(schema.properties)[key]))
        .filter(schema => Object.keys(schema).length > 0);
      properties[key] = mergeInferredSchemas(childSchemas);
    });

    const required = Array.from(keySet).filter(key =>
      objectSchemas.every(schema => Object.prototype.hasOwnProperty.call(toObject(schema.properties), key))
    );
    const merged: Record<string, unknown> = { type: 'object', properties };
    if (required.length > 0) merged.required = required;
    return merged;
  }

  if (type === 'array') {
    const itemSchemas = schemas
      .map(schema => toObject(schema.items))
      .filter(item => Object.keys(item).length > 0);
    return {
      type: 'array',
      items: itemSchemas.length > 0 ? mergeInferredSchemas(itemSchemas) : { type: 'string' }
    };
  }

  return { type };
}

export function inferSchemaFromJsonValue(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const itemSchemas = value.map(item => inferSchemaFromJsonValue(item));
    return {
      type: 'array',
      items: itemSchemas.length > 0 ? mergeInferredSchemas(itemSchemas) : { type: 'string' }
    };
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const properties: Record<string, unknown> = {};
    const keys = Object.keys(obj);
    keys.forEach(key => {
      properties[key] = inferSchemaFromJsonValue(obj[key]);
    });
    const schema: Record<string, unknown> = { type: 'object', properties };
    if (keys.length > 0) schema.required = keys;
    return schema;
  }

  return inferPrimitiveSchema(value);
}

export function buildSchemaFromPlainJsonText(input: string): string {
  const parsed = json5.parse(String(input || ''));
  const inferred = inferSchemaFromJsonValue(parsed);
  const rootSchema =
    String(inferred.type || '') === 'object'
      ? inferred
      : {
          type: 'object',
          properties: { data: inferred },
          required: ['data']
        };

  return JSON.stringify(
    {
      $schema: DRAFT4_SCHEMA_URI,
      ...rootSchema
    },
    null,
    2
  );
}

function resolveAdditionalPropertiesMode(node: Record<string, unknown>): SchemaFieldRow['additionalPropertiesMode'] {
  if (!Object.prototype.hasOwnProperty.call(node, 'additionalProperties')) {
    return 'none';
  }
  if (node.additionalProperties === false) {
    return 'closed';
  }
  if (node.additionalProperties === true) {
    return 'any';
  }
  if (node.additionalProperties && typeof node.additionalProperties === 'object') {
    return 'schema';
  }
  return 'none';
}

export function nodeToRows(params: {
  node: Record<string, unknown>;
  name: string;
  parentId: string;
  depth: number;
  required: boolean;
  isArrayItem: boolean;
  isAdditionalProperty?: boolean;
  rows: SchemaFieldRow[];
}) {
  const { node, name, parentId, depth, required, isArrayItem, rows } = params;
  const isAdditionalProperty = params.isAdditionalProperty === true;
  const type = resolveNodeType(node);
  const rowId = createId(name || 'field');
  const mockRaw =
    node.mock && typeof node.mock === 'object' && !Array.isArray(node.mock)
      ? String((node.mock as Record<string, unknown>).mock || '')
      : String(node.mock || '');

  rows.push({
    id: rowId,
    parentId,
    depth,
    name,
    type,
    required,
    description: String(node.description || node.title || ''),
    defaultValue: typeof node.default === 'undefined' ? '' : JSON.stringify(node.default),
    mockValue: mockRaw,
    isArrayItem,
    isAdditionalProperty,
    refName: type === 'ref' ? getSchemaRefName(node.$ref) : '',
    additionalPropertiesMode: type === 'object' ? resolveAdditionalPropertiesMode(node) : 'none'
  });

  if (type === 'object') {
    const properties = toObject(node.properties);
    const requiredSet = new Set(
      Array.isArray(node.required) ? node.required.map(item => String(item)) : []
    );
    Object.entries(properties).forEach(([childName, childNode]) => {
      nodeToRows({
        node: toObject(childNode),
        name: childName,
        parentId: rowId,
        depth: depth + 1,
        required: requiredSet.has(childName),
        isArrayItem: false,
        rows
      });
    });

    if (node.additionalProperties && typeof node.additionalProperties === 'object') {
      nodeToRows({
        node: toObject(node.additionalProperties),
        name: '{key}',
        parentId: rowId,
        depth: depth + 1,
        required: false,
        isArrayItem: false,
        isAdditionalProperty: true,
        rows
      });
    }
  }

  if (type === 'array') {
    const itemNode = toObject(node.items);
    if (Object.keys(itemNode).length > 0) {
      nodeToRows({
        node: itemNode,
        name: 'items',
        parentId: rowId,
        depth: depth + 1,
        required: false,
        isArrayItem: true,
        rows
      });
    }
  }
}

function parseDefinitions(node: Record<string, unknown>): SchemaDefinitionDraft[] {
  return Object.entries(toObject(node.definitions)).map(([name, value]) => ({
    name,
    schemaText: JSON.stringify(normalizeSchemaNode(value), null, 2)
  }));
}

export function parseSchemaRows(schemaText?: string): {
  rows: SchemaFieldRow[];
  rootMeta: Record<string, unknown>;
  definitions: SchemaDefinitionDraft[];
  error: string;
  unsupportedKeywords: string[];
} {
  const text = String(schemaText || '').trim();
  if (!text) {
    return {
      rows: [],
      rootMeta: { $schema: DRAFT4_SCHEMA_URI },
      definitions: [],
      error: '',
      unsupportedKeywords: []
    };
  }
  try {
    const raw = json5.parse(text) as Record<string, unknown>;
    const schema = normalizeSchemaDocument(raw);
    const rootMeta = { ...schema };
    delete rootMeta.type;
    delete rootMeta.properties;
    delete rootMeta.required;
    delete rootMeta.definitions;
    delete rootMeta.$defs;
    if (!rootMeta.$schema) {
      rootMeta.$schema = DRAFT4_SCHEMA_URI;
    }

    const rootType = resolveNodeType(schema);
    const rootRows: SchemaFieldRow[] = [];

    if (rootType === 'object') {
      const properties = toObject(schema.properties);
      const requiredSet = new Set(
        Array.isArray(schema.required) ? schema.required.map(item => String(item)) : []
      );
      Object.entries(properties).forEach(([name, node]) => {
        nodeToRows({
          node: toObject(node),
          name,
          parentId: ROOT_ID,
          depth: 0,
          required: requiredSet.has(name),
          isArrayItem: false,
          rows: rootRows
        });
      });
    } else if (Object.keys(schema).length > 0) {
      nodeToRows({
        node: schema,
        name: 'data',
        parentId: ROOT_ID,
        depth: 0,
        required: false,
        isArrayItem: false,
        rows: rootRows
      });
    }

    return {
      rows: rootRows,
      rootMeta,
      definitions: parseDefinitions(schema),
      error: '',
      unsupportedKeywords: findUnsupportedVisualSchemaKeywords(schema)
    };
  } catch (err) {
    return {
      rows: [],
      rootMeta: {},
      definitions: [],
      error: String((err as Error).message || 'schema 解析失败'),
      unsupportedKeywords: []
    };
  }
}

export function schemaSupportsVisualEditor(schemaText?: string): { supported: boolean; keywords: string[] } {
  const parsed = parseSchemaRows(schemaText);
  return {
    supported: !parsed.error && parsed.unsupportedKeywords.length === 0,
    keywords: parsed.unsupportedKeywords
  };
}

export function buildChildrenMap(rows: SchemaFieldRow[]): Map<string, SchemaFieldRow[]> {
  const map = new Map<string, SchemaFieldRow[]>();
  rows.forEach(row => {
    const list = map.get(row.parentId) || [];
    list.push(row);
    map.set(row.parentId, list);
  });
  return map;
}

export function buildNodeFromRow(row: SchemaFieldRow, childrenMap: Map<string, SchemaFieldRow[]>): Record<string, unknown> {
  const node: Record<string, unknown> = {};

  if (row.type === 'ref') {
    node.$ref = `#/definitions/${String(row.refName || 'Definition').trim() || 'Definition'}`;
  } else {
    node.type = row.type;
  }

  if (String(row.description || '').trim()) {
    node.description = String(row.description || '').trim();
  }

  if (String(row.defaultValue || '').trim()) {
    const parsedDefault = parseMaybeJson(row.defaultValue);
    if (typeof parsedDefault !== 'undefined') {
      node.default = parsedDefault;
    }
  }

  if (String(row.mockValue || '').trim()) {
    node.mock = { mock: String(row.mockValue || '').trim() };
  }

  const children = childrenMap.get(row.id) || [];

  if (row.type === 'object') {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    children
      .filter(child => !child.isArrayItem && !child.isAdditionalProperty)
      .forEach(child => {
        const name = String(child.name || '').trim();
        if (!name) return;
        properties[name] = buildNodeFromRow(child, childrenMap);
        if (child.required) required.push(name);
      });
    node.properties = properties;
    if (required.length > 0) {
      node.required = required;
    }

    if (row.additionalPropertiesMode === 'closed') {
      node.additionalProperties = false;
    } else if (row.additionalPropertiesMode === 'any') {
      node.additionalProperties = true;
    } else if (row.additionalPropertiesMode === 'schema') {
      const mapRow = children.find(child => child.isAdditionalProperty) || null;
      node.additionalProperties = mapRow ? buildNodeFromRow(mapRow, childrenMap) : { type: 'string' };
    }
  }

  if (row.type === 'array') {
    const itemRow = children.find(child => child.isArrayItem) || null;
    node.items = itemRow ? buildNodeFromRow(itemRow, childrenMap) : { type: 'string' };
  }

  return node;
}

function buildDefinitionsObject(definitions: SchemaDefinitionDraft[] | undefined): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  (definitions || []).forEach(item => {
    const name = String(item.name || '').trim();
    if (!name) {
      return;
    }
    try {
      output[name] = normalizeSchemaNode(json5.parse(String(item.schemaText || '{}')));
    } catch (_err) {
      output[name] = { type: 'object' };
    }
  });
  return output;
}

export function rowsToSchemaText(
  rows: SchemaFieldRow[],
  rootMeta?: Record<string, unknown>,
  definitions?: SchemaDefinitionDraft[]
): string {
  const childrenMap = buildChildrenMap(rows);
  const topRows = (childrenMap.get(ROOT_ID) || []).filter(row => !row.isArrayItem && !row.isAdditionalProperty);
  const rootProperties: Record<string, unknown> = {};
  const rootRequired: string[] = [];

  topRows.forEach(row => {
    const name = String(row.name || '').trim();
    if (!name) return;
    rootProperties[name] = buildNodeFromRow(row, childrenMap);
    if (row.required) rootRequired.push(name);
  });

  const schema: Record<string, unknown> = {
    ...(rootMeta || {}),
    type: 'object',
    properties: rootProperties
  };

  if (rootRequired.length > 0) {
    schema.required = rootRequired;
  } else {
    delete schema.required;
  }

  const definitionObject = buildDefinitionsObject(definitions);
  if (Object.keys(definitionObject).length > 0) {
    schema.definitions = definitionObject;
  } else {
    delete schema.definitions;
  }

  if (!schema.$schema) {
    schema.$schema = DRAFT4_SCHEMA_URI;
  }

  return JSON.stringify(schema, null, 2);
}

export function findRowIndex(rows: SchemaFieldRow[], id: string): number {
  return rows.findIndex(item => item.id === id);
}

export function getSubtreeEnd(rows: SchemaFieldRow[], index: number): number {
  if (index < 0 || index >= rows.length) return index;
  const depth = rows[index].depth;
  let end = index + 1;
  while (end < rows.length && rows[end].depth > depth) {
    end += 1;
  }
  return end;
}

export function getSubtreeIds(rows: SchemaFieldRow[], index: number): string[] {
  const end = getSubtreeEnd(rows, index);
  return rows.slice(index, end).map(item => item.id);
}

export function getParentRow(rows: SchemaFieldRow[], row: SchemaFieldRow): SchemaFieldRow | null {
  if (row.parentId === ROOT_ID) return null;
  return rows.find(item => item.id === row.parentId) || null;
}

export function isRequiredEditable(rows: SchemaFieldRow[], row: SchemaFieldRow): boolean {
  if (row.isArrayItem || row.isAdditionalProperty) return false;
  if (row.parentId === ROOT_ID) return true;
  const parent = getParentRow(rows, row);
  if (!parent) return false;
  return parent.type === 'object';
}

export function createEmptyRow(params: {
  parentId: string;
  depth: number;
  isArrayItem?: boolean;
  isAdditionalProperty?: boolean;
  type?: SchemaFieldType;
}): SchemaFieldRow {
  const isArrayItem = params.isArrayItem === true;
  const isAdditionalProperty = params.isAdditionalProperty === true;
  return {
    id: createId('new'),
    parentId: params.parentId,
    depth: params.depth,
    name: isArrayItem ? 'items' : isAdditionalProperty ? '{key}' : '',
    type: params.type || 'string',
    required: false,
    description: '',
    defaultValue: '',
    mockValue: '',
    isArrayItem,
    isAdditionalProperty,
    refName: '',
    additionalPropertiesMode: 'none'
  };
}

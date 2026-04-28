import JSON5 from 'json5';
import { compile } from 'json-schema-to-typescript';
const toJsonSchema = require('to-json-schema');
import {
  Method,
  RequestBodyType,
  RequestFormItemType,
  Required,
  ResponseBodyType
} from './types';
import type { Interface, PropDefinitions } from './types';

type JsonObject = Record<string, any>;

const JSTT_OPTIONS = {
  bannerComment: '',
  style: {
    bracketSpacing: false,
    printWidth: 120,
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'none' as const,
    useTabs: false
  }
};

function isObject(input: unknown): input is JsonObject {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}

function clone<T>(input: T): T {
  return JSON.parse(JSON.stringify(input));
}

function castArray<T>(input: T | T[] | undefined): T[] {
  return Array.isArray(input) ? input : input == null ? [] : [input];
}

function normalizeType(type: unknown, customTypeMapping: Record<string, string>): unknown {
  if (!type) return type;
  const typeMapping: Record<string, string> = {
    byte: 'integer',
    short: 'integer',
    int: 'integer',
    long: 'integer',
    float: 'number',
    double: 'number',
    bigdecimal: 'number',
    char: 'string',
    void: 'null'
  };
  Object.entries(customTypeMapping).forEach(([key, value]) => {
    typeMapping[key.toLowerCase()] = value;
  });

  const isMultiple = Array.isArray(type);
  const values = castArray(type as string | string[]).map(item => {
    const normalized = String(item || '').toLowerCase();
    return typeMapping[normalized] || normalized;
  });
  return isMultiple ? values : values[0];
}

function mergeDefinitions(node: JsonObject): void {
  if (isObject(node.$defs)) {
    node.definitions = {
      ...(isObject(node.definitions) ? node.definitions : {}),
      ...node.$defs
    };
    delete node.$defs;
  }
}

function visitSchema(input: unknown, cb: (node: JsonObject, path: Array<string | number>) => void, path: Array<string | number> = []): void {
  if (!isObject(input)) return;
  cb(input, path);

  if (Array.isArray(input.properties)) {
    input.properties = input.properties.reduce((result: JsonObject, item: JsonObject) => {
      if (item?.name) {
        result[item.name] = item;
      }
      return result;
    }, {});
  }

  ['properties', 'patternProperties', 'definitions', '$defs'].forEach(key => {
    if (!isObject(input[key])) return;
    Object.entries(input[key]).forEach(([name, value]) => visitSchema(value, cb, [...path, name]));
  });
  ['items', 'additionalProperties', 'not'].forEach(key => {
    const value = input[key];
    if (Array.isArray(value)) {
      value.forEach((item, index) => visitSchema(item, cb, [...path, key, index]));
    } else if (isObject(value)) {
      visitSchema(value, cb, [...path, key]);
    }
  });
  ['allOf', 'anyOf', 'oneOf', 'prefixItems'].forEach(key => {
    if (Array.isArray(input[key])) {
      input[key].forEach((item: unknown, index: number) => visitSchema(item, cb, [...path, key, index]));
    }
  });
}

export function processJsonSchema(jsonSchema: unknown, customTypeMapping: Record<string, string> = {}): JsonObject {
  const root = isObject(jsonSchema) ? jsonSchema : {};
  visitSchema(root, node => {
    mergeDefinitions(node);
    if (Array.isArray(node.items) && node.items.length > 0) {
      node.items = node.items[0];
    }
    if (node.type) {
      node.type = normalizeType(node.type, customTypeMapping);
    }
    if (!node.type) {
      if (typeof node.$ref === 'string') node.type = undefined;
      else if (isObject(node.properties) || Object.prototype.hasOwnProperty.call(node, 'additionalProperties')) node.type = 'object';
      else if (isObject(node.items)) node.type = 'array';
    }
    if (isObject(node.properties)) {
      Object.keys(node.properties).forEach(prop => {
        const trimmed = prop.trim();
        if (trimmed !== prop) {
          node.properties[trimmed] = node.properties[prop];
          delete node.properties[prop];
        }
      });
      if (Array.isArray(node.required)) {
        node.required = node.required.map((prop: string) => String(prop).trim());
      }
    }
  });
  return root;
}

function getDefinitionName(ref: string): string {
  if (!ref.startsWith('#/')) return '';
  return ref
    .slice(2)
    .split('/')
    .map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .pop() || '';
}

function getDefinition(schema: JsonObject, ref: string): JsonObject | undefined {
  if (ref.startsWith('#/definitions/')) {
    const name = ref.slice('#/definitions/'.length).replace(/~1/g, '/').replace(/~0/g, '~');
    return isObject(schema.definitions?.[name]) ? schema.definitions[name] : undefined;
  }
  if (ref.startsWith('#/$defs/')) {
    const name = ref.slice('#/$defs/'.length).replace(/~1/g, '/').replace(/~0/g, '~');
    return isObject(schema.$defs?.[name]) ? schema.$defs[name] : undefined;
  }
  return undefined;
}

function normalizeForTypescript(input: JsonObject): JsonObject {
  const schema = clone(input);
  mergeDefinitions(schema);

  if (typeof schema.$ref === 'string') {
    const target = getDefinition(schema, schema.$ref);
    if (target) {
      const definitions = isObject(schema.definitions) ? schema.definitions : {};
      const expanded: JsonObject = {
        ...clone(target),
        definitions
      };
      delete expanded.$defs;
      return normalizeForTypescript(expanded);
    }
  }

  visitSchema(schema, node => {
    mergeDefinitions(node);
    delete node.id;
    delete node.default;
    delete node.minItems;
    delete node.maxItems;

    if (node.type === 'object' || isObject(node.properties) || Object.prototype.hasOwnProperty.call(node, 'additionalProperties')) {
      node.type = 'object';
      if (node.additionalProperties === true) {
        node.additionalProperties = { tsType: 'any' };
      } else if (!Object.prototype.hasOwnProperty.call(node, 'additionalProperties')) {
        node.additionalProperties = false;
      }
    }
  });

  return schema;
}

export function jsonSchemaStringToJsonSchema(str: string, customTypeMapping: Record<string, string> = {}): JsonObject {
  return processJsonSchema(JSON.parse(str), customTypeMapping);
}

export function jsonToJsonSchema(json: unknown, customTypeMapping: Record<string, string> = {}): JsonObject {
  const schema = toJsonSchema(json, {
    required: false,
    arrays: {
      mode: 'first'
    },
    objects: {
      additionalProperties: false
    },
    strings: {
      detectFormat: false
    },
    postProcessFnc(type: string, schemaValue: JsonObject, value: unknown) {
      if (!schemaValue.description && !!value && type !== 'object') {
        schemaValue.description = JSON.stringify(value);
      }
      return schemaValue;
    }
  });
  delete schema.description;
  return processJsonSchema(schema, customTypeMapping);
}

export function mockjsTemplateToJsonSchema(template: unknown, customTypeMapping: Record<string, string> = {}): JsonObject {
  const source = clone(template);
  const actions: Array<() => void> = [];
  const keyRe = /(.+)\|(?:\+(\d+)|([+-]?\d+-?[+-]?\d*)?(?:\.(\d+-?\d*))?)/;
  const numberPatterns = ['natural', 'integer', 'float', 'range', 'increment'];
  const boolPatterns = ['boolean', 'bool'];
  const normalizeValue = (value: unknown) => {
    if (typeof value === 'string' && value.startsWith('@')) {
      const pattern = value.slice(1);
      if (numberPatterns.some(item => pattern.startsWith(item))) return 1;
      if (boolPatterns.some(item => pattern.startsWith(item))) return true;
    }
    return value;
  };
  const walk = (value: unknown, parent?: JsonObject, key?: string) => {
    if (parent && typeof key === 'string') {
      actions.push(() => {
        const nextKey = key.replace(keyRe, '$1');
        const nextValue = normalizeValue(value);
        delete parent[key];
        parent[nextKey] = nextValue;
      });
    }
    if (Array.isArray(value)) {
      value.forEach(item => walk(item));
    } else if (isObject(value)) {
      Object.keys(value).forEach(childKey => walk(value[childKey], value, childKey));
    }
  };
  walk(source);
  actions.forEach(action => action());
  return jsonToJsonSchema(source, customTypeMapping);
}

export function propDefinitionsToJsonSchema(propDefinitions: PropDefinitions, customTypeMapping: Record<string, string> = {}): JsonObject {
  return processJsonSchema({
    type: 'object',
    required: propDefinitions.reduce<string[]>((result, prop) => {
      if (prop.required) result.push(prop.name);
      return result;
    }, []),
    properties: propDefinitions.reduce<JsonObject>((result, prop) => {
      result[prop.name] = {
        type: prop.type === 'file' ? 'string' : prop.type || 'string',
        description: prop.comment || '',
        ...(prop.type === 'file' ? { tsType: 'FileData' } : {})
      };
      return result;
    }, {})
  }, customTypeMapping);
}

export async function jsonSchemaToType(jsonSchema: JsonObject, typeName: string): Promise<string> {
  if (!jsonSchema || Object.keys(jsonSchema).length === 0) {
    return `export interface ${typeName} {}`;
  }
  if (jsonSchema.__is_any__) {
    return `export type ${typeName} = any`;
  }
  const fakeTypeName = 'THISISAFAKETYPENAME';
  const schema = normalizeForTypescript(jsonSchema);
  const code = await compile(schema, fakeTypeName, JSTT_OPTIONS);
  return code.replace(new RegExp(fakeTypeName, 'g'), typeName).trim();
}

function isGetLikeMethod(method: string): boolean {
  const normalized = String(method || '').toUpperCase();
  return normalized === Method.GET || normalized === Method.OPTIONS || normalized === Method.HEAD;
}

export function getRequestDataJsonSchema(interfaceInfo: Interface, customTypeMapping: Record<string, string> = {}): JsonObject {
  let jsonSchema: JsonObject | undefined;

  if (!isGetLikeMethod(String(interfaceInfo.method))) {
    if (interfaceInfo.req_body_type === RequestBodyType.form) {
      jsonSchema = propDefinitionsToJsonSchema((interfaceInfo.req_body_form || []).map(item => ({
        name: item.name,
        required: item.required === Required.true,
        type: item.type === RequestFormItemType.file ? 'file' : 'string',
        comment: item.desc
      })), customTypeMapping);
    } else if (interfaceInfo.req_body_type === RequestBodyType.json && interfaceInfo.req_body_other) {
      jsonSchema = interfaceInfo.req_body_is_json_schema
        ? jsonSchemaStringToJsonSchema(interfaceInfo.req_body_other, customTypeMapping)
        : jsonToJsonSchema(JSON5.parse(interfaceInfo.req_body_other), customTypeMapping);
    }
  }

  const mergeObjectSchema = (nextSchema: JsonObject) => {
    if (!jsonSchema) {
      jsonSchema = nextSchema;
      return;
    }
    jsonSchema.properties = {
      ...(isObject(jsonSchema.properties) ? jsonSchema.properties : {}),
      ...(isObject(nextSchema.properties) ? nextSchema.properties : {})
    };
    jsonSchema.required = [
      ...(Array.isArray(jsonSchema.required) ? jsonSchema.required : []),
      ...(Array.isArray(nextSchema.required) ? nextSchema.required : [])
    ];
  };

  if (Array.isArray(interfaceInfo.req_query) && interfaceInfo.req_query.length > 0) {
    mergeObjectSchema(propDefinitionsToJsonSchema(interfaceInfo.req_query.map(item => ({
      name: item.name,
      required: item.required === Required.true,
      type: item.type || 'string',
      comment: item.desc
    })), customTypeMapping));
  }

  if (Array.isArray(interfaceInfo.req_params) && interfaceInfo.req_params.length > 0) {
    mergeObjectSchema(propDefinitionsToJsonSchema(interfaceInfo.req_params.map(item => ({
      name: item.name,
      required: true,
      type: item.type || 'string',
      comment: item.desc
    })), customTypeMapping));
  }

  return jsonSchema || {};
}

export function reachJsonSchema(jsonSchema: JsonObject, path: string | string[]): JsonObject {
  let current = jsonSchema;
  for (const segment of castArray(path)) {
    const next = current.properties?.[segment];
    if (!isObject(next)) {
      return jsonSchema;
    }
    current = next;
  }
  if (!isObject(current.definitions) && isObject(jsonSchema.definitions)) {
    return {
      ...current,
      definitions: jsonSchema.definitions
    };
  }
  return current;
}

export function getResponseDataJsonSchema(
  interfaceInfo: Interface,
  customTypeMapping: Record<string, string> = {},
  dataKey?: string | string[]
): JsonObject {
  let jsonSchema: JsonObject = {};
  if (interfaceInfo.res_body_type === ResponseBodyType.json && interfaceInfo.res_body) {
    jsonSchema = interfaceInfo.res_body_is_json_schema
      ? jsonSchemaStringToJsonSchema(interfaceInfo.res_body, customTypeMapping)
      : mockjsTemplateToJsonSchema(JSON5.parse(interfaceInfo.res_body), customTypeMapping);
  } else {
    jsonSchema = { __is_any__: true };
  }

  return dataKey ? reachJsonSchema(jsonSchema, dataKey) : jsonSchema;
}

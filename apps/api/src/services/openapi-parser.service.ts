import { Injectable } from '@nestjs/common';
import { URL } from 'node:url';

const swagger2openapi = require('swagger2openapi');
const SwaggerParser = require('@apidevtools/swagger-parser');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;

export interface NormalizedApiItem {
  method: string;
  title: string;
  desc: string;
  catname: string | null;
  tag: string[];
  path: string;
  req_params: Array<Record<string, any>>;
  req_body_form: Array<Record<string, any>>;
  req_headers: Array<Record<string, any>>;
  req_query: Array<Record<string, any>>;
  req_body_type: string;
  req_body_other: string;
  req_body_is_json_schema: boolean;
  res_body_type: string;
  res_body: string;
  res_body_is_json_schema: boolean;
  operation_oas3: string;
  import_meta: string;
  api_opened?: boolean;
}

export interface ParsedSpecResult {
  detectedFormat: 'swagger2' | 'openapi3';
  basePath: string;
  cats: Array<{ name: string; desc: string }>;
  apis: NormalizedApiItem[];
}

function handlePath(path: string): string {
  if (path === '/') return path;
  let value = path;
  if (!value.startsWith('/')) {
    value = '/' + value;
  }
  if (value.endsWith('/')) {
    value = value.slice(0, -1);
  }
  return value;
}

function pickMediaType(content: Record<string, any> | undefined): string | null {
  if (!content || typeof content !== 'object') return null;
  const prefer = [
    'application/json',
    'application/hal+json',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
    '*/*'
  ];
  for (const type of prefer) {
    if (content[type]) return type;
  }
  const keys = Object.keys(content);
  return keys.length > 0 ? keys[0] : null;
}

function parseServerBasePath(spec: any): string {
  if (!Array.isArray(spec?.servers) || !spec.servers[0]?.url) {
    return '';
  }
  const serverUrl = spec.servers[0].url as string;
  try {
    const parsed = new URL(serverUrl, 'http://yapi.local');
    return parsed.pathname && parsed.pathname !== '/' ? handlePath(parsed.pathname) : '';
  } catch (_err) {
    if (serverUrl.startsWith('/')) {
      return handlePath(serverUrl);
    }
    return '';
  }
}

function normalizeParameter(param: any): { name: string; desc?: string; required: string } {
  return {
    name: param.name,
    desc: param.description,
    required: param.required ? '1' : '0'
  };
}

function isVersionTag(tag: string): boolean {
  return /^v[0-9.]+$/i.test(tag);
}

function selectCategory(tags: string[] | undefined, rootTags: string[]): string | null {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  for (const tag of tags) {
    if (!isVersionTag(tag)) {
      if (rootTags.length === 0 || rootTags.includes(tag)) {
        return tag;
      }
    }
  }
  return tags[0];
}

function selectResponse(responses: Record<string, any> | undefined): Record<string, any> | null {
  if (!responses || typeof responses !== 'object') return null;
  const keys = Object.keys(responses);
  const priority = ['200', '201', '202', '203', '204', 'default'];
  for (const code of priority) {
    if (responses[code]) return responses[code];
  }
  return keys.length > 0 ? responses[keys[0]] : null;
}

@Injectable()
export class OpenapiParserService {
  async parse(content: string | Record<string, unknown>): Promise<ParsedSpecResult> {
    const rawSpec = typeof content === 'string' ? JSON.parse(content) : content;
    const { openapi3, detectedFormat } = await this.toOpenApi3(rawSpec);
    const spec = await SwaggerParser.bundle(openapi3);
    const dereferencedSpec = await SwaggerParser.dereference(JSON.parse(JSON.stringify(openapi3)), {
      dereference: {
        circular: 'ignore'
      }
    });
    const basePath = parseServerBasePath(spec);
    const cats: Array<{ name: string; desc: string }> = [];
    const apis: NormalizedApiItem[] = [];

    const rootTags = Array.isArray(spec.tags) ? spec.tags.map((item: any) => item.name) : [];
    if (Array.isArray(spec.tags)) {
      for (const tag of spec.tags) {
        cats.push({
          name: tag.name,
          desc: tag.description || tag.name
        });
      }
    }

    const paths = spec.paths || {};
    const dereferencedPaths = dereferencedSpec?.paths || {};
    for (const pathKey of Object.keys(paths)) {
      const pathItem = paths[pathKey];
      const dereferencedPathItem = dereferencedPaths[pathKey];
      if (!pathItem || typeof pathItem !== 'object') continue;

      for (const method of HTTP_METHODS) {
        const operation = pathItem[method];
        const dereferencedOperation = dereferencedPathItem?.[method];
        if (!operation || typeof operation !== 'object') continue;
        const mergedOperation = {
          ...operation,
          parameters: [...(pathItem.parameters || []), ...(operation.parameters || [])]
        };
        const mergedDereferencedOperation = {
          ...(dereferencedOperation || operation),
          parameters: [
            ...(dereferencedPathItem?.parameters || pathItem.parameters || []),
            ...(dereferencedOperation?.parameters || operation.parameters || [])
          ]
        };
        const catname = selectCategory(mergedOperation.tags, rootTags);
        const api: NormalizedApiItem = {
          method: method.toUpperCase(),
          title: mergedOperation.summary || mergedOperation.operationId || pathKey,
          desc: mergedOperation.description || mergedOperation.summary || '',
          catname,
          tag: Array.isArray(mergedOperation.tags) ? mergedOperation.tags : [],
          path: handlePath(pathKey),
          req_params: [],
          req_body_form: [],
          req_headers: [],
          req_query: [],
          req_body_type: 'raw',
          req_body_other: '',
          req_body_is_json_schema: false,
          res_body_type: 'raw',
          res_body: '',
          res_body_is_json_schema: false,
          operation_oas3: JSON.stringify(mergedOperation, null, 2),
          import_meta: JSON.stringify({
            source: 'openapi3',
            detectedFormat,
            operationId: mergedOperation.operationId || '',
            mediaTypes: mergedOperation.requestBody?.content
              ? Object.keys(mergedOperation.requestBody.content)
              : []
          })
        };

        this.handleParameters(mergedDereferencedOperation, api, spec);
        this.handleRequestBody(mergedDereferencedOperation, api, spec);
        this.handleResponse(mergedDereferencedOperation, api, spec);

        if (api.catname && !cats.find(item => item.name === api.catname)) {
          cats.push({
            name: api.catname,
            desc: api.catname
          });
        }
        apis.push(api);
      }
    }

    const finalCats = cats.filter(cat => apis.some(api => api.catname === cat.name));
    return {
      detectedFormat,
      basePath,
      cats: finalCats,
      apis
    };
  }

  private async toOpenApi3(spec: any): Promise<{ openapi3: any; detectedFormat: 'swagger2' | 'openapi3' }> {
    if (spec?.openapi && /^3\./.test(spec.openapi)) {
      return {
        openapi3: spec,
        detectedFormat: 'openapi3'
      };
    }
    if (spec?.swagger && /^2\./.test(spec.swagger)) {
      const converted = await swagger2openapi.convertObj(spec, {
        patch: true,
        warnOnly: true,
        resolve: true
      });
      return {
        openapi3: converted.openapi,
        detectedFormat: 'swagger2'
      };
    }
    throw new Error('仅支持 Swagger 2.x 或 OpenAPI 3.x 规范');
  }

  private handleParameters(operation: any, api: NormalizedApiItem, spec: any): void {
    const params = Array.isArray(operation.parameters) ? operation.parameters : [];
    for (const param of params) {
      if (param?.in === 'query') {
        const expanded = this.expandStructuredQueryParameter(param, spec);
        if (expanded.length > 0) {
          api.req_query.push(...expanded);
          continue;
        }
      }
      const data = normalizeParameter(param);
      switch (param.in) {
        case 'path':
          api.req_params.push(data);
          break;
        case 'query':
          api.req_query.push(data);
          break;
        case 'header':
          api.req_headers.push(data);
          break;
        default:
          break;
      }
    }
  }

  private expandStructuredQueryParameter(param: any, spec: any): Array<Record<string, any>> {
    const schema = this.resolveSchema(param?.schema, spec);
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return [];
    }
    if (String(schema.type || '').toLowerCase() !== 'object') {
      return [];
    }
    return this.flattenQuerySchemaProperties(schema, '');
  }

  private flattenQuerySchemaProperties(
    schema: Record<string, any>,
    prefix: string
  ): Array<Record<string, any>> {
    const properties = schema.properties && typeof schema.properties === 'object'
      ? schema.properties as Record<string, any>
      : {};
    const required = new Set(
      Array.isArray(schema.required)
        ? schema.required.map((item: unknown) => String(item))
        : []
    );
    const rows: Array<Record<string, any>> = [];

    Object.entries(properties).forEach(([name, property]) => {
      const fieldName = prefix ? `${prefix}.${name}` : name;
      const propertySchema = property && typeof property === 'object' && !Array.isArray(property)
        ? property as Record<string, any>
        : {};
      const propertyType = String(propertySchema.type || '').toLowerCase();
      if (propertyType === 'object' && propertySchema.properties && typeof propertySchema.properties === 'object') {
        rows.push(...this.flattenQuerySchemaProperties(propertySchema, fieldName));
        return;
      }
      rows.push({
        name: fieldName,
        desc: propertySchema.description || '',
        required: required.has(name) ? '1' : '0',
        example: typeof propertySchema.example !== 'undefined'
          ? String(propertySchema.example)
          : typeof propertySchema.default !== 'undefined'
            ? String(propertySchema.default)
            : ''
      });
    });

    return rows;
  }

  private handleRequestBody(operation: any, api: NormalizedApiItem, spec: any): void {
    if (!operation?.requestBody?.content) return;
    const mediaType = pickMediaType(operation.requestBody.content);
    if (!mediaType) return;
    const media = operation.requestBody.content[mediaType] || {};
    const schema = this.resolveSchema(media.schema || {}, spec);
    if (mediaType === 'application/json' || mediaType.includes('+json')) {
      api.req_body_type = 'json';
      api.req_body_is_json_schema = true;
      api.req_body_other = JSON.stringify(schema, null, 2);
      return;
    }
    if (mediaType === 'multipart/form-data' || mediaType === 'application/x-www-form-urlencoded') {
      api.req_body_type = 'form';
      const required = Array.isArray(schema.required) ? schema.required : [];
      const properties = schema.properties || {};
      for (const name of Object.keys(properties)) {
        const property = properties[name] || {};
        const isFile = property.format === 'binary' || property.contentEncoding === 'binary';
        api.req_body_form.push({
          name,
          type: isFile ? 'file' : 'text',
          desc: property.description || '',
          required: required.includes(name) ? '1' : '0'
        });
      }
      return;
    }
    if (media.schema && this.isJsonSchemaLike(schema)) {
      api.req_body_type = 'json';
      api.req_body_is_json_schema = true;
      api.req_body_other = JSON.stringify(schema, null, 2);
      return;
    }
    api.req_body_type = 'raw';
    if (media.schema) {
      api.req_body_other = JSON.stringify(media.schema, null, 2);
    } else if (typeof media.example !== 'undefined') {
      api.req_body_other = typeof media.example === 'string' ? media.example : JSON.stringify(media.example, null, 2);
    }
  }

  private handleResponse(operation: any, api: NormalizedApiItem, spec: any): void {
    const response = selectResponse(operation.responses);
    if (!response) return;
    const mediaType = pickMediaType(response.content);
    if (mediaType && response.content[mediaType]) {
      const media = response.content[mediaType];
      if (media.schema) {
        api.res_body = JSON.stringify(this.resolveSchema(media.schema, spec), null, 2);
        api.res_body_type = 'json';
        api.res_body_is_json_schema = true;
        return;
      }
      if (typeof media.example !== 'undefined') {
        api.res_body = typeof media.example === 'string' ? media.example : JSON.stringify(media.example, null, 2);
        api.res_body_type = mediaType.includes('json') ? 'json' : 'raw';
        api.res_body_is_json_schema = false;
        return;
      }
    }
    api.res_body = response.description || '';
    api.res_body_type = 'raw';
    api.res_body_is_json_schema = false;
  }

  private resolveSchema(schema: any, spec: any, seenRefs: Set<string> = new Set()): any {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    if (typeof schema.$ref === 'string') {
      const ref = schema.$ref;
      if (seenRefs.has(ref)) {
        return this.collapseCircularRef(ref, spec);
      }
      const target = this.getRefValue(spec, ref);
      if (!target || typeof target !== 'object') {
        return schema;
      }
      const nextSeen = new Set(seenRefs);
      nextSeen.add(ref);
      const resolvedTarget = this.resolveSchema(target, spec, nextSeen);
      const { $ref: _ignored, ...rest } = schema;
      return {
        ...(resolvedTarget && typeof resolvedTarget === 'object' ? resolvedTarget : {}),
        ...this.resolveSchema(rest, spec, nextSeen)
      };
    }

    if (Array.isArray(schema)) {
      return schema.map(item => this.resolveSchema(item, spec, seenRefs));
    }

    const result: Record<string, any> = {};
    Object.entries(schema).forEach(([key, value]) => {
      if (
        key === 'properties' ||
        key === 'patternProperties' ||
        key === 'definitions' ||
        key === '$defs'
      ) {
        const next: Record<string, any> = {};
        Object.entries((value || {}) as Record<string, any>).forEach(([innerKey, innerValue]) => {
          next[innerKey] = this.resolveSchema(innerValue, spec, seenRefs);
        });
        result[key] = next;
        return;
      }
      if (key === 'items' || key === 'additionalProperties' || key === 'not') {
        result[key] = this.resolveSchema(value, spec, seenRefs);
        return;
      }
      if (key === 'allOf' || key === 'anyOf' || key === 'oneOf' || key === 'prefixItems') {
        result[key] = Array.isArray(value)
          ? value.map(item => this.resolveSchema(item, spec, seenRefs))
          : value;
        return;
      }
      result[key] = value;
    });
    return result;
  }

  private collapseCircularRef(ref: string, spec: any): any {
    const target = this.getRefValue(spec, ref);
    if (!target || typeof target !== 'object') {
      return { type: 'object' };
    }
    return this.toShallowSchema(target, spec);
  }

  private toShallowSchema(schema: any, spec: any): any {
    if (!schema || typeof schema !== 'object') {
      return { type: 'object' };
    }
    if (typeof schema.$ref === 'string') {
      const target = this.getRefValue(spec, schema.$ref);
      return this.toShallowSchema(target, spec);
    }

    const result: Record<string, any> = {};
    for (const key of ['title', 'description', 'nullable', 'deprecated', 'readOnly', 'writeOnly']) {
      if (typeof schema[key] !== 'undefined') {
        result[key] = schema[key];
      }
    }

    if (schema.type === 'array') {
      result.type = 'array';
      result.items = this.toShallowArrayItemSchema(schema.items, spec);
      return result;
    }

    result.type = typeof schema.type === 'string' ? schema.type : 'object';
    return result;
  }

  private toShallowArrayItemSchema(schema: any, spec: any): any {
    if (!schema || typeof schema !== 'object') {
      return { type: 'object' };
    }
    if (typeof schema.$ref === 'string') {
      const target = this.getRefValue(spec, schema.$ref);
      return this.toShallowSchema(target, spec);
    }
    if (schema.type === 'array') {
      return {
        type: 'array',
        items: { type: 'object' }
      };
    }
    return {
      type: typeof schema.type === 'string' ? schema.type : 'object'
    };
  }

  private isJsonSchemaLike(schema: any): boolean {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return false;
    }
    return [
      '$schema',
      '$ref',
      'type',
      'properties',
      'items',
      'required',
      'additionalProperties',
      'allOf',
      'anyOf',
      'oneOf',
      'not',
      'enum',
      'format'
    ].some(key => Object.prototype.hasOwnProperty.call(schema, key));
  }

  private getRefValue(spec: any, ref: string): any {
    if (!ref.startsWith('#/')) {
      return undefined;
    }
    const segments = ref
      .slice(2)
      .split('/')
      .map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
    let current = spec;
    for (const segment of segments) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = current[segment];
    }
    return current;
  }
}

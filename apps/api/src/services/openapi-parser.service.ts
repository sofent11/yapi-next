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
    for (const pathKey of Object.keys(paths)) {
      const pathItem = paths[pathKey];
      if (!pathItem || typeof pathItem !== 'object') continue;

      for (const method of HTTP_METHODS) {
        const operation = pathItem[method];
        if (!operation || typeof operation !== 'object') continue;
        const mergedOperation = {
          ...operation,
          parameters: [...(pathItem.parameters || []), ...(operation.parameters || [])]
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
            operationId: mergedOperation.operationId || '',
            mediaTypes: mergedOperation.requestBody?.content
              ? Object.keys(mergedOperation.requestBody.content)
              : []
          })
        };

        this.handleParameters(mergedOperation, api);
        this.handleRequestBody(mergedOperation, api);
        this.handleResponse(mergedOperation, api);

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

  private handleParameters(operation: any, api: NormalizedApiItem): void {
    const params = Array.isArray(operation.parameters) ? operation.parameters : [];
    for (const param of params) {
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

  private handleRequestBody(operation: any, api: NormalizedApiItem): void {
    if (!operation?.requestBody?.content) return;
    const mediaType = pickMediaType(operation.requestBody.content);
    if (!mediaType) return;
    const media = operation.requestBody.content[mediaType] || {};
    const schema = media.schema || {};
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
    api.req_body_type = 'raw';
    if (media.schema) {
      api.req_body_other = JSON.stringify(media.schema, null, 2);
    } else if (typeof media.example !== 'undefined') {
      api.req_body_other = typeof media.example === 'string' ? media.example : JSON.stringify(media.example, null, 2);
    }
  }

  private handleResponse(operation: any, api: NormalizedApiItem): void {
    const response = selectResponse(operation.responses);
    if (!response) return;
    const mediaType = pickMediaType(response.content);
    if (mediaType && response.content[mediaType]) {
      const media = response.content[mediaType];
      if (media.schema) {
        api.res_body = JSON.stringify(media.schema, null, 2);
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
}

import { URL } from 'node:url';
import { Method, RequestBodyType, ResponseBodyType } from './types';
import type { Category, Interface, Project } from './types';

const SwaggerParser = require('@apidevtools/swagger-parser');
const swagger2openapi = require('swagger2openapi');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

export interface YApiData {
  project: Project;
  cats: Category[];
  interfaces: Interface[];
}

function handlePath(input: string): string {
  if (input === '/') return input;
  let path = String(input || '');
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

function pickMediaType(content: Record<string, any> | undefined): string | null {
  if (!content || typeof content !== 'object') return null;
  for (const mediaType of ['application/json', 'application/hal+json', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain', '*/*']) {
    if (content[mediaType]) return mediaType;
  }
  return Object.keys(content)[0] || null;
}

function parseServerBasePath(spec: any): string {
  if (Array.isArray(spec?.servers) && spec.servers[0]?.url) {
    const serverUrl = String(spec.servers[0].url);
    try {
      const parsed = new URL(serverUrl, 'http://yapi.local');
      return parsed.pathname && parsed.pathname !== '/' ? handlePath(parsed.pathname) : '';
    } catch (_err) {
      return serverUrl.startsWith('/') ? handlePath(serverUrl) : '';
    }
  }
  return spec?.basePath ? handlePath(spec.basePath) : '';
}

function selectResponse(responses: Record<string, any> | undefined): Record<string, any> | null {
  if (!responses || typeof responses !== 'object') return null;
  for (const code of ['200', '201', '202', '203', '204', 'default']) {
    if (responses[code]) return responses[code];
  }
  const keys = Object.keys(responses);
  return keys.length > 0 ? responses[keys[0]] : null;
}

function selectCategory(tags: string[] | undefined, rootTags: string[]): string | null {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  for (const tag of tags) {
    if (!/^v[0-9.]+$/i.test(tag) && (rootTags.length === 0 || rootTags.includes(tag))) {
      return tag;
    }
  }
  return tags[0];
}

function clone<T>(input: T): T {
  return JSON.parse(JSON.stringify(input));
}

function schemaRefName(ref: string): string {
  return ref.split('/').filter(Boolean).pop()?.replace(/~1/g, '/').replace(/~0/g, '~') || 'Definition';
}

function rewriteSchemaRefs(input: any): any {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(rewriteSchemaRefs);
  const output: Record<string, any> = {};
  Object.entries(input).forEach(([key, value]) => {
    if (key === '$ref' && typeof value === 'string' && value.startsWith('#/components/schemas/')) {
      output.$ref = `#/definitions/${schemaRefName(value)}`;
      return;
    }
    output[key] = rewriteSchemaRefs(value);
  });
  return output;
}

function schemaDocument(schema: any, spec: any): Record<string, any> {
  const output = rewriteSchemaRefs(clone(schema || {}));
  const componentSchemas = spec?.components?.schemas;
  if (componentSchemas && typeof componentSchemas === 'object') {
    const definitions: Record<string, any> = {};
    Object.entries(componentSchemas).forEach(([name, value]) => {
      definitions[name] = rewriteSchemaRefs(clone(value));
    });
    output.definitions = {
      ...(output.definitions && typeof output.definitions === 'object' ? output.definitions : {}),
      ...definitions
    };
  }
  return output;
}

function normalizeParameter(param: any): Record<string, any> {
  return {
    name: param.name,
    desc: param.description || '',
    required: param.required ? '1' : '0',
    type: param.schema?.type || param.type || 'string'
  };
}

async function toOpenApi3(input: any): Promise<{ spec: any; detectedFormat: 'swagger2' | 'openapi3' }> {
  if (input?.openapi && /^3\./.test(String(input.openapi))) {
    return { spec: input, detectedFormat: 'openapi3' };
  }
  if (input?.swagger && /^2\./.test(String(input.swagger))) {
    const converted = await swagger2openapi.convertObj(input, {
      patch: true,
      warnOnly: true,
      resolve: true
    });
    return { spec: converted.openapi, detectedFormat: 'swagger2' };
  }
  throw new Error('Only Swagger 2.x and OpenAPI 3.x specs are supported.');
}

export async function swaggerJsonToYApiData(content: string | Record<string, any>): Promise<YApiData> {
  const raw = typeof content === 'string' ? JSON.parse(content) : content;
  const { spec: openapi3 } = await toOpenApi3(raw);
  const spec = await SwaggerParser.bundle(openapi3);
  const basePath = parseServerBasePath(spec);
  const now = Math.floor(Date.now() / 1000);
  const rootTags = Array.isArray(spec.tags) ? spec.tags.map((item: any) => item.name) : [];
  const cats: Category[] = Array.isArray(spec.tags)
    ? spec.tags.map((tag: any, index: number) => ({
        _id: index + 1,
        name: tag.name,
        desc: tag.description || tag.name,
        add_time: now,
        up_time: now
      }))
    : [];
  const interfaces: Interface[] = [];

  Object.entries(spec.paths || {}).forEach(([pathKey, pathItem]) => {
    if (!pathItem || typeof pathItem !== 'object') return;
    HTTP_METHODS.forEach(method => {
      const operation = (pathItem as any)[method];
      if (!operation || typeof operation !== 'object') return;
      const mergedOperation = {
        ...operation,
        parameters: [...((pathItem as any).parameters || []), ...(operation.parameters || [])]
      };
      const catname = selectCategory(mergedOperation.tags, rootTags) || 'default';
      if (!cats.find(item => item.name === catname)) {
        cats.push({
          _id: cats.length + 1,
          name: catname,
          desc: catname,
          add_time: now,
          up_time: now
        });
      }
      const cat = cats.find(item => item.name === catname);
      const api: Interface = {
        _id: interfaces.length + 1,
        title: mergedOperation.summary || mergedOperation.operationId || pathKey,
        desc: mergedOperation.description || mergedOperation.summary || '',
        method: method.toUpperCase() as Method,
        catid: cat?._id || 1,
        catname,
        tag: Array.isArray(mergedOperation.tags) ? mergedOperation.tags : [],
        path: handlePath(pathKey),
        req_params: [],
        req_body_form: [],
        req_headers: [],
        req_query: [],
        req_body_type: RequestBodyType.raw,
        req_body_other: '',
        req_body_is_json_schema: false,
        res_body_type: ResponseBodyType.raw,
        res_body: '',
        res_body_is_json_schema: false,
        add_time: now,
        up_time: now
      };

      (mergedOperation.parameters || []).forEach((param: any) => {
        const item = normalizeParameter(param);
        if (param.in === 'path') api.req_params?.push({ ...item, required: '1' });
        else if (param.in === 'query') api.req_query?.push(item);
        else if (param.in === 'header') api.req_headers?.push(item);
      });

      const requestMediaType = pickMediaType(mergedOperation.requestBody?.content);
      if (requestMediaType) {
        const media = mergedOperation.requestBody.content[requestMediaType] || {};
        if (requestMediaType === 'multipart/form-data' || requestMediaType === 'application/x-www-form-urlencoded') {
          api.req_body_type = RequestBodyType.form;
          const schema = media.schema || {};
          const required = Array.isArray(schema.required) ? schema.required : [];
          Object.entries(schema.properties || {}).forEach(([name, prop]: [string, any]) => {
            api.req_body_form?.push({
              name,
              type: prop?.format === 'binary' ? 'file' : 'text',
              desc: prop?.description || '',
              required: required.includes(name) ? '1' : '0'
            });
          });
        } else if (media.schema) {
          api.req_body_type = RequestBodyType.json;
          api.req_body_is_json_schema = true;
          api.req_body_other = JSON.stringify(schemaDocument(media.schema, spec), null, 2);
        }
      }

      const response = selectResponse(mergedOperation.responses);
      const responseMediaType = pickMediaType(response?.content);
      if (responseMediaType && response?.content?.[responseMediaType]?.schema) {
        api.res_body_type = ResponseBodyType.json;
        api.res_body_is_json_schema = true;
        api.res_body = JSON.stringify(schemaDocument(response.content[responseMediaType].schema, spec), null, 2);
      } else if (response?.schema) {
        api.res_body_type = ResponseBodyType.json;
        api.res_body_is_json_schema = true;
        api.res_body = JSON.stringify(schemaDocument(response.schema, spec), null, 2);
      } else {
        api.res_body = response?.description || '';
      }

      interfaces.push(api);
    });
  });

  if (cats.length === 0 && interfaces.length > 0) {
    cats.push({ _id: 1, name: 'default', desc: 'default', add_time: now, up_time: now });
    interfaces.forEach(item => {
      item.catid = 1;
      item.catname = 'default';
    });
  }

  return {
    project: {
      _id: 0,
      name: spec.info?.title || 'OpenAPI',
      desc: spec.info?.description || '',
      basepath: basePath,
      tag: [],
      env: [{ name: 'local', domain: '' }]
    },
    cats: cats.filter(cat => interfaces.some(api => api.catid === cat._id)),
    interfaces
  };
}

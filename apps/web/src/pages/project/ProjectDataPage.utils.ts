import json5 from 'json5';
import type {
  SyncMode,
  LegacyImportPayload,
  LegacyImportApi,
  LegacyImportParam,
} from './ProjectDataPage.types';

export function syncModeLabel(mode: SyncMode): string {
  if (mode === 'normal') return '普通模式';
  if (mode === 'good') return '智能合并';
  return '完全覆盖';
}

export function taskStatusLabel(status?: string): string {
  if (status === 'queued') return '排队中';
  if (status === 'running') return '执行中';
  if (status === 'success') return '已完成';
  if (status === 'failed') return '失败';
  return status || '-';
}

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function parseMaybeJsonText(input: unknown): unknown {
  const raw = String(input || '').trim();
  if (!raw) return undefined;
  try {
    return json5.parse(raw);
  } catch (_err) {
    return undefined;
  }
}

export function normalizeMethod(input: unknown): string {
  const method = String(input || 'GET').trim().toUpperCase();
  const supported = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  return supported.includes(method) ? method : 'GET';
}

export function normalizePath(input: unknown): string {
  const path = String(input || '').trim();
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function requiredFlag(input: unknown): boolean {
  return !(input === false || input === '0' || input === 0);
}

export function inferSchemaFromValue(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    return {
      type: 'array',
      items: value.length > 0 ? inferSchemaFromValue(value[0]) : { type: 'string' }
    };
  }
  if (typeof value === 'string') return { type: 'string' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    Object.keys(obj).forEach(key => {
      properties[key] = inferSchemaFromValue(obj[key]);
      required.push(key);
    });
    const output: Record<string, unknown> = {
      type: 'object',
      properties
    };
    if (required.length > 0) output.required = required;
    return output;
  }
  return { type: 'string' };
}

export function normalizeLegacyImportPayload(input: unknown): LegacyImportPayload | null {
  const source = asObject(input);
  const apis = Array.isArray(source.apis) ? (source.apis as LegacyImportApi[]) : [];
  if (apis.length === 0) return null;
  const cats = Array.isArray(source.cats) ? (source.cats as Array<{ name?: string; desc?: string }>) : [];
  return { cats, apis };
}

export function buildOpenApiFromLegacyImport(params: {
  projectId: number;
  defaultCatName: string;
  payload: LegacyImportPayload;
}): Record<string, unknown> {
  const tagDescMap = new Map<string, string>();
  params.payload.cats.forEach(item => {
    const name = String(item?.name || '').trim();
    if (!name) return;
    tagDescMap.set(name, String(item?.desc || ''));
  });

  const paths: Record<string, Record<string, unknown>> = {};
  params.payload.apis.forEach((api, index) => {
    const method = normalizeMethod(api.method).toLowerCase();
    const path = normalizePath(api.path);
    const tagName = String(api.catname || '').trim() || params.defaultCatName;
    if (tagName && !tagDescMap.has(tagName)) {
      tagDescMap.set(tagName, '');
    }

    const operation: Record<string, unknown> = {
      summary: String(api.title || api.path || `api-${index + 1}`),
      description: String(api.desc || ''),
      operationId: `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}_${index + 1}`,
      tags: tagName ? [tagName] : [],
      parameters: [],
      responses: {}
    };

    const parameters = operation.parameters as Array<Record<string, unknown>>;
    const addParam = (inType: 'path' | 'query' | 'header', rows: LegacyImportParam[] | undefined) => {
      if (!Array.isArray(rows)) return;
      rows.forEach(row => {
        const name = String(row?.name || '').trim();
        if (!name) return;
        const exampleValue = row.value ?? row.example;
        parameters.push({
          name,
          in: inType,
          required: inType === 'path' ? true : requiredFlag(row.required),
          description: String(row.desc || ''),
          schema: inferSchemaFromValue(exampleValue),
          example: exampleValue
        });
      });
    };
    addParam('path', Array.isArray(api.req_params) ? api.req_params : []);
    addParam('query', Array.isArray(api.req_query) ? api.req_query : []);
    addParam('header', Array.isArray(api.req_headers) ? api.req_headers : []);

    const reqBodyType = String(api.req_body_type || '').toLowerCase();
    if (reqBodyType === 'form') {
      const reqBodyForm = Array.isArray(api.req_body_form) ? api.req_body_form : [];
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      reqBodyForm.forEach(row => {
        const name = String(row?.name || '').trim();
        if (!name) return;
        const rowType = String(row?.type || 'text').toLowerCase();
        properties[name] =
          rowType === 'file'
            ? { type: 'string', format: 'binary' }
            : inferSchemaFromValue(row.value ?? row.example ?? '');
        if (requiredFlag(row.required)) required.push(name);
      });
      operation.requestBody = {
        content: {
          'application/x-www-form-urlencoded': {
            schema: {
              type: 'object',
              properties,
              ...(required.length > 0 ? { required } : {})
            }
          }
        }
      };
    } else if (reqBodyType === 'json') {
      const sourceText = String(api.req_body_other || '').trim();
      const parsed = parseMaybeJsonText(sourceText);
      if (api.req_body_is_json_schema && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        operation.requestBody = {
          content: {
            'application/json': {
              schema: parsed as Record<string, unknown>
            }
          }
        };
      } else if (typeof parsed !== 'undefined') {
        operation.requestBody = {
          content: {
            'application/json': {
              schema: inferSchemaFromValue(parsed),
              example: parsed
            }
          }
        };
      } else if (sourceText) {
        operation.requestBody = {
          content: {
            'text/plain': {
              schema: { type: 'string' },
              example: sourceText
            }
          }
        };
      }
    } else if (reqBodyType === 'raw' || reqBodyType === 'file') {
      const sourceText = String(api.req_body_other || '');
      if (sourceText) {
        operation.requestBody = {
          content: {
            [reqBodyType === 'file' ? 'application/octet-stream' : 'text/plain']: {
              schema: { type: 'string' },
              example: sourceText
            }
          }
        };
      }
    }

    const responses = operation.responses as Record<string, unknown>;
    const resBodyType = String(api.res_body_type || 'json').toLowerCase();
    const responseText = String(api.res_body || '').trim();
    if (!responseText) {
      responses['200'] = { description: 'OK' };
    } else if (resBodyType === 'json') {
      const parsed = parseMaybeJsonText(responseText);
      if (api.res_body_is_json_schema && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        responses['200'] = {
          description: 'OK',
          content: {
            'application/json': {
              schema: parsed as Record<string, unknown>
            }
          }
        };
      } else if (typeof parsed !== 'undefined') {
        responses['200'] = {
          description: 'OK',
          content: {
            'application/json': {
              schema: inferSchemaFromValue(parsed),
              example: parsed
            }
          }
        };
      } else {
        responses['200'] = {
          description: 'OK',
          content: {
            'text/plain': {
              schema: { type: 'string' },
              example: responseText
            }
          }
        };
      }
    } else {
      responses['200'] = {
        description: 'OK',
        content: {
          'text/plain': {
            schema: { type: 'string' },
            example: responseText
          }
        }
      };
    }

    if (!paths[path]) {
      paths[path] = {};
    }
    paths[path][method] = operation;
  });

  const tags = Array.from(tagDescMap.entries()).map(([name, description]) => ({
    name,
    ...(description ? { description } : {})
  }));

  return {
    openapi: '3.0.3',
    info: {
      title: `YApi Project ${params.projectId}`,
      version: '1.0.0'
    },
    paths,
    tags
  };
}

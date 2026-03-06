import json5 from 'json5';
import type { AppRouteContract } from '../types/route-contract';

export const DRAFT4_SCHEMA_URI = 'http://json-schema.org/draft-04/schema#';

export function normalizePath(value: string): string {
  if (!value) return '/';
  let pathname = value;
  try {
    const parsed = new URL(value, window.location.origin);
    pathname = parsed.pathname || '/';
  } catch (_err) {
    pathname = value;
  }
  pathname = decodeURIComponent(pathname).replace(/\{\{[^}]+\}\}/g, '').replace(/\/{2,}/g, '/');
  if (!pathname.startsWith('/')) {
    return `/${pathname}`;
  }
  return pathname;
}

export function parseJsonSafe<T = unknown>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch (_err) {
    return fallback;
  }
}

export function parseMaybeJson(text: string): unknown {
  const raw = String(text || '').trim();
  if (!raw) return '';
  try {
    return json5.parse(raw);
  } catch (_err) {
    return raw;
  }
}

export function isValidRouteContract(route: AppRouteContract | undefined): route is AppRouteContract {
  if (!route) return false;
  if (typeof route.path !== 'string' || !route.path.startsWith('/')) return false;
  if (typeof route.component !== 'function') return false;
  if (route.protected !== undefined && typeof route.protected !== 'boolean') return false;
  return true;
}

export function toObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

export function inferPrimitiveSchema(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  if (typeof value === 'string') return { type: 'string' };
  return { type: 'string' };
}

export function mergeInferredSchemas(schemas: Record<string, unknown>[]): Record<string, unknown> {
  if (schemas.length === 0) return { type: 'string' };
  if (schemas.length === 1) return schemas[0];
  const types = schemas.map(schema => String(schema.type || 'string'));
  const uniq = Array.from(new Set(types));
  if (uniq.length > 1) {
    if (uniq.length === 2 && uniq.includes('null')) {
      return schemas.find(schema => String(schema.type || '') !== 'null') || schemas[0];
    }
    return schemas[0];
  }
  if (uniq[0] === 'object') {
    const keys = new Set<string>();
    schemas.forEach(schema => {
      const properties = toObject(schema.properties);
      Object.keys(properties).forEach(key => keys.add(key));
    });
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    Array.from(keys).forEach(key => {
      const childSchemas = schemas
        .map(schema => toObject(toObject(schema.properties)[key]))
        .filter(item => Object.keys(item).length > 0);
      properties[key] = mergeInferredSchemas(childSchemas);
      const allRequired = schemas.every(schema => Object.prototype.hasOwnProperty.call(toObject(schema.properties), key));
      if (allRequired) required.push(key);
    });
    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {})
    };
  }
  if (uniq[0] === 'array') {
    const itemSchemas = schemas
      .map(schema => toObject(schema.items))
      .filter(item => Object.keys(item).length > 0);
    return {
      type: 'array',
      items: itemSchemas.length > 0 ? mergeInferredSchemas(itemSchemas) : { type: 'string' }
    };
  }
  return schemas[0];
}

export function inferSchemaFromSample(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const itemSchemas = value.map(item => inferSchemaFromSample(item));
    return {
      type: 'array',
      items: itemSchemas.length > 0 ? mergeInferredSchemas(itemSchemas) : { type: 'string' }
    };
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    Object.keys(source).forEach(key => {
      properties[key] = inferSchemaFromSample(source[key]);
      required.push(key);
    });
    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {})
    };
  }
  return inferPrimitiveSchema(value);
}

export function inferDraft4SchemaTextFromJsonText(input: string, requireObjectOrArray = true): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = json5.parse(raw);
  } catch (_err) {
    return null;
  }
  if (requireObjectOrArray && (!parsed || typeof parsed !== 'object')) {
    return null;
  }
  const schema = inferSchemaFromSample(parsed);
  const root =
    String(schema.type || '') === 'object' || String(schema.type || '') === 'array'
      ? schema
      : {
        type: 'object',
        properties: { data: schema },
        required: ['data']
      };
  return JSON.stringify(
    {
      $schema: DRAFT4_SCHEMA_URI,
      ...root
    },
    null,
    2
  );
}

export function toStringValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return '';
  }
}

export function postJson<T>(url: string, payload: Record<string, unknown>) {
  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }).then(res => res.json() as Promise<{ errcode: number; errmsg: string; data: T }>);
}

export function getJson<T>(url: string) {
  return fetch(url, {
    method: 'GET',
    credentials: 'include'
  }).then(res => res.json() as Promise<{ errcode: number; errmsg: string; data: T }>);
}

export function normalizeHeaderRow(value: unknown): Array<{ name: string; value: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      const source = item as Record<string, unknown>;
      return {
        name: toStringValue(source.name),
        value: toStringValue(source.value)
      };
    })
    .filter(item => item.name);
}

export function normalizeSimpleParam(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      const source = item as Record<string, unknown>;
      return {
        name: toStringValue(source.name || source.key),
        value: toStringValue(source.value || source.example),
        required: source.required === '0' ? '0' : '1',
        desc: toStringValue(source.desc || source.description || '')
      };
    })
    .filter(item => item.name);
}

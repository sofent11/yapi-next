import json5 from 'json5';
import type { InterfaceDTO } from '../../types/interface-dto';
import type { 
  InterfaceNodePageResponse, SchemaRow, ParamRow,
  EditFormParam, EditFormHeaderParam, EditFormBodyParam
} from './ProjectInterfacePage.types';

export const STABLE_EMPTY_ARRAY: any[] = [];

export const TREE_CATEGORY_LIMIT = 1000;

export const TREE_NODE_PAGE_LIMIT = 200;

export const INTERFACE_LIST_PAGE_LIMIT = 200;

export const CAT_PAGE_FETCH_CONCURRENCY = 3;

export const CAT_MENU_LOAD_CONCURRENCY = 4;

export async function fetchAllCatInterfaces(
  fetchPage: (page: number) => Promise<InterfaceNodePageResponse>,
  errorMessage: string
): Promise<InterfaceDTO[]> {
  const firstResponse = await fetchPage(1);
  if (firstResponse.errcode !== 0) {
    throw new Error(firstResponse.errmsg || errorMessage);
  }
  const firstNodeData = (firstResponse.data || {}) as { list?: InterfaceDTO[]; total?: number };
  const firstRows = Array.isArray(firstNodeData.list) ? firstNodeData.list : [];
  const totalPageCount = Number(firstNodeData.total || 1);
  const total = Number.isFinite(totalPageCount) && totalPageCount > 0 ? totalPageCount : 1;
  if (total <= 1) {
    return firstRows;
  }

  const pageRows = new Map<number, InterfaceDTO[]>();
  pageRows.set(1, firstRows);
  const pageQueue: number[] = [];
  for (let page = 2; page <= total; page += 1) {
    pageQueue.push(page);
  }
  const workers = Array.from({ length: Math.min(CAT_PAGE_FETCH_CONCURRENCY, pageQueue.length) }, async () => {
    while (pageQueue.length > 0) {
      const page = pageQueue.shift();
      if (!page) return;
      const response = await fetchPage(page);
      if (response.errcode !== 0) {
        throw new Error(response.errmsg || errorMessage);
      }
      const nodeData = (response.data || {}) as { list?: InterfaceDTO[]; total?: number };
      const rows = Array.isArray(nodeData.list) ? nodeData.list : [];
      pageRows.set(page, rows);
    }
  });
  await Promise.all(workers);

  const merged: InterfaceDTO[] = [];
  for (let page = 1; page <= total; page += 1) {
    merged.push(...(pageRows.get(page) || STABLE_EMPTY_ARRAY));
  }
  return merged;
}

export const RUN_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;

export const REQUEST_BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const HTTP_REQUEST_HEADER = [
  'Accept',
  'Accept-Charset',
  'Accept-Encoding',
  'Accept-Language',
  'Accept-Datetime',
  'Authorization',
  'Cache-Control',
  'Connection',
  'Cookie',
  'Content-Disposition',
  'Content-Length',
  'Content-MD5',
  'Content-Type',
  'Date',
  'Expect',
  'From',
  'Host',
  'If-Match',
  'If-Modified-Since',
  'If-None-Match',
  'If-Range',
  'If-Unmodified-Since',
  'Max-Forwards',
  'Origin',
  'Pragma',
  'Proxy-Authorization',
  'Range',
  'Referer',
  'TE',
  'User-Agent',
  'Upgrade',
  'Via',
  'Warning',
  'X-Requested-With',
  'DNT',
  'X-Forwarded-For',
  'X-Forwarded-Host',
  'X-Forwarded-Proto',
  'Front-End-Https',
  'X-Http-Method-Override',
  'X-ATT-DeviceId',
  'X-Wap-Profile',
  'Proxy-Connection',
  'X-UIDH',
  'X-Csrf-Token'
];

export const SCHEMA_META_NAME: Record<string, string> = {
  maximum: '最大值',
  minimum: '最小值',
  maxItems: '最大数量',
  minItems: '最小数量',
  maxLength: '最大长度',
  minLength: '最小长度',
  enum: '枚举',
  enumDesc: '枚举备注',
  uniqueItems: '元素是否都不同',
  itemType: 'item 类型',
  format: 'format',
  itemFormat: 'item format',
  mock: 'mock'
};

export function statusLabel(status?: string): string {
  return status === 'done' ? '已完成' : '未完成';
}

export function formatUnixTime(value: unknown): string {
  const sec = Number(value || 0);
  if (!Number.isFinite(sec) || sec <= 0) return '-';
  return new Date(sec * 1000).toLocaleString();
}

export function supportsRequestBody(method?: string): boolean {
  return REQUEST_BODY_METHODS.has(String(method || '').toUpperCase());
}

export function safeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map(item => String(item || '').trim()).filter(Boolean);
}

export function safeObjectArray<T extends Record<string, unknown>>(input: unknown): T[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(item => item && typeof item === 'object')
    .map(item => ({ ...(item as T) }));
}

export function sanitizeReqParams(input: unknown): Array<{ name: string; desc?: string; example?: string }> {
  return safeObjectArray<Record<string, unknown>>(input)
    .map(item => ({
      name: String(item.name || '').trim(),
      desc: String(item.desc || ''),
      example: String(item.example || '')
    }))
    .filter(item => item.name.length > 0);
}

export function sanitizeReqQuery(input: unknown): EditFormParam[] {
  return safeObjectArray<Record<string, unknown>>(input)
    .map(item => ({
      name: String(item.name || '').trim(),
      required: (item.required === '0' || item.required === 0 ? '0' : '1') as '0' | '1',
      desc: String(item.desc || ''),
      example: String(item.example || '')
    }))
    .filter(item => item.name.length > 0);
}

export function sanitizeReqHeaders(input: unknown): EditFormHeaderParam[] {
  return safeObjectArray<Record<string, unknown>>(input)
    .map(item => ({
      name: String(item.name || '').trim(),
      value: String(item.value || ''),
      required: (item.required === '0' || item.required === 0 ? '0' : '1') as '0' | '1',
      desc: String(item.desc || ''),
      example: String(item.example || '')
    }))
    .filter(item => item.name.length > 0);
}

export function sanitizeReqBodyForm(input: unknown): EditFormBodyParam[] {
  return safeObjectArray<Record<string, unknown>>(input)
    .map(item => ({
      name: String(item.name || '').trim(),
      type: (String(item.type || 'text').toLowerCase() === 'file' ? 'file' : 'text') as 'file' | 'text',
      required: (item.required === '0' || item.required === 0 ? '0' : '1') as '0' | '1',
      desc: String(item.desc || ''),
      example: String(item.example || '')
    }))
    .filter(item => item.name.length > 0);
}

export function normalizeCaseParamMap(input: unknown): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  safeObjectArray<Record<string, unknown>>(input).forEach(item => {
    const name = String(item.name || '').trim();
    if (!name) return;
    const rawValue = item.value ?? item.example ?? '';
    if (typeof rawValue === 'string') {
      const text = rawValue.trim();
      if (!text) {
        output[name] = '';
        return;
      }
      try {
        output[name] = json5.parse(text);
        return;
      } catch (_err) {
        output[name] = rawValue;
        return;
      }
    }
    output[name] = rawValue;
  });
  return output;
}

export function normalizeCaseHeaderMap(input: unknown): Record<string, string> {
  const output: Record<string, string> = {};
  safeObjectArray<Record<string, unknown>>(input).forEach(item => {
    const name = String(item.name || '').trim();
    if (!name) return;
    const value = item.value ?? item.example ?? '';
    output[name] = String(value ?? '');
  });
  return output;
}

export function extractPathParams(pathValue: string): string[] {
  const set = new Set<string>();
  String(pathValue || '')
    .split('/')
    .forEach(segment => {
      if (segment.startsWith(':') && segment.length > 1) {
        set.add(segment.slice(1));
      }
    });
  const curlyMatches = String(pathValue || '').match(/\{([^{}]+)\}/g) || [];
  curlyMatches.forEach(match => {
    const name = match.slice(1, -1).trim();
    if (name) set.add(name);
  });
  return Array.from(set);
}

export function buildReqParamsByPath(
  pathValue: string,
  origin: Array<{ name: string; desc?: string; example?: string }>
): Array<{ name: string; desc?: string; example?: string }> {
  const names = extractPathParams(pathValue);
  const originMap = new Map(origin.map(item => [item.name, item]));
  return names.map(name => {
    const found = originMap.get(name);
    return {
      name,
      desc: found?.desc || '',
      example: found?.example || ''
    };
  });
}

export function safeJsonPretty(input: unknown): string {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input ?? null, null, 2);
  } catch (_error) {
    return String(input ?? '');
  }
}

export function normalizePathInput(path: string): string {
  const value = String(path || '').trim();
  if (!value) return '';
  if (value === '/') return '';
  const leading = value.startsWith('/') ? value : `/${value}`;
  return leading.endsWith('/') ? leading.slice(0, -1) : leading;
}

export function parseLooseJson(text: string): unknown {
  const input = String(text || '').trim();
  if (!input) return {};
  return json5.parse(input);
}

export function normalizeJsonText(text: string): string {
  const input = String(text || '').trim();
  if (!input) return '';
  try {
    return JSON.stringify(json5.parse(input), null, 2);
  } catch (_err) {
    return input;
  }
}

export function checkIsJsonSchema(text: string): string | false {
  try {
    const parsed = json5.parse(String(text || '')) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const schema = { ...parsed };
    if (schema.properties && typeof schema.properties === 'object' && !schema.type) {
      schema.type = 'object';
    }
    if (schema.items && typeof schema.items === 'object' && !schema.type) {
      schema.type = 'array';
    }
    if (!schema.type) return false;
    const type = String(schema.type).toLowerCase();
    if (!['object', 'string', 'number', 'array', 'boolean', 'integer', 'null'].includes(type)) {
      return false;
    }
    schema.type = type;
    if (!schema.$schema) {
      schema.$schema = 'http://json-schema.org/draft-04/schema#';
    }
    return JSON.stringify(schema, null, 2);
  } catch (_err) {
    return false;
  }
}

export function joinDesc(title: unknown, desc: unknown): string {
  return [String(title || '').trim(), String(desc || '').trim()].filter(Boolean).join('\n');
}

export function ensureSchemaNodeType(node: Record<string, unknown>): Record<string, unknown> {
  const next = { ...node };
  if (!next.type && next.properties && typeof next.properties === 'object') {
    next.type = 'object';
  }
  if (!next.type && next.items && typeof next.items === 'object') {
    next.type = 'array';
  }
  return next;
}

export function stringifyMetaValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value ?? '');
}

export function buildSchemaOther(node: Record<string, unknown>, itemType?: string): string {
  const parts: string[] = [];
  if (itemType) {
    parts.push(`item 类型: ${itemType}`);
  }
  Object.entries(SCHEMA_META_NAME).forEach(([key, label]) => {
    const value = node[key];
    if (typeof value === 'undefined' || value === null || value === '') return;
    parts.push(`${label}: ${stringifyMetaValue(value)}`);
  });
  return parts.join('\n');
}

export function schemaNodeToRow(
  nodeInput: Record<string, unknown>,
  name: string,
  required: boolean,
  key: string
): SchemaRow {
  const node = ensureSchemaNodeType(nodeInput);
  const type = String(node.type || 'object').toLowerCase();
  const desc = joinDesc(node.title, node.description);
  const defaultValue = stringifyMetaValue(node.default);
  if (type === 'object') {
    const properties = (node.properties && typeof node.properties === 'object'
      ? (node.properties as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const requiredSet = new Set(
      Array.isArray(node.required) ? node.required.map(item => String(item)) : []
    );
    const children = Object.entries(properties).map(([childName, childNode], index) =>
      schemaNodeToRow(
        ensureSchemaNodeType(toRecord(childNode)),
        childName,
        requiredSet.has(childName),
        `${key}-${index}`
      )
    );
    return {
      key,
      name,
      type: 'object',
      required: required ? '必须' : '非必须',
      defaultValue,
      desc,
      other: buildSchemaOther(node),
      children
    };
  }
  if (type === 'array') {
    const itemNode = ensureSchemaNodeType(toRecord(node.items));
    const itemType = String(itemNode.type || 'any').toLowerCase();
    const row: SchemaRow = {
      key,
      name,
      type,
      required: required ? '必须' : '非必须',
      defaultValue,
      desc,
      other: buildSchemaOther(node, itemType)
    };
    if (itemType === 'object') {
      row.children = (itemNode.properties && typeof itemNode.properties === 'object'
        ? Object.entries(itemNode.properties as Record<string, unknown>).map(
          ([childName, childNode], index) =>
            schemaNodeToRow(
              ensureSchemaNodeType(toRecord(childNode)),
              `${name}[].${childName}`,
              Array.isArray(itemNode.required)
                ? (itemNode.required as unknown[]).map(item => String(item)).includes(childName)
                : false,
              `${key}-arr-${index}`
            )
        )
        : []) as SchemaRow[];
    }
    return row;
  }
  return {
    key,
    name,
    type,
    required: required ? '必须' : '非必须',
    defaultValue,
    desc,
    other: buildSchemaOther(node)
  };
}

export function buildSchemaRows(schemaText: string): SchemaRow[] {
  try {
    const parsed = ensureSchemaNodeType(toRecord(json5.parse(String(schemaText || ''))));
    const rootType = String(parsed.type || '').toLowerCase();
    if (rootType === 'object') {
      const properties = (parsed.properties && typeof parsed.properties === 'object'
        ? (parsed.properties as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      const requiredSet = new Set(
        Array.isArray(parsed.required) ? parsed.required.map(item => String(item)) : []
      );
      return Object.entries(properties).map(([name, node], index) =>
        schemaNodeToRow(ensureSchemaNodeType(toRecord(node)), name, requiredSet.has(name), `root-${index}`)
      );
    }
    return [schemaNodeToRow(parsed, 'root', true, 'root-0')];
  } catch (_err) {
    return [];
  }
}

export function mockFlagText(mockOpen?: boolean, strict?: boolean): string {
  if (mockOpen && strict) return '( 全局mock & 严格模式 )';
  if (strict) return '( 严格模式 )';
  if (mockOpen) return '( 全局mock )';
  return '';
}

export function normalizeParamRows(input: unknown): ParamRow[] {
  if (!Array.isArray(input)) return [];
  return input.map((item, index) => {
    const row = item as Record<string, unknown>;
    const requiredRaw = row.required;
    const required =
      requiredRaw === 1 || requiredRaw === '1' || requiredRaw === true ? '是' : '否';
    return {
      key: index,
      name: String(row.name || ''),
      required,
      example: String(row.example || ''),
      desc: String(row.desc || row.value || ''),
      type: String(row.type || ''),
      value: String(row.value || '')
    };
  });
}

export function reorderById<T extends { _id?: number }>(list: T[], dragId: number, targetId: number): T[] {
  const sourceIndex = list.findIndex(item => Number(item._id || 0) === dragId);
  const targetIndex = list.findIndex(item => Number(item._id || 0) === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return list;
  const next = [...list];
  const [sourceItem] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourceItem);
  return next;
}

export function buildIndexPayload<T extends { _id?: number }>(list: T[]): Array<{ id: number; index: number }> {
  return list
    .map((item, index) => ({
      id: Number(item._id || 0),
      index
    }))
    .filter(item => item.id > 0);
}

export function reorderByCaseId<T extends { _id?: string }>(list: T[], dragId: string, targetId: string): T[] {
  const sourceIndex = list.findIndex(item => String(item._id || '') === dragId);
  const targetIndex = list.findIndex(item => String(item._id || '') === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return list;
  const next = [...list];
  const [sourceItem] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourceItem);
  return next;
}

export function buildCaseIndexPayload<T extends { _id?: string }>(list: T[]): Array<{ id: string; index: number }> {
  return list
    .map((item, index) => ({
      id: String(item._id || ''),
      index
    }))
    .filter(item => item.id.length > 0);
}

export function parseInterfaceId(value: string | undefined): number {
  if (!value) return 0;
  if (!/^\d+$/.test(value)) return 0;
  return Number(value);
}

export function parseColId(value: string | undefined): number {
  if (!value) return 0;
  if (!/^\d+$/.test(value)) return 0;
  return Number(value);
}

export function toRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

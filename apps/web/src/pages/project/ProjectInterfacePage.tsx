import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Form, Modal, message } from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
import json5 from 'json5';
import type { InterfaceTreeNode, LegacyInterfaceDTO } from '@yapi-next/shared-types';
import {
  useAddInterfaceCatMutation,
  useAddColCaseListMutation,
  useAddColCaseMutation,
  useAddColMutation,
  useAddInterfaceMutation,
  useCloneColCaseListMutation,
  useDelInterfaceCatMutation,
  useDelInterfaceMutation,
  useGetProjectListQuery,
  useGetColCaseEnvListQuery,
  useGetColCaseListQuery,
  useGetColCaseQuery,
  useGetColListQuery,
  useGetCatMenuQuery,
  useGetInterfaceListQuery,
  useGetInterfaceTreeQuery,
  useGetInterfaceQuery,
  useGetProjectTokenQuery,
  useDelColCaseMutation,
  useDelColMutation,
  useLazyGetColCaseQuery,
  useLazyGetInterfaceQuery,
  useLazyGetInterfaceTreeNodeQuery,
  useUpColCaseIndexMutation,
  useUpColCaseMutation,
  useUpColCompatMutation,
  useUpColIndexMutation,
  useUpInterfaceCatIndexMutation,
  useUpInterfaceIndexMutation,
  useUpdateProjectTagMutation,
  useUpdateInterfaceCatMutation,
  useUpdateInterfaceMutation
} from '../../services/yapi-api';
import { webPlugins, type InterfaceTabItem } from '../../plugins';
import { legacyNameValidator } from '../../utils/legacy-validation';
import { getHttpMethodBadgeClassName } from '../../utils/http-method';
import { safeApiRequest } from '../../utils/safe-request';
import { AutoTestResultModals } from './components/AutoTestResultModals';
import { InterfaceApiContent } from './components/InterfaceApiContent';
import { CollectionModals } from './components/CollectionModals';
import { CollectionMenuPanel } from './components/CollectionMenuPanel';
import { InterfaceCollectionContent } from './components/InterfaceCollectionContent';
import { InterfaceCoreModals } from './components/InterfaceCoreModals';
import { InterfaceMenuPanel } from './components/InterfaceMenuPanel';
import { InterfaceWorkspaceLayout } from './components/InterfaceWorkspaceLayout';
import type { CaseDetailData, CollectionCaseRow, CollectionRow } from './components/collection-types';

const STABLE_EMPTY_ARRAY: unknown[] = [];
const TREE_CATEGORY_LIMIT = 1000;
const TREE_NODE_PAGE_LIMIT = 200;
const INTERFACE_LIST_PAGE_LIMIT = 200;
const CAT_PAGE_FETCH_CONCURRENCY = 3;
const CAT_MENU_LOAD_CONCURRENCY = 4;

type ProjectInterfacePageProps = {
  projectId: number;
  basepath?: string;
  token?: string;
  projectRole?: string;
  projectGroupId?: number;
  projectTag?: Array<{ name?: string; desc?: string }>;
  projectSwitchNotice?: boolean;
  projectIsJson5?: boolean;
  projectIsMockOpen?: boolean;
  projectStrict?: boolean;
  customField?: { name?: string; enable?: boolean };
};

type EditFormParam = {
  name: string;
  required?: '1' | '0';
  desc?: string;
  example?: string;
};

type EditFormHeaderParam = EditFormParam & {
  value?: string;
};

type EditFormBodyParam = EditFormParam & {
  type?: 'text' | 'file';
};

type EditForm = {
  catid: number;
  title: string;
  path: string;
  method: string;
  status: 'done' | 'undone';
  tag?: string[];
  custom_field_value?: string;
  req_query?: EditFormParam[];
  req_headers?: EditFormHeaderParam[];
  req_params?: Array<{ name: string; desc?: string; example?: string }>;
  req_body_type?: 'form' | 'json' | 'file' | 'raw';
  req_body_form?: EditFormBodyParam[];
  req_body_other?: string;
  req_body_is_json_schema?: boolean;
  res_body_type?: 'json' | 'raw';
  res_body?: string;
  res_body_is_json_schema?: boolean;
  desc?: string;
  switch_notice?: boolean;
  api_opened?: boolean;
};

type AddInterfaceForm = {
  title: string;
  path: string;
  method: string;
  catid: number;
};

type AddCatForm = {
  name: string;
  desc?: string;
};

type EditCatForm = {
  name: string;
  desc?: string;
};

type ColForm = {
  name: string;
  desc?: string;
};

type AddCaseForm = {
  interface_id: number;
  casename: string;
  case_env?: string;
};

type CaseEditForm = {
  casename: string;
  case_env?: string;
  enable_script?: boolean;
  test_script?: string;
  req_params_text?: string;
  req_headers_text?: string;
  req_query_text?: string;
  req_body_form_text?: string;
  req_body_type?: string;
  req_body_other?: string;
};

type AutoTestResultItem = {
  id: string;
  name: string;
  path: string;
  code: number;
  validRes?: Array<{ message?: string }>;
  status?: number | null;
  statusText?: string;
  url?: string;
  method?: string;
  data?: unknown;
  headers?: unknown;
  res_header?: unknown;
  res_body?: unknown;
  params?: Record<string, unknown>;
  interface_id?: number;
  interfaceId?: number;
};

type AutoTestReport = {
  message?: {
    msg?: string;
    len?: number;
    successNum?: number;
    failedNum?: number;
  };
  runTime?: string;
  numbs?: number;
  list?: AutoTestResultItem[];
};

type CaseEnvProjectItem = {
  _id: number;
  name: string;
  env?: Array<{ name?: string; domain?: string }>;
};

type CommonSettingForm = {
  checkHttpCodeIs200: boolean;
  checkResponseSchema: boolean;
  checkResponseFieldEnable: boolean;
  checkResponseFieldName: string;
  checkResponseFieldValue: string;
  checkScriptEnable: boolean;
  checkScriptContent: string;
};

type InterfaceNodePageResponse = {
  errcode: number;
  errmsg?: string;
  data?: { list?: LegacyInterfaceDTO[]; total?: number };
};

async function fetchAllCatInterfaces(
  fetchPage: (page: number) => Promise<InterfaceNodePageResponse>,
  errorMessage: string
): Promise<LegacyInterfaceDTO[]> {
  const firstResponse = await fetchPage(1);
  if (firstResponse.errcode !== 0) {
    throw new Error(firstResponse.errmsg || errorMessage);
  }
  const firstNodeData = (firstResponse.data || {}) as { list?: LegacyInterfaceDTO[]; total?: number };
  const firstRows = Array.isArray(firstNodeData.list) ? firstNodeData.list : [];
  const totalPageCount = Number(firstNodeData.total || 1);
  const total = Number.isFinite(totalPageCount) && totalPageCount > 0 ? totalPageCount : 1;
  if (total <= 1) {
    return firstRows;
  }

  const pageRows = new Map<number, LegacyInterfaceDTO[]>();
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
      const nodeData = (response.data || {}) as { list?: LegacyInterfaceDTO[]; total?: number };
      const rows = Array.isArray(nodeData.list) ? nodeData.list : [];
      pageRows.set(page, rows);
    }
  });
  await Promise.all(workers);

  const merged: LegacyInterfaceDTO[] = [];
  for (let page = 1; page <= total; page += 1) {
    merged.push(...(pageRows.get(page) || STABLE_EMPTY_ARRAY));
  }
  return merged;
}

const RUN_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;
const REQUEST_BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const HTTP_REQUEST_HEADER = [
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

const SCHEMA_META_NAME: Record<string, string> = {
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

type SchemaRow = {
  key: string;
  name: string;
  type: string;
  required: string;
  defaultValue: string;
  desc: string;
  other: string;
  children?: SchemaRow[];
};
function statusLabel(status?: string): string {
  return status === 'done' ? '已完成' : '未完成';
}

function formatUnixTime(value: unknown): string {
  const sec = Number(value || 0);
  if (!Number.isFinite(sec) || sec <= 0) return '-';
  return new Date(sec * 1000).toLocaleString();
}

function supportsRequestBody(method?: string): boolean {
  return REQUEST_BODY_METHODS.has(String(method || '').toUpperCase());
}

function safeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map(item => String(item || '').trim()).filter(Boolean);
}

function safeObjectArray<T extends Record<string, unknown>>(input: unknown): T[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(item => item && typeof item === 'object')
    .map(item => ({ ...(item as T) }));
}

function sanitizeReqParams(input: unknown): Array<{ name: string; desc?: string; example?: string }> {
  return safeObjectArray<Record<string, unknown>>(input)
    .map(item => ({
      name: String(item.name || '').trim(),
      desc: String(item.desc || ''),
      example: String(item.example || '')
    }))
    .filter(item => item.name.length > 0);
}

function sanitizeReqQuery(input: unknown): EditFormParam[] {
  return safeObjectArray<Record<string, unknown>>(input)
    .map(item => ({
      name: String(item.name || '').trim(),
      required: (item.required === '0' || item.required === 0 ? '0' : '1') as '0' | '1',
      desc: String(item.desc || ''),
      example: String(item.example || '')
    }))
    .filter(item => item.name.length > 0);
}

function sanitizeReqHeaders(input: unknown): EditFormHeaderParam[] {
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

function sanitizeReqBodyForm(input: unknown): EditFormBodyParam[] {
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

function normalizeCaseParamMap(input: unknown): Record<string, unknown> {
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

function normalizeCaseHeaderMap(input: unknown): Record<string, string> {
  const output: Record<string, string> = {};
  safeObjectArray<Record<string, unknown>>(input).forEach(item => {
    const name = String(item.name || '').trim();
    if (!name) return;
    const value = item.value ?? item.example ?? '';
    output[name] = String(value ?? '');
  });
  return output;
}

function extractPathParams(pathValue: string): string[] {
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

function buildReqParamsByPath(
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

function safeJsonPretty(input: unknown): string {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input ?? null, null, 2);
  } catch (_error) {
    return String(input ?? '');
  }
}

function normalizePathInput(path: string): string {
  const value = String(path || '').trim();
  if (!value) return '';
  if (value === '/') return '';
  const leading = value.startsWith('/') ? value : `/${value}`;
  return leading.endsWith('/') ? leading.slice(0, -1) : leading;
}

function parseLooseJson(text: string): unknown {
  const input = String(text || '').trim();
  if (!input) return {};
  return json5.parse(input);
}

function normalizeJsonText(text: string): string {
  const input = String(text || '').trim();
  if (!input) return '';
  try {
    return JSON.stringify(json5.parse(input), null, 2);
  } catch (_err) {
    return input;
  }
}

function checkIsJsonSchema(text: string): string | false {
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

function joinDesc(title: unknown, desc: unknown): string {
  return [String(title || '').trim(), String(desc || '').trim()].filter(Boolean).join('\n');
}

function ensureSchemaNodeType(node: Record<string, unknown>): Record<string, unknown> {
  const next = { ...node };
  if (!next.type && next.properties && typeof next.properties === 'object') {
    next.type = 'object';
  }
  if (!next.type && next.items && typeof next.items === 'object') {
    next.type = 'array';
  }
  return next;
}

function stringifyMetaValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value ?? '');
}

function buildSchemaOther(node: Record<string, unknown>, itemType?: string): string {
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

function schemaNodeToRow(
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

function buildSchemaRows(schemaText: string): SchemaRow[] {
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

function mockFlagText(mockOpen?: boolean, strict?: boolean): string {
  if (mockOpen && strict) return '( 全局mock & 严格模式 )';
  if (strict) return '( 严格模式 )';
  if (mockOpen) return '( 全局mock )';
  return '';
}

type ParamRow = {
  key: number;
  name: string;
  required: string;
  example: string;
  desc: string;
  type?: string;
  value?: string;
};

type MenuDragItem =
  | { type: 'cat'; id: number }
  | { type: 'interface'; id: number; catid: number };

type ColDragItem =
  | { type: 'col'; colId: number }
  | { type: 'case'; colId: number; caseId: string };

type ImportInterfaceRow = {
  key: string;
  id?: number;
  title: string;
  path?: string;
  method?: string;
  status?: string;
  isCategory: boolean;
  children?: ImportInterfaceRow[];
};

type EditConflictState =
  | { status: 'idle' | 'loading' | 'ready' | 'error' }
  | { status: 'locked'; uid: number; username: string };

function normalizeParamRows(input: unknown): ParamRow[] {
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

function reorderById<T extends { _id?: number }>(list: T[], dragId: number, targetId: number): T[] {
  const sourceIndex = list.findIndex(item => Number(item._id || 0) === dragId);
  const targetIndex = list.findIndex(item => Number(item._id || 0) === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return list;
  const next = [...list];
  const [sourceItem] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourceItem);
  return next;
}

function buildIndexPayload<T extends { _id?: number }>(list: T[]): Array<{ id: number; index: number }> {
  return list
    .map((item, index) => ({
      id: Number(item._id || 0),
      index
    }))
    .filter(item => item.id > 0);
}

function reorderByCaseId<T extends { _id?: string }>(list: T[], dragId: string, targetId: string): T[] {
  const sourceIndex = list.findIndex(item => String(item._id || '') === dragId);
  const targetIndex = list.findIndex(item => String(item._id || '') === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return list;
  const next = [...list];
  const [sourceItem] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourceItem);
  return next;
}

function buildCaseIndexPayload<T extends { _id?: string }>(list: T[]): Array<{ id: string; index: number }> {
  return list
    .map((item, index) => ({
      id: String(item._id || ''),
      index
    }))
    .filter(item => item.id.length > 0);
}

function parseInterfaceId(value: string | undefined): number {
  if (!value) return 0;
  if (!/^\d+$/.test(value)) return 0;
  return Number(value);
}

function parseColId(value: string | undefined): number {
  if (!value) return 0;
  if (!/^\d+$/.test(value)) return 0;
  return Number(value);
}

function toRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

export function ProjectInterfacePage(props: ProjectInterfacePageProps) {
  const params = useParams<{ action?: string; actionId?: string }>();
  const action = params.action || 'api';
  const actionId = params.actionId;
  const navigate = useNavigate();

  const [tab, setTab] = useState<string>('view');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [nextTab, setNextTab] = useState<string | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [runMethod, setRunMethod] = useState('GET');
  const [runPath, setRunPath] = useState('');
  const [runQuery, setRunQuery] = useState('{}');
  const [runHeaders, setRunHeaders] = useState('{}');
  const [runBody, setRunBody] = useState('{}');
  const [runResponse, setRunResponse] = useState('');
  const [runLoading, setRunLoading] = useState(false);
  const [caseRunMethod, setCaseRunMethod] = useState('GET');
  const [caseRunPath, setCaseRunPath] = useState('');
  const [caseRunQuery, setCaseRunQuery] = useState('{}');
  const [caseRunHeaders, setCaseRunHeaders] = useState('{}');
  const [caseRunBody, setCaseRunBody] = useState('{}');
  const [caseRunResponse, setCaseRunResponse] = useState('');
  const [caseRunLoading, setCaseRunLoading] = useState(false);
  const [listKeyword, setListKeyword] = useState('');
  const [listPage, setListPage] = useState(1);
  const [menuKeyword, setMenuKeyword] = useState('');
  const [expandedCatIds, setExpandedCatIds] = useState<number[]>([]);
  const [catInterfaceMap, setCatInterfaceMap] = useState<Record<number, LegacyInterfaceDTO[]>>({});
  const [catLoadingMap, setCatLoadingMap] = useState<Record<number, boolean>>({});
  const [, setCatLoadedMap] = useState<Record<number, boolean>>({});
  const catLoadingRef = useRef<Record<number, boolean>>({});
  const catLoadedRef = useRef<Record<number, boolean>>({});
  const [draggingMenuItem, setDraggingMenuItem] = useState<MenuDragItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'undone'>('all');
  const [colKeyword, setColKeyword] = useState('');
  const [expandedColIds, setExpandedColIds] = useState<number[]>([]);
  const [draggingColItem, setDraggingColItem] = useState<ColDragItem | null>(null);
  const [addInterfaceOpen, setAddInterfaceOpen] = useState(false);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [editCatOpen, setEditCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<{ _id: number; name: string; desc?: string } | null>(null);
  const [colModalOpen, setColModalOpen] = useState(false);
  const [colModalType, setColModalType] = useState<'add' | 'edit'>('add');
  const [editingCol, setEditingCol] = useState<{ _id: number; name: string; desc?: string } | null>(null);
  const [addCaseOpen, setAddCaseOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importColId, setImportColId] = useState(0);
  const [importProjectId, setImportProjectId] = useState(0);
  const [importSelectedRowKeys, setImportSelectedRowKeys] = useState<Array<string | number>>([]);
  const [importCatInterfaceMap, setImportCatInterfaceMap] = useState<Record<number, LegacyInterfaceDTO[]>>({});
  const [importCatLoadingMap, setImportCatLoadingMap] = useState<Record<number, boolean>>({});
  const [, setImportCatLoadedMap] = useState<Record<number, boolean>>({});
  const importCatLoadingRef = useRef<Record<number, boolean>>({});
  const importCatLoadedRef = useRef<Record<number, boolean>>({});
  const [autoTestRunning, setAutoTestRunning] = useState(false);
  const [autoTestModalOpen, setAutoTestModalOpen] = useState(false);
  const [autoTestReport, setAutoTestReport] = useState<AutoTestReport | null>(null);
  const [autoTestDetailItem, setAutoTestDetailItem] = useState<AutoTestResultItem | null>(null);
  const [selectedRunEnvByProject, setSelectedRunEnvByProject] = useState<Record<number, string>>({});
  const [commonSettingOpen, setCommonSettingOpen] = useState(false);
  const [reqRadioType, setReqRadioType] = useState<'req-body' | 'req-query' | 'req-headers'>('req-query');
  const [editBaseline, setEditBaseline] = useState('');
  const [tagSettingOpen, setTagSettingOpen] = useState(false);
  const [tagSettingInput, setTagSettingInput] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFieldName, setBulkFieldName] = useState<'req_query' | 'req_body_form' | null>(null);
  const [bulkValue, setBulkValue] = useState('');
  const [resEditorTab, setResEditorTab] = useState<'tpl' | 'preview'>('tpl');
  const [resPreviewText, setResPreviewText] = useState('');
  const [reqSchemaEditorMode, setReqSchemaEditorMode] = useState<'text' | 'visual'>('visual');
  const [resSchemaEditorMode, setResSchemaEditorMode] = useState<'text' | 'visual'>('visual');
  const [editConflictState, setEditConflictState] = useState<EditConflictState>({ status: 'idle' });
  const popstateForwardingRef = useRef(false);
  const [form] = Form.useForm<EditForm>();
  const [addInterfaceForm] = Form.useForm<AddInterfaceForm>();
  const [addCatForm] = Form.useForm<AddCatForm>();
  const [editCatForm] = Form.useForm<EditCatForm>();
  const [colForm] = Form.useForm<ColForm>();
  const [addCaseForm] = Form.useForm<AddCaseForm>();
  const [caseForm] = Form.useForm<CaseEditForm>();
  const [commonSettingForm] = Form.useForm<CommonSettingForm>();
  const watchedValues = Form.useWatch([], form);
  const watchedReqBodyOther = Form.useWatch('req_body_other', form);
  const watchedResBody = Form.useWatch('res_body', form);

  const interfaceId = action === 'api' ? parseInterfaceId(actionId) : 0;
  const catId = action === 'api' && actionId?.startsWith('cat_') ? Number(actionId.slice(4)) : 0;
  const colIdFromRoute = action === 'col' ? parseColId(actionId) : 0;
  const caseId = action === 'case' ? actionId || '' : '';
  const shouldFetchGlobalInterfaceList =
    action === 'api' && (menuKeyword.trim().length > 0 || (catId <= 0 && interfaceId <= 0));

  const treeQuery = useGetInterfaceTreeQuery(
    {
      projectId: props.projectId,
      token: props.token,
      page: 1,
      limit: TREE_CATEGORY_LIMIT,
      includeList: false,
      detail: 'summary'
    },
    { skip: props.projectId <= 0 || action !== 'api' }
  );
  const [fetchInterfaceTreeNode] = useLazyGetInterfaceTreeNodeQuery();
  const listQuery = useGetInterfaceListQuery(
    {
      projectId: props.projectId,
      token: props.token,
      page: 1,
      limit: INTERFACE_LIST_PAGE_LIMIT
    },
    { skip: props.projectId <= 0 || (!addCaseOpen && !shouldFetchGlobalInterfaceList) }
  );
  const detailQuery = useGetInterfaceQuery(
    {
      id: interfaceId,
      projectId: props.projectId,
      token: props.token
    },
    {
      skip: interfaceId <= 0 || action !== 'api'
    }
  );
  const catMenuQuery = useGetCatMenuQuery(
    { projectId: props.projectId, token: props.token },
    { skip: props.projectId <= 0 || action !== 'api' }
  );
  const [updateInterface, updateState] = useUpdateInterfaceMutation();
  const [addInterface, addInterfaceState] = useAddInterfaceMutation();
  const [fetchInterfaceDetail] = useLazyGetInterfaceQuery();
  const [upInterfaceIndex] = useUpInterfaceIndexMutation();
  const [upInterfaceCatIndex] = useUpInterfaceCatIndexMutation();
  const [updateProjectTag, updateProjectTagState] = useUpdateProjectTagMutation();
  const [addInterfaceCat, addInterfaceCatState] = useAddInterfaceCatMutation();
  const [updateInterfaceCat, updateInterfaceCatState] = useUpdateInterfaceCatMutation();
  const [delInterface, delInterfaceState] = useDelInterfaceMutation();
  const [delInterfaceCat, delInterfaceCatState] = useDelInterfaceCatMutation();
  const [addCol, addColState] = useAddColMutation();
  const [updateCol, updateColState] = useUpColCompatMutation();
  const [triggerDelCol] = useDelColMutation();
  const [triggerDelCase] = useDelColCaseMutation();
  const [addColCaseList, addColCaseListState] = useAddColCaseListMutation();
  const [cloneColCaseList] = useCloneColCaseListMutation();
  const [addColCase, addColCaseState] = useAddColCaseMutation();
  const [upColCase, upColCaseState] = useUpColCaseMutation();
  const [upColCaseIndex] = useUpColCaseIndexMutation();
  const [upColIndex] = useUpColIndexMutation();
  const [fetchColCaseDetail] = useLazyGetColCaseQuery();

  const colListQuery = useGetColListQuery(
    { project_id: props.projectId, token: props.token },
    { skip: props.projectId <= 0 || action === 'api' }
  );

  const caseDetailQuery = useGetColCaseQuery(
    { caseid: caseId, token: props.token },
    { skip: action !== 'case' || !caseId }
  );

  const selectedColId = useMemo(() => {
    if (action === 'col' && colIdFromRoute > 0) return colIdFromRoute;
    if (action === 'case') {
      const maybeColId = Number((caseDetailQuery.data?.data as Record<string, unknown> | undefined)?.col_id || 0);
      if (maybeColId > 0) return maybeColId;
    }
    return 0;
  }, [action, colIdFromRoute, caseDetailQuery.data]);

  const caseListQuery = useGetColCaseListQuery(
    { col_id: selectedColId, token: props.token },
    { skip: selectedColId <= 0 || action === 'api' }
  );
  const caseEnvListQuery = useGetColCaseEnvListQuery(
    { col_id: selectedColId, token: props.token },
    { skip: selectedColId <= 0 || action === 'api' }
  );
  const projectTokenQuery = useGetProjectTokenQuery(
    { projectId: props.projectId },
    { skip: props.projectId <= 0 || action === 'api' }
  );
  const projectListQuery = useGetProjectListQuery(
    { groupId: Number(props.projectGroupId || 0) },
    { skip: Number(props.projectGroupId || 0) <= 0 || !importModalOpen }
  );
  const importTreeQuery = useGetInterfaceTreeQuery(
    {
      projectId: importProjectId,
      token: props.token,
      page: 1,
      limit: TREE_CATEGORY_LIMIT,
      includeList: false,
      detail: 'summary'
    },
    { skip: importProjectId <= 0 || !importModalOpen }
  );
  const [fetchImportTreeNode] = useLazyGetInterfaceTreeNodeQuery();

  const allInterfaces = (listQuery.data?.data?.list || STABLE_EMPTY_ARRAY) as LegacyInterfaceDTO[];
  const treeRows = (treeQuery.data?.data?.list || STABLE_EMPTY_ARRAY) as InterfaceTreeNode[];
  const allInterfaceMapByCat = useMemo(() => {
    const map = new Map<number, LegacyInterfaceDTO[]>();
    allInterfaces.forEach(item => {
      const key = Number(item.catid || 0);
      if (key <= 0) return;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)?.push(item);
    });
    return map;
  }, [allInterfaces]);
  const menuRows = useMemo<InterfaceTreeNode[]>(
    () =>
      treeRows.map(cat => {
        const catIdNum = Number(cat._id || 0);
        return {
          ...cat,
          list: catInterfaceMap[catIdNum] || []
        };
      }),
    [catInterfaceMap, treeRows]
  );
  const catRows = (catMenuQuery.data?.data || STABLE_EMPTY_ARRAY) as Array<{ _id: number; name: string; desc?: string }>;
  const currentInterface = (detailQuery.data?.data || null) as LegacyInterfaceDTO | null;
  const colRows = (colListQuery.data?.data || STABLE_EMPTY_ARRAY) as CollectionRow[];
  const caseRows = (caseListQuery.data?.data || STABLE_EMPTY_ARRAY) as CollectionCaseRow[];
  const canEdit = /(admin|owner|dev)/.test(String(props.projectRole || ''));
  const callApi = useCallback(
    <T extends { errcode?: number; errmsg?: string }>(request: Promise<T>, fallback: string) =>
      safeApiRequest(request, { fallback, onError: msg => message.error(msg) }),
    []
  );

  const loadCatInterfaces = useCallback(
    async (catid: number, force = false) => {
      const catIdNum = Number(catid || 0);
      if (catIdNum <= 0) return;
      if (!force && (catLoadedRef.current[catIdNum] || catLoadingRef.current[catIdNum])) return;
      catLoadingRef.current[catIdNum] = true;
      setCatLoadingMap(prev => ({ ...prev, [catIdNum]: true }));
      try {
        const merged = await fetchAllCatInterfaces(
          page =>
            fetchInterfaceTreeNode(
              {
                catid: catIdNum,
                token: props.token,
                page,
                limit: TREE_NODE_PAGE_LIMIT,
                detail: 'full'
              },
              true
            ).unwrap(),
          '加载分类接口失败'
        );
        setCatInterfaceMap(prev => ({ ...prev, [catIdNum]: merged }));
        catLoadedRef.current[catIdNum] = true;
        setCatLoadedMap(prev => ({ ...prev, [catIdNum]: true }));
      } catch (err) {
        catLoadedRef.current[catIdNum] = false;
        setCatLoadedMap(prev => ({ ...prev, [catIdNum]: false }));
        message.error(err instanceof Error ? err.message : '加载分类接口失败');
      } finally {
        catLoadingRef.current[catIdNum] = false;
        setCatLoadingMap(prev => ({ ...prev, [catIdNum]: false }));
      }
    },
    [fetchInterfaceTreeNode, props.token]
  );

  const refreshInterfaceMenu = useCallback(async () => {
    catLoadingRef.current = {};
    catLoadedRef.current = {};
    setCatInterfaceMap({});
    setCatLoadingMap({});
    setCatLoadedMap({});
    await Promise.all([treeQuery.refetch(), catMenuQuery.refetch()]);
  }, [catMenuQuery, treeQuery]);

  const refetchInterfaceListSafe = useCallback(async () => {
    if (addCaseOpen || shouldFetchGlobalInterfaceList) {
      await listQuery.refetch();
    }
  }, [addCaseOpen, listQuery, shouldFetchGlobalInterfaceList]);

  const loadImportCatInterfaces = useCallback(
    async (catid: number, options?: { force?: boolean; notifyError?: boolean }) => {
      const catIdNum = Number(catid || 0);
      if (catIdNum <= 0) return;
      const force = options?.force === true;
      if (!force && (importCatLoadedRef.current[catIdNum] || importCatLoadingRef.current[catIdNum])) return;
      importCatLoadingRef.current[catIdNum] = true;
      setImportCatLoadingMap(prev => ({ ...prev, [catIdNum]: true }));
      try {
        const merged = await fetchAllCatInterfaces(
          page =>
            fetchImportTreeNode(
              {
                catid: catIdNum,
                token: props.token,
                page,
                limit: TREE_NODE_PAGE_LIMIT,
                detail: 'full'
              },
              true
            ).unwrap(),
          '加载导入接口失败'
        );
        setImportCatInterfaceMap(prev => ({ ...prev, [catIdNum]: merged }));
        importCatLoadedRef.current[catIdNum] = true;
        setImportCatLoadedMap(prev => ({ ...prev, [catIdNum]: true }));
      } catch (err) {
        importCatLoadedRef.current[catIdNum] = false;
        setImportCatLoadedMap(prev => ({ ...prev, [catIdNum]: false }));
        if (options?.notifyError !== false) {
          message.error(err instanceof Error ? err.message : '加载导入接口失败');
        }
      } finally {
        importCatLoadingRef.current[catIdNum] = false;
        setImportCatLoadingMap(prev => ({ ...prev, [catIdNum]: false }));
      }
    },
    [fetchImportTreeNode, props.token]
  );
  const interfaceTabs = useMemo<Record<string, InterfaceTabItem>>(() => {
    const tabs: Record<string, InterfaceTabItem> = {
      view: { name: '预览' },
      edit: { name: '编辑' },
      run: { name: '运行' }
    };
    webPlugins.applyInterfaceTabs(tabs, {
      projectId: props.projectId,
      interfaceData: toRecord(currentInterface)
    });
    return tabs;
  }, [currentInterface, props.projectId]);

  const projectTagOptions = useMemo(
    () =>
      (props.projectTag || [])
        .map(item => String(item.name || '').trim())
        .filter(Boolean)
        .map(item => ({ label: item, value: item })),
    [props.projectTag]
  );

  function buildEditFormValues(source: LegacyInterfaceDTO | null): EditForm {
    if (!source) {
      return {
        catid: Number(catRows[0]?._id || 0),
        title: '',
        path: '',
        method: 'GET',
        status: 'undone',
        tag: [],
        custom_field_value: '',
        req_query: [],
        req_headers: [],
        req_params: [],
        req_body_type: 'form',
        req_body_form: [],
        req_body_other: '',
        req_body_is_json_schema: !props.projectIsJson5,
        res_body_type: 'json',
        res_body: '',
        res_body_is_json_schema: !props.projectIsJson5,
        desc: '',
        switch_notice: props.projectSwitchNotice === true,
        api_opened: false
      };
    }

    const method = String(source.method || 'GET').toUpperCase();
    const path = String(source.path || '');
    const reqParams = sanitizeReqParams(source.req_params);
    const mergedReqParams = buildReqParamsByPath(path, reqParams);

    return {
      catid: Number(source.catid || catRows[0]?._id || 0),
      title: String(source.title || ''),
      path,
      method,
      status: String(source.status || 'undone') === 'done' ? 'done' : 'undone',
      tag: safeStringArray(source.tag),
      custom_field_value: String(source.custom_field_value || ''),
      req_query: sanitizeReqQuery(source.req_query),
      req_headers: sanitizeReqHeaders(source.req_headers),
      req_params: mergedReqParams,
      req_body_type: (['form', 'json', 'file', 'raw'].includes(String(source.req_body_type || ''))
        ? String(source.req_body_type || 'form')
        : 'form') as 'form' | 'json' | 'file' | 'raw',
      req_body_form: sanitizeReqBodyForm(source.req_body_form),
      req_body_other: String(source.req_body_other || ''),
      req_body_is_json_schema:
        source.req_body_is_json_schema === true || (props.projectIsJson5 ? false : true),
      res_body_type:
        String(source.res_body_type || 'json').toLowerCase() === 'raw' ? 'raw' : 'json',
      res_body: String(source.res_body || ''),
      res_body_is_json_schema:
        source.res_body_is_json_schema === true || (props.projectIsJson5 ? false : true),
      desc: String(source.desc || ''),
      switch_notice: props.projectSwitchNotice === true,
      api_opened: source.api_opened === true
    };
  }

  function serializeEditValues(values: EditForm | undefined): string {
    const v = values || ({} as EditForm);
    const data = {
      catid: Number(v.catid || 0),
      title: String(v.title || ''),
      path: String(v.path || ''),
      method: String(v.method || '').toUpperCase(),
      status: String(v.status || 'undone'),
      tag: safeStringArray(v.tag),
      custom_field_value: String(v.custom_field_value || ''),
      req_query: sanitizeReqQuery(v.req_query),
      req_headers: sanitizeReqHeaders(v.req_headers),
      req_params: sanitizeReqParams(v.req_params),
      req_body_type: String(v.req_body_type || 'form'),
      req_body_form: sanitizeReqBodyForm(v.req_body_form),
      req_body_other: String(v.req_body_other || ''),
      req_body_is_json_schema: v.req_body_is_json_schema === true,
      res_body_type: String(v.res_body_type || 'json'),
      res_body: String(v.res_body || ''),
      res_body_is_json_schema: v.res_body_is_json_schema === true,
      desc: String(v.desc || ''),
      switch_notice: v.switch_notice === true,
      api_opened: v.api_opened === true
    };
    return JSON.stringify(data);
  }

  const currentList = useMemo(() => {
    if (catId > 0) {
      return catInterfaceMap[catId] || STABLE_EMPTY_ARRAY;
    }
    return allInterfaces;
  }, [allInterfaces, catId, catInterfaceMap]);

  const filteredList = useMemo(() => {
    let rows = [...currentList];
    if (statusFilter !== 'all') {
      rows = rows.filter(item => String(item.status || 'undone') === statusFilter);
    }
    const keyword = listKeyword.trim().toLowerCase();
    if (keyword) {
      rows = rows.filter(item => {
        const title = String(item.title || '').toLowerCase();
        const path = String(item.path || '').toLowerCase();
        return title.includes(keyword) || path.includes(keyword);
      });
    }
    return rows;
  }, [currentList, listKeyword, statusFilter]);
  const currentListLoading =
    catId > 0
      ? catLoadingMap[catId] === true
      : Boolean(listQuery.isLoading || listQuery.isFetching);

  const currentCatName = useMemo(() => {
    if (!catId) return '全部接口';
    const found = catRows.find(item => Number(item._id) === catId);
    return found?.name || `分类 ${catId}`;
  }, [catId, catRows]);
  const currentCat = useMemo(
    () => catRows.find(item => Number(item._id || 0) === catId) || null,
    [catId, catRows]
  );
  const catSelectOptions = useMemo(
    () =>
      catRows.map(item => ({
        label: item.name,
        value: Number(item._id || 0)
      })),
    [catRows]
  );

  const filteredMenuRows = useMemo(() => {
    const keyword = menuKeyword.trim().toLowerCase();
    if (!keyword) return menuRows;
    return menuRows
      .map(cat => {
        const catIdNum = Number(cat._id || 0);
        const catName = String(cat.name || '').toLowerCase();
        const sourceList = allInterfaceMapByCat.get(catIdNum) || cat.list || [];
        const list = sourceList.filter(item => {
          const title = String(item.title || '').toLowerCase();
          const path = String(item.path || '').toLowerCase();
          return title.includes(keyword) || path.includes(keyword);
        });
        if (catName.includes(keyword)) {
          return { ...cat, list: sourceList };
        }
        if (list.length > 0) {
          return { ...cat, list };
        }
        return null;
      })
      .filter(Boolean) as InterfaceTreeNode[];
  }, [allInterfaceMapByCat, menuKeyword, menuRows]);
  const menuDragEnabled = canEdit && menuKeyword.trim().length === 0;
  const menuDisplayRows = useMemo(
    () => (menuKeyword.trim().length > 0 ? filteredMenuRows : menuRows),
    [filteredMenuRows, menuKeyword, menuRows]
  );
  const colDragEnabled = canEdit && colKeyword.trim().length === 0;
  const colDisplayRows = useMemo(() => {
    const keyword = colKeyword.trim().toLowerCase();
    return colRows.map(col => {
      const colId = Number(col._id || 0);
      const sourceCaseList =
        Array.isArray(col.caseList) && col.caseList.length > 0
          ? col.caseList
          : selectedColId === colId
            ? caseRows
            : [];
      if (!keyword) {
        return { ...col, caseList: sourceCaseList };
      }
      const filteredCaseList = sourceCaseList.filter((item: CollectionCaseRow) => {
        const name = String(item.casename || '').toLowerCase();
        const path = String(item.path || '').toLowerCase();
        return name.includes(keyword) || path.includes(keyword);
      });
      return { ...col, caseList: filteredCaseList };
    });
  }, [caseRows, colKeyword, colRows, selectedColId]);

  const importProjectRows = (projectListQuery.data?.data?.list || STABLE_EMPTY_ARRAY).filter(
    item => Number(item._id || 0) !== props.projectId
  );
  const importTreeRows = (importTreeQuery.data?.data?.list || STABLE_EMPTY_ARRAY) as InterfaceTreeNode[];
  const importMenuRows = useMemo<InterfaceTreeNode[]>(
    () =>
      importTreeRows.map(cat => {
        const catIdNum = Number(cat._id || 0);
        return {
          ...cat,
          list: importCatInterfaceMap[catIdNum] || []
        };
      }),
    [importCatInterfaceMap, importTreeRows]
  );
  const importTableRows = useMemo<ImportInterfaceRow[]>(() => {
    return importMenuRows.map(cat => ({
      key: `category_${cat._id}`,
      id: Number(cat._id || 0),
      title: String(cat.name || ''),
      isCategory: true,
      children: (cat.list || []).map(item => ({
        key: `interface_${item._id}`,
        id: Number(item._id || 0),
        title: String(item.title || ''),
        path: String(item.path || ''),
        method: String(item.method || '').toUpperCase(),
        status: String(item.status || 'undone'),
        isCategory: false
      }))
    }));
  }, [importMenuRows]);
  const importLoading = useMemo(
    () => Object.values(importCatLoadingMap).some(Boolean),
    [importCatLoadingMap]
  );
  const selectedImportInterfaceIds = useMemo(
    () =>
      importSelectedRowKeys
        .map(item => String(item))
        .filter(item => item.startsWith('interface_'))
        .map(item => Number(item.slice('interface_'.length)))
        .filter(item => Number.isFinite(item) && item > 0),
    [importSelectedRowKeys]
  );
  const importProjectOptions = useMemo(() => {
    const options = importProjectRows.map(item => ({
      label: item.name,
      value: Number(item._id || 0)
    }));
    if (!options.find(item => item.value === props.projectId)) {
      options.unshift({
        label: `当前项目(${props.projectId})`,
        value: props.projectId
      });
    }
    return options;
  }, [importProjectRows, props.projectId]);
  const caseInterfaceOptions = useMemo(
    () =>
      allInterfaces.map(item => ({
        value: Number(item._id || 0),
        label: `[${String(item.method || 'GET').toUpperCase()}] ${item.title || item.path || item._id}`,
        title: item.title || '',
        path: item.path || ''
      })),
    [allInterfaces]
  );
  const caseInterfaceTruncated = useMemo(() => {
    const total = Number(listQuery.data?.data?.total || 0);
    return total > 0 && caseInterfaceOptions.length > 0 && total > caseInterfaceOptions.length;
  }, [caseInterfaceOptions.length, listQuery.data]);
  const projectTokenValue = String(projectTokenQuery.data?.data || '');
  const autoTestRows = (autoTestReport?.list || STABLE_EMPTY_ARRAY) as AutoTestResultItem[];
  const autoTestResultMap = useMemo(() => {
    const map = new Map<string, AutoTestResultItem>();
    autoTestRows.forEach(item => {
      const id = String(item.id || '');
      if (id) map.set(id, item);
    });
    return map;
  }, [autoTestRows]);
  const caseEnvProjects = (caseEnvListQuery.data?.data || STABLE_EMPTY_ARRAY) as CaseEnvProjectItem[];
  const caseEnvOptions = useMemo(() => {
    const detail = (caseDetailQuery.data?.data || null) as Record<string, unknown> | null;
    const projectId = Number(detail?.project_id || 0);
    if (projectId <= 0 || !Array.isArray(caseEnvProjects)) return [];
    const project = caseEnvProjects.find(item => Number(item?._id || 0) === projectId);
    if (!project || !Array.isArray(project.env)) return [];
    return project.env
      .map(item => String(item?.name || '').trim())
      .filter(Boolean)
      .map(name => ({ label: name, value: name }));
  }, [caseDetailQuery.data, caseEnvProjects]);

  useEffect(() => {
    if (menuRows.length === 0) {
      setExpandedCatIds([]);
      return;
    }
    setExpandedCatIds(prev => {
      const validCatIds = new Set(
        menuRows.map(cat => Number(cat._id || 0)).filter(id => Number.isFinite(id) && id > 0)
      );
      const kept = prev.filter(id => validCatIds.has(id));
      if (catId > 0 && validCatIds.has(catId) && !kept.includes(catId)) {
        kept.push(catId);
      }
      return kept;
    });
  }, [catId, menuRows]);

  useEffect(() => {
    if (action !== 'api') return;
    const targets = new Set<number>();
    if (catId > 0) {
      targets.add(catId);
    }
    expandedCatIds.forEach(id => {
      if (id > 0) targets.add(id);
    });
    const queue = Array.from(targets);
    if (queue.length === 0) return;
    let cancelled = false;
    const workers = Array.from({ length: Math.min(CAT_MENU_LOAD_CONCURRENCY, queue.length) }, async () => {
      while (!cancelled) {
        const nextId = queue.shift();
        if (!nextId) return;
        await loadCatInterfaces(nextId);
      }
    });
    void Promise.all(workers);
    return () => {
      cancelled = true;
    };
  }, [action, catId, expandedCatIds, loadCatInterfaces, treeRows]);

  useEffect(() => {
    catLoadingRef.current = {};
    catLoadedRef.current = {};
    setCatInterfaceMap({});
    setCatLoadingMap({});
    setCatLoadedMap({});
  }, [props.projectId]);

  useEffect(() => {
    if (colRows.length === 0) {
      setExpandedColIds([]);
      return;
    }
    setExpandedColIds(prev => {
      const next = new Set(prev);
      colRows.forEach(col => {
        const id = Number(col._id || 0);
        if (id > 0 && !next.has(id)) next.add(id);
      });
      if (selectedColId > 0) next.add(selectedColId);
      return Array.from(next);
    });
  }, [colRows, selectedColId]);

  useEffect(() => {
    if (!colKeyword.trim()) return;
    setExpandedColIds(colRows.map(item => Number(item._id || 0)).filter(id => id > 0));
  }, [colKeyword, colRows]);

  useEffect(() => {
    if (!importModalOpen) return;
    if (importProjectId > 0) return;
    setImportProjectId(props.projectId);
  }, [importModalOpen, importProjectId, props.projectId]);

  useEffect(() => {
    if (!importModalOpen) {
      importCatLoadingRef.current = {};
      importCatLoadedRef.current = {};
      setImportCatInterfaceMap({});
      setImportCatLoadingMap({});
      setImportCatLoadedMap({});
      return;
    }
    importCatLoadingRef.current = {};
    importCatLoadedRef.current = {};
    setImportCatInterfaceMap({});
    setImportCatLoadingMap({});
    setImportCatLoadedMap({});
  }, [importModalOpen, importProjectId]);

  useEffect(() => {
    if (!importModalOpen || importProjectId <= 0 || importTreeRows.length === 0) return;
    let cancelled = false;
    const run = async () => {
      const catIds = importTreeRows
        .map(cat => Number(cat._id || 0))
        .filter(catIdNum => catIdNum > 0);
      const queue = [...catIds];
      const concurrency = Math.min(4, queue.length);
      const workers = Array.from({ length: concurrency }, async () => {
        while (!cancelled) {
          const nextCatId = queue.shift();
          if (!nextCatId) return;
          await loadImportCatInterfaces(nextCatId, { notifyError: false });
        }
      });
      await Promise.all(workers);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [importModalOpen, importProjectId, importTreeRows, loadImportCatInterfaces]);

  useEffect(() => {
    if (!addCaseOpen) return;
    const firstInterfaceId = Number(caseInterfaceOptions[0]?.value || 0);
    addCaseForm.setFieldsValue({
      interface_id: firstInterfaceId > 0 ? firstInterfaceId : undefined,
      casename: '',
      case_env: ''
    });
  }, [addCaseForm, addCaseOpen, caseInterfaceOptions]);

  useEffect(() => {
    if (!Array.isArray(caseEnvProjects) || caseEnvProjects.length === 0) return;
    setSelectedRunEnvByProject(prev => {
      const next = { ...prev };
      caseEnvProjects.forEach(item => {
        const projectId = Number(item._id || 0);
        if (projectId <= 0) return;
        if (typeof next[projectId] === 'string') return;
        const firstEnvName = String(item.env?.[0]?.name || '');
        next[projectId] = firstEnvName;
      });
      return next;
    });
  }, [caseEnvProjects]);

  const dirty = useMemo(() => {
    if (!currentInterface || tab !== 'edit') return false;
    return serializeEditValues((watchedValues || {}) as EditForm) !== editBaseline;
  }, [currentInterface, editBaseline, tab, watchedValues]);

  useEffect(() => {
    if (action !== 'api' && action !== 'col' && action !== 'case') {
      navigate(`/project/${props.projectId}/interface/api`, { replace: true });
    }
  }, [action, navigate, props.projectId]);

  useEffect(() => {
    setListPage(1);
  }, [action, catId, listKeyword, statusFilter]);

  useEffect(() => {
    if (tab !== 'edit' || !dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [tab, dirty]);

  useEffect(() => {
    if (tab !== 'edit' || !dirty || confirmOpen) return;

    const onClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      let nextPath = '';
      try {
        const nextUrl = new URL(href, window.location.href);
        if (nextUrl.origin !== window.location.origin) return;
        nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      } catch (_err) {
        return;
      }
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextPath === currentPath) return;
      event.preventDefault();
      event.stopPropagation();
      setNextTab(null);
      setPendingPath(nextPath);
      setConfirmOpen(true);
    };

    const onPopState = () => {
      if (popstateForwardingRef.current) {
        popstateForwardingRef.current = false;
        return;
      }
      const targetPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      popstateForwardingRef.current = true;
      window.history.forward();
      window.setTimeout(() => {
        popstateForwardingRef.current = false;
      }, 300);
      setNextTab(null);
      setPendingPath(targetPath);
      setConfirmOpen(true);
    };

    document.addEventListener('click', onClickCapture, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('popstate', onPopState);
    };
  }, [confirmOpen, dirty, tab]);

  useEffect(() => {
    const shouldWatchConflict = action === 'api' && interfaceId > 0 && tab === 'edit';
    if (!shouldWatchConflict) {
      setEditConflictState({ status: 'idle' });
      return;
    }

    setEditConflictState({ status: 'loading' });
    let destroyed = false;
    let pollTimer: number | null = null;

    const applyPayload = (payload: Record<string, unknown>) => {
      const errno = Number(payload.errno || 0);
      if (errno === 0) {
        setEditConflictState({ status: 'ready' });
        return;
      }
      const data = (payload.data || {}) as Record<string, unknown>;
      setEditConflictState({
        status: 'locked',
        uid: Number(data.uid || errno || 0),
        username: String(data.username || '未知用户')
      });
    };

    const runCheck = async () => {
      try {
        const response = await fetch(`/api/interface/solve_conflict?id=${interfaceId}`, {
          credentials: 'include'
        });
        const payload = (await response.json()) as Record<string, unknown>;
        if (destroyed) return;
        if (payload && typeof payload === 'object' && typeof payload.errno !== 'undefined') {
          applyPayload(payload);
        } else if (Number(payload.errcode || 0) === 0) {
          applyPayload({ errno: 0, data: payload.data });
        } else {
          setEditConflictState({ status: 'error' });
        }
      } catch (_err) {
        if (!destroyed) {
          setEditConflictState({ status: 'error' });
        }
      } finally {
        if (!destroyed) {
          pollTimer = window.setTimeout(() => {
            void runCheck();
          }, 4000);
        }
      }
    };

    void runCheck();

    return () => {
      destroyed = true;
      if (pollTimer != null) {
        window.clearTimeout(pollTimer);
      }
    };
  }, [action, interfaceId, tab]);

  useEffect(() => {
    const method = String(((watchedValues || {}) as EditForm).method || 'GET').toUpperCase();
    if (!supportsRequestBody(method) && reqRadioType === 'req-body') {
      setReqRadioType('req-query');
    }
  }, [reqRadioType, watchedValues]);

  useEffect(() => {
    if (tab !== 'edit') return;
    const values = (watchedValues || {}) as EditForm;
    const pathValue = String(values.path || '');
    const reqParams = sanitizeReqParams(values.req_params);
    const nextReqParams = buildReqParamsByPath(pathValue, reqParams);
    if (JSON.stringify(reqParams) !== JSON.stringify(nextReqParams)) {
      form.setFieldValue('req_params', nextReqParams);
    }
  }, [form, tab, watchedValues]);

  useEffect(() => {
    if (!currentInterface) return;
    const values = buildEditFormValues(currentInterface);
    form.setFieldsValue(values);
    setEditBaseline(serializeEditValues(values));
    setReqRadioType(supportsRequestBody(values.method) ? 'req-body' : 'req-query');
    setResEditorTab('tpl');
    setResPreviewText('');
    setReqSchemaEditorMode('visual');
    setResSchemaEditorMode('visual');
  }, [catRows, currentInterface, form, props.projectIsJson5, props.projectSwitchNotice]);

  useEffect(() => {
    if (!currentInterface) return;
    setRunMethod(String(currentInterface.method || 'GET').toUpperCase());
    setRunPath(`${props.basepath || ''}${currentInterface.path || ''}`);
    setRunQuery(
      JSON.stringify(
        Array.isArray(currentInterface.req_query) ? currentInterface.req_query : [],
        null,
        2
      )
    );
    setRunHeaders(
      JSON.stringify(
        Array.isArray(currentInterface.req_headers) ? currentInterface.req_headers : [],
        null,
        2
      )
    );
    const bodySource =
      currentInterface.req_body_type === 'form'
        ? currentInterface.req_body_form || []
        : currentInterface.req_body_other || {};
    setRunBody(JSON.stringify(bodySource, null, 2));
    setRunResponse('');
  }, [currentInterface, props.basepath]);

  useEffect(() => {
    if (action !== 'case') return;
    const detail = (caseDetailQuery.data?.data || null) as Record<string, unknown> | null;
    if (!detail) return;
    const method = String(detail.method || 'GET').toUpperCase();
    const path = `${props.basepath || ''}${String(detail.path || '')}`;
    const reqQuery = normalizeCaseParamMap(detail.req_query);
    const reqHeaders = normalizeCaseHeaderMap(detail.req_headers);
    const reqBodyType = String(detail.req_body_type || 'form').toLowerCase();
    let reqBody: unknown;
    if (reqBodyType === 'form') {
      reqBody = normalizeCaseParamMap(detail.req_body_form);
    } else if (reqBodyType === 'json') {
      const raw = String(detail.req_body_other || '').trim();
      if (!raw) {
        reqBody = {};
      } else {
        try {
          reqBody = json5.parse(raw);
        } catch (_err) {
          reqBody = raw;
        }
      }
    } else {
      reqBody = String(detail.req_body_other || '');
    }
    caseForm.setFieldsValue({
      casename: String(detail.casename || ''),
      case_env: String(detail.case_env || ''),
      enable_script: detail.enable_script === true,
      test_script: String(detail.test_script || ''),
      req_params_text: JSON.stringify(Array.isArray(detail.req_params) ? detail.req_params : [], null, 2),
      req_headers_text: JSON.stringify(Array.isArray(detail.req_headers) ? detail.req_headers : [], null, 2),
      req_query_text: JSON.stringify(Array.isArray(detail.req_query) ? detail.req_query : [], null, 2),
      req_body_form_text: JSON.stringify(Array.isArray(detail.req_body_form) ? detail.req_body_form : [], null, 2),
      req_body_type: String(detail.req_body_type || 'form'),
      req_body_other: String(detail.req_body_other || '')
    });
    setCaseRunMethod(method);
    setCaseRunPath(path);
    setCaseRunQuery(JSON.stringify(reqQuery, null, 2));
    setCaseRunHeaders(JSON.stringify(reqHeaders, null, 2));
    setCaseRunBody(typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody ?? {}, null, 2));
    setCaseRunResponse('');
  }, [action, caseDetailQuery.data, caseForm]);

  useEffect(() => {
    if (action !== 'case') {
      setAutoTestDetailItem(null);
      return;
    }
    setAutoTestDetailItem(prev => {
      if (!prev) return null;
      return String(prev.id || '') === String(caseId || '') ? prev : null;
    });
  }, [action, caseId]);

  useEffect(() => {
    if (action !== 'col') return;
    if (colIdFromRoute > 0) return;
    if (!Array.isArray(colRows) || colRows.length === 0) return;
    const first = Number(colRows[0]?._id || 0);
    if (first > 0) {
      navigate(`/project/${props.projectId}/interface/col/${first}`, { replace: true });
    }
  }, [action, colIdFromRoute, colRows, navigate, props.projectId]);

  useEffect(() => {
    const baseTitle = 'YApi';
    if (action === 'api' && interfaceId > 0 && currentInterface) {
      const title = String(currentInterface.title || currentInterface.path || interfaceId);
      document.title = `${title} - ${baseTitle}`;
      return;
    }
    if (action === 'col') {
      const currentCol = colRows.find(item => Number(item._id || 0) === selectedColId);
      const name = String(currentCol?.name || `测试集合 ${selectedColId || ''}` || '').trim();
      document.title = `${name || '测试集合'} - ${baseTitle}`;
      return;
    }
    if (action === 'case') {
      const caseName = String(
        (caseDetailQuery.data?.data as Record<string, unknown> | undefined)?.casename || '测试用例'
      );
      document.title = `${caseName} - ${baseTitle}`;
      return;
    }
    document.title = baseTitle;
  }, [action, caseDetailQuery.data, colRows, currentInterface, interfaceId, selectedColId]);

  function handleSwitch(next: string) {
    if (tab === 'edit' && dirty) {
      setNextTab(next);
      setPendingPath(null);
      setConfirmOpen(true);
      return;
    }
    setTab(next);
  }

  function navigateWithGuard(path: string, replace?: boolean) {
    if (tab === 'edit' && dirty) {
      setNextTab(null);
      setPendingPath(path);
      setConfirmOpen(true);
      return;
    }
    navigate(path, replace ? { replace: true } : undefined);
  }

  async function handleSave() {
    if (!currentInterface?._id) {
      message.error('请先选择接口');
      return;
    }
    const values = await form.validateFields();

    const method = String(values.method || 'GET').toUpperCase();
    const path = String(values.path || '').trim();
    const reqBodyType = values.req_body_type || 'form';
    const reqParams = sanitizeReqParams(values.req_params);
    const reqQuery = sanitizeReqQuery(values.req_query);
    const reqHeaders = sanitizeReqHeaders(values.req_headers);
    const reqBodyForm = sanitizeReqBodyForm(values.req_body_form);
    const tags = safeStringArray(values.tag);
    const reqBodyOther = String(values.req_body_other || '');
    const resBody = String(values.res_body || '');

    if (!path.startsWith('/')) {
      message.error('接口路径第一位必须为 /');
      return;
    }

    if (reqBodyType === 'json' && reqBodyOther.trim()) {
      if (values.req_body_is_json_schema) {
        const schemaText = checkIsJsonSchema(reqBodyOther);
        if (!schemaText) {
          message.error('请求参数 json-schema 格式有误');
          return;
        }
      } else {
        try {
          parseLooseJson(reqBodyOther);
        } catch (_err) {
          message.error('请求Body json格式有问题，请检查');
          return;
        }
      }
    }

    if ((values.res_body_type || 'json') === 'json' && resBody.trim()) {
      if (values.res_body_is_json_schema) {
        const schemaText = checkIsJsonSchema(resBody);
        if (!schemaText) {
          message.error('返回数据 json-schema 格式有误');
          return;
        }
      } else {
        try {
          parseLooseJson(resBody);
        } catch (_err) {
          message.error('返回Body json格式有问题，请检查');
          return;
        }
      }
    }

    const normalizedPath = normalizePathInput(path);
    if (!normalizedPath) {
      message.error('接口路径不能为空');
      return;
    }

    let normalizedReqBodyOther = reqBodyType === 'json' ? normalizeJsonText(reqBodyOther) : reqBodyOther;
    let normalizedResBody = values.res_body_type === 'json' ? normalizeJsonText(resBody) : resBody;
    if (reqBodyType === 'json' && values.req_body_is_json_schema) {
      normalizedReqBodyOther = String(checkIsJsonSchema(reqBodyOther) || reqBodyOther);
    }
    if (values.res_body_type === 'json' && values.res_body_is_json_schema) {
      normalizedResBody = String(checkIsJsonSchema(resBody) || resBody);
    }

    const contentTypeValue =
      reqBodyType === 'json'
        ? 'application/json'
        : reqBodyType === 'form'
          ? reqBodyForm.some(item => item.type === 'file')
            ? 'multipart/form-data'
            : 'application/x-www-form-urlencoded'
          : '';

    let normalizedHeaders = [...reqHeaders];
    if (supportsRequestBody(method) && contentTypeValue) {
      let hasContentType = false;
      normalizedHeaders = normalizedHeaders.map(item => {
        if (item.name.toLowerCase() !== 'content-type') return item;
        hasContentType = true;
        return { ...item, value: contentTypeValue };
      });
      if (!hasContentType) {
        normalizedHeaders = [
          { name: 'Content-Type', value: contentTypeValue, required: '1' },
          ...normalizedHeaders
        ];
      }
    }
    if (!supportsRequestBody(method)) {
      normalizedReqBodyOther = '';
    }

    const response = await callApi(
      updateInterface({
        id: Number(currentInterface._id),
        project_id: props.projectId,
        catid: Number(values.catid || currentInterface.catid || catRows[0]?._id || 0),
        title: String(values.title || '').trim(),
        path: normalizedPath,
        method,
        status: values.status,
        desc: String(values.desc || '').trim(),
        tag: tags,
        req_params: reqParams,
        req_query: reqQuery,
        req_headers: normalizedHeaders,
        req_body_type: reqBodyType,
        req_body_form: reqBodyType === 'form' ? reqBodyForm : [],
        req_body_other: reqBodyType === 'form' || !supportsRequestBody(method) ? '' : normalizedReqBodyOther,
        req_body_is_json_schema: reqBodyType === 'json' ? values.req_body_is_json_schema === true : false,
        res_body_type: values.res_body_type || 'json',
        res_body: normalizedResBody,
        res_body_is_json_schema:
          (values.res_body_type || 'json') === 'json' ? values.res_body_is_json_schema === true : false,
        custom_field_value: String(values.custom_field_value || ''),
        switch_notice: values.switch_notice === true,
        api_opened: values.api_opened === true,
        token: props.token
      }).unwrap(),
      '保存失败'
    );
    if (!response) return;
    message.success('接口已更新');
    await Promise.all([detailQuery.refetch(), refetchInterfaceListSafe(), refreshInterfaceMenu()]);
    setEditBaseline(serializeEditValues(values));
    setTab('view');
  }

  async function handleSaveProjectTag() {
    const lines = tagSettingInput
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean);
    const unique = Array.from(new Set(lines));
    const payload = unique.map(name => ({ name, desc: '' }));
    const response = await callApi(
      updateProjectTag({
        id: props.projectId,
        tag: payload
      }).unwrap(),
      'Tag 设置保存失败'
    );
    if (!response) return;
    message.success('Tag 设置已保存');
    setTagSettingOpen(false);
  }

  async function handleAddNewInterface(values: AddInterfaceForm) {
    const catid = Number(values.catid || 0);
    if (!catid) {
      message.error('请先选择接口分类');
      return;
    }
    const response = await callApi(
      addInterface({
        project_id: props.projectId,
        catid,
        title: values.title.trim(),
        path: values.path.trim(),
        method: values.method,
        status: 'undone',
        token: props.token
      }).unwrap(),
      '添加接口失败'
    );
    if (!response) return;
    message.success('接口添加成功');
    setAddInterfaceOpen(false);
    addInterfaceForm.resetFields();
    await Promise.all([refreshInterfaceMenu(), refetchInterfaceListSafe()]);
    const id = Number(response.data?._id || 0);
    if (id > 0) {
      navigate(`/project/${props.projectId}/interface/api/${id}`);
    }
  }

  function openAddInterfaceModal(defaultCatid?: number) {
    addInterfaceForm.setFieldsValue({
      method: 'GET',
      catid: Number(defaultCatid || catId || catRows[0]?._id || 0)
    });
    setAddInterfaceOpen(true);
  }

  async function handleAddNewCat(values: AddCatForm) {
    const response = await callApi(
      addInterfaceCat({
        project_id: props.projectId,
        name: values.name.trim(),
        desc: values.desc?.trim() || '',
        token: props.token
      }).unwrap(),
      '添加分类失败'
    );
    if (!response) return;
    message.success('接口分类添加成功');
    setAddCatOpen(false);
    addCatForm.resetFields();
    await refreshInterfaceMenu();
  }

  async function handleUpdateCat(values: EditCatForm) {
    if (!editingCat?._id) {
      message.error('分类不存在');
      return;
    }
    const response = await callApi(
      updateInterfaceCat({
        catid: Number(editingCat._id),
        project_id: props.projectId,
        name: values.name.trim(),
        desc: values.desc?.trim() || '',
        token: props.token
      }).unwrap(),
      '修改分类失败'
    );
    if (!response) return;
    message.success('分类已更新');
    setEditCatOpen(false);
    setEditingCat(null);
    await Promise.all([refreshInterfaceMenu(), refetchInterfaceListSafe()]);
  }

  function openEditCatModal(cat: InterfaceTreeNode) {
    const source = toRecord(cat);
    const catData = {
      _id: Number(cat._id || 0),
      name: String(cat.name || ''),
      desc: String(source.desc || '')
    };
    setEditingCat(catData);
    editCatForm.setFieldsValue({
      name: catData.name,
      desc: catData.desc
    });
    setEditCatOpen(true);
  }

  function confirmDeleteCat(cat: InterfaceTreeNode) {
    Modal.confirm({
      title: `确定删除分类 ${cat.name} 吗？`,
      content: '该操作会删除分类下所有接口，且无法恢复。',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true, loading: delInterfaceCatState.isLoading },
      onOk: async () => {
        const response = await callApi(
          delInterfaceCat({
            catid: Number(cat._id || 0),
            project_id: props.projectId,
            token: props.token
          }).unwrap(),
          '删除分类失败'
        );
        if (!response) return;
        message.success('分类已删除');
        await Promise.all([refreshInterfaceMenu(), refetchInterfaceListSafe()]);
        navigate(`/project/${props.projectId}/interface/api`);
      }
    });
  }

  function confirmDeleteInterface(id: number) {
    Modal.confirm({
      title: '确定删除此接口吗？',
      content: '接口删除后无法恢复。',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true, loading: delInterfaceState.isLoading },
      onOk: async () => {
        const response = await callApi(
          delInterface({
            id,
            project_id: props.projectId,
            token: props.token
          }).unwrap(),
          '删除接口失败'
        );
        if (!response) return;
        message.success('接口已删除');
        await Promise.all([refetchInterfaceListSafe(), refreshInterfaceMenu()]);
        if (interfaceId === id) {
          navigate(`/project/${props.projectId}/interface/api`);
        }
      }
    });
  }

  async function copyInterfaceRow(row: LegacyInterfaceDTO) {
    const sourceId = Number(row._id || 0);
    if (sourceId <= 0) {
      message.error('接口数据不完整，无法复制');
      return;
    }
    const detailRes = await callApi(
      fetchInterfaceDetail({
        id: sourceId,
        projectId: props.projectId,
        token: props.token
      }).unwrap(),
      '获取接口详情失败'
    );
    if (!detailRes?.data) return;
    const source = detailRes.data as LegacyInterfaceDTO & Record<string, unknown>;
    const pathBase = String(source.path || '/copy').replace(/\/+$/, '') || '/copy';
    const copyPayload = {
      project_id: props.projectId,
      catid: Number(source.catid || row.catid || catRows[0]?._id || 0),
      title: `${source.title || row.title || 'untitled'}_copy`,
      path: `${pathBase}_${Date.now()}`,
      method: String(source.method || row.method || 'GET').toUpperCase(),
      status: String(source.status || row.status || 'undone') as 'done' | 'undone',
      desc: String(source.desc || ''),
      req_query: Array.isArray(source.req_query) ? source.req_query : [],
      req_headers: Array.isArray(source.req_headers) ? source.req_headers : [],
      req_params: Array.isArray(source.req_params) ? source.req_params : [],
      req_body_type: source.req_body_type,
      req_body_form: Array.isArray(source.req_body_form) ? source.req_body_form : [],
      req_body_other: String(source.req_body_other || ''),
      req_body_is_json_schema: source.req_body_is_json_schema === true,
      res_body_type: source.res_body_type,
      res_body: String(source.res_body || ''),
      res_body_is_json_schema: source.res_body_is_json_schema === true,
      custom_field_value: String(source.custom_field_value || ''),
      api_opened: source.api_opened === true,
      tag: Array.isArray(source.tag) ? source.tag : [],
      token: props.token
    };
    const response = await callApi(addInterface(copyPayload).unwrap(), '复制接口失败');
    if (!response) return;
    message.success('接口已复制');
    await Promise.all([refetchInterfaceListSafe(), refreshInterfaceMenu()]);
    const id = Number(response.data?._id || 0);
    if (id > 0) {
      navigate(`/project/${props.projectId}/interface/api/${id}`);
    }
  }

  const openAddCatModal = useCallback(() => {
    addCatForm.resetFields();
    setAddCatOpen(true);
  }, [addCatForm]);

  const openTagSettingModal = useCallback(() => {
    setTagSettingInput((props.projectTag || []).map(item => String(item.name || '')).filter(Boolean).join('\n'));
    setTagSettingOpen(true);
  }, [props.projectTag]);

  const handleInterfaceListStatusChange = useCallback(
    async (id: number, next: 'done' | 'undone') => {
      const response = await callApi(
        updateInterface({
          id,
          project_id: props.projectId,
          status: next,
          token: props.token
        }).unwrap(),
        '更新状态失败'
      );
      if (!response) return;
      await Promise.all([refetchInterfaceListSafe(), refreshInterfaceMenu()]);
    },
    [callApi, props.token, refetchInterfaceListSafe, refreshInterfaceMenu, updateInterface]
  );

  const handleInterfaceListCatChange = useCallback(
    async (id: number, nextCatId: number) => {
      const response = await callApi(
        updateInterface({
          id,
          project_id: props.projectId,
          catid: nextCatId,
          token: props.token
        }).unwrap(),
        '更新分类失败'
      );
      if (!response) return;
      await Promise.all([refetchInterfaceListSafe(), refreshInterfaceMenu()]);
    },
    [callApi, props.token, refetchInterfaceListSafe, refreshInterfaceMenu, updateInterface]
  );

  const toggleExpandedCol = useCallback((colId: number) => {
    setExpandedColIds(prev => {
      if (prev.includes(colId)) {
        return prev.filter(item => item !== colId);
      }
      return [...prev, colId];
    });
  }, []);

  const handleCollectionDragStartCol = useCallback((colId: number) => {
    setDraggingColItem({ type: 'col', colId });
  }, []);

  const handleCollectionDragStartCase = useCallback((colId: number, nextCaseId: string) => {
    setDraggingColItem({ type: 'case', colId, caseId: nextCaseId });
  }, []);

  const handleCollectionDragEnd = useCallback(() => {
    setDraggingColItem(null);
  }, []);

  function parseJsonText(text: string, label: string): unknown {
    if (!text.trim()) return {};
    try {
      return JSON.parse(text);
    } catch (_err) {
      throw new Error(`${label} 不是合法 JSON`);
    }
  }

  function formatJsonText(text: string, label: string): string | null {
    try {
      const parsed = parseJsonText(text, label);
      return JSON.stringify(parsed, null, 2);
    } catch (err) {
      message.error((err as Error).message || `${label} 格式错误`);
      return null;
    }
  }

  async function copyText(text: string, successText: string) {
    try {
      await navigator.clipboard.writeText(text);
      message.success(successText);
    } catch (_err) {
      message.error('复制失败，请手动复制');
    }
  }

  function stringifyPretty(value: unknown): string {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value ?? null, null, 2);
    } catch (_err) {
      return String(value ?? '');
    }
  }

  function openBulkImport(field: 'req_query' | 'req_body_form') {
    const rows =
      field === 'req_query'
        ? sanitizeReqQuery(form.getFieldValue('req_query'))
        : sanitizeReqBodyForm(form.getFieldValue('req_body_form'));
    const text = rows.map(item => `${item.name}:${item.example || ''}`).join('\n');
    setBulkFieldName(field);
    setBulkValue(text);
    setBulkOpen(true);
  }

  function applyBulkImport() {
    if (!bulkFieldName) {
      setBulkOpen(false);
      return;
    }
    const lines = String(bulkValue || '')
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean);
    if (bulkFieldName === 'req_query') {
      const next = lines
        .map(line => {
          const index = line.indexOf(':');
          if (index < 0) return null;
          const name = line.slice(0, index).trim();
          if (!name) return null;
          return {
            name,
            example: line.slice(index + 1).trim(),
            required: '1' as const,
            desc: ''
          };
        })
        .filter(Boolean) as EditFormParam[];
      form.setFieldValue('req_query', next);
    } else {
      const next = lines
        .map(line => {
          const index = line.indexOf(':');
          if (index < 0) return null;
          const name = line.slice(0, index).trim();
          if (!name) return null;
          return {
            name,
            example: line.slice(index + 1).trim(),
            required: '1' as const,
            desc: '',
            type: 'text' as const
          };
        })
        .filter(Boolean) as EditFormBodyParam[];
      form.setFieldValue('req_body_form', next);
    }
    setBulkOpen(false);
    setBulkFieldName(null);
    setBulkValue('');
  }

  async function buildResponsePreviewText() {
    const values = form.getFieldsValue() as EditForm;
    const bodyType = String(values.res_body_type || 'json');
    if (bodyType !== 'json') {
      setResPreviewText('RAW 响应不支持模板预览，请直接查看返回内容文本。');
      return;
    }
    const resBodyText = String(values.res_body || '');
    if (!resBodyText.trim()) {
      setResPreviewText('');
      return;
    }
    if (values.res_body_is_json_schema) {
      try {
        const schema = parseLooseJson(resBodyText);
        const response = await fetch('/api/interface/schema2json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ schema })
        });
        const data = await response.json();
        setResPreviewText(stringifyPretty(data));
      } catch (err) {
        setResPreviewText(`解析出错: ${String((err as Error).message || err)}`);
      }
      return;
    }
    try {
      setResPreviewText(JSON.stringify(parseLooseJson(resBodyText), null, 2));
    } catch (err) {
      setResPreviewText(`解析出错: ${String((err as Error).message || err)}`);
    }
  }

  function handleResponseEditorTabChange(next: string) {
    if (next === 'preview') {
      void buildResponsePreviewText();
    }
    setResEditorTab(next === 'preview' ? 'preview' : 'tpl');
  }

  function handleFormatRunQuery() {
    const formatted = formatJsonText(runQuery, 'Query 参数');
    if (formatted == null) return;
    setRunQuery(formatted);
  }

  function handleFormatRunHeaders() {
    const formatted = formatJsonText(runHeaders, 'Header 参数');
    if (formatted == null) return;
    setRunHeaders(formatted);
  }

  function handleFormatRunBody() {
    const formatted = formatJsonText(runBody, 'Body 参数');
    if (formatted == null) return;
    setRunBody(formatted);
  }

  async function handleRun() {
    if (!currentInterface) {
      message.error('请先选择接口');
      return;
    }
    let queryData: unknown;
    let headerData: unknown;
    let bodyData: unknown;
    try {
      queryData = parseJsonText(runQuery, 'Query 参数');
      headerData = parseJsonText(runHeaders, 'Header 参数');
      bodyData = parseJsonText(runBody, 'Body 参数');
    } catch (err) {
      message.error((err as Error).message || '参数格式错误');
      return;
    }

    const method = runMethod.toUpperCase();
    const routeMethod = method.toLowerCase();
    const routePath = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(routeMethod)
      ? routeMethod
      : 'post';
    const url = `/api/test/${routePath}`;
    const queryMode = routeMethod === 'get' || routeMethod === 'head' || routeMethod === 'options';
    const payload = {
      interface_id: currentInterface._id,
      method,
      path: runPath,
      req_query: queryData,
      req_headers: headerData,
      req_body: bodyData
    };
    const requestMeta = {
      type: 'inter' as const,
      projectId: props.projectId,
      interfaceId: Number(currentInterface._id || 0)
    };

    setRunLoading(true);
    setRunResponse('');
    try {
      const pluginPayload = await webPlugins.runBeforeRequest(payload, requestMeta);
      const queryString = queryMode ? `?payload=${encodeURIComponent(JSON.stringify(pluginPayload))}` : '';
      const response = await fetch(`${url}${queryString}`, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: queryMode ? undefined : JSON.stringify(pluginPayload),
        credentials: 'include'
      });
      const text = await response.text();
      let responsePayload: Record<string, unknown> = {
        raw: text,
        method,
        path: runPath,
        interfaceId: Number(currentInterface._id || 0)
      };
      try {
        const obj = JSON.parse(text);
        responsePayload = {
          ...responsePayload,
          ...(obj as Record<string, unknown>)
        };
      } catch (_err) {
        // Keep raw text.
      }
      const pluginResult = await webPlugins.runAfterRequest(responsePayload, requestMeta);
      setRunResponse(stringifyPretty(pluginResult));
    } catch (err) {
      setRunResponse(String((err as Error).message || err));
    } finally {
      setRunLoading(false);
    }
  }

  async function handleDropOnCat(targetCatId: number) {
    const drag = draggingMenuItem;
    setDraggingMenuItem(null);
    if (!menuDragEnabled || !drag || targetCatId <= 0) return;

    if (drag.type === 'cat') {
      if (drag.id === targetCatId) return;
      const reordered = reorderById(menuRows, drag.id, targetCatId);
      const payload = buildIndexPayload(reordered);
      if (payload.length === 0) return;
      const response = await callApi(upInterfaceCatIndex(payload).unwrap(), '分类排序失败');
      if (!response) return;
      await refreshInterfaceMenu();
      return;
    }

    if (drag.type === 'interface' && drag.catid !== targetCatId) {
      const response = await callApi(
        updateInterface({
          id: drag.id,
          project_id: props.projectId,
          catid: targetCatId,
          token: props.token
        }).unwrap(),
        '移动接口失败'
      );
      if (!response) return;
      await Promise.all([refreshInterfaceMenu(), refetchInterfaceListSafe()]);
    }
  }

  async function handleDropOnInterface(targetCatId: number, targetInterfaceId: number) {
    const drag = draggingMenuItem;
    setDraggingMenuItem(null);
    if (!menuDragEnabled || !drag || drag.type !== 'interface') return;
    if (targetCatId <= 0 || targetInterfaceId <= 0 || drag.id <= 0) return;
    if (drag.id === targetInterfaceId) return;

    if (drag.catid !== targetCatId) {
      const response = await callApi(
        updateInterface({
          id: drag.id,
          project_id: props.projectId,
          catid: targetCatId,
          token: props.token
        }).unwrap(),
        '移动接口失败'
      );
      if (!response) return;
      await Promise.all([refreshInterfaceMenu(), refetchInterfaceListSafe()]);
      return;
    }

    const cat = menuRows.find(item => Number(item._id || 0) === targetCatId);
    const list = (cat?.list || []) as LegacyInterfaceDTO[];
    if (list.length === 0) return;
    const reordered = reorderById(list, drag.id, targetInterfaceId);
    const payload = buildIndexPayload(reordered);
    if (payload.length === 0) return;
    const response = await callApi(upInterfaceIndex(payload).unwrap(), '接口排序失败');
    if (!response) return;
    await Promise.all([refreshInterfaceMenu(), refetchInterfaceListSafe()]);
  }

  function openColModal(type: 'add' | 'edit', col?: { _id?: number; name?: string; desc?: string }) {
    setColModalType(type);
    if (type === 'edit' && col?._id) {
      setEditingCol({
        _id: Number(col._id || 0),
        name: String(col.name || ''),
        desc: String(col.desc || '')
      });
      colForm.setFieldsValue({
        name: String(col.name || ''),
        desc: String(col.desc || '')
      });
    } else {
      setEditingCol(null);
      colForm.setFieldsValue({ name: '', desc: '' });
    }
    setColModalOpen(true);
  }

  async function handleSubmitCol(values: ColForm) {
    const name = values.name.trim();
    const desc = values.desc?.trim() || '';
    if (!name) {
      message.error('请输入集合名');
      return;
    }
    if (colModalType === 'add') {
      const response = await callApi(
        addCol({
          project_id: props.projectId,
          name,
          desc,
          token: props.token
        }).unwrap(),
        '添加集合失败'
      );
      if (!response) return;
      message.success('添加集合成功');
      const newColId = Number(response.data?._id || 0);
      setColModalOpen(false);
      setEditingCol(null);
      colForm.resetFields();
      await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
      if (newColId > 0) {
        navigate(`/project/${props.projectId}/interface/col/${newColId}`);
      }
      return;
    }
    if (!editingCol?._id) {
      message.error('集合不存在');
      return;
    }
    const response = await callApi(
      updateCol({
        col_id: Number(editingCol._id),
        name,
        desc,
        token: props.token
      }).unwrap(),
      '修改集合失败'
    );
    if (!response) return;
    message.success('修改集合成功');
    setColModalOpen(false);
    setEditingCol(null);
    colForm.resetFields();
    await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
  }

  function confirmDeleteCol(colId: number) {
    if (colRows.length <= 1) {
      Modal.confirm({
        title: '此测试集合为最后一个集合',
        content: '温馨提示：建议不要删除',
        okText: '确认',
        cancelButtonProps: { style: { display: 'none' } }
      });
      return;
    }
    Modal.confirm({
      title: '您确认删除此测试集合',
      content: '温馨提示：该操作会删除该集合下所有测试用例，用例删除后无法恢复',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const response = await callApi(
          triggerDelCol({
            col_id: colId,
            project_id: props.projectId,
            token: props.token
          }).unwrap(),
          '删除集合失败'
        );
        if (!response) return;
        message.success('删除集合成功');
        const refreshed = await colListQuery.refetch();
        const nextRows = refreshed.data?.data || [];
        const nextColId = Number(nextRows[0]?._id || 0);
        if (selectedColId === colId || action === 'case') {
          if (nextColId > 0) {
            navigate(`/project/${props.projectId}/interface/col/${nextColId}`);
          } else {
            navigate(`/project/${props.projectId}/interface/col`);
          }
        }
      }
    });
  }

  async function handleCopyCol(col: { _id?: number; name?: string; desc?: string }) {
    const sourceColId = Number(col._id || 0);
    if (sourceColId <= 0) {
      message.error('集合数据不完整');
      return;
    }
    const addResponse = await callApi(
      addCol({
        project_id: props.projectId,
        name: `${String(col.name || 'collection')} copy`,
        desc: String(col.desc || ''),
        token: props.token
      }).unwrap(),
      '克隆集合失败'
    );
    if (!addResponse) return;
    const newColId = Number(addResponse.data?._id || 0);
    if (newColId <= 0) {
      message.error('克隆集合失败');
      return;
    }
    const cloneResponse = await callApi(
      cloneColCaseList({
        project_id: props.projectId,
        col_id: sourceColId,
        new_col_id: newColId,
        token: props.token
      }).unwrap(),
      '克隆集合失败'
    );
    if (!cloneResponse) return;
    message.success('克隆测试集成功');
    await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
    navigate(`/project/${props.projectId}/interface/col/${newColId}`);
  }

  function openImportInterfaceModal(colId: number) {
    setImportColId(colId);
    setImportProjectId(props.projectId);
    setImportSelectedRowKeys([]);
    setImportModalOpen(true);
  }

  async function handleImportInterfaces() {
    if (importColId <= 0) {
      message.error('请选择测试集合');
      return;
    }
    if (selectedImportInterfaceIds.length === 0) {
      message.error('请选择要导入的接口');
      return;
    }
    if (importProjectId <= 0) {
      message.error('请选择项目');
      return;
    }
    const response = await callApi(
      addColCaseList({
        project_id: importProjectId,
        col_id: importColId,
        interface_list: selectedImportInterfaceIds,
        token: props.token
      }).unwrap(),
      '导入集合失败'
    );
    if (!response) return;
    message.success('导入集合成功');
    setImportModalOpen(false);
    setImportSelectedRowKeys([]);
    await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
  }

  function confirmDeleteCase(caseItemId: string) {
    Modal.confirm({
      title: '您确认删除此测试用例',
      content: '温馨提示：用例删除后无法恢复',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const response = await callApi(
          triggerDelCase({
            caseid: caseItemId,
            col_id: selectedColId > 0 ? selectedColId : undefined,
            token: props.token
          }).unwrap(),
          '删除用例失败'
        );
        if (!response) return;
        message.success('删除用例成功');
        await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
        if (action === 'case' && caseId === caseItemId) {
          navigate(`/project/${props.projectId}/interface/col/${selectedColId || ''}`);
        }
      }
    });
  }

  async function handleCopyCase(caseItemId: string) {
    const detailResponse = await callApi(
      fetchColCaseDetail({
        caseid: caseItemId,
        token: props.token
      }).unwrap(),
      '获取用例详情失败'
    );
    if (!detailResponse?.data) return;
    const data = detailResponse.data as Record<string, unknown>;
    const addResponse = await callApi(
      addColCase({
        casename: `${String(data.casename || 'case')}_copy`,
        project_id: Number(data.project_id || props.projectId),
        col_id: Number(data.col_id || selectedColId || 0),
        interface_id: Number(data.interface_id || 0),
        case_env: String(data.case_env || ''),
        req_params: Array.isArray(data.req_params) ? data.req_params : [],
        req_headers: Array.isArray(data.req_headers) ? data.req_headers : [],
        req_query: Array.isArray(data.req_query) ? data.req_query : [],
        req_body_form: Array.isArray(data.req_body_form) ? data.req_body_form : [],
        req_body_other: String(data.req_body_other || ''),
        req_body_type: String(data.req_body_type || ''),
        test_script: String(data.test_script || ''),
        enable_script: data.enable_script === true,
        token: props.token
      }).unwrap(),
      '克隆用例失败'
    );
    if (!addResponse) return;
    message.success('克隆用例成功');
    const nextColId = Number(addResponse.data?.col_id || data.col_id || selectedColId || 0);
    await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
    if (nextColId > 0) {
      navigate(`/project/${props.projectId}/interface/col/${nextColId}`);
    }
  }

  async function handleSaveCase() {
    if (!caseId) {
      message.error('测试用例不存在');
      return;
    }
    const values = await caseForm.validateFields();
    let reqParams: unknown;
    let reqHeaders: unknown;
    let reqQuery: unknown;
    let reqBodyForm: unknown;
    try {
      reqParams = parseJsonText(values.req_params_text || '[]', 'req_params');
      reqHeaders = parseJsonText(values.req_headers_text || '[]', 'req_headers');
      reqQuery = parseJsonText(values.req_query_text || '[]', 'req_query');
      reqBodyForm = parseJsonText(values.req_body_form_text || '[]', 'req_body_form');
    } catch (err) {
      message.error((err as Error).message || '请求参数 JSON 格式错误');
      return;
    }
    const response = await callApi(
      upColCase({
        id: caseId,
        col_id: selectedColId > 0 ? selectedColId : undefined,
        casename: values.casename.trim(),
        case_env: values.case_env?.trim() || '',
        enable_script: values.enable_script === true,
        test_script: values.test_script || '',
        req_params: Array.isArray(reqParams) ? reqParams : [],
        req_headers: Array.isArray(reqHeaders) ? reqHeaders : [],
        req_query: Array.isArray(reqQuery) ? reqQuery : [],
        req_body_form: Array.isArray(reqBodyForm) ? reqBodyForm : [],
        req_body_type: values.req_body_type || 'form',
        req_body_other: values.req_body_other || '',
        token: props.token
      }).unwrap(),
      '保存用例失败'
    );
    if (!response) return;
    message.success('用例已保存');
    await Promise.all([caseDetailQuery.refetch(), caseListQuery.refetch(), colListQuery.refetch()]);
  }

  function buildAutoTestUrl(mode: 'json' | 'html', download?: boolean) {
    if (!projectTokenValue || selectedColId <= 0) return '';
    const query = new URLSearchParams();
    query.set('id', String(selectedColId));
    query.set('project_id', String(props.projectId));
    query.set('token', projectTokenValue);
    query.set('mode', mode);
    Object.entries(selectedRunEnvByProject).forEach(([projectId, envName]) => {
      const id = Number(projectId || 0);
      const env = String(envName || '').trim();
      if (!Number.isFinite(id) || id <= 0 || !env) return;
      query.set(`env_${id}`, env);
    });
    if (download) query.set('download', 'true');
    return `/api/open/run_auto_test?${query.toString()}`;
  }

  function openAutoTest(mode: 'json' | 'html', download?: boolean) {
    const url = buildAutoTestUrl(mode, download);
    if (!url) {
      message.error('测试 token 获取失败，请稍后重试');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function runAutoTestInPage(focusCaseId?: string) {
    const baseUrl = buildAutoTestUrl('json');
    const matchedCase = focusCaseId
      ? caseRows.find(item => String(item?._id || item?.id || '') === String(focusCaseId))
      : null;
    const focusInterfaceId = Number(
      (matchedCase as Record<string, unknown> | null)?.interface_id ||
        (matchedCase as Record<string, unknown> | null)?.interfaceId ||
        0
    );
    let requestUrl = baseUrl;
    let requestMethod: 'GET' | 'POST' = 'GET';
    let requestBody: string | undefined;
    let requestHeaders: Record<string, string> | undefined;
    if (!baseUrl) {
      message.error('测试 token 获取失败，请稍后重试');
      return;
    }
    setAutoTestRunning(true);
    const requestMeta = {
      type: 'col' as const,
      projectId: props.projectId,
      interfaceId: focusInterfaceId,
      caseId: focusCaseId
    };
    const caseRequestMeta = {
      type: 'case' as const,
      projectId: props.projectId,
      interfaceId: focusInterfaceId,
      caseId: focusCaseId || ''
    };
    try {
      const beforePayload = focusCaseId
        ? await webPlugins.runBeforeRequest(
            {
              method: 'GET',
              url: requestUrl,
              colId: selectedColId,
              type: 'case',
              caseId: focusCaseId,
              projectId: props.projectId,
              interfaceId: focusInterfaceId
            },
            caseRequestMeta
          )
        : await webPlugins.runBeforeCollectionRequest(
            {
              method: 'GET',
              url: requestUrl,
              colId: selectedColId,
              type: 'col',
              caseId: focusCaseId,
              projectId: props.projectId,
              interfaceId: focusInterfaceId
            },
            requestMeta
          );
      if (beforePayload && typeof beforePayload === 'object' && beforePayload.url) {
        const nextUrl = String(beforePayload.url || '').trim();
        if (nextUrl) {
          requestUrl = nextUrl;
        }
      }
      if (beforePayload && typeof beforePayload === 'object' && beforePayload.method) {
        const nextMethod = String(beforePayload.method || '').trim().toUpperCase();
        if (nextMethod === 'POST') {
          requestMethod = 'POST';
        }
      }
      if (beforePayload && typeof beforePayload === 'object' && beforePayload.headers) {
        const rawHeaders = beforePayload.headers as Record<string, unknown>;
        const normalizedHeaders: Record<string, string> = {};
        Object.entries(rawHeaders || {}).forEach(([key, value]) => {
          const name = String(key || '').trim();
          if (!name) return;
          normalizedHeaders[name] = String(value ?? '');
        });
        if (Object.keys(normalizedHeaders).length > 0) {
          requestHeaders = normalizedHeaders;
        }
      }
      if (beforePayload && typeof beforePayload === 'object' && beforePayload.body !== undefined) {
        const body = beforePayload.body;
        requestBody = typeof body === 'string' ? body : JSON.stringify(body);
      }
      if (!focusCaseId && caseRows.length > 0) {
        await Promise.all(
          caseRows.map(async row => {
            const rowCaseId = String(row._id || row.id || '');
            const rowInterfaceId = Number(row.interface_id || row.interfaceId || 0);
            await webPlugins.runBeforeCollectionRequest(
              {
                method: String(row.method || 'GET').toUpperCase(),
                url: String(row.path || ''),
                colId: selectedColId,
                type: 'col',
                caseId: rowCaseId,
                projectId: props.projectId,
                interfaceId: rowInterfaceId
              },
              {
                type: 'col',
                projectId: props.projectId,
                caseId: rowCaseId,
                interfaceId: rowInterfaceId
              }
            );
          })
        );
      }
      const response = await fetch(requestUrl, {
        method: requestMethod,
        credentials: 'include',
        headers: requestHeaders,
        body: requestMethod === 'POST' ? requestBody : undefined
      });
      const data = (await response.json()) as Record<string, unknown>;
      if (typeof data.errcode === 'number' && Number(data.errcode) !== 0) {
        message.error(String(data.errmsg || '执行测试失败'));
        return;
      }
      const report = (data && typeof data === 'object' && Array.isArray((data as AutoTestReport).list)
        ? (data as AutoTestReport)
        : (data.data as AutoTestReport)) || { list: [] };
      const normalizedList = Array.isArray(report.list) ? report.list : [];
      const hookedList = focusCaseId
        ? await Promise.all(
            normalizedList.map(async item => {
              if (String(item.id || '') !== String(focusCaseId)) {
                return item;
              }
              const pluginResult = await webPlugins.runAfterRequest(
                { ...item },
                {
                  type: 'case',
                  projectId: props.projectId,
                  caseId: String(item.id || ''),
                  interfaceId: Number(item.interface_id || item.interfaceId || 0)
                }
              );
              return {
                ...item,
                ...(pluginResult as Record<string, unknown>)
              } as AutoTestResultItem;
            })
          )
        : await Promise.all(
            normalizedList.map(async item => {
              const pluginResult = await webPlugins.runAfterCollectionRequest(
                { ...item },
                {
                  type: 'col',
                  projectId: props.projectId,
                  caseId: String(item.id || ''),
                  interfaceId: Number(item.interface_id || item.interfaceId || 0)
                }
              );
              return {
                ...item,
                ...(pluginResult as Record<string, unknown>)
              } as AutoTestResultItem;
            })
          );
      report.list = hookedList;
      setAutoTestReport(report);
      setAutoTestModalOpen(true);
      if (focusCaseId) {
        const matched = (report.list || []).find(item => String(item.id || '') === focusCaseId);
        if (matched) {
          setAutoTestDetailItem(matched);
          setAutoTestModalOpen(false);
        }
      }
      message.success('测试执行完成');
    } catch (err) {
      message.error(String((err as Error).message || err || '执行测试失败'));
    } finally {
      setAutoTestRunning(false);
    }
  }

  function handleFormatCaseRunQuery() {
    const formatted = formatJsonText(caseRunQuery, 'Query 参数');
    if (formatted == null) return;
    setCaseRunQuery(formatted);
  }

  function handleFormatCaseRunHeaders() {
    const formatted = formatJsonText(caseRunHeaders, 'Header 参数');
    if (formatted == null) return;
    setCaseRunHeaders(formatted);
  }

  function handleFormatCaseRunBody() {
    const formatted = formatJsonText(caseRunBody, 'Body 参数');
    if (formatted == null) return;
    setCaseRunBody(formatted);
  }

  async function handleRunCaseRequest(detail: CaseDetailData) {
    let queryData: unknown;
    let headerData: unknown;
    let bodyData: unknown;
    const bodyType = String(caseForm.getFieldValue('req_body_type') || detail.req_body_type || 'form').toLowerCase();
    try {
      queryData = parseJsonText(caseRunQuery, 'Query 参数');
      headerData = parseJsonText(caseRunHeaders, 'Header 参数');
      if (bodyType === 'raw' || bodyType === 'file') {
        bodyData = String(caseRunBody || '');
      } else {
        bodyData = parseJsonText(caseRunBody, 'Body 参数');
      }
    } catch (err) {
      message.error((err as Error).message || '参数格式错误');
      return;
    }

    const method = caseRunMethod.toUpperCase();
    const routeMethod = method.toLowerCase();
    const routePath = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(routeMethod)
      ? routeMethod
      : 'post';
    const url = `/api/test/${routePath}`;
    const queryMode = routeMethod === 'get' || routeMethod === 'head' || routeMethod === 'options';
    const interfaceId = Number(detail.interface_id || detail.interfaceId || 0);
    const payload = {
      interface_id: interfaceId,
      method,
      path: caseRunPath,
      req_query: queryData,
      req_headers: headerData,
      req_body: bodyData
    };
    const requestMeta = {
      type: 'case' as const,
      projectId: props.projectId,
      interfaceId,
      caseId
    };

    setCaseRunLoading(true);
    setCaseRunResponse('');
    try {
      const pluginPayload = await webPlugins.runBeforeRequest(payload, requestMeta);
      const queryString = queryMode ? `?payload=${encodeURIComponent(JSON.stringify(pluginPayload))}` : '';
      const response = await fetch(`${url}${queryString}`, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: queryMode ? undefined : JSON.stringify(pluginPayload),
        credentials: 'include'
      });
      const text = await response.text();
      let responsePayload: Record<string, unknown> = {
        raw: text,
        method,
        path: caseRunPath,
        interfaceId,
        caseId
      };
      try {
        const obj = JSON.parse(text);
        responsePayload = {
          ...responsePayload,
          ...(obj as Record<string, unknown>)
        };
      } catch (_err) {
        // Keep raw text.
      }
      const pluginResult = await webPlugins.runAfterRequest(responsePayload, requestMeta);
      setCaseRunResponse(stringifyPretty(pluginResult));
    } catch (err) {
      setCaseRunResponse(String((err as Error).message || err));
    } finally {
      setCaseRunLoading(false);
    }
  }

  function getCurrentCaseReportById(targetCaseId: string): AutoTestResultItem | null {
    const caseKey = String(targetCaseId || '');
    if (!caseKey) return null;
    const autoDetailKey = String(autoTestDetailItem?.id || '');
    if (autoDetailKey && autoDetailKey === caseKey) {
      return autoTestDetailItem;
    }
    return autoTestResultMap.get(caseKey) || null;
  }

  function openCommonSettingModal(col: CollectionRow | undefined) {
    const source = toRecord(col);
    const checkResponseField = toRecord(source.checkResponseField);
    const checkScript = toRecord(source.checkScript);
    commonSettingForm.setFieldsValue({
      checkHttpCodeIs200: source.checkHttpCodeIs200 === true,
      checkResponseSchema: source.checkResponseSchema === true,
      checkResponseFieldEnable: checkResponseField.enable === true,
      checkResponseFieldName: String(checkResponseField.name || 'code'),
      checkResponseFieldValue: String(checkResponseField.value ?? '0'),
      checkScriptEnable: checkScript.enable === true,
      checkScriptContent: String(checkScript.content || '')
    });
    setCommonSettingOpen(true);
  }

  async function handleSaveCommonSetting() {
    if (selectedColId <= 0) {
      message.error('请选择测试集合');
      return;
    }
    const values = await commonSettingForm.validateFields();
    const response = await callApi(
      updateCol({
        col_id: selectedColId,
        checkHttpCodeIs200: values.checkHttpCodeIs200 === true,
        checkResponseSchema: values.checkResponseSchema === true,
        checkResponseField: {
          enable: values.checkResponseFieldEnable === true,
          name: values.checkResponseFieldName || 'code',
          value: values.checkResponseFieldValue ?? '0'
        },
        checkScript: {
          enable: values.checkScriptEnable === true,
          content: values.checkScriptContent || ''
        },
        token: props.token
      }).unwrap(),
      '保存通用规则失败'
    );
    if (!response) return;
    message.success('通用规则已保存');
    setCommonSettingOpen(false);
    await colListQuery.refetch();
  }

  async function handleAddCase(values: AddCaseForm) {
    if (selectedColId <= 0) {
      message.error('请选择测试集合');
      return;
    }
    const interfaceId = Number(values.interface_id || 0);
    if (interfaceId <= 0) {
      message.error('请选择接口');
      return;
    }
    const detailRes = await callApi(
      fetchInterfaceDetail({
        id: interfaceId,
        projectId: props.projectId,
        token: props.token
      }).unwrap(),
      '获取接口详情失败'
    );
    if (!detailRes?.data) return;
    const detail = detailRes.data as LegacyInterfaceDTO & Record<string, unknown>;
    const response = await callApi(
      addColCase({
        casename: values.casename.trim() || String(detail.title || `case-${interfaceId}`),
        project_id: props.projectId,
        col_id: selectedColId,
        interface_id: interfaceId,
        case_env: values.case_env?.trim() || '',
        req_params: Array.isArray(detail.req_params) ? detail.req_params : [],
        req_headers: Array.isArray(detail.req_headers) ? detail.req_headers : [],
        req_query: Array.isArray(detail.req_query) ? detail.req_query : [],
        req_body_form: Array.isArray(detail.req_body_form) ? detail.req_body_form : [],
        req_body_other: String(detail.req_body_other || ''),
        req_body_type: String(detail.req_body_type || 'raw'),
        token: props.token
      }).unwrap(),
      '添加用例失败'
    );
    if (!response) return;
    message.success('测试用例添加成功');
    setAddCaseOpen(false);
    addCaseForm.resetFields();
    await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
    const newCaseId = String(response.data?._id || '');
    if (newCaseId) {
      navigate(`/project/${props.projectId}/interface/case/${newCaseId}`);
    }
  }

  async function handleDropOnCol(targetColId: number) {
    const drag = draggingColItem;
    setDraggingColItem(null);
    if (!colDragEnabled || !drag || targetColId <= 0) return;
    if (drag.type === 'col') {
      if (drag.colId === targetColId) return;
      const reordered = reorderById(colRows, drag.colId, targetColId);
      const payload = buildIndexPayload(reordered);
      if (payload.length === 0) return;
      const response = await callApi(upColIndex(payload).unwrap(), '测试集合排序失败');
      if (!response) return;
      await colListQuery.refetch();
      return;
    }
    if (drag.type === 'case' && drag.colId !== targetColId) {
      const response = await callApi(
        upColCase({
          id: drag.caseId,
          col_id: targetColId,
          token: props.token
        }).unwrap(),
        '移动测试用例失败'
      );
      if (!response) return;
      await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
    }
  }

  async function handleDropOnCase(targetColId: number, targetCaseId: string) {
    const drag = draggingColItem;
    setDraggingColItem(null);
    if (!colDragEnabled || !drag || drag.type !== 'case') return;
    if (!targetCaseId || drag.caseId === targetCaseId) return;

    if (drag.colId !== targetColId) {
      const moveResponse = await callApi(
        upColCase({
          id: drag.caseId,
          col_id: targetColId,
          token: props.token
        }).unwrap(),
        '移动测试用例失败'
      );
      if (!moveResponse) return;
      await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
      return;
    }

    const col = colDisplayRows.find((item: CollectionRow) => Number(item._id || 0) === targetColId);
    const sourceCases = (col?.caseList || []).map(item => ({ ...item, _id: String(item._id || '') }));
    if (sourceCases.length === 0) return;
    const reordered = reorderByCaseId(sourceCases, drag.caseId, targetCaseId);
    const payload = buildCaseIndexPayload(reordered).map(item => ({
      ...item,
      col_id: targetColId
    }));
    if (payload.length === 0) return;
    const response = await callApi(upColCaseIndex(payload).unwrap(), '测试用例排序失败');
    if (!response) return;
    await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
  }

  function renderApiMenu() {
    return (
      <InterfaceMenuPanel
        menuKeyword={menuKeyword}
        canEdit={canEdit}
        hasCategories={catRows.length > 0}
        menuDisplayRows={menuDisplayRows}
        catId={catId}
        interfaceId={interfaceId}
        expandedCatIds={expandedCatIds}
        menuDragEnabled={menuDragEnabled}
        catLoadingMap={catLoadingMap}
        onMenuKeywordChange={setMenuKeyword}
        onNavigateAll={() => navigateWithGuard(`/project/${props.projectId}/interface/api`)}
        onOpenAddInterface={() => openAddInterfaceModal()}
        onOpenAddCat={() => {
          addCatForm.resetFields();
          setAddCatOpen(true);
        }}
        onDropCat={catIdNum => void handleDropOnCat(catIdNum)}
        onToggleExpandCat={catIdNum =>
          setExpandedCatIds(prev => {
            if (prev.includes(catIdNum)) {
              return prev.filter(item => item !== catIdNum);
            }
            return [...prev, catIdNum];
          })
        }
        onEnsureCatLoaded={catIdNum => void loadCatInterfaces(catIdNum)}
        onNavigateCat={catIdNum => navigateWithGuard(`/project/${props.projectId}/interface/api/cat_${catIdNum}`)}
        onDragStartCat={catIdNum => setDraggingMenuItem({ type: 'cat', id: catIdNum })}
        onDragStartInterface={(catIdNum, ifaceId) =>
          setDraggingMenuItem({ type: 'interface', id: ifaceId, catid: catIdNum })
        }
        onDragEnd={() => setDraggingMenuItem(null)}
        onDropInterface={(catIdNum, ifaceId) => void handleDropOnInterface(catIdNum, ifaceId)}
        onOpenAddInterfaceInCat={openAddInterfaceModal}
        onEditCat={openEditCatModal}
        onDeleteCat={confirmDeleteCat}
        onNavigateInterface={ifaceId => navigateWithGuard(`/project/${props.projectId}/interface/api/${ifaceId}`)}
        onCopyInterface={item => void copyInterfaceRow(item)}
        onDeleteInterface={confirmDeleteInterface}
        methodClassName={getHttpMethodBadgeClassName}
      />
    );
  }

  function renderCollectionMenu() {
    return (
      <CollectionMenuPanel
        colKeyword={colKeyword}
        canEdit={canEdit}
        colDisplayRows={colDisplayRows}
        selectedColId={selectedColId}
        action={action}
        caseId={caseId}
        expandedColIds={expandedColIds}
        colDragEnabled={colDragEnabled}
        onColKeywordChange={setColKeyword}
        onOpenAddCol={() => openColModal('add')}
        onToggleExpandCol={toggleExpandedCol}
        onNavigateCol={colId => navigateWithGuard(`/project/${props.projectId}/interface/col/${colId}`)}
        onNavigateCase={id => navigateWithGuard(`/project/${props.projectId}/interface/case/${id}`)}
        onDragStartCol={handleCollectionDragStartCol}
        onDragStartCase={handleCollectionDragStartCase}
        onDragEnd={handleCollectionDragEnd}
        onDropCol={colId => void handleDropOnCol(colId)}
        onDropCase={(colId, id) => void handleDropOnCase(colId, id)}
        onDeleteCol={confirmDeleteCol}
        onEditCol={col => openColModal('edit', col as { _id?: number; name?: string; desc?: string })}
        onImportCol={openImportInterfaceModal}
        onCopyCol={col => void handleCopyCol(col as { _id?: number; name?: string; desc?: string })}
        onDeleteCase={confirmDeleteCase}
        onCopyCase={id => void handleCopyCase(id)}
      />
    );
  }

  function renderApiContent() {
    return (
      <InterfaceApiContent
        projectId={props.projectId}
        interfaceId={interfaceId}
        detailLoading={detailQuery.isLoading}
        currentInterface={currentInterface}
        basepath={props.basepath}
        canEdit={canEdit}
        currentCat={currentCat}
        currentCatName={currentCatName}
        filteredList={filteredList}
        currentListLoading={currentListLoading}
        listKeyword={listKeyword}
        statusFilter={statusFilter}
        listPage={listPage}
        catOptions={catSelectOptions}
        hasCategories={catRows.length > 0}
        onListKeywordChange={setListKeyword}
        onStatusFilterChange={setStatusFilter}
        onResetFilters={() => {
          setListKeyword('');
          setStatusFilter('all');
          setListPage(1);
        }}
        onListPageChange={setListPage}
        onOpenAddInterface={openAddInterfaceModal}
        onOpenAddCat={openAddCatModal}
        onOpenEditCat={openEditCatModal}
        onNavigateInterface={id => navigateWithGuard(`/project/${props.projectId}/interface/api/${id}`)}
        onUpdateStatus={handleInterfaceListStatusChange}
        onUpdateCategory={handleInterfaceListCatChange}
        onCopyInterface={copyInterfaceRow}
        onDeleteInterface={confirmDeleteInterface}
        methodClassName={getHttpMethodBadgeClassName}
        tab={tab}
        interfaceTabs={interfaceTabs}
        onSwitchTab={handleSwitch}
        projectIsMockOpen={props.projectIsMockOpen}
        projectStrict={props.projectStrict}
        customField={props.customField}
        normalizeParamRows={normalizeParamRows}
        buildSchemaRows={buildSchemaRows}
        statusLabel={statusLabel}
        formatUnixTime={formatUnixTime}
        mockFlagText={mockFlagText}
        onCopyText={(text, successText) => void copyText(text, successText)}
        editConflictState={editConflictState}
        form={form}
        catRows={catRows.map(item => ({ _id: Number(item._id || 0), name: String(item.name || '') }))}
        runMethods={RUN_METHODS}
        supportsRequestBody={supportsRequestBody}
        reqRadioType={reqRadioType}
        onReqRadioTypeChange={setReqRadioType}
        normalizePathInput={normalizePathInput}
        projectTagOptions={projectTagOptions}
        onOpenTagSetting={openTagSettingModal}
        sanitizeReqQuery={sanitizeReqQuery}
        sanitizeReqHeaders={sanitizeReqHeaders}
        sanitizeReqBodyForm={sanitizeReqBodyForm}
        onOpenBulkImport={openBulkImport}
        httpRequestHeaders={HTTP_REQUEST_HEADER}
        projectIsJson5={props.projectIsJson5}
        reqSchemaEditorMode={reqSchemaEditorMode}
        onReqSchemaEditorModeChange={setReqSchemaEditorMode}
        watchedReqBodyOther={watchedReqBodyOther}
        editValues={(watchedValues || {}) as Record<string, unknown>}
        resEditorTab={resEditorTab}
        onResponseEditorTabChange={handleResponseEditorTabChange}
        resSchemaEditorMode={resSchemaEditorMode}
        onResSchemaEditorModeChange={setResSchemaEditorMode}
        watchedResBody={watchedResBody}
        resPreviewText={resPreviewText}
        onSave={() => void handleSave()}
        saving={updateState.isLoading}
        runMethod={runMethod}
        runPath={runPath}
        runQuery={runQuery}
        runHeaders={runHeaders}
        runBody={runBody}
        runResponse={runResponse}
        runLoading={runLoading}
        onSetRunMethod={setRunMethod}
        onSetRunPath={setRunPath}
        onSetRunQuery={setRunQuery}
        onSetRunHeaders={setRunHeaders}
        onSetRunBody={setRunBody}
        onRun={() => void handleRun()}
        onFormatRunQuery={handleFormatRunQuery}
        onFormatRunHeaders={handleFormatRunHeaders}
        onFormatRunBody={handleFormatRunBody}
        onCopyRunQuery={() => void copyText(runQuery, 'Query 参数已复制')}
        onCopyRunHeaders={() => void copyText(runHeaders, 'Header 参数已复制')}
        onCopyRunBody={() => void copyText(runBody, 'Body 参数已复制')}
        onClearRunQuery={() => setRunQuery('{}')}
        onClearRunHeaders={() => setRunHeaders('{}')}
        onClearRunBody={() => setRunBody('{}')}
        onCopyRunResponse={() => void copyText(runResponse, '响应结果已复制')}
        onClearResponse={() => setRunResponse('')}
      />
    );
  }

  function renderCollectionContent() {
    const caseDetailData = (caseDetailQuery.data?.data || {}) as CaseDetailData;
    return (
      <InterfaceCollectionContent
        action={action}
        projectId={props.projectId}
        selectedColId={selectedColId}
        colRows={colRows}
        canEdit={canEdit}
        autoTestRunning={autoTestRunning}
        autoTestReport={autoTestReport}
        autoTestRows={autoTestRows}
        caseRows={caseRows}
        caseListLoading={caseListQuery.isLoading}
        caseEnvProjects={caseEnvProjects}
        selectedRunEnvByProject={selectedRunEnvByProject}
        autoTestResultMap={autoTestResultMap}
        onSetRunEnv={(projectId, envName) =>
          setSelectedRunEnvByProject(prev => ({
            ...prev,
            [projectId]: envName
          }))
        }
        onOpenAddCase={() => setAddCaseOpen(true)}
        onOpenImportInterface={() => openImportInterfaceModal(selectedColId)}
        onOpenEditCollection={currentCol => openColModal('edit', currentCol || undefined)}
        onOpenCommonSetting={currentCol => openCommonSettingModal(currentCol || undefined)}
        onRunAutoTestInCollection={() => void runAutoTestInPage()}
        onViewReport={() => openAutoTest('html')}
        onDownloadReport={() => openAutoTest('html', true)}
        onOpenReportModal={() => setAutoTestModalOpen(true)}
        onOpenReportDetail={item => {
          setAutoTestDetailItem(item);
          setAutoTestModalOpen(false);
        }}
        onNavigateCase={nextCaseId => navigateWithGuard(`/project/${props.projectId}/interface/case/${nextCaseId}`)}
        onRunCaseTest={nextCaseId => void runAutoTestInPage(nextCaseId)}
        onCopyCase={nextCaseId => void handleCopyCase(nextCaseId)}
        onDeleteCase={nextCaseId => confirmDeleteCase(nextCaseId)}
        caseId={caseId}
        caseDetailLoading={caseDetailQuery.isLoading}
        caseDetailData={caseDetailData}
        autoTestDetailItem={autoTestDetailItem}
        upColCaseLoading={upColCaseState.isLoading}
        caseForm={caseForm}
        caseEnvOptions={caseEnvOptions}
        runMethods={RUN_METHODS}
        caseRunMethod={caseRunMethod}
        caseRunPath={caseRunPath}
        caseRunQuery={caseRunQuery}
        caseRunHeaders={caseRunHeaders}
        caseRunBody={caseRunBody}
        caseRunResponse={caseRunResponse}
        caseRunLoading={caseRunLoading}
        stringifyPretty={stringifyPretty}
        onSetCaseRunMethod={setCaseRunMethod}
        onSetCaseRunPath={setCaseRunPath}
        onSetCaseRunQuery={setCaseRunQuery}
        onSetCaseRunHeaders={setCaseRunHeaders}
        onSetCaseRunBody={setCaseRunBody}
        onFormatCaseRunQuery={handleFormatCaseRunQuery}
        onFormatCaseRunHeaders={handleFormatCaseRunHeaders}
        onFormatCaseRunBody={handleFormatCaseRunBody}
        onCopyCaseRunQuery={() => void copyText(caseRunQuery, 'Query 参数已复制')}
        onCopyCaseRunHeaders={() => void copyText(caseRunHeaders, 'Header 参数已复制')}
        onCopyCaseRunBody={() => void copyText(caseRunBody, 'Body 参数已复制')}
        onCopyCaseRunResponse={() => void copyText(caseRunResponse, '调试响应已复制')}
        onCopyCaseResult={() => {
          const report = getCurrentCaseReportById(caseId);
          if (!report) {
            message.warning('暂无测试结果可复制');
            return;
          }
          void copyText(stringifyPretty(report), '测试结果已复制');
        }}
        onClearCaseRunQuery={() => setCaseRunQuery('{}')}
        onClearCaseRunHeaders={() => setCaseRunHeaders('{}')}
        onClearCaseRunBody={() => setCaseRunBody('{}')}
        onClearCaseRunResponse={() => setCaseRunResponse('')}
        onRunAutoTestInCase={() => void runAutoTestInPage(caseId)}
        onNavigateCollection={() => navigateWithGuard(`/project/${props.projectId}/interface/col/${selectedColId || ''}`)}
        onNavigateInterface={interfaceId =>
          navigateWithGuard(`/project/${props.projectId}/interface/api/${interfaceId}`)}
        onCopyCurrentCase={() => void handleCopyCase(caseId)}
        onDeleteCurrentCase={() => confirmDeleteCase(caseId)}
        onSaveCase={() => void handleSaveCase()}
        onRunCaseRequest={detail => void handleRunCaseRequest(detail)}
      />
    );
  }

  return (
    <>
      <InterfaceWorkspaceLayout
        action={action}
        apiMenu={renderApiMenu()}
        collectionMenu={renderCollectionMenu()}
        apiContent={renderApiContent()}
        collectionContent={renderCollectionContent()}
        onSwitchAction={next => navigateWithGuard(`/project/${props.projectId}/interface/${next}`)}
      />

      <InterfaceCoreModals
        confirmOpen={confirmOpen}
        onCancelConfirm={() => {
          setConfirmOpen(false);
          setNextTab(null);
          setPendingPath(null);
        }}
        onConfirmLeave={() => {
          if (nextTab) setTab(nextTab);
          if (pendingPath) {
            navigate(pendingPath);
          }
          setConfirmOpen(false);
          setNextTab(null);
          setPendingPath(null);
        }}
        addInterfaceOpen={addInterfaceOpen}
        addInterfaceForm={addInterfaceForm}
        addInterfaceLoading={addInterfaceState.isLoading}
        runMethods={RUN_METHODS}
        catRows={catRows}
        onCancelAddInterface={() => {
          setAddInterfaceOpen(false);
          addInterfaceForm.resetFields();
        }}
        onSubmitAddInterface={values => void handleAddNewInterface(values)}
        tagSettingOpen={tagSettingOpen}
        tagSettingInput={tagSettingInput}
        tagSettingLoading={updateProjectTagState.isLoading}
        onTagSettingInputChange={setTagSettingInput}
        onCancelTagSetting={() => setTagSettingOpen(false)}
        onSaveTagSetting={() => void handleSaveProjectTag()}
        bulkOpen={bulkOpen}
        bulkValue={bulkValue}
        onBulkValueChange={setBulkValue}
        onCancelBulk={() => {
          setBulkOpen(false);
          setBulkFieldName(null);
          setBulkValue('');
        }}
        onConfirmBulk={applyBulkImport}
        addCatOpen={addCatOpen}
        addCatForm={addCatForm}
        addCatLoading={addInterfaceCatState.isLoading}
        onCancelAddCat={() => {
          setAddCatOpen(false);
          addCatForm.resetFields();
        }}
        onSubmitAddCat={values => void handleAddNewCat(values)}
        editCatOpen={editCatOpen}
        editCatForm={editCatForm}
        editCatLoading={updateInterfaceCatState.isLoading}
        onCancelEditCat={() => {
          setEditCatOpen(false);
          setEditingCat(null);
          editCatForm.resetFields();
        }}
        onSubmitEditCat={values => void handleUpdateCat(values)}
      />

      <CollectionModals
        colModalType={colModalType}
        colModalOpen={colModalOpen}
        colForm={colForm}
        colModalLoading={addColState.isLoading || updateColState.isLoading}
        onCancelColModal={() => {
          setColModalOpen(false);
          setEditingCol(null);
          colForm.resetFields();
        }}
        onSubmitCol={values => void handleSubmitCol(values)}
        importModalOpen={importModalOpen}
        importModalLoading={addColCaseListState.isLoading}
        importProjectId={importProjectId}
        currentProjectId={props.projectId}
        importProjectOptions={importProjectOptions}
        selectedImportInterfaceCount={selectedImportInterfaceIds.length}
        importTableRows={importTableRows}
        importTableLoading={
          importTreeQuery.isLoading ||
          importTreeQuery.isFetching ||
          importLoading ||
          projectListQuery.isFetching
        }
        importSelectedRowKeys={importSelectedRowKeys}
        onImportProjectChange={value => {
          setImportProjectId(value);
          setImportSelectedRowKeys([]);
        }}
        onImportSelectedRowKeysChange={setImportSelectedRowKeys}
        onCancelImportModal={() => {
          setImportModalOpen(false);
          setImportSelectedRowKeys([]);
        }}
        onConfirmImportInterfaces={() => {
          void handleImportInterfaces();
        }}
        methodClassName={getHttpMethodBadgeClassName}
        addCaseOpen={addCaseOpen}
        addCaseForm={addCaseForm}
        addCaseLoading={addColCaseState.isLoading}
        caseInterfaceTruncated={caseInterfaceTruncated}
        caseInterfaceOptions={caseInterfaceOptions}
        onCancelAddCase={() => {
          setAddCaseOpen(false);
          addCaseForm.resetFields();
        }}
        onSubmitAddCase={values => void handleAddCase(values)}
        commonSettingOpen={commonSettingOpen}
        commonSettingForm={commonSettingForm}
        commonSettingLoading={updateColState.isLoading}
        onCancelCommonSetting={() => setCommonSettingOpen(false)}
        onSaveCommonSetting={() => {
          void handleSaveCommonSetting();
        }}
      />

      <AutoTestResultModals
        reportOpen={autoTestModalOpen}
        onCloseReport={() => setAutoTestModalOpen(false)}
        detailItem={autoTestDetailItem}
        onCloseDetail={() => setAutoTestDetailItem(null)}
        report={autoTestReport}
        rows={autoTestRows}
        onOpenDetail={item => setAutoTestDetailItem(item)}
        methodClassName={getHttpMethodBadgeClassName}
      />
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AutoComplete,
  Avatar,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Layout,
  Modal,
  Col,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
  CopyOutlined,
  EyeOutlined,
  DownOutlined,
  RightOutlined,
  FolderOpenOutlined,
  ImportOutlined
} from '@ant-design/icons';
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
  useGetInterfaceQuery,
  useGetProjectTokenQuery,
  useLazyDelColCaseQuery,
  useLazyDelColQuery,
  useLazyGetColCaseQuery,
  useLazyGetInterfaceQuery,
  useGetListMenuQuery,
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
import { LegacyErrMsg } from '../../components/LegacyErrMsg';
import { LegacySchemaEditor } from '../../components/LegacySchemaEditor';
import { legacyNameValidator } from '../../utils/legacy-validation';

const { Sider, Content } = Layout;
const { Text } = Typography;

const STABLE_EMPTY_ARRAY: any[] = [];

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
const METHOD_STYLE: Record<string, { color: string; background: string }> = {
  GET: { color: '#00a854', background: '#cfefdf' },
  POST: { color: '#108ee9', background: '#d2ebff' },
  PUT: { color: '#f0ad4e', background: '#fff3d9' },
  DELETE: { color: '#ff4d4f', background: '#ffe0e0' },
  PATCH: { color: '#722ed1', background: '#efe3ff' },
  HEAD: { color: '#13c2c2', background: '#d8f7f7' },
  OPTIONS: { color: '#595959', background: '#ededed' }
};

function methodStyle(method?: string) {
  const key = String(method || 'GET').toUpperCase();
  return METHOD_STYLE[key] || METHOD_STYLE.GET;
}

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
  const [listKeyword, setListKeyword] = useState('');
  const [listPage, setListPage] = useState(1);
  const [menuKeyword, setMenuKeyword] = useState('');
  const [expandedCatIds, setExpandedCatIds] = useState<number[]>([]);
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
  const editConflictSocketRef = useRef<WebSocket | null>(null);
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

  const menuQuery = useGetListMenuQuery(
    { projectId: props.projectId, token: props.token, detail: 'full' },
    { skip: props.projectId <= 0 }
  );
  const listQuery = useGetInterfaceListQuery(
    {
      projectId: props.projectId,
      token: props.token,
      page: 1,
      limit: 'all'
    },
    { skip: props.projectId <= 0 || action !== 'api' }
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
  const [triggerDelCol] = useLazyDelColQuery();
  const [triggerDelCase] = useLazyDelColCaseQuery();
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
  const importMenuQuery = useGetListMenuQuery(
    { projectId: importProjectId, token: props.token, detail: 'full' },
    { skip: importProjectId <= 0 || !importModalOpen }
  );

  const menuRows = (menuQuery.data?.data || STABLE_EMPTY_ARRAY) as InterfaceTreeNode[];
  const allInterfaces = (listQuery.data?.data?.list || STABLE_EMPTY_ARRAY) as LegacyInterfaceDTO[];
  const catRows = (catMenuQuery.data?.data || STABLE_EMPTY_ARRAY) as Array<{ _id: number; name: string; desc?: string }>;
  const currentInterface = (detailQuery.data?.data || null) as LegacyInterfaceDTO | null;
  const colRows = (colListQuery.data?.data || STABLE_EMPTY_ARRAY) as any[];
  const caseRows = (caseListQuery.data?.data || STABLE_EMPTY_ARRAY) as any[];
  const canEdit = /(admin|owner|dev)/.test(String(props.projectRole || ''));
  const interfaceTabs = useMemo<Record<string, InterfaceTabItem>>(() => {
    const tabs: Record<string, InterfaceTabItem> = {
      view: { name: '预览' },
      edit: { name: '编辑' },
      run: { name: '运行' }
    };
    webPlugins.applyInterfaceTabs(tabs, {
      projectId: props.projectId,
      interfaceData: (currentInterface as unknown as Record<string, unknown>) || {}
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
      return allInterfaces.filter(item => Number(item.catid) === catId);
    }
    return allInterfaces;
  }, [allInterfaces, catId]);

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

  const currentCatName = useMemo(() => {
    if (!catId) return '全部接口';
    const found = catRows.find(item => Number(item._id) === catId);
    return found?.name || `分类 ${catId}`;
  }, [catId, catRows]);
  const currentCat = useMemo(
    () => catRows.find(item => Number(item._id || 0) === catId) || null,
    [catId, catRows]
  );

  const filteredMenuRows = useMemo(() => {
    const keyword = menuKeyword.trim().toLowerCase();
    if (!keyword) return menuRows;
    return menuRows
      .map(cat => {
        const catName = String(cat.name || '').toLowerCase();
        const list = (cat.list || []).filter(item => {
          const title = String(item.title || '').toLowerCase();
          const path = String(item.path || '').toLowerCase();
          return title.includes(keyword) || path.includes(keyword);
        });
        if (catName.includes(keyword)) {
          return { ...cat };
        }
        if (list.length > 0) {
          return { ...cat, list };
        }
        return null;
      })
      .filter(Boolean) as InterfaceTreeNode[];
  }, [menuKeyword, menuRows]);
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
      const filteredCaseList = sourceCaseList.filter((item: any) => {
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
  const importMenuRows = (importMenuQuery.data?.data || STABLE_EMPTY_ARRAY) as InterfaceTreeNode[];
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
      menuRows.flatMap(cat =>
        (cat.list || []).map(item => ({
          value: Number(item._id || 0),
          label: `[${String(item.method || 'GET').toUpperCase()}] ${item.title || item.path || item._id}`,
          title: item.title || '',
          path: item.path || ''
        }))
      ),
    [menuRows]
  );
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

  useEffect(() => {
    if (menuRows.length === 0) {
      setExpandedCatIds([]);
      return;
    }
    setExpandedCatIds(prev => {
      const next = new Set(prev);
      menuRows.forEach(cat => {
        const id = Number(cat._id || 0);
        if (id > 0 && !next.has(id)) next.add(id);
      });
      return Array.from(next);
    });
  }, [menuRows]);

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
      if (editConflictSocketRef.current) {
        editConflictSocketRef.current.close();
        editConflictSocketRef.current = null;
      }
      return;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socketUrl = `${wsProtocol}://${window.location.host}/api/interface/solve_conflict?id=${interfaceId}`;
    setEditConflictState({ status: 'loading' });

    let finished = false;
    let fallbackTimer: number | null = window.setTimeout(() => {
      if (finished) return;
      setEditConflictState({ status: 'ready' });
    }, 3000);

    try {
      const socket = new WebSocket(socketUrl);
      editConflictSocketRef.current = socket;
      socket.onmessage = event => {
        finished = true;
        if (fallbackTimer != null) {
          window.clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
        try {
          const payload = JSON.parse(String(event.data || '{}')) as Record<string, unknown>;
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
        } catch (_err) {
          setEditConflictState({ status: 'ready' });
        }
      };
      socket.onerror = () => {
        finished = true;
        if (fallbackTimer != null) {
          window.clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
        setEditConflictState({ status: 'error' });
      };
    } catch (_err) {
      setEditConflictState({ status: 'error' });
    }

    return () => {
      finished = true;
      if (fallbackTimer != null) {
        window.clearTimeout(fallbackTimer);
      }
      const socket = editConflictSocketRef.current;
      editConflictSocketRef.current = null;
      if (socket) {
        socket.close();
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
  }, [action, caseDetailQuery.data, caseForm]);

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

    const response = await updateInterface({
      id: Number(currentInterface._id),
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
    } as any).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '保存失败');
      return;
    }
    message.success('接口已更新');
    await Promise.all([detailQuery.refetch(), listQuery.refetch(), menuQuery.refetch()]);
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
    const response = await updateProjectTag({
      id: props.projectId,
      tag: payload
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || 'Tag 设置保存失败');
      return;
    }
    message.success('Tag 设置已保存');
    setTagSettingOpen(false);
  }

  async function handleAddNewInterface(values: AddInterfaceForm) {
    const catid = Number(values.catid || 0);
    if (!catid) {
      message.error('请先选择接口分类');
      return;
    }
    const response = await addInterface({
      project_id: props.projectId,
      catid,
      title: values.title.trim(),
      path: values.path.trim(),
      method: values.method,
      status: 'undone',
      token: props.token
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '添加接口失败');
      return;
    }
    message.success('接口添加成功');
    setAddInterfaceOpen(false);
    addInterfaceForm.resetFields();
    await Promise.all([menuQuery.refetch(), listQuery.refetch(), catMenuQuery.refetch()]);
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
    const response = await addInterfaceCat({
      project_id: props.projectId,
      name: values.name.trim(),
      desc: values.desc?.trim() || '',
      token: props.token
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '添加分类失败');
      return;
    }
    message.success('接口分类添加成功');
    setAddCatOpen(false);
    addCatForm.resetFields();
    await Promise.all([menuQuery.refetch(), catMenuQuery.refetch()]);
  }

  async function handleUpdateCat(values: EditCatForm) {
    if (!editingCat?._id) {
      message.error('分类不存在');
      return;
    }
    const response = await updateInterfaceCat({
      catid: Number(editingCat._id),
      name: values.name.trim(),
      desc: values.desc?.trim() || '',
      token: props.token
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '修改分类失败');
      return;
    }
    message.success('分类已更新');
    setEditCatOpen(false);
    setEditingCat(null);
    await Promise.all([menuQuery.refetch(), catMenuQuery.refetch(), listQuery.refetch()]);
  }

  function openEditCatModal(cat: InterfaceTreeNode) {
    const catData = {
      _id: Number(cat._id || 0),
      name: String(cat.name || ''),
      desc: String((cat as unknown as Record<string, unknown>).desc || '')
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
        const response = await delInterfaceCat({
          catid: Number(cat._id || 0),
          token: props.token
        }).unwrap();
        if (response.errcode !== 0) {
          message.error(response.errmsg || '删除分类失败');
          return;
        }
        message.success('分类已删除');
        await Promise.all([menuQuery.refetch(), catMenuQuery.refetch(), listQuery.refetch()]);
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
        const response = await delInterface({
          id,
          token: props.token
        }).unwrap();
        if (response.errcode !== 0) {
          message.error(response.errmsg || '删除接口失败');
          return;
        }
        message.success('接口已删除');
        await Promise.all([listQuery.refetch(), menuQuery.refetch(), catMenuQuery.refetch()]);
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
    const detailRes = await fetchInterfaceDetail({
      id: sourceId,
      projectId: props.projectId,
      token: props.token
    }).unwrap();
    if (detailRes.errcode !== 0 || !detailRes.data) {
      message.error(detailRes.errmsg || '获取接口详情失败');
      return;
    }
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
    const response = await addInterface(copyPayload).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '复制接口失败');
      return;
    }
    message.success('接口已复制');
    await Promise.all([listQuery.refetch(), menuQuery.refetch(), catMenuQuery.refetch()]);
    const id = Number(response.data?._id || 0);
    if (id > 0) {
      navigate(`/project/${props.projectId}/interface/api/${id}`);
    }
  }

  function parseJsonText(text: string, label: string): unknown {
    if (!text.trim()) return {};
    try {
      return JSON.parse(text);
    } catch (_err) {
      throw new Error(`${label} 不是合法 JSON`);
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
      const response = await upInterfaceCatIndex(payload).unwrap();
      if (response.errcode !== 0) {
        message.error(response.errmsg || '分类排序失败');
        return;
      }
      await Promise.all([menuQuery.refetch(), catMenuQuery.refetch()]);
      return;
    }

    if (drag.type === 'interface' && drag.catid !== targetCatId) {
      const response = await updateInterface({
        id: drag.id,
        catid: targetCatId,
        token: props.token
      }).unwrap();
      if (response.errcode !== 0) {
        message.error(response.errmsg || '移动接口失败');
        return;
      }
      await Promise.all([menuQuery.refetch(), listQuery.refetch(), catMenuQuery.refetch()]);
    }
  }

  async function handleDropOnInterface(targetCatId: number, targetInterfaceId: number) {
    const drag = draggingMenuItem;
    setDraggingMenuItem(null);
    if (!menuDragEnabled || !drag || drag.type !== 'interface') return;
    if (targetCatId <= 0 || targetInterfaceId <= 0 || drag.id <= 0) return;
    if (drag.id === targetInterfaceId) return;

    if (drag.catid !== targetCatId) {
      const response = await updateInterface({
        id: drag.id,
        catid: targetCatId,
        token: props.token
      }).unwrap();
      if (response.errcode !== 0) {
        message.error(response.errmsg || '移动接口失败');
        return;
      }
      await Promise.all([menuQuery.refetch(), listQuery.refetch(), catMenuQuery.refetch()]);
      return;
    }

    const cat = menuRows.find(item => Number(item._id || 0) === targetCatId);
    const list = (cat?.list || []) as LegacyInterfaceDTO[];
    if (list.length === 0) return;
    const reordered = reorderById(list, drag.id, targetInterfaceId);
    const payload = buildIndexPayload(reordered);
    if (payload.length === 0) return;
    const response = await upInterfaceIndex(payload).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '接口排序失败');
      return;
    }
    await Promise.all([menuQuery.refetch(), listQuery.refetch()]);
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
      const response = await addCol({
        project_id: props.projectId,
        name,
        desc,
        token: props.token
      }).unwrap();
      if (response.errcode !== 0) {
        message.error(response.errmsg || '添加集合失败');
        return;
      }
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
    const response = await updateCol({
      col_id: Number(editingCol._id),
      name,
      desc,
      token: props.token
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '修改集合失败');
      return;
    }
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
        const response = await triggerDelCol({
          col_id: colId,
          token: props.token
        }).unwrap();
        if (response.errcode !== 0) {
          message.error(response.errmsg || '删除集合失败');
          return;
        }
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
    const addResponse = await addCol({
      project_id: props.projectId,
      name: `${String(col.name || 'collection')} copy`,
      desc: String(col.desc || ''),
      token: props.token
    }).unwrap();
    if (addResponse.errcode !== 0) {
      message.error(addResponse.errmsg || '克隆集合失败');
      return;
    }
    const newColId = Number(addResponse.data?._id || 0);
    if (newColId <= 0) {
      message.error('克隆集合失败');
      return;
    }
    const cloneResponse = await cloneColCaseList({
      project_id: props.projectId,
      col_id: sourceColId,
      new_col_id: newColId,
      token: props.token
    }).unwrap();
    if (cloneResponse.errcode !== 0) {
      message.error(cloneResponse.errmsg || '克隆集合失败');
      return;
    }
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
    const response = await addColCaseList({
      project_id: importProjectId,
      col_id: importColId,
      interface_list: selectedImportInterfaceIds,
      token: props.token
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '导入集合失败');
      return;
    }
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
        const response = await triggerDelCase({
          caseid: caseItemId,
          token: props.token
        }).unwrap();
        if (response.errcode !== 0) {
          message.error(response.errmsg || '删除用例失败');
          return;
        }
        message.success('删除用例成功');
        await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
        if (action === 'case' && caseId === caseItemId) {
          navigate(`/project/${props.projectId}/interface/col/${selectedColId || ''}`);
        }
      }
    });
  }

  async function handleCopyCase(caseItemId: string) {
    const detailResponse = await fetchColCaseDetail({
      caseid: caseItemId,
      token: props.token
    }).unwrap();
    if (detailResponse.errcode !== 0 || !detailResponse.data) {
      message.error(detailResponse.errmsg || '获取用例详情失败');
      return;
    }
    const data = detailResponse.data as Record<string, unknown>;
    const addResponse = await addColCase({
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
    }).unwrap();
    if (addResponse.errcode !== 0) {
      message.error(addResponse.errmsg || '克隆用例失败');
      return;
    }
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
    const response = await upColCase({
      id: caseId,
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
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '保存用例失败');
      return;
    }
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
    try {
      const beforePayload = await webPlugins.runBeforeCollectionRequest(
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
      const hookedList = await Promise.all(
        normalizedList.map(async item => {
          const pluginResult = await webPlugins.runAfterCollectionRequest(
            { ...(item as unknown as Record<string, unknown>) },
            {
              type: 'col',
              projectId: props.projectId,
              caseId: String(item.id || ''),
              interfaceId: Number(
                (item as unknown as Record<string, unknown>).interface_id ||
                  (item as unknown as Record<string, unknown>).interfaceId ||
                  0
              )
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

  function openCommonSettingModal(col: Record<string, unknown> | undefined) {
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
    const response = await updateCol({
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
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '保存通用规则失败');
      return;
    }
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
    const detailRes = await fetchInterfaceDetail({
      id: interfaceId,
      projectId: props.projectId,
      token: props.token
    }).unwrap();
    if (detailRes.errcode !== 0 || !detailRes.data) {
      message.error(detailRes.errmsg || '获取接口详情失败');
      return;
    }
    const detail = detailRes.data as LegacyInterfaceDTO & Record<string, unknown>;
    const response = await addColCase({
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
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '添加用例失败');
      return;
    }
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
      const response = await upColIndex(payload).unwrap();
      if (response.errcode !== 0) {
        message.error(response.errmsg || '测试集合排序失败');
        return;
      }
      await colListQuery.refetch();
      return;
    }
    if (drag.type === 'case' && drag.colId !== targetColId) {
      const response = await upColCase({
        id: drag.caseId,
        col_id: targetColId,
        token: props.token
      }).unwrap();
      if (response.errcode !== 0) {
        message.error(response.errmsg || '移动测试用例失败');
        return;
      }
      await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
    }
  }

  async function handleDropOnCase(targetColId: number, targetCaseId: string) {
    const drag = draggingColItem;
    setDraggingColItem(null);
    if (!colDragEnabled || !drag || drag.type !== 'case') return;
    if (!targetCaseId || drag.caseId === targetCaseId) return;

    if (drag.colId !== targetColId) {
      const moveResponse = await upColCase({
        id: drag.caseId,
        col_id: targetColId,
        token: props.token
      }).unwrap();
      if (moveResponse.errcode !== 0) {
        message.error(moveResponse.errmsg || '移动测试用例失败');
        return;
      }
      await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
      return;
    }

    const col = colDisplayRows.find((item: any) => Number(item._id || 0) === targetColId);
    const sourceCases = (col?.caseList || []).map((item: any) => ({ ...item, _id: String(item._id || '') }));
    if (sourceCases.length === 0) return;
    const reordered = reorderByCaseId(sourceCases, drag.caseId, targetCaseId);
    const payload = buildCaseIndexPayload(reordered);
    if (payload.length === 0) return;
    const response = await upColCaseIndex(payload).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '测试用例排序失败');
      return;
    }
    await Promise.all([colListQuery.refetch(), caseListQuery.refetch()]);
  }

  function renderApiMenu() {
    const keywordMode = menuKeyword.trim().length > 0;
    return (
      <div className="legacy-interface-menu">
        <div className="legacy-interface-menu-actions">
          <div className="legacy-interface-filter">
            <Input
              value={menuKeyword}
              onChange={event => setMenuKeyword(event.target.value)}
              placeholder="搜索接口"
              prefix={<SearchOutlined />}
              size="small"
              className="legacy-interface-filter-input"
            />
            <Space className="legacy-interface-filter-actions" size={8}>
              <button
                type="button"
                className="legacy-interface-menu-link-btn"
                onClick={() => navigateWithGuard(`/project/${props.projectId}/interface/api`)}
              >
                全部接口
              </button>
              {canEdit ? (
                <>
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => openAddInterfaceModal()}
                    disabled={catRows.length === 0}
                  >
                    接口
                  </Button>
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      addCatForm.resetFields();
                      setAddCatOpen(true);
                    }}
                  >
                    分类
                  </Button>
                </>
              ) : null}
            </Space>
          </div>
        </div>
        <div className="legacy-interface-menu-list">
          {menuDisplayRows.map(cat => (
            <div
              key={`cat-${cat._id}`}
              className="legacy-interface-cat"
              onDragOver={event => {
                if (!menuDragEnabled) return;
                event.preventDefault();
              }}
              onDrop={event => {
                if (!menuDragEnabled) return;
                event.preventDefault();
                event.stopPropagation();
                void handleDropOnCat(Number(cat._id || 0));
              }}
            >
              {(() => {
                const catIdNum = Number(cat._id || 0);
                const expanded = keywordMode || expandedCatIds.includes(catIdNum);
                return (
                  <button
                    type="button"
                    className={`legacy-interface-cat-title${catId === Number(cat._id) ? ' active' : ''}`}
                    draggable={menuDragEnabled}
                    onDragStart={event => {
                      if (!menuDragEnabled) return;
                      setDraggingMenuItem({ type: 'cat', id: Number(cat._id || 0) });
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => setDraggingMenuItem(null)}
                    onClick={() =>
                      navigateWithGuard(`/project/${props.projectId}/interface/api/cat_${cat._id}`)
                    }
                  >
                    <span className="legacy-interface-cat-main">
                      <span
                        className="legacy-interface-cat-toggle"
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (keywordMode) return;
                          setExpandedCatIds(prev => {
                            if (prev.includes(catIdNum)) {
                              return prev.filter(item => item !== catIdNum);
                            }
                            return [...prev, catIdNum];
                          });
                        }}
                      >
                        {expanded ? <DownOutlined /> : <RightOutlined />}
                      </span>
                      <span className="legacy-interface-cat-name">{cat.name}</span>
                    </span>
                    <Space size={4} className="legacy-interface-cat-actions">
                      {canEdit ? (
                        <>
                          <PlusOutlined
                            onClick={event => {
                              event.preventDefault();
                              event.stopPropagation();
                              openAddInterfaceModal(Number(cat._id || 0));
                            }}
                          />
                          <EditOutlined
                            onClick={event => {
                              event.preventDefault();
                              event.stopPropagation();
                              openEditCatModal(cat);
                            }}
                          />
                          <DeleteOutlined
                            onClick={event => {
                              event.preventDefault();
                              event.stopPropagation();
                              confirmDeleteCat(cat);
                            }}
                          />
                        </>
                      ) : null}
                      <Tag>{cat.interface_count || cat.list?.length || 0}</Tag>
                    </Space>
                  </button>
                );
              })()}
              {(menuKeyword.trim().length > 0 || expandedCatIds.includes(Number(cat._id || 0))
                ? cat.list || []
                : []
              ).map(item => (
                <button
                  key={`iface-${item._id}`}
                  type="button"
                  className={`legacy-interface-item${interfaceId === Number(item._id) ? ' active' : ''}`}
                  draggable={menuDragEnabled}
                  onDragStart={event => {
                    if (!menuDragEnabled) return;
                    setDraggingMenuItem({
                      type: 'interface',
                      id: Number(item._id || 0),
                      catid: Number(cat._id || 0)
                    });
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDraggingMenuItem(null)}
                  onDragOver={event => {
                    if (!menuDragEnabled) return;
                    event.preventDefault();
                  }}
                  onDrop={event => {
                    if (!menuDragEnabled) return;
                    event.preventDefault();
                    event.stopPropagation();
                    void handleDropOnInterface(Number(cat._id || 0), Number(item._id || 0));
                  }}
                  onClick={() =>
                    navigateWithGuard(`/project/${props.projectId}/interface/api/${item._id}`)
                  }
                >
                  <span className="legacy-method-pill" style={methodStyle(item.method)}>
                    {String(item.method || 'GET').toUpperCase()}
                  </span>
                  <Tooltip title={item.path}>
                    <span className="legacy-interface-item-title">{item.title || item.path}</span>
                  </Tooltip>
                  {canEdit ? (
                    <Space size={4} className="legacy-interface-item-actions">
                      <CopyOutlined
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          void copyInterfaceRow(item as LegacyInterfaceDTO);
                        }}
                      />
                      <DeleteOutlined
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          confirmDeleteInterface(Number(item._id || 0));
                        }}
                      />
                    </Space>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderCollectionMenu() {
    const keywordMode = colKeyword.trim().length > 0;
    return (
      <div className="legacy-interface-menu">
        <div className="legacy-interface-menu-actions">
          <div className="legacy-interface-filter">
            <Input
              value={colKeyword}
              onChange={event => setColKeyword(event.target.value)}
              placeholder="搜索测试集合"
              prefix={<SearchOutlined />}
              size="small"
              className="legacy-interface-filter-input"
            />
            {canEdit ? (
              <Space className="legacy-interface-filter-actions" size={8}>
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => openColModal('add')}
                >
                  添加集合
                </Button>
              </Space>
            ) : null}
          </div>
        </div>
        <div className="legacy-interface-menu-list">
          {colDisplayRows.map(col => {
            const colId = Number(col._id || 0);
            const activeCol = selectedColId === colId && (action === 'col' || action === 'case');
            const expanded = keywordMode || expandedColIds.includes(colId);
            const caseList = col.caseList || [];
            return (
              <div
                key={`col-${colId}`}
                className="legacy-interface-cat"
                onDragOver={event => {
                  if (!colDragEnabled) return;
                  event.preventDefault();
                }}
                onDrop={event => {
                  if (!colDragEnabled) return;
                  event.preventDefault();
                  event.stopPropagation();
                  void handleDropOnCol(colId);
                }}
              >
                <button
                  type="button"
                  className={`legacy-interface-cat-title${activeCol ? ' active' : ''}`}
                  draggable={colDragEnabled}
                  onDragStart={event => {
                    if (!colDragEnabled) return;
                    setDraggingColItem({ type: 'col', colId });
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDraggingColItem(null)}
                  onClick={() =>
                    navigateWithGuard(`/project/${props.projectId}/interface/col/${colId}`)
                  }
                >
                  <span className="legacy-interface-cat-main">
                    <span
                      className="legacy-interface-cat-toggle"
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (keywordMode) return;
                        setExpandedColIds(prev => {
                          if (prev.includes(colId)) {
                            return prev.filter(item => item !== colId);
                          }
                          return [...prev, colId];
                        });
                      }}
                    >
                      {expanded ? <DownOutlined /> : <RightOutlined />}
                    </span>
                    <FolderOpenOutlined style={{ color: '#617184' }} />
                    <span className="legacy-interface-cat-name">{col.name}</span>
                  </span>
                  <Space size={4} className="legacy-interface-cat-actions">
                    {canEdit ? (
                      <>
                        <DeleteOutlined
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            confirmDeleteCol(colId);
                          }}
                        />
                        <EditOutlined
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            openColModal('edit', col);
                          }}
                        />
                        <ImportOutlined
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            openImportInterfaceModal(colId);
                          }}
                        />
                        <CopyOutlined
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleCopyCol(col);
                          }}
                        />
                      </>
                    ) : null}
                    <Tag>{caseList.length}</Tag>
                  </Space>
                </button>
                {(expanded ? caseList : []).map((item: any) => {
                  const id = String(item._id || '');
                  return (
                    <button
                      key={`case-${id}`}
                      type="button"
                      className={`legacy-interface-item${action === 'case' && caseId === id ? ' active' : ''}`}
                      draggable={colDragEnabled}
                      onDragStart={event => {
                        if (!colDragEnabled) return;
                        setDraggingColItem({ type: 'case', colId, caseId: id });
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => setDraggingColItem(null)}
                      onDragOver={event => {
                        if (!colDragEnabled) return;
                        event.preventDefault();
                      }}
                      onDrop={event => {
                        if (!colDragEnabled) return;
                        event.preventDefault();
                        event.stopPropagation();
                        void handleDropOnCase(colId, id);
                      }}
                      onClick={() =>
                        navigateWithGuard(`/project/${props.projectId}/interface/case/${id}`)
                      }
                    >
                      <Tag color="blue">CASE</Tag>
                      <Tooltip title={item.path}>
                        <span className="legacy-interface-item-title">
                          {item.casename || item.title || id}
                        </span>
                      </Tooltip>
                      {canEdit ? (
                        <Space size={4} className="legacy-interface-item-actions">
                          <DeleteOutlined
                            onClick={event => {
                              event.preventDefault();
                              event.stopPropagation();
                              confirmDeleteCase(id);
                            }}
                          />
                          <CopyOutlined
                            onClick={event => {
                              event.preventDefault();
                              event.stopPropagation();
                              void handleCopyCase(id);
                            }}
                          />
                        </Space>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderApiContent() {
    const tablePageSize = 20;
    const pagedFilteredList = filteredList.slice((listPage - 1) * tablePageSize, listPage * tablePageSize);
    if (interfaceId <= 0) {
      return (
        <Card>
          <Space direction="vertical" style={{ width: '100%' }}>
            {currentCat ? (
              <Alert
                type="info"
                showIcon
                message={`接口分类：${currentCat.name}`}
                description={
                  <Space size={8}>
                    <span>{currentCat.desc?.trim() || '暂无分类简介'}</span>
                    {canEdit ? (
                      <Button
                        size="small"
                        type="link"
                        onClick={() =>
                          openEditCatModal({
                            _id: currentCat._id,
                            name: currentCat.name,
                            desc: currentCat.desc
                          })
                        }
                      >
                        编辑分类
                      </Button>
                    ) : null}
                  </Space>
                }
              />
            ) : null}
            <div className="legacy-interface-list-toolbar">
              <Text strong>{currentCatName} 共 ({filteredList.length}) 个接口</Text>
              <Space size={8}>
                <Input
                  value={listKeyword}
                  onChange={event => setListKeyword(event.target.value)}
                  placeholder="搜索接口"
                  prefix={<SearchOutlined />}
                  allowClear
                  size="small"
                  style={{ width: 220 }}
                />
                <Select<'all' | 'done' | 'undone'>
                  value={statusFilter}
                  onChange={setStatusFilter}
                  size="small"
                  style={{ width: 124 }}
                  options={[
                    { value: 'all', label: '全部状态' },
                    { value: 'done', label: '已完成' },
                    { value: 'undone', label: '未完成' }
                  ]}
                />
                {canEdit ? (
                  <>
                    <Button size="small" onClick={() => openAddInterfaceModal()} disabled={catRows.length === 0}>
                      添加接口
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        addCatForm.resetFields();
                        setAddCatOpen(true);
                      }}
                    >
                      添加分类
                    </Button>
                  </>
                ) : null}
              </Space>
            </div>

            <Table
              rowKey={row => Number(row._id || 0)}
              loading={listQuery.isLoading}
              dataSource={pagedFilteredList}
              locale={{
                emptyText:
                  filteredList.length === 0 && !listKeyword.trim() && statusFilter === 'all' ? (
                    <LegacyErrMsg type="noInterface" />
                  ) : (
                    <LegacyErrMsg type="noData" />
                  )
              }}
              pagination={{
                current: listPage,
                pageSize: tablePageSize,
                total: filteredList.length,
                showSizeChanger: false,
                onChange: page => setListPage(page)
              }}
              columns={[
                {
                  title: '接口名称',
                  dataIndex: 'title',
                  render: (value, row) => (
                    <button
                      type="button"
                      className="legacy-interface-menu-link-btn"
                      onClick={() => navigateWithGuard(`/project/${props.projectId}/interface/api/${row._id}`)}
                    >
                      {value}
                    </button>
                  )
                },
                {
                  title: '接口路径',
                  dataIndex: 'path',
                  render: (value, row) => (
                    <Space>
                      <span className="legacy-method-pill" style={methodStyle(String(row.method || 'GET'))}>
                        {String(row.method || 'GET').toUpperCase()}
                      </span>
                      {row.api_opened ? (
                        <Tooltip title="开放接口">
                          <EyeOutlined className="legacy-opened-icon" />
                        </Tooltip>
                      ) : null}
                      <span>{`${props.basepath || ''}${value || ''}`}</span>
                    </Space>
                  )
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 140,
                  render: (value, row) => (
                    <Select<'done' | 'undone'>
                      value={String(value || 'undone') as 'done' | 'undone'}
                      style={{ width: 120 }}
                      disabled={!canEdit}
                      onChange={async next => {
                        const response = await updateInterface({
                          id: Number(row._id || 0),
                          status: next,
                          token: props.token
                        }).unwrap();
                        if (response.errcode !== 0) {
                          message.error(response.errmsg || '更新状态失败');
                          return;
                        }
                        await Promise.all([listQuery.refetch(), menuQuery.refetch()]);
                      }}
                      options={[
                        { label: '已完成', value: 'done' },
                        { label: '未完成', value: 'undone' }
                      ]}
                    />
                  )
                },
                {
                  title: '分类',
                  width: 220,
                  render: (_, row) => (
                    <Select<number>
                      value={Number(row.catid || 0)}
                      style={{ width: 200 }}
                      disabled={!canEdit}
                      onChange={async nextCatId => {
                        const response = await updateInterface({
                          id: Number(row._id || 0),
                          catid: nextCatId,
                          token: props.token
                        }).unwrap();
                        if (response.errcode !== 0) {
                          message.error(response.errmsg || '更新分类失败');
                          return;
                        }
                        await Promise.all([listQuery.refetch(), menuQuery.refetch()]);
                      }}
                      options={catRows.map(item => ({
                        label: item.name,
                        value: Number(item._id || 0)
                      }))}
                    />
                  )
                },
                {
                  title: '操作',
                  width: 130,
                  render: (_, row) =>
                    canEdit ? (
                      <Space size={4}>
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => void copyInterfaceRow(row as LegacyInterfaceDTO)}
                        />
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => confirmDeleteInterface(Number(row._id || 0))}
                        />
                      </Space>
                    ) : (
                      '-'
                    )
                }
              ]}
            />
          </Space>
        </Card>
      );
    }

    if (detailQuery.isLoading) {
      return <Card loading />;
    }

    if (!currentInterface) {
      return <LegacyErrMsg type="noInterface" />;
    }

    const method = String(currentInterface.method || 'GET').toUpperCase();
    const fullPath = `${props.basepath || ''}${currentInterface.path || ''}`;
    const editValues = (watchedValues || {}) as EditForm;
    const editMethod = String(editValues.method || method).toUpperCase();
    const editBodySupported = supportsRequestBody(editMethod);
    const editBodyType = editValues.req_body_type || 'form';
    const mockUrl =
      typeof window === 'undefined'
        ? ''
        : `${window.location.protocol}//${window.location.host}/mock/${props.projectId}${fullPath}`;
    const reqParamsRows = normalizeParamRows(currentInterface.req_params);
    const reqHeadersRows = normalizeParamRows(currentInterface.req_headers);
    const reqQueryRows = normalizeParamRows(currentInterface.req_query);
    const reqBodyFormRows = normalizeParamRows(currentInterface.req_body_form);
    const paramColumns = [
      { title: '参数名称', dataIndex: 'name', key: 'name', width: 180 },
      { title: '是否必须', dataIndex: 'required', key: 'required', width: 120 },
      { title: '示例', dataIndex: 'example', key: 'example', width: 180 },
      {
        title: '备注',
        dataIndex: 'desc',
        key: 'desc',
        render: (value: string) => <span className="legacy-multiline">{value || '-'}</span>
      }
    ];
    const bodyParamColumns = [
      { title: '参数名称', dataIndex: 'name', key: 'name', width: 180 },
      {
        title: '参数类型',
        dataIndex: 'type',
        key: 'type',
        width: 120,
        render: (value: string) => (value ? value : '-')
      },
      { title: '是否必须', dataIndex: 'required', key: 'required', width: 120 },
      { title: '示例', dataIndex: 'example', key: 'example', width: 180 },
      {
        title: '备注',
        dataIndex: 'desc',
        key: 'desc',
        render: (value: string) => <span className="legacy-multiline">{value || '-'}</span>
      }
    ];
    const schemaRowsRequest =
      String(currentInterface.req_body_type || '').toLowerCase() === 'json' &&
        currentInterface.req_body_is_json_schema
        ? buildSchemaRows(String(currentInterface.req_body_other || ''))
        : [];
    const schemaRowsResponse =
      String(currentInterface.res_body_type || 'json').toLowerCase() === 'json' &&
        currentInterface.res_body_is_json_schema
        ? buildSchemaRows(String(currentInterface.res_body || ''))
        : [];
    const schemaColumns = [
      { title: '名称', dataIndex: 'name', key: 'name', width: 220 },
      { title: '类型', dataIndex: 'type', key: 'type', width: 120 },
      { title: '是否必须', dataIndex: 'required', key: 'required', width: 100 },
      { title: '默认值', dataIndex: 'defaultValue', key: 'defaultValue', width: 140 },
      {
        title: '备注',
        dataIndex: 'desc',
        key: 'desc',
        render: (value: string) => <span className="legacy-multiline">{value || '-'}</span>
      },
      {
        title: '其他信息',
        dataIndex: 'other',
        key: 'other',
        render: (value: string) => <span className="legacy-multiline">{value || '-'}</span>
      }
    ];

    return (
      <Card>
        <Tabs
          type="card"
          className="legacy-interface-content-tabs"
          activeKey={tab}
          onChange={key => handleSwitch(key)}
          items={Object.keys(interfaceTabs).map(key => {
            const tabItem = interfaceTabs[key];
            if (key === 'view') {
              return {
                key,
                label: tabItem.name,
                children: (
                <div className="caseContainer">
                  <h2 className="interface-title">基本信息</h2>
                  <div className="panel-view">
                    <Row className="row">
                      <Col span={4} className="colKey">
                        接口名称：
                      </Col>
                      <Col span={8} className="colName">
                        <span title={String(currentInterface.title || '-')}>{currentInterface.title || '-'}</span>
                      </Col>
                      <Col span={4} className="colKey">
                        创 建 人：
                      </Col>
                      <Col span={8} className="colValue">
                        {Number((currentInterface as unknown as Record<string, unknown>).uid || 0) > 0 ? (
                          <Link
                            className="user-name"
                            to={`/user/profile/${Number((currentInterface as unknown as Record<string, unknown>).uid || 0)}`}
                          >
                            <Avatar
                              className="user-img"
                              size={24}
                              src={`/api/user/avatar?uid=${Number((currentInterface as unknown as Record<string, unknown>).uid || 0)}`}
                            />
                            {String((currentInterface as unknown as Record<string, unknown>).username || '-')}
                          </Link>
                        ) : (
                          String((currentInterface as unknown as Record<string, unknown>).username || '-')
                        )}
                      </Col>
                    </Row>
                    <Row className="row">
                      <Col span={4} className="colKey">
                        状 态：
                      </Col>
                      <Col span={8}>
                        <span
                          className={`legacy-status-tag ${currentInterface.status === 'done' ? 'done' : 'undone'}`}
                        >
                          {statusLabel(currentInterface.status)}
                        </span>
                      </Col>
                      <Col span={4} className="colKey">
                        更新时间：
                      </Col>
                      <Col span={8}>{formatUnixTime((currentInterface as unknown as Record<string, unknown>).up_time)}</Col>
                    </Row>
                    {(currentInterface.tag || []).length > 0 ? (
                      <Row className="row remark">
                        <Col span={4} className="colKey">
                          Tag：
                        </Col>
                        <Col span={18} className="colValue">
                          {(currentInterface.tag || []).map(tag => (
                            <Tag key={tag}>{tag}</Tag>
                          ))}
                        </Col>
                      </Row>
                    ) : null}
                    <Row className="row">
                      <Col span={4} className="colKey">
                        接口路径：
                      </Col>
                      <Col span={18} className="colValue colMethod">
                        <span className="legacy-method-pill tag-method" style={methodStyle(method)}>
                          {method}
                        </span>
                        <span>{fullPath}</span>
                        <Tooltip title="复制路径">
                          <Button
                            size="small"
                            type="text"
                            icon={<CopyOutlined />}
                            onClick={() => void copyText(fullPath, '接口路径已复制')}
                          />
                        </Tooltip>
                      </Col>
                    </Row>
                    <Row className="row">
                      <Col span={4} className="colKey">
                        Mock地址：
                      </Col>
                      <Col span={18} className="colValue">
                        {mockFlagText(props.projectIsMockOpen, props.projectStrict) ? (
                          <Text type="secondary">{mockFlagText(props.projectIsMockOpen, props.projectStrict)} </Text>
                        ) : null}
                        {mockUrl ? (
                          <button
                            type="button"
                            className="legacy-view-link-btn"
                            onClick={() => window.open(mockUrl, '_blank', 'noopener,noreferrer')}
                          >
                            {mockUrl}
                          </button>
                        ) : (
                          <span className="legacy-view-link">-</span>
                        )}
                        {mockUrl ? (
                          <Tooltip title="复制Mock地址">
                            <Button
                              size="small"
                              type="text"
                              icon={<CopyOutlined />}
                              onClick={() => void copyText(mockUrl, 'Mock地址已复制')}
                            />
                          </Tooltip>
                        ) : null}
                      </Col>
                    </Row>
                    {props.customField?.enable && String(currentInterface.custom_field_value || '').trim() ? (
                      <Row className="row remark">
                        <Col span={4} className="colKey">
                          {props.customField.name || '自定义字段'}：
                        </Col>
                        <Col span={18} className="colValue">
                          {String(currentInterface.custom_field_value || '')}
                        </Col>
                      </Row>
                    ) : null}
                  </div>

                  {currentInterface.desc ? (
                    <>
                      <h2 className="interface-title">备注</h2>
                        <div
                          className="legacy-view-remark"
                          dangerouslySetInnerHTML={{ __html: String(currentInterface.desc || '') }}
                        />
                      </>
                    ) : null}

                    {(reqParamsRows.length > 0 ||
                      reqHeadersRows.length > 0 ||
                      reqQueryRows.length > 0 ||
                      reqBodyFormRows.length > 0 ||
                      currentInterface.req_body_other) ? (
                    <>
                      <h2 className="interface-title">请求参数</h2>
                        {reqParamsRows.length > 0 ? (
                          <div className="legacy-view-block">
                            <h3 className="legacy-view-subtitle">路径参数</h3>
                            <Table
                              bordered
                              size="small"
                              rowKey="key"
                              pagination={false}
                              columns={paramColumns}
                              dataSource={reqParamsRows}
                            />
                          </div>
                        ) : null}
                        {reqHeadersRows.length > 0 ? (
                          <div className="legacy-view-block">
                            <h3 className="legacy-view-subtitle">Headers</h3>
                            <Table
                              bordered
                              size="small"
                              rowKey="key"
                              pagination={false}
                              columns={paramColumns}
                              dataSource={reqHeadersRows}
                            />
                          </div>
                        ) : null}
                        {reqQueryRows.length > 0 ? (
                          <div className="legacy-view-block">
                            <h3 className="legacy-view-subtitle">Query</h3>
                            <Table
                              bordered
                              size="small"
                              rowKey="key"
                              pagination={false}
                              columns={paramColumns}
                              dataSource={reqQueryRows}
                            />
                          </div>
                        ) : null}
                        {reqBodyFormRows.length > 0 ? (
                          <div className="legacy-view-block">
                            <h3 className="legacy-view-subtitle">Body(form)</h3>
                            <Table
                              bordered
                              size="small"
                              rowKey="key"
                              pagination={false}
                              columns={bodyParamColumns}
                              dataSource={reqBodyFormRows}
                            />
                          </div>
                        ) : null}
                        {currentInterface.req_body_other ? (
                          <div className="legacy-view-block">
                            <h3 className="legacy-view-subtitle">Body({currentInterface.req_body_type || 'raw'})</h3>
                            {schemaRowsRequest.length > 0 ? (
                              <Table
                                bordered
                                size="small"
                                rowKey="key"
                                pagination={false}
                                columns={schemaColumns}
                                dataSource={schemaRowsRequest}
                              />
                            ) : (
                              <Input.TextArea
                                rows={8}
                                value={String(currentInterface.req_body_other || '')}
                                readOnly
                              />
                            )}
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {currentInterface.res_body ? (
                    <>
                      <h2 className="interface-title">返回数据</h2>
                        <div className="legacy-view-block">
                          {schemaRowsResponse.length > 0 ? (
                            <Table
                              bordered
                              size="small"
                              rowKey="key"
                              pagination={false}
                              columns={schemaColumns}
                              dataSource={schemaRowsResponse}
                            />
                          ) : (
                            <Input.TextArea rows={12} value={String(currentInterface.res_body || '')} readOnly />
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                )
              };
            }
            if (key === 'edit') {
              return {
                key,
                label: tabItem.name,
                children: (
                <div className="interface-edit">
                {editConflictState.status === 'loading' ? (
                  <Card loading />
                ) : editConflictState.status === 'locked' ? (
                  <Alert
                    type="warning"
                    showIcon
                    message={
                      <span>
                        <Link to={`/user/profile/${editConflictState.uid}`}>
                          <b>{editConflictState.username}</b>
                        </Link>
                        <span> 正在编辑该接口，请稍后再试...</span>
                      </span>
                    }
                  />
                ) : (
                  <>
                {editConflictState.status === 'error' ? (
                  <Alert
                    style={{ marginBottom: 16 }}
                    type="warning"
                    showIcon
                    message="WebSocket 连接失败，暂时无法进行多人编辑冲突检测。"
                  />
                ) : null}
                <Form<EditForm> form={form} layout="vertical">
                  <h2 className="interface-title" style={{ marginTop: 0 }}>基本设置</h2>
                  <div className="panel-sub">
                      <Form.Item
                        label="接口名称"
                        name="title"
                        rules={[{ required: true, validator: legacyNameValidator('接口') }]}
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item label="选择分类" name="catid" rules={[{ required: true, message: '请选择分类' }]}>
                        <Select
                          options={catRows.map(item => ({
                            label: item.name,
                            value: Number(item._id || 0)
                          }))}
                        />
                      </Form.Item>
                      <Form.Item
                        label={
                          <span>
                            接口路径&nbsp;
                            <Tooltip
                              title={
                                <div>
                                  <p>1. 支持动态路由，例如: /api/user/{'{id}'}</p>
                                  <p>2. 支持 ?controller=xxx 的 QueryRouter，普通 Query 参数请配置在 Query 区</p>
                                </div>
                              }
                            >
                              <span style={{ color: '#8a94a6', cursor: 'pointer' }}>?</span>
                            </Tooltip>
                          </span>
                        }
                        required
                      >
                        <Space.Compact style={{ width: '100%' }}>
                          <Form.Item name="method" noStyle>
                            <Select
                              style={{ width: 140 }}
                              options={RUN_METHODS.map(item => ({ label: item, value: item }))}
                              onChange={(nextMethod: string) => {
                                if (!supportsRequestBody(nextMethod) && reqRadioType === 'req-body') {
                                  setReqRadioType('req-query');
                                }
                              }}
                            />
                          </Form.Item>
                          <Tooltip title="接口基本路径，可在项目设置里修改">
                            <Input disabled value={props.basepath || ''} style={{ width: 220 }} />
                          </Tooltip>
                          <Form.Item
                            name="path"
                            noStyle
                            rules={[{ required: true, message: '请输入接口路径' }]}
                          >
                            <Input
                              placeholder="/api/user/{id}"
                              onBlur={event => {
                                form.setFieldValue('path', normalizePathInput(event.target.value));
                              }}
                            />
                          </Form.Item>
                        </Space.Compact>
                      </Form.Item>
                      <Form.List name="req_params">
                        {(fields) => (
                          <Space direction="vertical" style={{ width: '100%' }}>
                            {fields.length > 0 ? <Text strong>路径参数</Text> : null}
                            {fields.map(field => (
                              <Space key={field.key} align="start" wrap style={{ width: '100%' }}>
                                <Form.Item
                                  label={field.name === 0 ? '参数名' : ''}
                                  name={[field.name, 'name']}
                                  style={{ width: 220 }}
                                >
                                  <Input disabled />
                                </Form.Item>
                                <Form.Item
                                  label={field.name === 0 ? '示例' : ''}
                                  name={[field.name, 'example']}
                                  style={{ minWidth: 220, flex: 1 }}
                                >
                                  <Input />
                                </Form.Item>
                                <Form.Item
                                  label={field.name === 0 ? '备注' : ''}
                                  name={[field.name, 'desc']}
                                  style={{ minWidth: 260, flex: 1 }}
                                >
                                  <Input />
                                </Form.Item>
                              </Space>
                            ))}
                          </Space>
                        )}
                      </Form.List>
                      <Space wrap style={{ width: '100%' }}>
                        <Form.Item label="状态" name="status" style={{ minWidth: 140 }}>
                          <Select
                            options={[
                              { label: '已完成', value: 'done' },
                              { label: '未完成', value: 'undone' }
                            ]}
                          />
                        </Form.Item>
                      </Space>
                      <Form.Item label="Tag" name="tag">
                        <Select
                          mode="multiple"
                          placeholder="请选择 Tag"
                          options={projectTagOptions}
                          popupRender={menu => (
                            <div>
                              {menu}
                              <div style={{ padding: '8px 12px' }}>
                                <Button
                                  type="link"
                                  size="small"
                                  onClick={() => {
                                    setTagSettingInput((props.projectTag || []).map(item => String(item.name || '')).filter(Boolean).join('\n'));
                                    setTagSettingOpen(true);
                                  }}
                                >
                                  Tag 设置
                                </Button>
                              </div>
                            </div>
                          )}
                        />
                      </Form.Item>
                      {props.customField?.enable ? (
                        <Form.Item label={props.customField.name || '自定义字段'} name="custom_field_value">
                          <Input />
                        </Form.Item>
                      ) : null}
                    </div>

                  <h2 className="interface-title">请求参数设置</h2>
                  <div className="panel-sub">
                      <Radio.Group
                        value={reqRadioType}
                        onChange={event => setReqRadioType(event.target.value)}
                        style={{ marginBottom: 12 }}
                      >
                        {editBodySupported ? <Radio.Button value="req-body">Body</Radio.Button> : null}
                        <Radio.Button value="req-query">Query</Radio.Button>
                        <Radio.Button value="req-headers">Headers</Radio.Button>
                      </Radio.Group>

                      <div style={{ display: reqRadioType === 'req-query' ? 'block' : 'none' }}>
                        <Space style={{ marginBottom: 10 }}>
                          <Button
                            size="small"
                            type="primary"
                            onClick={() => {
                              const list = sanitizeReqQuery(form.getFieldValue('req_query'));
                              form.setFieldValue('req_query', [...list, { name: '', required: '1', desc: '', example: '' }]);
                            }}
                          >
                            添加Query参数
                          </Button>
                          <Button size="small" onClick={() => openBulkImport('req_query')}>
                            批量添加
                          </Button>
                        </Space>
                        <Form.List name="req_query">
                          {(fields, { remove }) => (
                            <Space direction="vertical" style={{ width: '100%' }}>
                              {fields.map(field => (
                                <Space key={field.key} align="start" wrap style={{ width: '100%' }}>
                                  <Form.Item
                                    label={field.name === 0 ? '参数名' : ''}
                                    name={[field.name, 'name']}
                                    style={{ width: 180 }}
                                  >
                                    <Input placeholder="name" />
                                  </Form.Item>
                                  <Form.Item
                                    label={field.name === 0 ? '必需' : ''}
                                    name={[field.name, 'required']}
                                    initialValue="1"
                                    style={{ width: 100 }}
                                  >
                                    <Select options={[{ label: '必需', value: '1' }, { label: '非必需', value: '0' }]} />
                                  </Form.Item>
                                  <Form.Item
                                    label={field.name === 0 ? '示例' : ''}
                                    name={[field.name, 'example']}
                                    style={{ minWidth: 180, flex: 1 }}
                                  >
                                    <Input />
                                  </Form.Item>
                                  <Form.Item
                                    label={field.name === 0 ? '备注' : ''}
                                    name={[field.name, 'desc']}
                                    style={{ minWidth: 220, flex: 1 }}
                                  >
                                    <Input />
                                  </Form.Item>
                                  <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                                </Space>
                              ))}
                            </Space>
                          )}
                        </Form.List>
                      </div>

                      <div style={{ display: reqRadioType === 'req-headers' ? 'block' : 'none' }}>
                        <Space style={{ marginBottom: 10 }}>
                          <Button
                            size="small"
                            type="primary"
                            onClick={() => {
                              const list = sanitizeReqHeaders(form.getFieldValue('req_headers'));
                              form.setFieldValue('req_headers', [...list, { name: '', value: '', required: '1', desc: '', example: '' }]);
                            }}
                          >
                            添加Header
                          </Button>
                        </Space>
                        <Form.List name="req_headers">
                          {(fields, { remove }) => (
                            <Space direction="vertical" style={{ width: '100%' }}>
                              {fields.map(field => (
                                <Space key={field.key} align="start" wrap style={{ width: '100%' }}>
                                  <Form.Item
                                    label={field.name === 0 ? '参数名' : ''}
                                    name={[field.name, 'name']}
                                    style={{ width: 180 }}
                                  >
                                    <AutoComplete
                                      options={HTTP_REQUEST_HEADER.map(item => ({ label: item, value: item }))}
                                      filterOption={(inputValue, option) =>
                                        String(option?.value || '')
                                          .toUpperCase()
                                          .includes(String(inputValue || '').toUpperCase())
                                      }
                                      placeholder="name"
                                    />
                                  </Form.Item>
                                  <Form.Item
                                    label={field.name === 0 ? '参数值' : ''}
                                    name={[field.name, 'value']}
                                    style={{ width: 200 }}
                                  >
                                    <Input placeholder="value" />
                                  </Form.Item>
                                  <Form.Item
                                    label={field.name === 0 ? '必需' : ''}
                                    name={[field.name, 'required']}
                                    initialValue="1"
                                    style={{ width: 100 }}
                                  >
                                    <Select options={[{ label: '必需', value: '1' }, { label: '非必需', value: '0' }]} />
                                  </Form.Item>
                                  <Form.Item
                                    label={field.name === 0 ? '示例' : ''}
                                    name={[field.name, 'example']}
                                    style={{ minWidth: 140, flex: 1 }}
                                  >
                                    <Input />
                                  </Form.Item>
                                  <Form.Item
                                    label={field.name === 0 ? '备注' : ''}
                                    name={[field.name, 'desc']}
                                    style={{ minWidth: 180, flex: 1 }}
                                  >
                                    <Input />
                                  </Form.Item>
                                  <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                                </Space>
                              ))}
                            </Space>
                          )}
                        </Form.List>
                      </div>

                      <div style={{ display: reqRadioType === 'req-body' ? 'block' : 'none' }}>
                        <Form.Item label="Body 类型" name="req_body_type">
                          <Radio.Group>
                            <Radio value="form">form</Radio>
                            <Radio value="json">json</Radio>
                            <Radio value="file">file</Radio>
                            <Radio value="raw">raw</Radio>
                          </Radio.Group>
                        </Form.Item>

                        {editBodyType === 'form' ? (
                          <>
                            <Space style={{ marginBottom: 10 }}>
                              <Button
                                size="small"
                                type="primary"
                                onClick={() => {
                                  const list = sanitizeReqBodyForm(form.getFieldValue('req_body_form'));
                                  form.setFieldValue('req_body_form', [
                                    ...list,
                                    { name: '', type: 'text', required: '1', desc: '', example: '' }
                                  ]);
                                }}
                              >
                                添加form参数
                              </Button>
                              <Button size="small" onClick={() => openBulkImport('req_body_form')}>
                                批量添加
                              </Button>
                            </Space>
                            <Form.List name="req_body_form">
                              {(fields, { remove }) => (
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  {fields.map(field => (
                                    <Space key={field.key} align="start" wrap style={{ width: '100%' }}>
                                      <Form.Item
                                        label={field.name === 0 ? '参数名' : ''}
                                        name={[field.name, 'name']}
                                        style={{ width: 180 }}
                                      >
                                        <Input />
                                      </Form.Item>
                                      <Form.Item
                                        label={field.name === 0 ? '类型' : ''}
                                        name={[field.name, 'type']}
                                        initialValue="text"
                                        style={{ width: 100 }}
                                      >
                                        <Select options={[{ label: 'text', value: 'text' }, { label: 'file', value: 'file' }]} />
                                      </Form.Item>
                                      <Form.Item
                                        label={field.name === 0 ? '必需' : ''}
                                        name={[field.name, 'required']}
                                        initialValue="1"
                                        style={{ width: 100 }}
                                      >
                                        <Select options={[{ label: '必需', value: '1' }, { label: '非必需', value: '0' }]} />
                                      </Form.Item>
                                      <Form.Item
                                        label={field.name === 0 ? '示例' : ''}
                                        name={[field.name, 'example']}
                                        style={{ minWidth: 160, flex: 1 }}
                                      >
                                        <Input />
                                      </Form.Item>
                                      <Form.Item
                                        label={field.name === 0 ? '备注' : ''}
                                        name={[field.name, 'desc']}
                                        style={{ minWidth: 180, flex: 1 }}
                                      >
                                        <Input />
                                      </Form.Item>
                                      <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                                    </Space>
                                  ))}
                                </Space>
                              )}
                            </Form.List>
                          </>
                        ) : editBodyType === 'json' ? (
                          <>
                            <Form.Item label="JSON-SCHEMA" name="req_body_is_json_schema" valuePropName="checked">
                              <Switch checkedChildren="开" unCheckedChildren="关" disabled={!props.projectIsJson5} />
                            </Form.Item>
                            {editValues.req_body_is_json_schema ? (
                              <>
                                <Space style={{ marginBottom: 12 }}>
                                  <Text strong>编辑模式</Text>
                                  <Radio.Group
                                    size="small"
                                    value={reqSchemaEditorMode}
                                    onChange={event => setReqSchemaEditorMode(event.target.value)}
                                  >
                                    <Radio.Button value="visual">可视化</Radio.Button>
                                    <Radio.Button value="text">文本</Radio.Button>
                                  </Radio.Group>
                                </Space>
                                      {reqSchemaEditorMode === 'visual' ? (
                                <>
                                  <Form.Item name="req_body_other" hidden>
                                    <Input.TextArea />
                                  </Form.Item>
                                  <LegacySchemaEditor
                                    value={String(watchedReqBodyOther || '')}
                                    onChange={next => form.setFieldValue('req_body_other', next)}
                                  />
                                </>
                                ) : (
                                  <Form.Item label="Body 内容" name="req_body_other">
                                    <Input.TextArea rows={12} placeholder='{"type":"object","properties":{}}' />
                                  </Form.Item>
                                )}
                              </>
                            ) : (
                              <>
                                <Alert
                                  type="info"
                                  showIcon
                                  style={{ marginBottom: 12 }}
                                  message="基于 Json5，参数描述信息可以使用注释方式编写。"
                                />
                                <Form.Item label="Body 内容" name="req_body_other">
                                  <Input.TextArea rows={10} placeholder='{"code":0}' />
                                </Form.Item>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            <Form.Item label="Body 内容" name="req_body_other">
                              <Input.TextArea rows={10} placeholder={editBodyType === 'file' ? 'file body' : 'raw body'} />
                            </Form.Item>
                          </>
                        )}
                      </div>
                    </div>

                  <h2 className="interface-title">返回数据设置</h2>
                  <div className="panel-sub">
                      <Form.Item label="返回类型" name="res_body_type">
                        <Radio.Group>
                          <Radio.Button value="json">JSON</Radio.Button>
                          <Radio.Button value="raw">RAW</Radio.Button>
                        </Radio.Group>
                      </Form.Item>
                      <Form.Item label="JSON-SCHEMA" name="res_body_is_json_schema" valuePropName="checked">
                        <Switch checkedChildren="json-schema" unCheckedChildren="json" disabled={!props.projectIsJson5} />
                      </Form.Item>
                      {String(editValues.res_body_type || 'json') === 'json' ? (
                        <Tabs
                          activeKey={resEditorTab}
                          onChange={handleResponseEditorTabChange}
                          items={[
                            {
                              key: 'tpl',
                              label: '模板',
                              children: (
                                <>
                                  {editValues.res_body_is_json_schema ? (
                                    <>
                                      <Space style={{ marginBottom: 12 }}>
                                        <Text strong>编辑模式</Text>
                                        <Radio.Group
                                          size="small"
                                          value={resSchemaEditorMode}
                                          onChange={event => setResSchemaEditorMode(event.target.value)}
                                        >
                                          <Radio.Button value="visual">可视化</Radio.Button>
                                          <Radio.Button value="text">文本</Radio.Button>
                                        </Radio.Group>
                                      </Space>
                                      {resSchemaEditorMode === 'visual' ? (
                                        <>
                                          <Form.Item name="res_body" hidden style={{ marginBottom: 0 }}>
                                            <Input.TextArea />
                                          </Form.Item>
                                          <LegacySchemaEditor
                                            value={String(watchedResBody || '')}
                                            onChange={next => form.setFieldValue('res_body', next)}
                                          />
                                        </>
                                      ) : (
                                        <Form.Item label="返回内容" name="res_body" style={{ marginBottom: 0 }}>
                                          <Input.TextArea rows={12} />
                                        </Form.Item>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <Alert
                                        type="info"
                                        showIcon
                                        style={{ marginBottom: 12 }}
                                        message="基于 mockjs 和 json5，参数描述信息可以使用注释方式编写。"
                                      />
                                      <Form.Item label="返回内容" name="res_body" style={{ marginBottom: 0 }}>
                                        <Input.TextArea rows={12} />
                                      </Form.Item>
                                    </>
                                  )}
                                </>
                              )
                            },
                            {
                              key: 'preview',
                              label: '预览',
                              children: (
                                <Input.TextArea
                                  rows={12}
                                  readOnly
                                  value={resPreviewText}
                                  placeholder="切换到预览时会自动生成 mock 预览"
                                />
                              )
                            }
                          ]}
                        />
                      ) : (
                        <Form.Item label="返回内容" name="res_body">
                          <Input.TextArea rows={12} />
                        </Form.Item>
                      )}
                    </div>

                  <h2 className="interface-title">备注</h2>
                  <div className="panel-sub">
                      <Form.Item label="描述" name="desc">
                        <Input.TextArea rows={6} />
                      </Form.Item>
                    </div>

                  <h2 className="interface-title">其他</h2>
                  <div className="panel-sub">
                      <Form.Item
                        label="消息通知"
                        name="switch_notice"
                        valuePropName="checked"
                        extra="开启消息通知，可在项目设置中统一修改"
                      >
                        <Switch checkedChildren="开" unCheckedChildren="关" />
                      </Form.Item>
                      <Form.Item
                        label="开放接口"
                        name="api_opened"
                        valuePropName="checked"
                        extra="开放接口可在导出时按公开状态筛选"
                      >
                        <Switch checkedChildren="开" unCheckedChildren="关" />
                      </Form.Item>
                    </div>

                    <div style={{ textAlign: 'center', marginTop: 16 }}>
                      <Button type="primary" onClick={() => void handleSave()} loading={updateState.isLoading}>
                        保存
                      </Button>
                    </div>
                </Form>
                  </>
                )}
                </div>
                )
              };
            }
            if (key === 'run') {
              return {
                key,
                label: tabItem.name,
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Space wrap>
                      <Select
                        value={runMethod}
                        onChange={setRunMethod}
                        style={{ width: 120 }}
                        options={RUN_METHODS.map(item => ({ label: item, value: item }))}
                      />
                      <Input value={runPath} onChange={event => setRunPath(event.target.value)} style={{ minWidth: 420 }} />
                      <Button type="primary" loading={runLoading} onClick={() => void handleRun()}>
                        发送请求
                      </Button>
                    </Space>
                    <Alert type="info" showIcon message="调试请求参数需使用 JSON 格式" />
                    <Text strong>Query</Text>
                    <Input.TextArea rows={4} value={runQuery} onChange={event => setRunQuery(event.target.value)} />
                    <Text strong>Headers</Text>
                    <Input.TextArea rows={4} value={runHeaders} onChange={event => setRunHeaders(event.target.value)} />
                    <Text strong>Body</Text>
                    <Input.TextArea rows={6} value={runBody} onChange={event => setRunBody(event.target.value)} />
                    <Text strong>响应</Text>
                    <Input.TextArea rows={10} value={runResponse} readOnly placeholder="点击“发送请求”后显示结果" />
                  </Space>
                )
              };
            }
            const CustomTab = tabItem.component;
            return {
              key,
              label: tabItem.name,
              children: CustomTab ? (
                <CustomTab
                  projectId={props.projectId}
                  interfaceData={currentInterface as unknown as Record<string, unknown>}
                />
              ) : (
                <LegacyErrMsg title="插件页未实现" desc="该插件页尚未在新前端实现。" />
              )
            };
          })}
        />
      </Card>
    );
  }

  function renderCollectionContent() {
    if (action === 'col') {
      if (selectedColId <= 0) {
        return <LegacyErrMsg title="请选择测试集合" desc="先在左侧选择一个测试集合。" />;
      }
      const currentCol = colRows.find(item => Number(item._id) === selectedColId);
      return (
        <Card>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div className="legacy-interface-list-toolbar">
              <Space direction="vertical" size={2}>
                <Text strong>{currentCol?.name || `测试集合 ${selectedColId}`}</Text>
                <Text type="secondary">{currentCol?.desc || '暂无描述'}</Text>
              </Space>
              {canEdit ? (
                <Space size={8}>
                  <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setAddCaseOpen(true)}>
                    添加用例
                  </Button>
                  <Button size="small" icon={<ImportOutlined />} onClick={() => openImportInterfaceModal(selectedColId)}>
                    导入接口
                  </Button>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openColModal('edit', currentCol)}>
                    编辑集合
                  </Button>
                  <Button size="small" onClick={() => openCommonSettingModal(currentCol as Record<string, unknown>)}>
                    通用规则配置
                  </Button>
                  <Button size="small" loading={autoTestRunning} onClick={() => void runAutoTestInPage()}>
                    开始测试
                  </Button>
                  <Button size="small" onClick={() => openAutoTest('html')}>
                    查看报告
                  </Button>
                  <Button size="small" onClick={() => openAutoTest('html', true)}>
                    下载报告
                  </Button>
                </Space>
              ) : null}
            </div>
            {caseEnvProjects.length > 0 ? (
              <div className="legacy-interface-list-toolbar" style={{ justifyContent: 'flex-start' }}>
                <Space size={12} wrap>
                  <Text strong>测试环境：</Text>
                  {caseEnvProjects.map(item => {
                    const projectId = Number(item._id || 0);
                    const options = (item.env || []).map(envItem => ({
                      label: String(envItem.name || ''),
                      value: String(envItem.name || '')
                    }));
                    return (
                      <Space key={`env-${projectId}`} size={6}>
                        <span>{item.name || `项目${projectId}`}</span>
                        <Select<string>
                          size="small"
                          style={{ width: 180 }}
                          allowClear
                          value={selectedRunEnvByProject[projectId] || undefined}
                          options={options}
                          onChange={value =>
                            setSelectedRunEnvByProject(prev => ({
                              ...prev,
                              [projectId]: value || ''
                            }))
                          }
                        />
                      </Space>
                    );
                  })}
                </Space>
              </div>
            ) : null}
            {autoTestReport ? (
              <Alert
                type="info"
                showIcon
                message={autoTestReport.message?.msg || '已生成测试报告'}
                description={
                  <Space size={12} wrap>
                    <span>总数: {Number(autoTestReport.message?.len || autoTestRows.length || 0)}</span>
                    <span>通过: {Number(autoTestReport.message?.successNum || 0)}</span>
                    <span>失败: {Number(autoTestReport.message?.failedNum || 0)}</span>
                    <span>耗时: {String(autoTestReport.runTime || '-')}</span>
                    <Button size="small" onClick={() => setAutoTestModalOpen(true)}>
                      查看详情
                    </Button>
                  </Space>
                }
              />
            ) : null}
            <Table
              rowKey={row => String(row._id || '')}
              loading={caseListQuery.isLoading}
              dataSource={caseRows}
              locale={{
                emptyText: <LegacyErrMsg type="noData" title="当前集合暂无测试用例" />
              }}
              pagination={false}
              columns={[
                {
                  title: '用例名称',
                  dataIndex: 'casename',
                  render: (value, row) => (
                    <button
                      type="button"
                      className="legacy-interface-menu-link-btn"
                      onClick={() => navigateWithGuard(`/project/${props.projectId}/interface/case/${row._id}`)}
                    >
                      {value || row._id}
                    </button>
                  )
                },
                {
                  title: '接口',
                  render: (_, row) => (
                    <Space>
                      <Tag>{row.method || '-'}</Tag>
                      <span>{row.path || row.title || '-'}</span>
                    </Space>
                  )
                },
                {
                  title: '更新时间',
                  dataIndex: 'up_time',
                  width: 180,
                  render: value => (value ? new Date(Number(value) * 1000).toLocaleString() : '-')
                },
                {
                  title: '状态',
                  width: 100,
                  render: (_, row) => {
                    const report = autoTestResultMap.get(String(row._id || ''));
                    if (!report) return <Tag>未测试</Tag>;
                    if (report.code === 0) return <Tag color="success">通过</Tag>;
                    if (report.code === 1) return <Tag color="warning">失败</Tag>;
                    return <Tag color="error">异常</Tag>;
                  }
                },
                {
                  title: '测试报告',
                  width: 110,
                  render: (_, row) => {
                    const report = autoTestResultMap.get(String(row._id || ''));
                    return report ? (
                      <Button
                        size="small"
                        onClick={() => {
                          setAutoTestDetailItem(report);
                          setAutoTestModalOpen(false);
                        }}
                      >
                        查看
                      </Button>
                    ) : (
                      '-'
                    );
                  }
                },
                {
                  title: '操作',
                  width: 180,
                  render: (_, row) =>
                    canEdit ? (
                      <Space size={4}>
                        <Button
                          size="small"
                          loading={autoTestRunning}
                          onClick={() => void runAutoTestInPage(String(row._id || ''))}
                        >
                          测试
                        </Button>
                        <Button size="small" icon={<CopyOutlined />} onClick={() => void handleCopyCase(String(row._id || ''))} />
                        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDeleteCase(String(row._id || ''))} />
                      </Space>
                    ) : (
                      '-'
                    )
                }
              ]}
            />
          </Space>
        </Card>
      );
    }

    if (!caseId) {
      return <LegacyErrMsg title="请选择测试用例" desc="先在左侧选择一个测试用例。" />;
    }

    if (caseDetailQuery.isLoading) {
      return <Card loading />;
    }

    const detail = (caseDetailQuery.data?.data || {}) as Record<string, unknown>;
    if (!detail || Object.keys(detail).length === 0) {
      return <LegacyErrMsg title="测试用例不存在" desc="该用例可能已被删除，请重新选择。" />;
    }

    return (
      <Card>
        <div className="legacy-interface-list-toolbar">
          <Text strong>{String(detail.casename || '测试用例')}</Text>
          {canEdit ? (
            <Space size={8}>
              <Button size="small" onClick={() => navigateWithGuard(`/project/${props.projectId}/interface/col/${selectedColId || ''}`)}>
                返回集合
              </Button>
              <Button size="small" icon={<CopyOutlined />} onClick={() => void handleCopyCase(caseId)}>
                克隆用例
              </Button>
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDeleteCase(caseId)}>
                删除用例
              </Button>
              <Button
                type="primary"
                size="small"
                loading={upColCaseState.isLoading}
                onClick={() => void handleSaveCase()}
              >
                保存用例
              </Button>
            </Space>
          ) : null}
        </div>
        <Form<CaseEditForm> form={caseForm} layout="vertical">
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="接口">
              <Space>
                <Tag>{String(detail.method || '-')}</Tag>
                <span>{String(detail.path || detail.title || '-')}</span>
              </Space>
            </Descriptions.Item>
          </Descriptions>

          <div style={{ marginTop: 12 }}>
            <Form.Item label="用例名称" name="casename" rules={[{ required: true, message: '请输入用例名称' }]}>
              <Input disabled={!canEdit} />
            </Form.Item>
            <Space style={{ width: '100%' }} align="start">
              <Form.Item label="环境" name="case_env" style={{ minWidth: 260, flex: 1 }}>
                <Input placeholder="如：dev / test / prod" disabled={!canEdit} />
              </Form.Item>
              <Form.Item label="启用脚本" name="enable_script" valuePropName="checked" style={{ width: 120 }}>
                <Switch disabled={!canEdit} checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
              <Form.Item label="Body 类型" name="req_body_type" style={{ width: 180 }}>
                <Select
                  disabled={!canEdit}
                  options={[
                    { label: 'form', value: 'form' },
                    { label: 'raw', value: 'raw' },
                    { label: 'json', value: 'json' }
                  ]}
                />
              </Form.Item>
            </Space>
            <Form.Item label="测试脚本" name="test_script">
              <Input.TextArea rows={6} disabled={!canEdit} />
            </Form.Item>
            <Form.Item label="req_params(JSON Array)" name="req_params_text">
              <Input.TextArea rows={6} disabled={!canEdit} />
            </Form.Item>
            <Form.Item label="req_headers(JSON Array)" name="req_headers_text">
              <Input.TextArea rows={6} disabled={!canEdit} />
            </Form.Item>
            <Form.Item label="req_query(JSON Array)" name="req_query_text">
              <Input.TextArea rows={6} disabled={!canEdit} />
            </Form.Item>
            <Form.Item label="req_body_form(JSON Array)" name="req_body_form_text">
              <Input.TextArea rows={6} disabled={!canEdit} />
            </Form.Item>
            <Form.Item label="req_body_other" name="req_body_other">
              <Input.TextArea rows={6} disabled={!canEdit} />
            </Form.Item>
          </div>
        </Form>
      </Card>
    );
  }

  return (
    <>
      <Layout className="legacy-project-interface-layout">
        <Sider width={300} theme="light">
          <Tabs
            type="card"
            className="legacy-interface-side-tabs"
            activeKey={action === 'api' ? 'api' : 'col'}
            onChange={key => {
              if (key === 'api') {
                navigateWithGuard(`/project/${props.projectId}/interface/api`);
              }
              if (key === 'col') {
                navigateWithGuard(`/project/${props.projectId}/interface/col`);
              }
            }}
            items={[
              { key: 'api', label: '接口列表' },
              { key: 'col', label: '测试集合' }
            ]}
          />
          {action === 'api' ? renderApiMenu() : renderCollectionMenu()}
        </Sider>
        <Layout>
          <Content className="legacy-project-interface-content">
            <div className="legacy-interface-right-pane">
              <div className="legacy-interface-content-card">
                {action === 'api' ? renderApiContent() : renderCollectionContent()}
              </div>
            </div>
          </Content>
        </Layout>
      </Layout>

      <Modal
        title="你即将离开编辑页面"
        open={confirmOpen}
        onCancel={() => {
          setConfirmOpen(false);
          setNextTab(null);
          setPendingPath(null);
        }}
        onOk={() => {
          if (nextTab) setTab(nextTab);
          if (pendingPath) {
            navigate(pendingPath);
          }
          setConfirmOpen(false);
          setNextTab(null);
          setPendingPath(null);
        }}
      >
        <p>离开页面会丢失当前编辑的内容，确定要离开吗？</p>
      </Modal>

      <Modal
        title="新增接口"
        open={addInterfaceOpen}
        onCancel={() => {
          setAddInterfaceOpen(false);
          addInterfaceForm.resetFields();
        }}
        onOk={() => {
          void addInterfaceForm.submit();
        }}
        confirmLoading={addInterfaceState.isLoading}
        okText="确认"
        cancelText="取消"
      >
        <Form<AddInterfaceForm>
          form={addInterfaceForm}
          layout="vertical"
          onFinish={values => void handleAddNewInterface(values)}
        >
          <Form.Item
            label="接口名称"
            name="title"
            rules={[{ required: true, validator: legacyNameValidator('接口') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="路径" name="path" rules={[{ required: true, message: '请输入接口路径' }]}>
            <Input placeholder="/api/example" />
          </Form.Item>
          <Form.Item label="Method" name="method" rules={[{ required: true, message: '请选择 Method' }]}>
            <Select options={RUN_METHODS.map(item => ({ label: item, value: item }))} />
          </Form.Item>
          <Form.Item label="分类" name="catid" rules={[{ required: true, message: '请选择分类' }]}>
            <Select
              options={catRows.map(item => ({
                label: item.name,
                value: Number(item._id || 0)
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Tag 设置"
        open={tagSettingOpen}
        onCancel={() => setTagSettingOpen(false)}
        onOk={() => void handleSaveProjectTag()}
        confirmLoading={updateProjectTagState.isLoading}
        okText="保存"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">每行一个 Tag 名称，保存后会更新当前项目 Tag 列表。</Text>
          <Input.TextArea
            rows={8}
            value={tagSettingInput}
            onChange={event => setTagSettingInput(event.target.value)}
            placeholder={'example-tag\nbeta\ninternal'}
          />
        </Space>
      </Modal>

      <Modal
        title="批量添加参数"
        open={bulkOpen}
        onCancel={() => {
          setBulkOpen(false);
          setBulkFieldName(null);
          setBulkValue('');
        }}
        onOk={applyBulkImport}
        okText="导入"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">每行一个 `name:example`，例如 `id:1`。</Text>
          <Input.TextArea
            rows={10}
            value={bulkValue}
            onChange={event => setBulkValue(event.target.value)}
            placeholder="name:example"
          />
        </Space>
      </Modal>

      <Modal
        title="新增分类"
        open={addCatOpen}
        onCancel={() => {
          setAddCatOpen(false);
          addCatForm.resetFields();
        }}
        onOk={() => {
          void addCatForm.submit();
        }}
        confirmLoading={addInterfaceCatState.isLoading}
        okText="确认"
        cancelText="取消"
      >
        <Form<AddCatForm> form={addCatForm} layout="vertical" onFinish={values => void handleAddNewCat(values)}>
          <Form.Item label="分类名称" name="name" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="desc">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑分类"
        open={editCatOpen}
        onCancel={() => {
          setEditCatOpen(false);
          setEditingCat(null);
          editCatForm.resetFields();
        }}
        onOk={() => {
          void editCatForm.submit();
        }}
        confirmLoading={updateInterfaceCatState.isLoading}
        okText="确认"
        cancelText="取消"
      >
        <Form<EditCatForm>
          form={editCatForm}
          layout="vertical"
          onFinish={values => void handleUpdateCat(values)}
        >
          <Form.Item label="分类名称" name="name" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="desc">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={colModalType === 'add' ? '添加测试集合' : '编辑测试集合'}
        open={colModalOpen}
        onCancel={() => {
          setColModalOpen(false);
          setEditingCol(null);
          colForm.resetFields();
        }}
        onOk={() => {
          void colForm.submit();
        }}
        confirmLoading={addColState.isLoading || updateColState.isLoading}
        okText="确认"
        cancelText="取消"
      >
        <Form<ColForm> form={colForm} layout="vertical" onFinish={values => void handleSubmitCol(values)}>
          <Form.Item label="集合名" name="name" rules={[{ required: true, message: '请输入集合命名！' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="简介" name="desc">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="导入接口到集合"
        open={importModalOpen}
        width={900}
        onCancel={() => {
          setImportModalOpen(false);
          setImportSelectedRowKeys([]);
        }}
        onOk={() => {
          void handleImportInterfaces();
        }}
        okText="确认"
        cancelText="取消"
        confirmLoading={addColCaseListState.isLoading}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space>
            <Text>选择要导入的项目：</Text>
            <Select<number>
              value={importProjectId > 0 ? importProjectId : props.projectId}
              style={{ width: 260 }}
              options={importProjectOptions}
              onChange={value => {
                setImportProjectId(value);
                setImportSelectedRowKeys([]);
              }}
            />
          </Space>
          <Alert
            type="info"
            showIcon
            message={`已选择 ${selectedImportInterfaceIds.length} 个接口`}
          />
          <Table<ImportInterfaceRow>
            rowKey="key"
            size="small"
            pagination={false}
            loading={importMenuQuery.isLoading || importMenuQuery.isFetching || projectListQuery.isFetching}
            dataSource={importTableRows}
            defaultExpandAllRows
            rowSelection={{
              selectedRowKeys: importSelectedRowKeys,
              checkStrictly: false,
              onChange: selectedKeys => {
                setImportSelectedRowKeys(selectedKeys as Array<string | number>);
              }
            }}
            columns={[
              {
                title: '接口名称',
                dataIndex: 'title',
                render: (value: string, row) =>
                  row.isCategory ? <Text strong>{value}</Text> : <span>{value}</span>
              },
              {
                title: '接口路径',
                dataIndex: 'path',
                render: value => (value || '-')
              },
              {
                title: '请求方法',
                dataIndex: 'method',
                width: 120,
                render: (value: string, row) =>
                  row.isCategory ? '-' : (
                    <span className="legacy-method-pill" style={methodStyle(value || 'GET')}>
                      {value || 'GET'}
                    </span>
                  )
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 120,
                render: (value: string, row) => {
                  if (row.isCategory) return '-';
                  return value === 'done' ? (
                    <span className="legacy-status-tag done">已完成</span>
                  ) : (
                    <span className="legacy-status-tag undone">未完成</span>
                  );
                }
              }
            ]}
          />
        </Space>
      </Modal>

      <Modal
        title="添加测试用例"
        open={addCaseOpen}
        onCancel={() => {
          setAddCaseOpen(false);
          addCaseForm.resetFields();
        }}
        onOk={() => {
          void addCaseForm.submit();
        }}
        okText="确认"
        cancelText="取消"
        confirmLoading={addColCaseState.isLoading}
      >
        <Form<AddCaseForm> form={addCaseForm} layout="vertical" onFinish={values => void handleAddCase(values)}>
          <Form.Item label="接口" name="interface_id" rules={[{ required: true, message: '请选择接口' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={caseInterfaceOptions}
            />
          </Form.Item>
          <Form.Item label="用例名称" name="casename" rules={[{ required: true, message: '请输入用例名称' }]}>
            <Input placeholder="例如：登录成功用例" />
          </Form.Item>
          <Form.Item label="测试环境" name="case_env">
            <Input placeholder="例如：dev" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="通用规则配置"
        open={commonSettingOpen}
        width={900}
        onCancel={() => setCommonSettingOpen(false)}
        onOk={() => {
          void handleSaveCommonSetting();
        }}
        okText="保存"
        cancelText="取消"
        confirmLoading={updateColState.isLoading}
      >
        <Form<CommonSettingForm> form={commonSettingForm} layout="vertical">
          <Form.Item
            label="检查 Http Code = 200"
            name="checkHttpCodeIs200"
            valuePropName="checked"
            tooltip="启用后，非 200 状态码将直接判定失败"
          >
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>
          <Form.Item
            label="检查返回 JSON 字段"
            tooltip="例如检查 code 是否等于 0"
            style={{ marginBottom: 8 }}
          >
            <Space wrap>
              <Form.Item name="checkResponseFieldEnable" valuePropName="checked" noStyle>
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
              <Form.Item name="checkResponseFieldName" noStyle>
                <Input style={{ width: 180 }} placeholder="字段名，如 code" />
              </Form.Item>
              <Form.Item name="checkResponseFieldValue" noStyle>
                <Input style={{ width: 180 }} placeholder="期望值，如 0" />
              </Form.Item>
            </Space>
          </Form.Item>
          <Form.Item
            label="检查返回数据结构(response schema)"
            name="checkResponseSchema"
            valuePropName="checked"
            tooltip="仅在接口 response 定义为 JSON Schema 时生效"
          >
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>
          <Form.Item
            label="全局测试脚本"
            tooltip="启用后每个 case 会先执行全局脚本，再执行 case 脚本"
            style={{ marginBottom: 8 }}
          >
            <Space wrap style={{ marginBottom: 8 }}>
              <Form.Item name="checkScriptEnable" valuePropName="checked" noStyle>
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
              <span>启用脚本</span>
            </Space>
            <Form.Item name="checkScriptContent" noStyle>
              <Input.TextArea rows={10} placeholder="输入全局测试脚本" />
            </Form.Item>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="服务端测试结果"
        open={autoTestModalOpen}
        width={1080}
        footer={[
          <Button key="close" onClick={() => setAutoTestModalOpen(false)}>
            关闭
          </Button>
        ]}
        onCancel={() => setAutoTestModalOpen(false)}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Alert
            type="info"
            showIcon
            message={autoTestReport?.message?.msg || '暂无测试结果'}
            description={
              <Space size={12} wrap>
                <span>总数: {Number(autoTestReport?.message?.len || autoTestRows.length || 0)}</span>
                <span>通过: {Number(autoTestReport?.message?.successNum || 0)}</span>
                <span>失败: {Number(autoTestReport?.message?.failedNum || 0)}</span>
                <span>耗时: {String(autoTestReport?.runTime || '-')}</span>
              </Space>
            }
          />
          <Table<AutoTestResultItem>
            rowKey={row => String(row.id || `${row.method || 'GET'}:${row.path || ''}`)}
            size="small"
            pagination={{ pageSize: 10 }}
            dataSource={autoTestRows}
            columns={[
              {
                title: '用例',
                width: 240,
                render: (_, row) => <span>{row.name || row.id}</span>
              },
              {
                title: '接口',
                render: (_, row) => (
                  <Space size={8}>
                    <span className="legacy-method-pill" style={methodStyle(row.method || 'GET')}>
                      {String(row.method || 'GET').toUpperCase()}
                    </span>
                    <span>{row.path || '-'}</span>
                  </Space>
                )
              },
              {
                title: 'HTTP',
                width: 90,
                render: (_, row) => (row.status == null ? '-' : String(row.status))
              },
              {
                title: '结果',
                width: 90,
                render: (_, row) =>
                  row.code === 0 ? (
                    <Tag color="success">通过</Tag>
                  ) : (
                    <Tag color={row.code === 1 ? 'warning' : 'error'}>
                      {row.code === 1 ? '失败' : '异常'}
                    </Tag>
                  )
              },
              {
                title: '信息',
                render: (_, row) => (
                  <span>
                    {(row.validRes || [])
                      .map(item => String(item?.message || ''))
                      .filter(Boolean)
                      .join(' | ') || row.statusText || '-'}
                  </span>
                )
              },
              {
                title: '操作',
                width: 90,
                render: (_, row) => (
                  <Button size="small" onClick={() => setAutoTestDetailItem(row)}>
                    详情
                  </Button>
                )
              }
            ]}
          />
        </Space>
      </Modal>

      <Modal
        title={`测试详情 ${autoTestDetailItem?.name || ''}`}
        open={!!autoTestDetailItem}
        width={980}
        onCancel={() => setAutoTestDetailItem(null)}
        footer={[
          <Button key="close" onClick={() => setAutoTestDetailItem(null)}>
            关闭
          </Button>
        ]}
      >
        {autoTestDetailItem ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="用例ID">{autoTestDetailItem.id || '-'}</Descriptions.Item>
              <Descriptions.Item label="接口地址">{autoTestDetailItem.url || autoTestDetailItem.path || '-'}</Descriptions.Item>
              <Descriptions.Item label="方法">{String(autoTestDetailItem.method || '-')}</Descriptions.Item>
              <Descriptions.Item label="HTTP 状态">{autoTestDetailItem.status == null ? '-' : String(autoTestDetailItem.status)}</Descriptions.Item>
              <Descriptions.Item label="执行结果">
                {autoTestDetailItem.code === 0 ? '通过' : autoTestDetailItem.code === 1 ? '失败' : '异常'}
              </Descriptions.Item>
            </Descriptions>
            <Text strong>校验信息</Text>
            <Input.TextArea
              rows={5}
              readOnly
              value={(autoTestDetailItem.validRes || []).map(item => item?.message || '').join('\n') || '-'}
            />
            <Text strong>请求参数</Text>
            <Input.TextArea rows={6} readOnly value={stringifyPretty(autoTestDetailItem.params)} />
            <Text strong>响应头</Text>
            <Input.TextArea rows={6} readOnly value={stringifyPretty(autoTestDetailItem.res_header)} />
            <Text strong>响应体</Text>
            <Input.TextArea rows={10} readOnly value={stringifyPretty(autoTestDetailItem.res_body)} />
          </Space>
        ) : null}
      </Modal>
    </>
  );
}

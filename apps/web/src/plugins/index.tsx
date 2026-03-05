import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { createSlice } from '@reduxjs/toolkit';
import type { AnyAction, Reducer } from '@reduxjs/toolkit';
import json5 from 'json5';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useParams } from 'react-router-dom';
import type { LegacyRouteContract } from '../types/legacy-contract';

const { Text, Paragraph } = Typography;
const DRAFT4_SCHEMA_URI = 'http://json-schema.org/draft-04/schema#';

export type HeaderMenuItem = {
  path: string;
  name: string;
  icon?: string;
  adminFlag?: boolean;
};

export type SubNavItem = {
  name: string;
  path: string;
  component?: ComponentType;
};

export type SubSettingNavItem = {
  name: string;
  component: ComponentType<{ projectId: number }>;
};

export type InterfaceTabItem = {
  name: string;
  component?: ComponentType<{ projectId: number; interfaceData: Record<string, unknown> }>;
};

export type ImportDataItem = {
  name: string;
  desc?: string;
  route?: string;
  run?: (content: string) => unknown | Promise<unknown>;
};

export type ExportDataItem = {
  name: string;
  route: string;
  desc?: string;
};

export type RequestLifecycleMeta = {
  type: 'inter' | 'case' | 'col';
  projectId: number;
  interfaceId: number;
  caseId?: string;
};

type RequestLifecyclePayload = Record<string, unknown>;
type RequestLifecycleHook = (
  payload: RequestLifecyclePayload,
  meta: RequestLifecycleMeta
) => void | RequestLifecyclePayload | Promise<void | RequestLifecyclePayload>;

type PluginContext = {
  projectId?: number;
  interfaceData?: Record<string, unknown>;
};

type MapExtender<T> = (target: T, context?: PluginContext) => void;

type ImportDataFactory = (context?: PluginContext) => ImportDataItem | null | undefined;
type ExportDataFactory = (context?: PluginContext) => ExportDataItem | null | undefined;

type PluginHooks = {
  appRouteExtenders: Array<{ pluginId: string; fn: MapExtender<Record<string, LegacyRouteContract>> }>;
  headerMenuExtenders: Array<{ pluginId: string; fn: MapExtender<Record<string, HeaderMenuItem>> }>;
  subNavExtenders: Array<{ pluginId: string; fn: MapExtender<Record<string, SubNavItem>> }>;
  subSettingExtenders: Array<{ pluginId: string; fn: MapExtender<Record<string, SubSettingNavItem>> }>;
  interfaceTabExtenders: Array<{ pluginId: string; fn: MapExtender<Record<string, InterfaceTabItem>> }>;
  beforeRequestHooks: Array<{ pluginId: string; fn: RequestLifecycleHook }>;
  afterRequestHooks: Array<{ pluginId: string; fn: RequestLifecycleHook }>;
  beforeColRequestHooks: Array<{ pluginId: string; fn: RequestLifecycleHook }>;
  afterColRequestHooks: Array<{ pluginId: string; fn: RequestLifecycleHook }>;
};

type PluginRegistryApi = {
  registerThirdLogin(component: ComponentType): void;
  extendAppRoutes(extender: MapExtender<Record<string, LegacyRouteContract>>): void;
  extendHeaderMenu(extender: MapExtender<Record<string, HeaderMenuItem>>): void;
  extendSubNav(extender: MapExtender<Record<string, SubNavItem>>): void;
  extendSubSettingNav(extender: MapExtender<Record<string, SubSettingNavItem>>): void;
  extendInterfaceTabs(extender: MapExtender<Record<string, InterfaceTabItem>>): void;
  registerImporter(key: string, factory: ImportDataFactory): void;
  registerExporter(key: string, factory: ExportDataFactory): void;
  registerReducer(key: string, reducer: Reducer<any, AnyAction>): void;
  onBeforeRequest(hook: RequestLifecycleHook): void;
  onAfterRequest(hook: RequestLifecycleHook): void;
  onBeforeCollectionRequest(hook: RequestLifecycleHook): void;
  onAfterCollectionRequest(hook: RequestLifecycleHook): void;
};

type ModernWebPlugin = {
  id: string;
  setup(api: PluginRegistryApi): void;
};

function safeExecute(pluginId: string, label: string, fn: () => void) {
  try {
    fn();
  } catch (error) {
    // Keep plugin failures isolated from core pages.
    // eslint-disable-next-line no-console
    console.error(`[plugin:${pluginId}] ${label} failed`, error);
  }
}

function normalizePath(value: string): string {
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

function parseJsonSafe<T = unknown>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch (_err) {
    return fallback;
  }
}

function parseMaybeJson(text: string): unknown {
  const raw = String(text || '').trim();
  if (!raw) return '';
  try {
    return json5.parse(raw);
  } catch (_err) {
    return raw;
  }
}

function isValidRouteContract(route: LegacyRouteContract | undefined): route is LegacyRouteContract {
  if (!route) return false;
  if (typeof route.path !== 'string' || !route.path.startsWith('/')) return false;
  if (typeof route.component !== 'function') return false;
  if (route.protected !== undefined && typeof route.protected !== 'boolean') return false;
  return true;
}

function toObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function inferPrimitiveSchema(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  if (typeof value === 'string') return { type: 'string' };
  return { type: 'string' };
}

function mergeInferredSchemas(schemas: Record<string, unknown>[]): Record<string, unknown> {
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

function inferSchemaFromSample(value: unknown): Record<string, unknown> {
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

function inferDraft4SchemaTextFromJsonText(input: string, requireObjectOrArray = true): string | null {
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

function toStringValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return '';
  }
}

function postJson<T>(url: string, payload: Record<string, unknown>) {
  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }).then(res => res.json() as Promise<{ errcode: number; errmsg: string; data: T }>);
}

function getJson<T>(url: string) {
  return fetch(url, {
    method: 'GET',
    credentials: 'include'
  }).then(res => res.json() as Promise<{ errcode: number; errmsg: string; data: T }>);
}

class WebPluginRuntime {
  private thirdLogin: ComponentType | null = null;

  private hooks: PluginHooks = {
    appRouteExtenders: [],
    headerMenuExtenders: [],
    subNavExtenders: [],
    subSettingExtenders: [],
    interfaceTabExtenders: [],
    beforeRequestHooks: [],
    afterRequestHooks: [],
    beforeColRequestHooks: [],
    afterColRequestHooks: []
  };

  private importFactories = new Map<string, { pluginId: string; fn: ImportDataFactory }>();

  private exportFactories = new Map<string, { pluginId: string; fn: ExportDataFactory }>();

  private reducers: Record<string, Reducer<any, AnyAction>> = {};

  use(plugin: ModernWebPlugin) {
    const registerApi: PluginRegistryApi = {
      registerThirdLogin: component => {
        this.thirdLogin = component;
      },
      extendAppRoutes: extender => {
        this.hooks.appRouteExtenders.push({ pluginId: plugin.id, fn: extender });
      },
      extendHeaderMenu: extender => {
        this.hooks.headerMenuExtenders.push({ pluginId: plugin.id, fn: extender });
      },
      extendSubNav: extender => {
        this.hooks.subNavExtenders.push({ pluginId: plugin.id, fn: extender });
      },
      extendSubSettingNav: extender => {
        this.hooks.subSettingExtenders.push({ pluginId: plugin.id, fn: extender });
      },
      extendInterfaceTabs: extender => {
        this.hooks.interfaceTabExtenders.push({ pluginId: plugin.id, fn: extender });
      },
      registerImporter: (key, factory) => {
        if (!key) return;
        this.importFactories.set(key, { pluginId: plugin.id, fn: factory });
      },
      registerExporter: (key, factory) => {
        if (!key) return;
        this.exportFactories.set(key, { pluginId: plugin.id, fn: factory });
      },
      registerReducer: (key, reducer) => {
        if (!key || typeof reducer !== 'function') return;
        const namespacedKey = key.includes('/') ? key : `${plugin.id}/${key}`;
        if (this.reducers[namespacedKey]) {
          // eslint-disable-next-line no-console
          console.error(`[plugin:${plugin.id}] reducer key already registered: ${namespacedKey}`);
          return;
        }
        this.reducers[namespacedKey] = reducer;
      },
      onBeforeRequest: hook => {
        this.hooks.beforeRequestHooks.push({ pluginId: plugin.id, fn: hook });
      },
      onAfterRequest: hook => {
        this.hooks.afterRequestHooks.push({ pluginId: plugin.id, fn: hook });
      },
      onBeforeCollectionRequest: hook => {
        this.hooks.beforeColRequestHooks.push({ pluginId: plugin.id, fn: hook });
      },
      onAfterCollectionRequest: hook => {
        this.hooks.afterColRequestHooks.push({ pluginId: plugin.id, fn: hook });
      }
    };

    safeExecute(plugin.id, 'setup', () => plugin.setup(registerApi));
  }

  getThirdLoginComponent(): ComponentType | null {
    return this.thirdLogin;
  }

  applyAppRoutes(routes: Record<string, LegacyRouteContract>, context?: PluginContext) {
    this.hooks.appRouteExtenders.forEach(item => {
      safeExecute(item.pluginId, 'extendAppRoutes', () => item.fn(routes, context));
      Object.keys(routes).forEach(routeKey => {
        const route = routes[routeKey];
        if (isValidRouteContract(route)) return;
        delete routes[routeKey];
        // eslint-disable-next-line no-console
        console.error(`[plugin:${item.pluginId}] invalid app route dropped: ${routeKey}`);
      });
    });
  }

  applyHeaderMenu(menu: Record<string, HeaderMenuItem>, context?: PluginContext) {
    this.hooks.headerMenuExtenders.forEach(item => {
      safeExecute(item.pluginId, 'extendHeaderMenu', () => item.fn(menu, context));
    });
  }

  applySubNav(nav: Record<string, SubNavItem>, context?: PluginContext) {
    this.hooks.subNavExtenders.forEach(item => {
      safeExecute(item.pluginId, 'extendSubNav', () => item.fn(nav, context));
    });
  }

  applySubSettingNav(tabs: Record<string, SubSettingNavItem>, context?: PluginContext) {
    this.hooks.subSettingExtenders.forEach(item => {
      safeExecute(item.pluginId, 'extendSubSettingNav', () => item.fn(tabs, context));
    });
  }

  applyInterfaceTabs(tabs: Record<string, InterfaceTabItem>, context?: PluginContext) {
    this.hooks.interfaceTabExtenders.forEach(item => {
      safeExecute(item.pluginId, 'extendInterfaceTabs', () => item.fn(tabs, context));
    });
  }

  collectImportDataModules(context?: PluginContext): Record<string, ImportDataItem> {
    const output: Record<string, ImportDataItem> = {};
    this.importFactories.forEach((entry, key) => {
      safeExecute(entry.pluginId, `importer:${key}`, () => {
        const result = entry.fn(context);
        if (!result) return;
        output[key] = result;
      });
    });
    return output;
  }

  collectExportDataModules(context?: PluginContext): Record<string, ExportDataItem> {
    const output: Record<string, ExportDataItem> = {};
    this.exportFactories.forEach((entry, key) => {
      safeExecute(entry.pluginId, `exporter:${key}`, () => {
        const result = entry.fn(context);
        if (!result) return;
        output[key] = result;
      });
    });
    return output;
  }

  getDynamicReducers() {
    return { ...this.reducers };
  }

  async runBeforeRequest(
    payload: RequestLifecyclePayload,
    meta: RequestLifecycleMeta
  ): Promise<RequestLifecyclePayload> {
    return this.runRequestHooks(this.hooks.beforeRequestHooks, payload, meta);
  }

  async runAfterRequest(
    payload: RequestLifecyclePayload,
    meta: RequestLifecycleMeta
  ): Promise<RequestLifecyclePayload> {
    return this.runRequestHooks(this.hooks.afterRequestHooks, payload, meta);
  }

  async runBeforeCollectionRequest(
    payload: RequestLifecyclePayload,
    meta: RequestLifecycleMeta
  ): Promise<RequestLifecyclePayload> {
    return this.runRequestHooks(this.hooks.beforeColRequestHooks, payload, meta);
  }

  async runAfterCollectionRequest(
    payload: RequestLifecyclePayload,
    meta: RequestLifecycleMeta
  ): Promise<RequestLifecyclePayload> {
    return this.runRequestHooks(this.hooks.afterColRequestHooks, payload, meta);
  }

  private async runRequestHooks(
    hookList: Array<{ pluginId: string; fn: RequestLifecycleHook }>,
    payload: RequestLifecyclePayload,
    meta: RequestLifecycleMeta
  ): Promise<RequestLifecyclePayload> {
    let current = { ...payload };
    for (const item of hookList) {
      try {
        const next = await item.fn(current, meta);
        if (next && typeof next === 'object') {
          current = next;
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[plugin:${item.pluginId}] request hook failed`, error);
      }
    }
    return current;
  }
}

type StatisticsCount = {
  groupCount: number;
  projectCount: number;
  interfaceCount: number;
  interfaceCaseCount: number;
};

type StatisticsSystemStatus = {
  mail?: string;
  systemName?: string;
  totalmem?: string;
  freemem?: string;
  uptime?: string;
  load?: string;
};

type StatisticsMockData = {
  mockCount?: number;
  mockDateList?: Array<{ _id?: string; count?: number }>;
};

type StatisticsGroupRow = {
  name?: string;
  interface?: number;
  mock?: number;
  project?: number;
};

function StatisticsPluginPage() {
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState<StatisticsCount | null>(null);
  const [systemStatus, setSystemStatus] = useState<StatisticsSystemStatus | null>(null);
  const [mockData, setMockData] = useState<StatisticsMockData | null>(null);
  const [groupRows, setGroupRows] = useState<StatisticsGroupRow[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [countRes, systemRes, mockRes, groupRes] = await Promise.all([
          getJson<StatisticsCount>('/api/plugin/statismock/count'),
          getJson<StatisticsSystemStatus>('/api/plugin/statismock/get_system_status'),
          getJson<StatisticsMockData>('/api/plugin/statismock/get'),
          getJson<StatisticsGroupRow[]>('/api/plugin/statismock/group_data_statis')
        ]);
        if (!active) return;
        if (countRes.errcode === 0) setCount(countRes.data || null);
        if (systemRes.errcode === 0) setSystemStatus(systemRes.data || null);
        if (mockRes.errcode === 0) setMockData(mockRes.data || null);
        if (groupRes.errcode === 0) setGroupRows(groupRes.data || []);
      } catch (error) {
        if (!active) return;
        message.error(`系统信息加载失败: ${String((error as Error).message || error)}`);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const columns = useMemo<ColumnsType<StatisticsGroupRow>>(
    () => [
      { title: '分组', dataIndex: 'name', key: 'name' },
      { title: '项目数', dataIndex: 'project', key: 'project', width: 120 },
      { title: '接口数', dataIndex: 'interface', key: 'interface', width: 120 },
      { title: 'Mock 调用', dataIndex: 'mock', key: 'mock', width: 140 }
    ],
    []
  );

  return (
    <Space direction="vertical" className="legacy-workspace-stack" size={16}>
      {loading ? (
        <Card>
          <Space>
            <Spin size="small" />
            <Text>加载统计数据...</Text>
          </Space>
        </Card>
      ) : null}
      <Card title="总览">
        <Space wrap size={24}>
          <Tag color="blue">分组 {count?.groupCount ?? 0}</Tag>
          <Tag color="green">项目 {count?.projectCount ?? 0}</Tag>
          <Tag color="purple">接口 {count?.interfaceCount ?? 0}</Tag>
          <Tag color="orange">测试用例 {count?.interfaceCaseCount ?? 0}</Tag>
          <Tag color="cyan">Mock 访问 {mockData?.mockCount ?? 0}</Tag>
        </Space>
      </Card>
      <Card title="系统状态">
        <Descriptions size="small" bordered column={2}>
          <Descriptions.Item label="系统">{systemStatus?.systemName || '-'}</Descriptions.Item>
          <Descriptions.Item label="邮件">{systemStatus?.mail || '-'}</Descriptions.Item>
          <Descriptions.Item label="CPU 负载">{systemStatus?.load || '-'}%</Descriptions.Item>
          <Descriptions.Item label="运行时间">{systemStatus?.uptime || '-'}</Descriptions.Item>
          <Descriptions.Item label="总内存">{systemStatus?.totalmem || '-'}</Descriptions.Item>
          <Descriptions.Item label="可用内存">{systemStatus?.freemem || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Card title="分组统计">
        <Table
          rowKey={row => String(row.name || Math.random())}
          size="small"
          pagination={false}
          columns={columns}
          dataSource={groupRows}
        />
      </Card>
    </Space>
  );
}

function normalizeHeaderRow(value: unknown): Array<{ name: string; value: string }> {
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

function normalizeSimpleParam(value: unknown) {
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

type AdvancedMockCaseRecord = {
  _id?: string | number;
  name?: string;
  ip?: string;
  ip_enable?: boolean;
  username?: string;
  up_time?: number;
  case_enable?: boolean;
  code?: number;
  delay?: number;
  headers?: Array<{ name?: string; value?: string }>;
  params?: Record<string, unknown>;
  res_body?: string;
};

type AdvancedMockKeyValue = {
  name: string;
  value: string;
};

type AdvancedMockCaseForm = {
  name: string;
  ip_enable: boolean;
  ip: string;
  params_mode: 'form' | 'json';
  params_rows: AdvancedMockKeyValue[];
  params_json: string;
  code: number;
  delay: number;
  headers: AdvancedMockKeyValue[];
  res_body: string;
};

const ADV_MOCK_HTTP_CODES = [
  100, 101, 102, 200, 201, 202, 203, 204, 205, 206, 207, 208, 226, 300, 301, 302, 303, 304, 305, 307, 308, 400,
  401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 422, 423, 424, 426,
  428, 429, 431, 500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511
];

const IP_REGEXP = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function normalizeCaseKeyValues(value: unknown): AdvancedMockKeyValue[] {
  if (!Array.isArray(value)) return [{ name: '', value: '' }];
  const rows = value
    .map(item => {
      const source = item as Record<string, unknown>;
      return {
        name: toStringValue(source.name),
        value: toStringValue(source.value)
      };
    })
    .filter(item => item.name || item.value);
  return rows.length > 0 ? rows : [{ name: '', value: '' }];
}

function normalizeCaseParams(
  value: unknown
): Pick<AdvancedMockCaseForm, 'params_mode' | 'params_rows' | 'params_json'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      params_mode: 'form',
      params_rows: [{ name: '', value: '' }],
      params_json: '{}'
    };
  }

  const paramsObject = value as Record<string, unknown>;
  const keys = Object.keys(paramsObject);
  if (keys.length === 0) {
    return {
      params_mode: 'form',
      params_rows: [{ name: '', value: '' }],
      params_json: '{}'
    };
  }

  const primitiveOnly = keys.every(key => {
    const param = paramsObject[key];
    return (
      typeof param === 'string' ||
      typeof param === 'number' ||
      typeof param === 'boolean' ||
      param == null
    );
  });

  if (primitiveOnly) {
    return {
      params_mode: 'form',
      params_rows: keys.map(key => ({
        name: key,
        value: toStringValue(paramsObject[key])
      })),
      params_json: JSON.stringify(paramsObject, null, 2)
    };
  }

  return {
    params_mode: 'json',
    params_rows: [{ name: '', value: '' }],
    params_json: JSON.stringify(paramsObject, null, 2)
  };
}

function formatCaseUpdateTime(value: unknown): string {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return '-';
  return new Date(num * 1000).toLocaleString();
}

function AdvancedMockPluginTab(props: { projectId: number; interfaceData: Record<string, unknown> }) {
  const interfaceId = Number(props.interfaceData._id || 0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enable, setEnable] = useState(false);
  const [script, setScript] = useState('');
  const [loadedId, setLoadedId] = useState(0);
  const [activeTab, setActiveTab] = useState<'case' | 'script'>('case');
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseRows, setCaseRows] = useState<AdvancedMockCaseRecord[]>([]);
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);
  const [casePreparing, setCasePreparing] = useState(false);
  const [editingCase, setEditingCase] = useState<AdvancedMockCaseRecord | null>(null);
  const [caseForm] = Form.useForm<AdvancedMockCaseForm>();

  const watchParamsMode = Form.useWatch('params_mode', caseForm) || 'form';
  const watchIpEnable = Form.useWatch('ip_enable', caseForm) === true;

  const caseColumns: ColumnsType<AdvancedMockCaseRecord> = [
    {
      title: '期望名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      key: 'ip',
      render: (_value, row) => (row.ip_enable ? toStringValue(row.ip) || '-' : '无过滤')
    },
    {
      title: '创建人',
      dataIndex: 'username',
      key: 'username',
      width: 140,
      render: value => toStringValue(value) || '-'
    },
    {
      title: '编辑时间',
      dataIndex: 'up_time',
      key: 'up_time',
      width: 180,
      render: value => formatCaseUpdateTime(value)
    },
    {
      title: '状态',
      dataIndex: 'case_enable',
      key: 'case_enable',
      width: 100,
      render: value => (value === false ? <Tag color="default">未开启</Tag> : <Tag color="green">已开启</Tag>)
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_, row) => (
        <Space size={6} wrap>
          <Button size="small" onClick={() => void handleOpenCaseModal(row)}>
            编辑
          </Button>
          <Popconfirm
            title="确定删除该期望吗？"
            okText="确定"
            cancelText="取消"
            onConfirm={() => void handleDeleteCase(row)}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
          <Button size="small" onClick={() => void handleToggleCase(row)}>
            {row.case_enable === false ? '未开启' : '已开启'}
          </Button>
        </Space>
      )
    }
  ];

  async function convertSchemaToJson(schemaText: string): Promise<string | null> {
    try {
      const schema = json5.parse(schemaText);
      const response = await fetch('/api/interface/schema2json', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          schema,
          required: true
        })
      });
      const payload = await response.json();
      return JSON.stringify(payload, null, 2);
    } catch (_error) {
      return null;
    }
  }

  async function loadCaseList() {
    if (interfaceId <= 0) {
      setCaseRows([]);
      return;
    }
    setCaseLoading(true);
    try {
      const res = await getJson<AdvancedMockCaseRecord[]>(
        `/api/plugin/advmock/case/list?interface_id=${interfaceId}`
      );
      if (res.errcode !== 0) {
        message.error(res.errmsg || '加载期望列表失败');
        return;
      }
      setCaseRows(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      message.error(`加载期望列表失败: ${String((error as Error).message || error)}`);
    } finally {
      setCaseLoading(false);
    }
  }

  useEffect(() => {
    if (interfaceId <= 0) {
      setEnable(false);
      setScript('');
      setCaseRows([]);
      return;
    }
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await getJson<Record<string, unknown>>(
          `/api/plugin/advmock/get?interface_id=${interfaceId}`
        );
        if (!active) return;
        if (res.errcode === 0 && res.data) {
          setEnable(res.data.enable === true);
          setScript(toStringValue(res.data.mock_script));
        } else {
          setEnable(false);
          setScript('');
        }
      } catch (error) {
        if (!active) return;
        message.error(`加载高级 Mock 失败: ${String((error as Error).message || error)}`);
      } finally {
        if (active) {
          setLoading(false);
          setLoadedId(interfaceId);
        }
      }
    }
    void load();
    void loadCaseList();
    return () => {
      active = false;
    };
  }, [interfaceId]);

  async function getDefaultCaseFormValue() {
    const nextResBodyRaw = toStringValue(props.interfaceData.res_body);
    const isResponseSchema = props.interfaceData.res_body_is_json_schema === true;
    const convertedResBody =
      isResponseSchema && nextResBodyRaw.trim()
        ? await convertSchemaToJson(nextResBodyRaw)
        : nextResBodyRaw;

    let paramsSeed: unknown = {};
    const reqBodyOtherRaw = toStringValue(props.interfaceData.req_body_other);
    if (reqBodyOtherRaw.trim()) {
      if (props.interfaceData.req_body_is_json_schema === true) {
        const convertedReq = await convertSchemaToJson(reqBodyOtherRaw);
        if (convertedReq) {
          paramsSeed = parseJsonSafe(convertedReq, {});
        }
      } else if (toStringValue(props.interfaceData.req_body_type).toLowerCase() === 'json') {
        paramsSeed = parseJsonSafe(reqBodyOtherRaw, {});
      }
    }
    const defaultParams = normalizeCaseParams(paramsSeed);

    return {
      name: toStringValue(props.interfaceData.title || props.interfaceData.path || '新期望') || '新期望',
      ip_enable: false,
      ip: '',
      params_mode: defaultParams.params_mode,
      params_rows: defaultParams.params_rows,
      params_json: defaultParams.params_json,
      code: 200,
      delay: 0,
      headers: [{ name: '', value: '' }],
      res_body: convertedResBody || '{}'
    } satisfies AdvancedMockCaseForm;
  }

  async function handleOpenCaseModal(record?: AdvancedMockCaseRecord) {
    setCasePreparing(true);
    try {
      if (!record) {
        setEditingCase(null);
        const defaults = await getDefaultCaseFormValue();
        caseForm.setFieldsValue(defaults);
        setCaseModalOpen(true);
        return;
      }
      setEditingCase(record);
      const params = normalizeCaseParams(record.params);
      caseForm.setFieldsValue({
        name: toStringValue(record.name),
        ip_enable: record.ip_enable === true,
        ip: toStringValue(record.ip),
        params_mode: params.params_mode,
        params_rows: params.params_rows,
        params_json: params.params_json,
        code: Number(record.code || 200),
        delay: Number(record.delay || 0),
        headers: normalizeCaseKeyValues(record.headers),
        res_body: toStringValue(record.res_body || '{}')
      });
      setCaseModalOpen(true);
    } catch (error) {
      message.error(`初始化期望编辑器失败: ${String((error as Error).message || error)}`);
    } finally {
      setCasePreparing(false);
    }
  }

  function closeCaseModal() {
    setCaseModalOpen(false);
    setEditingCase(null);
    caseForm.resetFields();
  }

  function buildCaseParamsFromForm(values: AdvancedMockCaseForm): Record<string, unknown> | null {
    if (values.params_mode === 'json') {
      try {
        const parsed = json5.parse(String(values.params_json || '{}'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          message.error('参数过滤 JSON 必须是 object');
          return null;
        }
        return parsed as Record<string, unknown>;
      } catch (error) {
        message.error(`参数过滤 JSON 解析失败: ${String((error as Error).message || error)}`);
        return null;
      }
    }

    const output: Record<string, unknown> = {};
    (values.params_rows || []).forEach(row => {
      const key = toStringValue(row.name).trim();
      if (!key) return;
      const rawValue = toStringValue(row.value);
      output[key] = parseMaybeJson(rawValue);
    });
    return output;
  }

  async function handleSaveCase() {
    if (interfaceId <= 0) {
      message.error('请先选择接口');
      return;
    }
    try {
      const values = await caseForm.validateFields();
      const params = buildCaseParamsFromForm(values);
      if (params == null) return;

      const headers = (values.headers || [])
        .map(item => ({
          name: toStringValue(item.name).trim(),
          value: toStringValue(item.value)
        }))
        .filter(item => item.name);

      const payload: Record<string, unknown> = {
        interface_id: interfaceId,
        project_id: props.projectId,
        name: toStringValue(values.name).trim(),
        ip_enable: values.ip_enable === true,
        ip: toStringValue(values.ip).trim(),
        params,
        code: Number(values.code || 200),
        delay: Number(values.delay || 0),
        headers,
        res_body: toStringValue(values.res_body || '')
      };

      if (editingCase?._id != null) {
        payload.id = editingCase._id;
      }

      setCaseSaving(true);
      const res = await postJson('/api/plugin/advmock/case/save', payload);
      if (res.errcode !== 0) {
        message.error(res.errmsg || '保存期望失败');
        return;
      }
      message.success(editingCase ? '期望已保存' : '期望已添加');
      closeCaseModal();
      await loadCaseList();
    } catch (_error) {
      // antd form validation error is handled by Form.Item
    } finally {
      setCaseSaving(false);
    }
  }

  async function handleDeleteCase(row: AdvancedMockCaseRecord) {
    if (row._id == null) return;
    const res = await postJson('/api/plugin/advmock/case/del', { id: row._id });
    if (res.errcode !== 0) {
      message.error(res.errmsg || '删除期望失败');
      return;
    }
    message.success('期望已删除');
    await loadCaseList();
  }

  async function handleToggleCase(row: AdvancedMockCaseRecord) {
    if (row._id == null) return;
    const res = await postJson('/api/plugin/advmock/case/hide', {
      id: row._id,
      enable: row.case_enable === false
    });
    if (res.errcode !== 0) {
      message.error(res.errmsg || '修改期望状态失败');
      return;
    }
    message.success('期望状态已更新');
    await loadCaseList();
  }

  async function handleSave() {
    if (interfaceId <= 0) {
      message.error('请先选择接口');
      return;
    }
    setSaving(true);
    try {
      const res = await postJson('/api/plugin/advmock/save', {
        interface_id: interfaceId,
        project_id: props.projectId,
        enable,
        mock_script: script
      });
      if (res.errcode !== 0) {
        message.error(res.errmsg || '高级 Mock 保存失败');
        return;
      }
      message.success('高级 Mock 保存成功');
    } catch (error) {
      message.error(`高级 Mock 保存失败: ${String((error as Error).message || error)}`);
    } finally {
      setSaving(false);
    }
  }

  if (interfaceId <= 0) {
    return <Alert type="info" showIcon message="请先选择接口后再编辑高级 Mock 配置" />;
  }

  return (
    <Space direction="vertical" className="legacy-workspace-stack" size={12}>
      {loading && loadedId !== interfaceId ? (
        <Space>
          <Spin size="small" />
          <Text>加载高级 Mock...</Text>
        </Space>
      ) : null}
      <Alert
        type="info"
        showIcon
        message="高级 Mock 脚本支持在 Mock 返回前覆盖响应结构。"
      />
      <Tabs
        activeKey={activeTab}
        onChange={key => setActiveTab(key === 'script' ? 'script' : 'case')}
        items={[
          {
            key: 'case',
            label: '期望',
            children: (
              <Space direction="vertical" className="legacy-workspace-stack" size={12}>
                <Space>
                  <Button type="primary" onClick={() => void handleOpenCaseModal()}>
                    添加期望
                  </Button>
                </Space>
                <Table
                  size="small"
                  loading={caseLoading}
                  rowKey={row => String(row._id || row.name || Math.random())}
                  pagination={false}
                  columns={caseColumns}
                  dataSource={caseRows}
                />
              </Space>
            )
          },
          {
            key: 'script',
            label: '脚本',
            children: (
              <Space direction="vertical" className="legacy-workspace-stack" size={12}>
                <Space align="center">
                  <Text>是否启用</Text>
                  <Switch checked={enable} onChange={setEnable} />
                </Space>
                <Input.TextArea
                  value={script}
                  onChange={event => setScript(event.target.value)}
                  rows={14}
                  placeholder={'// 例如：\ncontext.mockJson = { code: 0, data: [] };'}
                />
                <Space>
                  <Button type="primary" loading={saving} onClick={() => void handleSave()}>
                    保存
                  </Button>
                </Space>
              </Space>
            )
          }
        ]}
      />
      <Modal
        title={editingCase ? '编辑期望' : '添加期望'}
        open={caseModalOpen}
        onCancel={closeCaseModal}
        onOk={() => void handleSaveCase()}
        okText={editingCase ? '保存' : '添加'}
        cancelText="取消"
        width={860}
        confirmLoading={caseSaving}
        destroyOnHidden
      >
        {casePreparing ? (
          <div className="legacy-plugin-loading-block">
            <Spin />
          </div>
        ) : (
          <Form<AdvancedMockCaseForm>
            form={caseForm}
            layout="vertical"
            initialValues={{
              name: '',
              ip_enable: false,
              ip: '',
              params_mode: 'form',
              params_rows: [{ name: '', value: '' }],
              params_json: '{}',
              code: 200,
              delay: 0,
              headers: [{ name: '', value: '' }],
              res_body: '{}'
            }}
          >
            <Form.Item label="期望名称" name="name" rules={[{ required: true, message: '请输入期望名称' }]}>
              <Input placeholder="请输入期望名称" />
            </Form.Item>
            <Space className="legacy-plugin-row-start" align="start">
              <Form.Item
                label="IP 过滤开关"
                name="ip_enable"
                valuePropName="checked"
                className="legacy-plugin-ip-switch-item"
              >
                <Switch />
              </Form.Item>
              <Form.Item
                className="legacy-plugin-ip-address-item"
                label="IP 地址"
                name="ip"
                rules={[
                  {
                    validator(_, value) {
                      if (!watchIpEnable) return Promise.resolve();
                      const raw = toStringValue(value).trim();
                      if (!raw) {
                        return Promise.reject(new Error('请输入过滤 IP'));
                      }
                      if (!IP_REGEXP.test(raw)) {
                        return Promise.reject(new Error('请输入合法的 IPv4 地址'));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <Input disabled={!watchIpEnable} placeholder="例如 192.168.1.10" />
              </Form.Item>
            </Space>
            <Form.Item label="参数过滤模式" name="params_mode">
              <Radio.Group
                options={[
                  { label: '表单', value: 'form' },
                  { label: 'JSON', value: 'json' }
                ]}
                optionType="button"
                buttonStyle="solid"
              />
            </Form.Item>
            {watchParamsMode === 'form' ? (
              <Form.List name="params_rows">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" className="legacy-workspace-stack" size={8}>
                    {fields.map(field => (
                      <Space key={field.key} className="legacy-plugin-field-row" align="baseline">
                        <Form.Item
                          name={[field.name, 'name']}
                          rules={[{ required: true, message: '参数名不能为空' }]}
                          className="legacy-plugin-field-w280"
                        >
                          <Input placeholder="参数名" />
                        </Form.Item>
                        <Form.Item name={[field.name, 'value']} className="legacy-plugin-field-w360">
                          <Input placeholder="参数值" />
                        </Form.Item>
                        <Button danger onClick={() => remove(field.name)}>
                          删除
                        </Button>
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add({ name: '', value: '' })}>
                      添加参数
                    </Button>
                  </Space>
                )}
              </Form.List>
            ) : (
              <Form.Item label="参数过滤(JSON)" name="params_json">
                <Input.TextArea rows={6} placeholder='例如: {"status":"ready"}' />
              </Form.Item>
            )}
            <Space className="legacy-plugin-row-start" align="start">
              <Form.Item label="HTTP Code" name="code" className="legacy-plugin-field-w220">
                <Select
                  showSearch
                  options={ADV_MOCK_HTTP_CODES.map(code => ({ label: String(code), value: code }))}
                />
              </Form.Item>
              <Form.Item label="延时(ms)" name="delay" className="legacy-plugin-field-w220">
                <InputNumber min={0} precision={0} className="legacy-workspace-control" />
              </Form.Item>
            </Space>
            <Form.Item label="HTTP 头">
              <Form.List name="headers">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" className="legacy-workspace-stack" size={8}>
                    {fields.map(field => (
                      <Space key={field.key} className="legacy-plugin-field-row" align="baseline">
                        <Form.Item name={[field.name, 'name']} className="legacy-plugin-field-w280">
                          <Input placeholder="Header 名称" />
                        </Form.Item>
                        <Form.Item name={[field.name, 'value']} className="legacy-plugin-field-w360">
                          <Input placeholder="Header 值" />
                        </Form.Item>
                        <Button danger onClick={() => remove(field.name)}>
                          删除
                        </Button>
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add({ name: '', value: '' })}>
                      添加 HTTP 头
                    </Button>
                  </Space>
                )}
              </Form.List>
            </Form.Item>
            <Form.Item
              label="响应 Body"
              name="res_body"
              rules={[{ required: true, message: '请输入响应 Body' }]}
            >
              <Input.TextArea rows={10} placeholder='例如: {"code":200,"data":[]}' />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </Space>
  );
}

function ServicesPluginPage(props: { projectId: number }) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await getJson<{ token?: string }>(`/api/project/token?id=${props.projectId}`);
        if (!active) return;
        if (res.errcode !== 0) {
          message.error(res.errmsg || '获取项目 token 失败');
          return;
        }
        const tokenValue =
          typeof res.data === 'string'
            ? res.data
            : toStringValue((res.data as Record<string, unknown> | undefined)?.token);
        setToken(String(tokenValue || '').trim());
      } catch (error) {
        if (!active) return;
        message.error(`获取项目 token 失败: ${String((error as Error).message || error)}`);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [props.projectId]);

  const origin = window.location.origin;
  const modernUrl = `${origin}/api/open/plugin/export-full?type=json&pid=${props.projectId}&status=all&token=${token}`;

  return (
    <Space direction="vertical" className="legacy-workspace-stack">
      {loading ? (
        <Space>
          <Spin size="small" />
          <Text>加载项目 token...</Text>
        </Space>
      ) : null}
      <Typography.Title level={5}>生成 TS Services</Typography.Title>
      <Paragraph>
        <Text>1. 安装工具：</Text>
      </Paragraph>
      <pre>npm i sm2tsservice -D</pre>
      <Paragraph>
        <Text>2. 创建配置文件 `json2service.json`：</Text>
      </Paragraph>
      <pre>{`{
  "url": "yapi-swagger.json",
  "remoteUrl": "${modernUrl}",
  "type": "yapi",
  "swaggerParser": {}
}`}</pre>
      <Paragraph>
        <Text>3. 生成代码：</Text>
      </Paragraph>
      <pre>npx sm2tsservice --clear</pre>
      <a href="https://github.com/gogoyqj/sm2tsservice" target="_blank" rel="noopener noreferrer">
        查看 sm2tsservice 文档
      </a>
    </Space>
  );
}

type AutoSyncForm = {
  is_sync_open: boolean;
  sync_mode: 'normal' | 'good' | 'merge';
  sync_json_url: string;
  sync_cron: string;
};

function SwaggerAutoSyncPluginPage(props: { projectId: number }) {
  const [form] = Form.useForm<AutoSyncForm>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordId, setRecordId] = useState<string>('');
  const [lastSyncAt, setLastSyncAt] = useState<number>(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await getJson<Record<string, unknown>>(
          `/api/plugin/autoSync/get?project_id=${props.projectId}`
        );
        if (res.errcode !== 0) {
          message.error(res.errmsg || '加载自动同步配置失败');
          return;
        }
        if (!active) return;
        const data = res.data || {};
        setRecordId(toStringValue(data._id));
        setLastSyncAt(Number(data.last_sync_time || 0));
        form.setFieldsValue({
          is_sync_open: data.is_sync_open === true,
          sync_mode: (toStringValue(data.sync_mode) as AutoSyncForm['sync_mode']) || 'normal',
          sync_json_url: toStringValue(data.sync_json_url),
          sync_cron: toStringValue(data.sync_cron) || '*/10 * * * *'
        });
      } catch (error) {
        if (!active) return;
        message.error(`加载自动同步配置失败: ${String((error as Error).message || error)}`);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [form, props.projectId]);

  async function handleSave() {
    const values = await form.validateFields();
    if (values.sync_cron.trim().split(/\s+/).length > 5) {
      message.error('暂不支持秒级 cron 表达式');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        project_id: props.projectId,
        id: recordId || undefined,
        is_sync_open: values.is_sync_open,
        sync_mode: values.sync_mode,
        sync_json_url: values.sync_json_url.trim(),
        sync_cron: values.sync_cron.trim()
      };
      const res = await postJson('/api/plugin/autoSync/save', payload);
      if (res.errcode !== 0) {
        message.error(res.errmsg || '保存自动同步配置失败');
        return;
      }
      const responseData = (res.data || {}) as Record<string, unknown>;
      const nextId = toStringValue(responseData._id);
      if (nextId) {
        setRecordId(nextId);
      } else if (!recordId) {
        // Keep id in sync for first-time create when backend returns write result object.
        await (async () => {
          try {
            const latest = await getJson<Record<string, unknown>>(
              `/api/plugin/autoSync/get?project_id=${props.projectId}`
            );
            if (latest.errcode === 0) {
              setRecordId(toStringValue((latest.data || {})._id));
            }
          } catch (_err) {
            // Ignore refresh failure, save already succeeded.
          }
        })();
      }
      message.success('自动同步配置已保存');
    } catch (error) {
      message.error(`保存自动同步配置失败: ${String((error as Error).message || error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Space direction="vertical" className="legacy-workspace-stack">
      {loading ? (
        <Space>
          <Spin size="small" />
          <Text>加载自动同步配置...</Text>
        </Space>
      ) : null}
      <Form<AutoSyncForm> layout="vertical" form={form}>
        <Form.Item label="是否开启自动同步" name="is_sync_open" valuePropName="checked">
          <Switch checkedChildren="开" unCheckedChildren="关" />
        </Form.Item>
        {lastSyncAt > 0 ? (
          <Text type="secondary">上次同步时间：{new Date(lastSyncAt * 1000).toLocaleString()}</Text>
        ) : null}
        <Form.Item label="同步模式" name="sync_mode" rules={[{ required: true, message: '请选择同步模式' }]}>
          <Select
            options={[
              { label: '普通模式', value: 'normal' },
              { label: '智能合并', value: 'good' },
              { label: '完全覆盖', value: 'merge' }
            ]}
          />
        </Form.Item>
        <Form.Item
          label="Swagger/OpenAPI URL"
          name="sync_json_url"
          rules={[{ required: true, message: '请输入规范 URL' }]}
        >
          <Input placeholder="https://example.com/openapi.json" />
        </Form.Item>
        <Form.Item label="Cron 表达式" name="sync_cron" rules={[{ required: true, message: '请输入 cron 表达式' }]}>
          <Input placeholder="*/10 * * * *" />
        </Form.Item>
        <Button type="primary" onClick={() => void handleSave()} loading={saving}>
          保存
        </Button>
      </Form>
    </Space>
  );
}

type WikiDoc = {
  desc?: string;
  markdown?: string;
};

function ProjectWikiPluginPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id || 0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markdown, setMarkdown] = useState('');

  useEffect(() => {
    if (projectId <= 0) return;
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await getJson<WikiDoc>(`/api/plugin/wiki_desc/get?project_id=${projectId}`);
        if (!active) return;
        if (res.errcode !== 0) {
          message.error(res.errmsg || '加载 Wiki 失败');
          return;
        }
        setMarkdown(toStringValue(res.data?.markdown || res.data?.desc || ''));
      } catch (error) {
        if (!active) return;
        message.error(`加载 Wiki 失败: ${String((error as Error).message || error)}`);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [projectId]);

  async function handleSave() {
    if (projectId <= 0) return;
    setSaving(true);
    try {
      const res = await postJson('/api/plugin/wiki_desc/up', {
        project_id: projectId,
        desc: markdown,
        markdown
      });
      if (res.errcode !== 0) {
        message.error(res.errmsg || 'Wiki 保存失败');
        return;
      }
      message.success('Wiki 已保存');
    } catch (error) {
      message.error(`Wiki 保存失败: ${String((error as Error).message || error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Space direction="vertical" className="legacy-workspace-stack">
      {loading ? (
        <Space>
          <Spin size="small" />
          <Text>加载 Wiki...</Text>
        </Space>
      ) : null}
      <Alert type="info" showIcon message="Markdown 编辑已切换为新实现（兼容保存旧版字段）。" />
      <Input.TextArea
        rows={18}
        value={markdown}
        onChange={event => setMarkdown(event.target.value)}
        placeholder="输入项目 Wiki（Markdown）"
      />
      <Space>
        <Button type="primary" loading={saving} onClick={() => void handleSave()}>
          保存 Wiki
        </Button>
      </Space>
      <Card size="small" title="预览（纯文本）">
        <pre className="legacy-plugin-pre">{markdown || '暂无内容'}</pre>
      </Card>
    </Space>
  );
}

function PluginTestPage() {
  return (
    <Card size="small" title="Test Plugin">
      <Text>hello world.</Text>
    </Card>
  );
}

const advancedMockState = createSlice({
  name: 'advancedMock',
  initialState: {
    lastEditedInterfaceId: 0,
    draftByInterface: {} as Record<number, string>
  },
  reducers: {
    setDraft(state, action: { payload: { interfaceId: number; script: string } }) {
      state.lastEditedInterfaceId = action.payload.interfaceId;
      state.draftByInterface[action.payload.interfaceId] = action.payload.script;
    }
  }
});

function createPostmanImporter(): ImportDataItem {
  return {
    name: 'Postman',
    desc: 'Postman Collection 导入（新实现）',
    run(content: string) {
      const source = parseJsonSafe<Record<string, unknown>>(content, {});
      const apis: Array<Record<string, unknown>> = [];
      const cats: Array<{ name: string; desc?: string }> = [];

      function pushApiFromRequest(
        request: Record<string, unknown>,
        title: string,
        folderName?: string,
        responseExample?: Record<string, unknown>
      ) {
        const method = toStringValue(request.method || 'GET').toUpperCase();
        const urlValue = request.url;
        const rawUrl =
          typeof urlValue === 'string'
            ? urlValue
            : toStringValue((urlValue as Record<string, unknown>)?.raw || '');
        const path = normalizePath(rawUrl);
        const queryList = (
          Array.isArray((urlValue as Record<string, unknown>)?.query)
            ? ((urlValue as Record<string, unknown>).query as unknown[])
            : []
        ) as unknown[];
        const queryParams = queryList
          .map((item: unknown) => {
            const row = item as Record<string, unknown>;
            return {
              name: toStringValue(row.key),
              value: toStringValue(row.value),
              required: row.disabled ? '0' : '1',
              desc: toStringValue(row.description)
            };
          })
          .filter((item: { name: string }) => item.name);
        const headers = normalizeHeaderRow((request as Record<string, unknown>).header).map(item => ({
          ...item,
          required: '1'
        }));
        const contentType = headers.find(item => item.name.toLowerCase() === 'content-type')?.value.toLowerCase() || '';
        const body = (request.body || {}) as Record<string, unknown>;
        const bodyMode = toStringValue(body.mode);
        let reqBodyType: 'form' | 'json' | 'raw' = 'raw';
        let reqBodyForm: Array<Record<string, unknown>> = [];
        let reqBodyOther = '';
        let reqBodyIsJsonSchema = false;
        if (bodyMode === 'urlencoded' || bodyMode === 'formdata') {
          reqBodyType = 'form';
          const rows = Array.isArray(body[bodyMode]) ? (body[bodyMode] as unknown[]) : [];
          reqBodyForm = rows
            .map(item => {
              const row = item as Record<string, unknown>;
              return {
                name: toStringValue(row.key),
                value: toStringValue(row.value),
                required: row.disabled ? '0' : '1',
                desc: toStringValue(row.description),
                type: bodyMode === 'formdata' ? toStringValue(row.type || 'text') : 'text'
              };
            })
            .filter(item => item.name);
        } else if (bodyMode === 'raw') {
          const raw = toStringValue(body.raw);
          const schemaText =
            contentType.includes('application/json') || raw.trim().startsWith('{') || raw.trim().startsWith('[')
              ? inferDraft4SchemaTextFromJsonText(raw)
              : null;
          reqBodyOther = schemaText || raw;
          reqBodyType = schemaText ? 'json' : 'raw';
          reqBodyIsJsonSchema = Boolean(schemaText);
        }

        const firstResponseBody = toStringValue(responseExample?.body || '');
        const responseSchemaText = inferDraft4SchemaTextFromJsonText(firstResponseBody);
        apis.push({
          title: title || path,
          path,
          method,
          catname: folderName || '默认分类',
          req_query: queryParams,
          req_headers: headers,
          req_body_type: reqBodyType,
          req_body_form: reqBodyForm,
          req_body_other: reqBodyOther,
          req_body_is_json_schema: reqBodyIsJsonSchema,
          res_body_type: responseSchemaText ? 'json' : 'raw',
          res_body: responseSchemaText || firstResponseBody,
          res_body_is_json_schema: Boolean(responseSchemaText),
          desc: toStringValue(request.description || '')
        });
      }

      function walkItems(items: unknown[], folderName?: string) {
        items.forEach(rawItem => {
          const item = rawItem as Record<string, unknown>;
          if (Array.isArray(item.item)) {
            const name = toStringValue(item.name || folderName || '默认分类') || '默认分类';
            cats.push({ name, desc: toStringValue(item.description || '') });
            walkItems(item.item as unknown[], name);
            return;
          }
          const request = (item.request || {}) as Record<string, unknown>;
          if (!request || Object.keys(request).length === 0) return;
          const responses = Array.isArray(item.response) ? (item.response as Array<Record<string, unknown>>) : [];
          pushApiFromRequest(request, toStringValue(item.name || ''), folderName, responses[0]);
        });
      }

      if (Array.isArray(source.item)) {
        walkItems(source.item, '默认分类');
      }

      if (Array.isArray(source.requests)) {
        (source.requests as Array<Record<string, unknown>>).forEach(item => {
          pushApiFromRequest(item, toStringValue(item.name || ''), '默认分类');
        });
      }

      if (cats.length === 0) {
        cats.push({ name: '默认分类' });
      }

      return { apis, cats };
    }
  };
}

function createHarImporter(): ImportDataItem {
  return {
    name: 'Har',
    desc: 'Har 导入（新实现）',
    run(content: string) {
      const source = parseJsonSafe<Record<string, unknown>>(content, {});
      const entries = Array.isArray((source.log as Record<string, unknown> | undefined)?.entries)
        ? ((source.log as Record<string, unknown>).entries as Array<Record<string, unknown>>)
        : [];
      const apis: Array<Record<string, unknown>> = [];

      entries.forEach(entry => {
        const request = (entry.request || {}) as Record<string, unknown>;
        const response = (entry.response || {}) as Record<string, unknown>;
        const url = toStringValue(request.url);
        const path = normalizePath(url);
        const method = toStringValue(request.method || 'GET').toUpperCase();
        const queryParams = normalizeSimpleParam(request.queryString);
        const headers = normalizeHeaderRow(request.headers).map(item => ({
          ...item,
          required: '1',
          desc: ''
        }));
        const postData = (request.postData || {}) as Record<string, unknown>;
        const mime = toStringValue(postData.mimeType).toLowerCase();
        const bodyText = toStringValue(postData.text);
        let reqBodyType: 'form' | 'json' | 'raw' = 'raw';
        let reqBodyForm: Array<Record<string, unknown>> = [];
        let reqBodyOther = bodyText;
        let reqBodyIsJsonSchema = false;
        if (mime.includes('form-urlencoded') || mime.includes('multipart/form-data')) {
          reqBodyType = 'form';
          reqBodyForm = normalizeSimpleParam(postData.params).map(item => ({ ...item, type: 'text' }));
        } else if (mime.includes('application/json')) {
          reqBodyType = 'json';
          const schemaText = inferDraft4SchemaTextFromJsonText(bodyText);
          if (schemaText) {
            reqBodyOther = schemaText;
            reqBodyIsJsonSchema = true;
          }
        }
        const responseContent = (response.content || {}) as Record<string, unknown>;
        let responseText = toStringValue(responseContent.text || '');
        if (toStringValue(responseContent.encoding).toLowerCase() === 'base64' && responseText) {
          try {
            responseText = atob(responseText);
          } catch (_err) {
            // Keep original response text when base64 decode fails.
          }
        }
        const responseSchemaText = inferDraft4SchemaTextFromJsonText(responseText);
        apis.push({
          title: path,
          path,
          method,
          catname: '默认分类',
          req_query: queryParams,
          req_headers: headers,
          req_body_type: reqBodyType,
          req_body_form: reqBodyForm,
          req_body_other: reqBodyOther,
          req_body_is_json_schema: reqBodyIsJsonSchema,
          res_body_type: responseSchemaText ? 'json' : 'raw',
          res_body: responseSchemaText || responseText,
          res_body_is_json_schema: Boolean(responseSchemaText),
          desc: ''
        });
      });

      return { apis, cats: [{ name: '默认分类' }] };
    }
  };
}

function createYapiJsonImporter(): ImportDataItem {
  return {
    name: 'json',
    desc: 'YApi JSON 导入（新实现）',
    run(content: string) {
      const source = parseJsonSafe<Array<Record<string, unknown>>>(content, []);
      const cats: Array<{ name: string; desc?: string }> = [];
      const apis: Array<Record<string, unknown>> = [];
      source.forEach(item => {
        const catname = toStringValue(item.name || '默认分类') || '默认分类';
        cats.push({
          name: catname,
          desc: toStringValue(item.desc || '')
        });
        const list = Array.isArray(item.list) ? (item.list as Array<Record<string, unknown>>) : [];
        list.forEach(api => {
          apis.push({
            ...api,
            catname
          });
        });
      });
      return { cats, apis };
    }
  };
}

const statisticsPlugin: ModernWebPlugin = {
  id: 'statistics',
  setup(api) {
    api.extendHeaderMenu(menu => {
      menu.statisticsPage = {
        path: '/statistic',
        name: '系统信息',
        icon: 'bar-chart',
        adminFlag: true
      };
    });
    api.extendAppRoutes(routes => {
      routes.statisticsPage = {
        path: '/statistic',
        component: StatisticsPluginPage,
        protected: true
      };
    });
  }
};

const advancedMockPlugin: ModernWebPlugin = {
  id: 'advanced-mock',
  setup(api) {
    api.extendInterfaceTabs(tabs => {
      tabs.advMock = {
        name: '高级Mock',
        component: AdvancedMockPluginTab
      };
    });
    api.registerReducer('mockCol', advancedMockState.reducer);
  }
};

const wikiPlugin: ModernWebPlugin = {
  id: 'wiki',
  setup(api) {
    api.extendSubNav(nav => {
      nav.wiki = {
        name: 'Wiki',
        path: '/project/:id/wiki',
        component: ProjectWikiPluginPage
      };
    });
  }
};

const exportDataPlugin: ModernWebPlugin = {
  id: 'export-data',
  setup(api) {
    api.registerExporter('html', context => ({
      name: 'html',
      route: `/api/plugin/export?type=html&pid=${context?.projectId || 0}`,
      desc: '导出项目接口文档为 html 文件'
    }));
    api.registerExporter('markdown', context => ({
      name: 'markdown',
      route: `/api/plugin/export?type=markdown&pid=${context?.projectId || 0}`,
      desc: '导出项目接口文档为 markdown 文件'
    }));
    api.registerExporter('json', context => ({
      name: 'json',
      route: `/api/plugin/export?type=json&pid=${context?.projectId || 0}`,
      desc: '导出项目接口文档为 json 文件'
    }));
  }
};

const exportSwaggerPlugin: ModernWebPlugin = {
  id: 'export-swagger2-data',
  setup(api) {
    api.registerExporter('swaggerjson', context => ({
      name: 'swaggerjson',
      route: `/api/plugin/exportSwagger?type=OpenAPIV2&pid=${context?.projectId || 0}`,
      desc: '导出 Swagger 2.0 Json'
    }));
    api.registerExporter('openapi3json', context => ({
      name: 'openapi3json',
      route: `/api/plugin/exportSwagger?type=OpenAPIV3&pid=${context?.projectId || 0}`,
      desc: '导出 OpenAPI 3.0 Json'
    }));
  }
};

const importPluginPack: ModernWebPlugin = {
  id: 'import-pack',
  setup(api) {
    api.registerImporter('postman', () => createPostmanImporter());
    api.registerImporter('har', () => createHarImporter());
    api.registerImporter('json', () => createYapiJsonImporter());
  }
};

const genServicesPlugin: ModernWebPlugin = {
  id: 'gen-services',
  setup(api) {
    api.extendSubSettingNav(tabs => {
      tabs.services = {
        name: '生成 ts services',
        component: ServicesPluginPage
      };
    });
  }
};

const autoSyncPlugin: ModernWebPlugin = {
  id: 'swagger-auto-sync',
  setup(api) {
    api.extendSubSettingNav(tabs => {
      tabs.swaggerAutoSync = {
        name: 'Swagger自动同步',
        component: SwaggerAutoSyncPluginPage
      };
    });
  }
};

const testPlugin: ModernWebPlugin = {
  id: 'test',
  setup(api) {
    api.extendSubSettingNav(tabs => {
      tabs.test = {
        name: 'test',
        component: PluginTestPage
      };
    });
  }
};

const builtinPlugins: ModernWebPlugin[] = [
  statisticsPlugin,
  advancedMockPlugin,
  wikiPlugin,
  exportDataPlugin,
  exportSwaggerPlugin,
  importPluginPack,
  genServicesPlugin,
  autoSyncPlugin,
  testPlugin
];

let bootstrapped = false;
export const webPlugins = new WebPluginRuntime();

export function bootstrapWebPlugins() {
  if (bootstrapped) return webPlugins;
  builtinPlugins.forEach(plugin => webPlugins.use(plugin));
  bootstrapped = true;
  return webPlugins;
}

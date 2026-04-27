import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Checkbox, Group, NumberInput, Select, Tabs, Text, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAdjustments, 
  IconArrowDown,
  IconArrowUp,
  IconCopy,
  IconDeviceFloppy,
  IconKey, 
  IconListCheck, 
  IconMessageCode, 
  IconPlayerPlay, 
  IconPlugConnected,
  IconPlugConnectedX,
  IconPlus, 
  IconSend,
  IconSettings,
  IconVariable
} from '@tabler/icons-react';
import {
  buildGraphqlIntrospectionRequest,
  buildGraphqlOperationDraft,
  createEmptyCheck,
  graphqlFragmentPath,
  graphqlSelectionPath,
  inspectResolvedRequest,
  summarizeGraphqlSchema,
  type GraphqlFieldArgumentSummary,
  type GraphqlFragmentStyle,
  type GraphqlOperationFieldSummary,
  type GraphqlOperationKind,
  type GraphqlSchemaTypeFieldSummary,
  type GraphqlSchemaTypeSummary,
  type GraphqlSelectionFieldSummary,
  type GraphqlSelectionFragmentSummary,
  type GraphqlSchemaSummary
} from '@yapi-debugger/core';
import type {
  AuthConfig,
  CaseCheck,
  CaseDocument,
  EnvironmentDocument,
  RequestBody,
  RequestDocument,
  ResolvedRequestInsight,
  SessionSnapshot,
  WorkspaceIndex
} from '@yapi-debugger/schema';
import type { RequestTab } from '../../store/workspace-store';
import { parseCurlCommand } from '../../lib/curl';
import { confirmAction, promptForText } from '../../lib/dialogs';
import {
  chooseRequestBodyFile,
  closeWebSocketLive,
  connectWebSocketLive,
  loadWebSocketLiveSnapshot,
  runWebSocketSession,
  sendRequest,
  sendWebSocketLiveMessage,
  type WebSocketLiveSnapshot,
  type WebSocketRunResult
} from '../../lib/desktop';
import { normalizeRequestVariableRowDraft as normalizeRequestVariableRow } from '../../lib/variable-audit';
import { CodeEditor } from '../editors/CodeEditor';
import { KeyValueEditor } from '../primitives/KeyValueEditor';
import { RequestUrlBar } from './request/RequestUrlBar';
import { AuthPanel } from './request/AuthPanel';
import { ScriptsPanel } from './request/ScriptsPanel';

const REQUEST_METHODS: RequestDocument['method'][] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const REQUEST_KINDS: RequestDocument['kind'][] = ['http', 'graphql', 'grpc', 'websocket', 'script'];
const GRPC_RPC_KINDS = [
  { value: 'unary', label: 'Unary' },
  { value: 'server-streaming', label: 'Server Streaming' },
  { value: 'client-streaming', label: 'Client Streaming' },
  { value: 'bidi-streaming', label: 'Bidirectional Streaming' }
] as const;

function bodyModeOptions() {
  return [
    { value: 'none', label: 'none' },
    { value: 'json', label: 'json' },
    { value: 'text', label: 'raw' },
    { value: 'xml', label: 'xml' },
    { value: 'graphql', label: 'graphql' },
    { value: 'sparql', label: 'sparql' },
    { value: 'file', label: 'file' },
    { value: 'form-urlencoded', label: 'x-www-form-urlencoded' },
    { value: 'multipart', label: 'multipart/form-data' }
  ];
}

function checkOptions() {
  return [
    { value: 'status-equals', label: 'Status Equals' },
    { value: 'header-equals', label: 'Header Equals' },
    { value: 'header-includes', label: 'Header Includes' },
    { value: 'json-exists', label: 'JSON Path Exists' },
    { value: 'json-not-exists', label: 'JSON Path Missing' },
    { value: 'json-equals', label: 'JSON Path Equals' },
    { value: 'json-type', label: 'JSON Path Type' },
    { value: 'json-length', label: 'JSON Path Length' },
    { value: 'body-contains', label: 'Body Contains' },
    { value: 'body-regex', label: 'Body Regex' },
    { value: 'response-time-lt', label: 'Response Time <' },
    { value: 'number-gt', label: 'Number >' },
    { value: 'number-lt', label: 'Number <' },
    { value: 'number-between', label: 'Number Between' },
    { value: 'schema-match', label: 'JSON Schema Match' },
    { value: 'snapshot-match', label: 'Snapshot Match' }
  ];
}

function retryWhenOptions() {
  return [
    { value: 'network-error', label: 'network-error' },
    { value: '5xx', label: '5xx' },
    { value: 'assertion-failed', label: 'assertion-failed' }
  ];
}

type RequestSection = 'request' | 'validation' | 'automation';

type GraphqlIntrospectionState = {
  loading: boolean;
  endpoint?: string;
  checkedAt?: string;
  summary?: GraphqlSchemaSummary;
  error?: string;
};

function isGraphqlSchemaSummary(value: unknown): value is GraphqlSchemaSummary {
  const candidate = value as GraphqlSchemaSummary | undefined;
  return Boolean(candidate) &&
    typeof candidate?.ok === 'boolean' &&
    typeof candidate?.typeCount === 'number' &&
    Array.isArray(candidate?.queryFields) &&
    Array.isArray(candidate?.mutationFields) &&
    Array.isArray(candidate?.subscriptionFields) &&
    Array.isArray(candidate?.warnings);
}

function graphqlIntrospectionStateFromBody(body: RequestBody): GraphqlIntrospectionState {
  const cache = body.graphql?.schemaCache;
  if (!cache || !isGraphqlSchemaSummary(cache.summary)) return { loading: false };
  return {
    loading: false,
    endpoint: cache.endpoint || body.graphql?.schemaUrl,
    checkedAt: cache.checkedAt,
    summary: cache.summary
  };
}

type WebSocketRunState = {
  loading: boolean;
  result?: WebSocketRunResult;
  error?: string;
};

type WebSocketLiveState = {
  connecting: boolean;
  reconnecting?: boolean;
  closing: boolean;
  sendingIndex?: number;
  sessionId?: string;
  snapshot?: WebSocketLiveSnapshot;
  error?: string;
};

type GrpcMessageDraft = NonNullable<NonNullable<RequestBody['grpc']>['messages']>[number];
type WebSocketMessageDraft = NonNullable<NonNullable<RequestBody['websocket']>['messages']>[number];
type RequestVariableRow = RequestDocument['vars']['req'][number];
type GraphqlSavedOperation = NonNullable<NonNullable<RequestBody['graphql']>['savedOperations']>[number];

function looksLikeBase64Payload(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length < 12 || normalized.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/=\s]+$/.test(normalized);
}

function describeWebSocketPayload(bodyText: string): { kind: 'json' | 'text' | 'binary'; preview: string; detail: string } {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return { kind: 'text', preview: '', detail: 'empty payload' };
  }
  try {
    return {
      kind: 'json',
      preview: JSON.stringify(JSON.parse(trimmed), null, 2),
      detail: 'JSON payload'
    };
  } catch (_error) {
    if (looksLikeBase64Payload(trimmed)) {
      return {
        kind: 'binary',
        preview: trimmed,
        detail: `base64 payload · ${trimmed.length} chars`
      };
    }
    return {
      kind: 'text',
      preview: bodyText,
      detail: `${trimmed.length} chars`
    };
  }
}

function websocketStateFromBody(body: RequestBody): WebSocketRunState {
  return body.websocket?.lastRun
    ? { loading: false, result: body.websocket.lastRun }
    : { loading: false };
}

function splitRequestVariableRows(rows: RequestVariableRow[]) {
  return rows.reduce(
    (output, row) => {
      const normalized = normalizeRequestVariableRow(row, row.scope === 'prompt' ? 'prompt' : 'request');
      if (normalized.scope === 'prompt') {
        output.promptRows.push(normalized);
      } else {
        output.requestRows.push(normalized);
      }
      return output;
    },
    { requestRows: [] as RequestVariableRow[], promptRows: [] as RequestVariableRow[] }
  );
}

function requestSectionForTab(tab: RequestTab): RequestSection {
  if (tab === 'checks') return 'validation';
  if (tab === 'scripts' || tab === 'settings') return 'automation';
  return 'request';
}

function tabOptionsForSection(section: RequestSection) {
  if (section === 'validation') {
    return ['checks'] satisfies RequestTab[];
  }
  if (section === 'automation') {
    return ['scripts', 'settings'] satisfies RequestTab[];
  }
  return ['query', 'headers', 'body', 'preview'] satisfies RequestTab[];
}

function authStatusLabel(auth: AuthConfig) {
  if (auth.type === 'none') return 'Auth off';
  if (auth.type === 'inherit') return 'Auth inherits';
  if (auth.type === 'profile' && auth.profileName) return `Auth · ${auth.profileName}`;
  return `Auth · ${auth.type}`;
}

function RequestTabNavigation(props: {
  activeSection: RequestSection;
  activeTab: RequestTab;
  visibleTabs: Set<RequestTab>;
  allowCases: boolean;
  auth: AuthConfig;
  onTabChange: (tab: RequestTab) => void;
}) {
  const hasAuthOverride = props.auth.type !== 'inherit' && props.auth.type !== 'none';

  return (
    <>
      <div className="request-tab-tier">
        <button
          type="button"
          className={props.activeSection === 'request' ? 'request-tab-tier-button is-active' : 'request-tab-tier-button'}
          onClick={() => props.onTabChange('query')}
        >
          Request
        </button>
        <button
          type="button"
          className={props.activeSection === 'validation' ? 'request-tab-tier-button is-active' : 'request-tab-tier-button'}
          onClick={() => props.onTabChange('checks')}
          disabled={!props.allowCases}
        >
          Validation
        </button>
        <button
          type="button"
          className={props.activeSection === 'automation' ? 'request-tab-tier-button is-active' : 'request-tab-tier-button'}
          onClick={() => props.onTabChange('scripts')}
          disabled={!props.allowCases}
        >
          Automation
        </button>
        <button
          type="button"
          className={[
            'request-auth-quick',
            props.activeTab === 'auth' ? 'is-active' : '',
            hasAuthOverride ? 'has-auth' : ''
          ].filter(Boolean).join(' ')}
          onClick={() => props.onTabChange('auth')}
          aria-pressed={props.activeTab === 'auth'}
        >
          {authStatusLabel(props.auth)}
        </button>
      </div>
      <Tabs.List>
        {props.visibleTabs.has('query') ? <Tabs.Tab value="query">参数</Tabs.Tab> : null}
        {props.visibleTabs.has('headers') ? <Tabs.Tab value="headers">请求头</Tabs.Tab> : null}
        {props.visibleTabs.has('body') ? <Tabs.Tab value="body">请求体</Tabs.Tab> : null}
        {props.visibleTabs.has('checks') ? <Tabs.Tab value="checks" disabled={!props.allowCases}>断言</Tabs.Tab> : null}
        {props.visibleTabs.has('scripts') ? <Tabs.Tab value="scripts" disabled={!props.allowCases}>脚本</Tabs.Tab> : null}
        {props.visibleTabs.has('settings') ? <Tabs.Tab value="settings">设置</Tabs.Tab> : null}
        {props.visibleTabs.has('preview') ? <Tabs.Tab value="preview">预览</Tabs.Tab> : null}
      </Tabs.List>
    </>
  );
}

function WorkflowEmptyState(props: { title: string; detail: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="empty-workflow-state">
      <strong>{props.title}</strong>
      <span>{props.detail}</span>
      {props.actionLabel && props.onAction ? (
        <Button size="xs" variant="default" onClick={props.onAction}>
          {props.actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function appendEnabledQueryRows(url: string, rows: Array<{ name: string; value: string; enabled: boolean }>) {
  const enabledRows = rows.filter(row => row.enabled && row.name.trim());
  if (enabledRows.length === 0) return url;
  const params = new URLSearchParams();
  enabledRows.forEach(row => params.append(row.name, row.value));
  return `${url}${url.includes('?') ? '&' : '?'}${params.toString()}`;
}

function graphqlFieldsForOperation(summary: GraphqlSchemaSummary, operation: GraphqlOperationKind): GraphqlOperationFieldSummary[] {
  if (operation === 'mutation') {
    return summary.mutationFields.length > 0
      ? summary.mutationFields
      : summary.mutations.map(name => ({
          name,
          args: [],
          returnType: 'JSON',
          selection: [],
          selectionTree: [],
          selectionFragments: []
        }));
  }
  if (operation === 'subscription') {
    return summary.subscriptionFields.length > 0
      ? summary.subscriptionFields
      : summary.subscriptions.map(name => ({
          name,
          args: [],
          returnType: 'JSON',
          selection: [],
          selectionTree: [],
          selectionFragments: []
        }));
  }
  return summary.queryFields.length > 0
    ? summary.queryFields
    : summary.queries.map(name => ({
        name,
        args: [],
        returnType: 'JSON',
        selection: [],
        selectionTree: [],
        selectionFragments: []
      }));
}

type GraphqlExplorerState = {
  operation: GraphqlOperationKind;
  fieldName: string;
  selectedFields: string[];
  selectedFragments: string[];
};

function collectGraphqlFieldPaths(nodes: GraphqlSelectionFieldSummary[], basePath = ''): string[] {
  return nodes.flatMap(node => {
    const nodePath = graphqlSelectionPath(basePath, node.name);
    return [nodePath, ...collectGraphqlFieldPaths(node.children, nodePath)];
  });
}

function firstGraphqlExplorerState(summary: GraphqlSchemaSummary): GraphqlExplorerState | null {
  for (const operation of ['query', 'mutation', 'subscription'] as GraphqlOperationKind[]) {
    const field = graphqlFieldsForOperation(summary, operation)[0];
    if (field) {
      return {
        operation,
        fieldName: field.name,
        selectedFields: collectGraphqlFieldPaths(field.selectionTree || []),
        selectedFragments: []
      };
    }
  }
  return null;
}

function explorerStateForField(operation: GraphqlOperationKind, field: GraphqlOperationFieldSummary): GraphqlExplorerState {
  return {
    operation,
    fieldName: field.name,
    selectedFields: collectGraphqlFieldPaths(field.selectionTree || []),
    selectedFragments: []
  };
}

function removeGraphqlSelectionBranch(paths: string[], basePath: string) {
  return paths.filter(path => path !== basePath && !path.startsWith(`${basePath}.`) && !path.startsWith(`${basePath}::`));
}

function graphqlSavedOperationSummary(operation: GraphqlSavedOperation) {
  const firstLine = operation.query
    .split('\n')
    .map(line => line.trim())
    .find(Boolean);
  return firstLine || 'Empty query draft';
}

function graphqlFieldMatchesSearch(field: GraphqlOperationFieldSummary, search: string) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return true;
  if (field.name.toLowerCase().includes(normalizedSearch)) return true;
  if (field.returnType.toLowerCase().includes(normalizedSearch)) return true;
  return field.args.some(arg => arg.name.toLowerCase().includes(normalizedSearch) || arg.type.toLowerCase().includes(normalizedSearch));
}

function graphqlTypeMatchesSearch(type: GraphqlSchemaTypeSummary, search: string) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return true;
  if (type.name.toLowerCase().includes(normalizedSearch)) return true;
  if (type.kind.toLowerCase().includes(normalizedSearch)) return true;
  if (type.possibleTypes.some(name => name.toLowerCase().includes(normalizedSearch))) return true;
  if (type.enumValues.some(value => value.toLowerCase().includes(normalizedSearch))) return true;
  if (
    type.fields.some(field =>
      field.name.toLowerCase().includes(normalizedSearch) ||
      field.type.toLowerCase().includes(normalizedSearch) ||
      field.args.some(arg => arg.name.toLowerCase().includes(normalizedSearch) || arg.type.toLowerCase().includes(normalizedSearch))
    )
  ) {
    return true;
  }
  return type.inputFields.some(field => field.name.toLowerCase().includes(normalizedSearch) || field.type.toLowerCase().includes(normalizedSearch));
}

function graphqlTypeFieldMatchesSearch(field: GraphqlSchemaTypeFieldSummary, search: string) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return true;
  if (field.name.toLowerCase().includes(normalizedSearch)) return true;
  if (field.type.toLowerCase().includes(normalizedSearch)) return true;
  return field.args.some(arg => arg.name.toLowerCase().includes(normalizedSearch) || arg.type.toLowerCase().includes(normalizedSearch));
}

function graphqlArgumentMatchesSearch(argument: GraphqlFieldArgumentSummary, search: string) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return true;
  return argument.name.toLowerCase().includes(normalizedSearch) || argument.type.toLowerCase().includes(normalizedSearch);
}

function parseGraphqlOperationSignature(query: string) {
  const match = query.match(/\b(query|mutation|subscription)\b(?:\s+([_A-Za-z][_0-9A-Za-z]*))?/);
  return {
    kind: (match?.[1] as GraphqlOperationKind | undefined) || null,
    name: match?.[2] || ''
  };
}

function parseGraphqlVariablesSource(source: string) {
  const trimmed = source.trim();
  if (!trimmed) {
    return {
      error: undefined,
      value: {} as Record<string, unknown>,
      count: 0
    };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        error: 'Variables JSON must resolve to an object.',
        value: null,
        count: 0
      };
    }
    return {
      error: undefined,
      value: parsed as Record<string, unknown>,
      count: Object.keys(parsed).length
    };
  } catch (error) {
    return {
      error: (error as Error).message || 'Variables JSON is invalid.',
      value: null,
      count: 0
    };
  }
}

function graphqlNamedType(typeSignature: string) {
  return typeSignature.replace(/[[\]!]/g, '');
}

function graphqlPlaceholderForType(
  typeSignature: string,
  types: GraphqlSchemaTypeSummary[],
  depth = 0
): unknown {
  if (depth > 4) return {};
  const namedType = graphqlNamedType(typeSignature);
  if (!namedType) return '';
  if (typeSignature.includes('[')) {
    return [graphqlPlaceholderForType(typeSignature.replace(/[[\]!]/g, ''), types, depth + 1)];
  }
  switch (namedType.toLowerCase()) {
    case 'int':
    case 'float':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'id':
    case 'string':
    case 'uuid':
    case 'datetime':
      return '';
    default:
      break;
  }
  const typeSummary = types.find(type => type.name === namedType);
  if (!typeSummary) return '';
  if (typeSummary.enumValues.length > 0) {
    return typeSummary.enumValues[0] || '';
  }
  if (typeSummary.inputFields.length > 0) {
    return typeSummary.inputFields.reduce<Record<string, unknown>>((output, field) => {
      if (field.type.includes('!') || field.defaultValue) {
        output[field.name] = graphqlPlaceholderForType(field.type, types, depth + 1);
      }
      return output;
    }, {});
  }
  return '';
}

function graphqlVariableSeedForArgs(
  args: GraphqlFieldArgumentSummary[],
  types: GraphqlSchemaTypeSummary[]
) {
  return args.reduce<Record<string, unknown>>((output, arg) => {
    output[arg.name] = graphqlPlaceholderForType(arg.type, types);
    return output;
  }, {});
}

function createGrpcMessageDraft(index: number, content = '{}'): GrpcMessageDraft {
  return {
    name: `Message ${index + 1}`,
    content,
    enabled: true
  };
}

function summarizeGrpcDraft(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    return {
      kind: 'empty' as const,
      detail: 'empty payload',
      preview: '{}'
    };
  }
  try {
    const parsed = JSON.parse(trimmed);
    const topLevelKeys = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.keys(parsed as Record<string, unknown>).length
      : undefined;
    return {
      kind: 'json' as const,
      detail: topLevelKeys !== undefined ? `${topLevelKeys} top-level key${topLevelKeys === 1 ? '' : 's'}` : 'JSON payload',
      preview: JSON.stringify(parsed).slice(0, 120)
    };
  } catch (_error) {
    return {
      kind: 'text' as const,
      detail: `${trimmed.length} chars`,
      preview: trimmed.split('\n').find(Boolean)?.slice(0, 120) || trimmed.slice(0, 120)
    };
  }
}

export function RequestPanel(props: {
  workspace: WorkspaceIndex;
  activeEnvironmentName?: string;
  selectedEnvironment: EnvironmentDocument | null;
  request: RequestDocument;
  selectedCase: CaseDocument | null;
  activeTab: RequestTab;
  isRunning: boolean;
  isDirty: boolean;
  onTabChange: (tab: RequestTab) => void;
  onRequestChange: (request: RequestDocument) => void;
  onCasesChange: (cases: CaseDocument[]) => void;
  onCaseSelect?: (caseId: string | null) => void;
  onAddCase: () => void;
  onRun: () => void;
  onSave?: () => void;
  cases: CaseDocument[];
  allowCases?: boolean;
  latestResponseOk?: boolean;
  onSaveAsCase?: () => void;
  onAddToCollection?: () => void;
  requestInsight?: ResolvedRequestInsight | null;
  sessionSnapshot?: SessionSnapshot | null;
  onSaveAuthProfile?: (seed: string, auth: AuthConfig) => void;
  onRefreshRequestAuth?: () => void;
  onCopyText?: (value: string, successMessage: string) => void;
}) {
  const { request: requestDocument, selectedCase, selectedEnvironment, workspace } = props;
  const allowCases = props.allowCases ?? true;
  const effectiveMethod = selectedCase?.overrides.method || requestDocument.method;
  const effectiveKind = selectedCase?.overrides.kind || requestDocument.kind || 'http';
  const effectiveUrl = selectedCase?.overrides.url || requestDocument.url;
  const effectivePath = selectedCase?.overrides.path || requestDocument.path;
  const queryRows = selectedCase?.overrides.query ?? requestDocument.query;
  const pathRows = selectedCase?.overrides.pathParams ?? requestDocument.pathParams;
  const headerRows = selectedCase?.overrides.headers ?? requestDocument.headers;
  const body = selectedCase?.overrides.body || requestDocument.body;
  const graphqlBody = body.graphql || { query: '', variables: '{}', operationName: '', schemaUrl: '', savedOperations: [] };
  const grpcBody = body.grpc || {
    protoFile: '',
    importPaths: [],
    service: '',
    method: '',
    rpcKind: 'unary' as const,
    message: '{}',
    messages: []
  };
  const grpcMessages = grpcBody.messages?.length
    ? grpcBody.messages
    : [{ name: 'Message 1', content: grpcBody.message || '{}', enabled: true }];
  const websocketMessages = body.websocket?.messages?.length
    ? body.websocket.messages
    : [{ name: 'Message 1', body: '', kind: 'json' as const, enabled: true }];
  const websocketExamples = body.websocket?.examples || [];
  const auth = selectedCase?.overrides.auth || requestDocument.auth;
  const runtime = {
    ...requestDocument.runtime,
    ...(selectedCase?.overrides.runtime || {})
  };
  const { requestRows: requestVariableRows, promptRows: promptVariableRows } = splitRequestVariableRows(requestDocument.vars?.req || []);

  const resolvedInsight = useMemo(
    () =>
      props.requestInsight ||
      inspectResolvedRequest(workspace.project, requestDocument, selectedCase || undefined, selectedEnvironment || undefined),
    [props.requestInsight, workspace.project, requestDocument, selectedCase, selectedEnvironment]
  );
  const resolvedPreview = resolvedInsight.preview;
  const resolvedWebSocketUrl = appendEnabledQueryRows(resolvedPreview.url, resolvedPreview.query);
  const blockingDiagnostics = resolvedInsight.diagnostics.filter(item => item.blocking);
  const attentionDiagnostics = resolvedInsight.diagnostics.filter(item => !item.blocking);
  const activeSection = requestSectionForTab(props.activeTab);
  const visibleTabs = new Set<RequestTab>(tabOptionsForSection(activeSection));
  const [graphqlIntrospection, setGraphqlIntrospection] = useState<GraphqlIntrospectionState>(() => graphqlIntrospectionStateFromBody(body));
  const [graphqlExplorer, setGraphqlExplorer] = useState<GraphqlExplorerState | null>(() =>
    graphqlIntrospection.summary ? firstGraphqlExplorerState(graphqlIntrospection.summary) : null
  );
  const [graphqlSchemaSearch, setGraphqlSchemaSearch] = useState('');
  const [graphqlTypeTrail, setGraphqlTypeTrail] = useState<string[]>([]);
  const [graphqlFragmentStyle, setGraphqlFragmentStyle] = useState<GraphqlFragmentStyle>('inline');
  const [selectedGraphqlSavedOperation, setSelectedGraphqlSavedOperation] = useState<string | null>(
    () => graphqlBody.savedOperations?.[0]?.name || null
  );
  const [websocketRun, setWebsocketRun] = useState<WebSocketRunState>(() => websocketStateFromBody(body));
  const [websocketLive, setWebsocketLive] = useState<WebSocketLiveState>({ connecting: false, closing: false });
  const [selectedWebsocketEventIndex, setSelectedWebsocketEventIndex] = useState(0);

  useEffect(() => {
    setGraphqlIntrospection(current => {
      if (current.loading) return current;
      return graphqlIntrospectionStateFromBody(body);
    });
  }, [
    requestDocument.id,
    selectedCase?.id,
    body.graphql?.schemaCache?.endpoint,
    body.graphql?.schemaCache?.checkedAt
  ]);

  useEffect(() => {
    setGraphqlExplorer(current => {
      if (!graphqlIntrospection.summary) return null;
      if (!current) return firstGraphqlExplorerState(graphqlIntrospection.summary);
      const field = graphqlFieldsForOperation(graphqlIntrospection.summary, current.operation).find(
        item => item.name === current.fieldName
      );
      if (!field) return firstGraphqlExplorerState(graphqlIntrospection.summary);
      return current;
    });
  }, [graphqlIntrospection.summary, requestDocument.id, selectedCase?.id]);

  useEffect(() => {
    const savedOperations = graphqlBody.savedOperations || [];
    if (savedOperations.length === 0) {
      setSelectedGraphqlSavedOperation(null);
      return;
    }
    setSelectedGraphqlSavedOperation(current =>
      current && savedOperations.some(operation => operation.name === current) ? current : savedOperations[0]?.name || null
    );
  }, [graphqlBody.savedOperations, requestDocument.id, selectedCase?.id]);

  useEffect(() => {
    setWebsocketRun(current => {
      if (current.loading) return current;
      return websocketStateFromBody(body);
    });
  }, [
    requestDocument.id,
    selectedCase?.id,
    body.websocket?.lastRun?.ranAt,
    body.websocket?.lastRun?.durationMs
  ]);

  useEffect(() => {
    if (!websocketLive.sessionId) return;
    const sessionId = websocketLive.sessionId;
    let active = true;
    const interval = window.setInterval(() => {
      loadWebSocketLiveSnapshot(sessionId)
        .then(snapshot => {
          if (!active) return;
          setWebsocketLive(current =>
            current.sessionId === snapshot.sessionId
              ? { ...current, snapshot, error: undefined }
              : current
          );
        })
        .catch(error => {
          if (!active) return;
          const message = (error as Error).message || 'WebSocket live session ended';
          setWebsocketLive(current =>
            current.sessionId
              ? { ...current, sessionId: undefined, snapshot: current.snapshot, error: message }
              : current
          );
        });
    }, 750);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [websocketLive.sessionId]);

  useEffect(() => {
    const sessionId = websocketLive.sessionId;
    return () => {
      if (sessionId) {
        void closeWebSocketLive(sessionId).catch(() => undefined);
      }
    };
  }, [websocketLive.sessionId]);

  const graphqlExplorerField = useMemo(() => {
    if (!graphqlExplorer || !graphqlIntrospection.summary) return null;
    return (
      graphqlFieldsForOperation(graphqlIntrospection.summary, graphqlExplorer.operation).find(
        item => item.name === graphqlExplorer.fieldName
      ) || null
    );
  }, [graphqlExplorer, graphqlIntrospection.summary]);

  useEffect(() => {
    setGraphqlTypeTrail(current => {
      const availableTypes = new Set(graphqlIntrospection.summary?.types.map(type => type.name) || []);
      const filtered = current.filter(name => availableTypes.has(name));
      if (filtered.length > 0) return filtered;
      const explorerType = graphqlExplorerField?.namedType;
      return explorerType && availableTypes.has(explorerType) ? [explorerType] : [];
    });
  }, [graphqlExplorerField?.namedType, graphqlIntrospection.summary, requestDocument.id, selectedCase?.id]);

  const graphqlSelectedFieldSet = useMemo(
    () => new Set(graphqlExplorer?.selectedFields || []),
    [graphqlExplorer?.selectedFields]
  );
  const graphqlSelectedFragmentSet = useMemo(
    () => new Set(graphqlExplorer?.selectedFragments || []),
    [graphqlExplorer?.selectedFragments]
  );
  const graphqlSavedOperations = graphqlBody.savedOperations || [];
  const activeGraphqlSavedOperation = useMemo(
    () => graphqlSavedOperations.find(operation => operation.name === selectedGraphqlSavedOperation) || null,
    [graphqlSavedOperations, selectedGraphqlSavedOperation]
  );
  const graphqlSchemaTypes = graphqlIntrospection.summary?.types || [];
  const graphqlOperationSignature = useMemo(
    () => parseGraphqlOperationSignature(graphqlBody.query || ''),
    [graphqlBody.query]
  );
  const graphqlVariableState = useMemo(
    () => parseGraphqlVariablesSource(graphqlBody.variables || '{}'),
    [graphqlBody.variables]
  );
  const graphqlExplorerVariableSeed = useMemo(
    () => graphqlVariableSeedForArgs(graphqlExplorerField?.args || [], graphqlSchemaTypes),
    [graphqlExplorerField?.args, graphqlSchemaTypes]
  );
  const graphqlExplorerVariableSeedKeys = useMemo(
    () => Object.keys(graphqlExplorerVariableSeed),
    [graphqlExplorerVariableSeed]
  );
  const graphqlMissingExplorerVariableKeys = useMemo(() => {
    if (!graphqlVariableState.value) return graphqlExplorerVariableSeedKeys;
    return graphqlExplorerVariableSeedKeys.filter(
      key => !Object.prototype.hasOwnProperty.call(graphqlVariableState.value, key)
    );
  }, [graphqlExplorerVariableSeedKeys, graphqlVariableState.value]);
  const graphqlTypeTrailVisible = useMemo(
    () => graphqlTypeTrail.filter(name => graphqlSchemaTypes.some(type => type.name === name)),
    [graphqlTypeTrail, graphqlSchemaTypes]
  );
  const graphqlSelectedTypeName = graphqlTypeTrailVisible[graphqlTypeTrailVisible.length - 1] || null;
  const graphqlSelectedType = useMemo(
    () => graphqlSchemaTypes.find(type => type.name === graphqlSelectedTypeName) || null,
    [graphqlSchemaTypes, graphqlSelectedTypeName]
  );
  const graphqlMatchingTypes = useMemo(
    () => graphqlSchemaTypes.filter(type => graphqlTypeMatchesSearch(type, graphqlSchemaSearch)).slice(0, 12),
    [graphqlSchemaSearch, graphqlSchemaTypes]
  );
  const graphqlVisibleTypeFields = useMemo(
    () => graphqlSelectedType?.fields.filter(field => graphqlTypeFieldMatchesSearch(field, graphqlSchemaSearch)) || [],
    [graphqlSchemaSearch, graphqlSelectedType]
  );
  const graphqlVisibleInputFields = useMemo(
    () => graphqlSelectedType?.inputFields.filter(field => graphqlArgumentMatchesSearch(field, graphqlSchemaSearch)) || [],
    [graphqlSchemaSearch, graphqlSelectedType]
  );
  const graphqlVisibleEnumValues = useMemo(
    () =>
      graphqlSelectedType?.enumValues.filter(value =>
        graphqlSchemaSearch.trim() ? value.toLowerCase().includes(graphqlSchemaSearch.trim().toLowerCase()) : true
      ) || [],
    [graphqlSchemaSearch, graphqlSelectedType]
  );
  const graphqlVisiblePossibleTypes = useMemo(
    () =>
      graphqlSelectedType?.possibleTypes.filter(typeName =>
        graphqlSchemaSearch.trim() ? typeName.toLowerCase().includes(graphqlSchemaSearch.trim().toLowerCase()) : true
      ) || [],
    [graphqlSchemaSearch, graphqlSelectedType]
  );

  function updateSelectedCase(updater: (current: CaseDocument) => CaseDocument) {
    if (!selectedCase) return;
    props.onCasesChange(props.cases.map(item => (item.id === selectedCase.id ? updater(item) : item)));
  }

  function updateAuth(nextAuth: AuthConfig) {
    if (selectedCase) {
      updateSelectedCase(current => ({
        ...current,
        overrides: { ...current.overrides, auth: nextAuth }
      }));
      return;
    }
    props.onRequestChange({ ...requestDocument, auth: nextAuth });
  }

  function updateBody(nextBody: RequestBody) {
    if (selectedCase) {
      updateSelectedCase(current => ({
        ...current,
        overrides: { ...current.overrides, body: nextBody }
      }));
      return;
    }
    props.onRequestChange({ ...requestDocument, body: nextBody });
  }

  function updateChecks(nextChecks: CaseCheck[]) {
    if (!selectedCase) return;
    updateSelectedCase(current => ({
      ...current,
      checks: nextChecks
    }));
  }

  function updateRuntime(nextRuntime: { timeoutMs: number; followRedirects: boolean }) {
    if (selectedCase) {
      updateSelectedCase(current => ({
        ...current,
        overrides: { ...current.overrides, runtime: nextRuntime }
      }));
      return;
    }
    props.onRequestChange({ ...requestDocument, runtime: nextRuntime });
  }

  function updateRequestVariableSection(scope: 'request' | 'prompt', rows: RequestVariableRow[]) {
    const normalizedRows = rows.map(row => normalizeRequestVariableRow(row, scope));
    props.onRequestChange({
      ...requestDocument,
      vars: {
        req: scope === 'prompt' ? [...requestVariableRows, ...normalizedRows] : [...normalizedRows, ...promptVariableRows],
        res: requestDocument.vars?.res || []
      }
    });
  }

  async function handlePickBodyFile(index: number) {
    const selectedPath = await chooseRequestBodyFile();
    if (!selectedPath) return;
    const nextFields = [...(body.fields || [])];
    nextFields[index] = {
      ...nextFields[index],
      kind: 'file',
      filePath: selectedPath,
      value: selectedPath
    };
    updateBody({ ...body, fields: nextFields });
  }

  async function handlePickRawBodyFile() {
    const selectedPath = await chooseRequestBodyFile();
    if (!selectedPath) return;
    updateBody({ ...body, mode: 'file', file: selectedPath, text: selectedPath });
    return selectedPath;
  }

  async function handlePickGrpcProtoFile() {
    return chooseRequestBodyFile();
  }

  async function handleGraphqlIntrospection() {
    try {
      const introspectionRequest = buildGraphqlIntrospectionRequest(resolvedPreview);
      setGraphqlIntrospection({
        loading: true,
        endpoint: introspectionRequest.url
      });
      const response = await sendRequest(introspectionRequest);
      const summary = summarizeGraphqlSchema(response.bodyText);
      const nextState = {
        loading: false,
        endpoint: introspectionRequest.url,
        checkedAt: new Date().toLocaleTimeString(),
        summary,
        error: response.ok ? undefined : `${response.status} ${response.statusText || 'GraphQL introspection failed'}`
      };
      setGraphqlIntrospection(nextState);
      if (response.ok && summary.ok) {
        updateBody({
          ...body,
          mode: 'graphql',
          mimeType: 'application/json',
          graphql: {
            ...graphqlBody,
            schemaCache: {
              endpoint: introspectionRequest.url,
              checkedAt: nextState.checkedAt,
              summary
            }
          }
        });
        notifications.show({ color: 'teal', message: `GraphQL schema loaded: ${summary.typeCount} types` });
      } else {
        notifications.show({ color: 'orange', message: summary.warnings[0] || nextState.error || 'GraphQL schema response needs review' });
      }
    } catch (error) {
      const message = (error as Error).message || 'GraphQL introspection failed';
      setGraphqlIntrospection({
        loading: false,
        endpoint: resolvedPreview.body.graphql?.schemaUrl || resolvedPreview.url,
        error: message
      });
      notifications.show({ color: 'red', message });
    }
  }

  function selectGraphqlExplorerField(operation: GraphqlOperationKind, field: GraphqlOperationFieldSummary) {
    setGraphqlExplorer(explorerStateForField(operation, field));
    if (field.namedType) {
      setGraphqlTypeTrail([field.namedType]);
    }
  }

  function openGraphqlType(typeName?: string | null) {
    if (!typeName || !graphqlSchemaTypes.some(type => type.name === typeName)) return;
    setGraphqlTypeTrail(current => {
      const existingIndex = current.indexOf(typeName);
      if (existingIndex >= 0) {
        return current.slice(0, existingIndex + 1);
      }
      return [...current, typeName];
    });
  }

  function renderGraphqlTypePill(typeName: string | undefined, label: string, tone: 'default' | 'muted' = 'default') {
    const inspectable = Boolean(typeName && graphqlSchemaTypes.some(type => type.name === typeName));
    if (!inspectable) {
      return <code>{label}</code>;
    }
    return (
      <button
        type="button"
        className={`graphql-type-chip${graphqlSelectedTypeName === typeName ? ' is-active' : ''}${tone === 'muted' ? ' is-muted' : ''}`}
        onClick={() => openGraphqlType(typeName)}
        title={`Inspect ${typeName}`}
      >
        {label}
      </button>
    );
  }

  function toggleGraphqlExplorerField(path: string, checked: boolean, node: GraphqlSelectionFieldSummary) {
    setGraphqlExplorer(current => {
      if (!current) return current;
      const nextFields = checked
        ? Array.from(new Set([...current.selectedFields, path, ...collectGraphqlFieldPaths(node.children, path)]))
        : removeGraphqlSelectionBranch(current.selectedFields, path);
      const nextFragments = checked
        ? current.selectedFragments
        : removeGraphqlSelectionBranch(current.selectedFragments, path);
      return {
        ...current,
        selectedFields: nextFields,
        selectedFragments: nextFragments
      };
    });
  }

  function toggleGraphqlExplorerFragment(path: string, checked: boolean, fragment: GraphqlSelectionFragmentSummary) {
    setGraphqlExplorer(current => {
      if (!current) return current;
      const nextFragments = checked
        ? Array.from(new Set([...current.selectedFragments, path]))
        : removeGraphqlSelectionBranch(current.selectedFragments, path);
      const nextFields = checked
        ? Array.from(new Set([...current.selectedFields, ...collectGraphqlFieldPaths(fragment.selection, path)]))
        : removeGraphqlSelectionBranch(current.selectedFields, path);
      return {
        ...current,
        selectedFields: nextFields,
        selectedFragments: nextFragments
      };
    });
  }

  function resetGraphqlExplorerSelection() {
    if (!graphqlExplorerField || !graphqlExplorer) return;
    setGraphqlExplorer(explorerStateForField(graphqlExplorer.operation, graphqlExplorerField));
  }

  function applyGraphqlOperationDraft(operation: GraphqlOperationKind, fieldName: string) {
    if (!graphqlIntrospection.summary) return;
    const draft = buildGraphqlOperationDraft(graphqlIntrospection.summary, operation, fieldName, {
      selectedFields:
        graphqlExplorer?.operation === operation && graphqlExplorer.fieldName === fieldName
          ? graphqlExplorer.selectedFields
          : undefined,
      selectedFragments:
        graphqlExplorer?.operation === operation && graphqlExplorer.fieldName === fieldName
          ? graphqlExplorer.selectedFragments
          : undefined,
      fragmentStyle: graphqlFragmentStyle
    });
    updateBody({
      ...body,
      mode: 'graphql',
      mimeType: 'application/json',
      graphql: {
        ...graphqlBody,
        query: draft.query,
        variables: draft.variables,
        operationName: draft.operationName
      }
    });
    notifications.show({ color: 'teal', message: `${draft.operationName} inserted` });
  }

  function updateGraphqlBody(patch: Partial<NonNullable<RequestBody['graphql']>>) {
    updateBody({
      ...body,
      mode: 'graphql',
      mimeType: 'application/json',
      graphql: {
        ...graphqlBody,
        ...patch
      }
    });
  }

  function clearGraphqlSchemaCache() {
    const { schemaCache: _schemaCache, ...nextGraphql } = graphqlBody;
    updateBody({
      ...body,
      graphql: nextGraphql
    });
    setGraphqlIntrospection({ loading: false });
    notifications.show({ color: 'blue', message: 'GraphQL schema cache cleared' });
  }

  async function saveGraphqlOperationDraft() {
    const suggestedName =
      activeGraphqlSavedOperation?.name ||
      graphqlBody.operationName ||
      graphqlExplorerField?.name ||
      `saved-${graphqlSavedOperations.length + 1}`;
    const name = await promptForText({
      title: 'Save GraphQL Draft',
      label: 'Draft Name',
      description: 'Keep a reusable operation snapshot with the current query and variables.',
      defaultValue: suggestedName,
      placeholder: 'get-user-by-id',
      confirmLabel: 'Save Draft',
      validate: value => (value ? null : 'Enter a draft name.')
    });
    if (!name) return;
    const nextDraft: GraphqlSavedOperation = {
      name,
      query: graphqlBody.query || '',
      variables: graphqlBody.variables || '{}',
      operationName: graphqlBody.operationName || undefined,
      updatedAt: new Date().toISOString()
    };
    const nextSavedOperations = [...graphqlSavedOperations.filter(operation => operation.name !== name), nextDraft].sort((a, b) =>
      a.name.localeCompare(b.name, 'zh-CN')
    );
    setSelectedGraphqlSavedOperation(name);
    updateGraphqlBody({ savedOperations: nextSavedOperations });
    notifications.show({ color: 'teal', message: `Saved GraphQL draft "${name}"` });
  }

  function loadGraphqlSavedOperation(name: string | null) {
    if (!name) return;
    const savedOperation = graphqlSavedOperations.find(operation => operation.name === name);
    if (!savedOperation) return;
    setSelectedGraphqlSavedOperation(savedOperation.name);
    updateGraphqlBody({
      query: savedOperation.query,
      variables: savedOperation.variables || '{}',
      operationName: savedOperation.operationName || ''
    });
    notifications.show({ color: 'blue', message: `Loaded GraphQL draft "${savedOperation.name}"` });
  }

  async function deleteGraphqlSavedOperation(name: string | null) {
    if (!name) return;
    const confirmed = await confirmAction({
      title: 'Delete GraphQL Draft',
      message: `Remove "${name}" from this request?`,
      detail: 'This only deletes the saved snapshot. The current editor contents stay as-is.',
      confirmLabel: 'Delete Draft'
    });
    if (!confirmed) return;
    const nextSavedOperations = graphqlSavedOperations.filter(operation => operation.name !== name);
    setSelectedGraphqlSavedOperation(nextSavedOperations[0]?.name || null);
    updateGraphqlBody({ savedOperations: nextSavedOperations });
    notifications.show({ color: 'teal', message: `Deleted GraphQL draft "${name}"` });
  }

  function formatGraphqlVariables() {
    const source = graphqlBody.variables?.trim() || '{}';
    try {
      const formatted = JSON.stringify(JSON.parse(source), null, 2);
      updateGraphqlBody({ variables: formatted });
      notifications.show({ color: 'teal', message: 'GraphQL variables formatted' });
    } catch (error) {
      notifications.show({ color: 'red', message: (error as Error).message || 'Variables JSON is invalid' });
    }
  }

  function syncGraphqlOperationName() {
    if (!graphqlOperationSignature.name) return;
    updateGraphqlBody({ operationName: graphqlOperationSignature.name });
    notifications.show({ color: 'teal', message: `Operation name set to "${graphqlOperationSignature.name}"` });
  }

  function seedGraphqlVariablesFromExplorer() {
    if (!graphqlExplorerField || graphqlExplorerVariableSeedKeys.length === 0) {
      notifications.show({ color: 'orange', message: 'Select a field with arguments before seeding variables.' });
      return;
    }
    if (!graphqlVariableState.value) {
      notifications.show({ color: 'red', message: graphqlVariableState.error || 'Variables JSON is invalid' });
      return;
    }
    const nextVariables = {
      ...graphqlExplorerVariableSeed,
      ...graphqlVariableState.value
    };
    const addedCount = graphqlMissingExplorerVariableKeys.length;
    updateGraphqlBody({
      variables: JSON.stringify(nextVariables, null, 2),
      operationName: graphqlBody.operationName || graphqlOperationSignature.name || graphqlExplorerField.name
    });
    notifications.show({
      color: addedCount > 0 ? 'teal' : 'blue',
      message: addedCount > 0 ? `Seeded ${addedCount} GraphQL variable placeholder${addedCount === 1 ? '' : 's'}` : 'All explorer variables were already present'
    });
  }

  function updateWebSocketMessages(messages: NonNullable<RequestBody['websocket']>['messages']) {
    updateBody({
      ...body,
      websocket: {
        ...(body.websocket || {}),
        messages,
        examples: body.websocket?.examples || []
      }
    });
  }

  function updateGrpcBody(patch: Partial<NonNullable<RequestBody['grpc']>>) {
    updateBody({
      ...body,
      mode: 'none',
      mimeType: 'application/grpc',
      grpc: {
        ...grpcBody,
        ...patch
      }
    });
  }

  function updateGrpcMessages(messages: GrpcMessageDraft[]) {
    updateGrpcBody({ messages });
  }

  function addGrpcMessage(content = grpcBody.message || grpcMessages[grpcMessages.length - 1]?.content || '{}') {
    updateGrpcMessages([...grpcMessages, createGrpcMessageDraft(grpcMessages.length, content)]);
  }

  function duplicateGrpcMessage(index: number) {
    const source = grpcMessages[index];
    if (!source) return;
    updateGrpcMessages([
      ...grpcMessages.slice(0, index + 1),
      createGrpcMessageDraft(index + 1, source.content || '{}'),
      ...grpcMessages.slice(index + 1)
    ]);
  }

  function moveGrpcMessage(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= grpcMessages.length) return;
    const next = [...grpcMessages];
    const [current] = next.splice(index, 1);
    next.splice(targetIndex, 0, current);
    updateGrpcMessages(next);
  }

  function normalizeGrpcMessageNames() {
    updateGrpcMessages(
      grpcMessages.map((message, index) => ({
        ...message,
        name: !message.name.trim() || /^Message \d+$/.test(message.name.trim()) ? `Message ${index + 1}` : message.name
      }))
    );
  }

  function seedGrpcMessagesFromUnary() {
    const source = grpcBody.message || grpcMessages.find(message => message.enabled !== false)?.content || '{}';
    updateGrpcMessages([createGrpcMessageDraft(0, source)]);
  }

  function updateWebSocketExamples(examples: NonNullable<RequestBody['websocket']>['examples']) {
    updateBody({
      ...body,
      websocket: {
        ...(body.websocket || {}),
        messages: websocketMessages,
        examples
      }
    });
  }

  function saveWebSocketExample(message: WebSocketMessageDraft) {
    const normalizedName = message.name.trim() || `Example ${websocketExamples.length + 1}`;
    const deduped = websocketExamples.filter(item => item.name !== normalizedName);
    updateWebSocketExamples([
      ...deduped,
      {
        ...message,
        name: normalizedName,
        enabled: true
      }
    ]);
    notifications.show({ color: 'teal', message: `${normalizedName} saved to examples` });
  }

  function appendWebSocketExample(example: WebSocketMessageDraft) {
    updateWebSocketMessages([
      ...websocketMessages,
      {
        ...example,
        name: example.name || `Message ${websocketMessages.length + 1}`,
        enabled: true
      }
    ]);
  }

  function persistWebSocketRun(result: WebSocketRunResult) {
    updateBody({
      ...body,
      websocket: {
        ...(body.websocket || {}),
        messages: websocketMessages,
        examples: body.websocket?.examples || [],
        lastRun: {
          ok: result.ok,
          url: result.url,
          durationMs: result.durationMs,
          events: result.events,
          ranAt: new Date().toISOString()
        }
      }
    });
  }

  async function handleWebSocketRun() {
    try {
      setWebsocketRun({ loading: true });
      const result = await runWebSocketSession({
        url: resolvedWebSocketUrl,
        headers: resolvedPreview.headers.filter(row => row.enabled),
        messages: resolvedPreview.body.websocket?.messages || websocketMessages,
        timeoutMs: resolvedPreview.timeoutMs
      });
      setWebsocketRun({ loading: false, result });
      persistWebSocketRun(result);
      notifications.show({ color: 'teal', message: `WebSocket session captured ${result.events.length} events` });
    } catch (error) {
      const message = (error as Error).message || 'WebSocket session failed';
      setWebsocketRun({ loading: false, error: message });
      notifications.show({ color: 'red', message });
    }
  }

  async function handleWebSocketLiveConnect() {
    try {
      setWebsocketLive(current => ({ ...current, connecting: true, error: undefined }));
      if (websocketLive.sessionId) {
        await closeWebSocketLive(websocketLive.sessionId).catch(() => undefined);
      }
      const snapshot = await connectWebSocketLive({
        url: resolvedWebSocketUrl,
        headers: resolvedPreview.headers.filter(row => row.enabled),
        timeoutMs: resolvedPreview.timeoutMs
      });
      setWebsocketLive({ connecting: false, closing: false, sessionId: snapshot.sessionId, snapshot });
      setWebsocketRun({ loading: false, result: snapshot });
      notifications.show({ color: 'teal', message: 'WebSocket connected' });
    } catch (error) {
      const message = (error as Error).message || 'WebSocket live connect failed';
      setWebsocketLive({ connecting: false, closing: false, error: message });
      notifications.show({ color: 'red', message });
    }
  }

  async function handleWebSocketReconnect() {
    try {
      setWebsocketLive(current => ({ ...current, reconnecting: true, error: undefined }));
      if (websocketLive.sessionId) {
        await closeWebSocketLive(websocketLive.sessionId).catch(() => undefined);
      }
      const snapshot = await connectWebSocketLive({
        url: resolvedWebSocketUrl,
        headers: resolvedPreview.headers.filter(row => row.enabled),
        timeoutMs: resolvedPreview.timeoutMs
      });
      setWebsocketLive({
        connecting: false,
        reconnecting: false,
        closing: false,
        sessionId: snapshot.sessionId,
        snapshot
      });
      setWebsocketRun({ loading: false, result: snapshot });
      notifications.show({ color: 'teal', message: 'WebSocket reconnected' });
    } catch (error) {
      const message = (error as Error).message || 'WebSocket reconnect failed';
      setWebsocketLive({ connecting: false, reconnecting: false, closing: false, error: message });
      notifications.show({ color: 'red', message });
    }
  }

  async function handleWebSocketLiveSend(index: number) {
    if (!websocketLive.sessionId) return;
    try {
      setWebsocketLive(current => ({ ...current, sendingIndex: index, error: undefined }));
      const resolvedMessage = resolvedPreview.body.websocket?.messages?.[index] || websocketMessages[index];
      const snapshot = await sendWebSocketLiveMessage({
        sessionId: websocketLive.sessionId,
        message: {
          ...resolvedMessage,
          kind: resolvedMessage.kind || 'json',
          enabled: true
        }
      });
      setWebsocketLive(current => ({ ...current, sendingIndex: undefined, snapshot }));
      setWebsocketRun({ loading: false, result: snapshot });
    } catch (error) {
      const message = (error as Error).message || 'WebSocket live send failed';
      setWebsocketLive(current => ({ ...current, sendingIndex: undefined, error: message }));
      notifications.show({ color: 'red', message });
    }
  }

  async function handleWebSocketLiveClose() {
    if (!websocketLive.sessionId) return;
    try {
      setWebsocketLive(current => ({ ...current, closing: true, error: undefined }));
      const snapshot = await closeWebSocketLive(websocketLive.sessionId);
      setWebsocketLive({ connecting: false, closing: false, snapshot });
      setWebsocketRun({ loading: false, result: snapshot });
      persistWebSocketRun(snapshot);
      notifications.show({ color: 'blue', message: 'WebSocket closed' });
    } catch (error) {
      const message = (error as Error).message || 'WebSocket live close failed';
      setWebsocketLive(current => ({ ...current, closing: false, error: message }));
      notifications.show({ color: 'red', message });
    }
  }

  function clearWebSocketTimeline() {
    const { lastRun: _lastRun, ...nextWebSocket } = body.websocket || { messages: websocketMessages, examples: websocketExamples };
    updateBody({
      ...body,
      websocket: nextWebSocket
    });
    setWebsocketRun({ loading: false });
    setWebsocketLive(current => ({ ...current, snapshot: undefined, error: undefined }));
    notifications.show({ color: 'blue', message: 'WebSocket timeline cleared' });
  }

  function applyUrlChange(nextUrl: string) {
    if (selectedCase) {
      updateSelectedCase(current => ({ ...current, overrides: { ...current.overrides, url: nextUrl } }));
      return;
    }
    props.onRequestChange({ ...requestDocument, url: nextUrl });
  }

  function applyPastedRequest(text: string) {
    const parsed = parseCurlCommand(text);
    if (!parsed) {
      applyUrlChange(text);
      return false;
    }

    if (selectedCase) {
      updateSelectedCase(current => ({
        ...current,
        overrides: {
          ...current.overrides,
          method: parsed.method,
          url: parsed.url,
          path: parsed.path,
          query: parsed.query,
          headers: parsed.headers,
          body: parsed.body,
          auth: parsed.auth
        }
      }));
      notifications.show({ color: 'teal', message: 'cURL imported into the current request' });
      return true;
    }

    props.onRequestChange({
      ...requestDocument,
      method: parsed.method,
      url: parsed.url,
      path: parsed.path,
      query: parsed.query,
      headers: parsed.headers,
      body: parsed.body,
      auth: parsed.auth
    });
    notifications.show({ color: 'teal', message: 'cURL imported into the current request' });
    return true;
  }

  const websocketTimeline = websocketLive.snapshot || websocketRun.result;
  const isWebSocketLiveConnected = Boolean(websocketLive.sessionId);
  const selectedWebsocketEvent = websocketTimeline?.events[selectedWebsocketEventIndex] || websocketTimeline?.events[0];
  const selectedWebsocketEventPreview = selectedWebsocketEvent ? describeWebSocketPayload(selectedWebsocketEvent.body) : null;
  const grpcEnabledMessageCount = grpcMessages.filter(message => message.enabled !== false).length;
  const grpcMessageSummaries = grpcMessages.map(message => summarizeGrpcDraft(message.content || ''));
  const grpcBindingReady = Boolean((grpcBody.protoFile || '').trim() && (grpcBody.service || '').trim() && (grpcBody.method || '').trim());

  useEffect(() => {
    if (!websocketTimeline?.events.length) {
      setSelectedWebsocketEventIndex(0);
      return;
    }
    setSelectedWebsocketEventIndex(current => Math.min(current, websocketTimeline.events.length - 1));
  }, [websocketTimeline?.events.length, websocketTimeline?.durationMs, websocketTimeline?.url]);

  function renderGraphqlExplorerNodes(nodes: GraphqlSelectionFieldSummary[], basePath = '', depth = 0): React.JSX.Element[] {
    return nodes.map(node => {
      const path = graphqlSelectionPath(basePath, node.name);
      const checked = graphqlSelectedFieldSet.has(path);
      const hasChildren = node.children.length > 0 || node.fragments.length > 0;
      return (
        <div className="graphql-explorer-node" key={path} data-depth={depth}>
          <div className="graphql-explorer-row">
            <Checkbox
              checked={checked}
              onChange={event => toggleGraphqlExplorerField(path, event.currentTarget.checked, node)}
            />
            <span className="graphql-explorer-name">{node.name}</span>
            {renderGraphqlTypePill(node.namedType, node.returnType, 'muted')}
            {node.fragments.length > 0 ? <Badge size="xs" variant="light" color="violet">fragments</Badge> : null}
          </div>
          {checked && hasChildren ? (
            <div className="graphql-explorer-children">
              {node.children.length > 0 ? renderGraphqlExplorerNodes(node.children, path, depth + 1) : null}
              {node.fragments.length > 0 ? renderGraphqlExplorerFragments(node.fragments, path, depth + 1) : null}
            </div>
          ) : null}
        </div>
      );
    });
  }

  function renderGraphqlExplorerFragments(
    fragments: GraphqlSelectionFragmentSummary[],
    basePath = '',
    depth = 0
  ): React.JSX.Element[] {
    return fragments.map(fragment => {
      const path = graphqlFragmentPath(basePath, fragment.typeName);
      const checked = graphqlSelectedFragmentSet.has(path);
      return (
        <div className="graphql-explorer-fragment" key={path} data-depth={depth}>
          <div className="graphql-explorer-row graphql-explorer-row-fragment">
            <Checkbox
              checked={checked}
              onChange={event => toggleGraphqlExplorerFragment(path, event.currentTarget.checked, fragment)}
            />
            <span className="graphql-explorer-name">... on {fragment.typeName}</span>
            <Badge size="xs" variant="light" color="grape">fragment</Badge>
          </div>
          {checked && fragment.selection.length > 0 ? (
            <div className="graphql-explorer-children">
              {renderGraphqlExplorerNodes(fragment.selection, path, depth + 1)}
            </div>
          ) : null}
        </div>
      );
    });
  }

  return (
    <div className="request-panel">
      <div className="request-header-compact">
        <div className="request-header-meta">
          <div className="request-header-meta-copy">
            <Text size="md" fw={700}>
              {selectedCase ? `${requestDocument.name} · ${selectedCase.name}` : requestDocument.name}
            </Text>
          </div>
          <Group gap="xs" wrap="wrap" className="request-header-meta-pills">
            {selectedCase ? (
              <Badge variant="light" color="indigo" size="xs">
                Case Active
              </Badge>
            ) : null}
            {props.isDirty ? (
              <Badge variant="filled" color="orange" size="xs">
                Unsaved
              </Badge>
            ) : null}
          </Group>
        </div>

        {allowCases ? (
          <div className="request-case-strip">
            <Select
              size="xs"
              label="Case"
              placeholder="Base request"
              value={selectedCase?.id || '__base__'}
              data={[
                { value: '__base__', label: 'Base Request' },
                ...props.cases.map(caseItem => ({
                  value: caseItem.id,
                  label: caseItem.name
                }))
              ]}
              onChange={value => props.onCaseSelect?.(value === '__base__' ? null : value || null)}
            />
            <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={() => props.onAddCase()}>
              New Case
            </Button>
          </div>
        ) : null}

        <RequestUrlBar
          kind={effectiveKind}
          method={effectiveMethod}
          url={effectiveUrl}
          isRunning={props.isRunning}
          canSave={!!props.onSave}
          onSave={props.onSave}
          onRun={props.onRun}
          onUrlChange={applyUrlChange}
          onKindChange={value => {
            const nextKind = value || 'http';
            const nextBody =
              nextKind === 'graphql' && body.mode !== 'graphql'
                ? {
                    ...body,
                    mode: 'graphql' as const,
                    mimeType: 'application/json',
                    graphql: body.graphql || { query: '', variables: '{}', operationName: '', schemaUrl: '', savedOperations: [] }
                  }
                : nextKind === 'grpc'
                ? {
                    ...body,
                    mode: 'none' as const,
                    mimeType: 'application/grpc',
                    grpc: body.grpc || {
                      protoFile: '',
                      importPaths: [],
                      service: '',
                      method: '',
                      rpcKind: 'unary',
                      message: '{}',
                      messages: []
                    }
                  }
                : nextKind === 'websocket'
                ? {
                    ...body,
                    mode: 'none' as const,
                    websocket: body.websocket || {
                      messages: [{ name: 'Message 1', body: '', kind: 'json', enabled: true }],
                      examples: []
                    }
                  }
                : nextKind === 'script'
                ? {
                    ...body,
                    mode: 'text' as const,
                    mimeType: 'application/javascript',
                    text: body.text || requestDocument.scripts.preRequest || ''
                  }
                : body;
            const nextMethod = nextKind === 'graphql' || nextKind === 'grpc' ? 'POST' : nextKind === 'websocket' ? 'GET' : effectiveMethod;
            if (selectedCase) {
              updateSelectedCase(current => ({ ...current, overrides: { ...current.overrides, kind: nextKind, method: nextMethod, body: nextBody } }));
            } else {
              props.onRequestChange({ ...requestDocument, kind: nextKind, method: nextMethod, body: nextBody });
            }
          }}
          onMethodChange={value => {
            const nextMethod = value;
            if (selectedCase) {
              updateSelectedCase(current => ({ ...current, overrides: { ...current.overrides, method: nextMethod } }));
            } else {
              props.onRequestChange({ ...requestDocument, method: nextMethod });
            }
          }}
          onPaste={applyPastedRequest}
        />
      </div>

      {blockingDiagnostics.length > 0 || attentionDiagnostics.length > 0 ? (
        <div className="request-diagnostics-banner">
          {blockingDiagnostics.length > 0 ? (
            <Badge color="red" variant="filled">{blockingDiagnostics.length} 个阻塞项</Badge>
          ) : null}
          {attentionDiagnostics.length > 0 ? (
            <Badge color="orange" variant="light">{attentionDiagnostics.length} 个待确认项</Badge>
          ) : null}
          <Text size="sm" c="dimmed">
            {blockingDiagnostics[0]?.message || attentionDiagnostics[0]?.message}
          </Text>
        </div>
      ) : null}

      <Tabs value={props.activeTab} onChange={value => props.onTabChange(value as RequestTab)} className="request-tabs-ide" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <RequestTabNavigation
          activeSection={activeSection}
          activeTab={props.activeTab}
          visibleTabs={visibleTabs}
          allowCases={allowCases}
          auth={auth}
          onTabChange={props.onTabChange}
        />
        {props.activeTab === 'auth' ? (
          <div className="request-tab-priority-note">
            Auth is kept as a request status entry so the common Query, Headers, Body and Preview loop stays compact.
          </div>
        ) : null}

        <div className="request-tab-content">
          <Tabs.Panel value="preview">
            <div className="request-preview-card-embedded">
              <div className="request-preview-head">
                <div>
                  <Text size="xs" fw={700} c="dimmed">Resolved Request</Text>
                  <Text size="xs" c="dimmed">
                    {resolvedPreview.method} {resolvedPreview.url}
                  </Text>
                </div>
                <Group gap="xs">
                  <Badge variant="light" color="indigo">{resolvedPreview.authSource}</Badge>
                  <Badge variant="light" color="gray">{resolvedPreview.timeoutMs} ms</Badge>
                  <Badge variant="light" color={resolvedPreview.followRedirects ? 'green' : 'orange'}>
                    {resolvedPreview.followRedirects ? 'follow redirects' : 'no redirects'}
                  </Badge>
                </Group>
              </div>
              <div className="request-preview-grid">
                <CodeEditor
                  value={JSON.stringify(
                    {
                      headers: resolvedPreview.headers.filter(item => item.enabled),
                      query: resolvedPreview.query.filter(item => item.enabled)
                    },
                    null,
                    2
                  )}
                  readOnly
                  language="json"
                  minHeight="140px"
                />
                <CodeEditor
                  value={
                    effectiveKind === 'grpc'
                      ? JSON.stringify(
                          {
                            mode: 'grpc',
                            endpoint: resolvedPreview.url,
                            service: resolvedPreview.body.grpc?.service || '',
                            method: resolvedPreview.body.grpc?.method || '',
                            rpcKind: resolvedPreview.body.grpc?.rpcKind || 'unary',
                            protoFile: resolvedPreview.body.grpc?.protoFile || '',
                            importPaths: resolvedPreview.body.grpc?.importPaths || [],
                            message: resolvedPreview.body.grpc?.message || '',
                            messages: resolvedPreview.body.grpc?.messages || []
                          },
                          null,
                          2
                        )
                      : resolvedPreview.body.mode === 'json'
                      ? resolvedPreview.body.text
                      : JSON.stringify(
                          {
                            mode: resolvedPreview.body.mode,
                            grpc: resolvedPreview.body.grpc,
                            fields: resolvedPreview.body.fields,
                            text: resolvedPreview.body.text
                          },
                          null,
                          2
                        )
                  }
                  readOnly
                  language={
                    effectiveKind === 'grpc' || resolvedPreview.body.mode === 'json' || resolvedPreview.body.mode === 'graphql'
                      ? 'json'
                      : 'text'
                  }
                  minHeight="140px"
                />
              </div>
              {resolvedInsight.warnings.length > 0 ? (
                <div className="request-preview-warnings">
                  {resolvedInsight.warnings.map(warning => (
                    <div key={warning.code} className="request-preview-warning">
                      <strong>{warning.code}</strong>
                      <span>{warning.message}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {resolvedInsight.diagnostics.length > 0 ? (
                <div className="request-preview-warnings">
                  {resolvedInsight.diagnostics.map(diagnostic => (
                    <div key={diagnostic.code} className="request-preview-warning">
                      <strong>{diagnostic.blocking ? 'blocking' : diagnostic.level}</strong>
                      <span>{diagnostic.message}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="request-preview-grid request-preview-grid-secondary">
                <div className="request-preview-section">
                  <Text fw={700} size="sm">Resolved Variables</Text>
                  {resolvedInsight.variables.length === 0 ? (
                    <WorkflowEmptyState
                      title="No request variables detected"
                      detail="Add {{tokens}} to the URL, headers, query, or body when this request should resolve environment values before Send."
                    />
                  ) : (
                    <div className="variable-audit-list">
                      {resolvedInsight.variables.map(variable => (
                        <div key={variable.token} className="variable-audit-card">
                          <div>
                            <strong>{variable.token}</strong>
                            <span>{variable.sourceLabel}</span>
                          </div>
                          <Badge color={variable.missing ? 'red' : variable.source === 'environment' ? 'teal' : 'gray'}>
                            {variable.missing ? 'missing' : variable.value || 'empty'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="request-preview-section">
                  <Text fw={700} size="sm">Auth Preview</Text>
                  <div className="checks-list">
                    {resolvedPreview.authState ? (
                      <div className="check-card">
                        <Text fw={700}>Auth Runtime</Text>
                        <Text size="xs" c="dimmed">
                          {resolvedPreview.authState.type}
                          {resolvedPreview.authState.profileName ? ` · ${resolvedPreview.authState.profileName}` : ''}
                          {resolvedPreview.authState.source ? ` · ${resolvedPreview.authState.source}` : ''}
                        </Text>
                        <Text size="sm">
                          Injected: {resolvedPreview.authState.tokenInjected ? 'yes' : 'no'} · Cache: {resolvedPreview.authState.cacheStatus}
                        </Text>
                        {resolvedPreview.authState.expiresAt ? (
                          <Text size="xs" c="dimmed">Expires at {resolvedPreview.authState.expiresAt}</Text>
                        ) : null}
                        {resolvedPreview.authState.notes.length > 0 ? (
                          <Text size="xs" c="dimmed">{resolvedPreview.authState.notes.join(' ')}</Text>
                        ) : null}
                        {resolvedPreview.authState.missing.length > 0 ? (
                          <Text size="xs" c="red">Missing: {resolvedPreview.authState.missing.join(', ')}</Text>
                        ) : null}
                        {props.onRefreshRequestAuth && resolvedPreview.authState.type === 'oauth2' ? (
                          <Button size="xs" variant="default" onClick={props.onRefreshRequestAuth}>
                            Refresh OAuth Token
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    {resolvedInsight.authPreview.length === 0 ? (
                      <WorkflowEmptyState
                        title="No auth injection"
                        detail="Use the Auth status entry when this request needs bearer, API key, OAuth, or an environment profile."
                        actionLabel="Open Auth"
                        onAction={() => props.onTabChange('auth')}
                      />
                    ) : (
                      <div className="checks-list">
                        {resolvedInsight.authPreview.map(item => (
                          <div key={`${item.target}:${item.name}`} className="check-card">
                            <Text fw={700}>{item.name}</Text>
                            <Text size="xs" c="dimmed">
                              {item.target}{item.sourceLabel ? ` · ${item.sourceLabel}` : ''}
                            </Text>
                            {item.detail ? <Text size="xs" c="dimmed">{item.detail}</Text> : null}
                            <CodeEditor value={item.value} readOnly language="text" minHeight="72px" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="request-preview-section">
                  <Text fw={700} size="sm">Session & Effective Headers</Text>
                  <div className="checks-list">
                    <div className="check-card">
                      <Text fw={700}>Cookie Header</Text>
                      <CodeEditor
                        value={props.sessionSnapshot?.cookieHeader || ''}
                        readOnly
                        language="text"
                        minHeight="72px"
                      />
                    </div>
                    <div className="check-card">
                      <Text fw={700}>Effective Headers</Text>
                      <CodeEditor
                        value={resolvedPreview.headers.filter(item => item.enabled).map(item => `${item.name}: ${item.value}`).join('\n')}
                        readOnly
                        language="text"
                        minHeight="120px"
                      />
                    </div>
                    {props.onCopyText ? (
                      <Button
                        size="xs"
                        variant="default"
                        onClick={() =>
                          props.onCopyText?.(
                            resolvedPreview.headers.filter(item => item.enabled).map(item => `${item.name}: ${item.value}`).join('\n'),
                            'Effective headers copied'
                          )
                        }
                      >
                        Copy Effective Headers
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="query">
            <div className="inspector-section">
              <h4 className="compact-section-title">Query Parameters</h4>
              <KeyValueEditor
                rows={queryRows}
                onChange={rows => {
                  if (selectedCase) {
                    updateSelectedCase(current => ({ ...current, overrides: { ...current.overrides, query: rows } }));
                  } else {
                    props.onRequestChange({ ...requestDocument, query: rows });
                  }
                }}
              />
            </div>
            <div className="inspector-section">
              <h4 className="compact-section-title">Path Variables</h4>
              <KeyValueEditor
                rows={pathRows}
                onChange={rows => {
                  if (selectedCase) {
                    updateSelectedCase(current => ({ ...current, overrides: { ...current.overrides, pathParams: rows } }));
                  } else {
                    props.onRequestChange({ ...requestDocument, pathParams: rows });
                  }
                }}
              />
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="headers">
            <div className="inspector-section">
              <h4 className="compact-section-title">Headers</h4>
              <KeyValueEditor
                rows={headerRows}
                onChange={rows => {
                  if (selectedCase) {
                    updateSelectedCase(current => ({ ...current, overrides: { ...current.overrides, headers: rows } }));
                  } else {
                    props.onRequestChange({ ...requestDocument, headers: rows });
                  }
                }}
              />
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="body">
            {effectiveKind === 'grpc' ? (
              <div className="graphql-body-grid">
                <div className="settings-grid">
                  <TextInput
                    label="Proto File"
                    value={grpcBody.protoFile || ''}
                    placeholder="Relative to workspace or absolute path"
                    onChange={event => updateGrpcBody({ protoFile: event.currentTarget.value })}
                  />
                  <Textarea
                    label="Import Paths"
                    autosize
                    minRows={2}
                    maxRows={4}
                    value={(grpcBody.importPaths || []).join('\n')}
                    placeholder="One path per line"
                    onChange={event =>
                      updateGrpcBody({
                        importPaths: event.currentTarget.value.split('\n').map(item => item.trim()).filter(Boolean)
                      })
                    }
                  />
                  <TextInput
                    label="Service"
                    value={grpcBody.service || ''}
                    placeholder="package.Service"
                    onChange={event => updateGrpcBody({ service: event.currentTarget.value })}
                  />
                  <TextInput
                    label="Method"
                    value={grpcBody.method || ''}
                    placeholder="UnaryMethod"
                    onChange={event => updateGrpcBody({ method: event.currentTarget.value })}
                  />
                  <Select
                    label="RPC Kind"
                    value={grpcBody.rpcKind || 'unary'}
                    data={GRPC_RPC_KINDS.map(item => ({ value: item.value, label: item.label }))}
                    onChange={value =>
                      updateGrpcBody({
                        rpcKind: (value as 'unary' | 'server-streaming' | 'client-streaming' | 'bidi-streaming') || 'unary',
                        ...((value === 'client-streaming' || value === 'bidi-streaming') && !(grpcBody.messages || []).length
                          ? {
                              messages: [{ name: 'Message 1', content: grpcBody.message || '{}', enabled: true }]
                            }
                          : {})
                      })
                    }
                  />
                  <div className="preview-note">
                    <Button
                        size="xs"
                        variant="default"
                        onClick={async () => {
                          const filePath = await handlePickGrpcProtoFile();
                          if (!filePath) return;
                          updateGrpcBody({ protoFile: filePath });
                        }}
                    >
                      Choose Proto File
                     </Button>
                   </div>
                 </div>
                 <div>
                   <div className="grpc-session-panel">
                     <div className="grpc-session-head">
                       <div>
                         <Text size="xs" fw={700} c="dimmed">Session Authoring</Text>
                         <Text size="sm" fw={700}>
                           {grpcBody.rpcKind === 'server-streaming'
                             ? 'Server stream request'
                             : grpcBody.rpcKind === 'client-streaming'
                               ? 'Client stream sequence'
                               : grpcBody.rpcKind === 'bidi-streaming'
                                 ? 'Bidirectional stream sequence'
                                 : 'Unary request'}
                         </Text>
                       </div>
                       <Group gap="xs" wrap="wrap">
                         <Badge size="xs" variant="light" color={grpcBindingReady ? 'teal' : 'orange'}>
                           {grpcBindingReady ? 'binding ready' : 'needs proto binding'}
                         </Badge>
                         <Badge size="xs" variant="light" color="indigo">
                           {grpcBody.rpcKind}
                         </Badge>
                       </Group>
                     </div>
                     <div className="grpc-session-stats">
                       <span><strong>{grpcEnabledMessageCount}</strong> enabled message{grpcEnabledMessageCount === 1 ? '' : 's'}</span>
                       <span><strong>{grpcMessages.length}</strong> drafted</span>
                       <span><strong>{(grpcBody.importPaths || []).length}</strong> import path{(grpcBody.importPaths || []).length === 1 ? '' : 's'}</span>
                     </div>
                     <Text size="xs" c="dimmed">
                       {grpcBody.rpcKind === 'server-streaming'
                         ? 'Author one request payload. The debugger aggregates streamed responses into a single JSON result for review.'
                         : grpcBody.rpcKind === 'client-streaming'
                           ? 'Compose the outbound message order here. Only enabled entries are sent, in order, before the single response is captured.'
                           : grpcBody.rpcKind === 'bidi-streaming'
                             ? 'Use the session list to stage outbound messages. The local runtime sends them in order and collects inbound responses into one result.'
                             : 'Use JSON or protobuf text format for the single outbound payload.'}
                     </Text>
                     {grpcBody.rpcKind === 'client-streaming' || grpcBody.rpcKind === 'bidi-streaming' ? (
                       <div className="grpc-message-actions">
                         <Button
                           size="xs"
                           variant="default"
                           leftSection={<IconPlus size={14} />}
                           onClick={() => addGrpcMessage()}
                         >
                           Add Message
                         </Button>
                         <Button
                           size="xs"
                           variant="subtle"
                           leftSection={<IconCopy size={14} />}
                           disabled={grpcMessages.length === 0}
                           onClick={() => duplicateGrpcMessage(Math.max(grpcMessages.length - 1, 0))}
                         >
                           Duplicate Last
                         </Button>
                         <Button
                           size="xs"
                           variant="subtle"
                           disabled={!grpcBody.message && grpcEnabledMessageCount === 0}
                           onClick={seedGrpcMessagesFromUnary}
                         >
                           Reset From Unary Draft
                         </Button>
                         <Button size="xs" variant="subtle" onClick={normalizeGrpcMessageNames}>
                           Normalize Names
                         </Button>
                       </div>
                     ) : null}
                   </div>
                   {grpcBody.rpcKind === 'client-streaming' || grpcBody.rpcKind === 'bidi-streaming' ? (
                     <div className="websocket-message-list">
                       <div className="websocket-message-list">
                         {grpcMessages.map((message, index) => (
                           <div key={`${message.name}-${index}`} className="websocket-message-card grpc-message-card">
                             <div className="websocket-message-toolbar grpc-message-toolbar">
                               <Group gap="xs" align="flex-end" style={{ flex: 1 }}>
                                 <Badge size="xs" variant="light" color="gray">
                                   #{index + 1}
                                 </Badge>
                                 <Checkbox
                                   checked={message.enabled !== false}
                                   label="Enabled"
                                   onChange={event => {
                                     const next = [...grpcMessages];
                                    next[index] = { ...next[index], enabled: event.currentTarget.checked };
                                    updateGrpcMessages(next);
                                  }}
                                />
                                <TextInput
                                  label="Name"
                                  value={message.name || `Message ${index + 1}`}
                                  onChange={event => {
                                    const next = [...grpcMessages];
                                    next[index] = { ...next[index], name: event.currentTarget.value };
                                    updateGrpcMessages(next);
                                  }}
                                   style={{ flex: 1 }}
                                 />
                               </Group>
                               <Group gap="xs">
                                 <Button
                                   size="xs"
                                   variant="subtle"
                                   disabled={index === 0}
                                   onClick={() => moveGrpcMessage(index, -1)}
                                 >
                                   <IconArrowUp size={14} />
                                 </Button>
                                 <Button
                                   size="xs"
                                   variant="subtle"
                                   disabled={index === grpcMessages.length - 1}
                                   onClick={() => moveGrpcMessage(index, 1)}
                                 >
                                   <IconArrowDown size={14} />
                                 </Button>
                                 <Button size="xs" variant="subtle" onClick={() => duplicateGrpcMessage(index)}>
                                   Duplicate
                                 </Button>
                                 <Button
                                   size="xs"
                                   variant="subtle"
                                   color="red"
                                   disabled={grpcMessages.length === 1}
                                   onClick={() => updateGrpcMessages(grpcMessages.filter((_, messageIndex) => messageIndex !== index))}
                                 >
                                   Remove
                                 </Button>
                               </Group>
                             </div>
                             <div className="grpc-message-meta">
                               <Badge
                                 size="xs"
                                 variant="light"
                                 color={
                                   grpcMessageSummaries[index]?.kind === 'json'
                                     ? 'teal'
                                     : grpcMessageSummaries[index]?.kind === 'text'
                                       ? 'blue'
                                       : 'gray'
                                 }
                               >
                                 {grpcMessageSummaries[index]?.kind || 'empty'}
                               </Badge>
                               <Text size="xs" c="dimmed">
                                 {grpcMessageSummaries[index]?.detail || 'empty payload'}
                               </Text>
                               <code>{grpcMessageSummaries[index]?.preview || '{}'}</code>
                             </div>
                             <CodeEditor
                               value={message.content || '{}'}
                               language="json"
                               onChange={value => {
                                 const next = [...grpcMessages];
                                next[index] = { ...next[index], content: value };
                                updateGrpcMessages(next);
                              }}
                              minHeight="180px"
                             />
                           </div>
                         ))}
                       </div>
                     </div>
                   ) : (
                     <div className="grpc-unary-editor">
                       <div className="grpc-message-meta">
                         <Badge
                           size="xs"
                           variant="light"
                           color={summarizeGrpcDraft(grpcBody.message || '{}').kind === 'json' ? 'teal' : 'blue'}
                         >
                           {summarizeGrpcDraft(grpcBody.message || '{}').kind}
                         </Badge>
                         <Text size="xs" c="dimmed">
                           {summarizeGrpcDraft(grpcBody.message || '{}').detail}
                         </Text>
                         <code>{summarizeGrpcDraft(grpcBody.message || '{}').preview}</code>
                       </div>
                       <CodeEditor
                         value={grpcBody.message || '{}'}
                         language="json"
                         onChange={value => updateGrpcBody({ message: value })}
                         minHeight="260px"
                       />
                     </div>
                   )}
                 </div>
               </div>
             ) : effectiveKind === 'websocket' ? (
              <div className="websocket-body-grid">
                <div className="websocket-toolbar">
                  <div>
                    <Text size="xs" fw={700} c="dimmed">WebSocket Session</Text>
                    <Text size="xs" c="dimmed">{resolvedWebSocketUrl || 'Enter a ws:// or wss:// endpoint'}</Text>
                  </div>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="default"
                      leftSection={<IconPlus size={14} />}
                      onClick={() =>
                        updateWebSocketMessages([
                          ...websocketMessages,
                          { name: `Message ${websocketMessages.length + 1}`, body: '', kind: 'json', enabled: true }
                        ])
                      }
                    >
                      Add Message
                    </Button>
                    <Button size="xs" leftSection={<IconPlayerPlay size={14} />} loading={websocketRun.loading} onClick={handleWebSocketRun}>
                      Run Session
                    </Button>
                    <Button
                      size="xs"
                      variant={isWebSocketLiveConnected ? 'light' : 'default'}
                      color={isWebSocketLiveConnected ? 'teal' : undefined}
                      leftSection={<IconPlugConnected size={14} />}
                      loading={websocketLive.connecting}
                      disabled={websocketRun.loading || isWebSocketLiveConnected}
                      onClick={handleWebSocketLiveConnect}
                    >
                      Connect
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      loading={websocketLive.reconnecting}
                      disabled={websocketRun.loading || !resolvedWebSocketUrl}
                      onClick={handleWebSocketReconnect}
                    >
                      Reconnect
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      leftSection={<IconPlugConnectedX size={14} />}
                      loading={websocketLive.closing}
                      disabled={!isWebSocketLiveConnected}
                      onClick={handleWebSocketLiveClose}
                    >
                      Close
                    </Button>
                    <Button size="xs" variant="subtle" disabled={!websocketTimeline} onClick={clearWebSocketTimeline}>
                      Clear Timeline
                    </Button>
                  </Group>
                </div>
                <div className="websocket-message-list">
                  {websocketMessages.map((message, index) => (
                    <div className="websocket-message-row" key={`${index}:${message.name}`}>
                      <div className="websocket-message-head">
                        <Checkbox
                          checked={message.enabled}
                          onChange={event => {
                            const next = [...websocketMessages];
                            next[index] = { ...message, enabled: event.currentTarget.checked };
                            updateWebSocketMessages(next);
                          }}
                        />
                        <TextInput
                          value={message.name}
                          placeholder="Message name"
                          onChange={event => {
                            const next = [...websocketMessages];
                            next[index] = { ...message, name: event.currentTarget.value };
                            updateWebSocketMessages(next);
                          }}
                        />
                        <Select
                          value={message.kind || 'json'}
                          data={[
                            { value: 'json', label: 'json' },
                            { value: 'text', label: 'text' },
                            { value: 'binary', label: 'binary' }
                          ]}
                          onChange={value => {
                            const next = [...websocketMessages];
                            next[index] = { ...message, kind: (value || 'json') as 'json' | 'text' | 'binary' };
                            updateWebSocketMessages(next);
                          }}
                          allowDeselect={false}
                          size="xs"
                          w={96}
                        />
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<IconSend size={14} />}
                          loading={websocketLive.sendingIndex === index}
                          disabled={!isWebSocketLiveConnected}
                          onClick={() => handleWebSocketLiveSend(index)}
                        >
                          Send
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={() => saveWebSocketExample(message)}
                        >
                          Save Example
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          onClick={() => updateWebSocketMessages(websocketMessages.filter((_, messageIndex) => messageIndex !== index))}
                          disabled={websocketMessages.length === 1}
                        >
                          Remove
                        </Button>
                      </div>
                      <CodeEditor
                        value={message.body}
                        language={(message.kind || 'json') === 'json' ? 'json' : 'text'}
                        onChange={value => {
                          const next = [...websocketMessages];
                          next[index] = { ...message, body: value };
                          updateWebSocketMessages(next);
                        }}
                        minHeight="120px"
                      />
                    </div>
                  ))}
                </div>
                {websocketExamples.length > 0 ? (
                  <div className="websocket-examples">
                    <div className="websocket-timeline-head">
                      <Text size="xs" fw={700} c="dimmed">Saved Examples</Text>
                      <Badge variant="light" color="blue">{websocketExamples.length}</Badge>
                    </div>
                    <div className="websocket-example-list">
                      {websocketExamples.map((example, index) => (
                        <div className="websocket-example-card" key={`${example.name}:${index}`}>
                          <div className="websocket-example-head">
                            <div>
                              <Text size="sm" fw={700}>{example.name}</Text>
                              <Text size="xs" c="dimmed">{example.kind || 'json'}</Text>
                            </div>
                            <Group gap="xs">
                              <Button size="xs" variant="light" onClick={() => appendWebSocketExample(example)}>
                                Add to Messages
                              </Button>
                              <Button
                                size="xs"
                                variant="subtle"
                                color="red"
                                onClick={() => updateWebSocketExamples(websocketExamples.filter((_, exampleIndex) => exampleIndex !== index))}
                              >
                                Remove
                              </Button>
                            </Group>
                          </div>
                          <pre>{describeWebSocketPayload(example.body).preview}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {websocketRun.error || websocketLive.error || websocketTimeline ? (
                  <div className="websocket-timeline">
                    <div className="websocket-timeline-head">
                      <Text size="xs" fw={700} c="dimmed">Timeline</Text>
                      <Group gap={6}>
                        {isWebSocketLiveConnected ? (
                          <Badge variant="light" color="teal">live</Badge>
                        ) : null}
                        {body.websocket?.lastRun && websocketTimeline ? (
                          <Badge variant="light" color="blue">saved</Badge>
                        ) : null}
                        {websocketTimeline ? (
                          <Badge variant="light" color="teal">{websocketTimeline.durationMs} ms</Badge>
                        ) : null}
                      </Group>
                    </div>
                    {websocketRun.error || websocketLive.error ? (
                      <div className="request-preview-warning">
                        <strong>websocket</strong>
                        <span>{websocketRun.error || websocketLive.error}</span>
                      </div>
                    ) : null}
                    {websocketTimeline?.events.map((event, index) => (
                      <button
                        type="button"
                        className={`websocket-timeline-event is-${event.direction}${
                          selectedWebsocketEventIndex === index ? ' is-active' : ''
                        }`}
                        key={`${event.elapsedMs}:${index}`}
                        onClick={() => setSelectedWebsocketEventIndex(index)}
                      >
                        <span>{event.elapsedMs} ms</span>
                        <strong>{event.direction}</strong>
                        <em>{event.label}</em>
                        <code>{event.body}</code>
                      </button>
                    ))}
                    {selectedWebsocketEvent && selectedWebsocketEventPreview ? (
                      <div className="websocket-event-preview">
                        <div className="websocket-example-head">
                          <div>
                            <Text size="xs" fw={700} c="dimmed">Event Preview</Text>
                            <Text size="sm" fw={700}>{selectedWebsocketEvent.label}</Text>
                          </div>
                          <Group gap="xs">
                            <Badge variant="light" color={selectedWebsocketEvent.direction === 'in' ? 'teal' : selectedWebsocketEvent.direction === 'out' ? 'indigo' : 'gray'}>
                              {selectedWebsocketEvent.direction}
                            </Badge>
                            <Badge variant="light" color="gray">
                              {selectedWebsocketEventPreview.kind}
                            </Badge>
                            <Badge variant="light" color="gray">
                              {selectedWebsocketEventPreview.detail}
                            </Badge>
                          </Group>
                        </div>
                        <pre>{selectedWebsocketEventPreview.preview}</pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : effectiveKind === 'script' ? (
              <div className="graphql-body-grid">
                <div className="preview-note">
                  <Text size="xs" c="dimmed">
                    Script items run directly in the debugger sandbox. Use <code>pm.variables</code>, <code>pm.environment</code>,
                    <code> pm.test</code>, <code>pm.sendRequest</code>, safe built-in <code>pm.require</code>, and
                    <code> pm.visualizer</code> to orchestrate and inspect local script flows.
                  </Text>
                </div>
                <CodeEditor
                  value={body.text || requestDocument.scripts.preRequest || ''}
                  language="text"
                  onChange={value => updateBody({ ...body, mode: 'text', mimeType: 'application/javascript', text: value })}
                  minHeight="320px"
                />
              </div>
            ) : (
              <>
            <div className="body-config-row">
              <Select
                size="xs"
                value={body.mode}
                data={bodyModeOptions()}
                onChange={value => {
                  const nextMode = (value as RequestBody['mode']) || 'none';
                  updateBody({
                    ...body,
                    mode: nextMode,
                    graphql:
                      nextMode === 'graphql'
                        ? body.graphql || { query: body.text || '', variables: '{}', operationName: '', schemaUrl: '', savedOperations: [] }
                        : body.graphql,
                    mimeType:
                      nextMode === 'json'
                        ? 'application/json'
                        : nextMode === 'graphql'
                          ? 'application/json'
                          : nextMode === 'xml'
                            ? 'application/xml'
                            : nextMode === 'sparql'
                              ? 'application/sparql-query'
                        : nextMode === 'form-urlencoded'
                          ? 'application/x-www-form-urlencoded'
                          : nextMode === 'multipart'
                            ? 'multipart/form-data'
                            : body.mimeType
                  });
                }}
                variant="unstyled"
                className="body-mode-select"
              />
            </div>
            {body.mode === 'form-urlencoded' || body.mode === 'multipart' ? (
              <KeyValueEditor
                rows={body.fields || []}
                allowFileRows={body.mode === 'multipart'}
                onPickFile={handlePickBodyFile}
                onChange={rows => updateBody({ ...body, fields: rows })}
              />
            ) : body.mode === 'file' ? (
              <div className="settings-grid">
                <TextInput
                  label="Body File"
                  value={body.file || body.text || ''}
                  placeholder="/path/to/request-body.bin"
                  onChange={event => updateBody({ ...body, file: event.currentTarget.value, text: event.currentTarget.value })}
                />
                <div className="preview-note">
                  <Button size="xs" variant="default" onClick={handlePickRawBodyFile}>
                    Choose File
                  </Button>
                </div>
              </div>
            ) : body.mode === 'graphql' ? (
              <div className="graphql-body-grid">
                <div className="settings-grid">
                  <TextInput
                    label="Operation Name"
                    value={graphqlBody.operationName || ''}
                    placeholder="Optional"
                    onChange={event => updateBody({ ...body, graphql: { ...graphqlBody, operationName: event.currentTarget.value } })}
                  />
                  <TextInput
                    label="Schema URL"
                    value={graphqlBody.schemaUrl || ''}
                    placeholder="Optional introspection endpoint"
                    onChange={event => updateBody({ ...body, graphql: { ...graphqlBody, schemaUrl: event.currentTarget.value } })}
                  />
                  <div className="graphql-schema-actions">
                    <Text size="xs" fw={700} c="dimmed">Schema</Text>
                    <Button
                      size="xs"
                      variant="default"
                      leftSection={<IconPlayerPlay size={14} />}
                      loading={graphqlIntrospection.loading}
                      onClick={handleGraphqlIntrospection}
                    >
                      Fetch Schema
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      disabled={!graphqlBody.schemaCache}
                      onClick={clearGraphqlSchemaCache}
                    >
                      Clear Cache
                    </Button>
                  </div>
                </div>
                <div className="graphql-editor-stack">
                  <div className="graphql-editor-summary">
                    <div>
                      <Text size="xs" fw={700} c="dimmed">Editor Status</Text>
                      <div className="graphql-editor-summary-chips">
                        {graphqlOperationSignature.kind ? (
                          <span><strong>{graphqlOperationSignature.kind}</strong> in query</span>
                        ) : (
                          <span><strong>draft</strong> unnamed operation</span>
                        )}
                        <span><strong>{graphqlVariableState.count}</strong> variable{graphqlVariableState.count === 1 ? '' : 's'}</span>
                        {graphqlBody.operationName ? <span><strong>{graphqlBody.operationName}</strong> request operation</span> : null}
                        {graphqlBody.schemaCache?.summary && isGraphqlSchemaSummary(graphqlBody.schemaCache.summary) ? (
                          <span><strong>{graphqlBody.schemaCache.summary.typeCount}</strong> cached types</span>
                        ) : null}
                      </div>
                    </div>
                    <Group gap="xs">
                      {graphqlOperationSignature.name && graphqlOperationSignature.name !== (graphqlBody.operationName || '') ? (
                        <Button size="xs" variant="subtle" onClick={syncGraphqlOperationName}>
                          Use Query Name
                        </Button>
                      ) : null}
                      <Button
                        size="xs"
                        variant="default"
                        disabled={!graphqlExplorerField || graphqlExplorerVariableSeedKeys.length === 0}
                        onClick={seedGraphqlVariablesFromExplorer}
                      >
                        {graphqlMissingExplorerVariableKeys.length > 0
                          ? `Seed ${graphqlMissingExplorerVariableKeys.length} Missing Var${graphqlMissingExplorerVariableKeys.length === 1 ? '' : 's'}`
                          : 'Sync Explorer Vars'}
                      </Button>
                    </Group>
                    {graphqlVariableState.error ? (
                      <div className="request-preview-warning">
                        <strong>variables</strong>
                        <span>{graphqlVariableState.error}</span>
                      </div>
                    ) : null}
                    {!graphqlVariableState.error && graphqlExplorerField && graphqlExplorerVariableSeedKeys.length > 0 ? (
                      <Text size="xs" c="dimmed">
                        {graphqlMissingExplorerVariableKeys.length > 0
                          ? `Selected field ${graphqlExplorerField.name} exposes ${graphqlExplorerVariableSeedKeys.length} args. Seed placeholders for ${graphqlMissingExplorerVariableKeys.length} missing variable${graphqlMissingExplorerVariableKeys.length === 1 ? '' : 's'}.`
                          : `Selected field ${graphqlExplorerField.name} already has every explorer arg represented in variables JSON.`}
                      </Text>
                    ) : null}
                  </div>
                  <div>
                    <Text size="xs" fw={700} c="dimmed">Query</Text>
                    <CodeEditor
                      value={graphqlBody.query || ''}
                      language="text"
                      onChange={value => updateGraphqlBody({ query: value })}
                      minHeight="220px"
                    />
                  </div>
                  <div>
                    <div className="graphql-editor-head">
                      <Text size="xs" fw={700} c="dimmed">Variables JSON</Text>
                      <Button size="xs" variant="subtle" onClick={formatGraphqlVariables}>
                        Format
                      </Button>
                    </div>
                    <CodeEditor
                      value={graphqlBody.variables || '{}'}
                      language="json"
                      onChange={value => updateGraphqlBody({ variables: value })}
                      minHeight="140px"
                    />
                  </div>
                </div>
                <div className="graphql-saved-ops-panel">
                  <div className="graphql-saved-ops-head">
                    <div>
                      <Text size="xs" fw={700} c="dimmed">Saved Drafts</Text>
                      <Text size="xs" c="dimmed">
                        Reuse a named query + variables snapshot without leaving the current request.
                      </Text>
                    </div>
                    <Button size="xs" variant="default" onClick={saveGraphqlOperationDraft}>
                      Save Current Draft
                    </Button>
                  </div>
                  {graphqlSavedOperations.length === 0 ? (
                    <Text size="xs" c="dimmed">
                      No saved draft yet. Keep one for recurring fragments, named operations, or example variables.
                    </Text>
                  ) : (
                    <>
                      <div className="graphql-saved-ops-controls">
                        <Select
                          label="Saved Draft"
                          value={selectedGraphqlSavedOperation}
                          data={graphqlSavedOperations.map(operation => ({ value: operation.name, label: operation.name }))}
                          onChange={value => setSelectedGraphqlSavedOperation(value)}
                        />
                        <Group gap="xs">
                          <Button
                            size="xs"
                            variant="default"
                            disabled={!activeGraphqlSavedOperation}
                            onClick={() => loadGraphqlSavedOperation(selectedGraphqlSavedOperation)}
                          >
                            Load Draft
                          </Button>
                          <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            disabled={!activeGraphqlSavedOperation}
                            onClick={() => deleteGraphqlSavedOperation(selectedGraphqlSavedOperation)}
                          >
                            Delete
                          </Button>
                        </Group>
                      </div>
                      {activeGraphqlSavedOperation ? (
                        <div className="graphql-saved-ops-preview">
                          <div className="graphql-saved-ops-preview-head">
                            <strong>{activeGraphqlSavedOperation.name}</strong>
                            {activeGraphqlSavedOperation.operationName ? (
                              <Badge size="xs" variant="light" color="indigo">
                                {activeGraphqlSavedOperation.operationName}
                              </Badge>
                            ) : null}
                          </div>
                          <span>{graphqlSavedOperationSummary(activeGraphqlSavedOperation)}</span>
                          <small>
                            {activeGraphqlSavedOperation.updatedAt
                              ? `Updated ${new Date(activeGraphqlSavedOperation.updatedAt).toLocaleString()}`
                              : 'Saved with this request'}
                          </small>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
                {graphqlIntrospection.summary || graphqlIntrospection.error ? (
                  <div className="graphql-schema-panel">
                    <div className="graphql-schema-panel-head">
                      <div>
                        <Text size="xs" fw={700} c="dimmed">Introspection</Text>
                        <Text size="xs" c="dimmed">
                          {graphqlIntrospection.endpoint || graphqlBody.schemaUrl || resolvedPreview.url}
                        </Text>
                      </div>
                      {graphqlIntrospection.checkedAt ? (
                        <Badge variant="light" color={graphqlIntrospection.summary?.ok ? 'teal' : 'orange'}>
                          {graphqlIntrospection.checkedAt}
                        </Badge>
                      ) : null}
                      {graphqlBody.schemaCache && graphqlIntrospection.summary ? (
                        <Badge variant="light" color="blue">
                          cached
                        </Badge>
                      ) : null}
                    </div>
                    {graphqlIntrospection.summary ? (
                      <div className="graphql-schema-search">
                        <TextInput
                          label="Schema Filter"
                          placeholder="Search root fields, args, or return types"
                          value={graphqlSchemaSearch}
                          onChange={event => setGraphqlSchemaSearch(event.currentTarget.value)}
                        />
                      </div>
                    ) : null}
                    {graphqlIntrospection.error ? (
                      <div className="request-preview-warning">
                        <strong>network</strong>
                        <span>{graphqlIntrospection.error}</span>
                      </div>
                    ) : null}
                    {graphqlIntrospection.summary ? (
                      <>
                        <div className="graphql-schema-stats">
                          <span><strong>{graphqlIntrospection.summary.typeCount}</strong> types</span>
                          <span><strong>{graphqlIntrospection.summary.queries.length}</strong> queries</span>
                          <span><strong>{graphqlIntrospection.summary.mutations.length}</strong> mutations</span>
                          <span><strong>{graphqlIntrospection.summary.subscriptions.length}</strong> subscriptions</span>
                        </div>
                        {graphqlIntrospection.summary.warnings.length > 0 ? (
                          <div className="request-preview-warning">
                            <strong>schema</strong>
                            <span>{graphqlIntrospection.summary.warnings[0]}</span>
                          </div>
                        ) : null}
                        <div className="graphql-schema-fields">
                          {(['query', 'mutation', 'subscription'] as GraphqlOperationKind[]).map(operation => {
                            const allFields = graphqlFieldsForOperation(graphqlIntrospection.summary!, operation);
                            const fields = allFields.filter(field => graphqlFieldMatchesSearch(field, graphqlSchemaSearch));
                            if (fields.length === 0) return null;
                            return (
                              <div className="graphql-field-group" key={operation}>
                                <Text size="xs" fw={700} c="dimmed">
                                  {operation}
                                  {graphqlSchemaSearch.trim() ? ` · ${fields.length}/${allFields.length}` : ''}
                                </Text>
                                <div>
                                  {fields.slice(0, operation === 'query' ? 12 : 8).map(field => (
                                    <button
                                      type="button"
                                      className={`graphql-field-chip${
                                        graphqlExplorer?.operation === operation && graphqlExplorer?.fieldName === field.name ? ' active' : ''
                                      }`}
                                      key={`${operation}:${field.name}`}
                                      onClick={() => selectGraphqlExplorerField(operation, field)}
                                      title={`Explore ${operation} ${field.name}`}
                                    >
                                      <span>{field.name}</span>
                                      {field.args.length > 0 ? <em>{field.args.length}</em> : null}
                                      <small>{field.returnType}</small>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {graphqlSchemaSearch.trim() &&
                        !(['query', 'mutation', 'subscription'] as GraphqlOperationKind[]).some(operation =>
                          graphqlFieldsForOperation(graphqlIntrospection.summary!, operation).some(field =>
                            graphqlFieldMatchesSearch(field, graphqlSchemaSearch)
                          )
                        ) ? (
                          <Text size="xs" c="dimmed">
                            No root fields matched this schema filter.
                          </Text>
                        ) : null}
                        {(graphqlSchemaSearch.trim() || graphqlSelectedType) && graphqlMatchingTypes.length > 0 ? (
                          <div className="graphql-type-match-panel">
                            <div className="graphql-type-match-head">
                              <Text size="xs" fw={700} c="dimmed">Type Matches</Text>
                              {graphqlSchemaSearch.trim() ? (
                                <Text size="xs" c="dimmed">
                                  {graphqlMatchingTypes.length} matching types
                                </Text>
                              ) : null}
                            </div>
                            <div className="graphql-type-chip-list">
                              {graphqlMatchingTypes.map(type => (
                                <button
                                  type="button"
                                  key={type.name}
                                  className={`graphql-type-chip${graphqlSelectedTypeName === type.name ? ' is-active' : ''}`}
                                  onClick={() => openGraphqlType(type.name)}
                                  title={`Inspect ${type.name}`}
                                >
                                  {type.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {graphqlExplorer && graphqlExplorerField ? (
                          <div className="graphql-explorer-panel">
                            <div className="graphql-explorer-head">
                              <div>
                                <Text size="xs" fw={700} c="dimmed">Explorer</Text>
                                <Text size="sm" fw={700}>
                                  {graphqlExplorer.operation} · {graphqlExplorerField.name}
                                </Text>
                              </div>
                              <Group gap="xs">
                                <Button size="xs" variant="subtle" onClick={resetGraphqlExplorerSelection}>
                                  Reset
                                </Button>
                                <Button
                                  size="xs"
                                  variant="default"
                                  onClick={() => applyGraphqlOperationDraft(graphqlExplorer.operation, graphqlExplorer.fieldName)}
                                >
                                  Insert Selection
                                </Button>
                              </Group>
                            </div>
                            <div className="graphql-explorer-meta">
                              {graphqlExplorerField.args.length > 0 ? (
                                <Badge size="xs" variant="light" color="indigo">
                                  {graphqlExplorerField.args.length} args
                                </Badge>
                              ) : null}
                              {renderGraphqlTypePill(graphqlExplorerField.namedType, graphqlExplorerField.returnType)}
                              {graphqlExplorerField.selectionFragments.length > 0 ? (
                                <Badge size="xs" variant="light" color="grape">
                                  {graphqlExplorerField.selectionFragments.length} fragments
                                </Badge>
                              ) : null}
                            </div>
                            {graphqlExplorerField.args.length > 0 ? (
                              <div className="graphql-explorer-args">
                                {graphqlExplorerField.args.map(arg => (
                                  <button
                                    type="button"
                                    key={arg.name}
                                    className="graphql-arg-chip"
                                    onClick={() => openGraphqlType(arg.namedType)}
                                    disabled={!arg.namedType}
                                    title={arg.namedType ? `Inspect ${arg.namedType}` : undefined}
                                  >
                                    <span>{arg.name}</span>
                                    <small>{arg.type}</small>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                            <div className="graphql-explorer-controls">
                              <Select
                                size="xs"
                                label="Fragment style"
                                className="graphql-explorer-fragment-mode"
                                value={graphqlFragmentStyle}
                                data={[
                                  { value: 'inline', label: 'Inline fragments' },
                                  { value: 'named', label: 'Reusable named fragments' }
                                ]}
                                onChange={value => setGraphqlFragmentStyle((value as GraphqlFragmentStyle) || 'inline')}
                              />
                              <Text size="xs" c="dimmed">
                                {graphqlFragmentStyle === 'named'
                                  ? 'Insert Selection appends fragment definitions and spreads for the checked interface or union branches.'
                                  : 'Insert Selection keeps fragment bodies inline inside the generated operation.'}
                              </Text>
                            </div>
                            {graphqlExplorerField.selectionTree.length > 0 ? (
                              <div className="graphql-explorer-tree">
                                {renderGraphqlExplorerNodes(graphqlExplorerField.selectionTree)}
                              </div>
                            ) : null}
                            {graphqlExplorerField.selectionFragments.length > 0 ? (
                              <div className="graphql-explorer-fragments">
                                <Text size="xs" fw={700} c="dimmed">Fragments</Text>
                                {renderGraphqlExplorerFragments(graphqlExplorerField.selectionFragments)}
                              </div>
                            ) : null}
                            {graphqlExplorerField.selectionTree.length === 0 &&
                            graphqlExplorerField.selectionFragments.length === 0 ? (
                              <Text size="xs" c="dimmed">
                                This root field resolves to a scalar payload, so there are no child selections to toggle.
                              </Text>
                            ) : null}
                          </div>
                        ) : null}
                        {graphqlSelectedType ? (
                          <div className="graphql-type-panel">
                            <div className="graphql-type-panel-head">
                              <div>
                                <Text size="xs" fw={700} c="dimmed">Type Navigator</Text>
                                <Text size="sm" fw={700}>{graphqlSelectedType.name}</Text>
                              </div>
                              <Group gap="xs">
                                <Badge size="xs" variant="light" color="gray">
                                  {graphqlSelectedType.kind.toLowerCase()}
                                </Badge>
                                {graphqlTypeTrailVisible.length > 1 ? (
                                  <Button
                                    size="xs"
                                    variant="subtle"
                                    onClick={() => setGraphqlTypeTrail(current => current.slice(0, -1))}
                                  >
                                    Back
                                  </Button>
                                ) : null}
                              </Group>
                            </div>
                            <div className="graphql-type-breadcrumbs">
                              {graphqlTypeTrailVisible.map((typeName, index) => (
                                <button
                                  key={`${typeName}:${index}`}
                                  type="button"
                                  className={`graphql-type-breadcrumb${index === graphqlTypeTrailVisible.length - 1 ? ' is-active' : ''}`}
                                  onClick={() => setGraphqlTypeTrail(graphqlTypeTrailVisible.slice(0, index + 1))}
                                >
                                  {typeName}
                                </button>
                              ))}
                            </div>
                            <div className="graphql-type-summary">
                              {graphqlSelectedType.fields.length > 0 ? <span><strong>{graphqlSelectedType.fields.length}</strong> fields</span> : null}
                              {graphqlSelectedType.inputFields.length > 0 ? <span><strong>{graphqlSelectedType.inputFields.length}</strong> inputs</span> : null}
                              {graphqlSelectedType.enumValues.length > 0 ? <span><strong>{graphqlSelectedType.enumValues.length}</strong> enum values</span> : null}
                              {graphqlSelectedType.possibleTypes.length > 0 ? <span><strong>{graphqlSelectedType.possibleTypes.length}</strong> variants</span> : null}
                            </div>
                            {graphqlVisiblePossibleTypes.length > 0 ? (
                              <div className="graphql-type-section">
                                <Text size="xs" fw={700} c="dimmed">Possible Types</Text>
                                <div className="graphql-type-chip-list">
                                  {graphqlVisiblePossibleTypes.map(typeName => (
                                    <button
                                      type="button"
                                      key={typeName}
                                      className={`graphql-type-chip${graphqlSelectedTypeName === typeName ? ' is-active' : ''}`}
                                      onClick={() => openGraphqlType(typeName)}
                                    >
                                      {typeName}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {graphqlVisibleTypeFields.length > 0 ? (
                              <div className="graphql-type-section">
                                <Text size="xs" fw={700} c="dimmed">Fields</Text>
                                <div className="graphql-type-list">
                                  {graphqlVisibleTypeFields.map(field => (
                                    <div className="graphql-type-row" key={field.name}>
                                      <div className="graphql-type-row-main">
                                        <strong>{field.name}</strong>
                                        {field.args.length > 0 ? (
                                          <div className="graphql-type-arg-list">
                                            {field.args.map(arg => (
                                              <button
                                                type="button"
                                                key={arg.name}
                                                className="graphql-arg-chip"
                                                onClick={() => openGraphqlType(arg.namedType)}
                                                disabled={!arg.namedType}
                                              >
                                                <span>{arg.name}</span>
                                                <small>{arg.type}</small>
                                              </button>
                                            ))}
                                          </div>
                                        ) : null}
                                      </div>
                                      {renderGraphqlTypePill(field.namedType, field.type, 'muted')}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {graphqlVisibleInputFields.length > 0 ? (
                              <div className="graphql-type-section">
                                <Text size="xs" fw={700} c="dimmed">Input Fields</Text>
                                <div className="graphql-type-list">
                                  {graphqlVisibleInputFields.map(field => (
                                    <div className="graphql-type-row" key={field.name}>
                                      <div className="graphql-type-row-main">
                                        <strong>{field.name}</strong>
                                        {field.defaultValue ? <small>default {field.defaultValue}</small> : null}
                                      </div>
                                      {renderGraphqlTypePill(field.namedType, field.type, 'muted')}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {graphqlVisibleEnumValues.length > 0 ? (
                              <div className="graphql-type-section">
                                <Text size="xs" fw={700} c="dimmed">Enum Values</Text>
                                <div className="graphql-type-chip-list">
                                  {graphqlVisibleEnumValues.map(value => (
                                    <span className="graphql-value-chip" key={value}>{value}</span>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {graphqlSchemaSearch.trim() &&
                            graphqlVisibleTypeFields.length === 0 &&
                            graphqlVisibleInputFields.length === 0 &&
                            graphqlVisibleEnumValues.length === 0 &&
                            graphqlVisiblePossibleTypes.length === 0 ? (
                              <Text size="xs" c="dimmed">
                                No members on this type matched the current schema filter.
                              </Text>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
                <div className="preview-note">
                  <Text size="xs" c="dimmed">
                    The runtime sends this as a standard GraphQL JSON payload. Schema fetch reuses resolved auth headers and the optional Schema URL.
                  </Text>
                </div>
              </div>
            ) : body.mode !== 'none' ? (
              <CodeEditor
                value={body.text || ''}
                language={body.mode === 'json' ? 'json' : 'text'}
                onChange={value => updateBody({ ...body, text: value })}
                minHeight="300px"
              />
            ) : (
              <div className="empty-body-msg">This request does not have a body.</div>
            )}
              </>
            )}
          </Tabs.Panel>

                              <Tabs.Panel value="auth">
            <AuthPanel
              auth={auth}
              requestName={requestDocument.name}
              selectedEnvironment={selectedEnvironment}
              resolvedPreview={resolvedPreview}
              onAuthChange={updateAuth}
              onRefreshRequestAuth={props.onRefreshRequestAuth}
              onSaveAuthProfile={props.onSaveAuthProfile}
            />
          </Tabs.Panel>

          <Tabs.Panel value="checks">
            {!allowCases ? (
              <WorkflowEmptyState
                title="Scratch checks stay temporary"
                detail="Save this request to the workspace before attaching reusable case assertions."
              />
            ) : !selectedCase ? (
              <WorkflowEmptyState
                title="Choose a case for assertions"
                detail="Checks are case-scoped so smoke validation can stay tied to a concrete scenario."
                actionLabel="New Case"
                onAction={props.onAddCase}
              />
            ) : (
    <div className="checks-panel">
                <div className="checks-head">
                  <Text fw={600}>Smoke Checks</Text>
                  <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={() => updateChecks([...(selectedCase.checks || []), createEmptyCheck()])}>
                    Add Check
                  </Button>
                </div>
                {(selectedCase.checks || []).length === 0 ? (
                  <WorkflowEmptyState
                    title="No checks yet"
                    detail="Add a smoke check to validate status, headers, JSON paths, response time, or saved baselines after Send."
                    actionLabel="Add Check"
                    onAction={() => updateChecks([...(selectedCase.checks || []), createEmptyCheck()])}
                  />
                ) : (
                  <div className="checks-list">
                    {(selectedCase.checks || []).map((check, index) => (
                      <div key={check.id} className="check-card">
                        <div className="check-card-head">
                          <Checkbox
                            checked={check.enabled}
                            onChange={event =>
                              updateChecks(
                                (selectedCase.checks || []).map(item =>
                                  item.id === check.id ? { ...item, enabled: event.currentTarget.checked } : item
                                )
                              )
                            }
                          />
                          <Select
                            value={check.type}
                            data={checkOptions()}
                            onChange={value =>
                              updateChecks(
                                (selectedCase.checks || []).map(item =>
                                  item.id === check.id ? { ...item, type: (value as CaseCheck['type']) || item.type } : item
                                )
                              )
                            }
                          />
                          <ActionButton
                            label="Remove"
                            onClick={() => updateChecks((selectedCase.checks || []).filter(item => item.id !== check.id))}
                          />
                        </div>
                        <div className="settings-grid">
                          <TextInput
                            label="Label"
                            value={check.label}
                            onChange={event =>
                              updateChecks(
                                (selectedCase.checks || []).map(item =>
                                  item.id === check.id ? { ...item, label: event.currentTarget.value } : item
                                )
                              )
                            }
                          />
                          {check.type === 'status-equals' || check.type === 'body-contains' || check.type === 'body-regex' || check.type === 'response-time-lt' || check.type === 'snapshot-match' ? null : (
                            <TextInput
                              label={check.type === 'header-includes' || check.type === 'header-equals' ? 'Header Name' : 'JSON Path'}
                              value={check.path}
                              onChange={event =>
                                updateChecks(
                                  (selectedCase.checks || []).map(item =>
                                    item.id === check.id ? { ...item, path: event.currentTarget.value } : item
                                  )
                                )
                              }
                            />
                          )}
                          {check.type === 'json-exists' || check.type === 'json-not-exists' ? null : check.type === 'snapshot-match' ? (
                            <Select
                              label="Baseline / Snapshot"
                              value={check.expected}
                              data={(requestDocument.examples || []).map(example => ({
                                value: example.name,
                                label: `${example.name}${example.role === 'baseline' ? ' · baseline' : ''}`
                              }))}
                              onChange={value =>
                                updateChecks(
                                  (selectedCase.checks || []).map(item =>
                                    item.id === check.id ? { ...item, expected: value || '' } : item
                                  )
                                )
                              }
                            />
                          ) : (
                            <TextInput
                              label="Expected"
                              value={check.expected}
                              onChange={event =>
                                updateChecks(
                                  (selectedCase.checks || []).map(item =>
                                    item.id === check.id ? { ...item, expected: event.currentTarget.value } : item
                                  )
                                )
                              }
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="scripts">
            <ScriptsPanel
              allowCases={allowCases}
              requestDocument={requestDocument}
              selectedCase={selectedCase}
              onRequestChange={props.onRequestChange}
              onCaseChange={updateSelectedCase}
            />
          </Tabs.Panel>

<Tabs.Panel value="settings">
            <div className="settings-grid">
              <TextInput
                label="Name"
                value={requestDocument.name}
                onChange={event => props.onRequestChange({ ...requestDocument, name: event.currentTarget.value })}
              />
              <TextInput
                label="Path"
                value={effectivePath}
                onChange={event => {
                  const nextPath = event.currentTarget.value;
                  if (selectedCase) {
                    updateSelectedCase(current => ({ ...current, overrides: { ...current.overrides, path: nextPath } }));
                  } else {
                    props.onRequestChange({ ...requestDocument, path: nextPath });
                  }
                }}
              />
              <NumberInput
                label="Timeout (ms)"
                value={runtime.timeoutMs}
                min={100}
                step={500}
                onChange={value => updateRuntime({ ...runtime, timeoutMs: Number(value) || 30000 })}
              />
              <div className="toggle-field">
                <Checkbox
                  label="Follow Redirects"
                  checked={runtime.followRedirects}
                  onChange={event => updateRuntime({ ...runtime, followRedirects: event.currentTarget.checked })}
                />
              </div>
              <Textarea
                label="Description"
                value={requestDocument.description}
                onChange={event => props.onRequestChange({ ...requestDocument, description: event.currentTarget.value })}
                minRows={3}
              />
              <div style={{ gridColumn: '1 / -1' }}>
                <div className="checks-list">
                  <div className="check-card">
                    <Text fw={700}>Request Variables</Text>
                    <Text size="xs" c="dimmed">
                      These values resolve with the request preview and runtime before environment/project fallbacks.
                    </Text>
                    <KeyValueEditor
                      rows={requestVariableRows}
                      onChange={rows =>
                        updateRequestVariableSection(
                          'request',
                          rows.map(row => normalizeRequestVariableRow(row, 'request'))
                        )
                      }
                      nameLabel="Variable"
                      valueLabel="Value"
                    />
                  </div>
                  <div className="check-card">
                    <Text fw={700}>Prompt Variables</Text>
                    <Text size="xs" c="dimmed">
                      Prompt rows ask for a value right before run. The editor value is the request-owned seed, and remembered prompt defaults from Environment Center can prefill it between runs.
                    </Text>
                    <KeyValueEditor
                      rows={promptVariableRows}
                      onChange={rows =>
                        updateRequestVariableSection(
                          'prompt',
                          rows.map(row => normalizeRequestVariableRow(row, 'prompt'))
                        )
                      }
                      nameLabel="Prompt"
                      valueLabel="Default Value"
                    />
                  </div>
                </div>
              </div>
              {selectedCase ? (
                <>
                  <Select
                    label="Test Mode"
                    value={selectedCase.testMode}
                    data={[
                      { value: 'automation', label: 'automation' },
                      { value: 'debug', label: 'debug' }
                    ]}
                    onChange={value =>
                      updateSelectedCase(current => ({
                        ...current,
                        testMode: (value as CaseDocument['testMode']) || 'automation'
                      }))
                    }
                  />
                  <TextInput
                    label="Tags"
                    placeholder="smoke, regression"
                    value={(selectedCase.tags || []).join(', ')}
                    onChange={event =>
                      updateSelectedCase(current => ({
                        ...current,
                        tags: event.currentTarget.value.split(',').map(item => item.trim()).filter(Boolean)
                      }))
                    }
                  />
                  <TextInput
                    label="Baseline Ref"
                    placeholder="shared-baseline"
                    value={selectedCase.baselineRef || ''}
                    onChange={event =>
                      updateSelectedCase(current => ({
                        ...current,
                        baselineRef: event.currentTarget.value
                      }))
                    }
                  />
                  <NumberInput
                    label="Retry Count"
                    value={selectedCase.retry?.count || 0}
                    min={0}
                    onChange={value =>
                      updateSelectedCase(current => ({
                        ...current,
                        retry: {
                          ...current.retry,
                          count: Number(value) || 0
                        }
                      }))
                    }
                  />
                  <NumberInput
                    label="Retry Delay (ms)"
                    value={selectedCase.retry?.delayMs || 0}
                    min={0}
                    step={100}
                    onChange={value =>
                      updateSelectedCase(current => ({
                        ...current,
                        retry: {
                          ...current.retry,
                          delayMs: Number(value) || 0
                        }
                      }))
                    }
                  />
                  <Select
                    label="Retry When"
                    value={(selectedCase.retry?.when || []).join(',')}
                    data={retryWhenOptions().map(option => ({
                      value: option.value,
                      label: option.label
                    }))}
                    onChange={value =>
                      updateSelectedCase(current => ({
                        ...current,
                        retry: {
                          ...current.retry,
                          when: value ? [value as any] : []
                        }
                      }))
                    }
                  />
                  <Checkbox
                    label="Skip This Case"
                    checked={selectedCase.skip?.enabled || false}
                    onChange={event =>
                      updateSelectedCase(current => ({
                        ...current,
                        skip: {
                          ...current.skip,
                          enabled: event.currentTarget.checked
                        }
                      }))
                    }
                  />
                  <TextInput
                    label="Skip Reason"
                    value={selectedCase.skip?.reason || ''}
                    onChange={event =>
                      updateSelectedCase(current => ({
                        ...current,
                        skip: {
                          ...current.skip,
                          reason: event.currentTarget.value
                        }
                      }))
                    }
                  />
                  <TextInput
                    label="Skip Condition"
                    placeholder="{{runMode}} == dryrun"
                    value={selectedCase.skip?.when || ''}
                    onChange={event =>
                      updateSelectedCase(current => ({
                        ...current,
                        skip: {
                          ...current.skip,
                          when: event.currentTarget.value
                        }
                      }))
                    }
                  />
                </>
              ) : null}
            </div>
          </Tabs.Panel>
        </div>
      </Tabs>
    </div>
  );
}

function ActionButton(props: { label: string; onClick: () => void }) {
  return (
    <Button size="xs" variant="subtle" color="red" onClick={props.onClick}>
      {props.label}
    </Button>
  );
}

import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { ActionIcon, Badge, Drawer, Select, Text, TextInput } from '@mantine/core';
import { Spotlight, spotlight, type SpotlightActionData } from '@mantine/spotlight';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { IconRefresh, IconSearch } from '@tabler/icons-react';
import { createEmptyCheck, createNamedTemplateSource, evaluateSyncGuard, inspectResolvedRequest, workspaceFolderVariableSources } from '@yapi-debugger/core';
import { save as saveFile } from '@tauri-apps/plugin-dialog';
import { SCHEMA_VERSION, createCollectionStep, createEmptyCase, createEmptyCollection, createEmptyRequest, type AuthConfig, type CollectionDocument, type CollectionRunReport, type EnvironmentDocument, type ImportWarning, type ParameterRow, type RequestDocument, type ResponseExample, type RunHistoryEntry, type SessionSnapshot, slugify, type WorkspaceIndex, type WorkspaceTreeNode } from '@yapi-debugger/schema';
import '@mantine/spotlight/styles.css';
import {
  chooseDirectory,
  chooseBrunoExportDirectory,
  chooseBrunoImportDirectory,
  chooseImportFile,
  clearBrowserCaptureSession,
  clearSession,
  deleteEntry,
  gitCloneWithProgress,
  gitDiff,
  gitPull,
  gitPush,
  gitStatus,
  inspectSession,
  launchCaptureBrowser,
  listCaptureTargets,
  listenCaptureEvents,
  listenGitCloneProgress,
  listenMenuActions,
  openTerminal,
  startBrowserCapture,
  stopBrowserCapture,
  syncMenuState,
  unwatchWorkspace,
  watchWorkspace,
  writeDocument,
  type GitStatusPayload
} from './lib/desktop';
import {
  createCaseForRequest,
  createRequestInWorkspace,
  createWorkspace,
  buildImportPreviewSummary,
  type ImportPreviewSummary,
  appendRunHistoryEntry,
  brunoForRequest,
  clearCollectionRunReports,
  clearRunHistory,
  collectionReportSeed,
  createCollectionInWorkspace,
  curlForPreview,
  deleteCaseInWorkspace,
  deleteCategoryInWorkspace,
  deleteCollectionInWorkspace,
  deleteRequestInWorkspace,
  duplicateCaseInWorkspace,
  duplicateRequestInWorkspace,
  exportBrunoCollection,
  exportBrunoJsonCollection,
  exportOpenCollection,
  loadCollectionRunReports,
  loadRunHistory,
  importFromBrunoDirectory,
  importFromFile,
  importFromUrl,
  importIntoWorkspace,
  filtersFromReport,
  openWorkspace,
  renameCaseInWorkspace,
  renameCategoryInWorkspace,
  renameRequestInWorkspace,
  refreshResolvedRequestAuth,
  rerunFailedStepKeys,
  runCollection,
  runPreparedRequest,
  saveCollectionRecord,
  saveRunHistory,
  saveEnvironment,
  saveFolderVariables,
  saveProject,
  saveRequestRecord,
  saveScratchRequestToWorkspace
} from './lib/workspace';
import { AppRail, type AppRailView } from './components/panels/AppRail';
import { TabHeader } from './components/layout/TabHeader';
import { CollectionRunnerPanel } from './components/panels/CollectionRunnerPanel';
import { CapturePanel } from './components/panels/CapturePanel';
import { EnvironmentCenterPanel } from './components/panels/EnvironmentCenterPanel';
import { HistoryPanel } from './components/panels/HistoryPanel';
import { ImportPanel } from './components/panels/ImportPanel';
import { ImportRepairPanel } from './components/panels/ImportRepairPanel';
import { InterfaceTreePanel } from './components/panels/InterfaceTreePanel';
import { ScratchPadPanel } from './components/panels/ScratchPadPanel';
import { SyncCenterPanel } from './components/panels/SyncCenterPanel';
import { PreferencesCenterPanel, type PreferencesState } from './components/panels/PreferencesCenterPanel';
import { WelcomePanel } from './components/panels/WelcomePanel';
import { WorkspaceHomePanel } from './components/panels/WorkspaceHomePanel';
import { WorkspaceMainPanel } from './components/panels/WorkspaceMainPanel';
import { buildImportRepairChecklist } from './lib/repair';
import { confirmAction, promptForSaveAs, promptForText } from './lib/dialogs';
import { collectionReportHtml, collectionReportJson, collectionReportJunit } from './lib/report-export';
import { Resizer } from './components/primitives/Resizer';
import { StatusBar } from './components/layout/StatusBar';
import { createScratchSession, loadScratchSessions, normalizeScratchTitle, saveScratchSessions, type ScratchSession } from './lib/scratch';
import {
  captureEntriesToImportResult,
  formatCaptureStepName,
  matchCaptureHostFilter,
  normalizeCaptureHostFilters,
  type BrowserTargetSummary,
  type CaptureBrowserState,
  type CaptureMode,
  type CaptureRuntimeState,
  type CapturedNetworkEntry
} from './lib/capture';
import {
  defaultWorkspaceUiState,
  ensureWorkspaceEnvironment,
  type SelectedNode,
  type WorkspaceUiState,
  useWorkspaceStore
} from './store/workspace-store';

const RECENT_STORAGE_KEY = 'yapi-debugger.recent-roots';
const UI_STORAGE_KEY_PREFIX = 'yapi-debugger.ui';
const IMPORT_SESSION_STORAGE_KEY_PREFIX = 'yapi-debugger.import-session';
const LAST_SYNC_STORAGE_KEY_PREFIX = 'yapi-debugger.last-sync';
const PROMPT_VALUES_STORAGE_KEY_PREFIX = 'yapi-debugger.prompt-values';
const PREFERENCES_STORAGE_KEY = 'yapi-debugger.preferences';
type DebuggerSpotlightGroup = {
  group: string;
  actions: SpotlightActionData[];
};
type DebuggerSpotlightEntry = SpotlightActionData | DebuggerSpotlightGroup;

function spotlightKeywords(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value
      .map(item => item.trim().toLowerCase())
      .join(' ')
      .trim();
  }
  return typeof value === 'string' ? value.toLowerCase().trim() : '';
}

function groupSpotlightActions(actions: SpotlightActionData[]): DebuggerSpotlightEntry[] {
  const groups = new Map<string, SpotlightActionData[]>();
  const result: DebuggerSpotlightEntry[] = [];

  actions.forEach(action => {
    if (!action.group) {
      result.push(action);
      return;
    }

    const bucket = groups.get(action.group) || [];
    bucket.push(action);
    groups.set(action.group, bucket);
  });

  groups.forEach((items, group) => {
    result.push({ group, actions: items });
  });

  return result;
}

function filterSpotlightActions(query: string, actions: SpotlightActionData[]): DebuggerSpotlightEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groupSpotlightActions(actions);

  const primary: SpotlightActionData[] = [];
  const secondary: SpotlightActionData[] = [];

  actions.forEach(action => {
    const label = action.label?.toLowerCase() || '';
    const description = action.description?.toLowerCase() || '';
    const keywords = spotlightKeywords(action.keywords);
    if (label.includes(needle)) {
      primary.push(action);
      return;
    }

    if (`${description} ${keywords}`.includes(needle)) {
      secondary.push(action);
    }
  });

  return groupSpotlightActions([...primary, ...secondary]);
}

function loadRecentRoots() {
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch (_err) {
    return [];
  }
}

function saveRecentRoots(roots: string[]) {
  window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(roots.slice(0, 6)));
}

function inferCloneFolderName(repoUrl: string) {
  const sanitized = repoUrl.trim().replace(/\/+$/, '').replace(/\.git$/i, '');
  const segment = sanitized.split(/[/:]/).filter(Boolean).at(-1) || 'workspace';
  return slugify(segment) || segment.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
}

function uiStorageKey(root: string) {
  return `${UI_STORAGE_KEY_PREFIX}:${root}`;
}

function importSessionStorageKey(root: string) {
  return `${IMPORT_SESSION_STORAGE_KEY_PREFIX}:${root}`;
}

function lastSyncStorageKey(root: string) {
  return `${LAST_SYNC_STORAGE_KEY_PREFIX}:${root}`;
}

function promptValuesStorageKey(root: string) {
  return `${PROMPT_VALUES_STORAGE_KEY_PREFIX}:${root}`;
}

function loadPromptValues(root: string) {
  return loadPersistedJson<Record<string, string>>(promptValuesStorageKey(root)) || {};
}

function savePromptValues(root: string, values: Record<string, string>) {
  savePersistedJson(promptValuesStorageKey(root), values);
}

function loadWorkspaceUiState(root: string): WorkspaceUiState {
  try {
    const raw = window.localStorage.getItem(uiStorageKey(root));
    if (!raw) return defaultWorkspaceUiState();
    const parsed = JSON.parse(raw) as Partial<WorkspaceUiState>;
    return {
      ...defaultWorkspaceUiState(),
      ...parsed,
      expandedRequestIds: Array.isArray(parsed.expandedRequestIds) ? parsed.expandedRequestIds : [],
      lastSelectedNode: parsed.lastSelectedNode || { kind: 'project' },
      openTabs: Array.isArray(parsed.openTabs) ? parsed.openTabs : [{ kind: 'project' }]
    };
  } catch (_err) {
    return defaultWorkspaceUiState();
  }
}

function saveWorkspaceUiState(root: string, state: WorkspaceUiState) {
  window.localStorage.setItem(uiStorageKey(root), JSON.stringify(state));
}

function loadPersistedJson<T>(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (_err) {
    return null;
  }
}

function savePersistedJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function defaultPreferences(): PreferencesState {
  return {
    theme: 'light',
    uiScale: 1,
    codeFontSize: 13,
    keybindingPreset: 'default',
    commandPaletteShortcut: 'mod + K',
    runtimeDefaults: {
      proxyUrl: '',
      clientCertificatePath: '',
      clientCertificateKeyPath: '',
      caCertificatePath: ''
    }
  };
}

function loadPreferences() {
  return loadPersistedJson<PreferencesState>(PREFERENCES_STORAGE_KEY) || defaultPreferences();
}

function savePreferences(preferences: PreferencesState) {
  savePersistedJson(PREFERENCES_STORAGE_KEY, preferences);
}

type RequestVariableRow = RequestDocument['vars']['req'][number];

function requestVariableRows(request: RequestDocument): RequestVariableRow[] {
  return request.vars?.req || [];
}

function requestVariableSource(rows: RequestVariableRow[], scope: 'request' | 'prompt') {
  const entries = rows
    .filter(row => row.enabled !== false && row.name.trim() && (scope === 'prompt' ? row.scope === 'prompt' : row.scope !== 'prompt'))
    .map(row => [row.name.trim(), row.value] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : {};
}

function requestExtraSources(
  request: RequestDocument,
  folderSources: Array<Record<string, unknown>> = [],
  promptValues?: Record<string, string>
) {
  const rows = requestVariableRows(request);
  const sources: Array<Record<string, unknown>> = [];
  if (promptValues && Object.keys(promptValues).length > 0) {
    sources.push(createNamedTemplateSource('prompt variables', promptValues, 'runtime'));
  }
  const requestValues = requestVariableSource(rows, 'request');
  if (Object.keys(requestValues).length > 0) {
    sources.push(createNamedTemplateSource('request variables', requestValues, 'runtime'));
  }
  return [...sources, ...folderSources];
}

function applyPreferencesToDocument(preferences: PreferencesState) {
  document.documentElement.dataset.debuggerTheme = preferences.theme;
  document.documentElement.style.setProperty('--ui-scale', String(preferences.uiScale));
  document.documentElement.style.setProperty('--code-font-size', `${preferences.codeFontSize}px`);
}

function selectedRequestId(node: SelectedNode) {
  return node.kind === 'request' || node.kind === 'case' ? node.requestId : null;
}

function selectedCaseId(node: SelectedNode) {
  return node.kind === 'case' ? node.caseId : null;
}

function selectedCategoryPath(node: SelectedNode, workspace: WorkspaceIndex | null) {
  if (node.kind === 'category') return node.path;
  if (node.kind === 'request' || node.kind === 'case') {
    const record = workspace?.requests.find(item => item.request.id === node.requestId);
    return record?.folderSegments.join('/') || null;
  }
  return null;
}

function isSameOrChildPath(path: string, target: string) {
  return path === target || path.startsWith(`${target}/`);
}

function findRecord(workspace: WorkspaceIndex | null, requestId: string | null) {
  if (!workspace || !requestId) return null;
  return workspace.requests.find(item => item.request.id === requestId) || null;
}

function findFolderRecord(workspace: WorkspaceIndex | null, folderPath: string | null) {
  if (!workspace || !folderPath) return null;
  return workspace.folders.find(item => item.path === folderPath) || null;
}

function normalizeFolderVariableRows(rows: ParameterRow[]) {
  return rows
    .filter(row => row.name.trim() || row.value.trim())
    .map(row => ({
      ...row,
      name: row.name.trim()
    }));
}

function requestSlugExists(workspace: WorkspaceIndex, name: string, ignoreId: string, folderPath: string) {
  return workspace.requests.some(r => 
    r.request.id !== ignoreId && 
    r.request.name === name && 
    r.folderSegments.join('/') === folderPath
  );
}

function caseSlugExists(record: WorkspaceIndex['requests'][number], name: string, ignoreId: string) {
  return record.cases.some(c => c.id !== ignoreId && c.name === name);
}

function normalizeVariableName(seed: string) {
  return String(seed || 'value')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part, index) => (index === 0 ? part.toLowerCase() : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join('') || 'value';
}

function uniqueOrigins(urls: Array<string | null | undefined>) {
  const output = new Set<string>();
  urls.forEach(value => {
    if (!value) return;
    try {
      output.add(new URL(value).origin);
    } catch (_error) {
      return;
    }
  });
  return [...output];
}

function suggestedCommitMessage(input: GitStatusPayload | null) {
  if (!input?.dirty) return 'chore(debugger): refresh workspace state';
  const debuggerFiles = input.changedFiles.filter(file => file.includes('requests/') || file.includes('environments/') || file.includes('collections/'));
  if (debuggerFiles.length === 0) return 'chore(debugger): update workspace metadata';
  const requestChanges = debuggerFiles.filter(file => file.includes('.request.yaml')).length;
  const envChanges = debuggerFiles.filter(file => file.includes('environments/')).length;
  const collectionChanges = debuggerFiles.filter(file => file.includes('.collection.yaml')).length;
  const parts = [];
  if (requestChanges) parts.push(`${requestChanges} request${requestChanges > 1 ? 's' : ''}`);
  if (envChanges) parts.push(`${envChanges} environment${envChanges > 1 ? 's' : ''}`);
  if (collectionChanges) parts.push(`${collectionChanges} collection${collectionChanges > 1 ? 's' : ''}`);
  return `chore(debugger): update ${parts.join(', ')}`;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch (_error) {
    return null;
  }
}

function flattenJsonLeaves(input: unknown, prefix = '$', rows: Array<{ path: string; value: string }> = []) {
  if (Array.isArray(input)) {
    input.forEach((item, index) => flattenJsonLeaves(item, `${prefix}[${index}]`, rows));
    return rows;
  }
  if (input && typeof input === 'object') {
    Object.entries(input).forEach(([key, value]) => flattenJsonLeaves(value, `${prefix}.${key}`, rows));
    return rows;
  }
  rows.push({
    path: prefix,
    value: typeof input === 'string' ? input : JSON.stringify(input)
  });
  return rows;
}

async function loadHostSessionSnapshots(root: string, urls: Array<string | null | undefined>) {
  const origins = uniqueOrigins(urls).slice(0, 8);
  if (origins.length === 0) return [] as Array<{ host: string; snapshot: SessionSnapshot }>;
  return Promise.all(
    origins.map(async host => ({
      host,
      snapshot: await inspectSession(root, host)
    }))
  );
}

function updateScratchSession(
  sessions: ScratchSession[],
  sessionId: string,
  updater: (session: ScratchSession) => ScratchSession
) {
  return sessions.map(session => (session.id === sessionId ? updater(session) : session));
}

function scratchSessionFromHistory(entry: RunHistoryEntry) {
  const request = createEmptyRequest(entry.requestName || 'Scratch Request');
  request.id = entry.requestId;
  request.method = entry.request.method;
  request.url = entry.request.url;
  request.path = entry.request.requestPath || entry.request.url;
  request.headers = entry.request.headers;
  request.query = entry.request.query;
  request.body = entry.request.body;
  return createScratchSession({
    title: `${entry.request.method} ${entry.request.requestPath || entry.request.url}`,
    request,
    response: entry.response,
    requestError: null,
    checkResults: entry.checkResults,
    scriptLogs: entry.scriptLogs
  });
}

function normalizeHistoryEntry(entry: RunHistoryEntry): RunHistoryEntry {
  return {
    ...entry,
    checkResults: Array.isArray(entry.checkResults) ? entry.checkResults : [],
    scriptLogs: Array.isArray(entry.scriptLogs) ? entry.scriptLogs : []
  };
}

function preferredCollectionReportStepKey(report: CollectionRunReport | null, preferredStepKey?: string | null) {
  if (!report) return null;

  if (preferredStepKey) {
    for (const iteration of report.iterations) {
      const exactMatch = iteration.stepRuns.find(step => step.stepKey === preferredStepKey);
      if (exactMatch) return `${iteration.index}:${exactMatch.stepKey}`;
    }
  }

  for (const iteration of report.iterations) {
    const failedStep = iteration.stepRuns.find(step => !step.ok && !step.skipped);
    if (failedStep) return `${iteration.index}:${failedStep.stepKey}`;
  }

  const fallbackStep = report.iterations[0]?.stepRuns[0];
  if (!fallbackStep) return null;
  return `${report.iterations[0]?.index || 0}:${fallbackStep.stepKey}`;
}

function responseMimeType(headers: Array<{ name: string; value: string }>) {
  return headers.find(header => header.name.toLowerCase() === 'content-type')?.value || 'application/json';
}

function upsertRequestExample(
  examples: Array<Partial<ResponseExample> & { name: string; text: string }>,
  nextExample: { name: string; role: 'example' | 'baseline'; status?: number; mimeType?: string; text: string }
): ResponseExample[] {
  return [
    ...examples
      .filter(example => example.name !== nextExample.name)
      .map(example => ({
        name: example.name,
        role: example.role || 'example',
        status: example.status,
        mimeType: example.mimeType,
        text: example.text,
        file: example.file
      })),
    nextExample
  ];
}

type ImportRepairSession = {
  importedAt: string;
  format: string;
  requestIds: string[];
  requestNames: string[];
  warnings: ImportWarning[];
  importedBaseUrl?: string;
  previewSummary: ImportPreviewSummary | null;
  strategy: 'append' | 'replace';
};

function loadImportRepairSession(root: string) {
  return loadPersistedJson<ImportRepairSession>(importSessionStorageKey(root));
}

function saveImportRepairSession(root: string, session: ImportRepairSession | null) {
  if (!session) {
    window.localStorage.removeItem(importSessionStorageKey(root));
    return;
  }
  savePersistedJson(importSessionStorageKey(root), session);
}

function loadLastSyncAt(root: string) {
  return loadPersistedJson<string>(lastSyncStorageKey(root));
}

function saveLastSyncAt(root: string, timestamp: string | null) {
  if (!timestamp) {
    window.localStorage.removeItem(lastSyncStorageKey(root));
    return;
  }
  savePersistedJson(lastSyncStorageKey(root), timestamp);
}

function upsertCapturedEntry(entries: CapturedNetworkEntry[], nextEntry: CapturedNetworkEntry) {
  const existingIndex = entries.findIndex(entry => entry.id === nextEntry.id);
  if (existingIndex === -1) {
    return [nextEntry, ...entries].sort((a, b) => b.startedAtMs - a.startedAtMs);
  }
  const nextEntries = [...entries];
  nextEntries[existingIndex] = nextEntry;
  return nextEntries.sort((a, b) => b.startedAtMs - a.startedAtMs);
}

function selectedCapturedEntries(entries: CapturedNetworkEntry[], selectedIds: string[]) {
  const selectedSet = new Set(selectedIds);
  return entries
    .filter(entry => selectedSet.has(entry.id))
    .sort((a, b) => a.startedAtMs - b.startedAtMs);
}

type GitRiskItem = {
  id: string;
  title: string;
  description: string;
  severity: 'warning' | 'danger';
};

function isSensitiveName(name: string) {
  return /token|secret|password|passwd|authorization|cookie|api[-_]?key|client[-_]?secret|access[-_]?key/i.test(name);
}

function isSensitiveValue(value: string) {
  const normalized = value.trim();
  if (!normalized) return false;
  if (normalized.includes('{{')) return false;
  if (/^(example|placeholder|changeme|replace-me|your-|<)/i.test(normalized)) return false;
  return normalized.length >= 6;
}

function collectGitRisks(workspace: WorkspaceIndex | null): GitRiskItem[] {
  if (!workspace) return [];
  const risks: GitRiskItem[] = [];
  const sharedSecrets = workspace.environments.flatMap(item => {
    const environment = item.document;
    const sharedVars = environment.sharedVars || environment.vars || {};
    const sharedHeaders = environment.sharedHeaders || environment.headers || [];
    const matches = [
      ...Object.entries(sharedVars)
        .filter(([name, value]) => isSensitiveName(name) && isSensitiveValue(value))
        .map(([name]) => `${environment.name}.${name}`),
      ...sharedHeaders
        .filter(row => isSensitiveName(row.name) && isSensitiveValue(row.value))
        .map(row => `${environment.name}.${row.name}`)
    ];
    return matches;
  });

  if (sharedSecrets.length > 0) {
    risks.push({
      id: 'shared-secrets',
      title: 'Shared environments may contain secrets',
      description: `Potential secret values were found in shared environment fields: ${sharedSecrets.slice(0, 4).join(', ')}${sharedSecrets.length > 4 ? '...' : ''}. Move them into local overlays before syncing through Git.`,
      severity: 'danger'
    });
  }

  const hasLocalIgnore = workspace.gitignoreContent?.split('\n').some(line => line.trim() === 'environments/*.local.yaml');
  if (!hasLocalIgnore) {
    risks.push({
      id: 'local-ignore-missing',
      title: 'Local overlays are not protected by .gitignore',
      description: 'This workspace is missing the recommended `environments/*.local.yaml` ignore rule, so local secrets may be committed by mistake.',
      severity: 'warning'
    });
  }

  return risks;
}

export function App() {
  const store = useWorkspaceStore();
  const gridRef = useRef<HTMLDivElement>(null);
  const [projectName, setProjectName] = useState('New API Workspace');
  const [importUrl, setImportUrl] = useState('');
  const [importOpened, setImportOpened] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [uiState, setUiState] = useState<WorkspaceUiState>(defaultWorkspaceUiState());
  const [activeView, setActiveView] = useState<AppRailView>('workspace');
  const [activeWorkbenchPane, setActiveWorkbenchPane] = useState<'overview' | 'import-tasks'>('overview');
  const [historyEntries, setHistoryEntries] = useState<RunHistoryEntry[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedExampleName, setSelectedExampleName] = useState<string | null>(null);
  const [importStrategy, setImportStrategy] = useState<'append' | 'replace'>('append');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [draftCollection, setDraftCollection] = useState<CollectionDocument | null>(null);
  const [collectionDataText, setCollectionDataText] = useState('');
  const [collectionPanelTabHint, setCollectionPanelTabHint] = useState<'design' | 'data' | 'reports' | null>(null);
  const [collectionReports, setCollectionReports] = useState<CollectionRunReport[]>([]);
  const [selectedCollectionReportId, setSelectedCollectionReportId] = useState<string | null>(null);
  const [selectedCollectionStepKey, setSelectedCollectionStepKey] = useState<string | null>(null);
  const [scratchSessions, setScratchSessions] = useState<ScratchSession[]>(() => loadScratchSessions());
  const [selectedScratchId, setSelectedScratchId] = useState<string | null>(null);
  const [scratchRequestTab, setScratchRequestTab] = useState<WorkspaceUiState['activeRequestTab']>('query');
  const [scratchResponseTab, setScratchResponseTab] = useState<WorkspaceUiState['activeResponseTab']>('body');
  const [scratchMainSplitRatio, setScratchMainSplitRatio] = useState(0.5);
  const [sessionSnapshot, setSessionSnapshot] = useState<SessionSnapshot | null>(null);
  const [runtimeVariables, setRuntimeVariables] = useState<Record<string, string>>({});
  const [promptVariables, setPromptVariables] = useState<Record<string, string>>({});
  const [runtimeEnvironments, setRuntimeEnvironments] = useState<Record<string, EnvironmentDocument>>({});
  const [categoryVariableRows, setCategoryVariableRows] = useState<ParameterRow[]>([]);
  const [hostSessionSnapshots, setHostSessionSnapshots] = useState<Array<{ host: string; snapshot: SessionSnapshot }>>([]);
  const [gitInfo, setGitInfo] = useState<GitStatusPayload | null>(null);
  const [selectedGitDiffFile, setSelectedGitDiffFile] = useState<string | null>(null);
  const [gitDiffText, setGitDiffText] = useState('');
  const [gitDiffLoading, setGitDiffLoading] = useState(false);
  const [gitDiffError, setGitDiffError] = useState<string | null>(null);
  const [lastImportSession, setLastImportSession] = useState<ImportRepairSession | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [spotlightQuery, setSpotlightQuery] = useState('');
  const [captureBrowser, setCaptureBrowser] = useState<CaptureBrowserState | null>(null);
  const [captureRuntime, setCaptureRuntime] = useState<CaptureRuntimeState | null>(null);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('target');
  const [captureTargets, setCaptureTargets] = useState<BrowserTargetSummary[]>([]);
  const [selectedCaptureTargetId, setSelectedCaptureTargetId] = useState<string | null>(null);
  const [captureFilterText, setCaptureFilterText] = useState('');
  const [captureEntries, setCaptureEntries] = useState<CapturedNetworkEntry[]>([]);
  const [selectedCaptureEntryId, setSelectedCaptureEntryId] = useState<string | null>(null);
  const [selectedCaptureIds, setSelectedCaptureIds] = useState<string[]>([]);
  const [captureExportStrategy, setCaptureExportStrategy] = useState<'append' | 'replace'>('append');
  const [captureCollectionTargetMode, setCaptureCollectionTargetMode] = useState<'existing' | 'new'>('existing');
  const [captureCollectionId, setCaptureCollectionId] = useState<string | null>(null);
  const [captureNewCollectionName, setCaptureNewCollectionName] = useState('Captured Flow');
  const [preferences, setPreferences] = useState<PreferencesState>(() => loadPreferences());

  function applyRuntimeDefaultsToRequest(request: RequestDocument): RequestDocument {
    return {
      ...request,
      runtime: {
        ...preferences.runtimeDefaults,
        ...request.runtime
      }
    };
  }

  const spotlightActions = useMemo(() => {
    if (!store.workspace) return [];
    const actions: SpotlightActionData[] = [];

    const walk = (node: WorkspaceTreeNode) => {
      if (node.kind === 'category') {
        actions.push({
          id: `spotlight-cat-${node.path}`,
          group: '分类',
          label: node.name,
          description: node.path,
          keywords: [node.path, 'category', '分类'],
          dimmedSections: false,
          leftSection: <span className="debugger-spotlight-glyph is-category">C</span>,
          rightSection: <span className="debugger-spotlight-pill is-category">分类</span>,
          onClick: () => {
            setActiveView('workspace');
            setActiveWorkbenchPane('overview');
            store.selectNode({ kind: 'category', path: node.path });
          }
        });
      }

      if (node.kind === 'request') {
        const method = node.method.toUpperCase();
        actions.push({
          id: `spotlight-req-${node.requestId}`,
          group: '接口',
          label: node.name,
          description: node.requestPath,
          keywords: [node.requestPath, node.method, node.name, 'request', '接口'],
          dimmedSections: false,
          leftSection: <span className="debugger-spotlight-glyph is-request">R</span>,
          rightSection: <span className={`debugger-spotlight-pill is-method is-${method.toLowerCase()}`}>{method}</span>,
          onClick: () => {
            setActiveView('workspace');
            setActiveWorkbenchPane('overview');
            store.selectNode({ kind: 'request', requestId: node.requestId });
          }
        });
      }

      if ('children' in node && node.children) {
        node.children.forEach(walk);
      }
    };

    store.workspace.tree.forEach(walk);
    return actions;
  }, [store.workspace]);

  useEffect(() => {
    applyPreferencesToDocument(preferences);
    savePreferences(preferences);
  }, [preferences]);

  const filteredSpotlightActions = useMemo(
    () => filterSpotlightActions(spotlightQuery, spotlightActions),
    [spotlightActions, spotlightQuery]
  );
  const spotlightCounts = useMemo(
    () =>
      spotlightActions.reduce(
        (acc, item) => {
          if (item.group === '分类') acc.categories += 1;
          if (item.group === '接口') acc.requests += 1;
          return acc;
        },
        { categories: 0, requests: 0 }
      ),
    [spotlightActions]
  );

  const requestId = selectedRequestId(store.selectedNode);
  const caseId = selectedCaseId(store.selectedNode);
  const categoryPath = selectedCategoryPath(store.selectedNode, store.workspace);

  const selectedEnvironment = store.workspace?.environments.find(
    item => item.document.name === store.activeEnvironmentName
  )?.document || null;
  const selectedRuntimeEnvironment = useMemo(() => {
    if (!store.workspace) return null;
    return runtimeEnvironments[store.activeEnvironmentName] || ensureWorkspaceEnvironment(store.activeEnvironmentName, store.workspace);
  }, [runtimeEnvironments, store.activeEnvironmentName, store.workspace]);

  useEffect(() => {
    setRuntimeEnvironments(current => {
      if (!store.workspace) return {};
      const next: Record<string, EnvironmentDocument> = {};
      Object.entries(current).forEach(([name, environment]) => {
        if (store.workspace?.environments.some(item => item.document.name === name)) {
          next[name] = environment;
        }
      });
      return next;
    });
  }, [store.workspace]);

  function cacheRuntimeEnvironment(environment: EnvironmentDocument | undefined) {
    if (!environment) return;
    setRuntimeEnvironments(current => ({
      ...current,
      [environment.name]: structuredClone(environment)
    }));
  }

  function updatePromptVariables(updater: (current: Record<string, string>) => Record<string, string>) {
    setPromptVariables(current => {
      const next = updater(current);
      if (store.workspace?.root) {
        savePromptValues(store.workspace.root, next);
      }
      return next;
    });
  }

  const importedRecords = useMemo(() => {
    if (!store.workspace || !lastImportSession) return [];
    const importedIds = new Set(lastImportSession.requestIds);
    return store.workspace.requests.filter(record => importedIds.has(record.request.id));
  }, [store.workspace, lastImportSession]);

  const importRepairChecklist = useMemo(() => {
    if (!store.workspace || !lastImportSession) return null;
    return buildImportRepairChecklist({
      project: store.workspace.project,
      environment: selectedEnvironment,
      requests: importedRecords.map(record => ({
        request: record.request,
        cases: record.cases
      })),
      warnings: lastImportSession.warnings,
      conflictCount: lastImportSession.previewSummary?.conflicts || 0
    });
  }, [store.workspace, lastImportSession, importedRecords, selectedEnvironment]);

  const gitRisks = useMemo(() => collectGitRisks(store.workspace), [store.workspace]);
  const syncGuard = useMemo(() => evaluateSyncGuard(gitInfo), [gitInfo]);
  const formatWorkspaceTimestamp = useCallback((value: string | number | Date | null | undefined) => {
    if (!value) return '时间未知';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString();
  }, []);
  const homeImportSummary = useMemo(() => {
    if (!lastImportSession) return null;
    return {
      format: lastImportSession.format,
      importedAt: formatWorkspaceTimestamp(lastImportSession.importedAt),
      importedRequestCount: lastImportSession.requestIds.length,
      runnableCount: importRepairChecklist?.runnableRequestIds.length || 0,
      blockedCount: importRepairChecklist?.blockedRequestIds.length || 0,
      warningCount: lastImportSession.warnings.length,
      runnableScore: lastImportSession.previewSummary?.runnableScore || 0
    };
  }, [formatWorkspaceTimestamp, importRepairChecklist, lastImportSession]);
  const homeRecentSuccess = useMemo(() => {
    const entry = historyEntries.find(item => item.response?.ok);
    if (!entry) return null;
    return {
      requestId: entry.requestId,
      requestName: entry.requestName || entry.request.url,
      status: entry.response.status,
      durationMs: entry.response.durationMs,
      timestamp: formatWorkspaceTimestamp(entry.response.timestamp)
    };
  }, [formatWorkspaceTimestamp, historyEntries]);
  const homeLastCollectionRun = useMemo(() => {
    const report = collectionReports[0];
    if (!report) return null;
    return {
      collectionId: report.collectionId,
      collectionName: report.collectionName,
      status: report.status,
      failedSteps: report.failedSteps,
      finishedAt: formatWorkspaceTimestamp(report.finishedAt)
    };
  }, [collectionReports, formatWorkspaceTimestamp]);
  const importTaskCount = importRepairChecklist?.tasks.length || 0;
  const currentSelectionSummary = useMemo(() => {
    const record = requestId ? findRecord(store.workspace, requestId) : null;
    const selectedCase = caseId ? record?.cases.find(item => item.id === caseId) || null : null;
    return {
      requestId,
      requestName: record?.request.name || null,
      caseId,
      caseName: selectedCase?.name || null
    };
  }, [caseId, requestId, store.workspace]);
  const currentRequestRecord = useMemo(
    () => findRecord(store.workspace, requestId),
    [requestId, store.workspace]
  );
  const selectedCategoryRecord = useMemo(
    () => findFolderRecord(store.workspace, categoryPath),
    [categoryPath, store.workspace]
  );
  const currentRequestFolderSources = useMemo(
    () =>
      store.workspace && currentRequestRecord
        ? workspaceFolderVariableSources(store.workspace, currentRequestRecord.folderSegments)
        : [],
    [currentRequestRecord, store.workspace]
  );
  const categoryVariableRowsBaseline = useMemo(
    () => selectedCategoryRecord?.document.variableRows || [],
    [selectedCategoryRecord]
  );
  const categoryVariablesDirty = useMemo(
    () =>
      JSON.stringify(normalizeFolderVariableRows(categoryVariableRows)) !==
      JSON.stringify(normalizeFolderVariableRows(categoryVariableRowsBaseline)),
    [categoryVariableRows, categoryVariableRowsBaseline]
  );

  useEffect(() => {
    setCategoryVariableRows(selectedCategoryRecord?.document.variableRows || []);
  }, [selectedCategoryRecord]);

  const captureFilters = useMemo(() => normalizeCaptureHostFilters(captureFilterText), [captureFilterText]);
  const visibleCaptureEntries = useMemo(
    () => captureEntries.filter(entry => matchCaptureHostFilter(entry.host, captureFilters)),
    [captureEntries, captureFilters]
  );
  const selectedCaptureEntry = useMemo(
    () => captureEntries.find(entry => entry.id === selectedCaptureEntryId) || visibleCaptureEntries[0] || null,
    [captureEntries, selectedCaptureEntryId, visibleCaptureEntries]
  );
  const selectedVisibleCaptureCount = useMemo(() => {
    const visibleIds = new Set(visibleCaptureEntries.map(entry => entry.id));
    return selectedCaptureIds.filter(id => visibleIds.has(id)).length;
  }, [selectedCaptureIds, visibleCaptureEntries]);
  const isAllVisibleCaptureSelected = visibleCaptureEntries.length > 0 && selectedVisibleCaptureCount === visibleCaptureEntries.length;

  const selectedCollectionRecord = useMemo(() => {
    if (!store.workspace || !selectedCollectionId) return null;
    return store.workspace.collections.find(item => item.document.id === selectedCollectionId) || null;
  }, [store.workspace, selectedCollectionId]);

  const currentScratch = useMemo(() => {
    return scratchSessions.find(session => session.id === selectedScratchId) || scratchSessions[0] || null;
  }, [scratchSessions, selectedScratchId]);
  const contextResponseInfo = useMemo(() => {
    if (activeView === 'scratch') {
      if (!currentScratch?.response) return null;
      return {
        status: currentScratch.response.status,
        duration: currentScratch.response.durationMs,
        ok: currentScratch.response.ok
      };
    }
    if (!store.response) return null;
    return {
      status: store.response.status,
      duration: store.response.durationMs,
      ok: store.response.status >= 200 && store.response.status < 300
    };
  }, [activeView, currentScratch, store.response]);

  const categoryRequests = useMemo(() => {
    if (!store.workspace || !categoryPath) return [];
    return store.workspace.requests.filter(record => {
      const value = record.folderSegments.join('/');
      return isSameOrChildPath(value, categoryPath);
    });
  }, [store.workspace, categoryPath]);

  const namedRuntimeSource = useMemo(
    () => createNamedTemplateSource('runtime variables', runtimeVariables, 'runtime'),
    [runtimeVariables]
  );

  async function collectPromptVariablesForRequest(request: RequestDocument, actionLabel: string) {
    const promptRows = requestVariableRows(request).filter(row => row.enabled !== false && row.name.trim() && row.scope === 'prompt');
    if (promptRows.length === 0) return {};
    const values: Record<string, string> = {};
    for (const row of promptRows) {
      const rememberedValue = promptVariables[row.name.trim()];
      const value = await promptForText({
        title: `Prompt · ${row.name}`,
        label: row.name,
        description: row.description?.trim() || `Provide a value for {{${row.name}}} before ${actionLabel}.`,
        defaultValue: rememberedValue ?? (row.value || ''),
        placeholder: `Value for ${row.name}`,
        confirmLabel: 'Use Value'
      });
      if (value === null) {
        notifications.show({ color: 'blue', message: `${actionLabel} cancelled` });
        return null;
      }
      values[row.name.trim()] = value;
    }
    if (Object.keys(values).length > 0) {
      updatePromptVariables(current => ({
        ...current,
        ...values
      }));
    }
    return values;
  }

  const currentRequestInsight = useMemo(() => {
    if (!store.workspace || !requestId || !store.draftRequest) return null;
    try {
      return inspectResolvedRequest(
        store.workspace.project,
        applyRuntimeDefaultsToRequest(store.draftRequest),
        store.draftCases.find(item => item.id === caseId),
        selectedRuntimeEnvironment || undefined,
        [...requestExtraSources(applyRuntimeDefaultsToRequest(store.draftRequest), currentRequestFolderSources), namedRuntimeSource]
      );
    } catch (_error) {
      return null;
    }
  }, [store.workspace, store.draftRequest, store.draftCases, caseId, selectedRuntimeEnvironment, requestId, namedRuntimeSource, currentRequestFolderSources, preferences.runtimeDefaults]);

  const currentRequestPreview = currentRequestInsight?.preview || null;

  const currentScratchInsight = useMemo(() => {
    if (!store.workspace || !currentScratch) return null;
    try {
      return inspectResolvedRequest(
        store.workspace.project,
        applyRuntimeDefaultsToRequest(currentScratch.request),
        undefined,
        selectedRuntimeEnvironment || undefined,
        [...requestExtraSources(applyRuntimeDefaultsToRequest(currentScratch.request)), namedRuntimeSource]
      );
    } catch (_error) {
      return null;
    }
  }, [store.workspace, currentScratch, selectedRuntimeEnvironment, namedRuntimeSource, preferences.runtimeDefaults]);

  const currentScratchPreview = currentScratchInsight?.preview || null;
  const sessionTargetUrl =
    (activeView === 'scratch' ? currentScratchPreview?.url : currentRequestPreview?.url) ||
    currentRequestPreview?.url ||
    currentScratchPreview?.url ||
    null;

  function renderTabHeader() {
    if (!store.workspace) return null;
    return (
      <TabHeader
        workspace={store.workspace}
        tabs={store.openTabs}
        activeNode={store.selectedNode}
        onSelect={store.selectNode}
        onClose={store.closeTab}
      />
    );
  }

  const importPreviewInfo = useMemo(() => {
    if (!store.workspace || !store.importPreview) return null;
    return buildImportPreviewSummary(store.workspace, store.importPreview);
  }, [store.workspace, store.importPreview]);

  function openWorkbenchOverview() {
    setActiveView('workspace');
    setActiveWorkbenchPane('overview');
    store.selectNode({ kind: 'project' });
  }

  function openImportTasks() {
    setActiveView('workspace');
    setActiveWorkbenchPane('import-tasks');
    store.selectNode({ kind: 'project' });
  }

  function applyWorkspaceState(workspace: WorkspaceIndex) {
    const nextUi = loadWorkspaceUiState(workspace.root);
    setUiState(nextUi);
    setSelectedExampleName(null);
    setRuntimeVariables({});
    setPromptVariables(loadPromptValues(workspace.root));
    setCategoryVariableRows([]);
    setSessionSnapshot(null);
    setHostSessionSnapshots([]);
    setGitInfo(null);
    setSelectedGitDiffFile(null);
    setGitDiffText('');
    setGitDiffLoading(false);
    setGitDiffError(null);
    setLastImportSession(loadImportRepairSession(workspace.root));
    setLastSyncAt(loadLastSyncAt(workspace.root));
    setSelectedCollectionId(workspace.collections[0]?.document.id || null);
    setDraftCollection(workspace.collections[0]?.document || null);
    setCollectionDataText(workspace.collections[0]?.dataText || '');
    setCaptureCollectionId(workspace.collections[0]?.document.id || null);
    setCaptureCollectionTargetMode(workspace.collections.length > 0 ? 'existing' : 'new');
    setCaptureNewCollectionName('Captured Flow');
    setCaptureEntries([]);
    setSelectedCaptureEntryId(null);
    setSelectedCaptureIds([]);
    setCollectionPanelTabHint(null);
    setActiveView('workspace');
    setActiveWorkbenchPane('overview');
    store.setWorkspace(workspace);
    store.setOpenTabs(nextUi.openTabs);
    store.selectNode(nextUi.lastSelectedNode);
  }

  function updateUiState(updater: (current: WorkspaceUiState) => WorkspaceUiState) {
    setUiState(current => updater(current));
  }

  const reloadWorkspace = async (nodeToSelect?: SelectedNode) => {
    if (!store.workspace?.root) return;
    const workspace = await openWorkspace(store.workspace.root);
    store.setWorkspace(workspace);
    const nextCollection =
      workspace.collections.find(item => item.document.id === selectedCollectionId) ||
      workspace.collections[0] ||
      null;
    setSelectedCollectionId(nextCollection?.document.id || null);
    setDraftCollection(nextCollection?.document || null);
    setCollectionDataText(nextCollection?.dataText || '');
    if (nodeToSelect) store.selectNode(nodeToSelect);
  };

  const openMutation = useMutation({
    mutationFn: (root: string) => openWorkspace(root),
    onSuccess: workspace => {
      const nextRoots = [workspace.root, ...store.recentRoots.filter(r => r !== workspace.root)];
      store.setRecentRoots(nextRoots);
      saveRecentRoots(nextRoots);
      applyWorkspaceState(workspace);
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Failed to open workspace: ${(error as Error).message}` });
    }
  });

  const createMutation = useMutation({
    mutationFn: (root: string) => createWorkspace(root, projectName),
    onSuccess: workspace => {
      const nextRoots = [workspace.root, ...store.recentRoots.filter(r => r !== workspace.root)];
      store.setRecentRoots(nextRoots);
      saveRecentRoots(nextRoots);
      applyWorkspaceState(workspace);
      notifications.show({ color: 'teal', message: 'Workspace created successfully' });
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Failed to create workspace: ${(error as Error).message}` });
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace) return;
      if (store.draftProject) await saveProject(store.workspace.root, store.draftProject);
      await Promise.all(store.workspace.environments.map(item => saveEnvironment(store.workspace!.root, item.document)));
      if (store.draftRequest) {
        const record = findRecord(store.workspace, store.draftRequest.id);
        await saveRequestRecord(
          store.workspace.root,
          store.draftRequest,
          store.draftCases,
          record?.resourceDirPath || '',
          record?.requestFilePath || '',
          record?.folderSegments || []
        );
      }
      if (draftCollection) {
        const currentRecord = store.workspace.collections.find(item => item.document.id === draftCollection.id);
        await saveCollectionRecord(
          store.workspace.root,
          draftCollection,
          collectionDataText,
          currentRecord?.filePath,
          currentRecord?.dataFilePath
        );
      }
    },
    onSuccess: () => {
      reloadWorkspace(store.selectedNode);
      handleRefreshGitStatus().catch(() => undefined);
      notifications.show({ color: 'teal', message: 'Changes saved' });
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Failed to save changes: ${(error as Error).message}` });
    }
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace || !requestId || !store.draftRequest) return;
      const environment = ensureWorkspaceEnvironment(store.activeEnvironmentName, store.workspace);
      const request = applyRuntimeDefaultsToRequest(store.draftRequest);
      const promptValues = await collectPromptVariablesForRequest(request, 'request run');
      if (promptValues === null) return null;
      return runPreparedRequest(store.workspace, {
        request,
        caseDocument: store.draftCases.find(item => item.id === caseId),
        sessionId: store.workspace.root,
        context: {
          state: {
            variables: runtimeVariables,
            environment: structuredClone(selectedRuntimeEnvironment || environment)
          },
          extraSources: requestExtraSources(request, [], promptValues)
        }
      });
    },
    onSuccess: async result => {
      if (!result || !store.workspace || !requestId) return;
      store.setResponse(result.response, result.checkResults, result.scriptLogs);
      setRuntimeVariables({ ...result.state.variables });
      cacheRuntimeEnvironment(result.state.environment);
      inspectSession(store.workspace.root, result.preview.url).then(setSessionSnapshot).catch(() => setSessionSnapshot(null));
      await saveRunHistory(
        store.workspace,
        requestId,
        caseId || undefined,
        result.preview,
        result.response,
        result.checkResults,
        result.scriptLogs
      );
      loadRunHistory(store.workspace.root).then(entries => setHistoryEntries(entries.map(normalizeHistoryEntry)));
    },
    onError: error => {
      const message = (error as any).message || String(error) || 'Unknown network error';
      store.setError(message);
      notifications.show({ color: 'red', message: `Request failed: ${message}` });
    }
  });

  const scratchRunMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace || !currentScratch) return null;
      const environment = ensureWorkspaceEnvironment(store.activeEnvironmentName, store.workspace);
      const request = applyRuntimeDefaultsToRequest(currentScratch.request);
      const promptValues = await collectPromptVariablesForRequest(request, 'scratch run');
      if (promptValues === null) return null;
      return runPreparedRequest(store.workspace, {
        request,
        sessionId: store.workspace.root,
        context: {
          state: {
            variables: runtimeVariables,
            environment: structuredClone(selectedRuntimeEnvironment || environment)
          },
          extraSources: requestExtraSources(request, [], promptValues)
        }
      });
    },
    onSuccess: async result => {
      if (!result || !store.workspace || !currentScratch) return;
      setRuntimeVariables({ ...result.state.variables });
      cacheRuntimeEnvironment(result.state.environment);
      setScratchSessions(current =>
        updateScratchSession(current, currentScratch.id, session => ({
          ...session,
          response: result.response,
          requestError: null,
          checkResults: result.checkResults,
          scriptLogs: result.scriptLogs,
          updatedAt: new Date().toISOString()
        }))
      );
      await appendRunHistoryEntry(
        store.workspace.root,
        {
          requestId: currentScratch.request.id,
          requestName: currentScratch.request.name || currentScratch.title
        },
        result.preview,
        result.response,
        result.checkResults,
        result.scriptLogs
      );
      loadRunHistory(store.workspace.root).then(entries => setHistoryEntries(entries.map(normalizeHistoryEntry)));
      inspectSession(store.workspace.root, result.preview.url).then(setSessionSnapshot).catch(() => setSessionSnapshot(null));
    },
    onError: error => {
      const message = (error as any).message || String(error) || 'Unknown network error';
      if (currentScratch) {
        setScratchSessions(current =>
          updateScratchSession(current, currentScratch.id, session => ({
            ...session,
            requestError: message,
            response: null,
            checkResults: [],
            scriptLogs: [],
            updatedAt: new Date().toISOString()
          }))
        );
      }
      notifications.show({ color: 'red', message: `Scratch request failed: ${message}` });
    }
  });

  const importFileMutation = useMutation({
    mutationFn: async () => {
      const filePath = await chooseImportFile();
      if (!filePath) return;
      return importFromFile(filePath);
    },
    onSuccess: data => {
      if (data) store.setImportPreview(data.result);
    }
  });

  const importBrunoDirectoryMutation = useMutation({
    mutationFn: async () => {
      const root = await chooseBrunoImportDirectory();
      if (!root) return;
      return importFromBrunoDirectory(root);
    },
    onSuccess: data => {
      if (data) store.setImportPreview(data.result);
    }
  });

  const importUrlMutation = useMutation({
    mutationFn: () => importFromUrl(importUrl, store.importAuth),
    onSuccess: data => store.setImportPreview(data.result)
  });

  const applyImportMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace || !store.importPreview) return;
      return importIntoWorkspace(store.workspace, store.importPreview, importStrategy);
    },
    onSuccess: result => {
      if (result) {
        const nextSession = {
          importedAt: new Date().toISOString(),
          format: result.detectedFormat,
          requestIds: result.requestIds,
          requestNames: result.requestNames,
          warnings: result.warnings,
          importedBaseUrl: result.importedBaseUrl,
          previewSummary: importPreviewInfo,
          strategy: result.strategy
        } satisfies ImportRepairSession;
        setLastImportSession(nextSession);
        if (store.workspace) {
          saveImportRepairSession(store.workspace.root, nextSession);
        }
      }
      setImportOpened(false);
      store.setImportPreview(null);
      reloadWorkspace();
      setActiveView('workspace');
      setActiveWorkbenchPane('import-tasks');
      store.selectNode({ kind: 'project' });
      handleRefreshGitStatus().catch(() => undefined);
      notifications.show({ color: 'teal', message: 'Import successful' });
    }
  });

  const addRequestMutation = useMutation({
    mutationFn: (targetCategory: string | null) => {
      if (!store.workspace) throw new Error('No workspace');
      return createRequestInWorkspace(store.workspace.root, targetCategory);
    },
    onSuccess: nextRequestId => {
      reloadWorkspace({ kind: 'request', requestId: nextRequestId });
    }
  });

  const addCaseMutation = useMutation({
    mutationFn: (targetReqId: string) => {
      if (!store.workspace) throw new Error('No workspace');
      return createCaseForRequest(store.workspace.root, targetReqId);
    },
    onSuccess: ({ requestId: reqId, caseId: nextCaseId }) => {
      reloadWorkspace({ kind: 'case', requestId: reqId, caseId: nextCaseId });
      notifications.show({ color: 'teal', message: 'New test case created' });
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Failed to create case: ${(error as Error).message}` });
    }
  });

  const addCollectionMutation = useMutation({
    mutationFn: ({ targetRequestId, targetCaseId }: { targetRequestId?: string; targetCaseId?: string } = {}) => {
      if (!store.workspace) throw new Error('No workspace');
      return createCollectionInWorkspace(store.workspace.root, store.workspace, targetRequestId, targetCaseId);
    },
    onSuccess: async nextId => {
      await reloadWorkspace();
      setSelectedCollectionId(nextId);
      setCollectionPanelTabHint('design');
      setActiveView('collections');
      notifications.show({ color: 'teal', message: 'Collection created' });
    }
  });

  const launchCaptureBrowserMutation = useMutation({
    mutationFn: async () => {
      const browser = await launchCaptureBrowser();
      const targets = await listCaptureTargets().catch(() => [] as BrowserTargetSummary[]);
      return { browser, targets };
    },
    onSuccess: ({ browser, targets }) => {
      setCaptureBrowser(browser);
      setCaptureTargets(targets);
      setSelectedCaptureTargetId(current => current || targets[0]?.targetId || null);
      notifications.show({ color: 'teal', message: `Chrome launched on port ${browser.port}` });
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Failed to launch capture browser: ${(error as Error).message}` });
    }
  });

  const refreshCaptureTargetsMutation = useMutation({
    mutationFn: () => listCaptureTargets(),
    onSuccess: targets => {
      setCaptureTargets(targets);
      setSelectedCaptureTargetId(current => current || targets[0]?.targetId || null);
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Failed to load browser targets: ${(error as Error).message}` });
    }
  });

  const startCaptureMutation = useMutation({
    mutationFn: () => startBrowserCapture({ mode: captureMode, targetId: selectedCaptureTargetId }),
    onSuccess: state => {
      setCaptureRuntime(state);
      notifications.show({ color: 'teal', message: state.mode === 'browser' ? 'Listening to browser targets' : 'Listening to selected target' });
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Failed to start capture: ${(error as Error).message}` });
    }
  });

  const stopCaptureMutation = useMutation({
    mutationFn: () => stopBrowserCapture(),
    onSuccess: state => {
      setCaptureRuntime(state);
      notifications.show({ color: 'teal', message: 'Capture stopped' });
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Failed to stop capture: ${(error as Error).message}` });
    }
  });

  const clearCaptureMutation = useMutation({
    mutationFn: () => clearBrowserCaptureSession(),
    onSuccess: state => {
      setCaptureRuntime(state);
      setCaptureEntries([]);
      setSelectedCaptureEntryId(null);
      setSelectedCaptureIds([]);
      notifications.show({ color: 'teal', message: 'Capture list cleared' });
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Failed to clear capture session: ${(error as Error).message}` });
    }
  });

  const exportCaptureMutation = useMutation({
    mutationFn: async (mode: 'requests' | 'collection') => {
      if (!store.workspace) throw new Error('No workspace');
      const entries = selectedCapturedEntries(captureEntries, selectedCaptureIds);
      if (entries.length === 0) throw new Error('Select at least one captured request');
      const importResult = captureEntriesToImportResult(entries);
      const outcome = await importIntoWorkspace(store.workspace, importResult, captureExportStrategy);

      if (mode === 'requests') {
        return {
          mode,
          requestCount: outcome.requestIds.length,
          collectionId: null as string | null
        };
      }

      let nextCollection: CollectionDocument;
      let previousFilePath: string | undefined;
      let previousDataFilePath: string | undefined;
      if (captureCollectionTargetMode === 'existing') {
        const existing = store.workspace.collections.find(item => item.document.id === captureCollectionId);
        if (!existing) throw new Error('Choose an existing collection first');
        nextCollection = structuredClone(existing.document);
        previousFilePath = existing.filePath;
        previousDataFilePath = existing.dataFilePath;
      } else {
        const nextName = captureNewCollectionName.trim();
        if (!nextName) throw new Error('Provide a collection name first');
        if (store.workspace.collections.some(item => item.document.name === nextName)) {
          throw new Error('A collection with the same name already exists');
        }
        nextCollection = createEmptyCollection(nextName);
      }

      nextCollection.steps = [
        ...nextCollection.steps,
        ...entries.map((entry, index) =>
          createCollectionStep({
            key: `step_${nextCollection.steps.length + index + 1}`,
            requestId: outcome.requestIds[index],
            name: formatCaptureStepName(entry)
          })
        )
      ];

      await saveCollectionRecord(
        store.workspace.root,
        nextCollection,
        captureCollectionTargetMode === 'existing'
          ? store.workspace.collections.find(item => item.document.id === nextCollection.id)?.dataText || ''
          : '',
        previousFilePath,
        previousDataFilePath
      );

      return {
        mode,
        requestCount: outcome.requestIds.length,
        collectionId: nextCollection.id
      };
    },
    onSuccess: async result => {
      await reloadWorkspace();
      if (result.mode === 'collection' && result.collectionId) {
        setSelectedCollectionId(result.collectionId);
        setCaptureCollectionId(result.collectionId);
        setCollectionPanelTabHint('design');
        setActiveView('collections');
      }
      notifications.show({
        color: 'teal',
        message:
          result.mode === 'collection'
            ? `Added ${result.requestCount} captured requests to a collection`
            : `Saved ${result.requestCount} captured requests into the workspace`
      });
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Failed to export capture: ${(error as Error).message}` });
    }
  });

  const runCollectionMutation = useMutation({
    mutationFn: async (options?: {
      stepKeys?: string[];
      seedReport?: CollectionRunReport | null;
      collectionId?: string;
      tags?: string[];
      environmentName?: string;
      failFast?: boolean;
    }) => {
      if (!store.workspace || !(options?.collectionId || selectedCollectionId)) throw new Error('No collection selected');
      return runCollection(store.workspace, options?.collectionId || selectedCollectionId!, {
        environmentName: options?.environmentName || store.activeEnvironmentName,
        stepKeys: options?.stepKeys,
        seedReport: options?.seedReport,
        filters: options && 'tags' in options ? { tags: options.tags || [] } : undefined,
        failFast: options?.failFast
      });
    },
    onSuccess: async report => {
      if (!store.workspace) return;
      setCollectionReports(current => [report, ...current]);
      setSelectedCollectionId(report.collectionId);
      setSelectedCollectionReportId(report.id);
      setSelectedCollectionStepKey(preferredCollectionReportStepKey(report));
      setCollectionPanelTabHint('reports');
      setActiveView('collections');
      notifications.show({ color: report.failedSteps > 0 ? 'orange' : 'teal', message: `Collection run ${report.status}` });
      const firstRun = report.iterations[0]?.stepRuns.find(step => step.request && step.response);
      if (firstRun?.request && firstRun.response) {
        store.setResponse(firstRun.response, firstRun.checkResults, firstRun.scriptLogs);
      }
    },
    onError: error => {
      notifications.show({ color: 'red', message: `Collection run failed: ${(error as Error).message}` });
    }
  });

  const renameCategoryMutation = useMutation({
    mutationFn: ({ oldPath, nextPath }: { oldPath: string; nextPath: string }) => {
      if (!store.workspace) throw new Error('No workspace');
      return renameCategoryInWorkspace(store.workspace.root, store.workspace, oldPath, nextPath);
    },
    onSuccess: (_, { nextPath }) => {
      reloadWorkspace({ kind: 'category', path: nextPath });
    }
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (path: string) => {
      if (!store.workspace) throw new Error('No workspace');
      return deleteCategoryInWorkspace(store.workspace, path);
    },
    onSuccess: () => reloadWorkspace({ kind: 'project' })
  });

  const renameRequestMutation = useMutation({
    mutationFn: ({ requestId, nextName }: { requestId: string; nextName: string }) => {
      if (!store.workspace) throw new Error('No workspace');
      const record = findRecord(store.workspace, requestId);
      if (!record) throw new Error('Request not found');
      return renameRequestInWorkspace(store.workspace.root, record, nextName);
    },
    onSuccess: (_, { requestId }) => reloadWorkspace({ kind: 'request', requestId })
  });

  const duplicateRequestMutation = useMutation({
    mutationFn: (reqId: string) => {
      if (!store.workspace) throw new Error('No workspace');
      const record = findRecord(store.workspace, reqId);
      if (!record) throw new Error('Request not found');
      const siblingNames = store.workspace.requests
        .filter(item => item.folderSegments.join('/') === record.folderSegments.join('/'))
        .map(item => item.request.name);
      return duplicateRequestInWorkspace(store.workspace.root, record, siblingNames);
    },
    onSuccess: nextId => reloadWorkspace({ kind: 'request', requestId: nextId })
  });

  const deleteRequestMutation = useMutation({
    mutationFn: (reqId: string) => {
      if (!store.workspace) throw new Error('No workspace');
      const record = findRecord(store.workspace, reqId);
      if (!record) throw new Error('Request not found');
      return deleteRequestInWorkspace(record);
    },
    onSuccess: () => reloadWorkspace({ kind: 'project' })
  });

  const renameCaseMutation = useMutation({
    mutationFn: ({ requestId, caseId, nextName }: { requestId: string; caseId: string; nextName: string }) => {
      if (!store.workspace) throw new Error('No workspace');
      const record = findRecord(store.workspace, requestId);
      if (!record) throw new Error('Request not found');
      return renameCaseInWorkspace(store.workspace.root, record, caseId, nextName);
    },
    onSuccess: (_, { requestId, caseId }) => reloadWorkspace({ kind: 'case', requestId, caseId })
  });

  const duplicateCaseMutation = useMutation({
    mutationFn: ({ requestId, caseId }: { requestId: string; caseId: string }) => {
      if (!store.workspace) throw new Error('No workspace');
      const record = findRecord(store.workspace, requestId);
      if (!record) throw new Error('Request not found');
      return duplicateCaseInWorkspace(store.workspace.root, record, caseId);
    },
    onSuccess: (nextCaseId, { requestId }) => reloadWorkspace({ kind: 'case', requestId, caseId: nextCaseId })
  });

  const deleteCaseMutation = useMutation({
    mutationFn: ({ requestId, caseId }: { requestId: string; caseId: string }) => {
      if (!store.workspace) throw new Error('No workspace');
      const record = findRecord(store.workspace, requestId);
      if (!record) throw new Error('Request not found');
      return deleteCaseInWorkspace(store.workspace.root, record, caseId);
    },
    onSuccess: (_, { requestId }) => reloadWorkspace({ kind: 'request', requestId })
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace) return;
      const root = store.workspace.root;
      await unwatchWorkspace(root).catch(() => undefined);
      await deleteEntry(root, true);
      const nextRecentRoots = store.recentRoots.filter(item => item !== root);
      store.setRecentRoots(nextRecentRoots);
      saveRecentRoots(nextRecentRoots);
      setUiState(defaultWorkspaceUiState());
      setImportOpened(false);
      store.setWorkspace(null);
    }
  });

  useEffect(() => {
    const roots = loadRecentRoots();
    store.setRecentRoots(roots);
  }, []);

  useEffect(() => {
    syncMenuState(store.recentRoots, Boolean(store.workspace)).catch(() => undefined);
  }, [store.recentRoots, store.workspace?.root]);

  useEffect(() => {
    if (!store.workspace?.root) return;
    saveWorkspaceUiState(store.workspace.root, {
      ...uiState,
      lastSelectedNode: store.selectedNode,
      openTabs: store.openTabs
    });
  }, [uiState, store.selectedNode, store.openTabs, store.workspace?.root]);

  useEffect(() => {
    saveScratchSessions(
      scratchSessions.map(session => ({
        ...session,
        title: normalizeScratchTitle(session.request)
      }))
    );
  }, [scratchSessions]);

  useEffect(() => {
    if (!scratchSessions.length) {
      const fallback = createScratchSession();
      setScratchSessions([fallback]);
      setSelectedScratchId(fallback.id);
      return;
    }
    if (!scratchSessions.some(session => session.id === selectedScratchId)) {
      setSelectedScratchId(scratchSessions[0]?.id || null);
    }
  }, [scratchSessions, selectedScratchId]);

  useEffect(() => {
    if (!store.workspace?.root) {
      setHistoryEntries([]);
      setSelectedHistoryId(null);
      setRuntimeVariables({});
      setSessionSnapshot(null);
      return;
    }
    loadRunHistory(store.workspace.root)
      .then(entries => {
        const normalizedEntries = entries.map(normalizeHistoryEntry);
        setHistoryEntries(normalizedEntries);
        setSelectedHistoryId(normalizedEntries[0]?.id || null);
      })
      .catch(() => undefined);
  }, [store.workspace?.root]);

  useEffect(() => {
    if (!store.workspace?.root || !sessionTargetUrl) {
      setSessionSnapshot(null);
      return;
    }
    inspectSession(store.workspace.root, sessionTargetUrl)
      .then(setSessionSnapshot)
      .catch(() => setSessionSnapshot(null));
  }, [store.workspace?.root, sessionTargetUrl]);

  useEffect(() => {
    if (!store.workspace?.root) {
      setGitInfo(null);
      return;
    }
    gitStatus(store.workspace.root)
      .then(setGitInfo)
      .catch(() => setGitInfo(null));
  }, [store.workspace?.root]);

  useEffect(() => {
    if (!store.workspace?.root) {
      setHostSessionSnapshots([]);
      return;
    }
    loadHostSessionSnapshots(store.workspace.root, [
      sessionTargetUrl,
      ...historyEntries.map(entry => entry.request.url),
      ...historyEntries.map(entry => entry.response.url)
    ])
      .then(setHostSessionSnapshots)
      .catch(() => setHostSessionSnapshots([]));
  }, [store.workspace?.root, sessionTargetUrl, historyEntries]);

  useEffect(() => {
    if (!store.workspace?.root) {
      setCollectionReports([]);
      setSelectedCollectionReportId(null);
      setSelectedCollectionStepKey(null);
      return;
    }
    loadCollectionRunReports(store.workspace.root)
      .then(reports => {
        setCollectionReports(reports);
        setSelectedCollectionReportId(reports[0]?.id || null);
        setSelectedCollectionStepKey(preferredCollectionReportStepKey(reports[0] || null));
      })
      .catch(() => undefined);
  }, [store.workspace?.root]);

  useEffect(() => {
    if (!store.workspace) return;
    const nextCollection =
      store.workspace.collections.find(item => item.document.id === selectedCollectionId) ||
      store.workspace.collections[0] ||
      null;
    setDraftCollection(nextCollection?.document || null);
    setCollectionDataText(nextCollection?.dataText || '');
  }, [store.workspace, selectedCollectionId]);

  useEffect(() => {
    if (!store.workspace) {
      setCaptureCollectionId(null);
      return;
    }
    const nextCollection =
      store.workspace.collections.find(item => item.document.id === captureCollectionId) ||
      store.workspace.collections[0] ||
      null;
    setCaptureCollectionId(nextCollection?.document.id || null);
    if (!nextCollection) {
      setCaptureCollectionTargetMode('new');
    }
  }, [captureCollectionId, store.workspace]);

  useEffect(() => {
    const unlistenPromise = listenCaptureEvents({
      onState: state => {
        setCaptureRuntime(state);
      },
      onEntry: entry => {
        startTransition(() => {
          setCaptureEntries(current => upsertCapturedEntry(current, entry));
          setSelectedCaptureEntryId(current => current || entry.id);
        });
      }
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten()).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (activeView !== 'capture' || !captureBrowser || captureTargets.length > 0 || refreshCaptureTargetsMutation.isPending) return;
    refreshCaptureTargetsMutation.mutate();
  }, [activeView, captureBrowser, captureTargets.length, refreshCaptureTargetsMutation]);

  useEffect(() => {
    const unlistenPromise = listenMenuActions(payload => {
      if (payload.action === 'open-project') {
        handleOpenDirectory();
        return;
      }
      if (payload.action === 'new-project') {
        handleCreateWorkspace();
        return;
      }
      if (payload.action === 'import-project') {
        if (store.workspace) setImportOpened(true);
        return;
      }
      if (payload.action === 'close-workspace') {
        setUiState(defaultWorkspaceUiState());
        setLastImportSession(null);
        store.setWorkspace(null);
        return;
      }
      if (payload.action === 'open-recent' && payload.root) {
        openExistingWorkspace(payload.root);
      }
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten()).catch(() => undefined);
    };
  }, [store.workspace, projectName]);

  useEffect(() => {
    if (!store.workspace?.root) return;
    let unlisten: (() => void) | undefined;

    watchWorkspace(store.workspace.root, async () => {
      const workspace = await openWorkspace(store.workspace!.root);
      applyWorkspaceState(workspace);
    }).then(listener => {
      unlisten = listener;
    });

    return () => {
      if (unlisten) unlisten();
      unwatchWorkspace(store.workspace!.root).catch(() => undefined);
    };
  }, [store.workspace?.root]);

  function openExistingWorkspace(root: string) {
    openMutation.mutate(root);
  }

  async function handleOpenDirectory() {
    const root = await chooseDirectory();
    if (root) openExistingWorkspace(root);
  }

  async function handleCreateWorkspace() {
    const root = await chooseDirectory();
    if (root) createMutation.mutate(root);
  }

  async function handleCloneRepository() {
    const repoUrl = await promptForText({
      title: 'Clone Git 仓库',
      label: '仓库地址',
      placeholder: 'https://github.com/org/repo.git',
      confirmLabel: '下一步',
      validate: value => (value.trim() ? null : '请输入仓库地址。')
    });
    if (!repoUrl) return;
    const parent = await chooseDirectory();
    if (!parent) return;
    const folderName = await promptForText({
      title: 'Clone Git 仓库',
      label: '目标文件夹名',
      description: `仓库会被 clone 到 ${parent} 下的新目录中。`,
      defaultValue: inferCloneFolderName(repoUrl),
      confirmLabel: '开始 Clone',
      validate: value => (value.trim() ? null : '请输入目标文件夹名。')
    });
    if (!folderName) return;
    const cloneId = crypto.randomUUID();
    const notificationId = `git-clone:${cloneId}`;
    const unlistenProgressPromise = listenGitCloneProgress(payload => {
      if (payload.cloneId !== cloneId) return;
      notifications.update({
        id: notificationId,
        loading: payload.stage !== 'complete' && payload.stage !== 'error',
        autoClose: payload.stage === 'complete' ? 3000 : false,
        withCloseButton: payload.stage === 'complete' || payload.stage === 'error',
        color: payload.stage === 'error' ? 'red' : payload.stage === 'complete' ? 'teal' : 'blue',
        title: payload.stage === 'error' ? 'Clone failed' : payload.stage === 'complete' ? 'Clone complete' : 'Cloning repository',
        message: payload.message
      });
    });
    notifications.show({
      id: notificationId,
      loading: true,
      autoClose: false,
      withCloseButton: false,
      color: 'blue',
      title: 'Cloning repository',
      message: `Contacting ${repoUrl.trim()}`
    });
    try {
      const root = await gitCloneWithProgress(parent, repoUrl, folderName.trim(), cloneId);
      notifications.update({
        id: notificationId,
        loading: false,
        autoClose: 3000,
        withCloseButton: true,
        color: 'teal',
        title: 'Clone complete',
        message: `Repository cloned into ${folderName.trim()}`
      });
      openExistingWorkspace(root);
    } catch (error) {
      notifications.update({
        id: notificationId,
        loading: false,
        autoClose: false,
        withCloseButton: true,
        color: 'red',
        title: 'Clone failed',
        message: (error as Error).message
      });
    } finally {
      unlistenProgressPromise.then(unlisten => unlisten()).catch(() => undefined);
    }
  }

  function handleConfirmCreateCategory() {
    const seed = categoryDraft.trim();
    if (!seed) return;
    const nextPath = categoryPath ? `${categoryPath}/${seed}` : seed;
    handleSelectCategory(nextPath);
    setCategoryDraft('');
    setCreatingCategory(false);
    notifications.show({ color: 'teal', message: `Category ${nextPath} is ready. Create a request inside it.` });
  }

  async function handleSaveCategoryVariables() {
    if (!store.workspace || !categoryPath) return;
    await saveFolderVariables(
      store.workspace.root,
      categoryPath,
      categoryVariableRows,
      selectedCategoryRecord?.filePath
    );
    notifications.show({ color: 'teal', message: 'Category variables saved' });
    await reloadWorkspace({ kind: 'category', path: categoryPath });
  }

  async function handleAddEnvironment() {
    if (!store.workspace) return;
    const nextName = await promptForText({
      title: '新建环境',
      label: '环境名称',
      defaultValue: 'staging',
      placeholder: '例如：staging / test / local',
      confirmLabel: '创建环境',
      validate: value => {
        if (!value) return '请输入环境名称。';
        if (store.workspace?.environments.some(item => item.document.name === value)) {
          return '环境名称已存在，请换一个名称。';
        }
        return null;
      }
    });
    if (!nextName) return;
    await saveEnvironment(store.workspace.root, {
      schemaVersion: SCHEMA_VERSION,
      name: nextName,
      vars: {},
      headers: [],
      authProfiles: []
    });
    reloadWorkspace();
  }

  function handleCreateScratch(seed?: Partial<ScratchSession>) {
    const nextScratch = createScratchSession(seed);
    setScratchSessions(current => [nextScratch, ...current].slice(0, 6));
    setSelectedScratchId(nextScratch.id);
    setActiveView('scratch');
  }

  function handleUpdateScratchRequest(request: ScratchSession['request']) {
    if (!currentScratch) return;
    setScratchSessions(current =>
      updateScratchSession(current, currentScratch.id, session => ({
        ...session,
        request,
        title: normalizeScratchTitle(request),
        updatedAt: new Date().toISOString()
      }))
    );
  }

  function handleSetScratchResponseState(
    updater: (session: ScratchSession) => ScratchSession
  ) {
    if (!currentScratch) return;
    setScratchSessions(current => updateScratchSession(current, currentScratch.id, updater));
  }

  function handleCopyCurrentRequestToScratch() {
    if (!store.draftRequest) return;
    handleCreateScratch({
      title: normalizeScratchTitle(store.draftRequest),
      request: structuredClone(store.draftRequest)
    });
  }

  async function handleSaveScratchToWorkspace() {
    if (!store.workspace || !currentScratch) return;
    const nextId = await saveScratchRequestToWorkspace(store.workspace, currentScratch.request, categoryPath);
    notifications.show({ color: 'teal', message: 'Scratch request saved to workspace' });
    await reloadWorkspace({ kind: 'request', requestId: nextId });
    setActiveView('workspace');
  }

  function handleOpenHistoryInScratch(entry: RunHistoryEntry) {
    handleCreateScratch(scratchSessionFromHistory(entry));
  }

  function handleOpenImportPreviewInScratch() {
    const imported = store.importPreview?.requests[0];
    if (!imported) {
      notifications.show({ color: 'blue', message: 'Preview an import first to open it in Scratch' });
      return;
    }
    handleCreateScratch({
      title: normalizeScratchTitle(imported.request),
      request: structuredClone(imported.request)
    });
  }

  async function handleRefreshSession() {
    if (!store.workspace) return;
    try {
      const [snapshot, hostSnapshots] = await Promise.all([
        inspectSession(store.workspace.root, sessionTargetUrl || undefined),
        loadHostSessionSnapshots(store.workspace.root, [
          sessionTargetUrl,
          ...historyEntries.map(entry => entry.request.url),
          ...historyEntries.map(entry => entry.response.url)
        ])
      ]);
      setSessionSnapshot(snapshot);
      setHostSessionSnapshots(hostSnapshots);
      notifications.show({ color: 'teal', message: 'Session snapshot refreshed' });
    } catch (error) {
      notifications.show({ color: 'red', message: `Failed to inspect session: ${(error as Error).message}` });
    }
  }

  async function handleRefreshRequestAuth(forceRefresh = true) {
    if (!store.workspace || !requestId) return;
    try {
      const request = store.draftRequest ? applyRuntimeDefaultsToRequest(store.draftRequest) : null;
      const promptValues = request ? await collectPromptVariablesForRequest(request, 'auth refresh') : {};
      if (promptValues === null) return;
      const refreshed = await refreshResolvedRequestAuth(store.workspace, requestId, caseId || undefined, {
        environmentName: store.activeEnvironmentName,
        runtimeVariables,
        extraSources: request ? requestExtraSources(request, [], promptValues) : [],
        forceRefresh
      });
      cacheRuntimeEnvironment(refreshed.environment);
      notifications.show({ color: 'teal', message: 'OAuth token refreshed for the active request' });
    } catch (error) {
      notifications.show({ color: 'red', message: `Failed to refresh auth: ${(error as Error).message}` });
    }
  }

  async function handleClearSessionCookies() {
    if (!store.workspace) return;
    try {
      await clearSession(store.workspace.root);
      const hostSnapshots = await loadHostSessionSnapshots(store.workspace.root, [
        sessionTargetUrl,
        ...historyEntries.map(entry => entry.request.url),
        ...historyEntries.map(entry => entry.response.url)
      ]);
      setSessionSnapshot(sessionTargetUrl ? await inspectSession(store.workspace.root, sessionTargetUrl) : null);
      setHostSessionSnapshots(hostSnapshots);
      notifications.show({ color: 'teal', message: 'Workspace session cleared' });
    } catch (error) {
      notifications.show({ color: 'red', message: `Failed to clear session: ${(error as Error).message}` });
    }
  }

  async function handleSaveAuthProfile(seed: string, auth: AuthConfig) {
    if (!selectedEnvironment) return;
    const name = await promptForText({
      title: '保存为环境认证配置',
      label: '认证配置名称',
      defaultValue: seed,
      placeholder: '例如：admin-token / oauth-client',
      confirmLabel: '保存配置',
      validate: value => (!value ? '请输入认证配置名称。' : null)
    });
    if (!name) return;
    store.updateEnvironment(selectedEnvironment.name, environment => ({
      ...environment,
      authProfiles: [
        ...environment.authProfiles.filter(item => item.name !== name),
        {
          name,
          auth
        }
      ]
    }));
    notifications.show({ color: 'teal', message: `Auth profile "${name}" saved` });
  }

  async function handleExtractResponseValue(target: 'local' | 'runtime', input: { suggestedName: string; value: string }) {
    const variableName = await promptForText({
      title: target === 'runtime' ? '提取为运行时变量' : '提取为本地环境变量',
      label: '变量名',
      defaultValue: normalizeVariableName(input.suggestedName),
      placeholder: '例如：userId / accessToken',
      confirmLabel: '保存变量',
      validate: value => (!value ? '请输入变量名。' : null)
    });
    if (!variableName) return;
    if (target === 'runtime') {
      setRuntimeVariables(current => ({
        ...current,
        [variableName]: input.value
      }));
      notifications.show({ color: 'teal', message: `Runtime variable "${variableName}" updated` });
      return;
    }
    if (!selectedEnvironment) {
      notifications.show({ color: 'red', message: 'Select an environment before extracting to a local secret.' });
      return;
    }
    store.updateEnvironment(selectedEnvironment.name, environment => {
      const sharedVars = environment.sharedVars || environment.vars || {};
      const sharedHeaders = environment.sharedHeaders || environment.headers || [];
      const localVars = {
        ...(environment.localVars || {}),
        [variableName]: input.value
      };
      return {
        ...environment,
        sharedVars,
        sharedHeaders,
        localVars,
        vars: {
          ...sharedVars,
          ...localVars
        },
        headers: [...sharedHeaders],
        overlayMode: 'overlay'
      };
    });
    notifications.show({ color: 'teal', message: `Local secret "${variableName}" saved to environment overlay` });
  }

  async function handleExtractCollectionReportValue(target: 'local' | 'runtime' | 'collection', input: { suggestedName: string; value: string }) {
    if (target === 'local' || target === 'runtime') {
      await handleExtractResponseValue(target, input);
      return;
    }
    const variableName = await promptForText({
      title: '提取为 Collection 变量',
      label: '变量名',
      defaultValue: normalizeVariableName(input.suggestedName),
      placeholder: '例如：orderId / profileId',
      confirmLabel: '保存变量',
      validate: value => (!value ? '请输入变量名。' : null)
    });
    if (!variableName) return;
    if (!draftCollection) {
      notifications.show({ color: 'red', message: 'Select a collection before extracting collection variables.' });
      return;
    }
    setDraftCollection(current =>
      current
        ? {
            ...current,
            vars: {
              ...current.vars,
              [variableName]: input.value
            }
          }
        : current
    );
    notifications.show({ color: 'teal', message: `Collection variable "${variableName}" updated` });
  }

  function handleOpenImportedRequest(targetRequestId: string | null, preferCase = false) {
    if (!targetRequestId) return;
    const record = store.workspace?.requests.find(item => item.request.id === targetRequestId);
    if (!record) return;
    setActiveView('workspace');
    if (preferCase && record.cases[0]) {
      store.selectNode({ kind: 'case', requestId: record.request.id, caseId: record.cases[0].id });
      return;
    }
    store.selectNode({ kind: 'request', requestId: record.request.id });
  }

  function handleOpenLastSuccessfulRequest() {
    const entry = historyEntries.find(item => item.response?.ok);
    if (!entry) {
      notifications.show({ color: 'blue', message: 'No successful request run is available yet.' });
      return;
    }
    void handleReplayHistory(entry);
  }

  function handleSeedImportVariables(scope: 'local' | 'shared') {
    if (!selectedEnvironment || !importRepairChecklist || importRepairChecklist.missingVariables.length === 0) return;
    store.updateEnvironment(selectedEnvironment.name, environment => {
      const sharedVars = { ...(environment.sharedVars || environment.vars || {}) };
      const localVars = { ...(environment.localVars || {}) };
      importRepairChecklist.missingVariables.forEach(key => {
        if (scope === 'local') {
          if (!(key in localVars) && !(key in sharedVars)) {
            localVars[key] = '';
          }
          return;
        }
        if (!(key in sharedVars)) {
          sharedVars[key] = '';
        }
      });
      return {
        ...environment,
        sharedVars,
        localVars,
        vars: {
          ...sharedVars,
          ...localVars
        },
        sharedHeaders: environment.sharedHeaders || environment.headers || [],
        headers: environment.sharedHeaders || environment.headers || [],
        overlayMode: Object.keys(localVars).length > 0 || environment.localFilePath ? 'overlay' : environment.overlayMode
      };
    });
    saveMutation.mutate();
    notifications.show({
      color: 'teal',
      message: `Seeded ${importRepairChecklist.missingVariables.length} variables into the ${scope === 'local' ? 'local overlay' : 'shared environment'}`
    });
  }

  function handleApplyImportedBaseUrl() {
    if (!lastImportSession?.importedBaseUrl || !store.workspace || !store.draftProject) return;
    const nextProject = {
      ...store.draftProject,
      runtime: {
        ...store.draftProject.runtime,
        baseUrl: lastImportSession.importedBaseUrl
      }
    };
    store.updateProject(nextProject);
    saveMutation.mutate();
    notifications.show({ color: 'teal', message: `Workspace baseUrl updated to ${lastImportSession.importedBaseUrl}` });
  }

  async function handleExportSelectedCollectionReport(format: 'json' | 'html' | 'junit') {
    const report = collectionReports.find(item => item.id === selectedCollectionReportId) || collectionReports[0];
    if (!report) {
      notifications.show({ color: 'blue', message: 'Select a collection report first.' });
      return;
    }

    const targetPath = await saveFile({
      title: 'Export Collection Report',
      defaultPath: `${slugify(report.collectionName || 'collection-report')}.${format === 'junit' ? 'xml' : format}`,
      filters: [
        {
          name: format.toUpperCase(),
          extensions: [format === 'junit' ? 'xml' : format]
        }
      ]
    });
    if (!targetPath) return;

    const content =
      format === 'json'
        ? collectionReportJson(report)
        : format === 'junit'
          ? collectionReportJunit(report)
          : collectionReportHtml(report);
    await writeDocument(targetPath, content);
    notifications.show({ color: 'teal', message: `Collection report exported as ${format.toUpperCase()}` });
  }

  async function handleExportConfiguredCollectionReports() {
    const report = collectionReports.find(item => item.id === selectedCollectionReportId) || collectionReports[0];
    const sourceCollection = draftCollection || selectedCollectionRecord?.document || null;
    if (!report) {
      notifications.show({ color: 'blue', message: 'Select a collection report first.' });
      return;
    }
    const enabledReporters = sourceCollection?.reporters || ['json', 'html'];
    if (enabledReporters.length === 0) {
      notifications.show({ color: 'blue', message: 'Enable at least one reporter format first.' });
      return;
    }

    const targetPath = await saveFile({
      title: 'Export Configured Collection Reports',
      defaultPath: `${slugify(report.collectionName || 'collection-report')}.json`,
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'HTML', extensions: ['html'] },
        { name: 'XML', extensions: ['xml'] }
      ]
    });
    if (!targetPath) return;

    const basePath = targetPath.replace(/\.(json|html|xml)$/i, '');
    for (const reporter of enabledReporters) {
      const content =
        reporter === 'json'
          ? collectionReportJson(report)
          : reporter === 'junit'
            ? collectionReportJunit(report)
            : collectionReportHtml(report);
      const extension = reporter === 'junit' ? 'xml' : reporter;
      await writeDocument(`${basePath}.${extension}`, content);
    }
    notifications.show({
      color: 'teal',
      message: `Exported ${enabledReporters.length} configured report format${enabledReporters.length > 1 ? 's' : ''}`
    });
  }

  async function handleExportSelectedCollectionBruno(format: 'folder' | 'json' = 'folder') {
    if (!store.workspace || !draftCollection) {
      notifications.show({ color: 'blue', message: 'Select a collection first.' });
      return;
    }

    if (format === 'json') {
      const targetPath = await saveFile({
        title: 'Export Bruno JSON Collection',
        defaultPath: `${slugify(draftCollection.name || store.workspace.project.name || 'bruno-collection')}.bruno.json`,
        filters: [
          {
            name: 'Bruno JSON',
            extensions: ['json']
          }
        ]
      });
      if (!targetPath) return;
      await writeDocument(targetPath, exportBrunoJsonCollection(store.workspace, draftCollection));
      notifications.show({
        color: 'teal',
        message: 'Bruno JSON collection exported.'
      });
      return;
    }

    const targetRoot = await chooseBrunoExportDirectory();
    if (!targetRoot) return;

    const writes = await exportBrunoCollection(store.workspace, targetRoot, draftCollection);
    notifications.show({
      color: 'teal',
      message: `Bruno collection exported with ${writes.length} files.`
    });
  }

  async function handleExportSelectedCollectionOpenCollection() {
    if (!store.workspace || !draftCollection) {
      notifications.show({ color: 'blue', message: 'Select a collection first.' });
      return;
    }

    const targetPath = await saveFile({
      title: 'Export OpenCollection',
      defaultPath: `${slugify(draftCollection.name || store.workspace.project.name || 'opencollection')}.opencollection.json`,
      filters: [
        {
          name: 'OpenCollection',
          extensions: ['json']
        }
      ]
    });
    if (!targetPath) return;

    await writeDocument(targetPath, exportOpenCollection(store.workspace, draftCollection));
    notifications.show({ color: 'teal', message: 'OpenCollection exported.' });
  }

  async function handleRefreshGitStatus() {
    if (!store.workspace) return;
    try {
      const nextGitInfo = await gitStatus(store.workspace.root);
      setGitInfo(nextGitInfo);
      if (!nextGitInfo.changedFiles.length) {
        setSelectedGitDiffFile(null);
        setGitDiffText('');
        setGitDiffError(null);
        return;
      }
      if (selectedGitDiffFile && !nextGitInfo.changedFiles.includes(selectedGitDiffFile)) {
        setSelectedGitDiffFile(null);
        setGitDiffText('');
        setGitDiffError(null);
      }
    } catch (error) {
      notifications.show({ color: 'red', message: `Failed to read git status: ${(error as Error).message}` });
    }
  }

  async function handleLoadGitDiff(path: string) {
    if (!store.workspace) return;
    try {
      setSelectedGitDiffFile(path);
      setGitDiffLoading(true);
      setGitDiffError(null);
      setGitDiffText(await gitDiff(store.workspace.root, path));
    } catch (error) {
      setGitDiffError((error as Error).message || 'Failed to load git diff');
      setGitDiffText('');
    } finally {
      setGitDiffLoading(false);
    }
  }

  async function handleGitPull() {
    if (!store.workspace) return;
    if (!syncGuard.canPull) {
      setActiveView('sync');
      notifications.show({ color: 'orange', message: syncGuard.pullReason || '当前不能执行 Pull。' });
      return;
    }
    try {
      const output = await gitPull(store.workspace.root);
      const syncedAt = new Date().toISOString();
      setLastSyncAt(syncedAt);
      saveLastSyncAt(store.workspace.root, syncedAt);
      await handleRefreshGitStatus();
      notifications.show({ color: 'teal', message: output || 'Git pull completed' });
    } catch (error) {
      notifications.show({ color: 'red', message: `Git pull failed: ${(error as Error).message}` });
    }
  }

  async function handleGitPush() {
    if (!store.workspace) return;
    if (!syncGuard.canPush) {
      setActiveView('sync');
      notifications.show({ color: 'orange', message: syncGuard.pushReason || '当前不能执行 Push。' });
      return;
    }
    try {
      const output = await gitPush(store.workspace.root);
      const syncedAt = new Date().toISOString();
      setLastSyncAt(syncedAt);
      saveLastSyncAt(store.workspace.root, syncedAt);
      await handleRefreshGitStatus();
      notifications.show({ color: 'teal', message: output || 'Git push completed' });
    } catch (error) {
      notifications.show({ color: 'red', message: `Git push failed: ${(error as Error).message}` });
    }
  }

  async function handleCreateCheckFromResponse(input: {
    type: 'status-equals' | 'header-equals' | 'header-includes' | 'json-exists' | 'json-equals';
    label: string;
    path?: string;
    expected?: string;
  }) {
    if (!store.workspace || !store.draftRequest || !requestId) return;
    const record = findRecord(store.workspace, requestId);
    if (!record) return;
    const check = {
      ...createEmptyCheck(input.type),
      label: input.label,
      path: input.path || createEmptyCheck(input.type).path,
      expected: input.expected || createEmptyCheck(input.type).expected
    };

    let targetCaseId = caseId;
    let nextCases = record.cases;
    if (!targetCaseId) {
      const nextCase = createEmptyCase(record.request.id, `Response Check ${record.cases.length + 1}`);
      nextCase.environment = store.activeEnvironmentName;
      nextCase.checks = [check];
      nextCases = [...record.cases, nextCase];
      targetCaseId = nextCase.id;
    } else {
      nextCases = record.cases.map(item =>
        item.id === targetCaseId
          ? {
              ...item,
              checks: [...(item.checks || []), check]
            }
          : item
      );
    }

    await saveRequestRecord(
      store.workspace.root,
      record.request,
      nextCases,
      record.resourceDirPath,
      record.requestFilePath,
      record.folderSegments
    );
    await reloadWorkspace({ kind: 'case', requestId: record.request.id, caseId: targetCaseId });
    notifications.show({ color: 'teal', message: 'Check created from current response' });
  }

  async function handleCreateCaseFromCurrentResponse() {
    if (!store.workspace) return;
    if (activeView === 'scratch') {
      notifications.show({ color: 'blue', message: 'Save the Scratch request to the workspace before creating a reusable case.' });
      return;
    }

    if (!store.response || !store.draftRequest || !requestId || !currentRequestPreview) return;
    const record = findRecord(store.workspace, requestId);
    if (!record) return;
    const nextCase = createEmptyCase(record.request.id, `${record.request.name} Replay ${record.cases.length + 1}`);
    nextCase.environment = store.activeEnvironmentName;
    nextCase.overrides = {
      method: currentRequestPreview.method,
      url: currentRequestPreview.url,
      path: currentRequestPreview.requestPath,
      headers: currentRequestPreview.headers,
      query: currentRequestPreview.query,
      body: currentRequestPreview.body,
      runtime: {
        timeoutMs: currentRequestPreview.timeoutMs,
        followRedirects: currentRequestPreview.followRedirects
      }
    };
    nextCase.checks = [
      {
        ...createEmptyCheck('status-equals'),
        label: 'Status equals current response',
        expected: String(store.response.status)
      }
    ];
    await saveRequestRecord(
      store.workspace.root,
      record.request,
      [...record.cases, nextCase],
      record.resourceDirPath,
      record.requestFilePath,
      record.folderSegments
    );
    await reloadWorkspace({ kind: 'case', requestId: record.request.id, caseId: nextCase.id });
    notifications.show({ color: 'teal', message: 'Case created from the current response' });
  }

  function handleSelectCollection(id: string | null) {
    setSelectedCollectionId(id);
    setSelectedCollectionReportId(null);
    setSelectedCollectionStepKey(null);
  }

  function handleSelectCollectionReport(id: string | null) {
    setSelectedCollectionReportId(id);
    const nextReport = collectionReports.find(report => report.id === id) || null;
    setSelectedCollectionStepKey(preferredCollectionReportStepKey(nextReport));
  }

  function handleCreateCollection() {
    addCollectionMutation.mutate({
      targetRequestId: requestId || undefined,
      targetCaseId: caseId || undefined
    });
  }

  function handleRefreshCaptureTargets() {
    refreshCaptureTargetsMutation.mutate();
  }

  function handleToggleCaptureEntry(entryId: string) {
    setSelectedCaptureIds(current => (current.includes(entryId) ? current.filter(id => id !== entryId) : [...current, entryId]));
    setSelectedCaptureEntryId(entryId);
  }

  function handleToggleAllVisibleCaptureEntries() {
    const visibleIds = visibleCaptureEntries.map(entry => entry.id);
    if (visibleIds.length === 0) return;
    setSelectedCaptureIds(current => {
      const allVisibleSelected = visibleIds.every(id => current.includes(id));
      if (allVisibleSelected) {
        return current.filter(id => !visibleIds.includes(id));
      }
      return Array.from(new Set([...current, ...visibleIds]));
    });
    setSelectedCaptureEntryId(current => current || visibleIds[0] || null);
  }

  async function handleAddCurrentSelectionToCollection() {
    if (!store.workspace || !requestId) {
      notifications.show({ color: 'blue', message: 'Select a saved Request or Case first.' });
      return;
    }

    const record = findRecord(store.workspace, requestId);
    if (!record) return;
    const stepName = caseId
      ? `${record.request.name} · ${(record.cases.find(item => item.id === caseId)?.name || 'Case')}`
      : record.request.name;

    if (!selectedCollectionId || !draftCollection) {
      addCollectionMutation.mutate({
        targetRequestId: requestId,
        targetCaseId: caseId || undefined
      });
      return;
    }

    const nextStepIndex = draftCollection.steps.length + 1;
    const nextCollection = {
      ...draftCollection,
      steps: [
        ...draftCollection.steps,
        createCollectionStep({
          key: `step_${nextStepIndex}`,
          requestId,
          caseId: caseId || undefined,
          name: stepName
        })
      ]
    };
    const currentRecord = store.workspace.collections.find(item => item.document.id === draftCollection.id);
    await saveCollectionRecord(
      store.workspace.root,
      nextCollection,
      collectionDataText,
      currentRecord?.filePath,
      currentRecord?.dataFilePath
    );
    setDraftCollection(nextCollection);
    setCollectionPanelTabHint('design');
    setActiveView('collections');
    await reloadWorkspace();
    notifications.show({ color: 'teal', message: `Added ${stepName} to ${draftCollection.name}` });
  }

  async function handleDeleteCollection() {
    if (!store.workspace || !selectedCollectionRecord) return;
    const confirmed = await confirmAction({
      title: '删除 Collection',
      message: `将删除 Collection「${selectedCollectionRecord.document.name}」。`,
      detail: `该 Collection 当前包含 ${selectedCollectionRecord.document.steps.length} 个步骤，此操作不会删除底层请求与 Case。`,
      confirmLabel: '确认删除'
    });
    if (!confirmed) return;
    await deleteCollectionInWorkspace(selectedCollectionRecord);
    notifications.show({ color: 'teal', message: 'Collection deleted' });
    reloadWorkspace();
  }

  async function handleSaveCollection() {
    if (!store.workspace || !draftCollection) return;
    const currentRecord = store.workspace.collections.find(item => item.document.id === draftCollection.id);
    await saveCollectionRecord(
      store.workspace.root,
      draftCollection,
      collectionDataText,
      currentRecord?.filePath,
      currentRecord?.dataFilePath
    );
    notifications.show({ color: 'teal', message: 'Collection saved' });
    reloadWorkspace();
  }

  function handleRunCollection(options?: { tags?: string[]; environmentName?: string; stepKeys?: string[]; failFast?: boolean }) {
    runCollectionMutation.mutate({
      tags: options?.tags,
      environmentName: options?.environmentName,
      stepKeys: options?.stepKeys,
      failFast: options?.failFast
    });
  }

  function handleRunLatestCollection() {
    const report = collectionReports[0];
    if (!report) {
      notifications.show({ color: 'blue', message: 'No previous collection run is available yet.' });
      return;
    }
    setSelectedCollectionId(report.collectionId);
    setSelectedCollectionReportId(report.id);
    setSelectedCollectionStepKey(preferredCollectionReportStepKey(report));
    setCollectionPanelTabHint('reports');
    setActiveView('collections');
    runCollectionMutation.mutate({ collectionId: report.collectionId });
  }

  function handleRerunFailedCollectionSteps() {
    const selectedReport = collectionReports.find(report => report.id === selectedCollectionReportId) || collectionReports[0];
    if (!selectedReport) return;
    const stepKeys = rerunFailedStepKeys(selectedReport);
    if (stepKeys.length === 0) {
      notifications.show({ color: 'blue', message: 'No failed steps to rerun' });
      return;
    }
    runCollectionMutation.mutate({
      stepKeys,
      seedReport: collectionReportSeed(selectedReport),
      tags: filtersFromReport(selectedReport).tags
    });
  }

  async function handleClearCollectionReports() {
    if (!store.workspace) return;
    await clearCollectionRunReports(store.workspace.root);
    setCollectionReports([]);
    setSelectedCollectionReportId(null);
    setSelectedCollectionStepKey(null);
    notifications.show({ color: 'teal', message: 'Collection reports cleared' });
  }

  function handleSelectProject() {
    setActiveView('workspace');
    setActiveWorkbenchPane('overview');
    store.selectNode({ kind: 'project' });
  }

  function handleSelectCategory(path: string) {
    setActiveView('workspace');
    setActiveWorkbenchPane('overview');
    store.selectNode({ kind: 'category', path });
  }

  function handleSelectRequest(requestIdToSelect: string) {
    setActiveView('workspace');
    setActiveWorkbenchPane('overview');
    store.selectNode({ kind: 'request', requestId: requestIdToSelect });
  }

  function handleSelectCase(requestIdOfCase: string, caseIdToSelect: string) {
    setActiveView('workspace');
    setActiveWorkbenchPane('overview');
    store.selectNode({ kind: 'case', requestId: requestIdOfCase, caseId: caseIdToSelect });
  }

  function handleCreateInterface(targetCategoryPath?: string | null) {
    addRequestMutation.mutate(targetCategoryPath ?? categoryPath ?? null);
  }

  async function handleAddCase(targetRequestId?: string | ReactMouseEvent) {
    // If called directly from onClick, the first arg is an event object. Ignore it.
    const actualId = typeof targetRequestId === 'string' ? targetRequestId : requestId;
    
    if (!actualId) {
      notifications.show({ color: 'red', message: 'Please select a request first' });
      return;
    }
    addCaseMutation.mutate(actualId);
  }

  async function handleMoveRequest(targetRequestId: string, targetCategoryPath: string | null) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === targetRequestId);
    if (!record) return;
    const nextFolderSegments = targetCategoryPath ? targetCategoryPath.split('/').filter(Boolean) : [];
    
    // Check if moving to the same folder
    if (record.folderSegments.join('/') === nextFolderSegments.join('/')) return;

    await saveRequestRecord(
      store.workspace.root,
      record.request,
      record.cases,
      record.resourceDirPath,
      record.requestFilePath,
      nextFolderSegments
    );
    reloadWorkspace(store.selectedNode);
    notifications.show({ color: 'teal', message: `Moved ${record.request.name} to ${targetCategoryPath || 'Root'}` });
  }

  async function handleMoveCategory(sourcePath: string, targetParentPath: string | null) {
    if (!store.workspace) return;
    const segments = sourcePath.split('/').filter(Boolean);
    const categoryName = segments.at(-1);
    const nextPath = targetParentPath ? `${targetParentPath}/${categoryName}` : (categoryName || '');
    
    if (sourcePath === nextPath) return;

    handleRenameCategory(sourcePath, nextPath);
  }

  async function handleRenameCategory(path: string, nextPath: string) {
    if (!store.workspace) return;
    if (!nextPath || nextPath === path) return;
    if (isSameOrChildPath(nextPath, path)) {
      notifications.show({ color: 'red', message: 'Cannot rename category into its own sub-category' });
      return;
    }

    const hasConflict = store.workspace.requests.some(record => {
      const value = record.folderSegments.join('/');
      return isSameOrChildPath(value, nextPath);
    });
    if (hasConflict) {
      notifications.show({ color: 'red', message: 'Target category path already exists' });
      return;
    }

    renameCategoryMutation.mutate({ oldPath: path, nextPath });
    notifications.show({ color: 'teal', message: 'Category renamed' });
  }

  async function handleDeleteCategory(path: string) {
    if (!store.workspace) return;
    const total = store.workspace.requests.filter(record => isSameOrChildPath(record.folderSegments.join('/'), path)).length;
    const caseTotal = store.workspace.requests
      .filter(record => isSameOrChildPath(record.folderSegments.join('/'), path))
      .reduce((sum, record) => sum + record.cases.length, 0);
    const confirmed = await confirmAction({
      title: '删除目录',
      message: `将删除目录「${path}」。`,
      detail: `影响范围：${total} 个请求，${caseTotal} 个 Case。此操作不可撤销。`,
      confirmLabel: '确认删除'
    });
    if (!confirmed) return;
    deleteCategoryMutation.mutate(path);
    notifications.show({ color: 'teal', message: 'Category deleted' });
  }

  async function handleRenameRequest(targetRequestId: string, nextName: string) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === targetRequestId);
    if (!record) return;
    if (!nextName || nextName === record.request.name) return;
    if (requestSlugExists(store.workspace, nextName, record.request.id, record.folderSegments.join('/'))) {
      notifications.show({ color: 'red', message: 'Another request with the same name already exists in this folder' });
      return;
    }
    renameRequestMutation.mutate({ requestId: targetRequestId, nextName });
    notifications.show({ color: 'teal', message: 'Request renamed' });
  }

  async function handleDuplicateRequest(targetRequestId: string) {
    duplicateRequestMutation.mutate(targetRequestId);
    notifications.show({ color: 'teal', message: 'Request duplicated' });
  }

  async function handleDeleteRequest(targetRequestId: string) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === targetRequestId);
    if (!record) return;
    const confirmed = await confirmAction({
      title: '删除请求',
      message: `将删除请求「${record.request.name}」。`,
      detail: `会同时删除该请求下的 ${record.cases.length} 个 Case。此操作不可撤销。`,
      confirmLabel: '确认删除'
    });
    if (!confirmed) return;
    deleteRequestMutation.mutate(targetRequestId);
    notifications.show({ color: 'teal', message: 'Request deleted' });
  }

  async function handleRenameCase(targetRequestId: string, targetCaseId: string, nextName: string) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === targetRequestId);
    const caseItem = record?.cases.find(item => item.id === targetCaseId);
    if (!record || !caseItem) return;
    if (!nextName || nextName === caseItem.name) return;
    if (caseSlugExists(record, nextName, caseItem.id)) {
      notifications.show({ color: 'red', message: 'Another case with the same name already exists for this request' });
      return;
    }
    renameCaseMutation.mutate({ requestId: targetRequestId, caseId: targetCaseId, nextName });
    notifications.show({ color: 'teal', message: 'Case renamed' });
  }

  async function handleDuplicateCase(targetRequestId: string, targetCaseId: string) {
    duplicateCaseMutation.mutate({ requestId: targetRequestId, caseId: targetCaseId });
    notifications.show({ color: 'teal', message: 'Case duplicated' });
  }

  async function handleDeleteCase(targetRequestId: string, targetCaseId: string) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === targetRequestId);
    const caseItem = record?.cases.find(item => item.id === targetCaseId);
    if (!record || !caseItem) return;
    const confirmed = await confirmAction({
      title: '删除 Case',
      message: `将删除 Case「${caseItem.name}」。`,
      detail: '该操作只影响当前请求下的这个可复跑方案，不会删除原始请求。',
      confirmLabel: '确认删除'
    });
    if (!confirmed) return;
    deleteCaseMutation.mutate({ requestId: targetRequestId, caseId: targetCaseId });
    notifications.show({ color: 'teal', message: 'Case deleted' });
  }

  function handleDeleteProject() {
    if (!store.workspace || !store.draftProject) return;
    const projectTitle = store.draftProject.name;
    let typedProjectName = '';

    modals.openConfirmModal({
      title: 'Delete Entire Project',
      centered: true,
      labels: { confirm: 'Proceed with Deletion', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      children: (
        <div style={{ display: 'grid', gap: 12 }}>
          <Text size="sm">
            This is a high-risk operation. It will delete the entire debugger workspace directory and all its categories, requests, and cases. This cannot be undone.
          </Text>
          <Text size="sm" c="dimmed">
            Please type the project name <strong>{projectTitle}</strong> to confirm deletion.
          </Text>
          <TextInput
            placeholder={projectTitle}
            onChange={event => {
              typedProjectName = event.currentTarget.value.trim();
            }}
          />
        </div>
      ),
      onConfirm: async () => {
        if (!typedProjectName) {
          notifications.show({ color: 'red', message: 'Project name is required' });
          return;
        }
        if (typedProjectName !== projectTitle) {
          notifications.show({ color: 'red', message: 'Project name does not match, deletion cancelled' });
          return;
        }
        deleteProjectMutation.mutate();
        notifications.show({ color: 'teal', message: `Project ${projectTitle} deleted` });
      }
    });
  }

  async function handleReplayHistory(entry: RunHistoryEntry) {
    if (!store.workspace) return;
    const record = findRecord(store.workspace, entry.requestId);
    if (!record) {
      handleOpenHistoryInScratch(entry);
      return;
    }
    setActiveView('workspace');
    store.selectNode({ kind: 'request', requestId: entry.requestId });
    store.updateRequest(record.request);
    if (entry.caseId) {
      const matchedCase = record.cases.find(c => c.id === entry.caseId);
      if (matchedCase) {
        store.updateCaseList(record.cases);
        store.selectNode({ kind: 'case', requestId: entry.requestId, caseId: entry.caseId });
      }
    }
    store.setResponse(entry.response, entry.checkResults, entry.scriptLogs);
  }

  async function handleDuplicateHistoryAsCase(entry: RunHistoryEntry) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === entry.requestId);
    if (!record) {
      notifications.show({ color: 'red', message: 'Source request not found, cannot duplicate as case' });
      return;
    }

    const nextCase = createEmptyCase(record.request.id, `${entry.caseName || 'Replay'} ${historyEntries.length + 1}`);
    nextCase.environment = entry.environmentName;
    nextCase.origin = {
      type: 'history',
      runId: entry.id,
      collectionId: entry.sourceCollectionId,
      stepKey: entry.sourceStepKey
    };
    nextCase.overrides = {
      method: entry.request.method,
      url: entry.request.url,
      path: record.request.path,
      headers: entry.request.headers,
      query: entry.request.query,
      body: entry.request.body,
      runtime: {
        timeoutMs: entry.request.timeoutMs,
        followRedirects: entry.request.followRedirects
      }
    };

    const recordWithNewCase = { ...record, cases: [...record.cases, nextCase] };
    await saveRequestRecord(
      store.workspace.root,
      record.request,
      recordWithNewCase.cases,
      record.resourceDirPath,
      record.requestFilePath,
      record.folderSegments
    );
    await reloadWorkspace({ kind: 'case', requestId: record.request.id, caseId: nextCase.id });
    notifications.show({ color: 'teal', message: 'Case created from history' });
  }

  async function handlePinHistoryAsBaseline(entry: RunHistoryEntry) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === entry.requestId);
    if (!record) {
      notifications.show({ color: 'red', message: 'Source request not found, cannot save baseline example' });
      return;
    }
    const exampleName = await promptForText({
      title: '保存为 Baseline',
      label: 'Baseline 名称',
      defaultValue: `${entry.environmentName || 'baseline'}-baseline`,
      confirmLabel: '保存 Baseline',
      validate: value => (!value ? '请输入 Baseline 名称。' : null)
    });
    if (!exampleName) return;
    const nextExamples = upsertRequestExample(record.request.examples || [], {
      name: exampleName,
      role: 'baseline',
      status: entry.response.status,
      mimeType: responseMimeType(entry.response.headers),
      text: entry.response.bodyText
    });
    await saveRequestRecord(
      store.workspace.root,
      {
        ...record.request,
        examples: nextExamples
      },
      record.cases,
      record.resourceDirPath,
      record.requestFilePath,
      record.folderSegments
    );
    await reloadWorkspace({ kind: 'request', requestId: record.request.id });
    notifications.show({ color: 'teal', message: `Saved "${exampleName}" as baseline example` });
  }

  async function handleSaveHistoryAsExample(entry: RunHistoryEntry) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === entry.requestId);
    if (!record) {
      notifications.show({ color: 'red', message: 'Source request not found, cannot save example' });
      return;
    }
    const exampleName = await promptForText({
      title: '保存为 Example',
      label: 'Example 名称',
      defaultValue: `${entry.environmentName || 'history'}-${record.request.examples.length + 1}`,
      confirmLabel: '保存 Example',
      validate: value => (!value ? '请输入 Example 名称。' : null)
    });
    if (!exampleName) return;
    const nextExamples = upsertRequestExample(record.request.examples || [], {
      name: exampleName,
      role: 'example',
      status: entry.response.status,
      mimeType: responseMimeType(entry.response.headers),
      text: entry.response.bodyText
    });
    await saveRequestRecord(
      store.workspace.root,
      {
        ...record.request,
        examples: nextExamples
      },
      record.cases,
      record.resourceDirPath,
      record.requestFilePath,
      record.folderSegments
    );
    await reloadWorkspace({ kind: 'request', requestId: record.request.id });
    notifications.show({ color: 'teal', message: `Saved "${exampleName}" as a reusable example` });
  }

  async function handleGenerateHistoryDiffChecks(selectedEntry: RunHistoryEntry, compareEntry: RunHistoryEntry | null) {
    if (!store.workspace) return;
    const record = store.workspace.requests.find(item => item.request.id === selectedEntry.requestId);
    if (!record) {
      notifications.show({ color: 'red', message: 'Source request not found, cannot generate checks' });
      return;
    }
    const selectedJson = safeJson(selectedEntry.response.bodyText);
    const compareJson = compareEntry ? safeJson(compareEntry.response.bodyText) : null;
    const selectedLeaves = flattenJsonLeaves(selectedJson);
    const compareMap = new Map(flattenJsonLeaves(compareJson).map(item => [item.path, item.value]));
    const changedLeaves = selectedLeaves.filter(item => compareMap.get(item.path) !== item.value).slice(0, 12);
    const nextChecks = [];
    nextChecks.push({
      ...createEmptyCheck('status-equals'),
      label: `Status equals ${selectedEntry.response.status}`,
      expected: String(selectedEntry.response.status)
    });
    changedLeaves.forEach(item => {
      nextChecks.push({
        ...createEmptyCheck('json-equals'),
        label: `History diff guard: ${item.path}`,
        path: item.path,
        expected: item.value
      });
    });
    const nextCase = createEmptyCase(record.request.id, `History Diff Guard ${record.cases.length + 1}`);
    nextCase.environment = selectedEntry.environmentName;
    nextCase.origin = {
      type: 'history',
      runId: selectedEntry.id,
      collectionId: selectedEntry.sourceCollectionId,
      stepKey: selectedEntry.sourceStepKey
    };
    nextCase.checks = nextChecks;
    const baselineCandidate = record.request.examples.find(example => example.role === 'baseline');
    if (baselineCandidate) {
      nextCase.baselineRef = baselineCandidate.name;
      nextCase.checks.push({
        ...createEmptyCheck('snapshot-match'),
        label: `Snapshot matches ${baselineCandidate.name}`,
        expected: baselineCandidate.name
      });
    }
    await saveRequestRecord(
      store.workspace.root,
      record.request,
      [...record.cases, nextCase],
      record.resourceDirPath,
      record.requestFilePath,
      record.folderSegments
    );
    await reloadWorkspace({ kind: 'case', requestId: record.request.id, caseId: nextCase.id });
    notifications.show({
      color: 'teal',
      message: `Generated ${nextChecks.length} checks from history${compareEntry ? ' diff' : ''}`
    });
  }

  function handleOpenHistoryCollection(entry: RunHistoryEntry) {
    if (!entry.sourceCollectionId) {
      notifications.show({ color: 'blue', message: 'This run did not originate from a collection.' });
      return;
    }
    const latestReport = collectionReports.find(report => report.collectionId === entry.sourceCollectionId) || null;
    setSelectedCollectionId(entry.sourceCollectionId);
    setSelectedCollectionReportId(latestReport?.id || null);
    setSelectedCollectionStepKey(preferredCollectionReportStepKey(latestReport, entry.sourceStepKey));
    setCollectionPanelTabHint(latestReport ? 'reports' : 'design');
    setActiveView('collections');
  }

  async function handleClearHistory() {
    if (!store.workspace) return;
    await clearRunHistory(store.workspace.root);
    setHistoryEntries([]);
    setSelectedHistoryId(null);
    notifications.show({ color: 'teal', message: 'Run history cleared' });
  }

  async function handleSaveResponseAsExample(replaceExisting = false, forcedName?: string) {
    if (activeView === 'scratch') {
      if (!currentScratch || !currentScratch.response) return;
      const nextName =
        replaceExisting && currentScratch.selectedExampleName
          ? currentScratch.selectedExampleName
          : forcedName || await promptForText({
              title: '保存为 Example',
              label: 'Example 名称',
              defaultValue: 'Scratch Response',
              confirmLabel: '保存 Example',
              validate: value => (!value ? '请输入 Example 名称。' : null)
            });
      if (!nextName) return;
      const previous = (currentScratch.request.examples || []).find(ex => ex.name === nextName);
      const nextExamples = upsertRequestExample(currentScratch.request.examples || [], {
        name: nextName,
        role: previous?.role === 'baseline' ? 'baseline' : 'example',
        status: currentScratch.response.status,
        mimeType: responseMimeType(currentScratch.response.headers),
        text: currentScratch.response.bodyText
      });
      handleSetScratchResponseState(session => ({
        ...session,
        request: { ...session.request, examples: nextExamples },
        selectedExampleName: nextName,
        updatedAt: new Date().toISOString()
      }));
      notifications.show({ color: 'teal', message: 'Example saved to Scratch tab' });
      return;
    }

    if (!store.draftRequest || !store.response) return;
    const nextName =
      replaceExisting && selectedExampleName
        ? selectedExampleName
        : forcedName || await promptForText({
            title: '保存为 Example',
            label: 'Example 名称',
            defaultValue: 'Success Response',
            confirmLabel: '保存 Example',
            validate: value => (!value ? '请输入 Example 名称。' : null)
          });
    if (!nextName) return;
    const previous = (store.draftRequest.examples || []).find(ex => ex.name === nextName);
    const nextExamples = upsertRequestExample(store.draftRequest.examples || [], {
      name: nextName,
      role: previous?.role === 'baseline' ? 'baseline' : 'example',
      status: store.response.status,
      mimeType: responseMimeType(store.response.headers),
      text: store.response.bodyText
    });
    store.updateRequest({ ...store.draftRequest, examples: nextExamples });
    setSelectedExampleName(nextName);
    saveMutation.mutate();
  }

  async function handlePinCurrentResponseAsBaseline(forcedName?: string) {
    if (activeView === 'scratch') {
      if (!currentScratch?.response) return;
      const nextName = forcedName || await promptForText({
        title: '保存为 Baseline',
        label: 'Baseline 名称',
        defaultValue: currentScratch.selectedExampleName || 'scratch-baseline',
        confirmLabel: '保存 Baseline',
        validate: value => (!value ? '请输入 Baseline 名称。' : null)
      });
      if (!nextName) return;
      const nextExamples = upsertRequestExample(currentScratch.request.examples || [], {
        name: nextName,
        role: 'baseline',
        status: currentScratch.response.status,
        mimeType: responseMimeType(currentScratch.response.headers),
        text: currentScratch.response.bodyText
      });
      handleSetScratchResponseState(session => ({
        ...session,
        request: { ...session.request, examples: nextExamples },
        selectedExampleName: nextName,
        updatedAt: new Date().toISOString()
      }));
      notifications.show({ color: 'teal', message: 'Baseline saved to Scratch tab' });
      return;
    }

    if (!store.draftRequest || !store.response) return;
    const nextName = forcedName || await promptForText({
      title: '保存为 Baseline',
      label: 'Baseline 名称',
      defaultValue: selectedExampleName || `${store.activeEnvironmentName}-baseline`,
      confirmLabel: '保存 Baseline',
      validate: value => (!value ? '请输入 Baseline 名称。' : null)
    });
    if (!nextName) return;
    const nextExamples = upsertRequestExample(store.draftRequest.examples || [], {
      name: nextName,
      role: 'baseline',
      status: store.response.status,
      mimeType: responseMimeType(store.response.headers),
      text: store.response.bodyText
    });
    store.updateRequest({ ...store.draftRequest, examples: nextExamples });
    setSelectedExampleName(nextName);
    saveMutation.mutate();
  }

  async function handleSaveAsCurrentResponse() {
    const selection = await promptForSaveAs({
      title: '保存当前结果',
      description: '统一入口：把当前响应保存为 Example、Baseline、Case 或校验。',
      defaultName:
        activeView === 'scratch'
          ? currentScratch?.selectedExampleName || 'scratch-baseline'
          : selectedExampleName || `${store.activeEnvironmentName}-baseline`
    });
    if (!selection) return;

    if (selection.target === 'example') {
      await handleSaveResponseAsExample(false, selection.name);
      return;
    }
    if (selection.target === 'baseline') {
      await handlePinCurrentResponseAsBaseline(selection.name);
      return;
    }
    if (selection.target === 'case') {
      await handleCreateCaseFromCurrentResponse();
      return;
    }
    if (activeView === 'scratch') {
      notifications.show({ color: 'blue', message: '请先把 Scratch 请求保存到工作区，再生成可复用校验。' });
      return;
    }
    if (store.response) {
      await handleCreateCheckFromResponse({
        type: 'status-equals',
        label: `Status equals ${store.response.status}`,
        expected: String(store.response.status)
      });
    }
  }

  function handleClearPreferenceCaches() {
    Object.keys(window.localStorage)
      .filter(key =>
        key === RECENT_STORAGE_KEY ||
        key === PREFERENCES_STORAGE_KEY ||
        key.startsWith(UI_STORAGE_KEY_PREFIX) ||
        key.startsWith(IMPORT_SESSION_STORAGE_KEY_PREFIX) ||
        key.startsWith(LAST_SYNC_STORAGE_KEY_PREFIX) ||
        key.startsWith(PROMPT_VALUES_STORAGE_KEY_PREFIX)
      )
      .forEach(key => window.localStorage.removeItem(key));
    store.setRecentRoots([]);
    setRuntimeVariables({});
    setPromptVariables({});
    setRuntimeEnvironments({});
    setHostSessionSnapshots([]);
    setSessionSnapshot(null);
    setUiState(defaultWorkspaceUiState());
    setPreferences(defaultPreferences());
    notifications.show({ color: 'blue', message: 'Local debugger caches cleared' });
  }

  if (!store.workspace) {
    return (
      <WelcomePanel
        recentRoots={store.recentRoots}
        projectName={projectName}
        onProjectNameChange={setProjectName}
        onOpenDirectory={handleOpenDirectory}
        onCloneRepository={handleCloneRepository}
        onCreateWorkspace={handleCreateWorkspace}
        onSelectRecent={openExistingWorkspace}
      />
    );
  }

  return (
    <>
      <div className="app-shell-native">
        <div className="workspace-frame">
          <div className="workspace-contextbar">
            <div className="workspace-context-copy">
              <span className="workspace-context-label">本地调试工作区</span>
              <strong className="workspace-context-title">{store.workspace.project.name}</strong>
              <span className="workspace-context-path">{store.workspace.root}</span>
            </div>

            <div className="workspace-context-actions">
              {activeView === 'workspace' && importTaskCount > 0 ? (
                <Badge variant="light" color={activeWorkbenchPane === 'import-tasks' ? 'orange' : 'gray'} size="sm" style={{ cursor: 'pointer' }} onClick={openImportTasks}>
                  Import Tasks · {importTaskCount}
                </Badge>
              ) : null}
              <Select
                size="xs"
                className="compact-select"
                value={store.activeEnvironmentName}
                data={store.workspace.environments.map(item => ({
                  value: item.document.name,
                  label: item.document.name
                }))}
                onChange={value => value && store.setActiveEnvironment(value)}
                style={{ width: 120 }}
              />
              <Badge variant="dot" color={runMutation.isPending || scratchRunMutation.isPending ? 'blue' : 'gray'} size="sm">
                {runMutation.isPending || scratchRunMutation.isPending ? '运行中' : '空闲'}
              </Badge>
              {gitInfo?.isRepo ? (
                <Badge variant="light" color={gitInfo.dirty ? 'orange' : 'teal'} size="sm">
                  {gitInfo.branch || 'git'}{gitInfo.dirty ? ` · ${gitInfo.changedFiles.length} 未提交` : ' · 干净'}
                </Badge>
              ) : null}
              <ActionIcon variant="subtle" color="gray" onClick={() => openMutation.mutate(store.workspace!.root)}>
                <IconRefresh size={16} />
              </ActionIcon>
            </div>
          </div>

          <main
            ref={gridRef}
            className="workspace-grid"
            style={
              {
                '--tree-width': uiState.isTreeCollapsed ? '44px' : `${uiState.treeWidth}px`,
                '--tree-resizer-width': uiState.isTreeCollapsed ? '0px' : '1px'
              } as CSSProperties
            }
          >
            <AppRail
              workspaceName={store.workspace.project.name}
              isDirty={store.isDirty}
              activeView={activeView}
              importTaskCount={importTaskCount}
              onChangeView={view => {
                if (view === 'collections') {
                  setCollectionPanelTabHint(null);
                }
                setActiveView(view);
                if (view === 'workspace') {
                  openWorkbenchOverview();
                }
              }}
            />

            <InterfaceTreePanel
              workspace={store.workspace}
              selectedNode={store.selectedNode}
              gitStatus={gitInfo}
              isCollapsed={uiState.isTreeCollapsed}
              searchText={store.searchText}
              categoryDraft={categoryDraft}
              creatingCategory={creatingCategory}
              expandedRequestIds={uiState.expandedRequestIds}
              onSearchChange={value => store.setSearchText(value)}
              onSelectProject={handleSelectProject}
              onSelectCategory={handleSelectCategory}
              onSelectRequest={handleSelectRequest}
              onSelectCase={handleSelectCase}
              onOpenImport={() => setImportOpened(true)}
              onToggleCollapse={() =>
                updateUiState(current => ({
                  ...current,
                  isTreeCollapsed: !current.isTreeCollapsed
                }))
              }
              onCreateInterface={handleCreateInterface}
              onAddCase={handleAddCase}
              onRenameCategory={handleRenameCategory}
              onDeleteCategory={handleDeleteCategory}
              onRenameRequest={handleRenameRequest}
              onDuplicateRequest={handleDuplicateRequest}
              onDeleteRequest={handleDeleteRequest}
              onRenameCase={handleRenameCase}
              onDuplicateCase={handleDuplicateCase}
              onDeleteCase={handleDeleteCase}
              onToggleCategoryDraft={() => setCreatingCategory(current => !current)}
              onCategoryDraftChange={setCategoryDraft}
              onConfirmCreateCategory={handleConfirmCreateCategory}
              onToggleRequest={requestIdToToggle =>
                updateUiState(current => ({
                  ...current,
                  expandedRequestIds: current.expandedRequestIds.includes(requestIdToToggle)
                    ? current.expandedRequestIds.filter(item => item !== requestIdToToggle)
                    : [...current.expandedRequestIds, requestIdToToggle]
                }))
              }
              onMoveRequest={handleMoveRequest}
              onMoveCategory={handleMoveCategory}
            />

            <Resizer
              containerRef={gridRef}
              className={uiState.isTreeCollapsed ? 'is-hidden' : ''}
              onResize={nextWidth => updateUiState(current => ({ ...current, treeWidth: Math.round(nextWidth) }))}
              min={260}
              max={420}
            />

            {activeView === 'workspace' && store.selectedNode.kind === 'project' ? (
              activeWorkbenchPane === 'import-tasks' ? (
                <ImportRepairPanel
                  activeEnvironmentName={store.activeEnvironmentName}
                  environment={selectedEnvironment}
                  checklist={importRepairChecklist}
                  importedRequestCount={importedRecords.length}
                  importedCaseCount={importedRecords.reduce((total, record) => total + record.cases.length, 0)}
                  importedAtLabel={lastImportSession?.importedAt ? new Date(lastImportSession.importedAt).toLocaleString() : null}
                  importFormat={lastImportSession?.format || null}
                  previewSummary={lastImportSession?.previewSummary || null}
                  onOpenImport={() => setImportOpened(true)}
                  onOpenEnvironmentCenter={() => setActiveView('environments')}
                  onOpenFirstBlocked={() => handleOpenImportedRequest(importRepairChecklist?.firstBlockedRequestId || null)}
                  onOpenFirstRunnable={() => handleOpenImportedRequest(importRepairChecklist?.firstRunnableRequestId || null)}
                  onOpenTaskRequest={requestId => handleOpenImportedRequest(requestId)}
                  onSeedMissingVariables={handleSeedImportVariables}
                  onApplyImportedBaseUrl={
                    lastImportSession?.importedBaseUrl &&
                    lastImportSession.importedBaseUrl !== 'https://api.example.com'
                      ? handleApplyImportedBaseUrl
                      : undefined
                  }
                />
              ) : (
                <WorkspaceHomePanel
                  workspace={store.workspace}
                  gitStatus={gitInfo}
                  gitRisks={gitRisks}
                  importSession={homeImportSummary}
                  repairSummary={
                    importRepairChecklist
                      ? {
                          blockingCount: importRepairChecklist.blockingCount,
                          warningCount: importRepairChecklist.warningCount,
                          runnableCount: importRepairChecklist.runnableRequestIds.length
                        }
                      : null
                  }
                  recentSuccess={homeRecentSuccess}
                  lastCollectionRun={homeLastCollectionRun}
                  suggestedCommitMessage={suggestedCommitMessage(gitInfo)}
                  onOpenImport={() => setImportOpened(true)}
                  onOpenRepair={openImportTasks}
                  onOpenEnvironmentCenter={() => setActiveView('environments')}
                  onOpenFirstBlocked={() => handleOpenImportedRequest(importRepairChecklist?.firstBlockedRequestId || null)}
                  onOpenFirstRunnable={() => handleOpenImportedRequest(importRepairChecklist?.firstRunnableRequestId || null)}
                  onOpenLastSuccessfulRequest={handleOpenLastSuccessfulRequest}
                  onRunLastCollection={handleRunLatestCollection}
                  onOpenCollections={() => setActiveView('collections')}
                  onOpenHistory={() => setActiveView('history')}
                  onRefreshGit={handleRefreshGitStatus}
                  onCopySuggestedCommitMessage={() =>
                    copyToClipboard(suggestedCommitMessage(gitInfo), 'Suggested commit message copied')
                  }
                />
              )
            ) : activeView === 'scratch' && currentScratch ? (
              <ScratchPadPanel
                workspace={store.workspace}
                scratchSessions={scratchSessions}
                selectedScratchId={selectedScratchId}
                request={currentScratch.request}
                response={currentScratch.response}
                requestError={currentScratch.requestError}
                requestInsight={currentScratchInsight}
                requestPreview={currentScratchPreview}
                checkResults={currentScratch.checkResults}
                scriptLogs={currentScratch.scriptLogs}
                sessionSnapshot={sessionSnapshot}
                selectedEnvironment={selectedRuntimeEnvironment}
                selectedExampleName={currentScratch.selectedExampleName}
                activeRequestTab={scratchRequestTab}
                activeResponseTab={scratchResponseTab}
                mainSplitRatio={scratchMainSplitRatio}
                isRunning={scratchRunMutation.isPending}
                isDirty
                onRequestChange={handleUpdateScratchRequest}
                onRun={() => scratchRunMutation.mutate()}
                onSaveToWorkspace={handleSaveScratchToWorkspace}
                onNewScratch={() => handleCreateScratch()}
                onSelectScratch={id => setSelectedScratchId(id)}
                onRequestTabChange={setScratchRequestTab}
                onResponseTabChange={setScratchResponseTab}
                onSelectExample={name =>
                  handleSetScratchResponseState(session => ({
                    ...session,
                    selectedExampleName: name
                  }))
                }
                onReplaceExample={() => handleSaveResponseAsExample(true)}
                onSaveAs={handleSaveAsCurrentResponse}
                onCopyBody={() => copyToClipboard(currentScratch.response?.bodyText || '', 'Body copied')}
                onCopyCurl={() => copyToClipboard(currentScratchPreview ? curlForPreview(currentScratchPreview) : '', 'cURL copied')}
                onCopyBruno={() => copyToClipboard(brunoForRequest(currentScratch.request), 'Bruno request copied')}
                onRefreshSession={handleRefreshSession}
                onClearSession={handleClearSessionCookies}
                onCreateCaseFromResponse={handleCreateCaseFromCurrentResponse}
                onCreateCheck={() =>
                  notifications.show({ color: 'blue', message: 'Save the Scratch request to the workspace before creating reusable checks.' })
                }
                onSaveAuthProfile={handleSaveAuthProfile}
                onExtractValue={handleExtractResponseValue}
                onMainSplitRatioChange={setScratchMainSplitRatio}
              />
            ) : activeView === 'capture' ? (
              <CapturePanel
                workspace={store.workspace}
                browser={captureBrowser}
                runtime={captureRuntime}
                mode={captureMode}
                targets={captureTargets}
                selectedTargetId={selectedCaptureTargetId}
                filterText={captureFilterText}
                entries={captureEntries}
                visibleEntries={visibleCaptureEntries}
                selectedEntryId={selectedCaptureEntryId}
                selectedEntryIds={selectedCaptureIds}
                selectedEntry={selectedCaptureEntry}
                selectedVisibleCount={selectedVisibleCaptureCount}
                exportStrategy={captureExportStrategy}
                collectionTargetMode={captureCollectionTargetMode}
                selectedCollectionId={captureCollectionId}
                newCollectionName={captureNewCollectionName}
                isAllVisibleSelected={isAllVisibleCaptureSelected}
                isLaunching={launchCaptureBrowserMutation.isPending}
                isRefreshingTargets={refreshCaptureTargetsMutation.isPending}
                isStarting={startCaptureMutation.isPending}
                isStopping={stopCaptureMutation.isPending}
                isExporting={exportCaptureMutation.isPending}
                onLaunch={() => launchCaptureBrowserMutation.mutate()}
                onRefreshTargets={handleRefreshCaptureTargets}
                onModeChange={mode => {
                  setCaptureMode(mode);
                  if (mode === 'target' && !selectedCaptureTargetId) {
                    setSelectedCaptureTargetId(captureTargets[0]?.targetId || null);
                  }
                }}
                onSelectTarget={setSelectedCaptureTargetId}
                onFilterTextChange={setCaptureFilterText}
                onStart={() => startCaptureMutation.mutate()}
                onStop={() => stopCaptureMutation.mutate()}
                onClear={() => clearCaptureMutation.mutate()}
                onSelectEntry={setSelectedCaptureEntryId}
                onToggleEntry={handleToggleCaptureEntry}
                onToggleAllVisible={handleToggleAllVisibleCaptureEntries}
                onExportStrategyChange={setCaptureExportStrategy}
                onCollectionTargetModeChange={mode => setCaptureCollectionTargetMode(mode)}
                onSelectCollection={setCaptureCollectionId}
                onNewCollectionNameChange={setCaptureNewCollectionName}
                onSaveRequests={() => exportCaptureMutation.mutate('requests')}
                onAddToCollection={() => exportCaptureMutation.mutate('collection')}
              />
            ) : activeView === 'history' ? (
              <section className="workspace-main" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {renderTabHeader()}
                <HistoryPanel
                  entries={historyEntries}
                  selectedEntryId={selectedHistoryId}
                  onSelectEntry={setSelectedHistoryId}
                  onReplay={handleReplayHistory}
                  onOpenInScratch={handleOpenHistoryInScratch}
                  onOpenCollectionSource={handleOpenHistoryCollection}
                  onDuplicateAsCase={handleDuplicateHistoryAsCase}
                  onSaveAsExample={handleSaveHistoryAsExample}
                  onPinAsBaseline={handlePinHistoryAsBaseline}
                  onGenerateDiffChecks={handleGenerateHistoryDiffChecks}
                  onClear={handleClearHistory}
                />
              </section>
            ) : activeView === 'preferences' ? (
              <PreferencesCenterPanel
                preferences={preferences}
                onChange={setPreferences}
                onClearCaches={handleClearPreferenceCaches}
              />
            ) : activeView === 'sync' ? (
              <section className="workspace-main" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {renderTabHeader()}
                <SyncCenterPanel
                  workspace={store.workspace}
                  gitStatus={gitInfo}
                  syncGuard={syncGuard}
                  gitRisks={gitRisks}
                  suggestedCommitMessage={suggestedCommitMessage(gitInfo)}
                  lastSyncAt={lastSyncAt}
                  onRefresh={handleRefreshGitStatus}
                  onPull={handleGitPull}
                  onPush={handleGitPush}
                  onOpenTerminal={() =>
                    store.workspace &&
                    openTerminal(store.workspace.root).catch(error => {
                      notifications.show({ color: 'red', message: `Failed to open terminal: ${(error as Error).message}` });
                    })
                  }
                  onCopySuggestedCommitMessage={() =>
                    copyToClipboard(suggestedCommitMessage(gitInfo), 'Suggested commit message copied')
                  }
                />
              </section>
            ) : activeView === 'collections' ? (
              <section className="workspace-main" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {renderTabHeader()}
                <CollectionRunnerPanel
                  workspace={store.workspace}
                  selectedCollectionId={selectedCollectionId}
                  draftCollection={draftCollection}
                  collectionDataText={collectionDataText}
                  preferredTab={collectionPanelTabHint}
                  reports={collectionReports}
                  selectedReportId={selectedCollectionReportId}
                  selectedReportStepKey={selectedCollectionStepKey}
                  currentSelection={currentSelectionSummary}
                  onSelectCollection={handleSelectCollection}
                  onCollectionChange={collection => setDraftCollection(collection)}
                  onCollectionDataChange={setCollectionDataText}
                  onCreateCollection={handleCreateCollection}
                  onAddCurrentSelection={handleAddCurrentSelectionToCollection}
                  onDeleteCollection={handleDeleteCollection}
                  onSaveCollection={handleSaveCollection}
                  onRunCollection={handleRunCollection}
                  onRerunFailed={handleRerunFailedCollectionSteps}
                  onClearReports={handleClearCollectionReports}
                  onSelectReport={handleSelectCollectionReport}
                  onSelectReportStep={setSelectedCollectionStepKey}
                  onOpenRequest={handleSelectRequest}
                  onOpenCase={handleSelectCase}
                  onExtractValue={handleExtractCollectionReportValue}
                  onExportReport={handleExportSelectedCollectionReport}
                  onExportConfiguredReports={handleExportConfiguredCollectionReports}
                  onExportBruno={handleExportSelectedCollectionBruno}
                  onExportOpenCollection={handleExportSelectedCollectionOpenCollection}
                  onCopyText={(value, successMessage) => {
                    void copyToClipboard(value, successMessage);
                  }}
                />
              </section>
            ) : activeView === 'environments' ? (
              <section className="workspace-main" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {renderTabHeader()}
                <EnvironmentCenterPanel
                  workspace={store.workspace}
                  draftProject={store.draftProject}
                  activeEnvironmentName={store.activeEnvironmentName}
                  selectedEnvironment={selectedEnvironment}
                  runtimeVariables={runtimeVariables}
                  promptVariables={promptVariables}
                  sessionSnapshot={sessionSnapshot}
                  hostSnapshots={hostSessionSnapshots}
                  targetUrl={sessionTargetUrl}
                  onEnvironmentChange={name => store.setActiveEnvironment(name)}
                  onProjectChange={project => store.updateProject(project)}
                  onEnvironmentUpdate={(name, updater) => store.updateEnvironment(name, updater)}
                  onAddEnvironment={handleAddEnvironment}
                  onRefreshSession={handleRefreshSession}
                  onClearSession={handleClearSessionCookies}
                  onClearRuntimeVars={() => setRuntimeVariables({})}
                  onPromptVariablesChange={values => updatePromptVariables(() => values)}
                  onClearPromptVars={() => updatePromptVariables(() => ({}))}
                  onSave={() => saveMutation.mutate()}
                />
              </section>
            ) : activeView === 'workspace' ? (
              <WorkspaceMainPanel
                workspace={store.workspace}
                selectedNode={store.selectedNode}
                openTabs={store.openTabs}
                onTabSelect={store.selectNode}
                onTabClose={store.closeTab}
                categoryRequests={categoryRequests}
                categoryVariableRows={categoryVariableRows}
                categoryVariablesDirty={categoryVariablesDirty}
                draftProject={store.draftProject}
                request={store.draftRequest}
                response={store.response}
                requestError={store.requestError}
                requestInsight={currentRequestInsight}
                requestPreview={currentRequestPreview}
                checkResults={store.checkResults}
                scriptLogs={store.scriptLogs}
                cases={store.draftCases}
                activeEnvironmentName={store.activeEnvironmentName}
                selectedEnvironment={selectedRuntimeEnvironment}
                isRunning={runMutation.isPending}
                isDirty={store.isDirty}
                activeRequestTab={uiState.activeRequestTab}
                activeResponseTab={uiState.activeResponseTab}
                selectedExampleName={selectedExampleName}
                sessionSnapshot={sessionSnapshot}
                mainSplitRatio={uiState.mainSplitRatio}
                gitStatus={gitInfo}
                selectedGitDiffFile={selectedGitDiffFile}
                gitDiffText={gitDiffText}
                gitDiffLoading={gitDiffLoading}
                gitDiffError={gitDiffError}
                onProjectChange={project => store.updateProject(project)}
                onDeleteProject={handleDeleteProject}
                onEnvironmentChange={name => store.setActiveEnvironment(name)}
                onEnvironmentUpdate={(name, updater) => store.updateEnvironment(name, updater)}
                onRequestChange={request => store.updateRequest(request)}
                onCasesChange={cases => store.updateCaseList(cases)}
                onCaseSelect={id => {
                  if (!requestId) return;
                  if (!id) {
                    handleSelectRequest(requestId);
                    return;
                  }
                  handleSelectCase(requestId, id);
                }}
                onAddCase={handleAddCase}
                onRun={() => runMutation.mutate()}
                onSave={() => saveMutation.mutate()}
                onSelectRequest={handleSelectRequest}
                onOpenImport={() => setImportOpened(true)}
                onCreateInterface={handleCreateInterface}
                onCategoryVariablesChange={setCategoryVariableRows}
                onSaveCategoryVariables={handleSaveCategoryVariables}
                onCopyToScratch={handleCopyCurrentRequestToScratch}
                onRequestTabChange={tab => updateUiState(current => ({ ...current, activeRequestTab: tab }))}
                onResponseTabChange={tab => updateUiState(current => ({ ...current, activeResponseTab: tab }))}
                onSelectExample={setSelectedExampleName}
                onCopyBody={() => copyToClipboard(store.response?.bodyText || '', 'Body copied')}
                onCopyCurl={() => copyToClipboard(currentRequestPreview ? curlForPreview(currentRequestPreview) : '', 'cURL copied')}
                onCopyBruno={() => store.draftRequest && copyToClipboard(brunoForRequest(store.draftRequest), 'Bruno request copied')}
                onReplaceExample={() => handleSaveResponseAsExample(true)}
                onSaveAs={handleSaveAsCurrentResponse}
                onRefreshSession={handleRefreshSession}
                onClearSession={handleClearSessionCookies}
                onCreateCheck={handleCreateCheckFromResponse}
                onCreateCaseFromResponse={handleCreateCaseFromCurrentResponse}
                onAddToCollection={handleAddCurrentSelectionToCollection}
                onSaveAuthProfile={handleSaveAuthProfile}
                onRefreshRequestAuth={handleRefreshRequestAuth}
                onExtractValue={handleExtractResponseValue}
                onRefreshGitStatus={handleRefreshGitStatus}
                onCopySuggestedCommitMessage={() =>
                  copyToClipboard(suggestedCommitMessage(gitInfo), 'Suggested commit message copied')
                }
                onGitPull={handleGitPull}
                onGitPush={handleGitPush}
                onSelectGitDiff={handleLoadGitDiff}
                onOpenTerminal={() =>
                  store.workspace &&
                  openTerminal(store.workspace.root).catch(error => {
                    notifications.show({ color: 'red', message: `Failed to open terminal: ${(error as Error).message}` });
                  })
                }
                onMainSplitRatioChange={ratio =>
                  updateUiState(current => ({
                    ...current,
                    mainSplitRatio: ratio
                  }))
                }
              />
            ) : (
              <section className="workspace-main">
                <div className="empty-tab-state" style={{ margin: 24 }}>
                  Pick a workspace mode from the rail to continue.
                </div>
              </section>
            )}
          </main>
          <StatusBar
            gitStatus={gitInfo}
            activeEnvironment={store.activeEnvironmentName}
            responseInfo={contextResponseInfo}
            onRefreshGit={handleRefreshGitStatus}
          />
        </div>
      </div>

      <Drawer opened={importOpened} onClose={() => setImportOpened(false)} title="Import API Specification" position="right" size="lg">
        <ImportPanel
          workspace={store.workspace}
          importUrl={importUrl}
          importStrategy={importStrategy}
          importAuth={store.importAuth}
          importPreviewInfo={importPreviewInfo}
          warnings={store.importPreview?.warnings || []}
          onImportUrlChange={setImportUrl}
          onImportStrategyChange={setImportStrategy}
                  onImportAuthChange={auth => store.setImportAuth(auth)}
                  onChooseFile={() => importFileMutation.mutate()}
                  onChooseBrunoFolder={() => importBrunoDirectoryMutation.mutate()}
                  onPreviewUrl={() => importUrlMutation.mutate()}
          onConfirmImport={() => applyImportMutation.mutate()}
          onOpenScratchFromImport={handleOpenImportPreviewInScratch}
        />
      </Drawer>

        <Spotlight.Root
          query={spotlightQuery}
          onQueryChange={setSpotlightQuery}
          shortcut={preferences.commandPaletteShortcut}
        maxHeight={540}
        scrollable
        overlayProps={{ backgroundOpacity: 0.2, blur: 18 }}
        transitionProps={{ transition: 'fade-down', duration: 160, timingFunction: 'ease' }}
        classNames={{
          overlay: 'debugger-spotlight-overlay',
          content: 'debugger-spotlight-content',
          body: 'debugger-spotlight-body',
          search: 'debugger-spotlight-search',
          actionsList: 'debugger-spotlight-actions',
          action: 'debugger-spotlight-action',
          actionBody: 'debugger-spotlight-action-body',
          actionLabel: 'debugger-spotlight-action-label',
          actionDescription: 'debugger-spotlight-action-description',
          actionSection: 'debugger-spotlight-action-section',
          actionsGroup: 'debugger-spotlight-group',
          empty: 'debugger-spotlight-empty'
        }}
      >
        <Spotlight.Search
          leftSection={<IconSearch size={18} stroke={1.6} />}
          placeholder="搜索接口、分类、路径..."
          classNames={{
            input: 'debugger-spotlight-input',
            section: 'debugger-spotlight-input-section'
          }}
        />

        {filteredSpotlightActions.length > 0 ? (
          <Spotlight.ActionsList>
            {filteredSpotlightActions.map(item => {
              if ('actions' in item) {
                return (
                  <Spotlight.ActionsGroup key={item.group} label={item.group}>
                    {item.actions.map(({ id, ...action }) => (
                      <Spotlight.Action key={id} highlightQuery {...action} />
                    ))}
                  </Spotlight.ActionsGroup>
                );
              }

              return <Spotlight.Action key={item.id} highlightQuery {...item} />;
            })}
          </Spotlight.ActionsList>
        ) : (
          <Spotlight.Empty>
            <div className="debugger-spotlight-empty-copy">
              <strong>没有找到匹配项</strong>
              <span>试试接口名、分类名、请求路径或 HTTP 方法。</span>
            </div>
          </Spotlight.Empty>
        )}

        <Spotlight.Footer className="debugger-spotlight-footer">
          <div className="debugger-spotlight-footer-copy">
            <strong>{spotlightCounts.requests + spotlightCounts.categories}</strong>
            <span>
              已索引 {spotlightCounts.requests} 个接口，{spotlightCounts.categories} 个分类
            </span>
          </div>
          <div className="debugger-spotlight-footer-hints" aria-hidden="true">
            <span>{preferences.commandPaletteShortcut}</span>
            <span>↑↓ 切换</span>
            <span>Enter 打开</span>
            <span>Esc 关闭</span>
          </div>
        </Spotlight.Footer>
      </Spotlight.Root>
    </>
  );
}

async function copyToClipboard(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    notifications.show({ color: 'teal', message: successMessage });
  } catch (_err) {
    notifications.show({ color: 'red', message: 'Failed to copy to clipboard' });
  }
}

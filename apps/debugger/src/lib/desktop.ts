import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type { CollectionRunReport, SendRequestResult, SessionSnapshot } from '@yapi-debugger/schema';
import type {
  BrowserTargetSummary,
  CaptureBrowserState,
  CaptureMode,
  CaptureRuntimeState,
  CapturedNetworkEntry
} from './capture';

export type GitStatusPayload = {
  branch: string;
  isRepo: boolean;
  dirty: boolean;
  ahead: number;
  behind: number;
  changedFiles: string[];
};

export type MenuAction =
  | { action: 'open-project' }
  | { action: 'new-project' }
  | { action: 'import-project' }
  | { action: 'close-workspace' }
  | { action: 'open-recent'; root: string };

export type WebSocketTimelineEvent = {
  direction: 'runtime' | 'in' | 'out';
  label: string;
  body: string;
  elapsedMs: number;
};

export type WebSocketRunResult = {
  ok: boolean;
  url: string;
  durationMs: number;
  events: WebSocketTimelineEvent[];
};

export type WebSocketLiveSnapshot = WebSocketRunResult & {
  sessionId: string;
};

export interface WorkspaceScanPayload {
  root: string;
  files: { path: string; content: string }[];
}

export interface ImportSourcePayload {
  content: string;
  source_type: string;
  name: string;
}

export async function chooseDirectory() {
  const result = await open({
    directory: true,
    multiple: false,
    title: 'Select API Project Directory'
  });

  return typeof result === 'string' ? result : null;
}

export async function chooseBrunoExportDirectory() {
  const result = await open({
    directory: true,
    multiple: false,
    title: 'Select Bruno Export Directory'
  });

  return typeof result === 'string' ? result : null;
}

export async function chooseBrunoImportDirectory() {
  const result = await open({
    directory: true,
    multiple: false,
    title: 'Select Bruno Collection Directory'
  });

  return typeof result === 'string' ? result : null;
}

export async function chooseImportFile() {
  const result = await open({
    multiple: false,
    title: 'Select Import File',
    filters: [
      {
        name: 'API Specs, Collections & HAR',
        extensions: ['json', 'yaml', 'yml', 'har', 'bru']
      }
    ]
  });
  return typeof result === 'string' ? result : null;
}

export async function chooseRequestBodyFile() {
  const result = await open({
    multiple: false,
    title: 'Select Upload File'
  });
  return typeof result === 'string' ? result : null;
}

export async function scanWorkspace(root: string): Promise<WorkspaceScanPayload> {
  return invoke('workspace_scan', { root });
}

export async function watchWorkspace(root: string, onChange: () => void) {
  const unlisten = await listen('workspace://changed', event => {
    const payload = event.payload as any;
    if (payload && payload.root === root) {
      onChange();
    }
  });
  await invoke('workspace_watch', { root });
  return unlisten;
}

export async function unwatchWorkspace(root: string) {
  await invoke('workspace_unwatch', { root });
}

export async function writeDocument(path: string, content: string) {
  await invoke('workspace_write_document', { path, content });
}

export async function deleteEntry(path: string, recursive = false) {
  await invoke('workspace_delete_entry', { path, recursive });
}

export async function readImportFile(path: string): Promise<ImportSourcePayload> {
  return invoke('import_read_file', { path });
}

export async function fetchImportUrl(url: string, auth: any): Promise<ImportSourcePayload> {
  return invoke('import_fetch_url', { url, auth });
}

export async function sendRequest(input: any): Promise<SendRequestResult> {
  return invoke('request_send', { input });
}

export async function runWebSocketSession(input: {
  url: string;
  headers: Array<{ name: string; value: string; enabled: boolean; kind?: string; filePath?: string }>;
  messages: Array<{ name: string; body: string; kind?: 'json' | 'text' | 'binary'; enabled: boolean }>;
  timeoutMs?: number;
}): Promise<WebSocketRunResult> {
  return invoke('websocket_run', { input });
}

export async function connectWebSocketLive(input: {
  url: string;
  headers: Array<{ name: string; value: string; enabled: boolean; kind?: string; filePath?: string }>;
  timeoutMs?: number;
}): Promise<WebSocketLiveSnapshot> {
  return invoke('websocket_live_connect', { input });
}

export async function sendWebSocketLiveMessage(input: {
  sessionId: string;
  message: { name: string; body: string; kind?: 'json' | 'text' | 'binary'; enabled: boolean };
}): Promise<WebSocketLiveSnapshot> {
  return invoke('websocket_live_send', { input });
}

export async function loadWebSocketLiveSnapshot(sessionId: string): Promise<WebSocketLiveSnapshot> {
  return invoke('websocket_live_snapshot', { sessionId });
}

export async function closeWebSocketLive(sessionId: string): Promise<WebSocketLiveSnapshot> {
  return invoke('websocket_live_close', { sessionId });
}

export async function loadHistory(workspaceRoot?: string): Promise<any[]> {
  return invoke('history_load', { workspaceRoot });
}

export async function appendHistory(entry: any) {
  await invoke('history_append', { entry });
}

export async function clearHistory(workspaceRoot?: string) {
  await invoke('history_clear', { workspaceRoot });
}

export async function loadCollectionReports(workspaceRoot?: string): Promise<CollectionRunReport[]> {
  return invoke('collection_report_load', { workspaceRoot });
}

export async function appendCollectionReport(report: CollectionRunReport) {
  await invoke('collection_report_append', { report });
}

export async function clearCollectionReports(workspaceRoot?: string) {
  await invoke('collection_report_clear', { workspaceRoot });
}

export async function inspectSession(sessionId: string, url?: string): Promise<SessionSnapshot> {
  return invoke('session_inspect', { sessionId, url });
}

export async function clearSession(sessionId: string) {
  await invoke('session_clear', { sessionId });
}

export async function gitStatus(root: string): Promise<GitStatusPayload> {
  return invoke('git_status', { root });
}

export async function gitPull(root: string): Promise<string> {
  return invoke('git_pull', { root });
}

export async function gitPush(root: string): Promise<string> {
  return invoke('git_push', { root });
}

export async function openTerminal(root: string) {
  await invoke('open_terminal', { root });
}

export async function launchCaptureBrowser(): Promise<CaptureBrowserState> {
  return invoke('capture_browser_launch');
}

export async function listCaptureTargets(): Promise<BrowserTargetSummary[]> {
  return invoke('capture_target_list');
}

export async function startBrowserCapture(input: {
  mode: CaptureMode;
  targetId?: string | null;
}): Promise<CaptureRuntimeState> {
  return invoke('capture_start', { input });
}

export async function stopBrowserCapture(): Promise<CaptureRuntimeState> {
  return invoke('capture_stop');
}

export async function clearBrowserCaptureSession(): Promise<CaptureRuntimeState> {
  return invoke('capture_clear');
}

export function listenCaptureEvents(handlers: {
  onState?: (state: CaptureRuntimeState) => void;
  onEntry?: (entry: CapturedNetworkEntry) => void;
}) {
  return Promise.all([
    listen<CaptureRuntimeState>('capture://state', event => {
      handlers.onState?.(event.payload);
    }),
    listen<CapturedNetworkEntry>('capture://entry', event => {
      handlers.onEntry?.(event.payload);
    })
  ]).then(([unlistenState, unlistenEntry]) => () => {
    unlistenState();
    unlistenEntry();
  });
}

export function listenMenuActions(handler: (action: MenuAction) => void) {
  return listen<MenuAction>('menu://action', event => {
    handler(event.payload);
  });
}

export async function syncMenuState(recentRoots: string[], hasWorkspace: boolean) {
  await invoke('menu_sync_state', { recentRoots, hasWorkspace });
}

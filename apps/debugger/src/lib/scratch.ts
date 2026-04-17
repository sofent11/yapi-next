import {
  createEmptyRequest,
  type CheckResult,
  type RequestDocument,
  type ScriptLog,
  type SendRequestResult
} from '@yapi-debugger/schema';

const SCRATCH_STORAGE_KEY = 'yapi-debugger.scratch-sessions.v1';

export type ScratchSession = {
  id: string;
  title: string;
  request: RequestDocument;
  response: SendRequestResult | null;
  requestError: string | null;
  checkResults: CheckResult[];
  scriptLogs: ScriptLog[];
  selectedExampleName: string | null;
  updatedAt: string;
};

export function createScratchSession(seed?: Partial<ScratchSession>): ScratchSession {
  const request = seed?.request ? structuredClone(seed.request) : createEmptyRequest('Scratch Request');
  return {
    id: seed?.id || `scratch_${Math.random().toString(36).slice(2, 8)}`,
    title: seed?.title || request.name || 'Scratch Request',
    request,
    response: seed?.response || null,
    requestError: seed?.requestError || null,
    checkResults: seed?.checkResults || [],
    scriptLogs: seed?.scriptLogs || [],
    selectedExampleName: seed?.selectedExampleName || null,
    updatedAt: seed?.updatedAt || new Date().toISOString()
  };
}

export function normalizeScratchTitle(request: RequestDocument) {
  const explicit = request.name?.trim();
  if (explicit && explicit !== 'Scratch Request') return explicit;
  const pathLike = request.path?.trim() || request.url?.trim();
  if (!pathLike) return 'Scratch Request';
  return `${request.method} ${pathLike}`.slice(0, 60);
}

export function loadScratchSessions() {
  if (typeof window === 'undefined') {
    return [createScratchSession()];
  }

  try {
    const raw = window.localStorage.getItem(SCRATCH_STORAGE_KEY);
    if (!raw) return [createScratchSession()];
    const parsed = JSON.parse(raw) as Partial<ScratchSession>[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [createScratchSession()];
    return parsed.map(item => createScratchSession(item));
  } catch (_error) {
    return [createScratchSession()];
  }
}

export function saveScratchSessions(sessions: ScratchSession[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SCRATCH_STORAGE_KEY, JSON.stringify(sessions.slice(0, 6)));
}

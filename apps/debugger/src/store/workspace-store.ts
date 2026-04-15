import { create } from 'zustand';
import {
  createDefaultEnvironment,
  createEmptyCase,
  createEmptyRequest,
  type CaseDocument,
  type ImportAuth,
  type ImportResult,
  type RequestDocument,
  type SendRequestResult,
  type WorkspaceIndex
} from '@yapi-debugger/schema';

type WorkspaceStore = {
  workspace: WorkspaceIndex | null;
  selectedRequestId: string | null;
  selectedCaseId: string | null;
  activeEnvironmentName: string;
  recentRoots: string[];
  importPreview: ImportResult | null;
  importAuth: ImportAuth;
  response: SendRequestResult | null;
  draftRequest: RequestDocument | null;
  draftCases: CaseDocument[];
  isDirty: boolean;
  searchText: string;
  setWorkspace: (workspace: WorkspaceIndex | null) => void;
  setRecentRoots: (roots: string[]) => void;
  selectRequest: (requestId: string | null, caseId?: string | null) => void;
  setActiveEnvironment: (name: string) => void;
  setImportPreview: (preview: ImportResult | null) => void;
  setImportAuth: (auth: ImportAuth) => void;
  updateRequest: (request: RequestDocument) => void;
  updateCaseList: (cases: CaseDocument[]) => void;
  updateEnvironmentBaseUrl: (name: string, baseUrl: string) => void;
  addDraftCase: () => void;
  replaceSelectedCase: (caseDocument: CaseDocument) => void;
  setResponse: (response: SendRequestResult | null) => void;
  markSaved: () => void;
  setSearchText: (text: string) => void;
};

function findRecord(workspace: WorkspaceIndex | null, requestId: string | null) {
  if (!workspace || !requestId) return null;
  return workspace.requests.find((item: WorkspaceIndex['requests'][number]) => item.request.id === requestId) || null;
}

function defaultImportAuth(): ImportAuth {
  return {
    mode: 'none',
    token: '',
    key: '',
    value: ''
  };
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspace: null,
  selectedRequestId: null,
  selectedCaseId: null,
  activeEnvironmentName: 'shared',
  recentRoots: [],
  importPreview: null,
  importAuth: defaultImportAuth(),
  response: null,
  draftRequest: null,
  draftCases: [],
  isDirty: false,
  searchText: '',
  setWorkspace(workspace) {
    const previousWorkspace = get().workspace;
    const previousRequestId = get().selectedRequestId;
    const previousCaseId = get().selectedCaseId;
    const previousEnvironment = get().activeEnvironmentName;
    const defaultRequestId = workspace?.requests[0]?.request.id || null;
    const nextRequestId = previousWorkspace
      ? previousRequestId && workspace?.requests.some(item => item.request.id === previousRequestId)
        ? previousRequestId
        : null
      : defaultRequestId;
    const nextRecord = findRecord(workspace, nextRequestId);
    const nextCaseId =
      previousCaseId && nextRecord?.cases.some(item => item.id === previousCaseId)
        ? previousCaseId
        : null;
    const nextEnvironment =
      workspace?.environments.some(item => item.document.name === previousEnvironment)
        ? previousEnvironment
        : workspace?.project.defaultEnvironment || 'shared';
    set({
      workspace,
      selectedRequestId: nextRequestId,
      selectedCaseId: nextCaseId,
      draftRequest: nextRecord?.request || null,
      draftCases: nextRecord?.cases || [],
      activeEnvironmentName: nextEnvironment,
      isDirty: false,
      response: null,
      searchText: ''
    });
  },
  setRecentRoots(roots) {
    set({ recentRoots: roots });
  },
  selectRequest(requestId, caseId = null) {
    const record = findRecord(get().workspace, requestId);
    set({
      selectedRequestId: requestId,
      selectedCaseId: caseId,
      draftRequest: record?.request || null,
      draftCases: record?.cases || [],
      isDirty: false,
      response: null
    });
  },
  setActiveEnvironment(name) {
    set({ activeEnvironmentName: name });
  },
  setImportPreview(preview) {
    set({ importPreview: preview });
  },
  setImportAuth(auth) {
    set({ importAuth: auth });
  },
  updateRequest(request) {
    set({ draftRequest: request, isDirty: true });
  },
  updateCaseList(cases) {
    set({ draftCases: cases, isDirty: true });
  },
  updateEnvironmentBaseUrl(name, baseUrl) {
    const workspace = get().workspace;
    if (!workspace) return;
    set({
      workspace: {
        ...workspace,
        environments: workspace.environments.map((item: WorkspaceIndex['environments'][number]) =>
          item.document.name === name
            ? {
                ...item,
                document: {
                  ...item.document,
                  vars: {
                    ...item.document.vars,
                    baseUrl
                  }
                }
              }
            : item
        )
      }
    });
  },
  addDraftCase() {
    const request = get().draftRequest || createEmptyRequest();
    const nextCase = createEmptyCase(request.id, `Case ${get().draftCases.length + 1}`);
    set({
      draftCases: [...get().draftCases, nextCase],
      selectedCaseId: nextCase.id,
      isDirty: true
    });
  },
  replaceSelectedCase(caseDocument) {
    const nextCases = get().draftCases.map((item: CaseDocument) => (item.id === caseDocument.id ? caseDocument : item));
    set({ draftCases: nextCases, isDirty: true });
  },
  setResponse(response) {
    set({ response });
  },
  markSaved() {
    const workspace = get().workspace;
    const requestId = get().selectedRequestId;
    const draftRequest = get().draftRequest;
    if (!workspace || !requestId || !draftRequest) {
      set({ isDirty: false });
      return;
    }
    const nextWorkspace: WorkspaceIndex = {
      ...workspace,
      requests: workspace.requests.map((record: WorkspaceIndex['requests'][number]) =>
        record.request.id === requestId
          ? {
              ...record,
              request: draftRequest,
              cases: get().draftCases
            }
          : record
      ),
      environments: workspace.environments.map((item: WorkspaceIndex['environments'][number]) =>
        item.document.name === get().activeEnvironmentName
          ? item
          : item
      )
    };
    set({ workspace: nextWorkspace, isDirty: false });
  },
  setSearchText(text) {
    set({ searchText: text });
  }
}));

export function ensureWorkspaceEnvironment(name: string, workspace: WorkspaceIndex | null) {
  return (
    workspace?.environments.find((item: WorkspaceIndex['environments'][number]) => item.document.name === name)?.document ||
    createDefaultEnvironment(name)
  );
}

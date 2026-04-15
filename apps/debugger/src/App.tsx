import { startTransition, useEffect, useMemo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { ActionIcon, Drawer, Select, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { IconRefresh } from '@tabler/icons-react';
import type { WorkspaceIndex } from '@yapi-debugger/schema';
import {
  chooseDirectory,
  chooseImportFile,
  listenMenuActions,
  syncMenuState,
  unwatchWorkspace,
  watchWorkspace
} from './lib/desktop';
import {
  createRequestInWorkspace,
  createWorkspace,
  importFromFile,
  importFromUrl,
  importIntoWorkspace,
  openWorkspace,
  runResolvedRequest,
  saveEnvironment,
  saveProject,
  saveRequestRecord
} from './lib/workspace';
import { AppRail } from './components/panels/AppRail';
import { ImportPanel } from './components/panels/ImportPanel';
import { InterfaceTreePanel } from './components/panels/InterfaceTreePanel';
import { WelcomePanel } from './components/panels/WelcomePanel';
import { WorkspaceMainPanel } from './components/panels/WorkspaceMainPanel';
import {
  defaultWorkspaceUiState,
  type SelectedNode,
  type WorkspaceUiState,
  useWorkspaceStore
} from './store/workspace-store';

const RECENT_STORAGE_KEY = 'yapi-debugger.recent-roots';
const UI_STORAGE_KEY_PREFIX = 'yapi-debugger.ui';

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

function uiStorageKey(root: string) {
  return `${UI_STORAGE_KEY_PREFIX}:${root}`;
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
      lastSelectedNode: parsed.lastSelectedNode || { kind: 'project' }
    };
  } catch (_err) {
    return defaultWorkspaceUiState();
  }
}

function saveWorkspaceUiState(root: string, state: WorkspaceUiState) {
  window.localStorage.setItem(uiStorageKey(root), JSON.stringify(state));
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

function selectionLabel(node: SelectedNode, workspace: WorkspaceIndex | null) {
  if (node.kind === 'project') return '项目配置';
  if (node.kind === 'category') return node.path;
  if (node.kind === 'request' || node.kind === 'case') {
    const record = workspace?.requests.find(item => item.request.id === node.requestId);
    if (node.kind === 'case') {
      const matchedCase = record?.cases.find(item => item.id === node.caseId);
      return matchedCase?.name || '用例';
    }
    return record?.request.path || record?.request.url || record?.request.name || '/';
  }
  return '项目配置';
}

function clampTreeWidth(value: number) {
  return Math.max(260, Math.min(420, Math.round(value)));
}

export function App() {
  const store = useWorkspaceStore();
  const [projectName, setProjectName] = useState('New API Workspace');
  const [importUrl, setImportUrl] = useState('');
  const [importOpened, setImportOpened] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [uiState, setUiState] = useState<WorkspaceUiState>(defaultWorkspaceUiState());

  const requestId = selectedRequestId(store.selectedNode);
  const caseId = selectedCaseId(store.selectedNode);
  const categoryPath = selectedCategoryPath(store.selectedNode, store.workspace);

  const selectedEnvironment = store.workspace?.environments.find(
    item => item.document.name === store.activeEnvironmentName
  )?.document || null;

  const selectedRecord = useMemo(
    () => store.workspace?.requests.find(item => item.request.id === requestId) || null,
    [store.workspace, requestId]
  );

  const categoryRequests = useMemo(() => {
    if (!store.workspace || !categoryPath) return [];
    return store.workspace.requests.filter(record => {
      const value = record.folderSegments.join('/');
      return value === categoryPath || value.startsWith(`${categoryPath}/`);
    });
  }, [store.workspace, categoryPath]);

  function applyWorkspaceState(workspace: WorkspaceIndex) {
    const nextUi = loadWorkspaceUiState(workspace.root);
    setUiState(nextUi);
    startTransition(() => {
      store.setWorkspace(workspace);
      store.selectNode(nextUi.lastSelectedNode);
    });
  }

  function updateUiState(updater: (current: WorkspaceUiState) => WorkspaceUiState) {
    setUiState(current => updater(current));
  }

  function expandRequest(requestIdToExpand: string) {
    updateUiState(current =>
      current.expandedRequestIds.includes(requestIdToExpand)
        ? current
        : {
            ...current,
            expandedRequestIds: [...current.expandedRequestIds, requestIdToExpand]
          }
    );
  }

  function handleSelectProject() {
    store.selectNode({ kind: 'project' });
  }

  function handleSelectCategory(path: string) {
    store.selectNode({ kind: 'category', path });
  }

  function handleSelectRequest(nextRequestId: string) {
    expandRequest(nextRequestId);
    store.selectNode({ kind: 'request', requestId: nextRequestId });
  }

  function handleSelectCase(nextRequestId: string, nextCaseId: string) {
    expandRequest(nextRequestId);
    store.selectNode({ kind: 'case', requestId: nextRequestId, caseId: nextCaseId });
  }

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
      lastSelectedNode: store.selectedNode
    });
  }, [store.workspace?.root, uiState, store.selectedNode]);

  useEffect(() => {
    const selectedId = requestId;
    if (!selectedId) return;
    expandRequest(selectedId);
  }, [requestId]);

  useEffect(() => {
    const unlistenPromise = listenMenuActions(payload => {
      if (payload.action === 'open-workspace') {
        handleOpenDirectory();
        return;
      }
      if (payload.action === 'create-workspace') {
        createMutation.mutate();
        return;
      }
      if (payload.action === 'import-project') {
        if (store.workspace) setImportOpened(true);
        return;
      }
      if (payload.action === 'close-workspace') {
        setUiState(defaultWorkspaceUiState());
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isCommand = event.metaKey || event.ctrlKey;
      if (!isCommand) return;

      const key = event.key.toLowerCase();

      if (key === 'o') {
        event.preventDefault();
        handleOpenDirectory();
        return;
      }

      if (key === 's' && store.workspace) {
        event.preventDefault();
        saveMutation.mutate();
        return;
      }

      if (key === 'enter' && requestId) {
        event.preventDefault();
        runMutation.mutate();
        return;
      }

      if (key === 'f' && event.shiftKey) {
        event.preventDefault();
        window.dispatchEvent(new Event('debugger://focus-search'));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store.workspace, requestId]);

  const openMutation = useMutation({
    mutationFn: async (root: string) => openWorkspace(root),
    onSuccess(workspace) {
      applyWorkspaceState(workspace);
      const recent = [workspace.root, ...store.recentRoots.filter(item => item !== workspace.root)];
      store.setRecentRoots(recent);
      saveRecentRoots(recent);
      notifications.show({ color: 'teal', message: `Opened ${workspace.project.name}` });
    },
    onError(error) {
      notifications.show({ color: 'red', message: (error as Error).message || 'Open workspace failed' });
    }
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const root = await chooseDirectory();
      if (!root) throw new Error('No folder selected');
      return createWorkspace(root, projectName.trim() || 'New API Workspace');
    },
    onSuccess(workspace) {
      applyWorkspaceState(workspace);
      const recent = [workspace.root, ...store.recentRoots.filter(item => item !== workspace.root)];
      store.setRecentRoots(recent);
      saveRecentRoots(recent);
      notifications.show({ color: 'teal', message: 'Workspace created' });
    },
    onError(error) {
      notifications.show({ color: 'red', message: (error as Error).message || 'Create workspace failed' });
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace) throw new Error('Open a workspace first');

      if (store.selectedNode.kind === 'project') {
        if (!store.draftProject) throw new Error('Project draft missing');
        await saveProject(store.workspace.root, store.draftProject);
        await Promise.all(
          store.workspace.environments.map(item => saveEnvironment(store.workspace!.root, item.document))
        );
        return openWorkspace(store.workspace.root);
      }

      if (store.selectedNode.kind === 'request' || store.selectedNode.kind === 'case') {
        if (!store.draftRequest) throw new Error('Request draft missing');
        const requestNode = store.selectedNode;
        const record = store.workspace.requests.find(item => item.request.id === requestNode.requestId);
        if (!record) throw new Error('Selected interface missing');
        await saveRequestRecord(
          store.workspace.root,
          record.folderSegments,
          store.draftRequest,
          store.draftCases,
          record.resourceDirPath,
          record.requestFilePath
        );
        return openWorkspace(store.workspace.root);
      }

      throw new Error('Nothing to save on this view');
    },
    onSuccess(workspace) {
      applyWorkspaceState(workspace);
      notifications.show({ color: 'teal', message: 'Saved' });
    },
    onError(error) {
      notifications.show({ color: 'red', message: (error as Error).message || 'Save failed' });
    }
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace || !requestId) throw new Error('Select an interface first');
      return runResolvedRequest(store.workspace, requestId, caseId || undefined);
    },
    onSuccess(response) {
      store.setResponse(response);
      notifications.show({ color: 'teal', message: `Request completed with ${response.status}` });
    },
    onError(error) {
      notifications.show({ color: 'red', message: (error as Error).message || 'Run failed' });
    }
  });

  const importFileMutation = useMutation({
    mutationFn: async () => {
      const filePath = await chooseImportFile();
      if (!filePath) throw new Error('No import file selected');
      return importFromFile(filePath);
    },
    onSuccess(payload) {
      store.setImportPreview(payload.result);
      setImportOpened(true);
      notifications.show({ color: 'teal', message: `Previewed ${payload.source.name}` });
    },
    onError(error) {
      notifications.show({ color: 'red', message: (error as Error).message || 'Import preview failed' });
    }
  });

  const importUrlMutation = useMutation({
    mutationFn: async () => importFromUrl(importUrl.trim(), store.importAuth),
    onSuccess(payload) {
      store.setImportPreview(payload.result);
      notifications.show({ color: 'teal', message: `Previewed ${payload.source.name}` });
    },
    onError(error) {
      notifications.show({ color: 'red', message: (error as Error).message || 'URL import preview failed' });
    }
  });

  const applyImportMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace) throw new Error('Open a workspace first');
      if (!store.importPreview) throw new Error('Preview an import first');
      const source = importUrl.trim()
        ? (await importFromUrl(importUrl.trim(), store.importAuth)).source
        : importFileMutation.data?.source;
      if (!source) throw new Error('Import source missing');
      await importIntoWorkspace(store.workspace.root, source);
      return openWorkspace(store.workspace.root);
    },
    onSuccess(workspace) {
      applyWorkspaceState(workspace);
      store.setImportPreview(null);
      setImportOpened(false);
      notifications.show({ color: 'teal', message: 'Import applied to project' });
    },
    onError(error) {
      notifications.show({ color: 'red', message: (error as Error).message || 'Apply import failed' });
    }
  });

  const addRequestMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace) throw new Error('Open a workspace first');
      const segments = categoryPath ? categoryPath.split('/').filter(Boolean) : ['default'];
      return createRequestInWorkspace(store.workspace.root, segments);
    },
    onSuccess(nextRequestId) {
      if (!store.workspace) return;
      openWorkspace(store.workspace.root).then(workspace => {
        applyWorkspaceState(workspace);
        handleSelectRequest(nextRequestId);
      });
      notifications.show({ color: 'teal', message: 'Interface created' });
    },
    onError(error) {
      notifications.show({ color: 'red', message: (error as Error).message || 'Create interface failed' });
    }
  });

  function openExistingWorkspace(root: string) {
    openMutation.mutate(root);
  }

  async function handleOpenDirectory() {
    const root = await chooseDirectory();
    if (root) openExistingWorkspace(root);
  }

  function handleConfirmCreateCategory() {
    const seed = categoryDraft.trim();
    if (!seed) return;
    const nextPath = categoryPath ? `${categoryPath}/${seed}` : seed;
    handleSelectCategory(nextPath);
    setCategoryDraft('');
    setCreatingCategory(false);
    notifications.show({ color: 'teal', message: `Category ${nextPath} is ready. Create an interface inside it.` });
  }

  function handleTreeResizeStart(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = uiState.treeWidth;

    function handleMove(moveEvent: MouseEvent) {
      const nextWidth = startWidth + (moveEvent.clientX - startX);
      updateUiState(current => ({
        ...current,
        treeWidth: clampTreeWidth(nextWidth)
      }));
    }

    function handleUp() {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    }

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }

  if (!store.workspace) {
    return (
      <WelcomePanel
        recentRoots={store.recentRoots}
        projectName={projectName}
        setProjectName={setProjectName}
        onOpenDirectory={handleOpenDirectory}
        onCreateProject={() => createMutation.mutate()}
        onOpenRecent={openExistingWorkspace}
      />
    );
  }

  return (
    <>
      <div className="app-shell-native">
        <div className="workspace-frame">
          <div className="workspace-contextbar">
            <div className="workspace-context-copy">
              <span className="workspace-context-label">YApi Debugger</span>
              <strong className="workspace-context-title">{store.workspace.project.name}</strong>
              <Text c="dimmed" size="xs" className="workspace-context-path">
                {selectionLabel(store.selectedNode, store.workspace)}
              </Text>
            </div>

            <div className="workspace-context-actions">
              <Select
                size="xs"
                className="compact-select"
                value={store.activeEnvironmentName}
                data={store.workspace.environments.map(item => ({
                  value: item.document.name,
                  label: item.document.name
                }))}
                onChange={value => value && store.setActiveEnvironment(value)}
              />
              <span className={['workspace-indicator', runMutation.isPending ? 'is-busy' : ''].filter(Boolean).join(' ')}>
                {runMutation.isPending ? 'Running' : 'Idle'}
              </span>
              <span className={['workspace-indicator', store.isDirty ? 'is-dirty' : ''].filter(Boolean).join(' ')}>
                {store.isDirty ? 'Unsaved' : 'Saved'}
              </span>
              <ActionIcon variant="subtle" color="dark" onClick={() => openMutation.mutate(store.workspace!.root)}>
                <IconRefresh size={15} />
              </ActionIcon>
            </div>
          </div>

          <main
            className="workspace-grid"
            style={
              {
                '--tree-width': `${uiState.treeWidth}px`
              } as CSSProperties
            }
          >
            <AppRail
              workspaceName={store.workspace.project.name}
              requestCount={store.workspace.requests.length}
              activeEnvironment={store.activeEnvironmentName}
              isDirty={store.isDirty}
            />

            <InterfaceTreePanel
              workspace={store.workspace}
              selectedNode={store.selectedNode}
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
              onCreateInterface={() => addRequestMutation.mutate()}
              onAddCase={() => store.addDraftCase()}
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
            />

            <div className="workspace-resizer" onMouseDown={handleTreeResizeStart} />

            <WorkspaceMainPanel
              workspace={store.workspace}
              selectedNode={store.selectedNode}
              categoryRequests={categoryRequests}
              draftProject={store.draftProject}
              request={store.draftRequest}
              response={store.response}
              cases={store.draftCases}
              activeEnvironmentName={store.activeEnvironmentName}
              selectedEnvironment={selectedEnvironment}
              isRunning={runMutation.isPending}
              isDirty={store.isDirty}
              activeRequestTab={uiState.activeRequestTab}
              activeResponseTab={uiState.activeResponseTab}
              mainSplitRatio={uiState.mainSplitRatio}
              onProjectChange={project => store.updateProject(project)}
              onEnvironmentChange={name => store.setActiveEnvironment(name)}
              onEnvironmentUpdate={(name, updater) => store.updateEnvironment(name, updater)}
              onRequestChange={requestDocument => store.updateRequest(requestDocument)}
              onCasesChange={cases => store.updateCaseList(cases)}
              onCaseSelect={nextCaseId =>
                requestId
                  ? nextCaseId
                    ? handleSelectCase(requestId, nextCaseId)
                    : handleSelectRequest(requestId)
                  : undefined
              }
              onAddCase={() => store.addDraftCase()}
              onRun={() => runMutation.mutate()}
              onSave={() => saveMutation.mutate()}
              onSelectRequest={handleSelectRequest}
              onOpenImport={() => setImportOpened(true)}
              onCreateInterface={() => addRequestMutation.mutate()}
              onRequestTabChange={tab =>
                updateUiState(current => ({
                  ...current,
                  activeRequestTab: tab
                }))
              }
              onResponseTabChange={tab =>
                updateUiState(current => ({
                  ...current,
                  activeResponseTab: tab
                }))
              }
              onMainSplitRatioChange={ratio =>
                updateUiState(current => ({
                  ...current,
                  mainSplitRatio: ratio
                }))
              }
            />
          </main>
        </div>
      </div>

      <Drawer opened={importOpened} onClose={() => setImportOpened(false)} title="导入接口规范" position="right" size="lg">
        <ImportPanel
          preview={store.importPreview}
          importAuth={store.importAuth}
          importUrl={importUrl}
          setImportUrl={setImportUrl}
          setImportAuth={auth => store.setImportAuth(auth)}
          onPickFile={() => importFileMutation.mutate()}
          onImportUrl={() => importUrlMutation.mutate()}
          onApplyImport={() => applyImportMutation.mutate()}
        />
      </Drawer>
    </>
  );
}

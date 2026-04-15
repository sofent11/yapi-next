import { startTransition, useEffect, useMemo, useState } from 'react';
import { ActionIcon, Drawer, Group, Select, Text } from '@mantine/core';
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
import { useWorkspaceStore } from './store/workspace-store';
import { WelcomePanel } from './components/panels/WelcomePanel';
import { ImportPanel } from './components/panels/ImportPanel';
import { AppRail } from './components/panels/AppRail';
import { InterfaceTreePanel } from './components/panels/InterfaceTreePanel';
import { WorkspaceMainPanel } from './components/panels/WorkspaceMainPanel';

const RECENT_STORAGE_KEY = 'yapi-debugger.recent-roots';

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

function selectedRequestId(node: ReturnType<typeof useWorkspaceStore.getState>['selectedNode']) {
  return node.kind === 'request' || node.kind === 'case' ? node.requestId : null;
}

function selectedCaseId(node: ReturnType<typeof useWorkspaceStore.getState>['selectedNode']) {
  return node.kind === 'case' ? node.caseId : null;
}

function selectedCategoryPath(node: ReturnType<typeof useWorkspaceStore.getState>['selectedNode'], workspace: WorkspaceIndex | null) {
  if (node.kind === 'category') return node.path;
  if (node.kind === 'request' || node.kind === 'case') {
    const record = workspace?.requests.find(item => item.request.id === node.requestId);
    return record?.folderSegments.join('/') || null;
  }
  return null;
}

export function App() {
  const store = useWorkspaceStore();
  const [projectName, setProjectName] = useState('New API Workspace');
  const [importUrl, setImportUrl] = useState('');
  const [importOpened, setImportOpened] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');

  const requestId = selectedRequestId(store.selectedNode);
  const caseId = selectedCaseId(store.selectedNode);
  const categoryPath = selectedCategoryPath(store.selectedNode, store.workspace);

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

  const selectedEnvironment = store.workspace?.environments.find(
    item => item.document.name === store.activeEnvironmentName
  )?.document || null;

  useEffect(() => {
    const roots = loadRecentRoots();
    store.setRecentRoots(roots);
  }, []);

  useEffect(() => {
    syncMenuState(store.recentRoots, Boolean(store.workspace)).catch(() => undefined);
  }, [store.recentRoots, store.workspace?.root]);

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
  }, [store.workspace, store.recentRoots, projectName]);

  useEffect(() => {
    if (!store.workspace?.root) return;
    let unlisten: (() => void) | undefined;

    watchWorkspace(store.workspace.root, async () => {
      const workspace = await openWorkspace(store.workspace!.root);
      startTransition(() => store.setWorkspace(workspace));
    }).then(listener => {
      unlisten = listener;
    });

    return () => {
      if (unlisten) unlisten();
      unwatchWorkspace(store.workspace!.root).catch(() => undefined);
    };
  }, [store.workspace?.root]);

  const openMutation = useMutation({
    mutationFn: async (root: string) => openWorkspace(root),
    onSuccess(workspace) {
      startTransition(() => store.setWorkspace(workspace));
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
      startTransition(() => store.setWorkspace(workspace));
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
      startTransition(() => store.setWorkspace(workspace));
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
      startTransition(() => store.setWorkspace(workspace));
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
        store.setWorkspace(workspace);
        startTransition(() => store.selectNode({ kind: 'request', requestId: nextRequestId }));
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
    store.selectNode({ kind: 'category', path: nextPath });
    setCategoryDraft('');
    setCreatingCategory(false);
    notifications.show({ color: 'teal', message: `Category ${nextPath} is ready. Create an interface inside it.` });
  }

  if (!store.workspace) {
    return (
      <>
        <WelcomePanel
          recentRoots={store.recentRoots}
          projectName={projectName}
          setProjectName={setProjectName}
          onOpenDirectory={handleOpenDirectory}
          onCreateProject={() => createMutation.mutate()}
          onOpenRecent={openExistingWorkspace}
        />
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

  return (
    <div className="app-shell app-shell-v4">
      <header className="desktop-topbar">
        <div className="desktop-topbar-left">
          <span className="traffic traffic-red" />
          <span className="traffic traffic-yellow" />
          <span className="traffic traffic-green" />
          <div className="desktop-title-group">
            <span className="desktop-title">{store.workspace.project.name}</span>
            <Text c="dimmed" size="sm">
              {store.selectedNode.kind === 'project'
                ? '项目首页'
                : store.selectedNode.kind === 'category'
                  ? store.selectedNode.path
                  : selectedRecord?.request.path || selectedRecord?.request.url || '/'}
            </Text>
          </div>
        </div>
        <Group>
          <Select
            value={store.activeEnvironmentName}
            data={store.workspace.environments.map(item => ({
              value: item.document.name,
              label: item.document.name
            }))}
            onChange={value => value && store.setActiveEnvironment(value)}
          />
          <ActionIcon variant="light" color="dark" onClick={() => openMutation.mutate(store.workspace!.root)}>
            <IconRefresh size={16} />
          </ActionIcon>
        </Group>
      </header>

      <main className="workspace-shell">
        <AppRail />

        <InterfaceTreePanel
          workspace={store.workspace}
          selectedNode={store.selectedNode}
          searchText={store.searchText}
          categoryDraft={categoryDraft}
          creatingCategory={creatingCategory}
          onSearchChange={value => store.setSearchText(value)}
          onSelectProject={() => store.selectNode({ kind: 'project' })}
          onSelectCategory={path => store.selectNode({ kind: 'category', path })}
          onSelectRequest={nextRequestId => store.selectNode({ kind: 'request', requestId: nextRequestId })}
          onSelectCase={(nextRequestId, nextCaseId) => store.selectNode({ kind: 'case', requestId: nextRequestId, caseId: nextCaseId })}
          onOpenImport={() => setImportOpened(true)}
          onCreateInterface={() => addRequestMutation.mutate()}
          onToggleCategoryDraft={() => setCreatingCategory(current => !current)}
          onCategoryDraftChange={setCategoryDraft}
          onConfirmCreateCategory={handleConfirmCreateCategory}
        />

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
          onProjectChange={project => store.updateProject(project)}
          onEnvironmentChange={name => store.setActiveEnvironment(name)}
          onEnvironmentUpdate={(name, updater) => store.updateEnvironment(name, updater)}
          onRequestChange={request => store.updateRequest(request)}
          onCasesChange={cases => store.updateCaseList(cases)}
          onCaseSelect={nextCaseId =>
            requestId
              ? store.selectNode(nextCaseId ? { kind: 'case', requestId, caseId: nextCaseId } : { kind: 'request', requestId })
              : undefined
          }
          onAddCase={() => store.addDraftCase()}
          onRun={() => runMutation.mutate()}
          onSave={() => saveMutation.mutate()}
          onSelectRequest={nextRequestId => store.selectNode({ kind: 'request', requestId: nextRequestId })}
          onOpenImport={() => setImportOpened(true)}
          onCreateInterface={() => addRequestMutation.mutate()}
        />
      </main>

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
    </div>
  );
}

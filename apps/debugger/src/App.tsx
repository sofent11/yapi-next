import { startTransition, useEffect, useMemo, useState } from 'react';
import { ActionIcon, Button, Drawer, Group, Select, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { IconFolderOpen, IconRefresh, IconUpload } from '@tabler/icons-react';
import type { WorkspaceIndex } from '@yapi-debugger/schema';
import { chooseDirectory, chooseImportFile, unwatchWorkspace, watchWorkspace } from './lib/desktop';
import {
  createRequestInWorkspace,
  createWorkspace,
  importFromFile,
  importFromUrl,
  importIntoWorkspace,
  openWorkspace,
  runResolvedRequest,
  saveEnvironment,
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

function categoryFromRecord(record?: WorkspaceIndex['requests'][number] | null) {
  return record?.folderSegments.join('/') || '';
}

function belongsToCategory(record: WorkspaceIndex['requests'][number], category: string) {
  if (category === '__overview__') return true;
  const path = categoryFromRecord(record);
  return path === category || path.startsWith(`${category}/`);
}

export function App() {
  const store = useWorkspaceStore();
  const [projectName, setProjectName] = useState('New API Workspace');
  const [importUrl, setImportUrl] = useState('');
  const [importOpened, setImportOpened] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('__overview__');

  const selectedCategoryRequests = useMemo(
    () => store.workspace?.requests.filter((record: WorkspaceIndex['requests'][number]) => belongsToCategory(record, selectedCategory)) || [],
    [store.workspace, selectedCategory]
  );

  useEffect(() => {
    store.setRecentRoots(loadRecentRoots());
  }, []);

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

  useEffect(() => {
    if (!store.workspace) return;
    const selectedRecord = store.workspace.requests.find(
      (item: WorkspaceIndex['requests'][number]) => item.request.id === store.selectedRequestId
    );
    if (selectedRecord) {
      setSelectedCategory(categoryFromRecord(selectedRecord) || '__overview__');
      return;
    }
    if (
      selectedCategory !== '__overview__' &&
      !store.workspace.requests.some((item: WorkspaceIndex['requests'][number]) => belongsToCategory(item, selectedCategory))
    ) {
      setSelectedCategory('__overview__');
    }
  }, [store.workspace, store.selectedRequestId, selectedCategory]);

  const openMutation = useMutation({
    mutationFn: async (root: string) => openWorkspace(root),
    onSuccess(workspace) {
      const preserveCategory = store.workspace?.root === workspace.root ? selectedCategory : null;
      startTransition(() => store.setWorkspace(workspace));
      setSelectedCategory(preserveCategory || categoryFromRecord(workspace.requests[0]) || '__overview__');
      const recent = [workspace.root, ...store.recentRoots.filter((item: string) => item !== workspace.root)];
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
      setSelectedCategory(categoryFromRecord(workspace.requests[0]) || '__overview__');
      const recent = [workspace.root, ...store.recentRoots.filter((item: string) => item !== workspace.root)];
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
      if (!store.workspace || !store.draftRequest || !store.selectedRequestId) {
        throw new Error('Nothing to save');
      }
      const record = store.workspace.requests.find(
        (item: WorkspaceIndex['requests'][number]) => item.request.id === store.selectedRequestId
      );
      if (!record) throw new Error('Selected interface missing');
      await saveRequestRecord(
        store.workspace.root,
        record.folderSegments,
        store.draftRequest,
        store.draftCases,
        record.resourceDirPath,
        record.requestFilePath
      );
      const environmentRecord = store.workspace.environments.find(
        (item: WorkspaceIndex['environments'][number]) => item.document.name === store.activeEnvironmentName
      );
      if (environmentRecord) {
        await saveEnvironment(store.workspace.root, environmentRecord.document);
      }
      return openWorkspace(store.workspace.root);
    },
    onSuccess(workspace) {
      startTransition(() => store.setWorkspace(workspace));
      notifications.show({ color: 'teal', message: 'Interface saved' });
    },
    onError(error) {
      notifications.show({ color: 'red', message: (error as Error).message || 'Save failed' });
    }
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace || !store.selectedRequestId) throw new Error('Select an interface first');
      return runResolvedRequest(store.workspace, store.selectedRequestId, store.selectedCaseId || undefined);
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
      notifications.show({ color: 'teal', message: 'Import applied to workspace' });
    },
    onError(error) {
      notifications.show({ color: 'red', message: (error as Error).message || 'Apply import failed' });
    }
  });

  const addRequestMutation = useMutation({
    mutationFn: async () => {
      if (!store.workspace) throw new Error('Open a workspace first');
      const folder = selectedCategory && selectedCategory !== '__overview__' ? selectedCategory.split('/').filter(Boolean) : ['default'];
      return createRequestInWorkspace(store.workspace.root, folder);
    },
    onSuccess(requestId) {
      if (!store.workspace) return;
      openWorkspace(store.workspace.root).then(workspace => {
        store.setWorkspace(workspace);
        startTransition(() => store.selectRequest(requestId));
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

  function handleSelectRequest(requestId: string) {
    const record = store.workspace?.requests.find(
      (item: WorkspaceIndex['requests'][number]) => item.request.id === requestId
    );
    setSelectedCategory(categoryFromRecord(record) || '__overview__');
    store.selectRequest(requestId);
  }

  function handleConfirmCreateCategory() {
    const seed = categoryDraft.trim();
    const nextKey =
      selectedCategory !== '__overview__' && seed && !seed.includes('/') ? `${selectedCategory}/${seed}` : seed;
    if (!nextKey) return;
    setSelectedCategory(nextKey);
    setCategoryDraft('');
    setCreatingCategory(false);
    store.selectRequest(null);
    notifications.show({ color: 'teal', message: `Category ${nextKey} is ready. Create an interface inside it.` });
  }

  const selectedEnvironment = store.workspace?.environments.find(
    (item: WorkspaceIndex['environments'][number]) => item.document.name === store.activeEnvironmentName
  )?.document;

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
    <div className="app-shell app-shell-v3">
      <header className="desktop-topbar">
        <div className="desktop-topbar-left">
          <span className="traffic traffic-red" />
          <span className="traffic traffic-yellow" />
          <span className="traffic traffic-green" />
          <span className="desktop-title">主页</span>
        </div>
        <Group>
          <Select
            value={store.activeEnvironmentName}
            data={store.workspace.environments.map((item: WorkspaceIndex['environments'][number]) => ({
              value: item.document.name,
              label: item.document.name
            }))}
            onChange={value => value && store.setActiveEnvironment(value)}
          />
          <ActionIcon variant="light" color="dark" onClick={() => openMutation.mutate(store.workspace!.root)}>
            <IconRefresh size={16} />
          </ActionIcon>
          <ActionIcon variant="light" color="dark" onClick={() => setImportOpened(true)}>
            <IconUpload size={16} />
          </ActionIcon>
          <ActionIcon variant="light" color="dark" onClick={handleOpenDirectory}>
            <IconFolderOpen size={16} />
          </ActionIcon>
        </Group>
      </header>

      <main className="workspace-shell">
        <AppRail />

        <InterfaceTreePanel
          workspace={store.workspace}
          selectedRequestId={store.selectedRequestId}
          selectedCategory={selectedCategory}
          selectedCaseId={store.selectedCaseId}
          searchText={store.searchText}
          cases={store.draftCases}
          categoryDraft={categoryDraft}
          creatingCategory={creatingCategory}
          onSearchChange={value => store.setSearchText(value)}
          onSelectRequest={handleSelectRequest}
          onSelectCategory={category => {
            setSelectedCategory(category);
            store.selectRequest(null);
          }}
          onSelectCase={caseId => store.selectRequest(store.selectedRequestId, caseId)}
          onOpenImport={() => setImportOpened(true)}
          onCreateInterface={() => addRequestMutation.mutate()}
          onToggleCategoryDraft={() => setCreatingCategory(current => !current)}
          onCategoryDraftChange={setCategoryDraft}
          onConfirmCreateCategory={handleConfirmCreateCategory}
        />

        <WorkspaceMainPanel
          workspaceName={store.workspace.project.name}
          selectedCategory={selectedCategory}
          categoryRequests={selectedCategoryRequests}
          request={store.draftRequest}
          response={store.response}
          cases={store.draftCases}
          selectedCaseId={store.selectedCaseId}
          environments={store.workspace.environments.map((item: WorkspaceIndex['environments'][number]) => item.document)}
          activeEnvironmentName={store.activeEnvironmentName}
          isRunning={runMutation.isPending}
          isDirty={store.isDirty}
          onRequestChange={request => store.updateRequest(request)}
          onCasesChange={cases => store.updateCaseList(cases)}
          onCaseSelect={caseId => store.selectRequest(store.selectedRequestId, caseId)}
          onAddCase={() => store.addDraftCase()}
          onRun={() => runMutation.mutate()}
          onSave={() => saveMutation.mutate()}
          onEnvironmentChange={name => store.setActiveEnvironment(name)}
          onSelectRequest={handleSelectRequest}
          onOpenImport={() => setImportOpened(true)}
          onCreateInterface={() => addRequestMutation.mutate()}
        />
      </main>

      {selectedEnvironment ? (
        <footer className="bottom-strip">
          <TextInput
            className="env-inline"
            label={`当前环境: ${selectedEnvironment.name}`}
            value={selectedEnvironment.vars.baseUrl || ''}
            placeholder="https://api.example.com"
            onChange={event => store.updateEnvironmentBaseUrl(selectedEnvironment.name, event.currentTarget.value)}
          />
          <Button
            variant="light"
            color="dark"
            onClick={() => {
              const environment = store.workspace!.environments.find(
                (item: WorkspaceIndex['environments'][number]) => item.document.name === store.activeEnvironmentName
              )?.document;
              if (!environment) return;
              saveEnvironment(store.workspace!.root, environment)
                .then(() => notifications.show({ color: 'teal', message: 'Environment saved' }))
                .catch(error => notifications.show({ color: 'red', message: (error as Error).message || 'Environment save failed' }));
            }}
          >
            保存环境
          </Button>
        </footer>
      ) : null}

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

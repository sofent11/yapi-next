import { useMemo } from 'react';
import { ActionIcon, Button, ScrollArea, TextInput } from '@mantine/core';
import { IconFolderPlus, IconPlus, IconSearch, IconUpload } from '@tabler/icons-react';
import type { CaseDocument, TreeNode, WorkspaceIndex } from '@yapi-debugger/schema';

function matchesCategory(path: string, selectedCategory: string) {
  return selectedCategory !== '__overview__' && (path === selectedCategory || selectedCategory.startsWith(`${path}/`));
}

function requestMatches(record: WorkspaceIndex['requests'][number] | undefined, normalized: string) {
  if (!record) return false;
  const haystack = [
    record.request.name,
    record.request.method,
    record.request.path,
    record.request.url,
    record.folderSegments.join('/'),
    ...record.cases.map(item => item.name)
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(normalized);
}

function filterTree(
  nodes: TreeNode[],
  normalized: string,
  requestMap: Map<string, WorkspaceIndex['requests'][number]>
): TreeNode[] {
  if (!normalized) return nodes;

  return nodes.reduce<TreeNode[]>((acc, node) => {
    if (node.kind === 'folder') {
      const children = filterTree(node.children, normalized, requestMap);
      if (node.name.toLowerCase().includes(normalized) || children.length > 0) {
        acc.push({ ...node, children });
      }
      return acc;
    }

    if (requestMatches(requestMap.get(node.requestId), normalized)) {
      acc.push(node);
    }
    return acc;
  }, []);
}

function renderNodes(props: {
  nodes: TreeNode[];
  requestMap: Map<string, WorkspaceIndex['requests'][number]>;
  selectedRequestId: string | null;
  selectedCategory: string;
  selectedCaseId: string | null;
  cases: CaseDocument[];
  onSelectRequest: (requestId: string) => void;
  onSelectCategory: (category: string) => void;
  onSelectCase: (caseId: string) => void;
}) {
  return props.nodes.map(node => {
    if (node.kind === 'folder') {
      const activeFolder = matchesCategory(node.path, props.selectedCategory);
      return (
        <div key={node.id} className="tree-folder-block">
          <button
            type="button"
            className={['tree-folder-row', activeFolder ? 'is-active' : ''].filter(Boolean).join(' ')}
            onClick={() => props.onSelectCategory(node.path)}
          >
            <span className="tree-folder-label">{node.name}</span>
            <span className="tree-folder-count">{node.children.length}</span>
          </button>
          <div className="tree-folder-children">
            {renderNodes({
              ...props,
              nodes: node.children
            })}
          </div>
        </div>
      );
    }

    const record = props.requestMap.get(node.requestId);
    const activeRequest = node.requestId === props.selectedRequestId;
    return (
      <div key={node.id} className="tree-request-block">
        <button
          type="button"
          className={['tree-interface-row', activeRequest ? 'is-active' : ''].filter(Boolean).join(' ')}
          onClick={() => props.onSelectRequest(node.requestId)}
        >
          <span className={`tree-interface-method method-${record?.request.method.toLowerCase() || 'get'}`}>
            {record?.request.method || 'API'}
          </span>
          <span className="tree-interface-copy">
            <span className="tree-interface-title">{record?.request.name || node.name}</span>
            <span className="tree-interface-path">{record?.request.path || record?.request.url || '/'}</span>
          </span>
          <span className="tree-interface-count">{node.caseCount}</span>
        </button>
        {activeRequest && props.cases.length > 0 ? (
          <div className="tree-case-list">
            {props.cases.map(caseItem => (
              <button
                key={caseItem.id}
                type="button"
                className={['tree-case-row', props.selectedCaseId === caseItem.id ? 'is-active' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => props.onSelectCase(caseItem.id)}
              >
                <span className="tree-case-dot" />
                <span>{caseItem.name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  });
}

export function InterfaceTreePanel(props: {
  workspace: WorkspaceIndex;
  selectedRequestId: string | null;
  selectedCategory: string;
  selectedCaseId: string | null;
  searchText: string;
  cases: CaseDocument[];
  categoryDraft: string;
  creatingCategory: boolean;
  onSearchChange: (value: string) => void;
  onSelectRequest: (requestId: string) => void;
  onSelectCategory: (category: string) => void;
  onSelectCase: (caseId: string) => void;
  onOpenImport: () => void;
  onCreateInterface: () => void;
  onToggleCategoryDraft: () => void;
  onCategoryDraftChange: (value: string) => void;
  onConfirmCreateCategory: () => void;
}) {
  const requestMap = useMemo(
    () => new Map(props.workspace.requests.map(record => [record.request.id, record])),
    [props.workspace.requests]
  );
  const normalized = props.searchText.trim().toLowerCase();
  const filteredTree = useMemo(
    () => filterTree(props.workspace.tree, normalized, requestMap),
    [props.workspace.tree, normalized, requestMap]
  );

  return (
    <section className="interface-tree-panel">
      <div className="interface-tree-header">
        <div>
          <p className="eyebrow">接口管理</p>
          <h2>{props.workspace.project.name}</h2>
        </div>
        <ActionIcon variant="subtle" color="dark" onClick={props.onToggleCategoryDraft}>
          <IconFolderPlus size={18} />
        </ActionIcon>
      </div>

      <div className="interface-tree-tools">
        <TextInput
          value={props.searchText}
          leftSection={<IconSearch size={16} />}
          placeholder="搜索接口 / 分类"
          onChange={event => props.onSearchChange(event.currentTarget.value)}
        />
        <ActionIcon variant="light" color="dark" onClick={props.onCreateInterface}>
          <IconPlus size={18} />
        </ActionIcon>
        <ActionIcon variant="light" color="dark" onClick={props.onOpenImport}>
          <IconUpload size={18} />
        </ActionIcon>
      </div>

      {props.creatingCategory ? (
        <div className="category-draft-shell">
          <input
            className="category-draft-input"
            value={props.categoryDraft}
            placeholder="新建分类"
            onChange={event => props.onCategoryDraftChange(event.currentTarget.value)}
          />
          <Button color="dark" onClick={props.onConfirmCreateCategory}>
            添加
          </Button>
        </div>
      ) : null}

      <ScrollArea className="interface-tree-scroll">
        <div className="interface-tree-content">
          <button
            type="button"
            className={['tree-overview-row', props.selectedCategory === '__overview__' ? 'is-active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => props.onSelectCategory('__overview__')}
          >
            项目概览
          </button>
          <div className="tree-section-title">接口</div>
          {renderNodes({
            nodes: filteredTree,
            requestMap,
            selectedRequestId: props.selectedRequestId,
            selectedCategory: props.selectedCategory,
            selectedCaseId: props.selectedCaseId,
            cases: props.cases,
            onSelectRequest: props.onSelectRequest,
            onSelectCategory: props.onSelectCategory,
            onSelectCase: props.onSelectCase
          })}
        </div>
      </ScrollArea>
    </section>
  );
}

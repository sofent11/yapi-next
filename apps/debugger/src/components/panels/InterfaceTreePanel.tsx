import { useMemo, useState } from 'react';
import { ActionIcon, Button, ScrollArea, Text, TextInput } from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconFolderPlus,
  IconPlus,
  IconSearch,
  IconUpload
} from '@tabler/icons-react';
import type { WorkspaceIndex, WorkspaceTreeNode } from '@yapi-debugger/schema';
import type { SelectedNode } from '../../store/workspace-store';

function nodeMatchesSearch(node: WorkspaceTreeNode, normalized: string) {
  if (!normalized) return true;
  if (node.kind === 'request') {
    return [node.name, node.method, node.requestPath].join(' ').toLowerCase().includes(normalized);
  }
  return node.name.toLowerCase().includes(normalized);
}

function filterTree(node: WorkspaceTreeNode, normalized: string): WorkspaceTreeNode | null {
  if (!normalized) return node;

  if (node.kind === 'case') {
    return nodeMatchesSearch(node, normalized) ? node : null;
  }

  const children = node.children
    .map(child => filterTree(child, normalized))
    .filter(Boolean) as WorkspaceTreeNode[];

  if (nodeMatchesSearch(node, normalized) || children.length > 0) {
    return {
      ...node,
      children
    } as WorkspaceTreeNode;
  }

  return null;
}

function requestCount(node: WorkspaceTreeNode): number {
  if (node.kind === 'request') return 1;
  if (node.kind === 'case') return 0;
  return node.children.reduce((total, child) => total + requestCount(child), 0);
}

function categoryPathFromSelection(node: SelectedNode) {
  if (node.kind === 'category') return node.path;
  return null;
}

function requestIdFromSelection(node: SelectedNode) {
  if (node.kind === 'request' || node.kind === 'case') return node.requestId;
  return null;
}

function caseIdFromSelection(node: SelectedNode) {
  return node.kind === 'case' ? node.caseId : null;
}

function rowClass(active: boolean, tone: string) {
  return ['tree-row', tone, active ? 'is-active' : ''].filter(Boolean).join(' ');
}

function renderNode(props: {
  node: WorkspaceTreeNode;
  depth?: number;
  selectedNode: SelectedNode;
  expandedRequestIds: Set<string>;
  onToggleRequest: (requestId: string) => void;
  onSelectProject: () => void;
  onSelectCategory: (path: string) => void;
  onSelectRequest: (requestId: string) => void;
  onSelectCase: (requestId: string, caseId: string) => void;
}) {
  const depth = props.depth || 0;
  const requestId = requestIdFromSelection(props.selectedNode);
  const selectedCaseId = caseIdFromSelection(props.selectedNode);
  const selectedCategory = categoryPathFromSelection(props.selectedNode);

  if (props.node.kind === 'project') {
    const active = props.selectedNode.kind === 'project';
    return (
      <div key={props.node.id} className="tree-branch">
        <button type="button" className={rowClass(active, 'tree-row-project')} onClick={props.onSelectProject}>
          <span className="tree-row-copy">
            <strong>{props.node.name}</strong>
            <span>{requestCount(props.node)} 个接口</span>
          </span>
        </button>
        <div className="tree-children">
          {props.node.children.map(child =>
            renderNode({
              ...props,
              node: child,
              depth: depth + 1
            })
          )}
        </div>
      </div>
    );
  }

  if (props.node.kind === 'category') {
    const node = props.node;
    const active = selectedCategory === node.path;
    return (
      <div key={node.id} className="tree-branch">
        <button
          type="button"
          className={rowClass(active, 'tree-row-category')}
          style={{ paddingLeft: `${16 + depth * 16}px` }}
          onClick={() => props.onSelectCategory(node.path)}
        >
          <span className="tree-row-copy">
            <strong>{node.name}</strong>
            <span>{requestCount(node)} 个接口</span>
          </span>
        </button>
        <div className="tree-children">
          {node.children.map(child =>
            renderNode({
              ...props,
              node: child,
              depth: depth + 1
            })
          )}
        </div>
      </div>
    );
  }

  if (props.node.kind === 'request') {
    const node = props.node;
    const active = requestId === node.requestId;
    const expanded = active || props.expandedRequestIds.has(node.requestId);
    return (
      <div key={node.id} className="tree-branch">
        <div className={rowClass(active, 'tree-row-request')} style={{ paddingLeft: `${16 + depth * 16}px` }}>
          <button
            type="button"
            className="tree-expand-button"
            onClick={() => props.onToggleRequest(node.requestId)}
            aria-label={expanded ? '折叠用例' : '展开用例'}
          >
            {expanded ? <IconChevronDown size={15} /> : <IconChevronRight size={15} />}
          </button>
          <button type="button" className="tree-row-main" onClick={() => props.onSelectRequest(node.requestId)}>
            <span className={`tree-method-pill method-${node.method.toLowerCase()}`}>{node.method}</span>
            <span className="tree-row-copy">
              <strong>{node.name}</strong>
              <span>{node.requestPath}</span>
            </span>
            <span className="tree-count-badge">{node.caseCount}</span>
          </button>
        </div>
        {expanded && node.children.length > 0 ? (
          <div className="tree-children">
            {node.children.map(child =>
              renderNode({
                ...props,
                node: child,
                depth: depth + 1
              })
            )}
          </div>
        ) : null}
      </div>
    );
  }

  const node = props.node;
  const active = requestId === node.requestId && selectedCaseId === node.caseId;
  return (
    <button
      key={node.id}
      type="button"
      className={rowClass(active, 'tree-row-case')}
      style={{ paddingLeft: `${28 + depth * 16}px` }}
      onClick={() => props.onSelectCase(node.requestId, node.caseId)}
    >
      <span className="tree-case-dot" />
      <span className="tree-row-copy">
        <strong>{node.name}</strong>
        <span>用例</span>
      </span>
    </button>
  );
}

export function InterfaceTreePanel(props: {
  workspace: WorkspaceIndex;
  selectedNode: SelectedNode;
  searchText: string;
  categoryDraft: string;
  creatingCategory: boolean;
  onSearchChange: (value: string) => void;
  onSelectProject: () => void;
  onSelectCategory: (category: string) => void;
  onSelectRequest: (requestId: string) => void;
  onSelectCase: (requestId: string, caseId: string) => void;
  onOpenImport: () => void;
  onCreateInterface: () => void;
  onToggleCategoryDraft: () => void;
  onCategoryDraftChange: (value: string) => void;
  onConfirmCreateCategory: () => void;
}) {
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<string>>(new Set());
  const normalized = props.searchText.trim().toLowerCase();
  const rootNode = props.workspace.tree[0];

  const filteredRoot = useMemo(() => {
    if (!rootNode) return null;
    return filterTree(rootNode, normalized);
  }, [rootNode, normalized]);

  function toggleRequest(requestId: string) {
    setExpandedRequestIds(current => {
      const next = new Set(current);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  }

  return (
    <section className="interface-tree-panel">
      <div className="interface-tree-header">
        <div>
          <p className="eyebrow">Workspace Tree</p>
          <h2>{props.workspace.project.name}</h2>
          <Text c="dimmed" size="sm">
            项目 / 分类 / 接口 / 用例
          </Text>
        </div>
      </div>

      <div className="interface-tree-tools">
        <TextInput
          value={props.searchText}
          leftSection={<IconSearch size={16} />}
          placeholder="搜索分类、接口、用例"
          onChange={event => props.onSearchChange(event.currentTarget.value)}
        />
        <ActionIcon variant="light" color="dark" onClick={props.onToggleCategoryDraft}>
          <IconFolderPlus size={18} />
        </ActionIcon>
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
        <div className="tree-root-shell">
          {filteredRoot ? (
            renderNode({
              node: filteredRoot,
              selectedNode: props.selectedNode,
              expandedRequestIds,
              onToggleRequest: toggleRequest,
              onSelectProject: props.onSelectProject,
              onSelectCategory: props.onSelectCategory,
              onSelectRequest: props.onSelectRequest,
              onSelectCase: props.onSelectCase
            })
          ) : (
            <div className="tree-empty-state">
              <Text fw={700}>没有匹配结果</Text>
              <Text c="dimmed" size="sm">
                试试搜索分类名、接口名、HTTP Method 或用例名。
              </Text>
            </div>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}

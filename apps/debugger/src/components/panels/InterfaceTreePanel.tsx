import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ResourceContextMenu, type ResourceContextMenuItem } from '../primitives/ResourceContextMenu';

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

function caseCount(node: WorkspaceTreeNode): number {
  if (node.kind === 'case') return 1;
  return node.children.reduce((total, child) => total + caseCount(child), 0);
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

function highlightText(value: string, normalized: string) {
  if (!normalized) return value;
  const index = value.toLowerCase().indexOf(normalized);
  if (index === -1) return value;

  return (
    <>
      {value.slice(0, index)}
      <mark className="tree-highlight">{value.slice(index, index + normalized.length)}</mark>
      {value.slice(index + normalized.length)}
    </>
  );
}

function contextLabel(selectedNode: SelectedNode) {
  if (selectedNode.kind === 'project') return '项目操作';
  if (selectedNode.kind === 'category') return '分类操作';
  if (selectedNode.kind === 'request') return '接口操作';
  return '用例上下文';
}

function renderNode(props: {
  node: WorkspaceTreeNode;
  depth?: number;
  normalized: string;
  selectedNode: SelectedNode;
  expandedRequestIds: Set<string>;
  onToggleRequest: (requestId: string) => void;
  onSelectProject: () => void;
  onSelectCategory: (path: string) => void;
  onSelectRequest: (requestId: string) => void;
  onSelectCase: (requestId: string, caseId: string) => void;
  onContextMenu: (event: React.MouseEvent, node: WorkspaceTreeNode) => void;
}) {
  const depth = props.depth || 0;
  const requestId = requestIdFromSelection(props.selectedNode);
  const selectedCaseId = caseIdFromSelection(props.selectedNode);
  const selectedCategory = categoryPathFromSelection(props.selectedNode);

  if (props.node.kind === 'project') {
    const active = props.selectedNode.kind === 'project';
    return (
      <div key={props.node.id} className="tree-branch">
        <button
          type="button"
          className={rowClass(active, 'tree-row-project')}
          onClick={props.onSelectProject}
          onContextMenu={e => props.onContextMenu(e, props.node)}
        >
          <span className="tree-row-copy">
            <strong>{highlightText(props.node.name, props.normalized)}</strong>
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
          style={{ paddingLeft: `${12 + depth * 12}px` }}
          onClick={() => props.onSelectCategory(node.path)}
          onContextMenu={e => props.onContextMenu(e, node)}
        >
          <IconChevronRight size={14} style={{ opacity: 0.5 }} />
          <span className="tree-row-copy">
            <strong>{highlightText(node.name, props.normalized)}</strong>
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
    const active = requestId === node.requestId && !selectedCaseId;
    const expanded = props.expandedRequestIds.has(node.requestId);
    return (
      <div key={node.id} className="tree-branch">
        <div
          className={rowClass(active, 'tree-row-request')}
          style={{ paddingLeft: `${4 + depth * 12}px` }}
          onContextMenu={e => props.onContextMenu(e, node)}
        >
          <button
            type="button"
            className="tree-expand-button"
            onClick={(e) => {
              e.stopPropagation();
              props.onToggleRequest(node.requestId);
            }}
          >
            {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </button>
          <button type="button" className="tree-row-main" onClick={() => props.onSelectRequest(node.requestId)}>
            <span className={`tree-method-pill method-${node.method.toLowerCase()}`}>{node.method}</span>
            <span className="tree-row-copy">
              <strong>{highlightText(node.name, props.normalized)}</strong>
            </span>
            {node.caseCount > 0 && <span className="tree-count-badge">{node.caseCount}</span>}
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
      style={{ paddingLeft: `${20 + depth * 12}px` }}
      onClick={() => props.onSelectCase(node.requestId, node.caseId)}
      onContextMenu={e => props.onContextMenu(e, node)}
    >
      <span className="tree-case-dot" />
      <span className="tree-row-copy">
        <strong>{highlightText(node.name, props.normalized)}</strong>
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
  expandedRequestIds: string[];
  onSearchChange: (value: string) => void;
  onSelectProject: () => void;
  onSelectCategory: (category: string) => void;
  onSelectRequest: (requestId: string) => void;
  onSelectCase: (requestId: string, caseId: string) => void;
  onOpenImport: () => void;
  onCreateInterface: () => void;
  onAddCase: () => void;
  onToggleCategoryDraft: () => void;
  onCategoryDraftChange: (value: string) => void;
  onConfirmCreateCategory: () => void;
  onToggleRequest: (requestId: string) => void;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: WorkspaceTreeNode } | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const normalized = props.searchText.trim().toLowerCase();
  const rootNode = props.workspace.tree[0];
  const expandedRequestIds = useMemo(() => new Set(props.expandedRequestIds), [props.expandedRequestIds]);

  const filteredRoot = useMemo(() => {
    if (!rootNode) return null;
    return filterTree(rootNode, normalized);
  }, [rootNode, normalized]);

  useEffect(() => {
    function focusSearch() {
      searchRef.current?.focus();
      searchRef.current?.select();
    }

    window.addEventListener('debugger://focus-search', focusSearch as EventListener);
    return () => window.removeEventListener('debugger://focus-search', focusSearch as EventListener);
  }, []);

  const contextMenuItems: ResourceContextMenuItem[] = useMemo(() => {
    if (!contextMenu) return [];
    const { node } = contextMenu;

    if (node.kind === 'project') {
      return [
        {
          key: 'import',
          label: '导入到项目',
          onClick: props.onOpenImport
        },
        {
          key: 'new-cat',
          label: '新建分类',
          onClick: props.onToggleCategoryDraft
        }
      ];
    }

    if (node.kind === 'category') {
      return [
        {
          key: 'new-interface',
          label: '新建接口',
          onClick: () => {
            props.onSelectCategory(node.path);
            props.onCreateInterface();
          }
        }
      ];
    }

    if (node.kind === 'request' || node.kind === 'case') {
      return [
        {
          key: 'new-case',
          label: '新建用例',
          onClick: () => {
            if (node.kind === 'request') {
              props.onSelectRequest(node.requestId);
            } else {
              props.onSelectCase(node.requestId, node.caseId);
            }
            props.onAddCase();
          }
        }
      ];
    }

    return [];
  }, [contextMenu, props]);

  return (
    <section
      className="tree-panel"
      onMouseDown={event => {
        if (event.button === 2) {
          event.preventDefault();
        }
      }}
      onContextMenu={event => {
        event.preventDefault();
      }}
    >
      <div className="tree-panel-header">
        <div>
          <p className="tree-caption">Workspace Explorer</p>
          <h2 className="tree-title">{props.workspace.project.name}</h2>
        </div>
        <Text c="dimmed" size="xs">
          项目 / 分类 / 接口 / 用例
        </Text>
      </div>

      <TextInput
        ref={searchRef}
        value={props.searchText}
        leftSection={<IconSearch size={14} />}
        placeholder="搜索接口、路径、用例"
        size="xs"
        onChange={event => props.onSearchChange(event.currentTarget.value)}
      />

      <div className="tree-contextbar">
        <div className="tree-context-copy">
          <span className="tree-context-label">{contextLabel(props.selectedNode)}</span>
          <strong>
            {props.selectedNode.kind === 'project'
              ? '当前项目'
              : props.selectedNode.kind === 'category'
                ? props.selectedNode.path
                : props.selectedNode.kind === 'request'
                  ? '当前接口'
                  : '当前用例'}
          </strong>
        </div>
        <div className="tree-context-actions">
          {props.selectedNode.kind === 'project' ? (
            <>
              <ActionIcon variant="subtle" color="dark" onClick={props.onOpenImport} aria-label="导入到项目">
                <IconUpload size={16} />
              </ActionIcon>
              <ActionIcon variant="subtle" color="dark" onClick={props.onToggleCategoryDraft} aria-label="新建分类">
                <IconFolderPlus size={16} />
              </ActionIcon>
            </>
          ) : null}

          {props.selectedNode.kind === 'category' ? (
            <ActionIcon variant="subtle" color="dark" onClick={props.onCreateInterface} aria-label="新建接口">
              <IconPlus size={16} />
            </ActionIcon>
          ) : null}

          {(props.selectedNode.kind === 'request' || props.selectedNode.kind === 'case') ? (
            <ActionIcon variant="subtle" color="dark" onClick={props.onAddCase} aria-label="新建用例">
              <IconPlus size={16} />
            </ActionIcon>
          ) : null}
        </div>
      </div>

      {props.creatingCategory ? (
        <div className="category-draft-shell">
          <input
            className="category-draft-input"
            value={props.categoryDraft}
            placeholder="输入分类路径"
            onChange={event => props.onCategoryDraftChange(event.currentTarget.value)}
          />
          <Button size="xs" color="dark" onClick={props.onConfirmCreateCategory}>
            添加
          </Button>
        </div>
      ) : null}

      <ScrollArea className="tree-scroll" offsetScrollbars="y" scrollbarSize={8}>
        <div className="tree-root-shell">
          {filteredRoot ? (
            renderNode({
              node: filteredRoot,
              normalized,
              selectedNode: props.selectedNode,
              expandedRequestIds,
              onToggleRequest: props.onToggleRequest,
              onSelectProject: props.onSelectProject,
              onSelectCategory: props.onSelectCategory,
              onSelectRequest: props.onSelectRequest,
              onSelectCase: props.onSelectCase,
              onContextMenu: (event, node) => {
                event.preventDefault();
                event.stopPropagation();
                setContextMenu({ x: event.clientX, y: event.clientY, node });
              }
            })
          ) : (
            <div className="tree-empty-state">
              <Text fw={600}>没有匹配结果</Text>
              <Text c="dimmed" size="xs">
                试试接口名、Method、路径或用例名。
              </Text>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="tree-panel-footer">
        <span>{rootNode ? requestCount(rootNode) : 0} 个接口</span>
        <span>{rootNode ? caseCount(rootNode) : 0} 个用例</span>
      </div>

      <ResourceContextMenu
        opened={contextMenu !== null}
        x={contextMenu?.x || 0}
        y={contextMenu?.y || 0}
        items={contextMenuItems}
        onClose={() => setContextMenu(null)}
      />
    </section>
  );
}

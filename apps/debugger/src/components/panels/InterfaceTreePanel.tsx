import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Badge, Button, ScrollArea, Text, TextInput } from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconFolderPlus,
  IconPlus,
  IconSearch,
  IconUpload,
  IconCheck,
  IconX
} from '@tabler/icons-react';
import type { WorkspaceIndex, WorkspaceTreeNode } from '@yapi-debugger/schema';
import type { SelectedNode } from '../../store/workspace-store';
import { ResourceContextMenu, type ResourceContextMenuItem } from '../primitives/ResourceContextMenu';
import type { GitStatusPayload } from '../../lib/desktop';

function nodeMatchesSearch(node: WorkspaceTreeNode, normalized: string) {
  if (!normalized) return true;
  if (node.kind === 'request') {
    return [node.name, node.method, node.requestPath].join(' ').toLowerCase().includes(normalized);
  }
  return node.name.toLowerCase().includes(normalized);
}

function getNodeGitStatus(node: WorkspaceTreeNode, workspace: WorkspaceIndex, gitStatus: GitStatusPayload | null) {
  if (!gitStatus || !gitStatus.dirty) return null;
  const changedFiles = gitStatus.changedFiles;

  if (node.kind === 'request') {
    const record = workspace.requests.find(r => r.request.id === node.requestId);
    if (!record) return null;
    const isDirty = changedFiles.some(f => f === record.requestFilePath || f.startsWith(record.resourceDirPath));
    return isDirty ? 'M' : null;
  }

  if (node.kind === 'category') {
    const prefix = `requests/${node.path}/`;
    const isDirty = changedFiles.some(f => f.startsWith(prefix));
    return isDirty ? 'M' : null;
  }

  if (node.kind === 'project') {
    return gitStatus.dirty ? 'M' : null;
  }

  return null;
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

function InlineRenameInput(props: {
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="tree-rename-shell" onClick={e => e.stopPropagation()}>
      <input
        className="tree-rename-input"
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            props.onConfirm();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            props.onCancel();
          }
        }}
        onBlur={props.onConfirm}
        autoFocus
        onFocus={e => e.target.select()}
      />
    </div>
  );
}

function renderNode(props: {
  node: WorkspaceTreeNode;
  depth?: number;
  normalized: string;
  selectedNode: SelectedNode;
  expandedRequestIds: Set<string>;
  renamingId: string | null;
  renamingValue: string;
  workspace: WorkspaceIndex;
  gitStatus: GitStatusPayload | null;
  setRenamingValue: (val: string) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onToggleRequest: (requestId: string) => void;
  onSelectProject: () => void;
  onSelectCategory: (path: string) => void;
  onSelectRequest: (requestId: string) => void;
  onSelectCase: (requestId: string, caseId: string) => void;
  onContextMenu: (event: React.MouseEvent, node: WorkspaceTreeNode) => void;
  onMoveRequest: (requestId: string, targetCategoryPath: string | null) => void;
  onMoveCategory: (sourcePath: string, targetParentPath: string | null) => void;
}) {
  const depth = props.depth || 0;
  const requestId = requestIdFromSelection(props.selectedNode);
  const selectedCaseId = caseIdFromSelection(props.selectedNode);
  const selectedCategory = categoryPathFromSelection(props.selectedNode);
  const isRenaming = props.renamingId === props.node.id;
  const gitMark = getNodeGitStatus(props.node, props.workspace, props.gitStatus);

  const handleDragStart = (e: React.DragEvent) => {
    if (props.node.kind === 'request') {
      e.dataTransfer.setData('yapi/request-id', props.node.requestId);
    } else if (props.node.kind === 'category') {
      e.dataTransfer.setData('yapi/category-path', props.node.path);
    }
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (props.node.kind === 'category' || props.node.kind === 'project') {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const requestId = e.dataTransfer.getData('yapi/request-id');
    const categoryPath = e.dataTransfer.getData('yapi/category-path');
    const targetPath = props.node.kind === 'category' ? props.node.path : null;

    if (requestId) {
      props.onMoveRequest(requestId, targetPath);
    } else if (categoryPath && categoryPath !== targetPath) {
      props.onMoveCategory(categoryPath, targetPath);
    }
  };

  if (props.node.kind === 'project') {
    const active = props.selectedNode.kind === 'project';
    return (
      <div 
        key={props.node.id} 
        className="tree-branch"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <button
          type="button"
          className={rowClass(active, 'tree-row-project')}
          onClick={props.onSelectProject}
          onContextMenu={e => props.onContextMenu(e, props.node)}
        >
          <span className="tree-row-copy">
            <strong>{highlightText(props.node.name, props.normalized)}</strong>
            {gitMark && <span className="git-mark">{gitMark}</span>}
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
      <div 
        key={node.id} 
        className="tree-branch"
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <button
          type="button"
          className={rowClass(active, 'tree-row-category')}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
          onClick={() => props.onSelectCategory(node.path)}
          onContextMenu={e => props.onContextMenu(e, node)}
        >
          <IconChevronRight size={14} style={{ opacity: 0.5 }} />
          <span className="tree-row-copy">
            {isRenaming ? (
              <InlineRenameInput
                value={props.renamingValue}
                onChange={props.setRenamingValue}
                onConfirm={props.onConfirmRename}
                onCancel={props.onCancelRename}
              />
            ) : (
              <strong>{highlightText(node.name, props.normalized)}</strong>
            )}
            {gitMark && <span className="git-mark">{gitMark}</span>}
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
      <div 
        key={node.id} 
        className="tree-branch"
        draggable
        onDragStart={handleDragStart}
      >
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
              {isRenaming ? (
                <InlineRenameInput
                  value={props.renamingValue}
                  onChange={props.setRenamingValue}
                  onConfirm={props.onConfirmRename}
                  onCancel={props.onCancelRename}
                />
              ) : (
                <strong>{highlightText(node.name, props.normalized)}</strong>
              )}
              {gitMark && <span className="git-mark">{gitMark}</span>}
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
        {isRenaming ? (
          <InlineRenameInput
            value={props.renamingValue}
            onChange={props.setRenamingValue}
            onConfirm={props.onConfirmRename}
            onCancel={props.onCancelRename}
          />
        ) : (
          <strong>{highlightText(node.name, props.normalized)}</strong>
        )}
        {gitMark && <span className="git-mark">{gitMark}</span>}
      </span>
    </button>
  );
}

const selectedCategoryPath = (node: SelectedNode) => (node.kind === 'category' ? node.path : null);

export function InterfaceTreePanel(props: {
  workspace: WorkspaceIndex;
  selectedNode: SelectedNode;
  gitStatus: GitStatusPayload | null;
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
  onCreateInterface: (categoryPath?: string | null) => void;
  onAddCase: (requestId?: string) => void;
  onRenameCategory: (path: string, nextName: string) => void;
  onDeleteCategory: (path: string) => void;
  onRenameRequest: (requestId: string, nextName: string) => void;
  onDuplicateRequest: (requestId: string) => void;
  onDeleteRequest: (requestId: string) => void;
  onRenameCase: (requestId: string, caseId: string, nextName: string) => void;
  onDuplicateCase: (requestId: string, caseId: string) => void;
  onDeleteCase: (requestId: string, caseId: string) => void;
  onToggleCategoryDraft: () => void;
  onCategoryDraftChange: (value: string) => void;
  onConfirmCreateCategory: () => void;
  onToggleRequest: (requestId: string) => void;
  onMoveRequest: (requestId: string, targetCategoryPath: string | null) => void;
  onMoveCategory: (sourcePath: string, targetParentPath: string | null) => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [renamingOriginalValue, setRenamingOriginalValue] = useState('');
  const [renamingTarget, setRenamingTarget] = useState<WorkspaceTreeNode | null>(null);
  
  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; target: { kind: 'blank' } }
    | { x: number; y: number; target: { kind: 'node'; node: WorkspaceTreeNode } }
    | null
  >(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const normalized = props.searchText.trim().toLowerCase();
  const rootNode = props.workspace.tree[0];
  const expandedRequestIds = useMemo(() => new Set(props.expandedRequestIds), [props.expandedRequestIds]);
  const selectedCategoryNodePath = selectedCategoryPath(props.selectedNode);

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

  const handleConfirmRename = () => {
    if (!renamingId || !renamingTarget) return;

    const nextName = renamingValue.trim();
    if (nextName && nextName !== renamingOriginalValue) {
      if (renamingTarget.kind === 'category') props.onRenameCategory(renamingTarget.path, nextName);
      if (renamingTarget.kind === 'request') props.onRenameRequest(renamingTarget.requestId, nextName);
      if (renamingTarget.kind === 'case') props.onRenameCase(renamingTarget.requestId, renamingTarget.caseId, nextName);
    }
    setRenamingId(null);
    setRenamingTarget(null);
  };

  const contextMenuItems: ResourceContextMenuItem[] = useMemo(() => {
    if (!contextMenu) return [];
    const target = contextMenu.target.kind === 'blank' ? null : contextMenu.target.node;

    if (!target || target.kind === 'project') {
      return [
        {
          key: 'new-cat',
          label: 'Add Category',
          onClick: props.onToggleCategoryDraft
        },
        {
          key: 'new-interface',
          label: 'Add Request',
          onClick: () => props.onCreateInterface(null)
        }
      ];
    }

    const startRenaming = () => {
      setRenamingId(target.id);
      setRenamingTarget(target);
      setRenamingValue(target.name);
      setRenamingOriginalValue(target.name);
    };

    if (target.kind === 'category') {
      return [
        {
          key: 'new-interface',
          label: 'Add Request',
          onClick: () => {
            props.onSelectCategory(target.path);
            props.onCreateInterface(target.path);
          }
        },
        {
          key: 'rename-category',
          label: 'Rename Category',
          onClick: startRenaming
        },
        {
          key: 'delete-category',
          label: 'Delete Category',
          danger: true,
          onClick: () => props.onDeleteCategory(target.path)
        }
      ];
    }

    if (target.kind === 'request') {
      return [
        {
          key: 'new-case',
          label: 'Add Case',
          onClick: () => {
            props.onSelectRequest(target.requestId);
            props.onAddCase(target.requestId);
          }
        },
        {
          key: 'rename-request',
          label: 'Rename Request',
          onClick: startRenaming
        },
        {
          key: 'duplicate-request',
          label: 'Duplicate Request',
          onClick: () => props.onDuplicateRequest(target.requestId)
        },
        {
          key: 'delete-request',
          label: 'Delete Request',
          danger: true,
          onClick: () => props.onDeleteRequest(target.requestId)
        }
      ];
    }

    if (target.kind === 'case') {
      return [
        {
          key: 'rename-case',
          label: 'Rename Case',
          onClick: startRenaming
        },
        {
          key: 'duplicate-case',
          label: 'Duplicate Case',
          onClick: () => props.onDuplicateCase(target.requestId, target.caseId)
        },
        {
          key: 'delete-case',
          label: 'Delete Case',
          danger: true,
          onClick: () => props.onDeleteCase(target.requestId, target.caseId)
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
        <div className="tree-panel-actions">
          {props.selectedNode.kind === 'project' ? (
            <>
              <ActionIcon variant="subtle" color="dark" onClick={props.onOpenImport} aria-label="Import to project">
                <IconUpload size={16} />
              </ActionIcon>
              <ActionIcon variant="subtle" color="dark" onClick={props.onToggleCategoryDraft} aria-label="New category">
                <IconFolderPlus size={16} />
              </ActionIcon>
            </>
          ) : null}

          {props.selectedNode.kind === 'category' ? (
            <ActionIcon
              variant="subtle"
              color="dark"
              onClick={() => props.onCreateInterface(selectedCategoryNodePath)}
              aria-label="New request"
            >
              <IconPlus size={16} />
            </ActionIcon>
          ) : null}

          {(props.selectedNode.kind === 'request' || props.selectedNode.kind === 'case') ? (
            <ActionIcon
              variant="subtle"
              color="dark"
              onClick={() => props.onAddCase(requestIdFromSelection(props.selectedNode) || undefined)}
              aria-label="New case"
            >
              <IconPlus size={16} />
            </ActionIcon>
          ) : null}
        </div>
      </div>

      <div className="tree-panel-search">
        <TextInput
          size="xs"
          placeholder="Search requests, paths, cases..."
          leftSection={<IconSearch size={14} />}
          value={props.searchText}
          onChange={event => props.onSearchChange(event.currentTarget.value)}
        />
      </div>

      <ScrollArea className="tree-scroll" offsetScrollbars="y" scrollbarSize={8}>
        <div
          className="tree-root-shell"
          onContextMenu={event => {
            if (event.target !== event.currentTarget) return;
            event.preventDefault();
            event.stopPropagation();
            setContextMenu({ x: event.clientX, y: event.clientY, target: { kind: 'blank' } });
          }}
        >
          <div className="tree-section-header">
            <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase' }}>
              Structure
            </Text>
            <Badge variant="light" size="xs" color="gray">
              {props.selectedNode.kind.toUpperCase()}
            </Badge>
          </div>

          {props.creatingCategory ? (
            <div className="tree-draft-row" style={{ padding: '4px 12px', display: 'flex', gap: 8 }}>
              <TextInput
                size="xs"
                style={{ flex: 1 }}
                placeholder="Category path"
                value={props.categoryDraft}
                onChange={event => props.onCategoryDraftChange(event.currentTarget.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') props.onConfirmCreateCategory();
                  if (event.key === 'Escape') props.onToggleCategoryDraft();
                }}
                autoFocus
              />
              <Button size="xs" color="dark" onClick={props.onConfirmCreateCategory}>
                Add
              </Button>
            </div>
          ) : null}

          {filteredRoot ? (
            renderNode({
              node: filteredRoot,
              normalized,
              selectedNode: props.selectedNode,
              expandedRequestIds,
              renamingId,
              renamingValue,
              workspace: props.workspace,
              gitStatus: props.gitStatus,
              setRenamingValue,
              onConfirmRename: handleConfirmRename,
              onCancelRename: () => {
                setRenamingId(null);
                setRenamingTarget(null);
              },
              onToggleRequest: props.onToggleRequest,
              onSelectProject: props.onSelectProject,
              onSelectCategory: props.onSelectCategory,
              onSelectRequest: props.onSelectRequest,
              onSelectCase: props.onSelectCase,
              onMoveRequest: props.onMoveRequest,
              onMoveCategory: props.onMoveCategory,
              onContextMenu: (event, node) => {
                event.preventDefault();
                event.stopPropagation();
                setContextMenu({ x: event.clientX, y: event.clientY, target: { kind: 'node', node } });
              }
            })
          ) : (
            <div className="tree-empty-state" style={{ padding: '20px', textAlign: 'center' }}>
              <Text fw={600} size="sm">No matches found</Text>
              <Text c="dimmed" size="xs">
                Try searching by name, method, or path.
              </Text>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="tree-panel-footer">
        <span>{rootNode ? requestCount(rootNode) : 0} requests</span>
        <span>{rootNode ? caseCount(rootNode) : 0} cases</span>
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

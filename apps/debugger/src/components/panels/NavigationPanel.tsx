import { ScrollArea, Text, TextInput } from '@mantine/core';
import { useDeferredValue } from 'react';
import type { TreeNode, WorkspaceIndex } from '@yapi-debugger/schema';

function renderTree(
  nodes: TreeNode[],
  selectedRequestId: string | null,
  onSelect: (requestId: string) => void
): React.ReactNode {
  return nodes.map(node => {
    if (node.kind === 'folder') {
      return (
        <div key={node.id} className="tree-folder">
          <div className="tree-folder-title">{node.name}</div>
          <div className="tree-folder-children">{renderTree(node.children, selectedRequestId, onSelect)}</div>
        </div>
      );
    }

    return (
      <button
        key={node.id}
        className={['tree-request', node.requestId === selectedRequestId ? 'is-selected' : ''].filter(Boolean).join(' ')}
        onClick={() => onSelect(node.requestId)}
      >
        <span>{node.name}</span>
        <span className="tree-request-count">{node.caseCount}</span>
      </button>
    );
  });
}

export function NavigationPanel(props: {
  workspace: WorkspaceIndex;
  selectedRequestId: string | null;
  searchText: string;
  onSearchChange: (value: string) => void;
  onSelect: (requestId: string) => void;
}) {
  const deferredSearch = useDeferredValue(props.searchText);
  const filteredTree =
    deferredSearch.trim()
      ? props.workspace.tree.filter((node: TreeNode) => JSON.stringify(node).toLowerCase().includes(deferredSearch.toLowerCase()))
      : props.workspace.tree;

  return (
    <aside className="nav-panel">
      <div className="nav-panel-head">
        <Text fw={700}>{props.workspace.project.name}</Text>
        <Text c="dimmed" size="sm">
          {props.workspace.requests.length} requests
        </Text>
      </div>
      <TextInput
        value={props.searchText}
        placeholder="Search request or folder"
        onChange={event => props.onSearchChange(event.currentTarget.value)}
      />
      <ScrollArea className="nav-scroll">
        <div className="tree-root">{renderTree(filteredTree, props.selectedRequestId, props.onSelect)}</div>
      </ScrollArea>
    </aside>
  );
}

import { ActionIcon, Group, ScrollArea, Text } from '@mantine/core';
import { IconApi, IconBox, IconChevronRight, IconDatabase, IconX, IconPackage } from '@tabler/icons-react';
import type { WorkspaceIndex } from '@yapi-debugger/schema';
import { nodeToId, type SelectedNode } from '../../store/workspace-store';

function NodeIcon(props: { kind: SelectedNode['kind']; size?: number }) {
  const size = props.size || 14;
  switch (props.kind) {
    case 'project':
      return <IconPackage size={size} />;
    case 'category':
      return <IconBox size={size} />;
    case 'request':
      return <IconApi size={size} />;
    case 'case':
      return <IconDatabase size={size} />;
  }
}

function getNodeLabel(node: SelectedNode, workspace: WorkspaceIndex | null): string {
  if (!workspace) return 'Loading...';
  
  switch (node.kind) {
    case 'project':
      return workspace.project.name;
    case 'category':
      return node.path.split('/').at(-1) || node.path;
    case 'request': {
      const record = workspace.requests.find(r => r.request.id === node.requestId);
      return record?.request.name || 'Unknown Request';
    }
    case 'case': {
      const record = workspace.requests.find(r => r.request.id === node.requestId);
      const c = record?.cases.find(item => item.id === node.caseId);
      return c?.name || 'Unknown Case';
    }
  }
}

export function TabHeader(props: {
  workspace: WorkspaceIndex | null;
  tabs: SelectedNode[];
  activeNode: SelectedNode;
  onSelect: (node: SelectedNode) => void;
  onClose: (node: SelectedNode) => void;
}) {
  const activeId = nodeToId(props.activeNode);

  return (
    <div className="tab-header-container">
      <ScrollArea scrollbarSize={4} offsetScrollbars="x" type="hover">
        <div className="tab-list">
          {props.tabs.map(node => {
            const id = nodeToId(node);
            const active = id === activeId;
            return (
              <div
                key={id}
                className={`tab-item ${active ? 'is-active' : ''}`}
                onClick={() => props.onSelect(node)}
              >
                <span className="tab-icon">
                  <NodeIcon kind={node.kind} />
                </span>
                <Text size="xs" className="tab-label" truncate>
                  {getNodeLabel(node, props.workspace)}
                </Text>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="xs"
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onClose(node);
                  }}
                >
                  <IconX size={10} />
                </ActionIcon>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

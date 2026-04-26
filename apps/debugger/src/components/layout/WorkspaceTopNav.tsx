import { ActionIcon, Badge, Menu, Select, Text } from '@mantine/core';
import {
  IconChevronLeft,
  IconChevronRight,
  IconDotsVertical,
  IconGitBranch,
  IconRefresh,
  IconRosetteDiscountCheck,
  IconSettings
} from '@tabler/icons-react';
import type { WorkspaceIndex } from '@yapi-debugger/schema';
import type { GitStatusPayload } from '../../lib/desktop';
import type { SelectedNode } from '../../store/workspace-store';

function nodeLabel(node: SelectedNode, workspace: WorkspaceIndex): string {
  if (node.kind === 'project') return 'Project';
  if (node.kind === 'category') return node.path.split('/').at(-1) || node.path;
  if (node.kind === 'request') {
    const record = workspace.requests.find(item => item.request.id === node.requestId);
    return record?.request.name || 'Request';
  }
  const record = workspace.requests.find(item => item.request.id === node.requestId);
  const targetCase = record?.cases.find(item => item.id === node.caseId);
  return targetCase?.name || 'Case';
}

export function WorkspaceTopNav(props: {
  workspace: WorkspaceIndex;
  selectedNode: SelectedNode;
  activeEnvironmentName: string;
  environments: Array<{ value: string; label: string }>;
  importTaskCount: number;
  showImportTaskBadge: boolean;
  importTasksActive: boolean;
  isRunning: boolean;
  gitStatus: GitStatusPayload | null;
  isMacOS: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onOpenImportTasks: () => void;
  onChangeEnvironment: (name: string) => void;
  onRefreshWorkspace: () => void;
}) {
  const activeNodeLabel = nodeLabel(props.selectedNode, props.workspace);
  const importTaskBadge =
    props.showImportTaskBadge && props.importTaskCount > 0 ? (
      <Badge
        variant="light"
        color={props.importTasksActive ? 'orange' : 'gray'}
        size="sm"
        className="workspace-topnav-pill workspace-topnav-optional"
        onClick={props.onOpenImportTasks}
      >
        Import Tasks · {props.importTaskCount}
      </Badge>
    ) : null;

  return (
    <header className={`workspace-topnav${props.isMacOS ? ' is-macos' : ''}`}>
      <div className="workspace-topnav-left" data-topnav-no-drag>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="md"
          radius="sm"
          onClick={props.onBack}
          disabled={!props.canGoBack}
          aria-label="Go to previous tab"
        >
          <IconChevronLeft size={16} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="md"
          radius="sm"
          onClick={props.onForward}
          disabled={!props.canGoForward}
          aria-label="Go to next tab"
        >
          <IconChevronRight size={16} />
        </ActionIcon>
      </div>

      <div className="workspace-topnav-center" data-tauri-drag-region>
        <Text className="workspace-topnav-project" component="span">
          {props.workspace.project.name}
        </Text>
        <Text className="workspace-topnav-active" component="span">
          {activeNodeLabel}
        </Text>
        <Text className="workspace-topnav-path" component="span">
          {props.workspace.root}
        </Text>
      </div>

      <div className="workspace-topnav-right" data-topnav-no-drag>
        {importTaskBadge}

        <Select
          size="xs"
          className="workspace-topnav-env-select"
          value={props.activeEnvironmentName}
          data={props.environments}
          onChange={value => value && props.onChangeEnvironment(value)}
        />

        <Badge variant="dot" color={props.isRunning ? 'blue' : 'gray'} size="sm" className="workspace-topnav-pill">
          {props.isRunning ? '运行中' : '空闲'}
        </Badge>

        {props.gitStatus?.isRepo ? (
          <Badge
            variant="light"
            color={props.gitStatus.dirty ? 'orange' : 'teal'}
            size="sm"
            className="workspace-topnav-pill workspace-topnav-optional"
          >
            {props.gitStatus.branch || 'git'}
            {props.gitStatus.dirty ? ` · ${props.gitStatus.changedFiles.length} 未提交` : ' · 干净'}
          </Badge>
        ) : null}

        <Menu shadow="md" width={240} position="bottom-end" classNames={{ dropdown: 'workspace-topnav-overflow-menu' }}>
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              radius="sm"
              className="workspace-topnav-overflow-trigger"
              aria-label="Open overflow actions"
            >
              <IconDotsVertical size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Quick Actions</Menu.Label>
            <Menu.Item leftSection={<IconRosetteDiscountCheck size={14} />} onClick={props.onOpenImportTasks}>
              Import Tasks ({props.importTaskCount})
            </Menu.Item>
            <Menu.Item leftSection={<IconGitBranch size={14} />} disabled={!props.gitStatus?.isRepo}>
              {props.gitStatus?.isRepo
                ? `${props.gitStatus.branch || 'git'} · ${props.gitStatus.dirty ? `${props.gitStatus.changedFiles.length} changed` : 'clean'}`
                : 'Git unavailable'}
            </Menu.Item>
            <Menu.Item leftSection={<IconSettings size={14} />} disabled>
              More actions are available in side centers
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <ActionIcon
          variant="subtle"
          color="gray"
          size="md"
          radius="sm"
          onClick={props.onRefreshWorkspace}
          aria-label="Refresh workspace"
        >
          <IconRefresh size={16} />
        </ActionIcon>
      </div>
    </header>
  );
}

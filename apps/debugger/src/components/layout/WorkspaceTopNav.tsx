import { ActionIcon, Badge, Select, Text } from '@mantine/core';
import {
  IconChevronLeft,
  IconChevronRight,
  IconGitBranch,
  IconRefresh
} from '@tabler/icons-react';
import type { WorkspaceIndex } from '@yapi-debugger/schema';
import type { GitStatusPayload } from '../../lib/desktop';
import type { SelectedNode } from '../../store/workspace-store';

function nodeLabel(node: SelectedNode, workspace: WorkspaceIndex): string {
  if (node.kind === 'project') return '项目设置';
  if (node.kind === 'category') return node.path.split('/').at(-1) || node.path;
  if (node.kind === 'request') {
    const record = workspace.requests.find(item => item.request.id === node.requestId);
    return record?.request.name || '请求';
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
  isRunning: boolean;
  gitStatus: GitStatusPayload | null;
  isMacOS: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onChangeEnvironment: (name: string) => void;
  onRefreshWorkspace: () => void;
}) {
  const activeNodeLabel = nodeLabel(props.selectedNode, props.workspace);
  const gitLabel = props.gitStatus?.isRepo
    ? props.gitStatus.dirty
      ? `${props.gitStatus.branch || 'git'} · ${props.gitStatus.changedFiles.length} 改动`
      : props.gitStatus.behind > 0
        ? `${props.gitStatus.branch || 'git'} · 落后 ${props.gitStatus.behind}`
        : `${props.gitStatus.branch || 'git'} · 干净`
    : null;

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
        <div className="workspace-topnav-context" title={props.workspace.root}>
          <Text className="workspace-topnav-project" component="span">
            {props.workspace.project.name}
          </Text>
          <Text className="workspace-topnav-divider" component="span" aria-hidden="true">
            /
          </Text>
          <Text className="workspace-topnav-active" component="span">
            {activeNodeLabel}
          </Text>
        </div>
        <Text className="workspace-topnav-meta" component="span">
          本地 API 工作台
        </Text>
      </div>

      <div className="workspace-topnav-right" data-topnav-no-drag>
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

        {gitLabel ? (
          <Badge
            variant="light"
            color={props.gitStatus?.dirty || (props.gitStatus?.behind || 0) > 0 ? 'orange' : 'teal'}
            size="sm"
            className="workspace-topnav-pill workspace-topnav-optional"
            leftSection={<IconGitBranch size={12} />}
          >
            {gitLabel}
          </Badge>
        ) : null}

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

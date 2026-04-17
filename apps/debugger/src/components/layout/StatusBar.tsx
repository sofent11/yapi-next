import { Group, Text, Tooltip } from '@mantine/core';
import { IconGitBranch, IconGitCommit, IconNetwork, IconClock, IconCheck, IconX } from '@tabler/icons-react';
import type { GitStatusPayload } from '../../lib/desktop';

export function StatusBar(props: {
  gitStatus: GitStatusPayload | null;
  activeEnvironment: string;
  responseInfo?: {
    status: number;
    duration: number;
    ok: boolean;
  } | null;
  onRefreshGit?: () => void;
}) {
  const statusColor = props.responseInfo ? (props.responseInfo.ok ? 'var(--green)' : 'var(--red)') : 'var(--muted)';

  return (
    <footer className="app-status-bar">
      <Group gap="md" style={{ flex: 1 }}>
        {props.gitStatus?.isRepo && (
          <Tooltip label="Git Branch" position="top" withArrow>
            <div className="status-item clickable" onClick={props.onRefreshGit}>
              <IconGitBranch size={14} />
              <Text size="xs" fw={600}>{props.gitStatus.branch || 'detached'}</Text>
              {props.gitStatus.dirty && <span className="status-dot orange" />}
            </div>
          </Tooltip>
        )}

        <div className="status-item">
          <IconNetwork size={14} />
          <Text size="xs">Env: <strong>{props.activeEnvironment}</strong></Text>
        </div>

        {props.responseInfo && (
          <div className="status-item animate-in" style={{ color: statusColor }}>
            {props.responseInfo.ok ? <IconCheck size={14} /> : <IconX size={14} />}
            <Text size="xs" fw={700}>
              {props.responseInfo.status}
            </Text>
            <Group gap={4} ml={4}>
              <IconClock size={12} />
              <Text size="xs">{props.responseInfo.duration}ms</Text>
            </Group>
          </div>
        )}
      </Group>

      <Group gap="md">
        <Text size="xs" c="dimmed">YAPI Next Debugger v0.1.0</Text>
      </Group>
    </footer>
  );
}

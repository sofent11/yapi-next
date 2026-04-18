import { Group, Text, Tooltip } from '@mantine/core';
import { IconGitBranch, IconArrowUpRight, IconArrowDownRight, IconNetwork, IconClock, IconCheck, IconX, IconFileDelta } from '@tabler/icons-react';
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
  const responseTone = props.responseInfo?.ok ? 'is-success' : 'is-error';

  return (
    <footer className="app-status-bar">
      <Group gap="md" style={{ flex: 1 }}>
        {props.gitStatus?.isRepo && (
          <Tooltip label="当前 Git 分支" position="top" withArrow>
            <div className="status-item clickable" onClick={props.onRefreshGit}>
              <IconGitBranch size={14} />
              <Text size="xs" fw={600}>{props.gitStatus.branch || 'detached'}</Text>
              {props.gitStatus.dirty && <span className="status-dot orange" />}
            </div>
          </Tooltip>
        )}

        {props.gitStatus?.isRepo ? (
          <div className="status-item">
            <IconFileDelta size={14} />
            <Text size="xs">未提交: <strong>{props.gitStatus.dirty ? props.gitStatus.changedFiles.length : 0}</strong></Text>
          </div>
        ) : null}

        {props.gitStatus?.isRepo ? (
          <div className="status-item">
            <IconArrowUpRight size={14} />
            <Text size="xs">{props.gitStatus.ahead}</Text>
            <IconArrowDownRight size={14} />
            <Text size="xs">{props.gitStatus.behind}</Text>
          </div>
        ) : null}

        <div className="status-item">
          <IconNetwork size={14} />
          <Text size="xs">环境: <strong>{props.activeEnvironment}</strong></Text>
        </div>

        {props.responseInfo && (
          <div className={`status-response-pill animate-in ${responseTone}`}>
            <span className="status-response-main">
              {props.responseInfo.ok ? <IconCheck size={14} /> : <IconX size={14} />}
              <Text size="xs" fw={800}>
                {props.responseInfo.status}
              </Text>
            </span>
            <span className="status-response-divider" aria-hidden="true" />
            <span className="status-response-latency">
              <IconClock size={12} />
              <Text size="xs" fw={700}>
                {props.responseInfo.duration}ms
              </Text>
            </span>
          </div>
        )}
      </Group>

      <Group gap="md">
        <Text size="xs" c="dimmed">YAPI Next Debugger v0.1.0</Text>
      </Group>
    </footer>
  );
}

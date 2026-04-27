import { Group, Text } from '@mantine/core';
import { IconGitBranch, IconArrowUpRight, IconArrowDownRight, IconClock, IconCheck, IconX } from '@tabler/icons-react';
import type { GitStatusPayload } from '../../lib/desktop';

export function StatusBar(props: {
  gitStatus: GitStatusPayload | null;
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
      <Group gap="sm" style={{ flex: 1 }}>
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
        {!props.responseInfo ? (
          <Text size="xs" c="dimmed">
            等待请求结果
          </Text>
        ) : null}
      </Group>

      <Group gap="sm">
        {props.gitStatus?.isRepo ? (
          <>
            <button type="button" className="status-item status-button" onClick={props.onRefreshGit}>
              <IconGitBranch size={14} />
              <Text size="xs" fw={600}>{props.gitStatus.branch || 'detached'}</Text>
              {props.gitStatus.dirty && <span className="status-dot orange" />}
            </button>
            <div className="status-item">
              <IconArrowUpRight size={14} />
              <Text size="xs">{props.gitStatus.ahead}</Text>
              <IconArrowDownRight size={14} />
              <Text size="xs">{props.gitStatus.behind}</Text>
            </div>
          </>
        ) : null}
      </Group>
    </footer>
  );
}

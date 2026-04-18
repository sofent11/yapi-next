import { ActionIcon, Stack, Tooltip } from '@mantine/core';
import { IconApi, IconFolders, IconGitBranch, IconHistory, IconHome2, IconPlugConnected } from '@tabler/icons-react';

export type AppRailView = 'home' | 'scratch' | 'workspace' | 'repair' | 'collections' | 'history' | 'environments' | 'sessions' | 'sync';

function railVariant(active: boolean) {
  return active ? 'filled' : 'subtle';
}

export function AppRail(props: {
  workspaceName: string;
  isDirty: boolean;
  activeView: AppRailView;
  onChangeView: (view: AppRailView) => void;
}) {
  return (
    <aside className="app-rail" aria-label="Activity Bar">
      <div className="app-rail-brand" title={props.workspaceName}>
        <IconApi size={24} stroke={2.5} />
      </div>

      <Stack gap="xs" style={{ flex: 1, alignItems: 'center', marginTop: 12 }}>
        <Tooltip label="首页" position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'home')} size="lg" radius="md" onClick={() => props.onChangeView('home')}>
            <IconHome2 size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="请求" position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'workspace')} size="lg" radius="md" onClick={() => props.onChangeView('workspace')}>
            <IconApi size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="集合" position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'collections')} size="lg" radius="md" onClick={() => props.onChangeView('collections')}>
            <IconFolders size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="历史" position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'history')} size="lg" radius="md" color="gray" onClick={() => props.onChangeView('history')}>
            <IconHistory size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="环境" position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'environments')} size="lg" radius="md" color="gray" onClick={() => props.onChangeView('environments')}>
            <IconPlugConnected size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="同步" position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'sync')} size="lg" radius="md" color="gray" onClick={() => props.onChangeView('sync')}>
            <IconGitBranch size={20} />
          </ActionIcon>
        </Tooltip>
      </Stack>

      <Stack gap="xs" style={{ alignItems: 'center', marginBottom: 12 }}>
        {props.isDirty ? (
          <Tooltip label="Unsaved Changes" position="right" withArrow>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)', margin: '4px 0' }} />
          </Tooltip>
        ) : null}
      </Stack>
    </aside>
  );
}

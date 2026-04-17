import { ActionIcon, Stack, Tooltip } from '@mantine/core';
import { IconApi, IconFolders, IconHistory, IconPlugConnected, IconSettings } from '@tabler/icons-react';

export type AppRailView = 'workspace' | 'collections' | 'history' | 'environments' | 'settings';

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
        <Tooltip label="Requests" position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'workspace')} size="lg" radius="md" onClick={() => props.onChangeView('workspace')}>
            <IconApi size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Collections" position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'collections')} size="lg" radius="md" onClick={() => props.onChangeView('collections')}>
            <IconFolders size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="History" position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'history')} size="lg" radius="md" color="gray" onClick={() => props.onChangeView('history')}>
            <IconHistory size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Environments" position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'environments')} size="lg" radius="md" color="gray" onClick={() => props.onChangeView('environments')}>
            <IconPlugConnected size={20} />
          </ActionIcon>
        </Tooltip>
      </Stack>

      <Stack gap="xs" style={{ alignItems: 'center', marginBottom: 12 }}>
        <Tooltip label="Settings" position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'settings')} size="lg" radius="md" color="gray" onClick={() => props.onChangeView('settings')}>
            <IconSettings size={20} />
          </ActionIcon>
        </Tooltip>

        {props.isDirty ? (
          <Tooltip label="Unsaved Changes" position="right" withArrow>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)', margin: '4px 0' }} />
          </Tooltip>
        ) : null}
      </Stack>
    </aside>
  );
}

import { ActionIcon, Indicator, Stack, Tooltip } from '@mantine/core';
import { IconApi, IconBug, IconFolders, IconGitBranch, IconHistory, IconPlugConnected, IconSandbox, IconSettings } from '@tabler/icons-react';

export type AppRailView = 'workspace' | 'scratch' | 'capture' | 'collections' | 'history' | 'environments' | 'sync' | 'preferences';

function railVariant(active: boolean) {
  return active ? 'filled' : 'subtle';
}

export function AppRail(props: {
  workspaceName: string;
  isDirty: boolean;
  activeView: AppRailView;
  importTaskCount?: number;
  shortcutHints?: Partial<Record<AppRailView, string>>;
  onChangeView: (view: AppRailView) => void;
}) {
  function railLabel(label: string, view: AppRailView) {
    return props.shortcutHints?.[view] ? `${label} · ${props.shortcutHints[view]}` : label;
  }

  return (
    <aside className="app-rail" aria-label="Activity Bar">
      <div className="app-rail-brand" title={props.workspaceName}>
        <IconApi size={24} stroke={2.5} />
      </div>

      <Stack gap="xs" style={{ flex: 1, alignItems: 'center', marginTop: 12 }}>
        <Tooltip label={railLabel('Workbench', 'workspace')} position="right" withArrow>
          <Indicator
            disabled={!props.importTaskCount}
            label={props.importTaskCount && props.importTaskCount > 9 ? '9+' : props.importTaskCount}
            size={14}
            offset={4}
            position="top-end"
          >
            <ActionIcon variant={railVariant(props.activeView === 'workspace')} size="lg" radius="md" onClick={() => props.onChangeView('workspace')}>
              <IconApi size={20} />
            </ActionIcon>
          </Indicator>
        </Tooltip>

        <Tooltip label={railLabel('Scratch', 'scratch')} position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'scratch')} size="lg" radius="md" onClick={() => props.onChangeView('scratch')}>
            <IconSandbox size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={railLabel('Capture', 'capture')} position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'capture')} size="lg" radius="md" onClick={() => props.onChangeView('capture')}>
            <IconBug size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={railLabel('Collections', 'collections')} position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'collections')} size="lg" radius="md" onClick={() => props.onChangeView('collections')}>
            <IconFolders size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={railLabel('History', 'history')} position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'history')} size="lg" radius="md" color="gray" onClick={() => props.onChangeView('history')}>
            <IconHistory size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={railLabel('Environments', 'environments')} position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'environments')} size="lg" radius="md" color="gray" onClick={() => props.onChangeView('environments')}>
            <IconPlugConnected size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={railLabel('Sync', 'sync')} position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'sync')} size="lg" radius="md" color="gray" onClick={() => props.onChangeView('sync')}>
            <IconGitBranch size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={railLabel('Preferences', 'preferences')} position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'preferences')} size="lg" radius="md" color="gray" onClick={() => props.onChangeView('preferences')}>
            <IconSettings size={20} />
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

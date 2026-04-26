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
        <IconApi size={18} stroke={2.2} />
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
            <ActionIcon variant={railVariant(props.activeView === 'workspace')} size="md" radius="sm" onClick={() => props.onChangeView('workspace')}>
              <IconApi size={18} />
            </ActionIcon>
          </Indicator>
        </Tooltip>

        <Tooltip label={railLabel('Scratch', 'scratch')} position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'scratch')} size="md" radius="sm" onClick={() => props.onChangeView('scratch')}>
            <IconSandbox size={18} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={railLabel('Capture', 'capture')} position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'capture')} size="md" radius="sm" onClick={() => props.onChangeView('capture')}>
            <IconBug size={18} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={railLabel('Collections', 'collections')} position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'collections')} size="md" radius="sm" onClick={() => props.onChangeView('collections')}>
            <IconFolders size={18} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={railLabel('History', 'history')} position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'history')} size="md" radius="sm" color="gray" onClick={() => props.onChangeView('history')}>
            <IconHistory size={18} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={railLabel('Environments', 'environments')} position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'environments')} size="md" radius="sm" color="gray" onClick={() => props.onChangeView('environments')}>
            <IconPlugConnected size={18} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={railLabel('Sync', 'sync')} position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'sync')} size="md" radius="sm" color="gray" onClick={() => props.onChangeView('sync')}>
            <IconGitBranch size={18} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={railLabel('Preferences', 'preferences')} position="right" withArrow>
          <ActionIcon variant={railVariant(props.activeView === 'preferences')} size="md" radius="sm" color="gray" onClick={() => props.onChangeView('preferences')}>
            <IconSettings size={18} />
          </ActionIcon>
        </Tooltip>
      </Stack>

      <Stack gap="xs" style={{ alignItems: 'center', marginBottom: 12 }}>
        {props.isDirty ? (
          <Tooltip label="Unsaved Changes" position="right" withArrow>
            <span className="app-rail-dirty-dot" />
          </Tooltip>
        ) : null}
      </Stack>
    </aside>
  );
}

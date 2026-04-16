import { ActionIcon, Tooltip, Stack } from '@mantine/core';
import { IconApi, IconFolderCog, IconPlugConnected, IconSettings, IconHistory } from '@tabler/icons-react';

export function AppRail(props: {
  workspaceName: string;
  requestCount: number;
  activeEnvironment: string;
  isDirty: boolean;
}) {
  return (
    <aside className="app-rail" aria-label="Activity Bar">
      <div className="app-rail-brand" title={props.workspaceName}>
        <IconApi size={24} stroke={2.5} />
      </div>

      <Stack gap="xs" style={{ flex: 1, alignItems: 'center', marginTop: 12 }}>
        <Tooltip label="Collections" position="right" withArrow>
          <ActionIcon variant="filled" size="lg" radius="md">
            <IconFolderCog size={20} />
          </ActionIcon>
        </Tooltip>
        
        <Tooltip label="History" position="right" withArrow>
          <ActionIcon variant="subtle" size="lg" radius="md" color="gray">
            <IconHistory size={20} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Environments" position="right" withArrow>
          <ActionIcon variant="subtle" size="lg" radius="md" color="gray">
            <IconPlugConnected size={20} />
          </ActionIcon>
        </Tooltip>
      </Stack>

      <Stack gap="xs" style={{ alignItems: 'center', marginBottom: 12 }}>
        <Tooltip label="Settings" position="right" withArrow>
          <ActionIcon variant="subtle" size="lg" radius="md" color="gray">
            <IconSettings size={20} />
          </ActionIcon>
        </Tooltip>
        
        {props.isDirty && (
          <Tooltip label="Unsaved Changes" position="right" withArrow>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)', margin: '4px 0' }} />
          </Tooltip>
        )}
      </Stack>
    </aside>
  );
}

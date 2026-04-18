import { Button, Text, TextInput, Paper, Group, Stack, Badge } from '@mantine/core';
import { IconFolderOpen, IconPlus, IconHistory, IconRocket, IconBolt, IconGitBranch } from '@tabler/icons-react';

export function WelcomePanel(props: {
  projectName: string;
  recentRoots: string[];
  onProjectNameChange: (name: string) => void;
  onOpenDirectory: () => void;
  onCreateWorkspace: () => void;
  onSelectRecent: (root: string) => void;
}) {
  return (
    <div className="welcome-shell">
      <div className="launchpad">
        <div className="launchpad-sidebar">
          <h1 className="launchpad-title">YAPI Next Debugger</h1>
          <p className="section-description" style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
            Local-first Request workspace for debugging and regression.
            <br /><br />
            Everything is stored as plain text files so developers and testers can share the same Git-friendly assets.
          </p>

          <Stack gap="xs" mt="xl">
            <Paper p="sm" withBorder style={{ background: 'var(--surface-muted)' }}>
              <Group gap="xs" mb={4}>
                <IconRocket size={16} color="var(--accent)" />
                <Text size="xs" fw={700}>Quick Tips</Text>
              </Group>
              <Stack gap={6}>
                <Group gap={6}>
                  <Badge variant="outline" size="xs" color="gray">Cmd+K</Badge>
                  <Text size="xs" c="dimmed">Global Search</Text>
                </Group>
                <Group gap={6}>
                  <IconGitBranch size={12} color="var(--muted)" />
                  <Text size="xs" c="dimmed">Built-in Git integration</Text>
                </Group>
                <Group gap={6}>
                  <IconBolt size={12} color="var(--muted)" />
                  <Text size="xs" c="dimmed">Drag & Drop to reorder</Text>
                </Group>
              </Stack>
            </Paper>
          </Stack>
        </div>

        <div className="launchpad-main">
          <div className="launchpad-section">
            <h2 className="section-title">Open or Create</h2>
            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              <TextInput
                size="sm"
                label="New Project Name"
                placeholder="My Awesome API"
                value={props.projectName}
                onChange={event => props.onProjectNameChange(event.currentTarget.value)}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Button
                  variant="outline"
                  leftSection={<IconFolderOpen size={16} />}
                  onClick={props.onOpenDirectory}
                >
                  Open Workspace
                </Button>
                <Button
                  variant="filled"
                  leftSection={<IconPlus size={16} />}
                  onClick={props.onCreateWorkspace}
                  disabled={!props.projectName.trim()}
                >
                  Create Workspace
                </Button>
              </div>
            </div>
          </div>

          <div className="launchpad-section">
            <h2 className="section-title">Recent Workspaces</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
              {props.recentRoots.length > 0 ? (
                props.recentRoots.map(root => (
                  <button
                    key={root}
                    className="category-row"
                    onClick={() => props.onSelectRecent(root)}
                    style={{ padding: '8px 12px' }}
                  >
                    <IconHistory size={14} style={{ color: 'var(--muted)' }} />
                    <Text size="sm" className="recent-root-label">
                      {root.split('/').at(-1)}
                    </Text>
                    <Text size="xs" c="dimmed" style={{ flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {root}
                    </Text>
                  </button>
                ))
              ) : (
                <Text size="sm" c="dimmed" style={{ padding: '12px', textAlign: 'center', border: '1px dashed var(--line)', borderRadius: 4 }}>
                  No recent projects. Open an existing directory or create a new workspace to get started.
                </Text>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

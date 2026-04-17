import { Button, Text, TextInput } from '@mantine/core';
import { IconFolderOpen, IconPlus, IconHistory } from '@tabler/icons-react';

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
          <h1 className="launchpad-title">YAPI Next</h1>
          <p className="section-description" style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
            Local-first API development workspace.
            <br /><br />
            Everything is stored as plain text files, perfect for Git collaboration.
          </p>
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

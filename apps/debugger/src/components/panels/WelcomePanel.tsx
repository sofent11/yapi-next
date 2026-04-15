import { Button, Stack, Text, TextInput } from '@mantine/core';
import { IconArrowRight, IconFolderOpen, IconSparkles } from '@tabler/icons-react';

export function WelcomePanel(props: {
  recentRoots: string[];
  projectName: string;
  setProjectName: (value: string) => void;
  onOpenDirectory: () => void;
  onCreateProject: () => void;
  onOpenRecent: (root: string) => void;
}) {
  return (
    <div className="welcome-shell">
      <div className="welcome-hero">
        <p className="eyebrow">Independent Desktop API Debugger</p>
        <h1>Text-first debugging for teams who live in Git.</h1>
        <p className="welcome-copy">
          Open a folder, keep every request as readable files, and collaborate on cases without shoving
          your API workflows into a database.
        </p>
        <div className="hero-actions">
          <Button size="md" color="dark" rightSection={<IconArrowRight size={16} />} onClick={props.onOpenDirectory}>
            Open Project Folder
          </Button>
          <Button size="md" variant="light" color="dark" leftSection={<IconFolderOpen size={16} />} onClick={props.onCreateProject}>
            Create New Project
          </Button>
        </div>
      </div>

      <div className="welcome-grid">
        <section className="welcome-card">
          <div className="welcome-card-head">
            <IconSparkles size={18} />
            <Text fw={700}>Create a clean workspace</Text>
          </div>
          <TextInput
            label="Project Name"
            value={props.projectName}
            placeholder="Payments Debugger"
            onChange={event => props.setProjectName(event.currentTarget.value)}
          />
          <Text className="helper-copy">
            We will create `project.yaml`, shared environments, and a small bootstrap request you can edit immediately.
          </Text>
        </section>

        <section className="welcome-card">
          <Text fw={700}>Recent Projects</Text>
          <Stack gap="sm" mt="md">
            {props.recentRoots.length > 0 ? (
              props.recentRoots.map(root => (
                <Button key={root} variant="default" justify="space-between" onClick={() => props.onOpenRecent(root)}>
                  <span className="recent-root-label">{root}</span>
                  <IconArrowRight size={14} />
                </Button>
              ))
            ) : (
              <Text c="dimmed">No recent project yet. Start by opening or creating a workspace folder.</Text>
            )}
          </Stack>
        </section>
      </div>
    </div>
  );
}

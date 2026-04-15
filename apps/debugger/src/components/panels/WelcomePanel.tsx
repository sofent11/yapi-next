import { Button, Stack, Text, TextInput } from '@mantine/core';
import { IconArrowRight, IconFolderOpen } from '@tabler/icons-react';

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
      <div className="launchpad">
        <aside className="launchpad-sidebar">
          <p className="section-kicker">Native API Workbench</p>
          <h1 className="launchpad-title">本地优先的 API 调试桌面工作台</h1>
          <Text c="dimmed" size="sm">
            工作区就是目录。项目、分类、接口、用例都落成文本文件，适合通过 Git 共享和协作。
          </Text>
          <div className="launchpad-facts">
            <span>Open Workspace</span>
            <span>Create Workspace</span>
            <span>Import Into Project</span>
          </div>
        </aside>

        <div className="launchpad-main">
          <section className="launchpad-section">
            <div className="launchpad-section-head">
              <div>
                <p className="section-kicker">Workspace</p>
                <h2 className="section-title">打开或创建</h2>
              </div>
            </div>

            <TextInput
              label="新项目名称"
              size="xs"
              value={props.projectName}
              placeholder="Payments Debugger"
              onChange={event => props.setProjectName(event.currentTarget.value)}
            />

            <div className="launchpad-actions">
              <Button size="xs" color="dark" rightSection={<IconArrowRight size={14} />} onClick={props.onOpenDirectory}>
                打开 Workspace
              </Button>
              <Button size="xs" variant="default" color="dark" leftSection={<IconFolderOpen size={14} />} onClick={props.onCreateProject}>
                新建 Workspace
              </Button>
            </div>
          </section>

          <section className="launchpad-section">
            <div className="launchpad-section-head">
              <div>
                <p className="section-kicker">Recent</p>
                <h2 className="section-title">最近工作区</h2>
              </div>
            </div>

            <Stack gap="xs">
              {props.recentRoots.length > 0 ? (
                props.recentRoots.map(root => (
                  <Button key={root} variant="default" justify="space-between" onClick={() => props.onOpenRecent(root)}>
                    <span className="recent-root-label">{root}</span>
                    <IconArrowRight size={14} />
                  </Button>
                ))
              ) : (
                <Text c="dimmed" size="sm">
                  还没有最近项目。先打开一个已有目录，或创建一个新的 workspace。
                </Text>
              )}
            </Stack>
          </section>
        </div>
      </div>
    </div>
  );
}

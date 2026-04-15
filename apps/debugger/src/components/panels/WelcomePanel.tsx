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
        <h1>本地优先、Git 友好的 API 调试工作台。</h1>
        <p className="welcome-copy">
          用目录打开项目，把接口、分类、用例都保存成可读文本。工作区完全独立，不依赖 YApi 后台，
          适合通过 Git 共享与协作。
        </p>
        <div className="hero-actions">
          <Button size="md" color="dark" rightSection={<IconArrowRight size={16} />} onClick={props.onOpenDirectory}>
            打开 Workspace
          </Button>
          <Button size="md" variant="light" color="dark" leftSection={<IconFolderOpen size={16} />} onClick={props.onCreateProject}>
            新建 Workspace
          </Button>
        </div>
      </div>

      <div className="welcome-grid">
        <section className="welcome-card">
          <div className="welcome-card-head">
            <IconSparkles size={18} />
            <Text fw={700}>创建一个干净的工作区</Text>
          </div>
          <TextInput
            label="项目名称"
            value={props.projectName}
            placeholder="Payments Debugger"
            onChange={event => props.setProjectName(event.currentTarget.value)}
          />
          <Text className="helper-copy">
            会生成 `project.yaml`、默认环境和一个示例接口，打开后就能直接开始调整。
          </Text>
        </section>

        <section className="welcome-card">
          <Text fw={700}>最近项目</Text>
          <Stack gap="sm" mt="md">
            {props.recentRoots.length > 0 ? (
              props.recentRoots.map(root => (
                <Button key={root} variant="default" justify="space-between" onClick={() => props.onOpenRecent(root)}>
                  <span className="recent-root-label">{root}</span>
                  <IconArrowRight size={14} />
                </Button>
              ))
            ) : (
              <Text c="dimmed">还没有最近项目。先打开一个已有目录，或创建一个新的 workspace。</Text>
            )}
          </Stack>
        </section>
      </div>
    </div>
  );
}

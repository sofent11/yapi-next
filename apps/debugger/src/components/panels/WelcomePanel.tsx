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
            面向开发与测试的本地优先接口调试工作区。
            <br /><br />
            请求、环境、Case 与 Collection 都以文本文件保存，方便纳入 Git 协作与本地回归。
          </p>

          <Stack gap="xs" mt="xl">
            <Paper p="sm" withBorder style={{ background: 'var(--surface-muted)' }}>
              <Group gap="xs" mb={4}>
                <IconRocket size={16} color="var(--accent)" />
                <Text size="xs" fw={700}>快速开始</Text>
              </Group>
              <Stack gap={6}>
                <Group gap={6}>
                  <Badge variant="outline" size="xs" color="gray">Cmd+K</Badge>
                  <Text size="xs" c="dimmed">快速搜索请求与目录</Text>
                </Group>
                <Group gap={6}>
                  <IconGitBranch size={12} color="var(--muted)" />
                  <Text size="xs" c="dimmed">内置 Git 同步视图</Text>
                </Group>
                <Group gap={6}>
                  <IconBolt size={12} color="var(--muted)" />
                  <Text size="xs" c="dimmed">支持拖拽整理目录与请求</Text>
                </Group>
              </Stack>
            </Paper>
          </Stack>
        </div>

        <div className="launchpad-main">
          <div className="launchpad-section">
            <h2 className="section-title">开始使用</h2>
            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              <TextInput
                size="sm"
                label="新建本地调试项目"
                placeholder="例如：支付接口联调"
                value={props.projectName}
                onChange={event => props.onProjectNameChange(event.currentTarget.value)}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Button
                  variant="outline"
                  leftSection={<IconFolderOpen size={16} />}
                  onClick={props.onOpenDirectory}
                >
                  导入已有 API / 打开工作区
                </Button>
                <Button
                  variant="filled"
                  leftSection={<IconPlus size={16} />}
                  onClick={props.onCreateWorkspace}
                  disabled={!props.projectName.trim()}
                >
                  新建本地调试项目
                </Button>
              </div>
            </div>
          </div>

          <div className="launchpad-section">
            <h2 className="section-title">最近使用</h2>
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
                  还没有最近工作区。先打开已有目录，或创建一个新的本地调试项目。
                </Text>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

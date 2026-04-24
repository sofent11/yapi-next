import { Button, Text, TextInput, Group, Badge } from '@mantine/core';
import { IconApi, IconBrandGithub, IconBug, IconFolderOpen, IconGitBranch, IconHistory, IconPlus, IconPlayerPlay, IconSettingsAutomation } from '@tabler/icons-react';

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
      <div className="launchpad ide-launchpad">
        <section className="launchpad-hero">
          <div className="launchpad-product-mark">
            <IconApi size={22} />
            <span>Local API IDE</span>
          </div>
          <h1 className="launchpad-title">YAPI Next Debugger</h1>
          <p className="launchpad-subtitle">
            A calm local workbench for importing specs, sending requests, capturing browser traffic, saving cases, and replaying collections with Git-visible files.
          </p>
          <div className="launchpad-capability-grid">
            <div className="launchpad-capability">
              <IconFolderOpen size={16} />
              <strong>File workspace</strong>
              <span>YAML requests, environments, cases, and reports stay reviewable.</span>
            </div>
            <div className="launchpad-capability">
              <IconSettingsAutomation size={16} />
              <strong>Case runner</strong>
              <span>Turn successful debugging into repeatable collection checks.</span>
            </div>
            <div className="launchpad-capability">
              <IconBug size={16} />
              <strong>Browser capture</strong>
              <span>Promote real network calls into durable workspace assets.</span>
            </div>
            <div className="launchpad-capability">
              <IconGitBranch size={16} />
              <strong>Git aware</strong>
              <span>Pull, push, inspect status, and keep local secrets out of commits.</span>
            </div>
          </div>
        </section>

        <section className="launchpad-main ide-launchpad-main">
          <div className="launchpad-section launchpad-start-panel">
            <div className="launchpad-section-head">
              <div>
                <p className="section-kicker">Workspace</p>
                <h2 className="section-title">Start a debugging session</h2>
              </div>
              <Badge variant="light" color="indigo">Bruno parity track</Badge>
            </div>
            <div className="launchpad-form-grid">
              <TextInput
                size="sm"
                label="新建本地工作区"
                placeholder="例如：支付接口联调"
                value={props.projectName}
                onChange={event => props.onProjectNameChange(event.currentTarget.value)}
              />
              <div className="launchpad-action-grid">
                <Button
                  variant="outline"
                  leftSection={<IconFolderOpen size={16} />}
                  onClick={props.onOpenDirectory}
                >
                  打开现有工作区
                </Button>
                <Button
                  variant="filled"
                  leftSection={<IconPlus size={16} />}
                  onClick={props.onCreateWorkspace}
                  disabled={!props.projectName.trim()}
                >
                  新建本地工作区
                </Button>
              </div>
              <Text size="xs" c="dimmed">
                API 导入发生在进入工作区之后，这样请求、环境、Case 和 Collection 才会落在同一个本地项目里。
              </Text>
            </div>
          </div>

          <div className="launchpad-section launchpad-sequence-panel">
            <div className="launchpad-section-head">
              <div>
                <p className="section-kicker">Flow</p>
                <h2 className="section-title">Operational path</h2>
              </div>
              <IconPlayerPlay size={16} />
            </div>
            <div className="launchpad-sequence">
              {['Open or create a workspace', 'Import OpenAPI / HAR / Postman', 'Repair blockers and send requests', 'Save response as Case', 'Add to Collection and sync'].map((item, index) => (
                <div key={item} className="launchpad-sequence-row">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{item}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="launchpad-section launchpad-recent-panel">
            <div className="launchpad-section-head">
              <div>
                <p className="section-kicker">Recent</p>
                <h2 className="section-title">Recent workspaces</h2>
              </div>
              <IconHistory size={16} />
            </div>
            <div className="launchpad-recent-list">
              {props.recentRoots.length > 0 ? (
                props.recentRoots.map(root => (
                  <button
                    key={root}
                    className="category-row"
                    onClick={() => props.onSelectRecent(root)}
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
                <div className="launchpad-empty-recent">
                  <IconBrandGithub size={18} />
                  <Text size="sm" c="dimmed">
                    No recent workspace yet. Open an existing directory or create a local API project to begin.
                  </Text>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

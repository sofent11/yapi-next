import { Badge, Button, Text, TextInput } from '@mantine/core';
import { IconApi, IconBrandGithub, IconFolderOpen, IconGitBranch, IconHistory, IconPlus, IconPlayerPlay } from '@tabler/icons-react';

export function WelcomePanel(props: {
  projectName: string;
  recentRoots: string[];
  onProjectNameChange: (name: string) => void;
  onOpenDirectory: () => void;
  onCloneRepository: () => void;
  onCreateWorkspace: () => void;
  onSelectRecent: (root: string) => void;
}) {
  return (
    <div className="welcome-shell">
      <div className="launchpad ide-launchpad">
        <section className="launchpad-hero">
          <div className="launchpad-product-mark">
            <IconApi size={22} />
            <span>本地 API 工作台</span>
          </div>
          <h1 className="launchpad-title">YAPI Next Debugger</h1>
          <p className="launchpad-subtitle">
            打开工作区后，先导入规范，再把一次调通的请求沉淀成 Case、Collection 和可 review 的本地资产。
          </p>
          <div className="launchpad-sequence launchpad-sequence-hero">
            {[
              '进入现有工作区，或创建一个新的本地 API 项目',
              '导入 OpenAPI / HAR / Postman，并补齐阻塞项',
              '发送请求、保存 Case、编排 Collection，再决定是否同步到 Git'
            ].map((item, index) => (
              <div key={item} className="launchpad-sequence-row">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{item}</strong>
              </div>
            ))}
          </div>
          <div className="launchpad-hero-note">
            <Badge variant="light" color="indigo">本地优先</Badge>
            <Text size="sm" c="dimmed">
              请求、环境、Case、Collection 和报告都会落在工作区目录里，便于审查、同步和回放。
            </Text>
          </div>
        </section>

        <section className="launchpad-main ide-launchpad-main">
          <div className="launchpad-section launchpad-start-panel">
            <div className="launchpad-section-head">
              <div>
                <p className="section-kicker">Workspace</p>
                <h2 className="section-title">先进入一个工作区</h2>
              </div>
              <IconPlayerPlay size={16} />
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
                  variant="default"
                  leftSection={<IconGitBranch size={16} />}
                  onClick={props.onCloneRepository}
                >
                  Clone Git 仓库
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
                先进入工作区，再导入 API。这样请求、环境、Case 和 Collection 才会落在同一个本地项目里。
              </Text>
              <Text size="xs" c="dimmed">
                私有仓库建议使用 SSH 地址，或先在系统 Git 凭据助手中配置 HTTPS/PAT；桌面端 clone 会直接反馈进度与认证错误，但不会弹出交互式密码提示。
              </Text>
            </div>
          </div>

          <div className="launchpad-section launchpad-recent-panel">
            <div className="launchpad-section-head">
              <div>
                <p className="section-kicker">Recent</p>
                <h2 className="section-title">继续最近的工作区</h2>
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
                    还没有最近工作区。打开现有目录，或先新建一个本地 API 项目。
                  </Text>
                </div>
              )}
            </div>
          </div>

          <div className="launchpad-section">
            <div className="launchpad-section-head">
              <div>
                <p className="section-kicker">Notes</p>
                <h2 className="section-title">进入工作区之后会发生什么</h2>
              </div>
              <IconGitBranch size={16} />
            </div>
            <div className="launchpad-form-grid">
              <Text size="sm" c="dimmed">
                导入、修复、发送、保存结果、加入 Collection，都在同一个本地目录里完成。
              </Text>
              <Text size="sm" c="dimmed">
                需要同步时再看 Git；不需要同步时，它也可以只是一个安静的本地调试台。
              </Text>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

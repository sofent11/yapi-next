import { Badge, Button, Group, Text } from '@mantine/core';
import type { WorkspaceIndex } from '@yapi-debugger/schema';
import type { GitStatusPayload } from '../../lib/desktop';

type RiskItem = {
  id: string;
  title: string;
  description: string;
  severity: 'warning' | 'danger';
};

type SyncGuardState = {
  canPull: boolean;
  canPush: boolean;
  pullReason: string | null;
  pushReason: string | null;
  level: 'ready' | 'warning' | 'danger';
};

export function SyncCenterPanel(props: {
  workspace: WorkspaceIndex;
  gitStatus: GitStatusPayload | null;
  syncGuard: SyncGuardState;
  gitRisks: RiskItem[];
  suggestedCommitMessage: string;
  lastSyncAt: string | null;
  onRefresh: () => void;
  onPull: () => void;
  onPush: () => void;
  onOpenTerminal: () => void;
  onCopySuggestedCommitMessage: () => void;
}) {
  const changedFiles = props.gitStatus?.changedFiles || [];

  return (
    <section className="workspace-main">
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">{props.workspace.project.name}</span>
          <span className="breadcrumb-chip">Sync Center</span>
        </div>
        <div className="panel-toolbar-actions">
          <Button size="xs" variant="default" onClick={props.onRefresh}>刷新状态</Button>
          <Button size="xs" variant="default" onClick={props.onOpenTerminal}>打开终端</Button>
          <Button size="xs" variant="default" onClick={props.onCopySuggestedCommitMessage}>复制建议提交说明</Button>
          <Button size="xs" variant="default" onClick={props.onPull} disabled={!props.gitStatus?.isRepo}>Pull</Button>
          <Button size="xs" onClick={props.onPush} disabled={!props.gitStatus?.isRepo}>Push</Button>
        </div>
      </div>

      <div className="sync-layout">
        <div className="workspace-home-grid">
          <div className="workspace-home-card workspace-home-card-wide">
            <div className="workspace-home-card-head">
              <div>
                <Text className="section-kicker">同步概览</Text>
                <h3 className="section-title">当前 Git 状态</h3>
              </div>
              <Badge color={props.syncGuard.level === 'danger' ? 'red' : props.syncGuard.level === 'warning' ? 'orange' : 'teal'} variant="light">
                {props.syncGuard.level === 'danger' ? '需要先处理' : props.syncGuard.level === 'warning' ? '需要关注' : '可安全同步'}
              </Badge>
            </div>
            <div className="workspace-home-metric-grid">
              <div className="summary-chip">
                <span>分支</span>
                <strong>{props.gitStatus?.branch || 'not-a-repo'}</strong>
              </div>
              <div className="summary-chip">
                <span>未提交文件</span>
                <strong>{changedFiles.length}</strong>
              </div>
              <div className="summary-chip">
                <span>Ahead / Behind</span>
                <strong>{`${props.gitStatus?.ahead || 0} / ${props.gitStatus?.behind || 0}`}</strong>
              </div>
              <div className="summary-chip">
                <span>上次同步</span>
                <strong>{props.lastSyncAt ? new Date(props.lastSyncAt).toLocaleString() : '尚未记录'}</strong>
              </div>
            </div>
            <div className="checks-list" style={{ marginTop: 16 }}>
              <div className="check-card">
                <Text fw={700}>Pull 安全提示</Text>
                <Text size="sm" c={props.syncGuard.pullReason ? 'red' : 'dimmed'}>
                  {props.syncGuard.pullReason || '当前可以安全执行 Pull。'}
                </Text>
              </div>
              <div className="check-card">
                <Text fw={700}>Push 安全提示</Text>
                <Text size="sm" c={props.syncGuard.pushReason ? 'red' : 'dimmed'}>
                  {props.syncGuard.pushReason || '当前可以安全执行 Push。'}
                </Text>
              </div>
            </div>
          </div>

          <div className="workspace-home-card">
            <div className="workspace-home-card-head">
              <div>
                <Text className="section-kicker">建议动作</Text>
                <h3 className="section-title">提交说明</h3>
              </div>
            </div>
            <div className="check-card" style={{ marginTop: 8 }}>
              <Text size="sm" fw={700}>建议的 commit message</Text>
              <Text size="sm" c="dimmed">{props.suggestedCommitMessage}</Text>
            </div>
          </div>
        </div>

        {props.gitRisks.length > 0 ? (
          <div className="inspector-section" style={{ marginTop: 16 }}>
            <h3 className="section-title">同步风险</h3>
            <div className="checks-list">
              {props.gitRisks.map(risk => (
                <div key={risk.id} className="check-card">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={700}>{risk.title}</Text>
                      <Text size="sm" c="dimmed">{risk.description}</Text>
                    </div>
                    <Badge color={risk.severity === 'danger' ? 'red' : 'orange'}>{risk.severity === 'danger' ? '高风险' : '注意'}</Badge>
                  </Group>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="inspector-section" style={{ marginTop: 16 }}>
          <h3 className="section-title">未提交文件</h3>
          {changedFiles.length === 0 ? (
            <div className="empty-tab-state">当前没有未提交文件，工作区是干净的。</div>
          ) : (
            <div className="checks-list">
              {changedFiles.map(file => (
                <div key={file} className="check-card">
                  <Text size="sm" fw={600}>{file}</Text>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

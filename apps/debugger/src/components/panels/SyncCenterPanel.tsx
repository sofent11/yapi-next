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

function fileName(path: string) {
  return path.split('/').at(-1) || path;
}

function statusTone(level: SyncGuardState['level']) {
  if (level === 'danger') return 'orange';
  if (level === 'warning') return 'yellow';
  return 'teal';
}

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
  const isRepo = Boolean(props.gitStatus?.isRepo);
  const statusLabel =
    props.syncGuard.level === 'danger'
      ? 'Review before sync'
      : props.syncGuard.level === 'warning'
        ? 'Sync with caution'
        : 'Ready to sync';
  const nextStepCopy = !isRepo
    ? 'This workspace is not connected to Git yet. Use the terminal to initialize or open the real repository root first.'
    : !props.syncGuard.canPull
      ? props.syncGuard.pullReason || 'Resolve the pull blocker before syncing from remote.'
      : !props.syncGuard.canPush
        ? props.syncGuard.pushReason || 'Resolve the push blocker before publishing local changes.'
        : changedFiles.length > 0
          ? 'You can sync now. Review changed files and commit deliberately before pushing.'
          : 'The worktree is clean and safe. Pull or push whenever you are ready.';
  const summaryItems = [
    { label: 'Branch', value: props.gitStatus?.branch || 'Local folder only' },
    { label: 'Worktree', value: changedFiles.length === 0 ? 'Clean' : `${changedFiles.length} changed` },
    { label: 'Ahead / Behind', value: `${props.gitStatus?.ahead || 0} / ${props.gitStatus?.behind || 0}` },
    { label: 'Last Sync', value: props.lastSyncAt ? new Date(props.lastSyncAt).toLocaleString() : 'Not recorded' }
  ];

  return (
    <section className="workspace-main sync-center">
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">{props.workspace.project.name}</span>
          <span className="breadcrumb-chip">Sync</span>
        </div>
        <div className="panel-toolbar-actions">
          <Button size="xs" variant="default" onClick={props.onRefresh}>Refresh</Button>
          <Button size="xs" variant="default" onClick={props.onPull} disabled={!props.gitStatus?.isRepo}>Pull</Button>
          <Button size="xs" onClick={props.onPush} disabled={!props.gitStatus?.isRepo}>Push</Button>
        </div>
      </div>

      <div className="sync-layout">
        <section className="sync-hero">
          <div className="sync-hero-main">
            <div className="sync-hero-copy">
              <div className="sync-hero-status-row">
                <Badge color={statusTone(props.syncGuard.level)} variant="light" size="xl">
                  {statusLabel}
                </Badge>
              </div>
              <Text size="lg" className="sync-hero-body" mt="md">
                {nextStepCopy}
              </Text>
            </div>
          </div>
          <div className="summary-grid sync-summary-grid">
            {summaryItems.map(item => (
              <div key={item.label} className="summary-chip sync-summary-chip">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="sync-guard-grid">
          <div className={`check-card sync-guard-card ${props.syncGuard.canPull ? 'is-ready' : 'is-blocked'}`} style={{ margin: 0 }}>
            <div className="sync-guard-head">
              <h3 className="section-title">Pull Status</h3>
              <Badge color={props.syncGuard.canPull ? 'teal' : 'orange'} variant="light" size="lg">
                {props.syncGuard.canPull ? 'Ready' : 'Blocked'}
              </Badge>
            </div>
            <Text size="sm" c="dimmed" className="sync-guard-body" mt="sm">
              {props.syncGuard.pullReason || 'The workspace can pull safely.'}
            </Text>
            <Group gap="xs" mt="lg" className="sync-actions-row">
              <Button size="xs" variant="default" onClick={props.onPull} disabled={!props.gitStatus?.isRepo || !props.syncGuard.canPull}>
                Pull from remote
              </Button>
            </Group>
          </div>

          <div className={`check-card sync-guard-card ${props.syncGuard.canPush ? 'is-ready' : 'is-blocked'}`} style={{ margin: 0 }}>
            <div className="sync-guard-head">
              <h3 className="section-title">Push Status</h3>
              <Badge color={props.syncGuard.canPush ? 'teal' : 'orange'} variant="light" size="lg">
                {props.syncGuard.canPush ? 'Ready' : 'Blocked'}
              </Badge>
            </div>
            <Text size="sm" c="dimmed" className="sync-guard-body" mt="sm">
              {props.syncGuard.pushReason || 'The workspace can push safely.'}
            </Text>
            <Group gap="xs" mt="lg" className="sync-actions-row">
              <Button size="xs" onClick={props.onPush} disabled={!props.gitStatus?.isRepo || !props.syncGuard.canPush}>
                Push to remote
              </Button>
            </Group>
          </div>
        </section>

        {props.gitRisks.length > 0 ? (
          <section className="inspector-section sync-risk-section">
            <div className="checks-head">
              <h3 className="section-title">Sync risks to resolve first</h3>
            </div>
            <div className="sync-risk-list" style={{ marginTop: 12 }}>
              {props.gitRisks.map(risk => (
                <div key={risk.id} className="sync-risk-card">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={500}>{risk.title}</Text>
                      <Text size="sm" c="dimmed" mt={4}>{risk.description}</Text>
                    </div>
                    <Badge color={risk.severity === 'danger' ? 'red' : 'orange'}>
                      {risk.severity === 'danger' ? 'High risk' : 'Review'}
                    </Badge>
                  </Group>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="sync-support-grid">
          <div className="check-card sync-support-card" style={{ margin: 0 }}>
            <h3 className="section-title">Suggested commit</h3>
            <div className="sync-commit-preview" style={{ marginTop: 12 }}>{props.suggestedCommitMessage}</div>
            <Group gap="xs" mt="lg" className="sync-actions-row">
              <Button size="xs" variant="default" onClick={props.onCopySuggestedCommitMessage}>
                Copy message
              </Button>
              <Button size="xs" variant="subtle" onClick={props.onOpenTerminal}>
                Open terminal
              </Button>
            </Group>
          </div>

          <div className="check-card sync-support-card" style={{ margin: 0 }}>
            <h3 className="section-title">Changed Files</h3>
            {changedFiles.length === 0 ? (
              <div className="empty-tab-state sync-empty-note" style={{ marginTop: 12 }}>
                No uncommitted files.
              </div>
            ) : (
              <div className="sync-file-list" style={{ marginTop: 12 }}>
                {changedFiles.map(file => (
                  <div key={file} className="sync-file-row">
                    <strong>{fileName(file)}</strong>
                    <span>{file}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

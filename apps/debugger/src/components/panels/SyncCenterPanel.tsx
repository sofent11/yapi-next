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
              <Text className="section-kicker">Sync Control</Text>
              <h2 className="sync-hero-title">Can this workspace sync safely right now?</h2>
              <Text size="sm" c="dimmed" className="sync-hero-body">
                {nextStepCopy}
              </Text>
              <div className="sync-hero-status-row">
                <Badge color={statusTone(props.syncGuard.level)} variant="light" size="lg">
                  {statusLabel}
                </Badge>
                <Text size="sm" c="dimmed">
                  {isRepo ? 'The summary below reflects the current repository state.' : 'Sync actions stay blocked until this folder is a Git repository.'}
                </Text>
              </div>
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
              <div>
                <Text className="section-kicker">Can Pull?</Text>
                <h3 className="section-title">Pull safety</h3>
              </div>
              <Badge color={props.syncGuard.canPull ? 'teal' : 'orange'} variant="light" size="lg">
                {props.syncGuard.canPull ? 'Ready' : 'Blocked'}
              </Badge>
            </div>
            <Text size="sm" c="dimmed" className="sync-guard-body">
              {props.syncGuard.pullReason || 'The workspace can pull safely. No local condition is currently blocking this step.'}
            </Text>
            <div className="sync-next-step">
              <span>Next</span>
              <strong>
                {props.syncGuard.canPull
                  ? 'Pull from remote when you need the latest shared state.'
                  : !isRepo
                    ? 'Open the repository root or initialize Git first.'
                    : 'Resolve the blocker above, then re-check the guard.'}
              </strong>
            </div>
            <Group gap="xs" mt="md" className="sync-actions-row">
              <Button size="xs" variant="default" onClick={props.onPull} disabled={!props.gitStatus?.isRepo || !props.syncGuard.canPull}>
                Pull
              </Button>
              <Button size="xs" variant="subtle" onClick={props.onRefresh}>
                Re-check
              </Button>
            </Group>
          </div>

          <div className={`check-card sync-guard-card ${props.syncGuard.canPush ? 'is-ready' : 'is-blocked'}`} style={{ margin: 0 }}>
            <div className="sync-guard-head">
              <div>
                <Text className="section-kicker">Can Push?</Text>
                <h3 className="section-title">Push safety</h3>
              </div>
              <Badge color={props.syncGuard.canPush ? 'teal' : 'orange'} variant="light" size="lg">
                {props.syncGuard.canPush ? 'Ready' : 'Blocked'}
              </Badge>
            </div>
            <Text size="sm" c="dimmed" className="sync-guard-body">
              {props.syncGuard.pushReason || 'The workspace can push safely. No sync guard is currently blocking this step.'}
            </Text>
            <div className="sync-next-step">
              <span>Next</span>
              <strong>
                {props.syncGuard.canPush
                  ? 'Push after you confirm the changed files and commit message are intentional.'
                  : !isRepo
                    ? 'Connect this workspace to Git before publishing changes.'
                    : 'Clear the push blocker first, then re-check the guard.'}
              </strong>
            </div>
            <Group gap="xs" mt="md" className="sync-actions-row">
              <Button size="xs" onClick={props.onPush} disabled={!props.gitStatus?.isRepo || !props.syncGuard.canPush}>
                Push
              </Button>
              <Button size="xs" variant="subtle" onClick={props.onRefresh}>
                Re-check
              </Button>
            </Group>
          </div>
        </section>

        {props.gitRisks.length > 0 ? (
          <section className="inspector-section sync-risk-section">
            <div className="checks-head">
              <div>
                <Text className="section-kicker">Why not now?</Text>
                <h3 className="section-title">Sync risks to resolve first</h3>
              </div>
            </div>
            <div className="sync-risk-list">
              {props.gitRisks.map(risk => (
                <div key={risk.id} className="sync-risk-card">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={700}>{risk.title}</Text>
                      <Text size="sm" c="dimmed" mt={6}>{risk.description}</Text>
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
            <Text className="section-kicker">Support</Text>
            <h3 className="section-title">Suggested commit message</h3>
            <div className="sync-commit-preview">{props.suggestedCommitMessage}</div>
            <Group gap="xs" mt="md" className="sync-actions-row">
              <Button size="xs" variant="default" onClick={props.onCopySuggestedCommitMessage}>
                Copy message
              </Button>
              <Button size="xs" variant="subtle" onClick={props.onOpenTerminal}>
                Open terminal
              </Button>
            </Group>
          </div>

          <div className="check-card sync-support-card" style={{ margin: 0 }}>
            <Text className="section-kicker">Changed Files</Text>
            <h3 className="section-title">What is currently dirty</h3>
            {changedFiles.length === 0 ? (
              <div className="empty-tab-state sync-empty-note" style={{ marginTop: 12 }}>
                No uncommitted files. The workspace is clean.
              </div>
            ) : (
              <div className="sync-file-list">
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

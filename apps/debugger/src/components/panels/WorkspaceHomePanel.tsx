import { Badge, Button, Group, Text } from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconClockPlay,
  IconFolders,
  IconGitBranch,
  IconHistory,
  IconLifebuoy,
  IconPlayerPlay,
  IconPlugConnected,
  IconSparkles,
  IconUpload
} from '@tabler/icons-react';
import type { WorkspaceIndex } from '@yapi-debugger/schema';
import type { GitStatusPayload } from '../../lib/desktop';

type RiskItem = {
  id: string;
  title: string;
  description: string;
  severity: 'warning' | 'danger';
};

type ImportSessionSummary = {
  format: string;
  importedAt: string;
  importedRequestCount: number;
  runnableCount: number;
  blockedCount: number;
  warningCount: number;
  runnableScore: number;
};

type RecentRunSummary = {
  requestId: string;
  requestName: string;
  status: number;
  durationMs: number;
  timestamp: string;
};

type CollectionRunSummary = {
  collectionId: string;
  collectionName: string;
  status: string;
  failedSteps: number;
  finishedAt: string;
};

function summaryCounts(workspace: WorkspaceIndex) {
  return {
    requests: workspace.requests.length,
    cases: workspace.requests.reduce((total, record) => total + record.cases.length, 0),
    collections: workspace.collections.length,
    environments: workspace.environments.length
  };
}

function gitStatusTone(gitStatus: GitStatusPayload | null) {
  if (!gitStatus?.isRepo) return 'gray';
  if (gitStatus.dirty || gitStatus.behind > 0) return 'orange';
  return 'teal';
}

export function WorkspaceHomePanel(props: {
  workspace: WorkspaceIndex;
  gitStatus: GitStatusPayload | null;
  gitRisks: RiskItem[];
  importSession: ImportSessionSummary | null;
  repairSummary: {
    blockingCount: number;
    warningCount: number;
    runnableCount: number;
  } | null;
  recentSuccess: RecentRunSummary | null;
  lastCollectionRun: CollectionRunSummary | null;
  suggestedCommitMessage: string;
  onOpenImport: () => void;
  onOpenRepair: () => void;
  onOpenEnvironmentCenter: () => void;
  onOpenFirstBlocked: () => void;
  onOpenLastSuccessfulRequest: () => void;
  onRunLastCollection: () => void;
  onOpenCollections: () => void;
  onOpenHistory: () => void;
  onRefreshGit: () => void;
  onCopySuggestedCommitMessage: () => void;
}) {
  const counts = summaryCounts(props.workspace);
  const hasWorkspaceContent = counts.requests > 0 || counts.collections > 0;

  return (
    <section className="workspace-main workspace-home">
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">{props.workspace.project.name}</span>
          <span className="breadcrumb-chip">Workspace Home</span>
        </div>
        <div className="panel-toolbar-actions">
          <Button size="xs" variant="default" leftSection={<IconUpload size={14} />} onClick={props.onOpenImport}>
            Import Spec
          </Button>
          <Button size="xs" variant="default" leftSection={<IconLifebuoy size={14} />} onClick={props.onOpenRepair}>
            Open Repair
          </Button>
        </div>
      </div>

      <div className="workspace-home-scroll">
        {!hasWorkspaceContent ? (
          <div className="workspace-home-hero">
            <div>
              <Text className="section-kicker">Local-First Request Workspace</Text>
              <h2 className="workspace-home-title">Start with one import, then turn it into reusable requests and collections.</h2>
              <Text size="sm" c="dimmed" maw={680}>
                This debugger is strongest when the same local files serve both fast developer debugging and repeatable test flows. Import a spec first, repair the blockers, send one request, then save it as a Case and run it in a Collection.
              </Text>
            </div>
            <div className="workspace-home-primary-actions">
              <Button leftSection={<IconUpload size={16} />} onClick={props.onOpenImport}>
                Import Spec
              </Button>
              <Button variant="default" leftSection={<IconPlugConnected size={16} />} onClick={props.onOpenEnvironmentCenter}>
                Prepare Environment
              </Button>
            </div>
          </div>
        ) : (
          <div className="workspace-home-hero compact">
            <div>
              <Text className="section-kicker">Main Flow</Text>
              <h2 className="workspace-home-title">Import, repair, send, save as Case, then run a Collection.</h2>
              <Text size="sm" c="dimmed" maw={720}>
                Keep the same Request assets flowing through development debugging and regression checks instead of rebuilding them in separate tools.
              </Text>
            </div>
            <div className="workspace-home-primary-actions">
              <Button leftSection={<IconUpload size={16} />} onClick={props.onOpenImport}>
                Import Spec
              </Button>
              <Button
                variant="default"
                leftSection={<IconAlertTriangle size={16} />}
                onClick={props.onOpenFirstBlocked}
                disabled={!props.repairSummary || props.repairSummary.blockingCount === 0}
              >
                Open First Blocked Request
              </Button>
              <Button
                variant="default"
                leftSection={<IconPlayerPlay size={16} />}
                onClick={props.onOpenLastSuccessfulRequest}
                disabled={!props.recentSuccess}
              >
                Open Last Successful Request
              </Button>
              <Button
                variant="default"
                leftSection={<IconFolders size={16} />}
                onClick={props.onRunLastCollection}
                disabled={!props.lastCollectionRun}
              >
                Run Last Collection
              </Button>
            </div>
          </div>
        )}

        <div className="workspace-home-grid">
          <div className="workspace-home-card workspace-home-card-wide">
            <div className="workspace-home-card-head">
              <div>
                <Text className="section-kicker">Current Workspace</Text>
                <h3 className="section-title">Asset overview</h3>
              </div>
              <Badge color="gray" variant="light">
                local files
              </Badge>
            </div>
            <div className="workspace-home-metric-grid">
              <div className="summary-chip">
                <span>Requests</span>
                <strong>{counts.requests}</strong>
              </div>
              <div className="summary-chip">
                <span>Cases</span>
                <strong>{counts.cases}</strong>
              </div>
              <div className="summary-chip">
                <span>Collections</span>
                <strong>{counts.collections}</strong>
              </div>
              <div className="summary-chip">
                <span>Environments</span>
                <strong>{counts.environments}</strong>
              </div>
            </div>
          </div>

          <div className="workspace-home-card">
            <div className="workspace-home-card-head">
              <div>
                <Text className="section-kicker">Recent Import</Text>
                <h3 className="section-title">Import to runnable</h3>
              </div>
              <Button size="xs" variant="subtle" rightSection={<IconArrowRight size={12} />} onClick={props.onOpenRepair}>
                Repair
              </Button>
            </div>
            {props.importSession ? (
              <>
                <div className="workspace-home-metric-grid compact">
                  <div className="summary-chip">
                    <span>Format</span>
                    <strong>{props.importSession.format}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Imported</span>
                    <strong>{props.importSession.importedRequestCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Runnable</span>
                    <strong>{props.importSession.runnableCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Blocked</span>
                    <strong>{props.importSession.blockedCount}</strong>
                  </div>
                </div>
                <Text size="sm" c="dimmed">
                  Imported {props.importSession.importedAt}. Runnable score {props.importSession.runnableScore}% with {props.importSession.warningCount} warnings left to review.
                </Text>
              </>
            ) : (
              <div className="empty-tab-state">
                No recent import batch yet. Import OpenAPI, Swagger, HAR, or Postman to start the main flow.
              </div>
            )}
          </div>

          <div className="workspace-home-card">
            <div className="workspace-home-card-head">
              <div>
                <Text className="section-kicker">Recent Success</Text>
                <h3 className="section-title">Last runnable request</h3>
              </div>
              <Button size="xs" variant="subtle" rightSection={<IconArrowRight size={12} />} onClick={props.onOpenHistory}>
                History
              </Button>
            </div>
            {props.recentSuccess ? (
              <>
                <Group gap="xs">
                  <Badge color="teal" variant="light">
                    {props.recentSuccess.status}
                  </Badge>
                  <Badge color="gray" variant="light">
                    {props.recentSuccess.durationMs} ms
                  </Badge>
                </Group>
                <Text fw={700}>{props.recentSuccess.requestName}</Text>
                <Text size="sm" c="dimmed">
                  Last successful send at {props.recentSuccess.timestamp}.
                </Text>
                <Button size="xs" variant="default" onClick={props.onOpenLastSuccessfulRequest}>
                  Open Request
                </Button>
              </>
            ) : (
              <div className="empty-tab-state">No successful request run yet. Send a Request once to unlock Case and Collection reuse.</div>
            )}
          </div>

          <div className="workspace-home-card">
            <div className="workspace-home-card-head">
              <div>
                <Text className="section-kicker">Collections</Text>
                <h3 className="section-title">Latest regression run</h3>
              </div>
              <Button size="xs" variant="subtle" rightSection={<IconArrowRight size={12} />} onClick={props.onOpenCollections}>
                Collections
              </Button>
            </div>
            {props.lastCollectionRun ? (
              <>
                <Group gap="xs">
                  <Badge color={props.lastCollectionRun.failedSteps > 0 ? 'orange' : 'teal'} variant="light">
                    {props.lastCollectionRun.status}
                  </Badge>
                  <Badge color="gray" variant="light">
                    {props.lastCollectionRun.failedSteps} failed
                  </Badge>
                </Group>
                <Text fw={700}>{props.lastCollectionRun.collectionName}</Text>
                <Text size="sm" c="dimmed">
                  Latest run finished at {props.lastCollectionRun.finishedAt}.
                </Text>
                <Button size="xs" variant="default" onClick={props.onRunLastCollection}>
                  Run Again
                </Button>
              </>
            ) : (
              <div className="empty-tab-state">No Collection run yet. Once a Request is stable, add it to a Collection and run it here.</div>
            )}
          </div>

          <div className="workspace-home-card workspace-home-card-wide">
            <div className="workspace-home-card-head">
              <div>
                <Text className="section-kicker">Git-First Status</Text>
                <h3 className="section-title">Sync and review before sharing</h3>
              </div>
              <Group gap={8}>
                <Button size="xs" variant="default" onClick={props.onRefreshGit}>
                  Refresh
                </Button>
                <Button size="xs" variant="default" onClick={props.onCopySuggestedCommitMessage}>
                  Copy Commit Message
                </Button>
              </Group>
            </div>
            <div className="workspace-home-metric-grid">
              <div className="summary-chip">
                <span>Repository</span>
                <strong>{props.gitStatus?.isRepo ? 'Yes' : 'No'}</strong>
              </div>
              <div className="summary-chip">
                <span>Branch</span>
                <strong>{props.gitStatus?.branch || 'detached'}</strong>
              </div>
              <div className="summary-chip">
                <span>Dirty Files</span>
                <strong>{props.gitStatus?.dirty ? props.gitStatus.changedFiles.length : 0}</strong>
              </div>
              <div className="summary-chip">
                <span>Ahead / Behind</span>
                <strong>{`${props.gitStatus?.ahead || 0} / ${props.gitStatus?.behind || 0}`}</strong>
              </div>
            </div>
            <Group gap="xs">
              <Badge color={gitStatusTone(props.gitStatus)} variant="light">
                {props.gitStatus?.isRepo ? 'git connected' : 'no repo'}
              </Badge>
              {props.gitRisks.length === 0 ? (
                <Badge color="teal" variant="light">
                  no sync risks detected
                </Badge>
              ) : null}
            </Group>
            <Text size="sm" c="dimmed">
              Suggested commit message: {props.suggestedCommitMessage}
            </Text>
            {props.gitRisks.length > 0 ? (
              <div className="workspace-home-risk-list">
                {props.gitRisks.map(risk => (
                  <div key={risk.id} className="workspace-home-risk-row">
                    <Group gap={8} align="flex-start" wrap="nowrap">
                      <IconAlertTriangle size={16} color={risk.severity === 'danger' ? 'var(--red)' : 'var(--orange)'} />
                      <div>
                        <Text fw={700} size="sm">
                          {risk.title}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {risk.description}
                        </Text>
                      </div>
                    </Group>
                    <Badge color={risk.severity === 'danger' ? 'red' : 'orange'} variant="light">
                      {risk.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="workspace-home-card workspace-home-card-wide">
            <div className="workspace-home-card-head">
              <div>
                <Text className="section-kicker">Recommended Flow</Text>
                <h3 className="section-title">What to do next</h3>
              </div>
              <Badge color="indigo" variant="light">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <IconSparkles size={12} />
                  <span>main path</span>
                </span>
              </Badge>
            </div>
            <div className="workspace-home-step-list">
              <div className="workspace-home-step">
                <IconUpload size={16} />
                <span>Import a spec and open Repair Center.</span>
              </div>
              <div className="workspace-home-step">
                <IconLifebuoy size={16} />
                <span>Fix auth, baseUrl, and missing variables until at least one Request becomes runnable.</span>
              </div>
              <div className="workspace-home-step">
                <IconPlayerPlay size={16} />
                <span>Send a Request, then save the response as a reusable Case or Example.</span>
              </div>
              <div className="workspace-home-step">
                <IconFolders size={16} />
                <span>Add the Request or Case into a Collection and run the regression flow locally.</span>
              </div>
              <div className="workspace-home-step">
                <IconGitBranch size={16} />
                <span>Review Git changes, keep secrets local, then sync with the team through Git.</span>
              </div>
            </div>
          </div>

          <div className="workspace-home-card">
            <div className="workspace-home-card-head">
              <div>
                <Text className="section-kicker">Quick Access</Text>
                <h3 className="section-title">Jump points</h3>
              </div>
            </div>
            <div className="workspace-home-link-list">
                <Button variant="subtle" rightSection={<IconArrowRight size={12} />} onClick={props.onOpenRepair}>
                  Repair Center
                </Button>
              <Button variant="subtle" rightSection={<IconArrowRight size={12} />} onClick={props.onOpenEnvironmentCenter}>
                Environment Center
              </Button>
              <Button variant="subtle" rightSection={<IconArrowRight size={12} />} onClick={props.onOpenHistory}>
                History
              </Button>
              <Button variant="subtle" rightSection={<IconArrowRight size={12} />} onClick={props.onOpenCollections}>
                Collections
              </Button>
            </div>
          </div>

          <div className="workspace-home-card">
            <div className="workspace-home-card-head">
              <div>
                <Text className="section-kicker">Repair Snapshot</Text>
                <h3 className="section-title">Current blockers</h3>
              </div>
            </div>
            {props.repairSummary ? (
              <div className="workspace-home-metric-grid compact">
                <div className="summary-chip">
                  <span>Blocking</span>
                  <strong>{props.repairSummary.blockingCount}</strong>
                </div>
                <div className="summary-chip">
                  <span>Warnings</span>
                  <strong>{props.repairSummary.warningCount}</strong>
                </div>
                <div className="summary-chip">
                  <span>Runnable</span>
                  <strong>{props.repairSummary.runnableCount}</strong>
                </div>
              </div>
            ) : (
              <div className="empty-tab-state">Import a Request batch to start tracking runnable vs blocked work here.</div>
            )}
            {props.importSession ? (
              <Text size="sm" c="dimmed">
                Most recent import batch is ready to continue from Repair Center.
              </Text>
            ) : null}
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={props.onOpenRepair}>
                Open Repair
              </Button>
              <Button size="xs" variant="subtle" onClick={props.onOpenFirstBlocked} disabled={!props.repairSummary || props.repairSummary.blockingCount === 0}>
                First blocked
              </Button>
            </Group>
          </div>

          <div className="workspace-home-card">
            <div className="workspace-home-card-head">
              <div>
                <Text className="section-kicker">Recent Activity</Text>
                <h3 className="section-title">Last touchpoints</h3>
              </div>
            </div>
            <div className="workspace-home-activity-list">
              <div className="workspace-home-activity-item">
                <IconClockPlay size={14} />
                <span>{props.importSession ? `Imported ${props.importSession.importedRequestCount} requests` : 'No import activity yet'}</span>
              </div>
              <div className="workspace-home-activity-item">
                <IconHistory size={14} />
                <span>{props.recentSuccess ? `Last success: ${props.recentSuccess.requestName}` : 'No successful request run yet'}</span>
              </div>
              <div className="workspace-home-activity-item">
                <IconFolders size={14} />
                <span>{props.lastCollectionRun ? `Last collection: ${props.lastCollectionRun.collectionName}` : 'No collection run yet'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

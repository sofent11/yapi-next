import { useMemo, useState } from 'react';
import { Badge, Button, Checkbox, Code, Group, Menu, Select, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { AuthConfig, EnvironmentDocument, ProjectDocument, SessionSnapshot, WorkspaceIndex } from '@yapi-debugger/schema';
import { KeyValueEditor } from '../primitives/KeyValueEditor';
import { confirmAction } from '../../lib/dialogs';
import {
  buildVariableWorkflowCatalog,
  type VariableAuthoringAudit,
  type VariableWorkflowEditableLayerId,
  type VariableWorkflowEntry,
  type VariableWorkflowMutationApi,
  type WorkflowVariableMutation
} from '../../lib/variable-audit';

function authTypeOptions() {
  return [
    { value: 'none', label: 'none' },
    { value: 'bearer', label: 'bearer' },
    { value: 'basic', label: 'basic' },
    { value: 'apikey', label: 'api key' },
    { value: 'oauth2', label: 'oauth2' },
    { value: 'oauth1', label: 'oauth1' },
    { value: 'awsv4', label: 'aws signature v4' },
    { value: 'digest', label: 'digest' },
    { value: 'ntlm', label: 'ntlm' },
    { value: 'wsse', label: 'wsse' }
  ];
}

function toKeyValueRows(values: Record<string, string>) {
  return Object.entries(values).map(([name, value]) => ({ name, value, enabled: true, kind: 'text' as const }));
}

function mergeHeaderRows(sharedHeaders: EnvironmentDocument['headers'], localHeaders: EnvironmentDocument['headers']) {
  const output = [...sharedHeaders];
  const names = new Map(output.map((row, index) => [row.name.trim().toLowerCase(), index]));
  localHeaders.forEach(row => {
    const key = row.name.trim().toLowerCase();
    const existing = names.get(key);
    if (existing == null) {
      names.set(key, output.length);
      output.push(row);
      return;
    }
    output[existing] = row;
  });
  return output;
}

function rebuildEnvironment(environment: EnvironmentDocument, patch: Partial<EnvironmentDocument>) {
  const sharedVars = patch.sharedVars ?? environment.sharedVars ?? environment.vars ?? {};
  const localVars = patch.localVars ?? environment.localVars ?? {};
  const sharedHeaders = patch.sharedHeaders ?? environment.sharedHeaders ?? environment.headers ?? [];
  const localHeaders = patch.localHeaders ?? environment.localHeaders ?? [];
  const hasLocalOverlay = Object.keys(localVars).length > 0 || localHeaders.length > 0 || Boolean(environment.localFilePath);
  return {
    ...environment,
    ...patch,
    sharedVars,
    localVars,
    sharedHeaders,
    localHeaders,
    vars: {
      ...sharedVars,
      ...localVars
    },
    headers: mergeHeaderRows(sharedHeaders, localHeaders),
    overlayMode: hasLocalOverlay || environment.sharedFilePath ? 'overlay' : environment.overlayMode || 'standalone'
  };
}

type VariableQuickFixAction = {
  key: string;
  label: string;
  tone?: 'default' | 'danger';
  onClick: () => void;
};

type VariableBatchQuickFixAction = {
  key: string;
  label: string;
  successMessage: string;
  tone?: 'default' | 'danger';
  disabled: boolean;
  mutations: WorkflowVariableMutation[];
  confirm?: {
    title: string;
    message: string;
    detail: string;
    confirmLabel: string;
  };
};

function variableWorkflowResolutionOrder(layerId: string | null | undefined) {
  if (!layerId) return Number.MAX_SAFE_INTEGER;
  if (layerId === 'request') return 0;
  if (layerId.startsWith('folder-')) return 1;
  if (layerId === 'runtime') return 2;
  if (layerId === 'environment-local') return 3;
  if (layerId === 'environment-shared') return 4;
  if (layerId === 'project-runtime') return 5;
  if (layerId === 'builtin-baseUrl') return 6;
  if (layerId === 'prompt-defaults') return 7;
  return Number.MAX_SAFE_INTEGER - 1;
}

function findWorkflowDefinition(entry: VariableWorkflowEntry, layerId: VariableWorkflowEditableLayerId) {
  return entry.definitions.find(definition => definition.mutationLayerId === layerId) || null;
}

function winningWorkflowDefinition(entry: VariableWorkflowEntry) {
  return entry.definitions.find(definition => definition.winner) || entry.definitions[0] || null;
}

function buildVariableQuickFixActions(
  entry: VariableWorkflowEntry,
  workflowMutations: VariableWorkflowMutationApi
): VariableQuickFixAction[] {
  const actions: VariableQuickFixAction[] = [];
  const winningDefinition = winningWorkflowDefinition(entry);
  const winningValue = winningDefinition?.value ?? entry.winnerValue;
  const winningLayerId = winningDefinition?.layerId || null;
  const promptDefinition = findWorkflowDefinition(entry, 'prompt-defaults');

  (
    ['request', 'environment-shared', 'environment-local', 'project-runtime'] as const
  ).forEach(targetLayerId => {
    const controller = workflowMutations[targetLayerId];
    if (!controller?.available) return;

    const targetDefinition = findWorkflowDefinition(entry, targetLayerId);
    const promote =
      winningDefinition?.participatesInResolution &&
      variableWorkflowResolutionOrder(targetLayerId) < variableWorkflowResolutionOrder(winningLayerId);
    const isSeed = entry.requestMissing || !entry.hasResolutionSource;
    const isCurrentWinningLayer = !isSeed && winningDefinition?.mutationLayerId === targetLayerId;
    const wouldBeNoop = !promote && targetDefinition?.value === winningValue;

    if (isCurrentWinningLayer || wouldBeNoop) return;

    actions.push({
      key: `${entry.token}:${targetLayerId}`,
      label: isSeed
        ? `Seed into ${controller.label}`
        : promote
          ? `Promote winner into ${controller.label}`
          : `Copy winner into ${controller.label}`,
      onClick: () => controller.upsert(entry.token, winningValue)
    });
  });

  const promptController = workflowMutations['prompt-defaults'];
  if (promptController.available && winningDefinition && promptDefinition?.value !== winningValue) {
    actions.push({
      key: `${entry.token}:remember-prompt`,
      label: promptDefinition ? 'Update remembered prompt default' : 'Remember winning value as prompt default',
      onClick: () => promptController.upsert(entry.token, winningValue)
    });
  }

  if (promptController.available && promptDefinition) {
    actions.push({
      key: `${entry.token}:clear-prompt`,
      label: 'Clear remembered prompt default',
      tone: 'danger',
      onClick: () => promptController.remove(entry.token)
    });
  }

  entry.definitions.forEach(definition => {
    if (!definition.mutationLayerId || definition.winner) return;
    if (definition.mutationLayerId === 'prompt-defaults') return;
    const controller = workflowMutations[definition.mutationLayerId];
    if (!controller?.available) return;
    actions.push({
      key: `${entry.token}:remove:${definition.mutationLayerId}`,
      label: `Remove shadowed value from ${controller.label}`,
      tone: 'danger',
      onClick: () => controller.remove(entry.token)
    });
  });

  return actions;
}

function preferredSeedLayer(workflowMutations: VariableWorkflowMutationApi): VariableWorkflowEditableLayerId | null {
  const candidates: VariableWorkflowEditableLayerId[] = [
    'request',
    'environment-local',
    'environment-shared',
    'project-runtime'
  ];
  for (const layerId of candidates) {
    if (workflowMutations[layerId].available) return layerId;
  }
  return null;
}

function summarizeBatchMutationTargets(
  mutations: WorkflowVariableMutation[],
  workflowMutations: VariableWorkflowMutationApi,
  limit = 8
) {
  const targets = mutations
    .map(mutation => `${mutation.token} -> ${workflowMutations[mutation.layerId].label}`)
    .sort((left, right) => left.localeCompare(right));
  const preview = targets.slice(0, limit);
  const remaining = targets.length - preview.length;
  if (preview.length === 0) return 'No mutable targets detected.';
  if (remaining <= 0) return preview.join(' | ');
  return `${preview.join(' | ')} | +${remaining} more`;
}

function buildBatchQuickFixActions(
  entries: VariableWorkflowEntry[],
  workflowMutations: VariableWorkflowMutationApi
): VariableBatchQuickFixAction[] {
  const seedLayerId = preferredSeedLayer(workflowMutations);
  const seedMutations: WorkflowVariableMutation[] = [];
  const rememberPromptMutations: WorkflowVariableMutation[] = [];
  const cleanupMutations: WorkflowVariableMutation[] = [];
  const cleanupKeySet = new Set<string>();

  entries.forEach(entry => {
    const winningDefinition = winningWorkflowDefinition(entry);
    const winningValue = winningDefinition?.value ?? entry.winnerValue;
    const promptDefinition = findWorkflowDefinition(entry, 'prompt-defaults');

    if (seedLayerId && (entry.requestMissing || !entry.hasResolutionSource)) {
      seedMutations.push({
        layerId: seedLayerId,
        token: entry.token,
        value: winningValue
      });
    }

    if (
      workflowMutations['prompt-defaults'].available &&
      winningDefinition &&
      promptDefinition?.value !== winningValue
    ) {
      rememberPromptMutations.push({
        layerId: 'prompt-defaults',
        token: entry.token,
        value: winningValue
      });
    }

    entry.definitions.forEach(definition => {
      if (!definition.mutationLayerId || definition.winner) return;
      if (definition.mutationLayerId === 'prompt-defaults') return;
      if (!workflowMutations[definition.mutationLayerId].available) return;
      const mutationKey = `${entry.token}:${definition.mutationLayerId}`;
      if (cleanupKeySet.has(mutationKey)) return;
      cleanupKeySet.add(mutationKey);
      cleanupMutations.push({
        layerId: definition.mutationLayerId,
        token: entry.token,
        value: null
      });
    });
  });

  return [
    {
      key: 'seed-missing',
      label: seedLayerId ? `Seed missing (${seedMutations.length})` : 'Seed missing',
      successMessage: `Seeded ${seedMutations.length} missing token(s).`,
      disabled: seedMutations.length === 0,
      mutations: seedMutations
    },
    {
      key: 'remember-prompt',
      label: `Remember winners (${rememberPromptMutations.length})`,
      successMessage: `Updated ${rememberPromptMutations.length} prompt default(s).`,
      disabled: rememberPromptMutations.length === 0,
      mutations: rememberPromptMutations
    },
    {
      key: 'cleanup-shadowed',
      label: `Clean shadowed (${cleanupMutations.length})`,
      successMessage: `Removed ${cleanupMutations.length} shadowed value(s).`,
      tone: 'danger',
      disabled: cleanupMutations.length === 0,
      mutations: cleanupMutations,
      confirm:
        cleanupMutations.length > 0
          ? {
              title: 'Clean Shadowed Values',
              message: `Remove ${cleanupMutations.length} shadowed value(s) from editable layers?`,
              detail: summarizeBatchMutationTargets(cleanupMutations, workflowMutations),
              confirmLabel: 'Clean Shadowed'
            }
          : undefined
    }
  ];
}

function VariableWorkflowQuickFixMenu(props: {
  entry: VariableWorkflowEntry;
  workflowMutations: VariableWorkflowMutationApi;
}) {
  const actions = buildVariableQuickFixActions(props.entry, props.workflowMutations);

  if (actions.length === 0) return null;

  return (
    <Menu width={280} position="bottom-end" withinPortal>
      <Menu.Target>
        <Button size="xs" variant="default">
          Quick fix
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{props.entry.token}</Menu.Label>
        {actions.map(action => (
          <Menu.Item
            key={action.key}
            color={action.tone === 'danger' ? 'red' : undefined}
            onClick={action.onClick}
          >
            {action.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

export function EnvironmentCenterPanel(props: {
  workspace: WorkspaceIndex;
  draftProject: ProjectDocument | null;
  activeEnvironmentName: string;
  selectedEnvironment: EnvironmentDocument | null;
  activeRequestName?: string | null;
  variableAudit?: VariableAuthoringAudit | null;
  runtimeVariables: Record<string, string>;
  promptVariables: Record<string, string>;
  sessionSnapshot: SessionSnapshot | null;
  hostSnapshots: Array<{ host: string; snapshot: SessionSnapshot }>;
  targetUrl: string | null;
  onEnvironmentChange: (name: string) => void;
  onProjectChange: (project: ProjectDocument) => void;
  onEnvironmentUpdate: (name: string, updater: (environment: EnvironmentDocument) => EnvironmentDocument) => void;
  onAddEnvironment: () => void;
  onRefreshSession: () => void;
  onClearSession: () => void;
  onClearRuntimeVars: () => void;
  onPromptVariablesChange: (values: Record<string, string>) => void;
  onClearPromptVars: () => void;
  workflowMutations: VariableWorkflowMutationApi;
  onSave: () => void;
}) {
  const selectedEnvironment = props.selectedEnvironment;
  const project = props.draftProject || props.workspace.project;
  const runtimeEntries = Object.entries(props.runtimeVariables);
  const promptEntries = Object.entries(props.promptVariables);
  const sharedVarCount = Object.keys(selectedEnvironment?.sharedVars || selectedEnvironment?.vars || {}).length;
  const localVarCount = Object.keys(selectedEnvironment?.localVars || {}).length;
  const sharedHeaderCount = (selectedEnvironment?.sharedHeaders || selectedEnvironment?.headers || []).length;
  const localHeaderCount = (selectedEnvironment?.localHeaders || []).length;
  const authProfileCount = selectedEnvironment?.authProfiles.length || 0;
  const hasOverlay = localVarCount > 0 || localHeaderCount > 0 || Boolean(selectedEnvironment?.localFilePath);
  const variableAudit = props.variableAudit || null;
  const activeEnvironmentLabel = selectedEnvironment?.name || props.activeEnvironmentName || 'No environment selected';
  const [workflowFilter, setWorkflowFilter] = useState<'all' | 'shadowed' | 'active-request' | 'prompt-defaults'>('shadowed');
  const [workflowQuery, setWorkflowQuery] = useState('');
  const workflowCatalog = useMemo(
    () =>
      buildVariableWorkflowCatalog({
        project,
        environment: selectedEnvironment,
        runtimeVariables: props.runtimeVariables,
        promptVariables: props.promptVariables,
        variableAudit
      }),
    [project, selectedEnvironment, props.runtimeVariables, props.promptVariables, variableAudit]
  );
  const workflowEntryByToken = useMemo(
    () => new Map(workflowCatalog.entries.map(entry => [entry.token, entry])),
    [workflowCatalog.entries]
  );
  const filteredWorkflowEntries = useMemo(() => {
    const needle = workflowQuery.trim().toLowerCase();
    return workflowCatalog.entries.filter(entry => {
      if (workflowFilter === 'shadowed' && !entry.conflict) return false;
      if (workflowFilter === 'active-request' && !entry.requestLinked) return false;
      if (workflowFilter === 'prompt-defaults' && !entry.hasPromptDefault) return false;
      if (!needle) return true;
      return (
        entry.token.toLowerCase().includes(needle) ||
        entry.winnerLabel.toLowerCase().includes(needle) ||
        entry.definitions.some(definition => definition.label.toLowerCase().includes(needle))
      );
    });
  }, [workflowCatalog.entries, workflowFilter, workflowQuery]);
  const batchQuickFixActions = useMemo(
    () => buildBatchQuickFixActions(filteredWorkflowEntries, props.workflowMutations),
    [filteredWorkflowEntries, props.workflowMutations]
  );

  async function handleBatchQuickFix(action: VariableBatchQuickFixAction) {
    if (action.disabled || action.mutations.length === 0) return;
    if (action.confirm) {
      const confirmed = await confirmAction({
        title: action.confirm.title,
        message: action.confirm.message,
        detail: action.confirm.detail,
        confirmLabel: action.confirm.confirmLabel
      });
      if (!confirmed) return;
    }
    props.workflowMutations.applyMany(action.mutations);
    notifications.show({
      color: action.tone === 'danger' ? 'orange' : 'teal',
      message: action.successMessage
    });
  }

  return (
    <section className="workspace-main environment-center">
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">{project.name}</span>
          <span className="breadcrumb-chip">Environments</span>
        </div>
        <div className="panel-toolbar-actions">
          <Button size="xs" variant="default" onClick={props.onAddEnvironment}>New Environment</Button>
          <Button size="xs" variant="default" onClick={props.onRefreshSession}>Refresh Runtime</Button>
          <Button size="xs" onClick={props.onSave}>Save</Button>
        </div>
      </div>

      <div className="center-intro">
        <Text size="sm" c="dimmed">
          Keep shared configuration, local secrets, and runtime session state separate so the team can collaborate safely without losing fast local debugging.
        </Text>
        <div className="summary-grid center-summary-grid">
          <div className="summary-chip">
            <span>Active Env</span>
            <strong>{activeEnvironmentLabel}</strong>
          </div>
          <div className="summary-chip">
            <span>Overlay</span>
            <strong>{selectedEnvironment ? (hasOverlay ? 'Local overrides on' : 'Shared only') : 'Not available'}</strong>
          </div>
          <div className="summary-chip">
            <span>Request Focus</span>
            <strong>{props.activeRequestName || 'Select a request'}</strong>
          </div>
          <div className="summary-chip">
            <span>Runtime State</span>
            <strong>{runtimeEntries.length} vars · {props.sessionSnapshot?.cookies.length || 0} cookies</strong>
          </div>
        </div>
      </div>

      <div className="environment-layout">
        <aside className="environment-sidebar">
          <div className="sidebar-section-head">
            <Text fw={700} size="sm">Environment List</Text>
            <Text size="xs" c="dimmed">Choose which named environment the workspace should use right now.</Text>
          </div>
          <div className="environment-list">
            {props.workspace.environments.map(item => {
              const mergedVarCount = Object.keys(item.document.vars || {}).length;
              const overlayCount = Object.keys(item.document.localVars || {}).length + (item.document.localHeaders || []).length;
              return (
                <button
                  key={item.document.name}
                  type="button"
                  className={item.document.name === props.activeEnvironmentName ? 'environment-item is-active' : 'environment-item'}
                  onClick={() => props.onEnvironmentChange(item.document.name)}
                >
                  <strong>{item.document.name}</strong>
                  <span>{mergedVarCount} vars · {item.document.authProfiles.length} auth profiles</span>
                  <span>{overlayCount > 0 ? `${overlayCount} local overrides` : 'No local overlay'}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="environment-main">
          <section className="inspector-section">
            <div className="checks-head">
              <div>
                <Text className="section-kicker">Workspace Runtime</Text>
                <h3 className="section-title">Project-level defaults</h3>
              </div>
            </div>
            <Text size="sm" c="dimmed">
              These defaults belong to the workspace itself. They are shared infrastructure, not session state.
            </Text>
            <div className="settings-grid" style={{ marginTop: 12 }}>
              <TextInput
                label="Default Base URL"
                value={project.runtime.baseUrl}
                onChange={event =>
                  props.onProjectChange({
                    ...project,
                    runtime: {
                      ...project.runtime,
                      baseUrl: event.currentTarget.value
                    }
                  })
                }
              />
            </div>
            <KeyValueEditor
              rows={project.runtime.headers}
              onChange={rows =>
                props.onProjectChange({
                  ...project,
                  runtime: {
                    ...project.runtime,
                    headers: rows
                  }
                })
              }
              nameLabel="Header"
              valueLabel="Value"
            />
          </section>

          {selectedEnvironment ? (
            <>
              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Environment Summary</Text>
                    <h3 className="section-title">{selectedEnvironment.name}</h3>
                  </div>
                  <Badge color={hasOverlay ? 'orange' : 'gray'} variant="light">
                    {hasOverlay ? 'Has local overlay' : 'Shared only'}
                  </Badge>
                </div>
                <div className="summary-grid">
                  <div className="summary-chip">
                    <span>Shared Vars</span>
                    <strong>{sharedVarCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Local Vars</span>
                    <strong>{localVarCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Headers</span>
                    <strong>{sharedHeaderCount + localHeaderCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Auth Profiles</span>
                    <strong>{authProfileCount}</strong>
                  </div>
                </div>
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Variable Audit</Text>
                    <h3 className="section-title">Current request precedence</h3>
                  </div>
                  {variableAudit ? (
                    <Badge color={variableAudit.missingCount > 0 ? 'red' : variableAudit.conflictCount > 0 ? 'orange' : 'teal'} variant="light">
                      {variableAudit.missingCount} missing · {variableAudit.conflictCount} shadowed
                    </Badge>
                  ) : null}
                </div>
                {variableAudit ? (
                  <>
                    <Text size="sm" c="dimmed">
                      Review which layer currently wins for <strong>{variableAudit.requestName}</strong>, which duplicate values are shadowed,
                      and where to edit the active source without changing runtime precedence.
                    </Text>
                    <Text size="xs" c="dimmed" mt="sm">
                      Precedence: {variableAudit.precedenceLabels.join(' → ') || 'No variable layers are active for the current request.'}
                    </Text>
                    <div className="summary-grid" style={{ marginTop: 12 }}>
                      <div className="summary-chip">
                        <span>Detected Tokens</span>
                        <strong>{variableAudit.entries.length}</strong>
                      </div>
                      <div className="summary-chip">
                        <span>Missing</span>
                        <strong>{variableAudit.missingCount}</strong>
                      </div>
                      <div className="summary-chip">
                        <span>Shadowed</span>
                        <strong>{variableAudit.conflictCount}</strong>
                      </div>
                    </div>
                    {variableAudit.entries.length === 0 ? (
                      <div className="empty-tab-state" style={{ marginTop: 12 }}>
                        The current request does not reference any template variables yet.
                      </div>
                    ) : (
                      <div className="variable-authoring-list">
                        {variableAudit.entries.map(variable => {
                          const workflowEntry = workflowEntryByToken.get(variable.token);
                          return (
                            <div key={variable.token} className="variable-authoring-card">
                            <div className="variable-authoring-head">
                              <div className="variable-authoring-copy">
                                <strong>{variable.token}</strong>
                                <span>{variable.sourceLabel}</span>
                              </div>
                              <Group gap="xs">
                                {workflowEntry ? (
                                  <VariableWorkflowQuickFixMenu
                                    entry={workflowEntry}
                                    workflowMutations={props.workflowMutations}
                                  />
                                ) : null}
                                <Badge color={variable.missing ? 'red' : variable.conflict ? 'orange' : 'teal'} variant="light">
                                  {variable.missing ? 'missing' : variable.conflict ? 'shadowed' : 'resolved'}
                                </Badge>
                                <Code>{variable.missing ? 'unresolved' : variable.value || 'empty'}</Code>
                              </Group>
                            </div>
                            <Text size="xs" c="dimmed">
                              Used in {variable.locations.join(' · ') || 'request preview'}
                            </Text>
                            {!variable.missing ? (
                              <Text size="xs" c="dimmed">
                                Winning edit path: {variable.winnerHint}
                              </Text>
                            ) : null}
                            {variable.definitions.length > 0 ? (
                              <div className="variable-definition-list">
                                {variable.definitions.map(definition => (
                                  <div
                                    key={`${variable.token}:${definition.layerId}`}
                                    className={definition.winner ? 'variable-definition-row is-winning' : 'variable-definition-row'}
                                  >
                                    <div className="variable-authoring-copy">
                                      <strong>{definition.label}</strong>
                                      <span>{definition.editHint}</span>
                                    </div>
                                    <div className="variable-definition-meta">
                                      <Code>{definition.value || 'empty'}</Code>
                                      <Badge variant="light" color={definition.winner ? 'teal' : 'gray'}>
                                        {definition.winner ? 'winning' : definition.editable ? 'shadowed' : 'inspect only'}
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="empty-tab-state">
                    {props.activeRequestName
                      ? 'Resolve the active request preview first to inspect variable precedence and shadowing.'
                      : 'Select a request to inspect variable precedence, conflicts, and edit ownership.'}
                  </div>
                )}
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Cross-scope Catalog</Text>
                    <h3 className="section-title">Variable ownership and duplicate names</h3>
                  </div>
                  <Badge color={workflowCatalog.conflictCount > 0 ? 'orange' : 'teal'} variant="light">
                    {workflowCatalog.conflictCount} shadowed · {workflowCatalog.requestLinkedCount} active request
                  </Badge>
                </div>
                <Text size="sm" c="dimmed">
                  Scan project, environment, runtime, and remembered prompt layers together so duplicate names can be cleaned up before they create request-level surprises.
                </Text>
                <div className="summary-grid" style={{ marginTop: 12 }}>
                  <div className="summary-chip">
                    <span>Known Tokens</span>
                    <strong>{workflowCatalog.tokenCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Shadowed</span>
                    <strong>{workflowCatalog.conflictCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Prompt Defaults</span>
                    <strong>{workflowCatalog.promptDefaultCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Active Request</span>
                    <strong>{workflowCatalog.requestLinkedCount}</strong>
                  </div>
                </div>
                <div className="variable-workflow-toolbar">
                  <TextInput
                    size="xs"
                    placeholder="Search token or scope"
                    value={workflowQuery}
                    onChange={event => setWorkflowQuery(event.currentTarget.value)}
                  />
                  <Select
                    size="xs"
                    value={workflowFilter}
                    data={[
                      { value: 'all', label: 'All tokens' },
                      { value: 'shadowed', label: 'Shadowed only' },
                      { value: 'active-request', label: 'Active request only' },
                      { value: 'prompt-defaults', label: 'Prompt defaults only' }
                    ]}
                    onChange={value =>
                      setWorkflowFilter((value as 'all' | 'shadowed' | 'active-request' | 'prompt-defaults') || 'all')
                    }
                  />
                </div>
                <div className="variable-workflow-actions">
                  {batchQuickFixActions.map(action => (
                    <Button
                      key={action.key}
                      size="xs"
                      variant="default"
                      color={action.tone === 'danger' ? 'red' : undefined}
                      disabled={action.disabled}
                      onClick={() => {
                        void handleBatchQuickFix(action);
                      }}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
                {filteredWorkflowEntries.length === 0 ? (
                  <div className="empty-tab-state" style={{ marginTop: 12 }}>
                    No variables match this filter yet.
                  </div>
                ) : (
                  <div className="variable-authoring-list">
                    {filteredWorkflowEntries.map(entry => (
                      <div key={entry.token} className="variable-authoring-card">
                        <div className="variable-authoring-head">
                          <div className="variable-authoring-copy">
                            <strong>{entry.token}</strong>
                            <span>
                              {entry.requestLinked
                                ? entry.requestMissing
                                  ? `Referenced by ${variableAudit?.requestName || 'the active request'} but unresolved.`
                                  : `Referenced by ${variableAudit?.requestName || 'the active request'}.`
                                : 'Not currently referenced by the active request.'}
                            </span>
                          </div>
                          <Group gap="xs">
                            <VariableWorkflowQuickFixMenu
                              entry={entry}
                              workflowMutations={props.workflowMutations}
                            />
                            {entry.requestLinked ? (
                              <Badge color={entry.requestMissing ? 'red' : 'blue'} variant="light">
                                {entry.requestMissing ? 'request missing' : 'active request'}
                              </Badge>
                            ) : null}
                            <Badge color={entry.conflict ? 'orange' : entry.hasResolutionSource ? 'teal' : 'gray'} variant="light">
                              {entry.conflict ? 'shadowed' : entry.hasResolutionSource ? 'single source' : 'prompt only'}
                            </Badge>
                            <Code>{entry.winnerValue || 'empty'}</Code>
                          </Group>
                        </div>
                        <Text size="xs" c="dimmed">
                          Current winner: {entry.winnerLabel}. {entry.winnerHint}
                        </Text>
                        {entry.definitions.length > 0 ? (
                          <div className="variable-definition-list">
                            {entry.definitions.map(definition => (
                              <div
                                key={`${entry.token}:${definition.layerId}`}
                                className={definition.winner ? 'variable-definition-row is-winning' : 'variable-definition-row'}
                              >
                                <div className="variable-authoring-copy">
                                  <strong>{definition.label}</strong>
                                  <span>{definition.editHint}</span>
                                </div>
                                <div className="variable-definition-meta">
                                  <Code>{definition.value || 'empty'}</Code>
                                  <Badge
                                    variant="light"
                                    color={definition.winner ? 'teal' : definition.participatesInResolution ? 'gray' : 'blue'}
                                  >
                                    {definition.winner
                                      ? 'winning'
                                      : definition.participatesInResolution
                                        ? definition.editable
                                          ? 'available'
                                          : 'inspect only'
                                        : 'prompt default'}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Shared Layer</Text>
                    <h3 className="section-title">Values that can enter Git</h3>
                  </div>
                </div>
                <Text size="sm" c="dimmed">
                  Keep only safe, collaborative defaults here. Everyone sharing this workspace will see these values.
                </Text>
                <div className="environment-layer-grid">
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Shared Variables</Text>
                    <KeyValueEditor
                      rows={toKeyValueRows(selectedEnvironment.sharedVars || selectedEnvironment.vars || {})}
                      onChange={rows =>
                        props.onEnvironmentUpdate(selectedEnvironment.name, environment =>
                          rebuildEnvironment(environment, {
                            sharedVars: Object.fromEntries(rows.filter(row => row.name.trim()).map(row => [row.name.trim(), row.value]))
                          })
                        )
                      }
                    />
                  </div>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Shared Headers</Text>
                    <KeyValueEditor
                      rows={selectedEnvironment.sharedHeaders || selectedEnvironment.headers}
                      onChange={rows =>
                        props.onEnvironmentUpdate(selectedEnvironment.name, environment =>
                          rebuildEnvironment(environment, {
                            sharedHeaders: rows
                          })
                        )
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Local Layer</Text>
                    <h3 className="section-title">Machine-only sensitive overrides</h3>
                  </div>
                </div>
                <Text size="sm" c="dimmed">
                  These values stay in `{selectedEnvironment.name}.local.yaml` and should not be committed. Use them for tokens, temp hosts, and personal overrides.
                </Text>
                <div className="environment-layer-grid">
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Local Variables</Text>
                    <KeyValueEditor
                      rows={toKeyValueRows(selectedEnvironment.localVars || {})}
                      onChange={rows =>
                        props.onEnvironmentUpdate(selectedEnvironment.name, environment =>
                          rebuildEnvironment(environment, {
                            localVars: Object.fromEntries(rows.filter(row => row.name.trim()).map(row => [row.name.trim(), row.value]))
                          })
                        )
                      }
                    />
                  </div>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Local Headers</Text>
                    <KeyValueEditor
                      rows={selectedEnvironment.localHeaders || []}
                      onChange={rows =>
                        props.onEnvironmentUpdate(selectedEnvironment.name, environment =>
                          rebuildEnvironment(environment, {
                            localHeaders: rows
                          })
                        )
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Auth Profiles</Text>
                    <h3 className="section-title">Reusable environment auth</h3>
                  </div>
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() =>
                      props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                        ...environment,
                        authProfiles: [
                          ...environment.authProfiles,
                          {
                            name: `profile-${environment.authProfiles.length + 1}`,
                            auth: { type: 'bearer', token: '' }
                          }
                        ]
                      }))
                    }
                  >
                    Add Profile
                  </Button>
                </div>
                <Text size="sm" c="dimmed">
                  Separate auth profiles from general variables so requests can reference a durable auth strategy instead of duplicating secret fields.
                </Text>
                {selectedEnvironment.authProfiles.length === 0 ? (
                  <div className="empty-tab-state">No auth profile yet. Add one if this environment should inject bearer, basic, API key, or OAuth credentials.</div>
                ) : (
                  <div className="checks-list">
                    {selectedEnvironment.authProfiles.map(profile => (
                      <div key={profile.name} className="check-card" style={{ margin: 0 }}>
                        <div className="settings-grid">
                          <TextInput
                            label="Profile Name"
                            value={profile.name}
                            onChange={event =>
                              props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                ...environment,
                                authProfiles: environment.authProfiles.map(item =>
                                  item.name === profile.name ? { ...item, name: event.currentTarget.value } : item
                                )
                              }))
                            }
                          />
                          <Select
                            label="Auth Type"
                            value={profile.auth.type === 'inherit' ? 'none' : profile.auth.type}
                            data={authTypeOptions()}
                            onChange={value =>
                              props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                ...environment,
                                authProfiles: environment.authProfiles.map(item =>
                                  item.name === profile.name
                                    ? { ...item, auth: { type: (value as AuthConfig['type']) || 'none' } }
                                    : item
                                )
                              }))
                            }
                          />
                          {profile.auth.type === 'bearer' ? (
                            <>
                              <TextInput
                                label="Bearer Token"
                                value={profile.auth.token || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, token: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Token Variable"
                                value={profile.auth.tokenFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, tokenFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                            </>
                          ) : null}
                          {profile.auth.type === 'basic' ? (
                            <>
                              <TextInput
                                label="Username"
                                value={profile.auth.username || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, username: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Password"
                                value={profile.auth.password || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, password: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Username Variable"
                                value={profile.auth.usernameFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, usernameFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Password Variable"
                                value={profile.auth.passwordFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, passwordFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                            </>
                          ) : null}
                          {profile.auth.type === 'apikey' ? (
                            <>
                              <TextInput
                                label="Key"
                                value={profile.auth.key || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, key: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Value"
                                value={profile.auth.value || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, value: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Value Variable"
                                value={profile.auth.valueFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, valueFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <Select
                                label="Send To"
                                value={profile.auth.addTo || 'header'}
                                data={[
                                  { value: 'header', label: 'Header' },
                                  { value: 'query', label: 'Query' }
                                ]}
                                onChange={value =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, addTo: (value as AuthConfig['addTo']) || 'header' } }
                                        : item
                                    )
                                  }))
                                }
                              />
                            </>
                          ) : null}
                          {profile.auth.type === 'oauth2' ? (
                            <>
                              <Select
                                label="OAuth Flow"
                                value={profile.auth.oauthFlow || 'client_credentials'}
                                data={[
                                  { value: 'client_credentials', label: 'client_credentials' },
                                  { value: 'authorization_code', label: 'authorization_code' },
                                  { value: 'password', label: 'password' },
                                  { value: 'implicit', label: 'implicit' }
                                ]}
                                onChange={value =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, oauthFlow: (value as AuthConfig['oauthFlow']) || 'client_credentials' } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              {profile.auth.oauthFlow === 'authorization_code' || profile.auth.oauthFlow === 'implicit' ? (
                                <>
                                  <TextInput
                                    label="Authorization URL"
                                    value={profile.auth.authorizationUrl || ''}
                                    onChange={event =>
                                      props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                        ...environment,
                                        authProfiles: environment.authProfiles.map(item =>
                                          item.name === profile.name
                                            ? { ...item, auth: { ...item.auth, authorizationUrl: event.currentTarget.value } }
                                            : item
                                        )
                                      }))
                                    }
                                  />
                                  <TextInput
                                    label="Callback URL"
                                    value={profile.auth.callbackUrl || ''}
                                    onChange={event =>
                                      props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                        ...environment,
                                        authProfiles: environment.authProfiles.map(item =>
                                          item.name === profile.name
                                            ? { ...item, auth: { ...item.auth, callbackUrl: event.currentTarget.value } }
                                            : item
                                        )
                                      }))
                                    }
                                  />
                                </>
                              ) : null}
                              <TextInput
                                label="Token URL"
                                value={profile.auth.tokenUrl || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, tokenUrl: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Client ID"
                                value={profile.auth.clientId || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, clientId: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Client ID Variable"
                                value={profile.auth.clientIdFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, clientIdFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Client Secret"
                                value={profile.auth.clientSecret || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, clientSecret: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Client Secret Variable"
                                value={profile.auth.clientSecretFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, clientSecretFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Scope"
                                value={profile.auth.scope || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, scope: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <Select
                                label="Token Placement"
                                value={profile.auth.tokenPlacement || 'header'}
                                data={[
                                  { value: 'header', label: 'Header' },
                                  { value: 'query', label: 'Query' }
                                ]}
                                onChange={value =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, tokenPlacement: (value as AuthConfig['tokenPlacement']) || 'header' } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Token Name"
                                value={profile.auth.tokenName || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, tokenName: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Token Prefix"
                                value={profile.auth.tokenPrefix || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, tokenPrefix: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput label="Cached Token" value={profile.auth.accessToken || ''} readOnly />
                              <TextInput label="Cache Expires At" value={profile.auth.expiresAt || ''} readOnly />
                            </>
                          ) : null}
                          {profile.auth.type === 'oauth1' ? (
                            <>
                              <TextInput label="Consumer Key" value={profile.auth.consumerKey || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, consumerKey: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              <TextInput label="Consumer Secret" value={profile.auth.consumerSecret || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, consumerSecret: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                            </>
                          ) : null}
                          {profile.auth.type === 'awsv4' ? (
                            <>
                              <TextInput label="Access Key" value={profile.auth.accessKey || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, accessKey: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              <TextInput label="Secret Key" value={profile.auth.secretKey || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, secretKey: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              <TextInput label="Region" value={profile.auth.region || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, region: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              <TextInput label="Service" value={profile.auth.service || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, service: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                            </>
                          ) : null}
                          {profile.auth.type === 'digest' || profile.auth.type === 'ntlm' || profile.auth.type === 'wsse' ? (
                            <>
                              <TextInput label="Username" value={profile.auth.username || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, username: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              <TextInput label="Password" value={profile.auth.password || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, password: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              {profile.auth.type === 'ntlm' ? (
                                <Text size="xs" c="dimmed">
                                  Desktop NTLM uses explicit username/password credentials only. Native OS/integrated enterprise flows are not available in this build.
                                </Text>
                              ) : null}
                              {profile.auth.type === 'digest' ? (
                                <>
                                  <TextInput label="Realm" value={profile.auth.realm || ''} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, realm: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Nonce" value={profile.auth.nonce || ''} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, nonce: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="QOP" value={profile.auth.qop || 'auth'} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, qop: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Algorithm" value={profile.auth.algorithm || 'MD5'} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, algorithm: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Opaque" value={profile.auth.opaque || ''} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, opaque: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Client Nonce" value={profile.auth.cnonce || ''} placeholder="Auto generated" onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, cnonce: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Nonce Count" value={profile.auth.nonceCount || '00000001'} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, nonceCount: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                </>
                              ) : null}
                              {profile.auth.type === 'wsse' ? (
                                <>
                                  <TextInput label="Nonce" value={profile.auth.nonce || ''} placeholder="Auto generated" onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, nonce: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Created" value={profile.auth.created || ''} placeholder="Auto generated ISO timestamp" onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, created: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Password Digest" value={profile.auth.passwordDigest || ''} placeholder="Optional override" onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, passwordDigest: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                        <Checkbox label="Stored in the selected environment file" checked readOnly />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Runtime Layer</Text>
                    <h3 className="section-title">Current session and extracted state</h3>
                  </div>
                  <Group gap="xs">
                    <Button size="xs" variant="default" onClick={props.onClearPromptVars}>Clear Prompt Vars</Button>
                    <Button size="xs" variant="default" onClick={props.onClearRuntimeVars}>Clear Runtime Vars</Button>
                    <Button size="xs" variant="default" color="red" onClick={props.onClearSession}>Clear Cookie Jar</Button>
                  </Group>
                </div>
                <Text size="sm" c="dimmed">
                  Nothing below is durable workspace configuration. These values only describe the current debugging session and can be regenerated.
                </Text>
                <Text size="xs" c="dimmed" mt="sm">
                  Current target URL: {props.targetUrl || 'No active request preview yet'}
                </Text>
                <div className="summary-grid" style={{ marginTop: 12 }}>
                  <div className="summary-chip">
                    <span>Runtime Vars</span>
                    <strong>{runtimeEntries.length}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Prompt Vars</span>
                    <strong>{promptEntries.length}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Cookies</span>
                    <strong>{props.sessionSnapshot?.cookies.length || 0}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Host Snapshots</span>
                    <strong>{props.hostSnapshots.length}</strong>
                  </div>
                </div>

                <div className="environment-layer-grid" style={{ marginTop: 16 }}>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Remembered Prompt Values</Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      Prompt rows still ask before send, but these workspace-scoped values become the default across requests and auth refreshes.
                    </Text>
                    <KeyValueEditor
                      rows={toKeyValueRows(props.promptVariables)}
                      onChange={rows =>
                        props.onPromptVariablesChange(
                          Object.fromEntries(rows.filter(row => row.name.trim()).map(row => [row.name.trim(), row.value]))
                        )
                      }
                    />
                  </div>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Runtime Variables</Text>
                    {runtimeEntries.length === 0 ? (
                      <div className="empty-tab-state">No runtime variables yet. Extract values from responses when you want downstream requests to reuse them.</div>
                    ) : (
                      <div className="json-inspector-list" style={{ marginTop: 12 }}>
                        {runtimeEntries.map(([name, value]) => (
                          <div key={name} className="json-inspector-row">
                            <div className="json-inspector-copy">
                              <strong>{name}</strong>
                              <span>{value}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Current Cookie Header</Text>
                    <Code block style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
                      {props.sessionSnapshot?.cookieHeader || ''}
                    </Code>
                  </div>
                </div>

                {props.hostSnapshots.length > 0 ? (
                  <div className="checks-list" style={{ marginTop: 16 }}>
                    {props.hostSnapshots.map(item => (
                      <div key={item.host} className="check-card" style={{ margin: 0 }}>
                        <Text fw={700}>{item.host}</Text>
                        <Text size="xs" c="dimmed">{item.snapshot.cookies.length} cookies captured for this host</Text>
                        <Code block style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
                          {item.snapshot.cookieHeader || ''}
                        </Code>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            </>
          ) : (
            <div className="empty-tab-state">Choose an environment first. Then edit shared defaults, local overrides, auth profiles, and runtime session state from one place.</div>
          )}
        </div>
      </div>
    </section>
  );
}

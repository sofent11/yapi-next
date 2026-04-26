import type {
  EnvironmentDocument,
  ProjectDocument,
  RequestDocument,
  ResolvedRequestInsight
} from '@yapi-debugger/schema';

type RequestVariableRow = RequestDocument['vars']['req'][number];

export const VARIABLE_WORKFLOW_EDITABLE_LAYERS = [
  'request',
  'prompt-defaults',
  'environment-shared',
  'environment-local',
  'project-runtime'
] as const;

export type VariableWorkflowEditableLayerId = (typeof VARIABLE_WORKFLOW_EDITABLE_LAYERS)[number];

export type VariableAuthoringDefinition = {
  layerId: string;
  label: string;
  value: string;
  editHint: string;
  winner: boolean;
  editable: boolean;
  mutationLayerId?: VariableWorkflowEditableLayerId;
};

export type VariableAuthoringEntry = {
  token: string;
  value: string;
  source: ResolvedRequestInsight['variables'][number]['source'];
  sourceLabel: string;
  missing: boolean;
  conflict: boolean;
  locations: string[];
  winnerHint: string;
  definitions: VariableAuthoringDefinition[];
};

export type VariableAuthoringAudit = {
  requestName: string;
  precedenceLabels: string[];
  entries: VariableAuthoringEntry[];
  conflictCount: number;
  missingCount: number;
};

type VariableLayer = {
  id: string;
  label: string;
  editHint: string;
  values: Record<string, string>;
  participatesInResolution: boolean;
  mutationLayerId?: VariableWorkflowEditableLayerId;
};

export type VariableWorkflowDefinition = VariableAuthoringDefinition & {
  participatesInResolution: boolean;
  editable: boolean;
  mutationLayerId?: VariableWorkflowEditableLayerId;
};

export type VariableWorkflowEntry = {
  token: string;
  definitions: VariableWorkflowDefinition[];
  winnerLabel: string;
  winnerValue: string;
  winnerHint: string;
  conflict: boolean;
  requestLinked: boolean;
  requestMissing: boolean;
  hasPromptDefault: boolean;
  hasResolutionSource: boolean;
};

export type VariableWorkflowCatalog = {
  entries: VariableWorkflowEntry[];
  tokenCount: number;
  conflictCount: number;
  requestLinkedCount: number;
  promptDefaultCount: number;
};

/**
 * Describes a create/update/delete operation on one of the mutable variable layers
 * reachable from the Environment Center workflow catalog.
 *
 * - value !== null  → upsert (create or overwrite) the token in that layer
 * - value === null  → delete the token from that layer
 *
 * Folder layers (folder-*) are intentionally omitted — they are inspect-only.
 * The builtin-baseUrl layer is also excluded; edit it via the baseUrl field instead.
 */
export type WorkflowVariableMutation = {
  layerId: VariableWorkflowEditableLayerId;
  token: string;
  value: string | null;
};

export type VariableWorkflowMutationController = {
  layerId: VariableWorkflowEditableLayerId;
  label: string;
  available: boolean;
  unavailableReason?: string;
  upsert: (token: string, value: string) => void;
  remove: (token: string) => void;
};

export type VariableWorkflowMutationApi = Record<VariableWorkflowEditableLayerId, VariableWorkflowMutationController> & {
  applyMany: (mutations: WorkflowVariableMutation[]) => void;
};

function readDebugSourceLabel(source: Record<string, unknown>) {
  const meta = source.__debugSource;
  if (!meta || typeof meta !== 'object') return '';
  return typeof (meta as Record<string, unknown>).label === 'string' ? String((meta as Record<string, unknown>).label) : '';
}

function stripDebugSource(source: Record<string, unknown>) {
  const entries = Object.entries(source).filter(([key]) => key !== '__debugSource');
  return Object.fromEntries(entries.map(([key, value]) => [key, String(value ?? '')]));
}

function sanitizeVariableToken(token: string) {
  return token.trim();
}

function requestVariableRows(request: RequestDocument): RequestVariableRow[] {
  return request.vars?.req || [];
}

export function normalizeRequestVariableRowDraft(
  row: Partial<RequestVariableRow>,
  scope: 'request' | 'prompt' = 'request'
): RequestVariableRow {
  return {
    name: row.name || '',
    value: row.value || '',
    enabled: row.enabled ?? true,
    kind: 'text',
    filePath: undefined,
    scope: row.scope === 'prompt' ? 'prompt' : scope,
    secret: row.secret ?? false,
    description: row.description || ''
  };
}

export function upsertRequestVariableValue(
  rows: RequestVariableRow[],
  token: string,
  value: string,
  scope: 'request' | 'prompt'
) {
  const normalizedToken = sanitizeVariableToken(token);
  if (!normalizedToken) return rows;

  let matched = false;
  const nextRows: RequestVariableRow[] = [];

  rows.forEach(row => {
    const rowScope = row.scope === 'prompt' ? 'prompt' : 'request';
    if (rowScope !== scope || row.name.trim() !== normalizedToken) {
      nextRows.push(row);
      return;
    }
    if (matched) return;
    matched = true;
    nextRows.push({
      ...row,
      name: normalizedToken,
      value,
      enabled: true,
      scope
    });
  });

  if (!matched) {
    nextRows.push(
      normalizeRequestVariableRowDraft(
        {
          name: normalizedToken,
          value,
          enabled: true,
          scope
        },
        scope
      )
    );
  }

  return nextRows;
}

export function removeRequestVariableValue(
  rows: RequestVariableRow[],
  token: string,
  scope: 'request' | 'prompt'
) {
  const normalizedToken = sanitizeVariableToken(token);
  if (!normalizedToken) return rows;
  return rows.filter(row => {
    const rowScope = row.scope === 'prompt' ? 'prompt' : 'request';
    return rowScope !== scope || row.name.trim() !== normalizedToken;
  });
}

export function upsertVariableRecordValue(values: Record<string, string>, token: string, value: string) {
  const normalizedToken = sanitizeVariableToken(token);
  if (!normalizedToken) return { ...values };
  return {
    ...values,
    [normalizedToken]: value
  };
}

export function removeVariableRecordValue(values: Record<string, string>, token: string) {
  const normalizedToken = sanitizeVariableToken(token);
  if (!normalizedToken || !Object.prototype.hasOwnProperty.call(values, normalizedToken)) {
    return { ...values };
  }
  const next = { ...values };
  delete next[normalizedToken];
  return next;
}

export function updateEnvironmentVariableLayer(
  environment: EnvironmentDocument,
  layerId: 'environment-shared' | 'environment-local',
  values: Record<string, string>
) {
  const sharedVars = layerId === 'environment-shared' ? values : environment.sharedVars ?? environment.vars ?? {};
  const localVars = layerId === 'environment-local' ? values : environment.localVars ?? {};
  const hasLocalOverlay =
    Object.keys(localVars).length > 0 ||
    (environment.localHeaders || []).length > 0 ||
    Boolean(environment.localFilePath);

  return {
    ...environment,
    sharedVars,
    localVars,
    vars: {
      ...sharedVars,
      ...localVars
    },
    overlayMode: hasLocalOverlay || environment.sharedFilePath ? 'overlay' : environment.overlayMode || 'standalone'
  };
}

function requestVariableSource(rows: RequestVariableRow[], scope: 'request' | 'prompt') {
  const entries = rows
    .filter(row => row.enabled !== false && row.name.trim() && (scope === 'prompt' ? row.scope === 'prompt' : row.scope !== 'prompt'))
    .map(row => [row.name.trim(), row.value] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : {};
}

function definedValue(values: Record<string, string>, token: string) {
  return Object.prototype.hasOwnProperty.call(values, token) ? values[token] || '' : undefined;
}

function buildLayers(input: {
  project: ProjectDocument;
  request: RequestDocument | null;
  environment: EnvironmentDocument | null;
  runtimeVariables: Record<string, string>;
  folderSources: Array<Record<string, unknown>>;
  promptVariables?: Record<string, string>;
  includePromptDefaults?: boolean;
}) {
  const rows = input.request ? requestVariableRows(input.request) : [];
  const requestValues = requestVariableSource(rows, 'request');
  const environmentLocal = input.environment?.localVars || {};
  const environmentShared = input.environment?.sharedVars || input.environment?.vars || {};
  const baseLayers: VariableLayer[] = [];

  if (Object.keys(requestValues).length > 0) {
    baseLayers.push({
      id: 'request',
      label: 'request variables',
      editHint: 'Edit in the request Variables tab.',
      values: requestValues,
      participatesInResolution: true,
      mutationLayerId: 'request'
    });
  }
  input.folderSources.forEach((source, index) => {
    const values = stripDebugSource(source);
    if (Object.keys(values).length === 0) return;
    const label = readDebugSourceLabel(source) || `folder variables ${index + 1}`;
    baseLayers.push({
      id: `folder-${index}`,
      label,
      editHint: 'Edit in the category Variables section.',
      values,
      participatesInResolution: true
    });
  });
  if (Object.keys(input.runtimeVariables).length > 0) {
    baseLayers.push({
      id: 'runtime',
      label: 'runtime variables',
      editHint: 'Clear or refresh in Runtime Layer.',
      values: input.runtimeVariables,
      participatesInResolution: true
    });
  }
  if (Object.keys(environmentLocal).length > 0) {
    baseLayers.push({
      id: 'environment-local',
      label: input.environment ? `environment local · ${input.environment.name}` : 'environment local',
      editHint: 'Edit in Local Variables.',
      values: environmentLocal,
      participatesInResolution: true,
      mutationLayerId: 'environment-local'
    });
  }
  if (Object.keys(environmentShared).length > 0) {
    baseLayers.push({
      id: 'environment-shared',
      label: input.environment ? `environment shared · ${input.environment.name}` : 'environment shared',
      editHint: 'Edit in Shared Variables.',
      values: environmentShared,
      participatesInResolution: true,
      mutationLayerId: 'environment-shared'
    });
  }
  if (Object.keys(input.project.runtime.vars || {}).length > 0) {
    baseLayers.push({
      id: 'project-runtime',
      label: 'project runtime',
      editHint: 'Edit in Project Settings → Shared Variables.',
      values: input.project.runtime.vars || {},
      participatesInResolution: true,
      mutationLayerId: 'project-runtime'
    });
  }
  const hasExplicitBaseUrl =
    Object.prototype.hasOwnProperty.call(environmentLocal, 'baseUrl') ||
    Object.prototype.hasOwnProperty.call(environmentShared, 'baseUrl') ||
    Object.prototype.hasOwnProperty.call(input.project.runtime.vars || {}, 'baseUrl');
  const builtinBaseUrl = input.environment?.vars.baseUrl || input.project.runtime.baseUrl || '';
  if (builtinBaseUrl && !hasExplicitBaseUrl) {
    baseLayers.push({
      id: 'builtin-baseUrl',
      label: 'builtin: baseUrl',
      editHint: 'Edit the Default Base URL above.',
      values: { baseUrl: builtinBaseUrl },
      participatesInResolution: true
    });
  }
  if (input.includePromptDefaults && Object.keys(input.promptVariables || {}).length > 0) {
    baseLayers.push({
      id: 'prompt-defaults',
      label: 'remembered prompt defaults',
      editHint: 'Edit in Remembered Prompt Values.',
      values: input.promptVariables || {},
      participatesInResolution: false,
      mutationLayerId: 'prompt-defaults'
    });
  }
  return baseLayers;
}

function definitionsForToken(layers: VariableLayer[], token: string) {
  const definitions: VariableWorkflowDefinition[] = [];
  layers.forEach(layer => {
    const value = definedValue(layer.values, token);
    if (value === undefined) return;
    definitions.push({
      layerId: layer.id,
      label: layer.label,
      value,
      editHint: layer.editHint,
      winner: false,
      participatesInResolution: layer.participatesInResolution,
      editable: Boolean(layer.mutationLayerId),
      mutationLayerId: layer.mutationLayerId
    });
  });
  return definitions;
}

export function buildVariableAuthoringAudit(input: {
  project: ProjectDocument;
  request: RequestDocument | null;
  environment: EnvironmentDocument | null;
  insight: ResolvedRequestInsight | null;
  runtimeVariables: Record<string, string>;
  folderSources: Array<Record<string, unknown>>;
}): VariableAuthoringAudit | null {
  if (!input.request || !input.insight) return null;

  const layers = buildLayers({
    project: input.project,
    request: input.request,
    environment: input.environment,
    runtimeVariables: input.runtimeVariables,
    folderSources: input.folderSources
  });

  const entries = [...input.insight.variables]
    .map(variable => {
      const definitions: VariableAuthoringDefinition[] = layers
        .filter(layer => layer.participatesInResolution)
        .map(layer => {
          const value = definedValue(layer.values, variable.token);
          if (value === undefined) return null;
          return {
            layerId: layer.id,
            label: layer.label,
            value,
            editHint: layer.editHint,
            winner: false,
            editable: Boolean(layer.mutationLayerId),
            mutationLayerId: layer.mutationLayerId
          } as VariableAuthoringDefinition;
        })
        .filter((item): item is VariableAuthoringDefinition => Boolean(item));

      if (!variable.missing && definitions.length > 0) {
        definitions[0] = {
          ...definitions[0],
          winner: true
        };
      }

      return {
        token: variable.token,
        value: variable.value,
        source: variable.source,
        sourceLabel: variable.sourceLabel,
        missing: variable.missing,
        conflict: definitions.length > 1,
        locations: variable.locations,
        winnerHint: definitions[0]?.editHint || 'No editable source available in the current workspace view.',
        definitions
      } satisfies VariableAuthoringEntry;
    })
    .sort((left, right) => {
      if (left.missing !== right.missing) return left.missing ? -1 : 1;
      if (left.conflict !== right.conflict) return left.conflict ? -1 : 1;
      return left.token.localeCompare(right.token);
    });

  return {
    requestName: input.request.name,
    precedenceLabels: layers.map(layer => layer.label),
    entries,
    conflictCount: entries.filter(item => item.conflict).length,
    missingCount: entries.filter(item => item.missing).length
  };
}

export function buildVariableWorkflowCatalog(input: {
  project: ProjectDocument;
  environment: EnvironmentDocument | null;
  runtimeVariables: Record<string, string>;
  promptVariables: Record<string, string>;
  variableAudit?: VariableAuthoringAudit | null;
}): VariableWorkflowCatalog {
  const layers = buildLayers({
    project: input.project,
    request: null,
    environment: input.environment,
    runtimeVariables: input.runtimeVariables,
    folderSources: [],
    promptVariables: input.promptVariables,
    includePromptDefaults: true
  });
  const auditEntries = new Map((input.variableAudit?.entries || []).map(entry => [entry.token, entry]));
  const baseDefinitionMap = new Map<string, VariableWorkflowDefinition[]>();
  const tokens = new Set<string>();

  layers.forEach(layer => {
    Object.keys(layer.values).forEach(token => tokens.add(token));
  });
  auditEntries.forEach((_entry, token) => tokens.add(token));

  tokens.forEach(token => {
    baseDefinitionMap.set(token, definitionsForToken(layers, token));
  });

  const entries = [...tokens]
    .map(token => {
      const auditEntry = auditEntries.get(token);
      const baseDefinitions = baseDefinitionMap.get(token) || [];
      const mergedDefinitions = auditEntry
        ? [
            ...auditEntry.definitions.map(definition => ({
              ...definition,
              participatesInResolution: true
            })),
            ...baseDefinitions.filter(
              definition => !auditEntry.definitions.some(existing => existing.layerId === definition.layerId)
            )
          ]
        : baseDefinitions;
      const resolutionDefinitions = mergedDefinitions.filter(definition => definition.participatesInResolution);
      const winningLayerId = auditEntry?.definitions[0]?.layerId || resolutionDefinitions[0]?.layerId || null;
      const definitions = mergedDefinitions.map(definition => ({
        ...definition,
        winner: definition.layerId === winningLayerId
      }));
      const winningDefinition = definitions.find(definition => definition.winner) || definitions[0] || null;
      const hasPromptDefault = definitions.some(definition => definition.layerId === 'prompt-defaults');
      const hasResolutionSource = resolutionDefinitions.length > 0;

      return {
        token,
        definitions,
        winnerLabel: winningDefinition?.label || (hasPromptDefault ? 'remembered prompt default' : 'No active source'),
        winnerValue: winningDefinition?.value || '',
        winnerHint:
          winningDefinition?.editHint ||
          (hasPromptDefault
            ? 'Prompt defaults only prefill prompt dialogs and do not change automatic precedence.'
            : 'Define this token in project, environment, folder, request, or runtime state.'),
        conflict: resolutionDefinitions.length > 1,
        requestLinked: Boolean(auditEntry),
        requestMissing: auditEntry?.missing || false,
        hasPromptDefault,
        hasResolutionSource
      } satisfies VariableWorkflowEntry;
    })
    .sort((left, right) => {
      if (left.requestMissing !== right.requestMissing) return left.requestMissing ? -1 : 1;
      if (left.conflict !== right.conflict) return left.conflict ? -1 : 1;
      if (left.requestLinked !== right.requestLinked) return left.requestLinked ? -1 : 1;
      return left.token.localeCompare(right.token);
    });

  return {
    entries,
    tokenCount: entries.length,
    conflictCount: entries.filter(entry => entry.conflict).length,
    requestLinkedCount: entries.filter(entry => entry.requestLinked).length,
    promptDefaultCount: entries.filter(entry => entry.hasPromptDefault).length
  };
}

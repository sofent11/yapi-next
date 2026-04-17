import {
  applyCollectionRules,
  buildCurlCommand,
  buildWorkspaceIndex,
  createProjectSeed,
  evaluateChecks,
  executeRequestScript,
  materializeCollectionDocument,
  materializeEnvironmentDocument,
  materializeProjectDocument,
  materializeRequestDocuments,
  parseCollectionDataText,
  resolveRequest
} from '@yapi-debugger/core';
import {
  createDefaultEnvironment,
  createEmptyCase,
  createEmptyCollection,
  createEmptyRequest,
  createId,
  emptyParameterRow,
  importAuthSchema,
  slugify,
  type CaseDocument,
  type CheckResult,
  type CollectionDocument,
  type CollectionRunReport,
  type CollectionStepRun,
  type EnvironmentDocument,
  type ImportAuth,
  type ImportResult,
  type ImportWarning,
  type ProjectDocument,
  type RequestDocument,
  type ResolvedRequestPreview,
  type RunHistoryEntry,
  type ScriptLog,
  type SendRequestResult,
  type WorkspaceCollectionRecord,
  type WorkspaceIndex
} from '@yapi-debugger/schema';
import { importSourceText } from '@yapi-debugger/importers';
import {
  appendCollectionReport,
  appendHistory,
  clearCollectionReports,
  clearHistory,
  deleteEntry,
  fetchImportUrl,
  loadCollectionReports,
  loadHistory,
  readImportFile,
  scanWorkspace,
  sendRequest,
  writeDocument,
  type WorkspaceScanPayload
} from './desktop';

function scanPayloadToIndex(payload: WorkspaceScanPayload) {
  const map: Record<string, string> = {};
  payload.files.forEach(file => {
    map[file.path] = file.content;
  });
  const projectContent = map[`${payload.root}/project.yaml`] || '';
  return buildWorkspaceIndex({
    root: payload.root,
    projectContent,
    fileContents: map
  });
}

function createRuntimeEnvironment(workspace: WorkspaceIndex, name: string) {
  const source = workspace.environments.find(item => item.document.name === name)?.document;
  return structuredClone(source || createDefaultEnvironment(name));
}

function collectionConflictsWithRecord(
  existing: WorkspaceIndex['requests'][number],
  imported: ImportResult['requests'][number]
) {
  return (
    existing.request.name === imported.request.name &&
    existing.folderSegments.join('/') === imported.folderSegments.join('/')
  );
}

function uniqueCopyName(baseName: string, existingNames: string[]) {
  const existing = new Set(existingNames.map(name => slugify(name)));
  if (!existing.has(slugify(baseName))) {
    return baseName;
  }

  let index = 2;
  while (existing.has(slugify(`${baseName} ${index}`))) {
    index += 1;
  }
  return `${baseName} ${index}`;
}

function stepOutputFromRun(preview: ResolvedRequestPreview, response: SendRequestResult) {
  const headerMap = Object.fromEntries(response.headers.map(item => [item.name.toLowerCase(), item.value]));
  let parsedBody: unknown = response.bodyText;
  try {
    parsedBody = JSON.parse(response.bodyText);
  } catch (_error) {
    parsedBody = response.bodyText;
  }

  return {
    request: {
      method: preview.method,
      url: preview.url,
      query: Object.fromEntries(preview.query.filter(item => item.enabled && item.name.trim()).map(item => [item.name, item.value])),
      headers: Object.fromEntries(preview.headers.filter(item => item.enabled && item.name.trim()).map(item => [item.name.toLowerCase(), item.value])),
      body: preview.body.text
    },
    response: {
      status: response.status,
      durationMs: response.durationMs,
      headers: headerMap,
      body: parsedBody,
      rawBody: response.bodyText
    }
  };
}

function seededStepOutputsFromReport(report: CollectionRunReport | null) {
  if (!report) return {} as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  report.iterations[0]?.stepRuns.forEach(stepRun => {
    if (stepRun.request && stepRun.response) {
      output[stepRun.stepKey] = stepOutputFromRun(stepRun.request, stepRun.response);
    }
  });
  return output;
}

export async function openWorkspace(root: string) {
  const payload = await scanWorkspace(root);
  return scanPayloadToIndex(payload);
}

export type ImportPreviewSummary = {
  format: string;
  endpoints: number;
  folders: number;
  environments: number;
  conflicts: number;
  warnings: number;
  newRequests: number;
  replaceableRequests: number;
  degradedWarnings: number;
  unsupportedWarnings: number;
  exampleCount: number;
  nextSteps: string[];
  warningBreakdown: Array<{
    label: string;
    count: number;
  }>;
};

function warningsByStatus(warnings: ImportWarning[], status: ImportWarning['status']) {
  return warnings.filter(item => item.status === status).length;
}

export function buildImportPreviewSummary(
  workspace: WorkspaceIndex,
  result: ImportResult
): ImportPreviewSummary {
  let conflicts = 0;
  let exampleCount = 0;
  result.requests.forEach(imported => {
    const existing = workspace.requests.find(record => collectionConflictsWithRecord(record, imported));
    if (existing) conflicts += 1;
    exampleCount += imported.request.examples.length;
  });
  const newRequests = Math.max(result.requests.length - conflicts, 0);
  const degradedWarnings = warningsByStatus(result.warnings || [], 'degraded');
  const unsupportedWarnings = warningsByStatus(result.warnings || [], 'unsupported');
  const nextSteps = [
    conflicts > 0 ? `${conflicts} requests match existing names in the same folder. Review the conflict strategy before applying.` : '',
    degradedWarnings > 0 ? `${degradedWarnings} imported items need manual follow-up before they behave like the source collection.` : '',
    unsupportedWarnings > 0 ? `${unsupportedWarnings} scripts or features were preserved as text only and will not execute automatically.` : '',
    result.warnings.some(item => item.code === 'auth-review')
      ? 'Review Environment/Auth settings after import because the source spec declared security requirements.'
      : '',
    newRequests > 0 ? `${newRequests} requests can be opened in Scratch or edited immediately after import.` : ''
  ].filter(Boolean);

  return {
    format: result.detectedFormat,
    endpoints: result.requests.length,
    folders: result.requests.reduce((set, req) => {
      set.add(req.folderSegments.join('/'));
      return set;
    }, new Set<string>()).size,
    environments: result.environments.length,
    conflicts,
    warnings: result.warnings?.length || 0,
    newRequests,
    replaceableRequests: conflicts,
    degradedWarnings,
    unsupportedWarnings,
    exampleCount,
    nextSteps,
    warningBreakdown: [
      { label: 'Needs review', count: degradedWarnings },
      { label: 'Not supported', count: unsupportedWarnings },
      { label: 'Examples kept', count: exampleCount }
    ]
  };
}

export async function importIntoWorkspace(
  workspace: WorkspaceIndex,
  result: ImportResult,
  strategy: 'append' | 'replace'
) {
  const root = workspace.root;
  const nextRecords: ImportResult['requests'] = [];
  const deleteTargets: WorkspaceIndex['requests'][number][] = [];

  for (const imported of result.requests) {
    const target = workspace.requests.find(record => collectionConflictsWithRecord(record, imported));
    if (!target) {
      nextRecords.push(imported);
      continue;
    }

    if (strategy === 'replace') {
      deleteTargets.push(target);
      nextRecords.push(imported);
    } else {
      nextRecords.push(imported);
    }
  }

  await Promise.all(deleteTargets.map(record => deleteRequestInWorkspace(record)));
  const writes = materializeRequestDocuments(nextRecords, root);
  await Promise.all(writes.map(item => writeDocument(item.path, item.content)));
}

export async function createWorkspace(root: string, projectName: string) {
  const seed = createProjectSeed({ projectName, includeSampleRequest: true });
  await Promise.all(seed.writes.map(item => writeDocument(`${root}/${item.path}`, item.content)));
  return openWorkspace(root);
}

export async function saveEnvironment(root: string, environment: EnvironmentDocument) {
  const file = materializeEnvironmentDocument(environment, root);
  await writeDocument(file.path, file.content);
}

export async function saveProject(root: string, project: ProjectDocument) {
  const file = materializeProjectDocument(project, root);
  await writeDocument(file.path, file.content);
}

export async function saveRequestRecord(
  root: string,
  request: ReturnType<typeof createEmptyRequest>,
  cases: CaseDocument[],
  previousResourceDirPath?: string,
  previousRequestFilePath?: string,
  folderSegments: string[] = []
) {
  if (previousResourceDirPath) {
    await deleteEntry(previousResourceDirPath, true).catch(() => undefined);
  }
  if (previousRequestFilePath) {
    await deleteEntry(previousRequestFilePath, false).catch(() => undefined);
  }

  const writes = materializeRequestDocuments([{ folderSegments, request, cases }], root);
  await Promise.all(writes.map(item => writeDocument(item.path, item.content)));
}

export async function saveCollectionRecord(
  root: string,
  collection: CollectionDocument,
  dataText: string,
  previousFilePath?: string,
  previousDataFilePath?: string
) {
  if (previousFilePath) {
    await deleteEntry(previousFilePath, false).catch(() => undefined);
  }
  if (previousDataFilePath) {
    await deleteEntry(previousDataFilePath, false).catch(() => undefined);
  }

  const writes = materializeCollectionDocument(collection, root, dataText);
  await Promise.all(writes.map(item => writeDocument(item.path, item.content)));
}

export async function createRequestInWorkspace(root: string, folderPath: string | null) {
  const folderSegments = folderPath ? folderPath.split('/').filter(Boolean) : [];
  const request = createEmptyRequest('New Request');
  request.headers = [
    {
      ...emptyParameterRow(),
      name: 'Accept',
      value: 'application/json',
      enabled: true,
      kind: 'text'
    }
  ];
  await saveRequestRecord(root, request, [], undefined, undefined, folderSegments);
  return request.id;
}

export async function saveScratchRequestToWorkspace(
  workspace: WorkspaceIndex,
  request: RequestDocument,
  folderPath: string | null,
  cases: CaseDocument[] = []
) {
  const folderSegments = folderPath ? folderPath.split('/').filter(Boolean) : [];
  const siblingNames = workspace.requests
    .filter(record => record.folderSegments.join('/') === folderSegments.join('/'))
    .map(record => record.request.name);
  const nextRequest = structuredClone(request);
  nextRequest.name = uniqueCopyName(nextRequest.name || 'Scratch Request', siblingNames);
  if (!nextRequest.id || workspace.requests.some(record => record.request.id === nextRequest.id)) {
    nextRequest.id = createId('req');
  }
  const nextCases = cases.map(caseItem => ({
    ...structuredClone(caseItem),
    id: createId('case'),
    extendsRequest: nextRequest.id
  }));
  await saveRequestRecord(workspace.root, nextRequest, nextCases, undefined, undefined, folderSegments);
  return nextRequest.id;
}

export async function createCaseForRequest(
  root: string,
  requestId: string
) {
  // Always perform a fresh scan to avoid stale index issues
  const workspace = await openWorkspace(root);

  let record = workspace.requests.find(r => r.request.id === requestId);

  // Fallback: If not found by ID, maybe it's a freshly created request that had its ID changed or is being tracked by path
  if (!record) {
    record = workspace.requests.find(r => r.request.name === requestId || r.request.path === requestId);
  }

  if (!record) {
    throw new Error(`Request "${requestId}" not found in workspace index`);
  }

  const nextCase = createEmptyCase(record.request.id, `Case ${record.cases.length + 1}`);
  await saveRequestRecord(
    root,
    record.request,
    [...record.cases, nextCase],
    record.resourceDirPath,
    record.requestFilePath,
    record.folderSegments
  );
  return { requestId: record.request.id, caseId: nextCase.id };
}


export async function createCollectionInWorkspace(
  root: string,
  workspace: WorkspaceIndex,
  requestId?: string
) {
  const collection = createEmptyCollection('New Collection');
  if (requestId) {
    collection.steps.push({
      key: 'step_1',
      requestId,
      enabled: true,
      name: 'Initial Step'
    });
  }
  await saveCollectionRecord(root, collection, '');
  return collection.id;
}

export async function renameRequestInWorkspace(
  root: string,
  record: WorkspaceIndex['requests'][number],
  nextName: string
) {
  await saveRequestRecord(
    root,
    {
      ...record.request,
      name: nextName
    },
    record.cases,
    record.resourceDirPath,
    record.requestFilePath,
    record.folderSegments
  );
}

export async function duplicateRequestInWorkspace(
  root: string,
  record: WorkspaceIndex['requests'][number],
  siblingNames: string[]
) {
  const nextRequest = structuredClone(record.request);
  nextRequest.id = createId('req');
  nextRequest.name = uniqueCopyName(`${record.request.name} Copy`, siblingNames);

  const nextCases = record.cases.map(caseItem => {
    const nextCase = structuredClone(caseItem);
    nextCase.id = createId('case');
    nextCase.extendsRequest = nextRequest.id;
    return nextCase;
  });

  await saveRequestRecord(root, nextRequest, nextCases, undefined, undefined, record.folderSegments);
  return nextRequest.id;
}

export async function deleteRequestInWorkspace(record: WorkspaceIndex['requests'][number]) {
  if (record.resourceDirPath) {
    await deleteEntry(record.resourceDirPath, true);
  }
  if (record.requestFilePath) {
    await deleteEntry(record.requestFilePath, false);
  }
}

export async function deleteCollectionInWorkspace(record: WorkspaceCollectionRecord) {
  if (record.filePath) {
    await deleteEntry(record.filePath, false).catch(() => undefined);
  }
  if (record.dataFilePath) {
    await deleteEntry(record.dataFilePath, false).catch(() => undefined);
  }
}

export async function renameCategoryInWorkspace(
  root: string,
  workspace: WorkspaceIndex,
  oldPath: string,
  nextPath: string
) {
  const affected = workspace.requests.filter(r => r.folderSegments.join('/').startsWith(oldPath));
  const newSegments = nextPath.split('/').filter(Boolean);
  const oldSegmentsCount = oldPath.split('/').filter(Boolean).length;

  for (const record of affected) {
    const relativeSegments = record.folderSegments.slice(oldSegmentsCount);
    const targetSegments = [...newSegments, ...relativeSegments];
    await saveRequestRecord(
      root,
      record.request,
      record.cases,
      record.resourceDirPath,
      record.requestFilePath,
      targetSegments
    );
  }
}

export async function deleteCategoryInWorkspace(workspace: WorkspaceIndex, path: string) {
  const affected = workspace.requests.filter(r => r.folderSegments.join('/').startsWith(path));
  for (const record of affected) {
    await deleteRequestInWorkspace(record);
  }
}

export async function renameCaseInWorkspace(
  root: string,
  record: WorkspaceIndex['requests'][number],
  caseId: string,
  nextName: string
) {
  const nextCases = record.cases.map(c => (c.id === caseId ? { ...c, name: nextName } : c));
  await saveRequestRecord(
    root,
    record.request,
    nextCases,
    record.resourceDirPath,
    record.requestFilePath,
    record.folderSegments
  );
}

export async function duplicateCaseInWorkspace(
  root: string,
  record: WorkspaceIndex['requests'][number],
  caseId: string
) {
  const sourceCase = record.cases.find(c => c.id === caseId);
  if (!sourceCase) throw new Error('Case not found');
  const nextCase = structuredClone(sourceCase);
  nextCase.id = createId('case');
  nextCase.name = uniqueCopyName(`${sourceCase.name} Copy`, record.cases.map(c => c.name));
  await saveRequestRecord(
    root,
    record.request,
    [...record.cases, nextCase],
    record.resourceDirPath,
    record.requestFilePath,
    record.folderSegments
  );
  return nextCase.id;
}

export async function deleteCaseInWorkspace(
  root: string,
  record: WorkspaceIndex['requests'][number],
  caseId: string
) {
  const nextCases = record.cases.filter(c => c.id !== caseId);
  await saveRequestRecord(
    root,
    record.request,
    nextCases,
    record.resourceDirPath,
    record.requestFilePath,
    record.folderSegments
  );
}

export async function importFromFile(path: string) {
  const source = await readImportFile(path);
  return {
    source,
    result: importSourceText(source.content)
  };
}

export async function importFromUrl(url: string, auth: ImportAuth) {
  const parsedAuth = importAuthSchema.parse(auth);
  const source = await fetchImportUrl(url, parsedAuth);
  return {
    source,
    result: importSourceText(source.content)
  };
}

export type RequestRunContext = {
  extraSources?: Array<Record<string, unknown>>;
  state?: {
    variables: Record<string, string>;
    environment: EnvironmentDocument;
  };
  collectionRules?: {
    requireSuccessStatus: boolean;
    maxDurationMs?: number;
    requiredJsonPaths?: string[];
  };
  sourceCollection?: {
    id: string;
    name: string;
    stepKey: string;
  };
};

export type PreparedRequestRunInput = {
  request: RequestDocument;
  caseDocument?: CaseDocument;
  sessionId?: string;
  context?: RequestRunContext;
};

export async function runPreparedRequest(
  workspace: WorkspaceIndex,
  input: PreparedRequestRunInput
) {
  const context = input.context || {};
  const envName =
    input.caseDocument?.environment || context.state?.environment.name || workspace.project.defaultEnvironment;
  const runtimeEnvironment = context.state?.environment || createRuntimeEnvironment(workspace, envName);
  const state = context.state || {
    variables: {},
    environment: runtimeEnvironment
  };

  const previewBeforeScripts = resolveRequest(
    workspace.project,
    input.request,
    input.caseDocument,
    state.environment,
    context.extraSources || []
  );
  const preScript = executeRequestScript({
    phase: 'pre-request',
    script: input.caseDocument?.scripts?.preRequest || '',
    state,
    request: previewBeforeScripts
  });
  const preview = {
    ...preScript.request,
    sessionId: input.sessionId || workspace.root
  };
  const response = await sendRequest(preview);
  const builtinChecks = input.caseDocument ? evaluateChecks(response, input.caseDocument.checks || []) : [];
  const collectionChecks = context.collectionRules
    ? applyCollectionRules({
        ...context.collectionRules,
        response
      })
    : [];
  const postScript = executeRequestScript({
    phase: 'post-response',
    script: input.caseDocument?.scripts?.postResponse || '',
    state: preScript.state,
    request: preview,
    response
  });

  return {
    preview,
    response,
    checkResults: [...builtinChecks, ...collectionChecks, ...postScript.testResults],
    scriptLogs: [...preScript.logs, ...postScript.logs],
    state: postScript.state
  };
}

export async function runResolvedRequest(
  workspace: WorkspaceIndex,
  requestId: string,
  caseId?: string,
  context: RequestRunContext = {}
) {
  const record = workspace.requests.find(r => r.request.id === requestId);
  if (!record) throw new Error('Request not found');
  const caseDocument = record.cases.find(c => c.id === caseId);
  return runPreparedRequest(workspace, {
    request: record.request,
    caseDocument,
    sessionId: workspace.root,
    context
  });
}

export async function appendRunHistoryEntry(
  workspaceRoot: string,
  meta: {
    requestId: string;
    requestName: string;
    caseId?: string;
    caseName?: string;
  },
  preview: ResolvedRequestPreview,
  response: SendRequestResult,
  checkResults: CheckResult[],
  scriptLogs: ScriptLog[] = [],
  sourceCollection?: { id: string; name: string; stepKey: string }
) {
  const entry: RunHistoryEntry = {
    id: createId('run'),
    workspaceRoot,
    requestId: meta.requestId,
    requestName: meta.requestName,
    caseId: meta.caseId,
    caseName: meta.caseName,
    environmentName: preview.environmentName,
    request: preview,
    response,
    checkResults,
    scriptLogs,
    sourceCollectionId: sourceCollection?.id,
    sourceCollectionName: sourceCollection?.name,
    sourceStepKey: sourceCollection?.stepKey
  };
  await appendHistory(entry);
}

export async function saveRunHistory(
  workspace: WorkspaceIndex,
  requestId: string,
  caseId: string | undefined,
  preview: ResolvedRequestPreview,
  response: SendRequestResult,
  checkResults: CheckResult[],
  scriptLogs: ScriptLog[] = [],
  sourceCollection?: { id: string; name: string; stepKey: string }
) {
  const record = workspace.requests.find(r => r.request.id === requestId);
  if (!record) return;
  const caseDoc = record.cases.find(c => c.id === caseId);
  return appendRunHistoryEntry(
    workspace.root,
    {
      requestId,
      requestName: record.request.name,
      caseId,
      caseName: caseDoc?.name
    },
    preview,
    response,
    checkResults,
    scriptLogs,
    sourceCollection
  );
}

export async function clearRunHistory(root: string) {
  await clearHistory(root);
}

export async function loadRunHistory(root: string): Promise<RunHistoryEntry[]> {
  return loadHistory(root);
}

export type CollectionRunOptions = {
  environmentName?: string;
  stepKeys?: string[];
  seedReport?: CollectionRunReport | null;
};

export async function runCollection(
  workspace: WorkspaceIndex,
  collectionId: string,
  options: CollectionRunOptions = {}
) {
  const record = workspace.collections.find(item => item.document.id === collectionId);
  if (!record) throw new Error('Collection not found');

  const collection = record.document;
  const environmentName = options.environmentName || collection.defaultEnvironment || workspace.project.defaultEnvironment;
  const baseEnvironment = createRuntimeEnvironment(workspace, environmentName);
  const parsedDataRows = parseCollectionDataText(record.dataText || '');
  const iterations =
    parsedDataRows.length > 0
      ? parsedDataRows
      : Array.from({ length: Math.max(collection.iterationCount || 1, 1) }, () => ({} as Record<string, unknown>));

  const reportIterations: CollectionRunReport['iterations'] = [];
  let passedSteps = 0;
  let failedSteps = 0;
  let skippedSteps = 0;

  for (let index = 0; index < iterations.length; index += 1) {
    const dataVars = iterations[index] || {};
    const runtimeEnvironment = structuredClone(baseEnvironment);
    const runtimeState = {
      variables: { ...collection.vars },
      environment: runtimeEnvironment
    };
    const seeded = seededStepOutputsFromReport(options.seedReport || null);
    const stepRuns: CollectionStepRun[] = [];

    const activeSteps = collection.steps.filter(step => step.enabled && (!options.stepKeys || options.stepKeys.includes(step.key)));
    let stop = false;
    for (const step of activeSteps) {
      if (stop) {
        stepRuns.push({
          stepKey: step.key,
          stepName: step.name || step.key,
          requestId: step.requestId,
          caseId: step.caseId,
          ok: false,
          skipped: true,
          checkResults: [],
          scriptLogs: [],
          error: 'Skipped after previous failure'
        });
        skippedSteps += 1;
        continue;
      }

      try {
        const run = await runResolvedRequest(workspace, step.requestId, step.caseId, {
          extraSources: [
            dataVars,
            { steps: seeded },
            runtimeState.variables
          ],
          state: runtimeState,
          collectionRules: collection.rules,
          sourceCollection: {
            id: collection.id,
            name: collection.name,
            stepKey: step.key
          }
        });

        seeded[step.key] = stepOutputFromRun(run.preview, run.response);
        const ok = run.checkResults.every(result => result.ok);
        stepRuns.push({
          stepKey: step.key,
          stepName: step.name || step.key,
          requestId: step.requestId,
          caseId: step.caseId,
          ok,
          skipped: false,
          request: run.preview,
          response: run.response,
          checkResults: run.checkResults,
          scriptLogs: run.scriptLogs
        });

        if (ok) {
          passedSteps += 1;
        } else {
          failedSteps += 1;
          if (collection.stopOnFailure) {
            stop = true;
          }
        }
      } catch (error) {
        failedSteps += 1;
        stepRuns.push({
          stepKey: step.key,
          stepName: step.name || step.key,
          requestId: step.requestId,
          caseId: step.caseId,
          ok: false,
          skipped: false,
          checkResults: [],
          scriptLogs: [],
          error: (error as Error).message || 'Collection step failed'
        });
        if (collection.stopOnFailure) {
          stop = true;
        }
      }
    }

    reportIterations.push({
      index,
      dataLabel: parsedDataRows.length > 0 ? `Row ${index + 1}` : undefined,
      dataVars: Object.fromEntries(Object.entries(dataVars).map(([key, value]) => [key, String(value ?? '')])),
      stepRuns
    });
  }

  const report: CollectionRunReport = {
    id: createId('colrun'),
    workspaceRoot: workspace.root,
    collectionId: collection.id,
    collectionName: collection.name,
    environmentName,
    status: failedSteps === 0 ? 'passed' : passedSteps > 0 ? 'partial' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    iterationCount: reportIterations.length || 1,
    passedSteps,
    failedSteps,
    skippedSteps,
    iterations: reportIterations
  };
  await appendCollectionReport(report);
  return report;
}

export async function loadCollectionRunReports(root: string): Promise<CollectionRunReport[]> {
  return loadCollectionReports(root);
}

export async function clearCollectionRunReports(root: string) {
  await clearCollectionReports(root);
}

export function rerunFailedStepKeys(report: CollectionRunReport) {
  return report.iterations
    .flatMap(iteration => iteration.stepRuns)
    .filter(step => !step.ok && !step.skipped)
    .map(step => step.stepKey);
}

export function collectionReportSeed(report: CollectionRunReport) {
  return report;
}

export function curlForPreview(preview: ResolvedRequestPreview) {
  return buildCurlCommand(preview);
}

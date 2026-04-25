import {
  buildCurlCommand,
  buildWorkspaceIndex,
  createNamedTemplateSource,
  createProjectSeed,
  inspectResolvedRequest,
  interpolateString,
  materializeCollectionDocument,
  materializeBrunoCollectionExport,
  materializeEnvironmentDocuments,
  materializeProjectDocument,
  materializeRequestDocuments,
  mergeTemplateSources,
  renderCollectionRunReportJunit,
  serializeBrunoJsonCollection,
  serializeOpenCollection,
  serializeRequestToBruno,
  filtersFromCollectionReport,
  rerunFailedStepKeys as rerunFailedStepKeysCore,
  runCollection as runCollectionCore,
  runPreparedRequest as runPreparedRequestCore,
  type CollectionRunFilters
} from '@yapi-debugger/core';
import {
  DEFAULT_GITIGNORE,
  SCHEMA_VERSION,
  authConfigSchema,
  createCollectionStep,
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
  type AuthConfig,
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
import { importBrunoCollectionFiles, importSourceText } from '@yapi-debugger/importers';
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

function relativeWorkspacePath(root: string, fullPath: string) {
  return fullPath.replace(`${root}/`, '');
}

function payloadNeedsMigration(payload: WorkspaceScanPayload) {
  return payload.files.some(file =>
    file.content.includes('schemaVersion: 1') &&
    (file.path.endsWith('.yaml') || file.path.endsWith('.yml'))
  );
}

async function ensureWorkspaceMigrated(root: string, payload: WorkspaceScanPayload) {
  if (!payloadNeedsMigration(payload)) {
    return payload;
  }

  const backupRoot = `${root}/.yapi-debugger-cache/migrations/${new Date().toISOString().replace(/[:.]/g, '-')}`;
  for (const file of payload.files) {
    await writeDocument(`${backupRoot}/${relativeWorkspacePath(root, file.path)}`, file.content);
  }

  const index = scanPayloadToIndex(payload);
  const projectWrite = materializeProjectDocument({ ...index.project, schemaVersion: SCHEMA_VERSION }, root);
  await writeDocument(projectWrite.path, projectWrite.content);

  for (const environment of index.environments) {
    const writes = materializeEnvironmentDocuments({ ...environment.document, schemaVersion: SCHEMA_VERSION }, root);
    for (const write of writes) {
      await writeDocument(write.path, write.content);
    }
  }

  for (const request of index.requests) {
    const writes = materializeRequestDocuments([
      {
        folderSegments: request.folderSegments,
        request: { ...request.request, schemaVersion: SCHEMA_VERSION },
        cases: request.cases.map(caseItem => ({ ...caseItem, schemaVersion: SCHEMA_VERSION }))
      }
    ], root);
    for (const write of writes) {
      await writeDocument(write.path, write.content);
    }
  }

  for (const collection of index.collections) {
    const writes = materializeCollectionDocument(
      { ...collection.document, schemaVersion: SCHEMA_VERSION },
      root,
      collection.dataText
    );
    for (const write of writes) {
      await writeDocument(write.path, write.content);
    }
  }

  const existingGitignore = payload.files.find(file => file.path === `${root}/.gitignore`)?.content || '';
  const gitignoreContent = existingGitignore.includes('.yapi-debugger-cache/')
    ? existingGitignore
    : `${existingGitignore.trimEnd()}\n${DEFAULT_GITIGNORE}`.trimStart();
  await writeDocument(`${root}/.gitignore`, gitignoreContent.endsWith('\n') ? gitignoreContent : `${gitignoreContent}\n`);
  await writeDocument(`${root}/.yapi-debugger-cache/migration-manifest.json`, JSON.stringify({
    migratedAt: new Date().toISOString(),
    fromVersion: 1,
    toVersion: SCHEMA_VERSION,
    backupRoot,
    files: payload.files.map(file => relativeWorkspacePath(root, file.path))
  }, null, 2));

  return scanWorkspace(root);
}

function createRuntimeEnvironment(workspace: WorkspaceIndex, name: string) {
  const source = workspace.environments.find(item => item.document.name === name)?.document;
  return structuredClone(source || createDefaultEnvironment(name));
}

function resolveEffectiveAuth(
  request: RequestDocument,
  caseDocument?: CaseDocument,
  environment?: EnvironmentDocument
) {
  const overrideAuth = caseDocument?.overrides.auth;
  const next =
    !overrideAuth || overrideAuth.type === 'inherit'
      ? authConfigSchema.parse(request.auth)
      : authConfigSchema.parse(overrideAuth);
  if (next.type !== 'profile') {
    return {
      auth: next,
      authSource: next.type === 'inherit' ? 'inherit' : next.type,
      profileName: undefined as string | undefined,
      authComesFromCase: Boolean(overrideAuth && overrideAuth.type !== 'inherit')
    };
  }

  const profile = environment?.authProfiles.find(item => item.name === next.profileName);
  if (!profile) {
    return {
      auth: authConfigSchema.parse({ type: 'none' }),
      authSource: `missing profile: ${next.profileName || 'unknown'}`,
      profileName: next.profileName,
      authComesFromCase: Boolean(overrideAuth && overrideAuth.type !== 'inherit')
    };
  }

  return {
    auth: authConfigSchema.parse(profile.auth),
    authSource: `environment profile: ${profile.name}`,
    profileName: profile.name,
    authComesFromCase: Boolean(overrideAuth && overrideAuth.type !== 'inherit')
  };
}

function resolveRuntimeValue(
  project: ProjectDocument,
  environment: EnvironmentDocument | undefined,
  extraSources: Array<Record<string, unknown>>,
  directValue?: string,
  variableRef?: string
) {
  const sources = mergeTemplateSources({
    project,
    environment,
    extraSources
  });
  if (variableRef?.trim()) {
    return interpolateString(`{{${variableRef.trim()}}}`, sources);
  }
  return interpolateString(directValue || '', sources);
}

function oauthCacheStatus(auth: AuthConfig) {
  if (!auth.accessToken) return 'none' as const;
  if (!auth.expiresAt) return 'fresh' as const;
  const expiresAt = Date.parse(auth.expiresAt);
  if (Number.isNaN(expiresAt)) return 'fresh' as const;
  return expiresAt > Date.now() ? 'fresh' as const : 'expired' as const;
}

function oauthTarget(auth: AuthConfig) {
  const target = auth.tokenPlacement || 'header';
  return {
    target,
    name: auth.tokenName || (target === 'query' ? 'access_token' : 'Authorization')
  };
}

function withResolvedOauthAuth(
  request: RequestDocument,
  caseDocument: CaseDocument | undefined,
  auth: AuthConfig,
  authComesFromCase: boolean
) {
  if (authComesFromCase && caseDocument) {
    return {
      request,
      caseDocument: {
        ...caseDocument,
        overrides: {
          ...caseDocument.overrides,
          auth
        }
      }
    };
  }

  return {
    request: {
      ...request,
      auth
    },
    caseDocument
  };
}

function applyOauthTokenToPreview(preview: ResolvedRequestPreview, auth: AuthConfig, source: string, profileName?: string) {
  if (!auth.accessToken) return preview;
  const target = oauthTarget(auth);
  const tokenPrefix = auth.tokenType || auth.tokenPrefix || 'Bearer';
  const row = {
    name: target.name,
    value: target.target === 'header' ? `${tokenPrefix} ${auth.accessToken}` : auth.accessToken,
    enabled: true,
    kind: 'text' as const,
    filePath: undefined
  };

  return {
    ...preview,
    headers:
      target.target === 'header'
        ? [...preview.headers.filter(item => item.name !== target.name), row]
        : preview.headers,
    query:
      target.target === 'query'
        ? [...preview.query.filter(item => item.name !== target.name), row]
        : preview.query,
    authState: {
      type: 'oauth2' as const,
      source,
      profileName,
      tokenInjected: true,
      cacheStatus: oauthCacheStatus(auth),
      expiresAt: auth.expiresAt,
      resolvedTokenUrl: preview.authState?.resolvedTokenUrl,
      missing: [],
      notes: profileName
        ? [`Using refreshed OAuth token from profile "${profileName}".`]
        : ['Using refreshed OAuth token for this request.']
    }
  };
}

async function refreshOauthClientCredentials(input: {
  workspace: WorkspaceIndex;
  project: ProjectDocument;
  request: RequestDocument;
  caseDocument?: CaseDocument;
  environment: EnvironmentDocument;
  extraSources?: Array<Record<string, unknown>>;
  forceRefresh?: boolean;
  sessionId?: string;
}) {
  const extraSources = input.extraSources || [];
  const effective = resolveEffectiveAuth(input.request, input.caseDocument, input.environment);
  const auth = effective.auth;
  if (auth.type !== 'oauth2') {
    return {
      environment: input.environment,
      auth,
      profileName: effective.profileName,
      authSource: effective.authSource,
      authComesFromCase: effective.authComesFromCase,
      refreshed: false
    };
  }

  const cacheStatus = oauthCacheStatus(auth);
  if (!input.forceRefresh && cacheStatus === 'fresh' && auth.accessToken) {
    return {
      environment: input.environment,
      auth,
      profileName: effective.profileName,
      authSource: effective.authSource,
      authComesFromCase: effective.authComesFromCase,
      refreshed: false
    };
  }

  const tokenUrl = resolveRuntimeValue(input.project, input.environment, extraSources, auth.tokenUrl);
  const clientId = resolveRuntimeValue(input.project, input.environment, extraSources, auth.clientId, auth.clientIdFromVar);
  const clientSecret = resolveRuntimeValue(input.project, input.environment, extraSources, auth.clientSecret, auth.clientSecretFromVar);
  const scope = resolveRuntimeValue(input.project, input.environment, extraSources, auth.scope);

  if (!tokenUrl.trim()) {
    throw new Error('OAuth2 token URL is required before sending this request.');
  }
  if (!clientId.trim()) {
    throw new Error(`OAuth2 client ID is missing${auth.clientIdFromVar ? ` (${auth.clientIdFromVar})` : ''}.`);
  }
  if (!clientSecret.trim()) {
    throw new Error(`OAuth2 client secret is missing${auth.clientSecretFromVar ? ` (${auth.clientSecretFromVar})` : ''}.`);
  }

  const tokenResponse = await sendRequest({
    method: 'POST',
    url: tokenUrl,
    headers: [
      { name: 'Accept', value: 'application/json', enabled: true, kind: 'text' },
      { name: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true, kind: 'text' }
    ],
    query: [],
    body: {
      mode: 'form-urlencoded',
      mimeType: 'application/x-www-form-urlencoded',
      text: '',
      fields: [
        { name: 'grant_type', value: auth.oauthFlow || 'client_credentials', enabled: true, kind: 'text' },
        { name: 'client_id', value: clientId, enabled: true, kind: 'text' },
        { name: 'client_secret', value: clientSecret, enabled: true, kind: 'text' },
        ...(scope.trim() ? [{ name: 'scope', value: scope, enabled: true, kind: 'text' as const }] : [])
      ]
    },
    sessionId: input.sessionId || input.workspace.root,
    followRedirects: true
  });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(tokenResponse.bodyText) as Record<string, unknown>;
  } catch (_error) {
    throw new Error('OAuth2 token endpoint returned a non-JSON response.');
  }

  const accessToken = String(payload.access_token || '');
  if (!accessToken.trim()) {
    throw new Error('OAuth2 token endpoint response is missing "access_token".');
  }

  const expiresIn = Number(payload.expires_in || 0);
  const tokenType = String(payload.token_type || auth.tokenType || auth.tokenPrefix || 'Bearer');
  const nextAuth = authConfigSchema.parse({
    ...auth,
    accessToken,
    tokenType,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : auth.expiresAt
  });

  const nextEnvironment = structuredClone(input.environment);
  if (effective.profileName) {
    nextEnvironment.authProfiles = nextEnvironment.authProfiles.map(item =>
      item.name === effective.profileName
        ? {
            ...item,
            auth: nextAuth
          }
        : item
    );
  }

  return {
    environment: nextEnvironment,
    auth: nextAuth,
    profileName: effective.profileName,
    authSource: effective.authSource,
    authComesFromCase: effective.authComesFromCase,
    refreshed: true
  };
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
  const migratedPayload = await ensureWorkspaceMigrated(root, payload);
  return scanPayloadToIndex(migratedPayload);
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
  compatibleScriptWarnings: number;
  exampleCount: number;
  runnableScore: number;
  runnableRequests: number;
  blockedRequests: number;
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
  let runnableRequests = 0;
  let blockedRequests = 0;
  result.requests.forEach(imported => {
    const existing = workspace.requests.find(record => collectionConflictsWithRecord(record, imported));
    if (existing) conflicts += 1;
    exampleCount += imported.request.examples.length;
    const authLooksConfigured =
      imported.request.auth.type === 'inherit' ||
      imported.request.auth.type === 'none' ||
      imported.request.auth.type === 'profile' ||
      (imported.request.auth.type === 'bearer' && Boolean(imported.request.auth.token || imported.request.auth.tokenFromVar)) ||
      (imported.request.auth.type === 'basic' && Boolean(imported.request.auth.username || imported.request.auth.usernameFromVar)) ||
      (imported.request.auth.type === 'apikey' && Boolean(imported.request.auth.key));
    const baseUrlLooksConfigured = imported.request.url.includes('{{baseUrl}}')
      ? Boolean(result.project.runtime.baseUrl && result.project.runtime.baseUrl !== 'https://api.example.com')
      : true;
    if (authLooksConfigured && baseUrlLooksConfigured) {
      runnableRequests += 1;
    } else {
      blockedRequests += 1;
    }
  });
  const newRequests = Math.max(result.requests.length - conflicts, 0);
  const degradedWarnings = warningsByStatus(result.warnings || [], 'degraded');
  const unsupportedWarnings = warningsByStatus(result.warnings || [], 'unsupported');
  const compatibleScriptWarnings = warningsByStatus(result.warnings || [], 'compatible');
  const runnableScore = result.requests.length === 0 ? 0 : Math.max(0, Math.round((runnableRequests / result.requests.length) * 100));
  const nextSteps = [
    (result.collections || []).length > 0 ? `${result.collections.length} collections will be created from the import source.` : '',
    conflicts > 0 ? `${conflicts} requests match existing names in the same folder. Review the conflict strategy before applying.` : '',
    degradedWarnings > 0 ? `${degradedWarnings} imported items need manual follow-up before they behave like the source collection.` : '',
    unsupportedWarnings > 0 ? `${unsupportedWarnings} scripts or features were preserved as text only and will not execute automatically.` : '',
    blockedRequests > 0 ? `${blockedRequests} imported requests still need baseUrl or auth fixes before they can run cleanly.` : '',
    result.warnings.some(item => item.code === 'auth-review' || item.code === 'oauth-review')
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
    compatibleScriptWarnings,
    exampleCount,
    runnableScore,
    runnableRequests,
    blockedRequests,
    nextSteps,
    warningBreakdown: [
      { label: 'Needs review', count: degradedWarnings },
      { label: 'Not supported', count: unsupportedWarnings },
      { label: 'Scripts kept', count: compatibleScriptWarnings },
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

  const nextProject: ProjectDocument = {
    ...workspace.project,
    runtime: {
      ...workspace.project.runtime,
      ...result.project.runtime,
      baseUrl:
        result.project.runtime.baseUrl && result.project.runtime.baseUrl !== 'https://api.example.com'
          ? result.project.runtime.baseUrl
          : workspace.project.runtime.baseUrl
    }
  };
  await saveProject(root, nextProject);

  const collectionNames = workspace.collections.map(item => item.document.name);
  for (const importedCollection of result.collections || []) {
    const collection = {
      ...importedCollection.collection,
      name: uniqueCopyName(importedCollection.collection.name, collectionNames)
    };
    collectionNames.push(collection.name);
    const writes = materializeCollectionDocument(collection, root, importedCollection.dataText || '');
    await Promise.all(writes.map(item => writeDocument(item.path, item.content)));
  }

  for (const importedEnv of result.environments) {
    const existing = workspace.environments.find(item => item.document.name === importedEnv.name)?.document;
    const merged: EnvironmentDocument = existing
      ? {
          ...existing,
          vars: {
            ...(existing.vars || {}),
            ...(importedEnv.vars || {})
          },
          sharedVars: {
            ...(existing.sharedVars || existing.vars || {}),
            ...(importedEnv.sharedVars || importedEnv.vars || {})
          },
          headers: mergeImportedHeaders(existing.headers || [], importedEnv.headers || []),
          sharedHeaders: mergeImportedHeaders(existing.sharedHeaders || existing.headers || [], importedEnv.sharedHeaders || importedEnv.headers || []),
          authProfiles: mergeImportedAuthProfiles(existing.authProfiles || [], importedEnv.authProfiles || [])
        }
      : importedEnv;
    await saveEnvironment(root, merged);
  }

  return {
    requestIds: nextRecords.map(item => item.request.id),
    requestNames: nextRecords.map(item => item.request.name),
    warnings: result.warnings || [],
    detectedFormat: result.detectedFormat,
    importedBaseUrl: nextProject.runtime.baseUrl,
    environmentNames: result.environments.map(item => item.name),
    strategy
  };
}

function mergeImportedHeaders(baseHeaders: EnvironmentDocument['headers'], nextHeaders: EnvironmentDocument['headers']) {
  const output = [...baseHeaders];
  const names = new Map(output.map((header, index) => [header.name.trim().toLowerCase(), index]));
  nextHeaders.forEach(header => {
    const key = header.name.trim().toLowerCase();
    const existing = names.get(key);
    if (existing == null) {
      names.set(key, output.length);
      output.push(header);
      return;
    }
    output[existing] = header;
  });
  return output;
}

function mergeImportedAuthProfiles(baseProfiles: EnvironmentDocument['authProfiles'], nextProfiles: EnvironmentDocument['authProfiles']) {
  const output = [...baseProfiles];
  const names = new Set(output.map(profile => profile.name));
  nextProfiles.forEach(profile => {
    if (names.has(profile.name)) return;
    names.add(profile.name);
    output.push(profile);
  });
  return output;
}

export async function createWorkspace(root: string, projectName: string) {
  const seed = createProjectSeed({ projectName, includeSampleRequest: true });
  await Promise.all(seed.writes.map(item => writeDocument(`${root}/${item.path}`, item.content)));
  return openWorkspace(root);
}

export async function saveEnvironment(root: string, environment: EnvironmentDocument) {
  const writes = materializeEnvironmentDocuments(environment, root);
  const activePaths = new Set(writes.map(item => item.path));
  const staleLocalPath = environment.localFilePath && !activePaths.has(environment.localFilePath) ? environment.localFilePath : null;
  await Promise.all(writes.map(item => writeDocument(item.path, item.content)));
  if (staleLocalPath) {
    await deleteEntry(staleLocalPath, false).catch(() => undefined);
  }
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

export async function exportBrunoCollection(
  workspace: WorkspaceIndex,
  targetRoot: string,
  collection?: CollectionDocument
) {
  const writes = materializeBrunoCollectionExport({
    project: workspace.project,
    requests: workspace.requests,
    environments: workspace.environments.map(item => item.document),
    collection
  });
  await Promise.all(writes.map(item => writeDocument(`${targetRoot}/${item.path}`, item.content)));
  return writes;
}

export function exportBrunoJsonCollection(
  workspace: WorkspaceIndex,
  collection?: CollectionDocument
) {
  return serializeBrunoJsonCollection({
    project: workspace.project,
    requests: workspace.requests,
    collection
  });
}

export function exportOpenCollection(
  workspace: WorkspaceIndex,
  collection?: CollectionDocument
) {
  return serializeOpenCollection({
    project: workspace.project,
    requests: workspace.requests,
    environments: workspace.environments.map(item => item.document),
    collection
  });
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
  requestId?: string,
  caseId?: string
) {
  const collection = createEmptyCollection('New Collection');
  if (requestId) {
    collection.steps.push(createCollectionStep({
      key: 'step_1',
      requestId,
      caseId,
      name: 'Initial Step'
    }));
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

export async function importFromBrunoDirectory(root: string) {
  const payload = await scanWorkspace(root);
  const result = importBrunoCollectionFiles(
    payload.files.map(file => ({
      path: relativeWorkspacePath(payload.root, file.path),
      content: file.content
    }))
  );
  return {
    source: {
      name: root.split('/').filter(Boolean).at(-1) || 'bruno',
      content: '',
      source_type: 'directory'
    },
    result
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
  return runPreparedRequestCore({
    workspace,
    request: input.request,
    caseDocument: input.caseDocument,
    sessionId: input.sessionId || workspace.root,
    context: input.context,
    sendRequest: preview =>
      sendRequest({
        ...preview,
        sessionId: preview.sessionId || input.sessionId || workspace.root
      })
  });
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

export async function refreshResolvedRequestAuth(
  workspace: WorkspaceIndex,
  requestId: string,
  caseId: string | undefined,
  input: {
    environmentName?: string;
    runtimeVariables?: Record<string, string>;
    extraSources?: Array<Record<string, unknown>>;
    forceRefresh?: boolean;
  } = {}
) {
  const record = workspace.requests.find(item => item.request.id === requestId);
  if (!record) throw new Error('Request not found');
  const caseDocument = record.cases.find(item => item.id === caseId);
  const envName = caseDocument?.environment || input.environmentName || workspace.project.defaultEnvironment;
  const environment = createRuntimeEnvironment(workspace, envName);
  const extraSources = [
    createNamedTemplateSource('runtime variables', input.runtimeVariables || {}, 'runtime'),
    ...(input.extraSources || [])
  ];
  const refreshed = await refreshOauthClientCredentials({
    workspace,
    project: workspace.project,
    request: record.request,
    caseDocument,
    environment,
    extraSources,
    forceRefresh: input.forceRefresh,
    sessionId: workspace.root
  });
  if (refreshed.auth.type !== 'oauth2') {
    throw new Error('The current request does not use OAuth2 client credentials.');
  }
  const withResolvedAuth = refreshed.profileName
    ? { request: record.request, caseDocument }
    : withResolvedOauthAuth(record.request, caseDocument, refreshed.auth, refreshed.authComesFromCase);
  const insight = inspectResolvedRequest(
    workspace.project,
    withResolvedAuth.request,
    withResolvedAuth.caseDocument,
    refreshed.environment,
    extraSources
  );
  return {
    environment: refreshed.environment,
    preview: applyOauthTokenToPreview(insight.preview, refreshed.auth, refreshed.authSource, refreshed.profileName)
  };
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
  filters?: CollectionRunFilters;
};

export async function runCollection(
  workspace: WorkspaceIndex,
  collectionId: string,
  options: CollectionRunOptions = {}
) {
  const report = await runCollectionCore({
    workspace,
    collectionId,
    options,
    sendRequest: preview =>
      sendRequest({
        ...preview,
        sessionId: preview.sessionId || workspace.root
      })
  });
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
  return rerunFailedStepKeysCore(report);
}

export function filtersFromReport(report: CollectionRunReport) {
  return filtersFromCollectionReport(report);
}

export function collectionReportSeed(report: CollectionRunReport) {
  return report;
}

export function curlForPreview(preview: ResolvedRequestPreview) {
  return buildCurlCommand(preview);
}

export function brunoForRequest(request: RequestDocument) {
  return serializeRequestToBruno(request);
}

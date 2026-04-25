import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildWorkspaceIndex,
  filtersFromCollectionReport,
  materializeCollectionDocument,
  materializeEnvironmentDocuments,
  materializeProjectDocument,
  materializeRequestDocuments,
  renderCollectionRunReportHtml,
  renderCollectionRunReportJunit,
  rerunFailedStepKeys,
  runCollection,
  type CollectionRunFilters
} from '../packages/debugger-core/src/index';
import {
  DEFAULT_GITIGNORE,
  SCHEMA_VERSION,
  type CollectionDocument,
  type CollectionRunReport,
  type CollectionRunPreset,
  type ResolvedRequestPreview,
  type SendRequestInput,
  type SendRequestResult,
  type WorkspaceIndex
} from '../packages/debugger-schema/src/index';

export type ReporterFormat = 'json' | 'html' | 'junit';

type CliExplicitFlags = {
  environmentName: boolean;
  failFast: boolean;
  tags: boolean;
  stepKeys: boolean;
  requestIds: boolean;
  caseIds: boolean;
};

type CliOptions = {
  workspaceRoot: string;
  collectionSelector?: string;
  presetSelector?: string;
  environmentName?: string;
  listOnly: boolean;
  listPresets: boolean;
  failFast: boolean;
  filters: CollectionRunFilters;
  rerunFailedReportPath?: string;
  reportPaths: Partial<Record<ReporterFormat, string>>;
  configuredReportBasePath?: string;
  explicit: CliExplicitFlags;
};

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const EXIT_CONFIG = 2;
const EXIT_RUNTIME = 3;

function printUsage() {
  console.log(`Usage:
  npm run debugger:run -- --workspace <path> [--collection <id|name>] [--environment <name>] [--tag smoke] [--step login] [--request req_x] [--case case_x]
  npm run debugger:run -- --workspace <path> [--report-json file] [--report-html file] [--report-junit file] [--fail-fast]
  npm run debugger:run -- --workspace <path> --collection smoke-suite --preset nightly --report-configured ./reports/nightly.json
  npm run debugger:run -- --workspace <path> --rerun-failed ./reports/last-run.json
  npm run debugger:run -- --workspace <path> --list
  npm run debugger:run -- --workspace <path> --collection smoke-suite --list-presets
`);
}

function pushFilterValue(record: Record<string, string[]>, key: keyof CollectionRunFilters, value: string) {
  record[key] = [...(record[key] || []), value];
}

export function formatFilters(filters: CollectionRunFilters) {
  const parts = [
    filters.tags?.length ? `tags=${filters.tags.join(',')}` : '',
    filters.stepKeys?.length ? `steps=${filters.stepKeys.join(',')}` : '',
    filters.requestIds?.length ? `requests=${filters.requestIds.join(',')}` : '',
    filters.caseIds?.length ? `cases=${filters.caseIds.join(',')}` : ''
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'none';
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    workspaceRoot: '',
    listOnly: false,
    listPresets: false,
    failFast: false,
    filters: {},
    reportPaths: {},
    explicit: {
      environmentName: false,
      failFast: false,
      tags: false,
      stepKeys: false,
      requestIds: false,
      caseIds: false
    }
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if ((token === '--workspace' || token === '-w') && next) {
      options.workspaceRoot = next;
      index += 1;
      continue;
    }
    if (token === '--collection' && next) {
      options.collectionSelector = next;
      index += 1;
      continue;
    }
    if (token === '--preset' && next) {
      options.presetSelector = next;
      index += 1;
      continue;
    }
    if (token === '--environment' && next) {
      options.environmentName = next;
      options.explicit.environmentName = true;
      index += 1;
      continue;
    }
    if (token === '--tag' && next) {
      pushFilterValue(options.filters, 'tags', next);
      options.explicit.tags = true;
      index += 1;
      continue;
    }
    if (token === '--step' && next) {
      pushFilterValue(options.filters, 'stepKeys', next);
      options.explicit.stepKeys = true;
      index += 1;
      continue;
    }
    if (token === '--request' && next) {
      pushFilterValue(options.filters, 'requestIds', next);
      options.explicit.requestIds = true;
      index += 1;
      continue;
    }
    if (token === '--case' && next) {
      pushFilterValue(options.filters, 'caseIds', next);
      options.explicit.caseIds = true;
      index += 1;
      continue;
    }
    if (token === '--report-json' && next) {
      options.reportPaths.json = next;
      index += 1;
      continue;
    }
    if (token === '--report-html' && next) {
      options.reportPaths.html = next;
      index += 1;
      continue;
    }
    if (token === '--report-junit' && next) {
      options.reportPaths.junit = next;
      index += 1;
      continue;
    }
    if (token === '--report' && next) {
      const ext = path.extname(next).toLowerCase();
      if (ext === '.html') options.reportPaths.html = next;
      else if (ext === '.xml') options.reportPaths.junit = next;
      else options.reportPaths.json = next;
      index += 1;
      continue;
    }
    if (token === '--rerun-failed' && next) {
      options.rerunFailedReportPath = next;
      index += 1;
      continue;
    }
    if (token === '--report-configured' && next) {
      options.configuredReportBasePath = next;
      index += 1;
      continue;
    }
    if (token === '--fail-fast') {
      options.failFast = true;
      options.explicit.failFast = true;
      continue;
    }
    if (token === '--list') {
      options.listOnly = true;
      continue;
    }
    if (token === '--list-presets') {
      options.listPresets = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      printUsage();
      process.exit(EXIT_SUCCESS);
    }
  }

  if (!options.workspaceRoot) {
    printUsage();
    throw new Error('--workspace is required');
  }

  return options;
}

async function walkFiles(root: string, current = root, output: Record<string, string> = {}) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'target') {
        continue;
      }
      await walkFiles(root, fullPath, output);
      continue;
    }
    output[fullPath] = await fs.readFile(fullPath, 'utf8');
  }
  return output;
}

function fileContentsToWorkspace(root: string, fileContents: Record<string, string>) {
  const projectContent = fileContents[path.join(root, 'project.yaml')] || '';
  return buildWorkspaceIndex({
    root,
    projectContent,
    fileContents
  });
}

function needsMigration(fileContents: Record<string, string>) {
  return Object.entries(fileContents).some(([filePath, content]) =>
    (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) && content.includes('schemaVersion: 1')
  );
}

async function ensureWorkspaceMigrated(root: string, fileContents: Record<string, string>) {
  if (!needsMigration(fileContents)) {
    return fileContents;
  }

  const backupRoot = path.join(root, '.yapi-debugger-cache', 'migrations', new Date().toISOString().replace(/[:.]/g, '-'));
  for (const [fullPath, content] of Object.entries(fileContents)) {
    const relative = path.relative(root, fullPath);
    const target = path.join(backupRoot, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }

  const workspace = fileContentsToWorkspace(root, fileContents);
  const projectWrite = materializeProjectDocument({ ...workspace.project, schemaVersion: SCHEMA_VERSION }, root);
  await fs.writeFile(projectWrite.path, projectWrite.content, 'utf8');

  for (const environment of workspace.environments) {
    for (const write of materializeEnvironmentDocuments({ ...environment.document, schemaVersion: SCHEMA_VERSION }, root)) {
      await fs.mkdir(path.dirname(write.path), { recursive: true });
      await fs.writeFile(write.path, write.content, 'utf8');
    }
  }

  for (const record of workspace.requests) {
    const writes = materializeRequestDocuments([{
      folderSegments: record.folderSegments,
      request: { ...record.request, schemaVersion: SCHEMA_VERSION },
      cases: record.cases.map(item => ({ ...item, schemaVersion: SCHEMA_VERSION }))
    }], root);
    for (const write of writes) {
      await fs.mkdir(path.dirname(write.path), { recursive: true });
      await fs.writeFile(write.path, write.content, 'utf8');
    }
  }

  for (const record of workspace.collections) {
    const writes = materializeCollectionDocument({ ...record.document, schemaVersion: SCHEMA_VERSION }, root, record.dataText);
    for (const write of writes) {
      await fs.mkdir(path.dirname(write.path), { recursive: true });
      await fs.writeFile(write.path, write.content, 'utf8');
    }
  }

  const gitignorePath = path.join(root, '.gitignore');
  const existingGitignore = fileContents[gitignorePath] || '';
  const gitignoreContent = existingGitignore.includes('.yapi-debugger-cache/')
    ? existingGitignore
    : `${existingGitignore.trimEnd()}\n${DEFAULT_GITIGNORE}`.trimStart();
  await fs.writeFile(gitignorePath, gitignoreContent.endsWith('\n') ? gitignoreContent : `${gitignoreContent}\n`, 'utf8');
  await fs.writeFile(path.join(root, '.yapi-debugger-cache', 'migration-manifest.json'), JSON.stringify({
    migratedAt: new Date().toISOString(),
    fromVersion: 1,
    toVersion: SCHEMA_VERSION,
    backupRoot
  }, null, 2), 'utf8');

  return walkFiles(root);
}

function buildCookieHeader(jar: Map<string, string>) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function updateCookieJar(headers: Headers, jar: Map<string, string>) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  values.forEach(raw => {
    const [pair] = raw.split(';');
    const [name, ...rest] = pair.split('=');
    if (!name) return;
    jar.set(name.trim(), rest.join('=').trim());
  });
}

function normalizeRequestPreview(input: SendRequestInput | ResolvedRequestPreview): ResolvedRequestPreview {
  if ('name' in input && 'requestPath' in input && 'authSource' in input) {
    return input;
  }

  return {
    ...input,
    name: input.url,
    authSource: 'script',
    requestPath: new URL(input.url).pathname || '/',
    environmentName: undefined
  };
}

async function sendPreview(input: SendRequestInput | ResolvedRequestPreview, jar: Map<string, string>): Promise<SendRequestResult> {
  const preview = normalizeRequestPreview(input);
  const url = new URL(preview.url);
  preview.query
    .filter(item => item.enabled && item.name.trim())
    .forEach(item => url.searchParams.append(item.name, item.value));

  const headers = new Headers();
  preview.headers
    .filter(item => item.enabled && item.name.trim())
    .forEach(item => headers.append(item.name, item.value));
  const cookieHeader = buildCookieHeader(jar);
  if (cookieHeader && !headers.has('Cookie')) {
    headers.set('Cookie', cookieHeader);
  }

  let body: BodyInit | undefined;
  if ((preview.body.mode === 'json' || preview.body.mode === 'text') && preview.body.text) {
    body = preview.body.text;
  }
  if (preview.body.mode === 'form-urlencoded') {
    const params = new URLSearchParams();
    preview.body.fields
      .filter(item => item.enabled && item.name.trim())
      .forEach(item => params.append(item.name, item.value));
    body = params;
  }
  if (preview.body.mode === 'multipart') {
    const form = new FormData();
    for (const field of preview.body.fields.filter(item => item.enabled && item.name.trim())) {
      if (field.kind === 'file') {
        const filePath = field.filePath || field.value;
        if (!filePath) {
          throw new Error(`Multipart field ${field.name} is missing a file path`);
        }
        const fileBytes = await fs.readFile(filePath);
        form.append(field.name, new Blob([fileBytes]), path.basename(filePath));
      } else {
        form.append(field.name, field.value);
      }
    }
    body = form;
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), preview.timeoutMs || 30_000);
  try {
    const response = await fetch(url, {
      method: preview.method,
      headers,
      body,
      redirect: preview.followRedirects ? 'follow' : 'manual',
      signal: controller.signal
    });
    const bodyText = await response.text();
    updateCookieJar(response.headers, jar);
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      durationMs: Date.now() - startedAt,
      sizeBytes: new TextEncoder().encode(bodyText).length,
      headers: [...response.headers.entries()].map(([name, value]) => ({ name, value })),
      bodyText,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`Request timed out after ${preview.timeoutMs || 30_000}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function openWorkspace(root: string) {
  const initialContents = await walkFiles(root);
  const migratedContents = await ensureWorkspaceMigrated(root, initialContents);
  return fileContentsToWorkspace(root, migratedContents);
}

async function writeReport(pathValue: string, content: string) {
  const outputPath = path.resolve(pathValue);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, content, 'utf8');
}

async function readReport(pathValue: string) {
  return JSON.parse(await fs.readFile(path.resolve(pathValue), 'utf8')) as CollectionRunReport;
}

function matchesCollection(workspace: WorkspaceIndex, selector?: string) {
  if (!selector) return workspace.collections[0];
  return workspace.collections.find(item => item.document.id === selector || item.document.name === selector);
}

export function selectRunPreset(collection: CollectionDocument, selector?: string) {
  if (!selector) return undefined;
  return collection.runPresets.find(item => item.id === selector || item.name === selector);
}

function mergeFilterValue(base?: string[], override?: string[]) {
  return override !== undefined ? override : base;
}

export function resolveExecutionOptions(
  options: CliOptions,
  inheritedFilters: CollectionRunFilters = {},
  preset?: CollectionRunPreset
) {
  const filters: CollectionRunFilters = {
    tags: options.explicit.tags
      ? options.filters.tags
      : preset
        ? [...preset.tags]
        : inheritedFilters.tags,
    stepKeys: options.explicit.stepKeys
      ? options.filters.stepKeys
      : preset
        ? [...preset.stepKeys]
        : inheritedFilters.stepKeys,
    requestIds: options.explicit.requestIds
      ? options.filters.requestIds
      : inheritedFilters.requestIds,
    caseIds: options.explicit.caseIds
      ? options.filters.caseIds
      : inheritedFilters.caseIds
  };

  return {
    environmentName: options.explicit.environmentName
      ? options.environmentName
      : preset?.environmentName ?? options.environmentName,
    failFast: options.explicit.failFast ? options.failFast : preset?.failFast ?? options.failFast,
    filters
  };
}

function stripConfiguredReportExtension(filePath: string) {
  return filePath.replace(/\.(json|html|xml)$/i, '');
}

export function resolveReportPaths(
  explicitPaths: Partial<Record<ReporterFormat, string>>,
  configuredReportBasePath: string | undefined,
  reporters: ReporterFormat[]
) {
  const configuredPaths = configuredReportBasePath
    ? Object.fromEntries(
        reporters.map(reporter => [
          reporter,
          `${stripConfiguredReportExtension(configuredReportBasePath)}.${reporter === 'junit' ? 'xml' : reporter}`
        ])
      ) as Partial<Record<ReporterFormat, string>>
    : {};
  return {
    json: mergeFilterValue(configuredPaths.json, explicitPaths.json),
    html: mergeFilterValue(configuredPaths.html, explicitPaths.html),
    junit: mergeFilterValue(configuredPaths.junit, explicitPaths.junit)
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const workspace = await openWorkspace(path.resolve(options.workspaceRoot));

    if (options.listOnly) {
      workspace.collections.forEach(record => console.log(`${record.document.id}\t${record.document.name}`));
      process.exitCode = EXIT_SUCCESS;
      return;
    }

    const collection = matchesCollection(workspace, options.collectionSelector);
    if (!collection) {
      throw new Error('No collections were found in the workspace');
    }
    const preset = selectRunPreset(collection.document, options.presetSelector);
    if (options.presetSelector && !preset) {
      throw new Error(`Preset "${options.presetSelector}" was not found on collection ${collection.document.name}`);
    }

    if (options.listPresets) {
      if (collection.document.runPresets.length === 0) {
        console.log('No run presets defined for the selected collection.');
      } else {
        collection.document.runPresets.forEach(item => {
          console.log([
            item.id,
            item.name,
            `environment=${item.environmentName || 'default'}`,
            `tags=${item.tags.join(',') || 'none'}`,
            `steps=${item.stepKeys.join(',') || 'all'}`,
            `failFast=${item.failFast ? 'yes' : 'no'}`
          ].join('\t'));
        });
      }
      process.exitCode = EXIT_SUCCESS;
      return;
    }

    const seedReport = options.rerunFailedReportPath ? await readReport(options.rerunFailedReportPath) : null;
    const inheritedFilters = seedReport ? filtersFromCollectionReport(seedReport) : {};
    const executionOptions = resolveExecutionOptions(options, inheritedFilters, preset);
    const effectiveFilters = executionOptions.filters;
    const stepKeys = seedReport ? rerunFailedStepKeys(seedReport) : effectiveFilters.stepKeys;
    const reportPaths = resolveReportPaths(
      options.reportPaths,
      options.configuredReportBasePath,
      collection.document.reporters as ReporterFormat[]
    );
    if (options.configuredReportBasePath && collection.document.reporters.length === 0) {
      throw new Error('The selected collection has no configured reporters. Enable at least one reporter first.');
    }
    const cookieJar = new Map<string, string>();
    const report = await runCollection({
      workspace,
      collectionId: collection.document.id,
      options: {
        environmentName: executionOptions.environmentName,
        filters: effectiveFilters,
        stepKeys,
        seedReport,
        failFast: executionOptions.failFast
      },
      sendRequest: preview => sendPreview(preview, cookieJar)
    });

    console.log(`Collection: ${report.collectionName}`);
    if (preset) {
      console.log(`Preset: ${preset.name}`);
    }
    console.log(`Environment: ${report.environmentName || 'shared'}`);
    console.log(`Matrix: ${report.matrixEnvironments.join(', ') || 'single'}`);
    console.log(`Status: ${report.status}`);
    console.log(`Passed: ${report.passedSteps}  Failed: ${report.failedSteps}  Skipped: ${report.skippedSteps}`);
    console.log(`Filters: ${formatFilters(report.filters)}`);

    if (reportPaths.json) {
      await writeReport(reportPaths.json, JSON.stringify(report, null, 2));
      console.log(`JSON report written to ${path.resolve(reportPaths.json)}`);
    }
    if (reportPaths.html) {
      await writeReport(reportPaths.html, renderCollectionRunReportHtml(report));
      console.log(`HTML report written to ${path.resolve(reportPaths.html)}`);
    }
    if (reportPaths.junit) {
      await writeReport(reportPaths.junit, renderCollectionRunReportJunit(report));
      console.log(`JUnit report written to ${path.resolve(reportPaths.junit)}`);
    }

    process.exitCode = report.failedSteps > 0 ? EXIT_FAILURE : EXIT_SUCCESS;
  } catch (error) {
    console.error((error as Error).message || error);
    process.exitCode =
      (error as Error).message?.includes('workspace') || (error as Error).message?.includes('Collection')
        ? EXIT_CONFIG
        : EXIT_RUNTIME;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}

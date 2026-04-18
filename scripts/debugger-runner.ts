import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  buildWorkspaceIndex,
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
  type CollectionRunReport,
  type ResolvedRequestPreview,
  type SendRequestInput,
  type SendRequestResult,
  type WorkspaceIndex
} from '../packages/debugger-schema/src/index';

type CliOptions = {
  workspaceRoot: string;
  collectionSelector?: string;
  environmentName?: string;
  listOnly: boolean;
  failFast: boolean;
  filters: CollectionRunFilters;
  rerunFailedReportPath?: string;
  reportPaths: Partial<Record<'json' | 'html' | 'junit', string>>;
};

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const EXIT_CONFIG = 2;
const EXIT_RUNTIME = 3;

function printUsage() {
  console.log(`Usage:
  npm run debugger:run -- --workspace <path> [--collection <id|name>] [--environment <name>] [--tag smoke] [--step login] [--request req_x] [--case case_x]
  npm run debugger:run -- --workspace <path> [--report-json file] [--report-html file] [--report-junit file] [--fail-fast]
  npm run debugger:run -- --workspace <path> --rerun-failed ./reports/last-run.json
  npm run debugger:run -- --workspace <path> --list
`);
}

function pushFilterValue(record: Record<string, string[]>, key: keyof CollectionRunFilters, value: string) {
  record[key] = [...(record[key] || []), value];
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    workspaceRoot: '',
    listOnly: false,
    failFast: false,
    filters: {},
    reportPaths: {}
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
    if (token === '--environment' && next) {
      options.environmentName = next;
      index += 1;
      continue;
    }
    if (token === '--tag' && next) {
      pushFilterValue(options.filters, 'tags', next);
      index += 1;
      continue;
    }
    if (token === '--step' && next) {
      pushFilterValue(options.filters, 'stepKeys', next);
      index += 1;
      continue;
    }
    if (token === '--request' && next) {
      pushFilterValue(options.filters, 'requestIds', next);
      index += 1;
      continue;
    }
    if (token === '--case' && next) {
      pushFilterValue(options.filters, 'caseIds', next);
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
    if (token === '--fail-fast') {
      options.failFast = true;
      continue;
    }
    if (token === '--list') {
      options.listOnly = true;
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

    const seedReport = options.rerunFailedReportPath ? await readReport(options.rerunFailedReportPath) : null;
    const stepKeys = seedReport ? rerunFailedStepKeys(seedReport) : options.filters.stepKeys;
    const cookieJar = new Map<string, string>();
    const report = await runCollection({
      workspace,
      collectionId: collection.document.id,
      options: {
        environmentName: options.environmentName,
        filters: options.filters,
        stepKeys,
        seedReport,
        failFast: options.failFast
      },
      sendRequest: preview => sendPreview(preview, cookieJar)
    });

    console.log(`Collection: ${report.collectionName}`);
    console.log(`Environment: ${report.environmentName || 'shared'}`);
    console.log(`Matrix: ${report.matrixEnvironments.join(', ') || 'single'}`);
    console.log(`Status: ${report.status}`);
    console.log(`Passed: ${report.passedSteps}  Failed: ${report.failedSteps}  Skipped: ${report.skippedSteps}`);

    if (options.reportPaths.json) {
      await writeReport(options.reportPaths.json, JSON.stringify(report, null, 2));
      console.log(`JSON report written to ${path.resolve(options.reportPaths.json)}`);
    }
    if (options.reportPaths.html) {
      await writeReport(options.reportPaths.html, renderCollectionRunReportHtml(report));
      console.log(`HTML report written to ${path.resolve(options.reportPaths.html)}`);
    }
    if (options.reportPaths.junit) {
      await writeReport(options.reportPaths.junit, renderCollectionRunReportJunit(report));
      console.log(`JUnit report written to ${path.resolve(options.reportPaths.junit)}`);
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

void main();

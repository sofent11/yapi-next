import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  applyCollectionRules,
  buildWorkspaceIndex,
  createNamedTemplateSource,
  evaluateChecks,
  executeRequestScript,
  inspectResolvedRequest,
  parseCollectionDataText,
  renderCollectionRunReportHtml
} from '../packages/debugger-core/src/index';
import { createDefaultEnvironment, createId, type CollectionRunReport, type EnvironmentDocument, type ResolvedRequestPreview, type SendRequestResult, type WorkspaceIndex } from '../packages/debugger-schema/src/index';

type CliOptions = {
  workspaceRoot: string;
  collectionSelector?: string;
  environmentName?: string;
  reportPath?: string;
  reportFormat: 'json' | 'html';
  listOnly: boolean;
};

type RuntimeState = {
  variables: Record<string, string>;
  environment: EnvironmentDocument;
};

function printUsage() {
  console.log(`Usage:
  npm run debugger:run -- --workspace <path> [--collection <id|name>] [--environment <name>] [--report <path>] [--format json|html]
  npm run debugger:run -- --workspace <path> --list
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    workspaceRoot: '',
    reportFormat: 'json',
    listOnly: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--workspace' && next) {
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
    if (token === '--report' && next) {
      options.reportPath = next;
      index += 1;
      continue;
    }
    if (token === '--format' && next && (next === 'json' || next === 'html')) {
      options.reportFormat = next;
      index += 1;
      continue;
    }
    if (token === '--list') {
      options.listOnly = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      printUsage();
      process.exit(0);
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
      await walkFiles(root, fullPath, output);
      continue;
    }
    output[fullPath] = await fs.readFile(fullPath, 'utf8');
  }
  return output;
}

async function openWorkspace(root: string) {
  const fileContents = await walkFiles(root);
  const projectContent = fileContents[path.join(root, 'project.yaml')] || '';
  return buildWorkspaceIndex({
    root,
    projectContent,
    fileContents
  });
}

function ensureEnvironment(name: string, workspace: WorkspaceIndex) {
  return structuredClone(
    workspace.environments.find(item => item.document.name === name)?.document || createDefaultEnvironment(name)
  );
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

async function sendPreview(preview: ResolvedRequestPreview, jar: Map<string, string>): Promise<SendRequestResult> {
  const url = new URL(preview.url);
  preview.query
    .filter(item => item.enabled && item.name.trim())
    .forEach(item => {
      url.searchParams.append(item.name, item.value);
    });

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
  const response = await fetch(url, {
    method: preview.method,
    headers,
    body,
    redirect: preview.followRedirects ? 'follow' : 'manual'
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
      headers: Object.fromEntries(preview.headers.filter(item => item.enabled).map(item => [item.name.toLowerCase(), item.value])),
      query: Object.fromEntries(preview.query.filter(item => item.enabled).map(item => [item.name, item.value])),
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

async function runCollectionCli(workspace: WorkspaceIndex, collectionId: string, environmentName?: string) {
  const collectionRecord = workspace.collections.find(item => item.document.id === collectionId);
  if (!collectionRecord) {
    throw new Error(`Collection ${collectionId} was not found`);
  }

  const collection = collectionRecord.document;
  const envName = environmentName || collection.defaultEnvironment || workspace.project.defaultEnvironment;
  const baseEnvironment = ensureEnvironment(envName, workspace);
  const dataRows = parseCollectionDataText(collectionRecord.dataText || '');
  const iterations = dataRows.length > 0 ? dataRows : Array.from({ length: Math.max(collection.iterationCount || 1, 1) }, () => ({}));
  const cookieJar = new Map<string, string>();
  const reportIterations: CollectionRunReport['iterations'] = [];
  let passedSteps = 0;
  let failedSteps = 0;
  let skippedSteps = 0;

  for (let index = 0; index < iterations.length; index += 1) {
    const runtimeState: RuntimeState = {
      variables: { ...collection.vars },
      environment: structuredClone(baseEnvironment)
    };
    const dataVars = iterations[index] as Record<string, unknown>;
    const seededOutputs: Record<string, unknown> = {};
    const stepRuns: CollectionRunReport['iterations'][number]['stepRuns'] = [];
    let shouldStop = false;

    for (const step of collection.steps.filter(item => item.enabled)) {
      const requestRecord = workspace.requests.find(item => item.request.id === step.requestId);
      const caseDocument = requestRecord?.cases.find(item => item.id === step.caseId);
      if (!requestRecord) {
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
          error: `Request ${step.requestId} was not found`
        });
        if (collection.stopOnFailure) shouldStop = true;
        continue;
      }

      if (shouldStop) {
        skippedSteps += 1;
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
        continue;
      }

      try {
        const beforeSources = [
          createNamedTemplateSource('runtime variables', runtimeState.variables, 'runtime'),
          createNamedTemplateSource('collection vars', collection.vars, 'collection'),
          createNamedTemplateSource(`data row ${index + 1}`, dataVars, 'data-row'),
          createNamedTemplateSource('step outputs', { steps: seededOutputs }, 'step-output')
        ];

        const previewBeforeScripts = inspectResolvedRequest(
          workspace.project,
          requestRecord.request,
          caseDocument,
          runtimeState.environment,
          beforeSources
        ).preview;
        const preScript = executeRequestScript({
          phase: 'pre-request',
          script: caseDocument?.scripts?.preRequest || '',
          state: runtimeState,
          request: previewBeforeScripts
        });
        const resolved = inspectResolvedRequest(
          workspace.project,
          requestRecord.request,
          caseDocument,
          preScript.state.environment,
          [
            createNamedTemplateSource('runtime variables', preScript.state.variables, 'script'),
            createNamedTemplateSource('collection vars', collection.vars, 'collection'),
            createNamedTemplateSource(`data row ${index + 1}`, dataVars, 'data-row'),
            createNamedTemplateSource('step outputs', { steps: seededOutputs }, 'step-output')
          ]
        );
        const blockingDiagnostics = resolved.diagnostics.filter(item => item.blocking);
        if (blockingDiagnostics.length > 0) {
          throw new Error(blockingDiagnostics.map(item => item.message).join(' '));
        }

        const response = await sendPreview(resolved.preview, cookieJar);
        const builtinChecks = caseDocument ? evaluateChecks(response, caseDocument.checks || []) : [];
        const collectionChecks = applyCollectionRules({ ...collection.rules, response });
        const caseChecks = caseDocument ? executeRequestScript({
          phase: 'post-response',
          script: caseDocument.scripts?.postResponse || '',
          state: preScript.state,
          request: resolved.preview,
          response
        }) : executeRequestScript({
          phase: 'post-response',
          script: '',
          state: preScript.state,
          request: resolved.preview,
          response
        });
        const ok = [...builtinChecks, ...collectionChecks, ...caseChecks.testResults].every(item => item.ok);

        seededOutputs[step.key] = stepOutputFromRun(resolved.preview, response);
        stepRuns.push({
          stepKey: step.key,
          stepName: step.name || step.key,
          requestId: step.requestId,
          caseId: step.caseId,
          ok,
          skipped: false,
          request: resolved.preview,
          response,
          checkResults: [...builtinChecks, ...collectionChecks, ...caseChecks.testResults],
          scriptLogs: [...preScript.logs, ...caseChecks.logs]
        });
        runtimeState.variables = caseChecks.state.variables;
        runtimeState.environment = caseChecks.state.environment;

        if (ok) {
          passedSteps += 1;
        } else {
          failedSteps += 1;
          if (collection.stopOnFailure) shouldStop = true;
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
        if (collection.stopOnFailure) shouldStop = true;
      }
    }

    reportIterations.push({
      index,
      dataLabel: dataRows.length > 0 ? `Row ${index + 1}` : undefined,
      dataVars: Object.fromEntries(Object.entries(dataVars).map(([key, value]) => [key, String(value ?? '')])),
      stepRuns
    });
  }

  return {
    id: createId('colrun'),
    workspaceRoot: workspace.root,
    collectionId: collection.id,
    collectionName: collection.name,
    environmentName: envName,
    status: failedSteps === 0 ? 'passed' : passedSteps > 0 ? 'partial' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    iterationCount: reportIterations.length || 1,
    passedSteps,
    failedSteps,
    skippedSteps,
    iterations: reportIterations
  } satisfies CollectionRunReport;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workspace = await openWorkspace(path.resolve(options.workspaceRoot));

  if (options.listOnly) {
    workspace.collections.forEach(record => {
      console.log(`${record.document.id}\t${record.document.name}`);
    });
    return;
  }

  const collection =
    workspace.collections.find(item => item.document.id === options.collectionSelector || item.document.name === options.collectionSelector) ||
    workspace.collections[0];
  if (!collection) {
    throw new Error('No collections were found in the workspace');
  }

  const report = await runCollectionCli(workspace, collection.document.id, options.environmentName);
  console.log(`Collection: ${report.collectionName}`);
  console.log(`Environment: ${report.environmentName || 'shared'}`);
  console.log(`Status: ${report.status}`);
  console.log(`Passed: ${report.passedSteps}  Failed: ${report.failedSteps}  Skipped: ${report.skippedSteps}`);

  if (options.reportPath) {
    const outputPath = path.resolve(options.reportPath);
    const content = options.reportFormat === 'json' ? JSON.stringify(report, null, 2) : renderCollectionRunReportHtml(report);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf8');
    console.log(`Report written to ${outputPath}`);
  }

  if (report.failedSteps > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error((error as Error).message || error);
  process.exitCode = 1;
});

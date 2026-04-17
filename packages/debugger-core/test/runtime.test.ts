import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCollectionRules,
  buildWorkspaceIndex,
  buildCurlCommand,
  executeRequestScript,
  inspectCollectionDataText,
  inspectResolvedRequest,
  renderCollectionRunReportHtml,
  resolveRequest
} from '../src/index';
import {
  createEmptyCollection,
  createDefaultEnvironment,
  createDefaultProject,
  createEmptyCase,
  createEmptyRequest
} from '../../debugger-schema/src/index';

test('resolveRequest interpolates step and data variables with correct priority', () => {
  const project = createDefaultProject('Demo');
  project.runtime.baseUrl = 'https://api.example.com';
  project.runtime.vars.region = 'project-region';

  const environment = createDefaultEnvironment('shared');
  environment.vars.region = 'env-region';

  const request = createEmptyRequest('Create Order');
  request.url = '{{baseUrl}}/orders/{{steps.login.response.body.userId}}?region={{region}}&sku={{sku}}';

  const resolved = resolveRequest(project, request, undefined, environment, [
    { sku: 'sku-123' },
    { steps: { login: { response: { body: { userId: 'u_1' } } } } },
    { region: 'runtime-region' }
  ]);

  assert.equal(resolved.url, 'https://api.example.com/orders/u_1?region=runtime-region&sku=sku-123');
});

test('executeRequestScript records logs and generated script assertions', async () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('Ping');
  request.url = 'https://example.com/ping';
  const preview = resolveRequest(project, request, undefined, environment);

  const state = {
    variables: {},
    environment
  };

  const pre = await executeRequestScript({
    phase: 'pre-request',
    script: 'pm.variables.set("token", "abc"); console.log("hello pre");',
    state,
    request: preview
  });
  assert.equal(pre.state.variables.token, 'abc');
  assert.equal(pre.logs[0]?.message, 'hello pre');

  const post = await executeRequestScript({
    phase: 'post-response',
    script: 'pm.test("status ok", () => pm.expect(pm.response?.code).to.equal(200));',
    state: pre.state,
    request: preview,
    response: {
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'https://example.com/ping',
      durationMs: 42,
      sizeBytes: 12,
      headers: [],
      bodyText: '{"ok":true}',
      timestamp: new Date().toISOString()
    }
  });

  assert.equal(post.testResults[0]?.ok, true);
});

test('executeRequestScript supports pm.sendRequest lite during pre-request', async () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('Tokenized');
  request.url = 'https://api.example.com/data';
  const preview = resolveRequest(project, request, undefined, environment);

  const result = await executeRequestScript({
    phase: 'pre-request',
    script: `
      pm.sendRequest(
        { method: 'POST', url: 'https://auth.example.com/token' },
        (err, res) => {
          if (err) throw err;
          pm.environment.set('token', res.json().access_token);
        }
      );
    `,
    state: {
      variables: {},
      environment
    },
    request: preview,
    sendRequest: async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'https://auth.example.com/token',
      durationMs: 10,
      sizeBytes: 24,
      headers: [{ name: 'content-type', value: 'application/json' }],
      bodyText: '{"access_token":"tok_123"}',
      timestamp: new Date().toISOString()
    })
  });

  assert.equal(result.state.environment?.vars.token, 'tok_123');
  assert.equal(result.testResults.length, 0);
});

test('buildCurlCommand emits a runnable curl string', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('Submit');
  request.method = 'POST';
  request.url = 'https://api.example.com/items';
  request.headers = [{ name: 'Authorization', value: 'Bearer token', enabled: true, kind: 'text' }];
  request.body = {
    mode: 'json',
    mimeType: 'application/json',
    text: '{"ok":true}',
    fields: []
  };
  const preview = resolveRequest(project, request, undefined, environment);
  const curl = buildCurlCommand(preview);

  assert.match(curl, /curl -X POST/);
  assert.match(curl, /Authorization: Bearer token/);
  assert.match(curl, /--data-raw/);
});

test('applyCollectionRules produces collection-level checks', () => {
  const checks = applyCollectionRules({
    requireSuccessStatus: true,
    maxDurationMs: 100,
    requiredJsonPaths: ['$.data.id'],
    response: {
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'https://example.com/orders',
      durationMs: 80,
      sizeBytes: 22,
      headers: [],
      bodyText: '{"data":{"id":"o_1"}}',
      timestamp: new Date().toISOString()
    }
  });

  assert.equal(checks.every(check => check.ok), true);
  assert.equal(checks.length, 3);
});

test('case scripts survive creation defaults', () => {
  const nextCase = createEmptyCase('req_1');
  assert.equal(nextCase.scripts?.preRequest, '');
  assert.equal(nextCase.scripts?.postResponse, '');
});

test('inspectResolvedRequest explains variable sources and auth preview', () => {
  const project = createDefaultProject('Demo');
  project.runtime.baseUrl = 'https://api.example.com';
  project.runtime.vars.projectToken = 'project-token';
  const environment = createDefaultEnvironment('shared');
  environment.vars.userId = 'u_1';
  const request = createEmptyRequest('Profile');
  request.url = '{{baseUrl}}/users/{{userId}}';
  request.headers = [{ name: 'X-Project', value: '{{projectToken}}', enabled: true, kind: 'text' }];
  request.auth = { type: 'bearer', token: '{{projectToken}}' };

  const insight = inspectResolvedRequest(project, request, undefined, environment, [{ traceId: 'trace-1' }]);

  assert.equal(insight.preview.url, 'https://api.example.com/users/u_1');
  assert.equal(insight.authPreview[0]?.name, 'Authorization');
  assert.match(insight.authPreview[0]?.value || '', /Bearer project-token/);
  assert.equal(insight.variables.some(variable => variable.token === 'userId' && variable.source === 'environment'), true);
  assert.equal(insight.variables.some(variable => variable.token === 'projectToken' && variable.source === 'project'), true);
  assert.equal(insight.warnings.length, 0);
});

test('inspectResolvedRequest surfaces cached oauth2 auth state from environment profile', () => {
  const project = createDefaultProject('Demo');
  project.runtime.baseUrl = 'https://api.example.com';
  const environment = createDefaultEnvironment('shared');
  environment.authProfiles.push({
    name: 'oauthProfile',
    auth: {
      type: 'oauth2',
      oauthFlow: 'client_credentials',
      tokenUrl: 'https://auth.example.com/oauth/token',
      clientIdFromVar: 'oauthClientId',
      clientSecretFromVar: 'oauthClientSecret',
      accessToken: 'cached-token',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }
  });
  environment.vars.oauthClientId = 'client-id';
  environment.vars.oauthClientSecret = 'client-secret';

  const request = createEmptyRequest('Protected');
  request.url = '{{baseUrl}}/protected';
  request.auth = {
    type: 'profile',
    profileName: 'oauthProfile'
  };

  const insight = inspectResolvedRequest(project, request, undefined, environment);
  assert.equal(insight.preview.authState?.type, 'oauth2');
  assert.equal(insight.preview.authState?.cacheStatus, 'fresh');
  assert.equal(insight.preview.authState?.tokenInjected, true);
  assert.equal(insight.preview.headers.some(header => header.name === 'Authorization' && header.value.includes('cached-token')), true);
});

test('buildWorkspaceIndex merges shared and local environment overlays', () => {
  const index = buildWorkspaceIndex({
    root: '/tmp/demo',
    projectContent: `schemaVersion: 1\nname: Demo\ndefaultEnvironment: shared\nruntime:\n  baseUrl: https://api.example.com\n  vars: {}\n  headers: []\n`,
    fileContents: {
      '/tmp/demo/environments/dev.yaml': `schemaVersion: 1\nname: dev\nvars:\n  baseUrl: https://shared.example.com\n  region: shared\nheaders:\n  - name: X-Env\n    value: shared\n    enabled: true\n    kind: text\n`,
      '/tmp/demo/environments/dev.local.yaml': `schemaVersion: 1\nname: dev\nvars:\n  token: secret\n  region: local\nheaders:\n  - name: X-Env\n    value: local\n    enabled: true\n    kind: text\n`
    }
  });

  const environment = index.environments[0]?.document;
  assert.equal(environment?.vars.region, 'local');
  assert.equal(environment?.sharedVars?.region, 'shared');
  assert.equal(environment?.localVars?.token, 'secret');
  assert.equal(environment?.headers[0]?.value, 'local');
  assert.equal(environment?.overlayMode, 'overlay');
});

test('inspectResolvedRequest emits blocking diagnostics for missing values', () => {
  const project = createDefaultProject('Demo');
  project.runtime.baseUrl = '';
  const environment = createDefaultEnvironment('dev');
  const request = createEmptyRequest('Upload');
  request.url = '{{baseUrl}}/upload';
  request.auth = { type: 'bearer', tokenFromVar: 'missingToken' };
  request.body = {
    mode: 'multipart',
    mimeType: 'multipart/form-data',
    text: '',
    fields: [{ name: 'file', value: '', enabled: true, kind: 'file' }]
  };

  const insight = inspectResolvedRequest(project, request, undefined, environment);
  assert.equal(insight.diagnostics.some(item => item.code === 'missing-variable' && item.blocking), true);
  assert.equal(insight.diagnostics.some(item => item.code === 'missing-base-url' && item.blocking), true);
  assert.equal(insight.diagnostics.some(item => item.code === 'missing-multipart-file' && item.blocking), true);
});

test('inspectCollectionDataText supports CSV tables', () => {
  const inspection = inspectCollectionDataText(`sku,userId,enabled\nsku-001,u-1,true\nsku-002,u-2,false\n`);
  assert.equal(inspection.format, 'csv');
  assert.deepEqual(inspection.columns, ['sku', 'userId', 'enabled']);
  assert.equal(inspection.rows[0]?.sku, 'sku-001');
  assert.equal(inspection.rows[1]?.userId, 'u-2');
});

test('inspectResolvedRequest surfaces unsupported script APIs before send', () => {
  const project = createDefaultProject('Demo');
  project.runtime.baseUrl = 'https://api.example.com';
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('Profile');
  request.url = '{{baseUrl}}/profile';
  const caseDocument = createEmptyCase(request.id, 'scripted');
  caseDocument.scripts = {
    preRequest: 'pm.sendRequest("https://example.com/extra");',
    postResponse: 'pm.vault.get("token");'
  };

  const insight = inspectResolvedRequest(project, request, caseDocument, environment);
  assert.equal(insight.warnings.some(item => item.code === 'script-unsupported-send-request'), true);
  assert.equal(insight.diagnostics.some(item => item.code === 'script-unsupported-vault' && item.blocking === false), true);
});

test('renderCollectionRunReportHtml emits a readable report shell', () => {
  const collection = createEmptyCollection('Smoke');
  const html = renderCollectionRunReportHtml({
    id: 'colrun_1',
    workspaceRoot: '/tmp/demo',
    collectionId: collection.id,
    collectionName: 'Smoke',
    environmentName: 'shared',
    status: 'failed',
    startedAt: '1',
    finishedAt: '2',
    iterationCount: 1,
    passedSteps: 0,
    failedSteps: 1,
    skippedSteps: 0,
    iterations: [
      {
        index: 0,
        dataVars: {},
        stepRuns: [
          {
            stepKey: 'login',
            stepName: 'Login',
            requestId: 'req_login',
            ok: false,
            skipped: false,
            checkResults: [],
            scriptLogs: [],
            error: '401 Unauthorized'
          }
        ]
      }
    ]
  });

  assert.match(html, /Smoke/);
  assert.match(html, /401 Unauthorized/);
  assert.match(html, /Failure Summary/);
});

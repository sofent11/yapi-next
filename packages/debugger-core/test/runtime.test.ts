import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCollectionRules,
  buildGraphqlIntrospectionRequest,
  buildGraphqlOperationDraft,
  buildWorkspaceIndex,
  buildCurlCommand,
  evaluateChecks,
  filtersFromCollectionReport,
  executeRequestScript,
  inspectCollectionDataText,
  inspectResolvedRequest,
  renderCollectionRunReportHtml,
  renderCollectionRunReportJunit,
  rerunFailedStepKeys,
  runCollection,
  resolveRequest,
  summarizeGraphqlSchema
} from '../src/index';
import {
  SCHEMA_VERSION,
  createCollectionStep,
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

  assert.equal(resolved.url, 'https://api.example.com/orders/u_1');
  assert.equal(resolved.query.find(row => row.name === 'region')?.value, 'runtime-region');
  assert.equal(resolved.query.find(row => row.name === 'sku')?.value, 'sku-123');
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

test('schema v3 preserves Bruno parity request metadata', () => {
  const request = createEmptyRequest('GraphQL Search');
  request.kind = 'graphql';
  request.body = {
    mode: 'graphql',
    mimeType: 'application/json',
    text: '{"query":"query Ping { ping }","variables":{}}',
    fields: [],
    graphql: {
      query: 'query Ping { ping }',
      variables: '{}'
    }
  };
  request.auth = {
    type: 'awsv4',
    accessKey: '{{awsAccessKey}}',
    secretKey: '{{awsSecretKey}}',
    region: 'ap-southeast-1',
    service: 'execute-api'
  };

  assert.equal(request.schemaVersion, SCHEMA_VERSION);
  assert.equal(request.kind, 'graphql');
  assert.equal(request.body.mode, 'graphql');
  assert.equal(request.auth.type, 'awsv4');
});

test('resolveRequest materializes GraphQL editor fields into JSON body', () => {
  const project = createDefaultProject('Demo');
  project.runtime.baseUrl = 'https://api.example.com';
  const environment = createDefaultEnvironment('shared');
  environment.vars.userId = 'u_1';
  const request = createEmptyRequest('GraphQL Profile');
  request.kind = 'graphql';
  request.method = 'POST';
  request.url = '{{baseUrl}}/graphql';
  request.body = {
    mode: 'graphql',
    mimeType: 'application/json',
    text: '',
    fields: [],
    graphql: {
      query: 'query Profile($id: ID!) { user(id: $id) { id } }',
      variables: '{"id":"{{userId}}"}',
      operationName: 'Profile'
    }
  };

  const preview = resolveRequest(project, request, undefined, environment);
  const payload = JSON.parse(preview.body.text);

  assert.equal(preview.body.mode, 'graphql');
  assert.equal(payload.operationName, 'Profile');
  assert.equal(payload.variables.id, 'u_1');
  assert.match(payload.query, /query Profile/);
});

test('inspectResolvedRequest blocks invalid GraphQL variables JSON', () => {
  const project = createDefaultProject('Demo');
  project.runtime.baseUrl = 'https://api.example.com';
  const request = createEmptyRequest('Broken GraphQL');
  request.kind = 'graphql';
  request.method = 'POST';
  request.url = '{{baseUrl}}/graphql';
  request.body = {
    mode: 'graphql',
    mimeType: 'application/json',
    text: '',
    fields: [],
    graphql: {
      query: 'query { ping }',
      variables: '{broken'
    }
  };

  const insight = inspectResolvedRequest(project, request, undefined, createDefaultEnvironment('shared'));
  assert.equal(insight.diagnostics.some(item => item.code === 'invalid-graphql-variables' && item.blocking), true);
});

test('buildGraphqlIntrospectionRequest targets schemaUrl and preserves auth headers', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('GraphQL Profile');
  request.kind = 'graphql';
  request.method = 'POST';
  request.url = 'https://api.example.com/graphql';
  request.headers = [{ name: 'Authorization', value: 'Bearer token', enabled: true, kind: 'text' }];
  request.query = [{ name: 'tenant', value: 'acme', enabled: true, kind: 'text' }];
  request.body = {
    mode: 'graphql',
    mimeType: 'application/json',
    text: '',
    fields: [],
    graphql: {
      query: 'query { viewer { id } }',
      variables: '{}',
      schemaUrl: 'https://schema.example.com/graphql'
    }
  };

  const preview = resolveRequest(project, request, undefined, environment);
  const introspection = buildGraphqlIntrospectionRequest(preview);

  assert.equal(introspection.method, 'POST');
  assert.equal(introspection.url, 'https://schema.example.com/graphql');
  assert.equal(introspection.query.length, 0);
  assert.equal(introspection.headers.some(row => row.name === 'Authorization'), true);
  assert.equal(introspection.headers.some(row => row.name === 'Content-Type' && row.value === 'application/json'), true);
  assert.match(JSON.parse(introspection.body.text).query, /__schema/);
});

test('summarizeGraphqlSchema extracts root operation fields', () => {
  const summary = summarizeGraphqlSchema(JSON.stringify({
    data: {
      __schema: {
        queryType: { name: 'Query' },
        mutationType: { name: 'Mutation' },
        subscriptionType: null,
        types: [
          {
            kind: 'OBJECT',
            name: 'Query',
            fields: [
              {
                name: 'viewer',
                args: [],
                type: { kind: 'OBJECT', name: 'User' }
              },
              {
                name: 'search',
                args: [
                  {
                    name: 'term',
                    type: { kind: 'NON_NULL', name: null, ofType: { kind: 'SCALAR', name: 'String' } }
                  }
                ],
                type: { kind: 'LIST', name: null, ofType: { kind: 'OBJECT', name: 'User' } }
              }
            ]
          },
          {
            kind: 'OBJECT',
            name: 'Mutation',
            fields: [{ name: 'login', args: [], type: { kind: 'SCALAR', name: 'String' } }]
          },
          {
            kind: 'OBJECT',
            name: 'User',
            fields: [
              { name: 'id', args: [], type: { kind: 'SCALAR', name: 'ID' } },
              { name: 'name', args: [], type: { kind: 'SCALAR', name: 'String' } },
              { name: 'profile', args: [], type: { kind: 'OBJECT', name: 'Profile' } },
              { name: 'friends', args: [], type: { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'User' } } }
            ]
          },
          {
            kind: 'OBJECT',
            name: 'Profile',
            fields: [
              { name: 'bio', args: [], type: { kind: 'SCALAR', name: 'String' } },
              { name: 'avatarUrl', args: [], type: { kind: 'SCALAR', name: 'String' } }
            ]
          },
          { kind: 'SCALAR', name: 'String', fields: null },
          { kind: 'SCALAR', name: 'ID', fields: null }
        ]
      }
    }
  }));

  assert.equal(summary.ok, true);
  assert.equal(summary.typeCount, 6);
  assert.deepEqual(summary.queries, ['viewer', 'search']);
  assert.deepEqual(summary.mutations, ['login']);
  assert.deepEqual(summary.queryFields[0]?.selection, ['id', 'name', 'profile { bio avatarUrl }', 'friends { id name }']);
  assert.equal(summary.queryFields[1]?.args[0]?.type, 'String!');
});

test('buildGraphqlOperationDraft creates a query skeleton with variables', () => {
  const summary = summarizeGraphqlSchema(JSON.stringify({
    data: {
      __schema: {
        queryType: { name: 'Query' },
        mutationType: null,
        subscriptionType: null,
        types: [
          {
            kind: 'OBJECT',
            name: 'Query',
            fields: [
              {
                name: 'search',
                args: [
                  { name: 'term', type: { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'String' } } },
                  { name: 'limit', defaultValue: '20', type: { kind: 'SCALAR', name: 'Int' } }
                ],
                type: { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'User' } }
              }
            ]
          },
          {
            kind: 'OBJECT',
            name: 'User',
            fields: [
              { name: 'id', args: [], type: { kind: 'SCALAR', name: 'ID' } },
              { name: 'name', args: [], type: { kind: 'SCALAR', name: 'String' } }
            ]
          },
          { kind: 'SCALAR', name: 'String', fields: null },
          { kind: 'SCALAR', name: 'Int', fields: null },
          { kind: 'SCALAR', name: 'ID', fields: null }
        ]
      }
    }
  }));

  const draft = buildGraphqlOperationDraft(summary, 'query', 'search');

  assert.match(draft.query, /query QuerySearch\(\$term: String!, \$limit: Int\)/);
  assert.match(draft.query, /search\(term: \$term, limit: \$limit\)/);
  assert.match(draft.query, /id/);
  assert.deepEqual(JSON.parse(draft.variables), { term: '', limit: 20 });
});

test('resolveRequest interpolates WebSocket message drafts', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  environment.vars.token = 'secret';
  const request = createEmptyRequest('Live Feed');
  request.kind = 'websocket';
  request.url = 'wss://example.com/socket';
  request.body = {
    mode: 'none',
    text: '',
    fields: [],
    websocket: {
      messages: [
        { name: 'auth {{token}}', body: '{"type":"auth","token":"{{token}}"}', enabled: true }
      ]
    }
  };

  const preview = resolveRequest(project, request, undefined, environment);

  assert.equal(preview.body.websocket?.messages[0]?.name, 'auth secret');
  assert.equal(preview.body.websocket?.messages[0]?.body, '{"type":"auth","token":"secret"}');
});

test('buildCurlCommand supports Bruno parity body modes', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('XML Upload');
  request.method = 'POST';
  request.url = 'https://api.example.com/xml';
  request.body = {
    mode: 'xml',
    mimeType: 'application/xml',
    text: '<ping />',
    fields: []
  };

  const xmlCurl = buildCurlCommand(resolveRequest(project, request, undefined, environment));
  assert.match(xmlCurl, /--data-raw/);
  assert.match(xmlCurl, new RegExp('<ping />'));

  request.body = {
    mode: 'file',
    mimeType: 'application/octet-stream',
    text: '/tmp/body.bin',
    file: '/tmp/body.bin',
    fields: []
  };
  const fileCurl = buildCurlCommand(resolveRequest(project, request, undefined, environment));
  assert.match(fileCurl, /--data-binary/);
  assert.match(fileCurl, new RegExp('@/tmp/body\\.bin'));
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

test('evaluateChecks supports automation assertions and baseline snapshots', () => {
  const responseBody = JSON.stringify({
    meta: { count: 3 },
    items: ['a', 'b'],
    kind: 'order'
  });
  const results = evaluateChecks({
    ok: true,
    status: 200,
    statusText: 'OK',
    url: 'https://api.example.com/orders/1',
    durationMs: 32,
    sizeBytes: responseBody.length,
    headers: [{ name: 'content-type', value: 'application/json' }],
    bodyText: responseBody,
    timestamp: new Date().toISOString()
  }, [
    { id: 'check_1', type: 'json-not-exists', label: 'no error', enabled: true, path: '$.error', expected: '' },
    { id: 'check_2', type: 'json-type', label: 'count type', enabled: true, path: '$.meta.count', expected: 'number' },
    { id: 'check_3', type: 'json-length', label: 'item count', enabled: true, path: '$.items', expected: '2' },
    { id: 'check_4', type: 'number-between', label: 'count range', enabled: true, path: '$.meta.count', expected: '2,5' },
    {
      id: 'check_5',
      type: 'schema-match',
      label: 'schema ok',
      enabled: true,
      path: '',
      expected: JSON.stringify({
        type: 'object',
        required: ['meta', 'items', 'kind'],
        properties: {
          meta: {
            type: 'object',
            required: ['count'],
            properties: { count: { type: 'number' } }
          },
          items: { type: 'array', minItems: 2 },
          kind: { type: 'string' }
        }
      })
    },
    { id: 'check_6', type: 'snapshot-match', label: 'baseline ok', enabled: true, path: '', expected: 'baseline-order' }
  ], {
    examples: [
      {
        name: 'baseline-order',
        role: 'baseline',
        text: responseBody
      }
    ]
  });

  assert.equal(results.every(result => result.ok), true);
  assert.equal(results.find(result => result.id === 'check_6')?.source, 'baseline');
});

test('runCollection executes serial env matrix with retry and baseline checks', async () => {
  const project = createDefaultProject('Demo');
  project.runtime.baseUrl = 'https://api.example.com';

  const shared = createDefaultEnvironment('shared');
  const staging = createDefaultEnvironment('staging');

  const request = createEmptyRequest('Health');
  request.url = '{{baseUrl}}/health';
  request.examples = [
    {
      name: 'health-baseline',
      role: 'baseline',
      text: '{"ok":true}'
    }
  ];

  const caseDocument = createEmptyCase(request.id, 'smoke');
  caseDocument.baselineRef = 'health-baseline';
  caseDocument.checks = [
    { id: 'status_1', type: 'status-equals', label: 'status ok', enabled: true, path: '', expected: '200' }
  ];

  const collection = createEmptyCollection('Smoke Suite');
  collection.envMatrix = ['shared', 'staging'];
  collection.defaultRetry = {
    count: 1,
    delayMs: 0,
    when: ['network-error', '5xx', 'assertion-failed']
  };
  collection.steps = [
    createCollectionStep({
      key: 'health',
      requestId: request.id,
      caseId: caseDocument.id,
      name: 'Health'
    })
  ];

  const workspace = {
    root: '/tmp/debugger-suite',
    project,
    environments: [
      { document: shared, filePath: '/tmp/debugger-suite/environments/shared.yaml' },
      { document: staging, filePath: '/tmp/debugger-suite/environments/staging.yaml' }
    ],
    requests: [
      {
        request,
        cases: [caseDocument],
        folderSegments: [],
        requestFilePath: '/tmp/debugger-suite/requests/health.request.yaml',
        resourceDirPath: '/tmp/debugger-suite/requests/health'
      }
    ],
    collections: [
      {
        document: collection,
        filePath: '/tmp/debugger-suite/collections/smoke.collection.yaml',
        dataText: ''
      }
    ],
    tree: []
  };

  const attemptsByEnv = new Map<string, number>();
  const report = await runCollection({
    workspace,
    collectionId: collection.id,
    sendRequest: async preview => {
      const envName = 'environmentName' in preview ? preview.environmentName || 'shared' : 'shared';
      const attempt = (attemptsByEnv.get(envName) || 0) + 1;
      attemptsByEnv.set(envName, attempt);

      if (envName === 'shared' && attempt === 1) {
        return {
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          url: preview.url,
          durationMs: 20,
          sizeBytes: 0,
          headers: [],
          bodyText: '{"ok":false}',
          timestamp: new Date().toISOString()
        };
      }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        url: preview.url,
        durationMs: 15,
        sizeBytes: 11,
        headers: [{ name: 'content-type', value: 'application/json' }],
        bodyText: '{"ok":true}',
        timestamp: new Date().toISOString()
      };
    }
  });

  assert.equal(report.status, 'passed');
  assert.deepEqual(report.matrixEnvironments, ['shared', 'staging']);
  assert.equal(report.iterationCount, 2);
  assert.equal(report.passedSteps, 2);
  assert.equal(report.failedSteps, 0);
  assert.equal(report.iterations[0]?.stepRuns[0]?.attempts?.length, 2);
  assert.equal(report.iterations[0]?.stepRuns[0]?.baselineName, 'health-baseline');
  assert.equal(report.iterations[0]?.stepRuns[0]?.checkResults.some(result => result.source === 'baseline'), true);
});

test('runCollection filters steps by step and request tags', async () => {
  const project = createDefaultProject('Demo');
  project.runtime.baseUrl = 'https://api.example.com';
  const environment = createDefaultEnvironment('shared');

  const smokeRequest = createEmptyRequest('Smoke Health');
  smokeRequest.url = '{{baseUrl}}/health';
  smokeRequest.tags = ['request-smoke'];
  const nightlyRequest = createEmptyRequest('Nightly Audit');
  nightlyRequest.url = '{{baseUrl}}/audit';

  const collection = createEmptyCollection('Tagged Suite');
  collection.steps = [
    createCollectionStep({
      key: 'health',
      requestId: smokeRequest.id,
      name: 'Health'
    }),
    createCollectionStep({
      key: 'audit',
      requestId: nightlyRequest.id,
      name: 'Audit'
    })
  ];
  collection.steps[1].tags = ['nightly'];

  const workspace = {
    root: '/tmp/debugger-suite-tags',
    project,
    environments: [{ document: environment, filePath: '/tmp/debugger-suite-tags/environments/shared.yaml' }],
    requests: [
      {
        request: smokeRequest,
        cases: [],
        folderSegments: [],
        requestFilePath: '/tmp/debugger-suite-tags/requests/health.request.yaml',
        resourceDirPath: '/tmp/debugger-suite-tags/requests/health'
      },
      {
        request: nightlyRequest,
        cases: [],
        folderSegments: [],
        requestFilePath: '/tmp/debugger-suite-tags/requests/audit.request.yaml',
        resourceDirPath: '/tmp/debugger-suite-tags/requests/audit'
      }
    ],
    collections: [
      {
        document: collection,
        filePath: '/tmp/debugger-suite-tags/collections/tagged.collection.yaml',
        dataText: ''
      }
    ],
    tree: []
  };

  const seen: string[] = [];
  const report = await runCollection({
    workspace,
    collectionId: collection.id,
    options: {
      filters: {
        tags: ['request-smoke']
      }
    },
    sendRequest: async preview => {
      seen.push(preview.name);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        url: preview.url,
        durationMs: 12,
        sizeBytes: 2,
        headers: [],
        bodyText: '{}',
        timestamp: new Date().toISOString()
      };
    }
  });

  assert.deepEqual(seen, ['Smoke Health']);
  assert.deepEqual(report.filters.tags, ['request-smoke']);
  assert.equal(report.iterations[0]?.stepRuns.length, 1);
  assert.equal(report.iterations[0]?.stepRuns[0]?.stepKey, 'health');

  collection.runnerTags = ['nightly'];
  const defaultTagSeen: string[] = [];
  const defaultTagReport = await runCollection({
    workspace,
    collectionId: collection.id,
    sendRequest: async preview => {
      defaultTagSeen.push(preview.name);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        url: preview.url,
        durationMs: 12,
        sizeBytes: 2,
        headers: [],
        bodyText: '{}',
        timestamp: new Date().toISOString()
      };
    }
  });

  assert.deepEqual(defaultTagSeen, ['Nightly Audit']);
  assert.deepEqual(defaultTagReport.filters.tags, ['nightly']);

  const clearedTagSeen: string[] = [];
  const clearedTagReport = await runCollection({
    workspace,
    collectionId: collection.id,
    options: {
      filters: {
        tags: []
      }
    },
    sendRequest: async preview => {
      clearedTagSeen.push(preview.name);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        url: preview.url,
        durationMs: 12,
        sizeBytes: 2,
        headers: [],
        bodyText: '{}',
        timestamp: new Date().toISOString()
      };
    }
  });

  assert.deepEqual(clearedTagSeen, ['Smoke Health', 'Nightly Audit']);
  assert.deepEqual(clearedTagReport.filters.tags, []);
});

test('renderCollectionRunReportJunit and rerunFailedStepKeys encode failures for CI', () => {
  const report = {
    id: 'colrun_ci',
    workspaceRoot: '/tmp/demo',
    collectionId: 'col_smoke',
    collectionName: 'Smoke Suite',
    environmentName: 'shared',
    status: 'failed' as const,
    startedAt: '1',
    finishedAt: '2',
    iterationCount: 1,
    passedSteps: 0,
    failedSteps: 1,
    skippedSteps: 1,
    matrixEnvironments: ['shared'],
    filters: {
      tags: ['smoke'],
      stepKeys: [],
      requestIds: [],
      caseIds: []
    },
    iterations: [
      {
        index: 0,
        dataLabel: 'Row 1',
        dataVars: {},
        environmentName: 'shared',
        matrixLabel: 'shared',
        stepRuns: [
          {
            stepKey: 'login',
            stepName: 'Login',
            requestId: 'req_login',
            ok: false,
            skipped: false,
            checkResults: [],
            scriptLogs: [],
            error: '401 Unauthorized',
            failureType: 'assertion-failed' as const,
            attempts: [{ attempt: 1, ok: false, checkResults: [], error: '401 Unauthorized', failureType: 'assertion-failed' as const }]
          },
          {
            stepKey: 'teardown:cleanup',
            stepName: 'Cleanup',
            requestId: 'req_cleanup',
            ok: false,
            skipped: true,
            checkResults: [],
            scriptLogs: [],
            error: 'Skipped after previous failure',
            failureType: 'skipped' as const,
            attempts: []
          }
        ]
      }
    ]
  };

  const junit = renderCollectionRunReportJunit(report);

  assert.deepEqual(rerunFailedStepKeys(report), ['login']);
  assert.deepEqual(filtersFromCollectionReport(report), {
    tags: ['smoke'],
    stepKeys: [],
    requestIds: [],
    caseIds: []
  });
  assert.match(junit, /testsuite name="Smoke Suite"/);
  assert.match(junit, /yapi_filters="tags=smoke"/);
  assert.match(junit, /failure message="401 Unauthorized"/);
  assert.match(junit, /<skipped message="Skipped after previous failure" \/>/);
});

test('resolveRequest excludes disabled query overrides even when the raw url already contains them', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('Search');
  request.url = 'https://api.example.com/items?keyword=from-url&keep=yes';
  request.query = [
    { name: 'keyword', value: 'from-table', enabled: false, kind: 'text' },
    { name: 'page', value: '1', enabled: true, kind: 'text' }
  ];

  const resolved = resolveRequest(project, request, undefined, environment);

  assert.equal(resolved.url, 'https://api.example.com/items');
  assert.equal(resolved.query.some(row => row.name === 'keep'), false);
  assert.equal(resolved.query.some(row => row.name === 'keyword'), true);
  assert.equal(resolved.query.find(row => row.name === 'keyword')?.enabled, false);
  assert.equal(resolved.query.find(row => row.name === 'page')?.value, '1');
});

test('resolveRequest keeps base headers when a case adds its own header override', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('Profile');
  request.url = 'https://api.example.com/profile';
  request.headers = [{ name: 'X-Request', value: 'base', enabled: true, kind: 'text' }];
  const caseDocument = createEmptyCase(request.id, 'Case 1');
  caseDocument.overrides.headers = [{ name: 'X-Case', value: 'child', enabled: true, kind: 'text' }];

  const resolved = resolveRequest(project, request, caseDocument, environment);

  assert.equal(resolved.headers.some(row => row.name === 'X-Request' && row.value === 'base'), true);
  assert.equal(resolved.headers.some(row => row.name === 'X-Case' && row.value === 'child'), true);
});

test('buildCurlCommand only emits enabled query rows after url query normalization', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('Orders');
  request.url = 'https://api.example.com/orders?pageNum=1&pageSize=10&status=closed';
  request.query = [
    { name: 'pageNum', value: '1', enabled: true, kind: 'text' },
    { name: 'pageSize', value: '10', enabled: true, kind: 'text' },
    { name: 'status', value: 'closed', enabled: false, kind: 'text' }
  ];

  const curl = buildCurlCommand(resolveRequest(project, request, undefined, environment));

  assert.match(curl, /pageNum=1/);
  assert.match(curl, /pageSize=10/);
  assert.doesNotMatch(curl, /status=closed/);
});

test('resolveRequest treats structured query rows as the source of truth over hidden url query params', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('Orders');
  request.url = 'https://api.example.com/orders?pageNum=1&pageSize=10&hidden=legacy';
  request.query = [
    { name: 'pageNum', value: '1', enabled: true, kind: 'text' },
    { name: 'pageSize', value: '10', enabled: true, kind: 'text' }
  ];

  const resolved = resolveRequest(project, request, undefined, environment);
  const curl = buildCurlCommand(resolved);

  assert.equal(resolved.url, 'https://api.example.com/orders');
  assert.equal(resolved.query.some(row => row.name === 'hidden'), false);
  assert.doesNotMatch(curl, /hidden=legacy/);
});

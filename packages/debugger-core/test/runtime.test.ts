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
  graphqlFragmentPath,
  graphqlSelectionPath,
  inspectCollectionDataText,
  inspectResolvedRequest,
  materializeBrunoCollectionExport,
  renderCollectionRunReportHtml,
  renderCollectionRunReportJunit,
  rerunFailedStepKeys,
  runCollection,
  runPreparedRequest,
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
  createEmptyRequest,
  requestDocumentSchema
} from '../../debugger-schema/src/index';

function insightResolvedAuthHeader(value: string) {
  const encoded = value.replace(/^NTLM\s+/i, '');
  const bytes = Buffer.from(encoded, 'base64');
  return {
    signature: bytes.subarray(0, 7).toString('utf8'),
    messageType: bytes.readUInt32LE(8)
  };
}

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

test('runPreparedRequest executes request-level scripts before case-level scripts', async () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('Scripted Request');
  request.url = 'https://api.example.com/data/{{token}}';
  request.scripts = {
    preRequest: 'pm.variables.set("token", "req"); console.log("request-pre");',
    postResponse: 'console.log("request-post");',
    tests: 'pm.test("request status", () => pm.expect(pm.response?.code).to.equal(200));'
  };
  const caseDocument = createEmptyCase(request.id, 'scripted');
  caseDocument.scripts = {
    preRequest: 'pm.variables.set("token", `${pm.variables.get("token")}-case`); console.log("case-pre");',
    postResponse: 'pm.test("case sees request var", () => pm.expect(pm.variables.get("token")).to.equal("req-case")); console.log("case-post");'
  };
  const workspace = {
    root: '/tmp/scripted-workspace',
    project,
    environments: [{ document: environment, filePath: '/tmp/scripted-workspace/environments/shared.yaml' }],
    requests: [
      {
        request,
        cases: [caseDocument],
        folderSegments: [],
        requestFilePath: '/tmp/scripted-workspace/requests/scripted.request.yaml',
        resourceDirPath: '/tmp/scripted-workspace/requests/scripted'
      }
    ],
    folders: [],
    collections: [],
    tree: []
  };
  const seenUrls: string[] = [];

  const result = await runPreparedRequest({
    workspace,
    request,
    caseDocument,
    sendRequest: async preview => {
      seenUrls.push(preview.url);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        url: preview.url,
        durationMs: 12,
        sizeBytes: 12,
        headers: [{ name: 'content-type', value: 'application/json' }],
        bodyText: '{"ok":true}',
        timestamp: new Date().toISOString()
      };
    }
  });

  assert.equal(seenUrls[0], 'https://api.example.com/data/req-case');
  assert.equal(result.state.variables.token, 'req-case');
  assert.deepEqual(result.checkResults.filter(item => item.source === 'script').map(item => item.label), [
    'request status',
    'case sees request var'
  ]);
  assert.deepEqual(result.scriptLogs.map(item => item.message), [
    'request-pre',
    'case-pre',
    'request-post',
    'case-post'
  ]);
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

test('materializeBrunoCollectionExport writes Bruno collection files for ordered steps', () => {
  const project = createDefaultProject('Demo API');
  const environment = createDefaultEnvironment('Local');
  environment.vars = {
    baseUrl: 'https://api.example.com',
    token: '{{secretToken}}'
  };
  const first = createEmptyRequest('Create User');
  first.id = 'req_create_user';
  first.method = 'POST';
  first.url = '{{baseUrl}}/users';
  first.body = {
    mode: 'json',
    mimeType: 'application/json',
    text: '{"name":"Ada"}',
    fields: []
  };
  const second = createEmptyRequest('Get User');
  second.id = 'req_get_user';
  second.url = '{{baseUrl}}/users/{{userId}}';
  second.query = [{ name: 'expand', value: 'roles', enabled: true, kind: 'text' }];
  const collection = createEmptyCollection('Smoke Flow');
  collection.vars = { userId: 'u_1' };
  collection.headers = [{ name: 'x-suite', value: 'smoke', enabled: true, kind: 'text' }];
  collection.steps = [
    createCollectionStep({ requestId: second.id, name: 'Fetch user' }),
    createCollectionStep({ requestId: first.id, name: 'Create user' })
  ];

  const writes = materializeBrunoCollectionExport({
    project,
    collection,
    environments: [environment],
    requests: [
      {
        request: first,
        cases: [],
        folderSegments: ['users'],
        requestFilePath: '/workspace/requests/users/create.request.yaml',
        resourceDirPath: '/workspace/requests/users/create'
      },
      {
        request: second,
        cases: [],
        folderSegments: ['users'],
        requestFilePath: '/workspace/requests/users/get.request.yaml',
        resourceDirPath: '/workspace/requests/users/get'
      }
    ]
  });

  const map = new Map(writes.map(write => [write.path, write.content]));

  assert.equal(JSON.parse(map.get('bruno.json') || '{}').name, 'Smoke Flow');
  assert.match(map.get('collection.bru') || '', /headers \{/);
  assert.match(map.get('collection.bru') || '', /vars:pre-request \{/);
  assert.match(map.get('environments\/local.bru') || '', /baseUrl: https:\/\/api\.example\.com/);
  assert.match(map.get('users\/folder.bru') || '', /name: users/);
  assert.match(map.get('users\/get-user.bru') || '', /seq: 1/);
  assert.match(map.get('users\/create-user.bru') || '', /seq: 2/);
  assert.match(map.get('users\/create-user.bru') || '', /body:json \{/);
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
      variables: '{}',
      schemaUrl: 'https://api.example.com/graphql',
      schemaCache: {
        endpoint: 'https://api.example.com/graphql',
        checkedAt: '12:00:00',
        summary: {
          ok: true,
          typeCount: 3,
          queries: ['ping'],
          mutations: [],
          subscriptions: [],
          queryFields: [],
          mutationFields: [],
          subscriptionFields: [],
          warnings: []
        }
      }
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
  assert.equal(requestDocumentSchema.parse(request).body.graphql?.schemaCache?.endpoint, 'https://api.example.com/graphql');
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

test('resolveRequest signs OAuth1 requests with HMAC-SHA1', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('OAuth Photos');
  request.method = 'GET';
  request.url = 'http://photos.example.net/photos?file=vacation.jpg&size=original';
  request.auth = {
    type: 'oauth1',
    consumerKey: 'dpf43f3p2l4k3l03',
    consumerSecret: 'kd94hf93k423kf44',
    token: 'nnch734d00sl2jdk',
    clientSecret: 'pfkkdhi9sl3r4s00',
    nonce: 'kllo9940pd9333jh',
    created: '1191242096',
    signatureMethod: 'HMAC-SHA1',
    version: '1.0'
  };

  const preview = resolveRequest(project, request, undefined, environment);
  const authorization = preview.headers.find(header => header.name === 'Authorization')?.value || '';

  assert.match(authorization, /^OAuth /);
  assert.match(authorization, /oauth_consumer_key="dpf43f3p2l4k3l03"/);
  assert.match(authorization, /oauth_signature_method="HMAC-SHA1"/);
  assert.match(authorization, /oauth_signature="tR3%2BTy81lMeYAr%2FFid0kMTYa%2FWM%3D"/);
});

test('resolveRequest signs AWS Signature v4 requests', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('AWS IAM');
  request.method = 'GET';
  request.url = 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08';
  request.auth = {
    type: 'awsv4',
    accessKey: 'AKIDEXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    service: 'iam',
    created: '20150830T123600Z'
  };

  const preview = resolveRequest(project, request, undefined, environment);
  const authorization = preview.headers.find(header => header.name === 'Authorization')?.value || '';

  assert.equal(preview.headers.find(header => header.name === 'x-amz-date')?.value, '20150830T123600Z');
  assert.equal(
    preview.headers.find(header => header.name === 'x-amz-content-sha256')?.value,
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  assert.match(authorization, /^AWS4-HMAC-SHA256 /);
  assert.match(authorization, /Credential=AKIDEXAMPLE\/20150830\/us-east-1\/iam\/aws4_request/);
  assert.match(authorization, /SignedHeaders=host;x-amz-content-sha256;x-amz-date/);
  assert.match(authorization, /Signature=65f031d93b4631aedf16a8f7f830cdc8ce2bc5276c307b5a2cc2143d4b68e323/);

  const insight = inspectResolvedRequest(project, request, undefined, environment);
  assert.equal(insight.authPreview.some(item => item.name === 'Authorization' && item.status === 'ready'), true);
  assert.equal(insight.diagnostics.some(item => item.code === 'incomplete-awsv4-auth'), false);
});

test('inspectResolvedRequest blocks incomplete AWS Signature v4 auth', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('AWS IAM');
  request.url = 'https://iam.amazonaws.com/';
  request.auth = {
    type: 'awsv4',
    accessKey: 'AKIDEXAMPLE',
    region: 'us-east-1',
    service: 'iam'
  };

  const insight = inspectResolvedRequest(project, request, undefined, environment);
  assert.equal(insight.authPreview.some(item => item.name === 'Authorization' && item.status === 'missing'), true);
  assert.equal(insight.diagnostics.some(item => item.code === 'incomplete-awsv4-auth' && item.blocking), true);
});

test('resolveRequest signs Digest auth requests with qop auth', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('Digest Protected');
  request.method = 'GET';
  request.url = 'http://www.example.com/dir/index.html';
  request.auth = {
    type: 'digest',
    username: 'Mufasa',
    password: 'Circle Of Life',
    realm: 'testrealm@host.com',
    nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093',
    qop: 'auth',
    cnonce: '0a4f113b',
    nonceCount: '00000001',
    opaque: '5ccc069c403ebaf9f0171e9517f40e41',
    algorithm: 'MD5'
  };

  const preview = resolveRequest(project, request, undefined, environment);
  const authorization = preview.headers.find(header => header.name === 'Authorization')?.value || '';

  assert.match(authorization, /^Digest /);
  assert.match(authorization, /username="Mufasa"/);
  assert.match(authorization, /realm="testrealm@host\.com"/);
  assert.match(authorization, /uri="\/dir\/index\.html"/);
  assert.match(authorization, /qop=auth/);
  assert.match(authorization, /nc=00000001/);
  assert.match(authorization, /cnonce="0a4f113b"/);
  assert.match(authorization, /response="6629fae49393a05397450978507c4ef1"/);

  const insight = inspectResolvedRequest(project, request, undefined, environment);
  assert.equal(insight.authPreview.some(item => item.name === 'Authorization' && item.status === 'ready'), true);
  assert.equal(insight.diagnostics.some(item => item.code === 'incomplete-digest-auth'), false);
});

test('inspectResolvedRequest allows Digest challenge retry when credentials exist', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('Digest Protected');
  request.url = 'http://www.example.com/dir/index.html';
  request.auth = {
    type: 'digest',
    username: 'Mufasa',
    password: 'Circle Of Life'
  };

  const insight = inspectResolvedRequest(project, request, undefined, environment);
  assert.equal(insight.authPreview.some(item => item.name === 'Authorization' && item.status === 'missing'), true);
  assert.equal(insight.diagnostics.some(item => item.code === 'digest-challenge-pending' && !item.blocking), true);
  assert.equal(insight.diagnostics.some(item => item.blocking), false);
});

test('inspectResolvedRequest blocks Digest auth without credentials', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('Digest Protected');
  request.url = 'http://www.example.com/dir/index.html';
  request.auth = {
    type: 'digest',
    username: 'Mufasa'
  };

  const insight = inspectResolvedRequest(project, request, undefined, environment);
  assert.equal(insight.diagnostics.some(item => item.code === 'incomplete-digest-auth' && item.blocking), true);
});

test('runPreparedRequest retries Digest auth after WWW-Authenticate challenge', async () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('Digest Protected');
  request.method = 'GET';
  request.url = 'http://www.example.com/dir/index.html';
  request.auth = {
    type: 'digest',
    username: 'Mufasa',
    password: 'Circle Of Life'
  };
  const workspace = {
    root: '/tmp/digest-workspace',
    project,
    environments: [{ document: environment, filePath: '/tmp/digest-workspace/environments/shared.yaml' }],
    requests: [
      {
        request,
        cases: [],
        folderSegments: [],
        requestFilePath: '/tmp/digest-workspace/requests/digest.request.yaml',
        resourceDirPath: '/tmp/digest-workspace/requests/digest'
      }
    ],
    folders: [],
    collections: [],
    tree: []
  };
  const sentAuthorization: string[] = [];

  const result = await runPreparedRequest({
    workspace,
    request,
    sendRequest: async preview => {
      sentAuthorization.push(preview.headers.find(header => header.name === 'Authorization')?.value || '');
      if (sentAuthorization.length === 1) {
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          url: preview.url,
          durationMs: 10,
          sizeBytes: 0,
          headers: [
            {
              name: 'www-authenticate',
              value: 'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"'
            }
          ],
          bodyText: '',
          timestamp: new Date().toISOString()
        };
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        url: preview.url,
        durationMs: 12,
        sizeBytes: 11,
        headers: [],
        bodyText: '{"ok":true}',
        timestamp: new Date().toISOString()
      };
    }
  });

  assert.equal(result.response.status, 200);
  assert.equal(sentAuthorization[0], '');
  assert.match(sentAuthorization[1], /^Digest /);
  assert.match(sentAuthorization[1], /realm="testrealm@host\.com"/);
  assert.match(sentAuthorization[1], /nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093"/);
  assert.match(sentAuthorization[1], /qop=auth/);
  assert.match(result.preview.headers.find(header => header.name === 'Authorization')?.value || '', /^Digest /);
});

test('resolveRequest builds WSSE UsernameToken headers', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('WSSE Feed');
  request.method = 'GET';
  request.url = 'https://api.example.com/feed';
  request.auth = {
    type: 'wsse',
    username: 'alice',
    password: 'secret',
    nonce: 'abc',
    created: '2024-01-01T00:00:00Z'
  };

  const preview = resolveRequest(project, request, undefined, environment);
  const wsse = preview.headers.find(header => header.name === 'X-WSSE')?.value || '';

  assert.match(wsse, /^UsernameToken /);
  assert.match(wsse, /Username="alice"/);
  assert.match(wsse, /PasswordDigest="2zAZN2kdxV\/Tm6fciqdYpqlZo6Q="/);
  assert.match(wsse, /Nonce="abc"/);
  assert.match(wsse, /Created="2024-01-01T00:00:00Z"/);

  const insight = inspectResolvedRequest(project, request, undefined, environment);
  assert.equal(insight.authPreview.some(item => item.name === 'X-WSSE' && item.status === 'ready'), true);
  assert.equal(insight.diagnostics.some(item => item.code === 'incomplete-wsse-auth'), false);
});

test('inspectResolvedRequest blocks incomplete WSSE auth', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('WSSE Feed');
  request.url = 'https://api.example.com/feed';
  request.auth = {
    type: 'wsse',
    username: 'alice'
  };

  const insight = inspectResolvedRequest(project, request, undefined, environment);
  assert.equal(insight.authPreview.some(item => item.name === 'X-WSSE' && item.status === 'missing'), true);
  assert.equal(insight.diagnostics.some(item => item.code === 'incomplete-wsse-auth' && item.blocking), true);
});

test('resolveRequest builds NTLM negotiate headers', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('NTLM Feed');
  request.method = 'GET';
  request.url = 'https://api.example.com/feed';
  request.auth = {
    type: 'ntlm',
    username: 'alice',
    password: 'secret',
    domain: 'ACME',
    workstation: 'WS-01'
  };

  const preview = resolveRequest(project, request, undefined, environment);
  const authorization = preview.headers.find(header => header.name === 'Authorization')?.value || '';

  assert.match(authorization, /^NTLM /);
  assert.equal(insightResolvedAuthHeader(authorization).signature, 'NTLMSSP');
  assert.equal(insightResolvedAuthHeader(authorization).messageType, 1);
  const insight = inspectResolvedRequest(project, request, undefined, environment);
  assert.equal(insight.authPreview.some(item => item.name === 'Authorization' && item.status === 'ready'), true);
  assert.equal(insight.diagnostics.some(item => item.code === 'incomplete-ntlm-auth'), false);
});

test('inspectResolvedRequest blocks incomplete NTLM auth', () => {
  const project = createDefaultProject('Demo');
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('NTLM Feed');
  request.url = 'https://api.example.com/feed';
  request.auth = {
    type: 'ntlm',
    username: 'alice'
  };

  const insight = inspectResolvedRequest(project, request, undefined, environment);
  assert.equal(insight.authPreview.some(item => item.name === 'Authorization' && item.status === 'missing'), true);
  assert.equal(insight.diagnostics.some(item => item.code === 'incomplete-ntlm-auth' && item.blocking), true);
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
              { name: 'avatarUrl', args: [], type: { kind: 'SCALAR', name: 'String' } },
              { name: 'address', args: [], type: { kind: 'OBJECT', name: 'Address' } }
            ]
          },
          {
            kind: 'OBJECT',
            name: 'Address',
            fields: [
              { name: 'city', args: [], type: { kind: 'SCALAR', name: 'String' } },
              { name: 'country', args: [], type: { kind: 'SCALAR', name: 'String' } }
            ]
          },
          { kind: 'SCALAR', name: 'String', fields: null },
          { kind: 'SCALAR', name: 'ID', fields: null }
        ]
      }
    }
  }));

  assert.equal(summary.ok, true);
  assert.equal(summary.typeCount, 7);
  assert.deepEqual(summary.queries, ['viewer', 'search']);
  assert.deepEqual(summary.mutations, ['login']);
  assert.deepEqual(summary.queryFields[0]?.selection, [
    'id',
    'name',
    'profile {\n  bio\n  avatarUrl\n  address {\n    city\n    country\n  }\n}',
    'friends {\n  id\n  name\n}'
  ]);
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
                  { name: 'limit', defaultValue: '20', type: { kind: 'SCALAR', name: 'Int' } },
                  { name: 'filter', type: { kind: 'NON_NULL', ofType: { kind: 'INPUT_OBJECT', name: 'SearchFilter' } } },
                  { name: 'order', type: { kind: 'ENUM', name: 'SearchOrder' } },
                  { name: 'ids', type: { kind: 'LIST', ofType: { kind: 'SCALAR', name: 'ID' } } }
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
              { name: 'name', args: [], type: { kind: 'SCALAR', name: 'String' } },
              { name: 'profile', args: [], type: { kind: 'OBJECT', name: 'Profile' } }
            ]
          },
          {
            kind: 'OBJECT',
            name: 'Profile',
            fields: [
              { name: 'bio', args: [], type: { kind: 'SCALAR', name: 'String' } }
            ]
          },
          {
            kind: 'INPUT_OBJECT',
            name: 'SearchFilter',
            inputFields: [
              { name: 'text', type: { kind: 'SCALAR', name: 'String' } },
              { name: 'active', defaultValue: 'true', type: { kind: 'SCALAR', name: 'Boolean' } },
              { name: 'range', type: { kind: 'INPUT_OBJECT', name: 'DateRangeInput' } }
            ]
          },
          {
            kind: 'INPUT_OBJECT',
            name: 'DateRangeInput',
            inputFields: [
              { name: 'from', type: { kind: 'SCALAR', name: 'String' } },
              { name: 'limit', defaultValue: '10', type: { kind: 'SCALAR', name: 'Int' } }
            ]
          },
          {
            kind: 'ENUM',
            name: 'SearchOrder',
            enumValues: [{ name: 'RELEVANCE' }, { name: 'RECENT' }]
          },
          { kind: 'SCALAR', name: 'String', fields: null },
          { kind: 'SCALAR', name: 'Int', fields: null },
          { kind: 'SCALAR', name: 'Boolean', fields: null },
          { kind: 'SCALAR', name: 'ID', fields: null }
        ]
      }
    }
  }));

  const draft = buildGraphqlOperationDraft(summary, 'query', 'search');

  assert.match(draft.query, /query QuerySearch\(\$term: String!, \$limit: Int, \$filter: SearchFilter!, \$order: SearchOrder, \$ids: \[ID\]\)/);
  assert.match(draft.query, /search\(term: \$term, limit: \$limit, filter: \$filter, order: \$order, ids: \$ids\)/);
  assert.match(draft.query, /id/);
  assert.match(draft.query, /profile \{\n      bio\n    \}/);
  assert.deepEqual(JSON.parse(draft.variables), {
    term: '',
    limit: 20,
    filter: {
      text: '',
      active: true,
      range: {
        from: '',
        limit: 10
      }
    },
    order: 'RELEVANCE',
    ids: ['']
  });
});

test('buildGraphqlOperationDraft supports explorer field toggles and fragments', () => {
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
                name: 'node',
                args: [{ name: 'id', type: { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'ID' } } }],
                type: { kind: 'INTERFACE', name: 'Node' }
              }
            ]
          },
          {
            kind: 'INTERFACE',
            name: 'Node',
            fields: [
              { name: 'id', args: [], type: { kind: 'SCALAR', name: 'ID' } },
              { name: 'name', args: [], type: { kind: 'SCALAR', name: 'String' } }
            ],
            possibleTypes: [{ kind: 'OBJECT', name: 'User' }, { kind: 'OBJECT', name: 'Admin' }]
          },
          {
            kind: 'OBJECT',
            name: 'User',
            fields: [
              { name: 'id', args: [], type: { kind: 'SCALAR', name: 'ID' } },
              { name: 'name', args: [], type: { kind: 'SCALAR', name: 'String' } },
              { name: 'email', args: [], type: { kind: 'SCALAR', name: 'String' } },
              { name: 'profile', args: [], type: { kind: 'OBJECT', name: 'Profile' } }
            ]
          },
          {
            kind: 'OBJECT',
            name: 'Admin',
            fields: [
              { name: 'id', args: [], type: { kind: 'SCALAR', name: 'ID' } },
              { name: 'name', args: [], type: { kind: 'SCALAR', name: 'String' } },
              { name: 'role', args: [], type: { kind: 'SCALAR', name: 'String' } }
            ]
          },
          {
            kind: 'OBJECT',
            name: 'Profile',
            fields: [
              { name: 'city', args: [], type: { kind: 'SCALAR', name: 'String' } },
              { name: 'timezone', args: [], type: { kind: 'SCALAR', name: 'String' } }
            ]
          },
          { kind: 'SCALAR', name: 'ID', fields: null },
          { kind: 'SCALAR', name: 'String', fields: null }
        ]
      }
    }
  }));

  const userFragment = graphqlFragmentPath('', 'User');
  const profilePath = graphqlSelectionPath(userFragment, 'profile');
  const draft = buildGraphqlOperationDraft(summary, 'query', 'node', {
    selectedFields: [
      'id',
      graphqlSelectionPath(userFragment, 'email'),
      profilePath,
      graphqlSelectionPath(profilePath, 'city')
    ],
    selectedFragments: [userFragment]
  });

  assert.match(draft.query, /query QueryNode\(\$id: ID!\)/);
  assert.match(draft.query, /node\(id: \$id\) \{\n    id\n    \.\.\. on User \{\n      email\n      profile \{\n        city\n      \}\n    \}\n  \}/);
  assert.doesNotMatch(draft.query, /\.\.\. on Admin/);
  assert.doesNotMatch(draft.query, /\n    name\n/);
  assert.deepEqual(JSON.parse(draft.variables), { id: '' });
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
        { name: 'auth {{token}}', body: '{"type":"auth","token":"{{token}}"}', kind: 'json', enabled: true },
        { name: 'binary hello', body: 'aGVsbG8=', kind: 'binary', enabled: true }
      ],
      lastRun: {
        ok: true,
        url: 'wss://example.com/socket',
        durationMs: 42,
        ranAt: '2026-04-25T10:00:00.000Z',
        events: [
          { direction: 'runtime', label: 'connected', body: 'wss://example.com/socket', elapsedMs: 0 },
          { direction: 'out', label: 'auth secret', body: '{"type":"auth","token":"secret"}', elapsedMs: 1 }
        ]
      }
    }
  };

  const preview = resolveRequest(project, request, undefined, environment);

  assert.equal(preview.body.websocket?.messages[0]?.name, 'auth secret');
  assert.equal(preview.body.websocket?.messages[0]?.body, '{"type":"auth","token":"secret"}');
  assert.equal(preview.body.websocket?.messages[1]?.kind, 'binary');
  assert.equal(requestDocumentSchema.parse(request).body.websocket?.lastRun?.events.length, 2);
  assert.equal(preview.body.websocket?.lastRun?.durationMs, 42);
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

test('buildWorkspaceIndex keeps folder variable documents and folder-only categories', () => {
  const index = buildWorkspaceIndex({
    root: '/tmp/demo',
    projectContent: `schemaVersion: 3\nname: Demo\ndefaultEnvironment: shared\nruntime:\n  baseUrl: https://api.example.com\n  vars: {}\n  headers: []\n`,
    fileContents: {
      '/tmp/demo/requests/orders/_folder.yaml': `schemaVersion: 3\nvariableRows:\n  - name: tenant\n    value: folder-tenant\n    enabled: true\n    kind: text\n`,
      '/tmp/demo/requests/orders/history/list.request.yaml': `schemaVersion: 3\nid: req_history\nname: History\nkind: http\nmethod: GET\nurl: '{{baseUrl}}/history'\npath: /history\nheaders: []\nquery: []\npathParams: []\nbody:\n  mode: none\n  text: ''\n  fields: []\nauth:\n  type: none\nvars:\n  req: []\n  res: []\nexamples: []\nscripts:\n  preRequest: ''\n  postResponse: ''\n  tests: ''\nruntime:\n  timeoutMs: 30000\n  followRedirects: true\n`
    }
  });

  assert.equal(index.folders[0]?.path, 'orders');
  assert.equal(index.folders[0]?.document.variableRows[0]?.name, 'tenant');
  assert.equal(index.tree[0]?.children[0]?.kind, 'category');
  assert.equal(index.tree[0]?.children[0]?.path, 'orders');
});

test('runCollection resolves folder variables before collection vars', async () => {
  const project = createDefaultProject('Demo');
  project.runtime.baseUrl = 'https://api.example.com';
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('Scoped');
  request.id = 'req_folder_scope';
  request.url = '{{baseUrl}}/orders/{{tenant}}';
  const collection = createEmptyCollection('Scoped Flow');
  collection.id = 'col_folder_scope';
  collection.vars.tenant = 'collection-tenant';
  collection.steps = [createCollectionStep({ key: 'step_1', requestId: request.id, name: 'Scoped step' })];
  const seenUrls: string[] = [];

  const report = await runCollection({
    workspace: {
      root: '/tmp/folder-vars',
      project,
      environments: [{ document: environment, filePath: '/tmp/folder-vars/environments/shared.yaml' }],
      folders: [
        {
          path: 'orders',
          filePath: '/tmp/folder-vars/requests/orders/_folder.yaml',
          document: {
            schemaVersion: SCHEMA_VERSION,
            variableRows: [{ name: 'tenant', value: 'folder-tenant', enabled: true, kind: 'text' }]
          }
        }
      ],
      requests: [
        {
          request,
          cases: [],
          folderSegments: ['orders'],
          requestFilePath: '/tmp/folder-vars/requests/orders/scoped.request.yaml',
          resourceDirPath: '/tmp/folder-vars/requests/orders/scoped'
        }
      ],
      collections: [{ document: collection, filePath: '/tmp/folder-vars/collections/scoped.collection.yaml', dataText: '' }],
      tree: [],
      gitignorePath: '/tmp/folder-vars/.gitignore',
      gitignoreContent: ''
    },
    collectionId: collection.id,
    sendRequest: async preview => {
      seenUrls.push(preview.url);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        url: preview.url,
        durationMs: 10,
        sizeBytes: 2,
        headers: [],
        bodyText: '{}',
        timestamp: new Date().toISOString()
      };
    }
  });

  assert.equal(seenUrls[0], 'https://api.example.com/orders/folder-tenant');
  assert.equal(report.iterations[0]?.stepRuns[0]?.request?.url, 'https://api.example.com/orders/folder-tenant');
});

test('runCollection executes collection-level scripts around each step', async () => {
  const project = createDefaultProject('Demo');
  project.runtime.baseUrl = 'https://api.example.com';
  const environment = createDefaultEnvironment('shared');
  const request = createEmptyRequest('Layered Scripts');
  request.id = 'req_collection_scripts';
  request.url = '{{baseUrl}}/orders/{{token}}';
  request.scripts = {
    preRequest: 'pm.variables.set("token", `${pm.variables.get("token")}-request`); console.log("request-pre");',
    postResponse: 'console.log("request-post");',
    tests: 'pm.test("request status", () => pm.expect(pm.response?.code).to.equal(200));'
  };
  const caseDocument = createEmptyCase(request.id, 'scripted');
  caseDocument.scripts = {
    preRequest: 'pm.variables.set("token", `${pm.variables.get("token")}-case`); console.log("case-pre");',
    postResponse: 'pm.test("case sees token", () => pm.expect(pm.variables.get("token")).to.equal("collection-request-case")); console.log("case-post");'
  };
  const collection = createEmptyCollection('Scripted Flow');
  collection.id = 'col_collection_scripts';
  collection.scripts = {
    preRequest: 'pm.variables.set("token", "collection"); console.log("collection-pre");',
    postResponse: 'console.log("collection-post");',
    tests: 'pm.test("collection status", () => pm.expect(pm.response?.code).to.equal(200));'
  };
  collection.steps = [
    createCollectionStep({
      key: 'step_scripts',
      requestId: request.id,
      caseId: caseDocument.id,
      name: 'Layered step'
    })
  ];
  const seenUrls: string[] = [];

  const report = await runCollection({
    workspace: {
      root: '/tmp/collection-scripts',
      project,
      environments: [{ document: environment, filePath: '/tmp/collection-scripts/environments/shared.yaml' }],
      folders: [],
      requests: [
        {
          request,
          cases: [caseDocument],
          folderSegments: [],
          requestFilePath: '/tmp/collection-scripts/requests/layered.request.yaml',
          resourceDirPath: '/tmp/collection-scripts/requests/layered'
        }
      ],
      collections: [{ document: collection, filePath: '/tmp/collection-scripts/collections/scripted.collection.yaml', dataText: '' }],
      tree: []
    },
    collectionId: collection.id,
    sendRequest: async preview => {
      seenUrls.push(preview.url);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        url: preview.url,
        durationMs: 10,
        sizeBytes: 2,
        headers: [{ name: 'content-type', value: 'application/json' }],
        bodyText: '{}',
        timestamp: new Date().toISOString()
      };
    }
  });

  const stepRun = report.iterations[0]?.stepRuns[0];
  assert.equal(seenUrls[0], 'https://api.example.com/orders/collection-request-case');
  assert.equal(stepRun?.request?.url, 'https://api.example.com/orders/collection-request-case');
  assert.deepEqual(stepRun?.checkResults.filter(item => item.source === 'script').map(item => item.label), [
    'collection status',
    'request status',
    'case sees token'
  ]);
  assert.deepEqual(stepRun?.scriptLogs.map(item => item.message), [
    'collection-pre',
    'request-pre',
    'case-pre',
    'collection-post',
    'request-post',
    'case-post'
  ]);
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

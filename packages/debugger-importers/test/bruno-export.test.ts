import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeBrunoCollectionExport, serializeBrunoJsonCollection, serializeRequestToBruno } from '../../debugger-core/src/index';
import { createCollectionStep, createDefaultEnvironment, createDefaultProject, createEmptyCollection, createEmptyRequest } from '../../debugger-schema/src/index';
import { importBrunoCollectionFiles, importSourceText } from '../src/index';

test('Bruno export writes a modern .bru request and imports it back', () => {
  const request = createEmptyRequest('Create Example');
  request.method = 'POST';
  request.url = 'https://testbench-sanity.usebruno.com/api/echo/json?debug=true';
  request.order = 7;
  request.headers = [
    { name: 'Content-Type', value: 'application/json', enabled: true, kind: 'text' },
    { name: 'x-disabled-header', value: 'nope', enabled: false, kind: 'text' }
  ];
  request.query = [{ name: 'debug', value: 'true', enabled: true, kind: 'text' }];
  request.pathParams = [{ name: 'tenantId', value: 't_1', enabled: true, kind: 'text' }];
  request.body = {
    mode: 'json',
    mimeType: 'application/json',
    text: '{\n  "message": "Hello World"\n}',
    fields: []
  };
  request.auth = {
    type: 'bearer',
    token: '{{token}}'
  };
  request.scripts = {
    preRequest: 'bru.setVar("trace", "1");',
    postResponse: 'console.log(res.status);',
    tests: 'expect(res.status).to.equal(200);'
  };
  request.docs = 'Imported from debugger export smoke.';

  const bru = serializeRequestToBruno(request);

  assert.match(bru, /meta \{/);
  assert.match(bru, /name: Create Example/);
  assert.match(bru, /post \{/);
  assert.match(bru, /auth: bearer/);
  assert.match(bru, /~x-disabled-header: nope/);
  assert.match(bru, /body:json \{/);
  assert.match(bru, /script:pre-request \{/);

  const imported = importSourceText(bru);
  const importedRequest = imported.requests[0]?.request;

  assert.equal(imported.detectedFormat, 'bruno');
  assert.equal(importedRequest?.name, 'Create Example');
  assert.equal(importedRequest?.method, 'POST');
  assert.equal(importedRequest?.url, request.url);
  assert.equal(importedRequest?.order, 7);
  assert.equal(importedRequest?.headers.find(item => item.name === 'x-disabled-header')?.enabled, false);
  assert.equal(importedRequest?.query.find(item => item.name === 'debug')?.value, 'true');
  assert.equal(importedRequest?.pathParams.find(item => item.name === 'tenantId')?.value, 't_1');
  assert.equal(importedRequest?.body.mode, 'json');
  assert.match(importedRequest?.body.text || '', /Hello World/);
  assert.equal(importedRequest?.auth.type, 'bearer');
  assert.equal(importedRequest?.auth.token, '{{token}}');
  assert.match(importedRequest?.scripts.preRequest || '', /bru\.setVar/);
  assert.match(importedRequest?.scripts.postResponse || '', /console\.log/);
  assert.match(importedRequest?.scripts.tests || '', /expect/);
  assert.match(importedRequest?.docs || '', /debugger export smoke/);
});

test('Bruno export uses Bruno body names for form and GraphQL requests', () => {
  const formRequest = createEmptyRequest('Submit Form');
  formRequest.method = 'POST';
  formRequest.url = '{{host}}/submit';
  formRequest.body = {
    mode: 'form-urlencoded',
    mimeType: 'application/x-www-form-urlencoded',
    text: '',
    fields: [{ name: 'email', value: 'dev@example.com', enabled: true, kind: 'text' }]
  };

  const graphqlRequest = createEmptyRequest('GraphQL Search');
  graphqlRequest.kind = 'graphql';
  graphqlRequest.method = 'POST';
  graphqlRequest.url = '{{host}}/graphql';
  graphqlRequest.body = {
    mode: 'graphql',
    mimeType: 'application/json',
    text: '',
    fields: [],
    graphql: {
      query: 'query Search($q: String!) { search(q: $q) { id } }',
      variables: '{\n  "q": "debugger"\n}'
    }
  };

  const formBru = serializeRequestToBruno(formRequest);
  const graphqlBru = serializeRequestToBruno(graphqlRequest);

  assert.match(formBru, /body: formUrlEncoded/);
  assert.match(formBru, /body:form-urlencoded \{/);
  assert.equal(importSourceText(formBru).requests[0]?.request.body.mode, 'form-urlencoded');

  assert.match(graphqlBru, /type: graphql/);
  assert.match(graphqlBru, /body: graphql/);
  assert.match(graphqlBru, /body:graphql:vars \{/);
  const importedGraphql = importSourceText(graphqlBru).requests[0]?.request;
  assert.equal(importedGraphql?.body.mode, 'graphql');
  assert.match(importedGraphql?.body.graphql?.variables || '', /debugger/);
});

test('Bruno collection folder import rebuilds requests and a runnable collection', () => {
  const project = createDefaultProject('Demo API');
  const environment = createDefaultEnvironment('Local');
  environment.vars = {
    baseUrl: 'https://api.example.com',
    token: '{{secretToken}}'
  };
  const createUser = createEmptyRequest('Create User');
  createUser.id = 'req_create_user';
  createUser.method = 'POST';
  createUser.url = '{{baseUrl}}/users';
  createUser.body = {
    mode: 'json',
    mimeType: 'application/json',
    text: '{"name":"Ada"}',
    fields: []
  };
  const getUser = createEmptyRequest('Get User');
  getUser.id = 'req_get_user';
  getUser.url = '{{baseUrl}}/users/{{userId}}';
  const collection = createEmptyCollection('Smoke Flow');
  collection.headers = [{ name: 'x-suite', value: 'smoke', enabled: true, kind: 'text' }];
  collection.vars = { userId: 'u_1' };
  collection.steps = [
    createCollectionStep({ requestId: createUser.id }),
    createCollectionStep({ requestId: getUser.id })
  ];
  const writes = materializeBrunoCollectionExport({
    project,
    collection,
    environments: [environment],
    requests: [
      {
        request: createUser,
        cases: [],
        folderSegments: ['Users'],
        requestFilePath: '/workspace/requests/users/create.request.yaml',
        resourceDirPath: '/workspace/requests/users/create'
      },
      {
        request: getUser,
        cases: [],
        folderSegments: ['Users'],
        requestFilePath: '/workspace/requests/users/get.request.yaml',
        resourceDirPath: '/workspace/requests/users/get'
      }
    ]
  });

  const result = importBrunoCollectionFiles(writes);
  const importedCollection = result.collections[0]?.collection;

  assert.equal(result.detectedFormat, 'bruno');
  assert.equal(result.project.name, 'Smoke Flow');
  assert.equal(result.project.defaultEnvironment, 'local');
  assert.equal(result.requests.length, 2);
  assert.equal(result.environments[0]?.name, 'local');
  assert.equal(result.environments[0]?.vars.baseUrl, 'https://api.example.com');
  assert.deepEqual(result.requests.map(item => item.folderSegments.join('/')), ['Users', 'Users']);
  assert.equal(importedCollection?.name, 'Smoke Flow');
  assert.equal(importedCollection?.defaultEnvironment, 'local');
  assert.equal(importedCollection?.headers.find(item => item.name === 'x-suite')?.value, 'smoke');
  assert.equal(importedCollection?.vars.userId, 'u_1');
  assert.equal(importedCollection?.steps.length, 2);
  assert.deepEqual(
    importedCollection?.steps.map(step => result.requests.find(item => item.request.id === step.requestId)?.request.name),
    ['Create User', 'Get User']
  );
});

test('Bruno JSON collection export imports back with folders and collection steps', () => {
  const project = createDefaultProject('Bruno JSON Demo');
  const createUser = createEmptyRequest('Create User');
  createUser.id = 'req_create_json_user';
  createUser.method = 'POST';
  createUser.url = '{{baseUrl}}/users';
  createUser.headers = [{ name: 'Content-Type', value: 'application/json', enabled: true, kind: 'text' }];
  createUser.body = {
    mode: 'json',
    mimeType: 'application/json',
    text: '{"name":"Ada"}',
    fields: []
  };
  createUser.auth = { type: 'bearer', tokenFromVar: 'token' };
  createUser.scripts = {
    preRequest: 'bru.setVar("trace", "1");',
    postResponse: 'console.log(res.status);',
    tests: 'expect(res.status).to.equal(201);'
  };

  const liveFeed = createEmptyRequest('Live Feed');
  liveFeed.id = 'req_live_feed';
  liveFeed.kind = 'websocket';
  liveFeed.url = 'wss://example.com/socket';
  liveFeed.body = {
    mode: 'none',
    text: '',
    fields: [],
    websocket: {
      messages: [{ name: 'subscribe', body: '{"type":"subscribe"}', enabled: true }]
    }
  };

  const collection = createEmptyCollection('JSON Smoke');
  collection.steps = [
    createCollectionStep({ requestId: createUser.id }),
    createCollectionStep({ requestId: liveFeed.id })
  ];

  const json = serializeBrunoJsonCollection({
    project,
    collection,
    requests: [
      {
        request: createUser,
        cases: [],
        folderSegments: ['Users'],
        requestFilePath: '/workspace/requests/users/create.request.yaml',
        resourceDirPath: '/workspace/requests/users/create'
      },
      {
        request: liveFeed,
        cases: [],
        folderSegments: ['Realtime'],
        requestFilePath: '/workspace/requests/realtime/live.request.yaml',
        resourceDirPath: '/workspace/requests/realtime/live'
      }
    ]
  });

  const parsed = JSON.parse(json);
  assert.equal(parsed.name, 'JSON Smoke');
  assert.equal(parsed.items[0].type, 'folder');
  assert.equal(parsed.items[0].items[0].type, 'http-request');
  assert.equal(parsed.items[1].items[0].type, 'ws-request');

  const imported = importSourceText(json);
  const importedCreate = imported.requests.find(item => item.request.name === 'Create User')?.request;
  const importedWebSocket = imported.requests.find(item => item.request.name === 'Live Feed')?.request;

  assert.equal(imported.detectedFormat, 'bruno');
  assert.equal(imported.project.name, 'JSON Smoke');
  assert.deepEqual(imported.requests.map(item => item.folderSegments.join('/')), ['Users', 'Realtime']);
  assert.equal(importedCreate?.body.mode, 'json');
  assert.equal(importedCreate?.auth.type, 'bearer');
  assert.equal(importedCreate?.auth.token, '{{token}}');
  assert.match(importedCreate?.scripts.tests || '', /201/);
  assert.equal(importedWebSocket?.kind, 'websocket');
  assert.equal(importedWebSocket?.body.websocket?.messages[0]?.body, '{"type":"subscribe"}');
  assert.equal(imported.collections[0]?.collection.steps.length, 2);
});

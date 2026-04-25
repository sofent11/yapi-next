import test from 'node:test';
import assert from 'node:assert/strict';
import { importSourceText } from '../src/index';

test('Postman import preserves scripts as case scripts and emits warnings for unsupported APIs', () => {
  const postmanCollection = JSON.stringify({
    info: {
      name: 'Scripted Collection',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [
      {
        name: 'Get Profile',
        request: {
          method: 'GET',
          url: {
            raw: 'https://api.example.com/profile'
          }
        },
        event: [
          {
            listen: 'prerequest',
            script: {
              exec: ['pm.variables.set("token", "abc");']
            }
          },
          {
            listen: 'test',
            script: {
              exec: [
                'pm.test("status ok", () => pm.expect(pm.response.code).to.equal(200));',
                'pm.sendRequest("https://example.com/extra");'
              ]
            }
          }
        ]
      }
    ]
  });

  const result = importSourceText(postmanCollection);
  assert.equal(result.detectedFormat, 'postman');
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0]?.cases.length, 1);
  assert.match(result.requests[0]?.cases[0]?.scripts?.preRequest || '', /pm\.variables\.set/);
  assert.match(result.requests[0]?.cases[0]?.scripts?.postResponse || '', /pm\.test/);
  assert.equal(result.warnings.some(warning => warning.code === 'postman-script-kept'), true);
  assert.equal(result.warnings.some(warning => warning.code === 'postman-send-request'), true);
  assert.match(result.warnings.find(warning => warning.code === 'postman-send-request')?.message || '', /pm\.sendRequest/);
  assert.equal(result.warnings.find(warning => warning.code === 'postman-send-request')?.status, 'degraded');
});

test('OpenAPI import warns when security schemes need manual auth review', () => {
  const openapi = JSON.stringify({
    openapi: '3.0.0',
    info: { title: 'Secured API', version: '1.0.0' },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' }
      }
    },
    paths: {
      '/profile': {
        get: {
          summary: 'Get Profile',
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'ok',
              content: {
                'application/json': {
                  example: { ok: true }
                }
              }
            }
          }
        }
      }
    }
  });

  const result = importSourceText(openapi);
  assert.equal(result.detectedFormat, 'openapi3');
  assert.equal(result.warnings.some(warning => warning.code === 'auth-review'), true);
  assert.equal(result.project.runtime.baseUrl, 'https://api.example.com');
  assert.equal(result.environments[0]?.authProfiles.some(profile => profile.name === 'bearerAuth'), true);
  assert.equal(result.requests[0]?.request.auth.type, 'profile');
  assert.equal(result.requests[0]?.request.auth.profileName, 'bearerAuth');
});

test('OpenAPI import maps oauth2 client credentials to an editable auth profile', () => {
  const openapi = JSON.stringify({
    openapi: '3.0.0',
    info: { title: 'OAuth API', version: '1.0.0' },
    components: {
      securitySchemes: {
        machineAuth: {
          type: 'oauth2',
          flows: {
            clientCredentials: {
              tokenUrl: 'https://auth.example.com/oauth/token',
              scopes: {
                'orders.read': 'Read orders'
              }
            }
          }
        }
      }
    },
    security: [{ machineAuth: ['orders.read'] }],
    paths: {
      '/orders': {
        get: {
          summary: 'List Orders',
          responses: {
            200: {
              description: 'ok',
              content: {
                'application/json': {
                  example: { items: [] }
                }
              }
            }
          }
        }
      }
    }
  });

  const result = importSourceText(openapi);
  const profile = result.environments[0]?.authProfiles.find(item => item.name === 'machineAuth');

  assert.equal(profile?.auth.type, 'oauth2');
  assert.equal(profile?.auth.oauthFlow, 'client_credentials');
  assert.equal(profile?.auth.tokenUrl, 'https://auth.example.com/oauth/token');
  assert.equal(profile?.auth.clientIdFromVar, 'machineauthClientId');
  assert.equal(profile?.auth.clientSecretFromVar, 'machineauthClientSecret');
  assert.equal(profile?.auth.scope, 'orders.read');
  assert.equal(result.warnings.some(warning => warning.code === 'oauth-client-credentials-mapped'), true);
  assert.equal(result.requests[0]?.request.auth.profileName, 'machineAuth');
});

test('OpenAPI import disables optional empty query params by default', () => {
  const openapi = JSON.stringify({
    openapi: '3.0.0',
    info: { title: 'Orders API', version: '1.0.0' },
    paths: {
      '/orders': {
        get: {
          summary: 'List Orders',
          parameters: [
            { name: 'pageNum', in: 'query', required: true, schema: { type: 'integer' } },
            { name: 'pageSize', in: 'query', example: 10, schema: { type: 'integer' } },
            { name: 'payOrderId', in: 'query', schema: { type: 'string' } },
            { name: 'targetCurrency', in: 'query', schema: { type: 'string' } }
          ],
          responses: {
            200: {
              description: 'ok',
              content: {
                'application/json': {
                  example: { items: [] }
                }
              }
            }
          }
        }
      }
    }
  });

  const result = importSourceText(openapi);
  const query = result.requests[0]?.request.query || [];

  assert.equal(query.find(item => item.name === 'pageNum')?.enabled, true);
  assert.equal(query.find(item => item.name === 'pageSize')?.enabled, true);
  assert.equal(query.find(item => item.name === 'pageSize')?.value, '10');
  assert.equal(query.find(item => item.name === 'payOrderId')?.enabled, false);
  assert.equal(query.find(item => item.name === 'targetCurrency')?.enabled, false);
});

test('Insomnia import maps workspace folders, environments, auth, and body', () => {
  const insomniaExport = JSON.stringify({
    _type: 'export',
    __export_format: 4,
    resources: [
      {
        _id: 'wrk_demo',
        _type: 'workspace',
        name: 'Insomnia Demo'
      },
      {
        _id: 'fld_users',
        _type: 'request_group',
        parentId: 'wrk_demo',
        name: 'Users'
      },
      {
        _id: 'env_local',
        _type: 'environment',
        parentId: 'wrk_demo',
        name: 'Local',
        data: {
          baseUrl: 'https://api.example.com',
          token: 'abc123'
        }
      },
      {
        _id: 'req_create',
        _type: 'request',
        parentId: 'fld_users',
        name: 'Create User',
        method: 'POST',
        url: '{{ _.baseUrl }}/users',
        headers: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'x-disabled', value: 'nope', disabled: true }
        ],
        parameters: [
          { name: 'debug', value: 'true' }
        ],
        body: {
          mimeType: 'application/json',
          text: '{"name":"Ada"}'
        },
        authentication: {
          type: 'bearer',
          token: '{{ _.token }}'
        }
      }
    ]
  });

  const result = importSourceText(insomniaExport);
  const request = result.requests[0]?.request;

  assert.equal(result.detectedFormat, 'insomnia');
  assert.equal(result.project.name, 'Insomnia Demo');
  assert.equal(result.environments[0]?.name, 'Local');
  assert.equal(result.environments[0]?.vars.baseUrl, 'https://api.example.com');
  assert.deepEqual(result.requests[0]?.folderSegments, ['Users']);
  assert.equal(request?.name, 'Create User');
  assert.equal(request?.method, 'POST');
  assert.equal(request?.url, '{{baseUrl}}/users');
  assert.equal(request?.body.mode, 'json');
  assert.match(request?.body.text || '', /Ada/);
  assert.equal(request?.auth.type, 'bearer');
  assert.equal(request?.auth.token, '{{token}}');
  assert.equal(request?.query.find(item => item.name === 'debug')?.value, 'true');
  assert.equal(request?.headers.find(item => item.name === 'x-disabled')?.enabled, false);
  assert.equal(result.warnings.some(warning => warning.code === 'insomnia-import'), true);
});

test('OpenCollection import maps mixed request kinds, environments, scripts, and auth', () => {
  const openCollection = `
opencollection: "1"
info:
  name: OpenCollection Demo
config:
  environments:
    - name: Local
      variables:
        - name: baseUrl
          value: https://api.example.com
        - name: token
          value: secret-token
          secret: true
items:
  - info:
      name: Users
      type: folder
    items:
      - info:
          name: Create User
          type: http
          seq: 3
          tags:
            - smoke
        http:
          method: POST
          url: "{{baseUrl}}/users/{{userId}}"
          headers:
            - name: Content-Type
              value: application/json
            - name: x-disabled
              value: nope
              disabled: true
          params:
            - name: verbose
              value: "true"
              type: query
            - name: userId
              value: "42"
              type: path
          body:
            type: json
            data: |
              {"name":"Ada"}
          auth:
            type: oauth1
            consumerKey: consumer_key_1
            consumerSecret: consumer_secret_1
            accessToken: access_token_1
            accessTokenSecret: token_secret_1
            signatureMethod: HMAC-SHA1
            version: "1.0"
        runtime:
          variables:
            - name: traceId
              value: abc-123
          scripts:
            - type: before-request
              code: bru.setVar("trace", "1");
            - type: after-response
              code: bru.setEnvVar("created", res.body.id);
            - type: tests
              code: expect(res.status).to.equal(201);
          assertions:
            - expression: res.status
              operator: eq
              value: "201"
        docs:
          content: Create user docs
        examples:
          - name: created
            response:
              status: 201
              body:
                type: json
                data: '{"ok":true}'
      - info:
          name: Stream Users
          type: websocket
        websocket:
          url: wss://api.example.com/users
          message:
            - title: subscribe
              message:
                type: json
                data: '{"event":"subscribe"}'
      - info:
          name: GraphQL User
          type: graphql
        graphql:
          method: POST
          url: "{{baseUrl}}/graphql"
          params:
            - name: preview
              value: "1"
              type: query
          body:
            query: |
              query User($id: ID!) { user(id: $id) { id name } }
            variables:
              id: "42"
      - info:
          name: User Service
          type: grpc
        grpc:
          url: grpc.example.com:443
          method: yapi.users.UserService/GetUser
          protoFilePath: protos/user.proto
          metadata:
            - name: authorization
              value: Bearer {{token}}
          message: '{"id":"42"}'
      - info:
          name: setup.js
          type: script
        script: bru.setVar("fromScript", "1");
`;

  const result = importSourceText(openCollection);
  const request = result.requests[0]?.request;
  const websocket = result.requests.find(item => item.request.kind === 'websocket')?.request;
  const graphql = result.requests.find(item => item.request.kind === 'graphql')?.request;
  const grpc = result.requests.find(item => item.request.kind === 'grpc')?.request;
  const script = result.requests.find(item => item.request.kind === 'script')?.request;

  assert.equal(result.detectedFormat, 'opencollection');
  assert.equal(result.requests.length, 5);
  assert.equal(result.project.name, 'OpenCollection Demo');
  assert.equal(result.environments[0]?.name, 'Local');
  assert.equal(result.environments[0]?.vars.baseUrl, 'https://api.example.com');
  assert.equal(result.environments[0]?.vars.token, '');
  assert.deepEqual(result.requests[0]?.folderSegments, ['Users']);
  assert.equal(request?.name, 'Create User');
  assert.equal(request?.method, 'POST');
  assert.equal(request?.url, '{{baseUrl}}/users/{{userId}}');
  assert.equal(request?.tags.includes('smoke'), true);
  assert.equal(request?.query.find(item => item.name === 'verbose')?.value, 'true');
  assert.equal(request?.pathParams.find(item => item.name === 'userId')?.value, '42');
  assert.equal(request?.headers.find(item => item.name === 'x-disabled')?.enabled, false);
  assert.equal(request?.body.mode, 'json');
  assert.match(request?.body.text || '', /Ada/);
  assert.equal(request?.auth.type, 'oauth1');
  assert.equal(request?.auth.consumerKey, 'consumer_key_1');
  assert.equal(request?.auth.secretKey, 'token_secret_1');
  assert.match(request?.scripts.preRequest || '', /bru\.setVar/);
  assert.match(request?.scripts.postResponse || '', /created/);
  assert.match(request?.scripts.tests || '', /expect\(res\.status\)/);
  assert.match(request?.scripts.tests || '', /OpenCollection assertion/);
  assert.equal(request?.vars.req.find(item => item.name === 'traceId')?.value, 'abc-123');
  assert.equal(request?.docs, 'Create user docs');
  assert.equal(request?.examples[0]?.status, 201);
  assert.equal(websocket?.url, 'wss://api.example.com/users');
  assert.equal(websocket?.body.websocket?.messages[0]?.body, '{"event":"subscribe"}');
  assert.equal(graphql?.method, 'POST');
  assert.equal(graphql?.body.mode, 'graphql');
  assert.match(graphql?.body.graphql?.query || '', /query User/);
  assert.match(graphql?.body.graphql?.variables || '', /"id": "42"/);
  assert.equal(graphql?.query.find(item => item.name === 'preview')?.value, '1');
  assert.equal(grpc?.url, 'grpc.example.com:443');
  assert.equal(grpc?.headers.find(item => item.name === 'authorization')?.value, 'Bearer {{token}}');
  assert.equal(grpc?.body.grpc?.protoFile, 'protos/user.proto');
  assert.equal(grpc?.body.grpc?.service, 'yapi.users.UserService');
  assert.equal(grpc?.body.grpc?.method, 'GetUser');
  assert.equal(grpc?.body.grpc?.message, '{"id":"42"}');
  assert.equal(script?.body.mimeType, 'application/javascript');
  assert.match(script?.body.text || '', /fromScript/);
  assert.equal(result.warnings.some(warning => warning.code === 'opencollection-import'), true);
  assert.equal(result.warnings.some(warning => warning.code === 'opencollection-item-review'), false);
});

test('Bruno import maps a .bru HTTP request into a debugger request', () => {
  const bru = `meta {
  name: create-example
  type: http
  seq: 1
}

post {
  url: https://testbench-sanity.usebruno.com/api/echo/json?debug=true
  body: json
  auth: bearer
}

headers {
  Content-Type: application/json
  ~x-disabled-header: nope
}

params:query {
  debug: true
}

body:json {
  {
    "message": "Hello World"
  }
}

auth:bearer {
  token: {{token}}
}

script:pre-request {
  bru.setVar("trace", "1");
}

tests {
  expect(res.status).to.equal(200);
}
`;

  const result = importSourceText(bru);
  const request = result.requests[0]?.request;

  assert.equal(result.detectedFormat, 'bruno');
  assert.equal(result.requests.length, 1);
  assert.equal(request?.name, 'create-example');
  assert.equal(request?.method, 'POST');
  assert.equal(request?.url, 'https://testbench-sanity.usebruno.com/api/echo/json?debug=true');
  assert.equal(request?.body.mode, 'json');
  assert.match(request?.body.text || '', /Hello World/);
  assert.equal(request?.auth.type, 'bearer');
  assert.equal(request?.auth.token, '{{token}}');
  assert.equal(request?.headers.find(item => item.name === 'x-disabled-header')?.enabled, false);
  assert.match(request?.scripts.preRequest || '', /bru\.setVar/);
  assert.match(request?.scripts.tests || '', /expect/);
});

test('Bruno import supports legacy line-oriented .bru files', () => {
  const bru = `type http-request
name Send Bulk SMS
method GET
url https://api.textlocal.in/bulk_json
body-mode json
seq 1

params
  1 apiKey secret
  0 disabled no
/params

headers
  1 accept-language en-US
/headers

body(type=json)
  {"ok": true}
/body
`;

  const result = importSourceText(bru);
  const request = result.requests[0]?.request;

  assert.equal(result.detectedFormat, 'bruno');
  assert.equal(request?.name, 'Send Bulk SMS');
  assert.equal(request?.method, 'GET');
  assert.equal(request?.query.find(item => item.name === 'apiKey')?.value, 'secret');
  assert.equal(request?.query.find(item => item.name === 'disabled')?.enabled, false);
  assert.equal(request?.headers.find(item => item.name === 'accept-language')?.value, 'en-US');
  assert.equal(request?.body.mode, 'json');
  assert.match(request?.body.text || '', /"ok"/);
});

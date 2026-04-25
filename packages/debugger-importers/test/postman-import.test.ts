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

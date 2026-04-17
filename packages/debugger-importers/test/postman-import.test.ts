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
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0]?.message || '', /pm\.sendRequest/);
  assert.equal(result.warnings[0]?.status, 'unsupported');
  assert.equal(result.warnings[0]?.code, 'postman-send-request');
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
});

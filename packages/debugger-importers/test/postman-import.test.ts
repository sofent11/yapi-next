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
});

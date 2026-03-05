import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  iterations: Number(__ENV.ITERATIONS || 1),
  thresholds: {
    http_req_duration: ['p(95)<60000']
  }
};

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const projectId = __ENV.PROJECT_ID;
const token = __ENV.TOKEN;
const apiCount = Number(__ENV.API_COUNT || 1000);
const syncMode = __ENV.SYNC_MODE || 'merge';

if (!projectId) {
  throw new Error('PROJECT_ID is required');
}

function createSpec(count) {
  const paths = {};
  for (let i = 0; i < count; i++) {
    const p = `/k6/v1/resource/${i}`;
    paths[p] = {
      get: {
        summary: `k6-${i}`,
        operationId: `k6_get_${i}`,
        tags: ['k6'],
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' }
                  }
                }
              }
            }
          }
        }
      }
    };
  }
  return {
    openapi: '3.0.3',
    info: { title: 'k6-import', version: '1.0.0' },
    tags: [{ name: 'k6' }],
    paths
  };
}

const payload = JSON.stringify({
  project_id: Number(projectId),
  format: 'openapi3',
  source: 'json',
  json: JSON.stringify(createSpec(apiCount)),
  syncMode,
  token
});

export default function() {
  const res = http.post(`${baseUrl}/api/spec/import`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '600s'
  });
  check(res, {
    'status is 200': r => r.status === 200
  });
  sleep(1);
}

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const PROJECT_ID = process.env.PROJECT_ID;
const TOKEN = process.env.TOKEN;
const API_COUNT = parseInt(process.env.API_COUNT || '1000', 10);
const PATH_OFFSET = parseInt(process.env.PATH_OFFSET || '0', 10);
const SYNC_MODE = process.env.SYNC_MODE || 'merge';
const TARGET_MS = parseInt(process.env.TARGET_MS || '60000', 10);

if (!PROJECT_ID) {
  console.error('Missing PROJECT_ID');
  process.exit(1);
}

function createSpec(count, offset) {
  const paths = {};
  for (let i = 0; i < count; i++) {
    const index = offset + i;
    const p = `/perf/v1/resource/${index}`;
    paths[p] = {
      get: {
        summary: `perf-${index}`,
        operationId: `perf_get_${index}`,
        tags: ['perf'],
        parameters: [
          {
            name: 'traceId',
            in: 'query',
            required: false,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'integer' },
                    name: { type: 'string' }
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
    info: {
      title: 'perf-import',
      version: '1.0.0'
    },
    tags: [{ name: 'perf', description: 'perf benchmark' }],
    paths
  };
}

async function main() {
  const spec = createSpec(API_COUNT, PATH_OFFSET);
  const payload = {
    project_id: Number(PROJECT_ID),
    format: 'openapi3',
    source: 'json',
    json: JSON.stringify(spec),
    syncMode: SYNC_MODE
  };
  if (TOKEN) {
    payload.token = TOKEN;
  }
  const url = `${BASE_URL}/api/spec/import`;
  console.log(`[bench-import] url=${url}`);
  console.log(`[bench-import] apiCount=${API_COUNT}, pathOffset=${PATH_OFFSET}, syncMode=${SYNC_MODE}`);

  const start = Date.now();
  const res = await axios.post(url, payload, { timeout: 10 * 60 * 1000 });
  const cost = Date.now() - start;
  const ok = res && res.data && res.data.errcode === 0 && cost <= TARGET_MS;

  console.log(JSON.stringify({
    title: 'spec.import',
    targetMs: TARGET_MS,
    ok,
    durationMs: cost,
    errcode: res && res.data ? res.data.errcode : -1,
    errmsg: res && res.data ? res.data.errmsg : 'empty response'
  }, null, 2));
}

main().catch(err => {
  console.error('[bench-import] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});

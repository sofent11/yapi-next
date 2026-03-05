const axios = require('axios');
const { calcStats, printResult } = require('./utils');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const PROJECT_ID = process.env.PROJECT_ID;
const TOKEN = process.env.TOKEN;
const FORMAT = process.env.FORMAT || 'openapi3';
const TOTAL_REQUESTS = parseInt(process.env.TOTAL_REQUESTS || '50', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '8', 10);
const TARGET_P95 = parseInt(process.env.TARGET_P95 || '2000', 10);

if (!PROJECT_ID) {
  console.error('Missing PROJECT_ID');
  process.exit(1);
}

function buildUrl() {
  const query = [
    `project_id=${encodeURIComponent(PROJECT_ID)}`,
    `format=${encodeURIComponent(FORMAT)}`
  ];
  if (TOKEN) query.push(`token=${encodeURIComponent(TOKEN)}`);
  return `${BASE_URL}/api/spec/export?${query.join('&')}`;
}

async function runWorker(url, shared) {
  while (true) {
    const index = shared.cursor;
    if (index >= TOTAL_REQUESTS) {
      return;
    }
    shared.cursor++;
    const start = Date.now();
    try {
      const res = await axios.get(url, { timeout: 60000 });
      if (isExportSuccess(res && res.data)) {
        shared.success++;
      } else {
        shared.failed++;
      }
    } catch (err) {
      shared.failed++;
    } finally {
      shared.latencies.push(Date.now() - start);
    }
  }
}

function isExportSuccess(payload) {
  if (typeof payload === 'string') {
    return payload.length > 0;
  }
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  if (typeof payload.errcode === 'number') {
    if (payload.errcode !== 0) {
      return false;
    }
    return Boolean(payload.data);
  }
  if (payload.openapi || payload.swagger || payload.paths) {
    return true;
  }
  return false;
}

async function main() {
  const url = buildUrl();
  console.log(`[bench-export] url=${url}`);
  console.log(`[bench-export] total=${TOTAL_REQUESTS}, concurrency=${CONCURRENCY}`);

  const shared = {
    cursor: 0,
    success: 0,
    failed: 0,
    latencies: []
  };

  const start = Date.now();
  await Promise.all(new Array(CONCURRENCY).fill(null).map(() => runWorker(url, shared)));
  const totalMs = Date.now() - start;
  const stats = calcStats(shared.latencies);
  printResult(`spec.export.${FORMAT}`, {
    ...stats,
    totalMs,
    success: shared.success,
    failed: shared.failed,
    rps: Number(((shared.success + shared.failed) * 1000 / Math.max(totalMs, 1)).toFixed(2))
  }, TARGET_P95);
}

main().catch(err => {
  console.error('[bench-export] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});

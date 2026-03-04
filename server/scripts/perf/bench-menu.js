const axios = require('axios');
const { calcStats, printResult } = require('./utils');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const PROJECT_ID = process.env.PROJECT_ID;
const TOKEN = process.env.TOKEN;
const TOTAL_REQUESTS = parseInt(process.env.TOTAL_REQUESTS || '300', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '20', 10);
const TARGET_P95 = parseInt(process.env.TARGET_P95 || '500', 10);

if (!PROJECT_ID) {
  console.error('Missing PROJECT_ID');
  process.exit(1);
}

function buildUrl() {
  const query = [`project_id=${encodeURIComponent(PROJECT_ID)}`];
  if (TOKEN) query.push(`token=${encodeURIComponent(TOKEN)}`);
  return `${BASE_URL}/api/interface/list_menu?${query.join('&')}`;
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
      const res = await axios.get(url, { timeout: 30000 });
      if (!res || !res.data || res.data.errcode !== 0) {
        shared.failed++;
      } else {
        shared.success++;
      }
    } catch (err) {
      shared.failed++;
    } finally {
      shared.latencies.push(Date.now() - start);
    }
  }
}

async function main() {
  const url = buildUrl();
  console.log(`[bench-menu] url=${url}`);
  console.log(`[bench-menu] total=${TOTAL_REQUESTS}, concurrency=${CONCURRENCY}`);

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
  printResult('interface.list_menu', {
    ...stats,
    totalMs,
    success: shared.success,
    failed: shared.failed,
    rps: Number(((shared.success + shared.failed) * 1000 / Math.max(totalMs, 1)).toFixed(2))
  }, TARGET_P95);
}

main().catch(err => {
  console.error('[bench-menu] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});

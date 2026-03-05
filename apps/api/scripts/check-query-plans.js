#!/usr/bin/env node

const { MongoClient } = require('mongodb');

function parseDbName(mongoUrl) {
  try {
    const parsed = new URL(mongoUrl);
    const pathname = parsed.pathname.replace(/^\//, '');
    return pathname || 'yapi';
  } catch (_err) {
    return 'yapi';
  }
}

function findStages(node, targetStage, bucket) {
  if (!node || typeof node !== 'object') return;
  if (node.stage === targetStage) {
    bucket.push(node);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        findStages(item, targetStage, bucket);
      }
      continue;
    }
    if (value && typeof value === 'object') {
      findStages(value, targetStage, bucket);
    }
  }
}

function summarizePlan(explain) {
  const winningPlan = explain && explain.queryPlanner ? explain.queryPlanner.winningPlan : null;
  const collscanStages = [];
  const ixscanStages = [];
  findStages(winningPlan, 'COLLSCAN', collscanStages);
  findStages(winningPlan, 'IXSCAN', ixscanStages);

  return {
    hasCollscan: collscanStages.length > 0,
    indexNames: ixscanStages.map(item => item.indexName).filter(Boolean),
    totalDocsExamined:
      explain && explain.executionStats && Number.isFinite(explain.executionStats.totalDocsExamined)
        ? explain.executionStats.totalDocsExamined
        : 0,
    totalKeysExamined:
      explain && explain.executionStats && Number.isFinite(explain.executionStats.totalKeysExamined)
        ? explain.executionStats.totalKeysExamined
        : 0,
    nReturned:
      explain && explain.executionStats && Number.isFinite(explain.executionStats.nReturned)
        ? explain.executionStats.nReturned
        : 0
  };
}

async function runCheck(collection, name, query, options = {}) {
  const cursor = collection.find(query || {});
  if (options.sort) cursor.sort(options.sort);
  if (options.limit) cursor.limit(options.limit);
  const explain = await cursor.explain('executionStats');
  const summary = summarizePlan(explain);
  return {
    name,
    ok: !summary.hasCollscan,
    query,
    sort: options.sort || null,
    limit: options.limit || null,
    ...summary
  };
}

async function main() {
  const mongoUrl = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/yapi';
  const dbName = process.env.MONGO_DB || parseDbName(mongoUrl);
  const projectId = Number(process.env.PROJECT_ID || '0');
  const catid = Number(process.env.CATID || '0');
  const samplePath = process.env.SAMPLE_PATH || '/perf/v1/resource/0';
  const method = String(process.env.SAMPLE_METHOD || 'GET').toUpperCase();

  if (!Number.isFinite(projectId) || projectId <= 0) {
    throw new Error('PROJECT_ID is required');
  }
  if (!Number.isFinite(catid) || catid <= 0) {
    throw new Error('CATID is required');
  }

  const client = new MongoClient(mongoUrl, { maxPoolSize: 5 });
  try {
    await client.connect();
    const db = client.db(dbName);
    const interfaceCollection = db.collection('interface');

    const checks = [];
    checks.push(
      await runCheck(
        interfaceCollection,
        'interface.project_cat_menu_query',
        { project_id: projectId },
        { sort: { catid: 1, index: 1 }, limit: 200 }
      )
    );
    checks.push(
      await runCheck(
        interfaceCollection,
        'interface.project_cid_node_query',
        { project_id: projectId, catid },
        { sort: { index: 1, _id: 1 }, limit: 200 }
      )
    );
    checks.push(
      await runCheck(
        interfaceCollection,
        'interface.project_path_method_query',
        { project_id: projectId, path: samplePath, method },
        { limit: 1 }
      )
    );
    checks.push(
      await runCheck(
        interfaceCollection,
        'interface.query_path_project_method_query',
        { 'query_path.path': samplePath, project_id: projectId, method },
        { limit: 1 }
      )
    );

    const ok = checks.every(item => item.ok);
    console.log(
      JSON.stringify(
        {
          title: 'db.queryPlans',
          ok,
          checks
        },
        null,
        2
      )
    );
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('[check-query-plans] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});

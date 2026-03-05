const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const PROJECT_ID = process.env.PROJECT_ID;
const TOKEN = process.env.TOKEN;
const SPEC_FILE = process.env.SPEC_FILE || path.join(process.cwd(), 'test/swagger.v3.json');
const IMPORT_FORMAT = process.env.IMPORT_FORMAT || 'openapi3';
const SYNC_MODE = process.env.SYNC_MODE || 'merge';
const TARGET_RATIO = Number.parseFloat(process.env.TARGET_RATIO || '99');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

if (!PROJECT_ID) {
  console.error('Missing PROJECT_ID');
  process.exit(1);
}

function normalizePath(input) {
  if (!input) return '/';
  if (input === '/') return '/';
  let output = String(input);
  if (!output.startsWith('/')) output = `/${output}`;
  if (output.endsWith('/')) output = output.slice(0, -1);
  return output || '/';
}

function normalizeText(input) {
  if (input === null || input === undefined) return '';
  return String(input).trim();
}

function toSortedUnique(values) {
  return [...new Set(values)].sort();
}

function equalSet(a, b) {
  const left = toSortedUnique(a);
  const right = toSortedUnique(b);
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function parameterKeys(operation) {
  const parameters = Array.isArray(operation && operation.parameters) ? operation.parameters : [];
  return parameters
    .map(item => `${normalizeText(item && item.in)}:${normalizeText(item && item.name)}`)
    .filter(Boolean);
}

function responseCodes(operation) {
  if (!operation || typeof operation.responses !== 'object' || !operation.responses) return [];
  return Object.keys(operation.responses);
}

function requestBodyMediaTypes(operation) {
  const content = operation && operation.requestBody && operation.requestBody.content;
  if (!content || typeof content !== 'object') return [];
  return Object.keys(content);
}

function extractOperations(spec) {
  const map = new Map();
  const paths = spec && typeof spec.paths === 'object' ? spec.paths : {};
  for (const rawPath of Object.keys(paths)) {
    const pathItem = paths[rawPath];
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== 'object') continue;
      map.set(`${method.toUpperCase()} ${normalizePath(rawPath)}`, operation);
    }
  }
  return map;
}

function compareSpecs(sourceSpec, exportedSpec) {
  const sourceOps = extractOperations(sourceSpec);
  const exportedOps = extractOperations(exportedSpec);
  const missingOperations = [];
  const driftedOperations = [];

  let totalChecks = 0;
  let matchedChecks = 0;

  for (const [opKey, sourceOperation] of sourceOps.entries()) {
    totalChecks += 6;
    const exportedOperation = exportedOps.get(opKey);
    if (!exportedOperation) {
      missingOperations.push(opKey);
      continue;
    }
    matchedChecks += 1;

    const checks = [
      {
        name: 'operationId',
        pass: normalizeText(sourceOperation.operationId) === normalizeText(exportedOperation.operationId)
      },
      {
        name: 'summary',
        pass: normalizeText(sourceOperation.summary) === normalizeText(exportedOperation.summary)
      },
      {
        name: 'parameters',
        pass: equalSet(parameterKeys(sourceOperation), parameterKeys(exportedOperation))
      },
      {
        name: 'responses',
        pass: equalSet(responseCodes(sourceOperation), responseCodes(exportedOperation))
      },
      {
        name: 'requestBodyMediaTypes',
        pass: equalSet(requestBodyMediaTypes(sourceOperation), requestBodyMediaTypes(exportedOperation))
      }
    ];

    let operationPassed = true;
    for (const check of checks) {
      if (check.pass) {
        matchedChecks += 1;
      } else {
        operationPassed = false;
      }
    }

    if (!operationPassed) {
      driftedOperations.push({
        operation: opKey,
        failedChecks: checks.filter(item => !item.pass).map(item => item.name)
      });
    }
  }

  const ratio = totalChecks === 0
    ? 100
    : Number(((matchedChecks / totalChecks) * 100).toFixed(2));

  return {
    sourceOperationCount: sourceOps.size,
    exportedOperationCount: exportedOps.size,
    totalChecks,
    matchedChecks,
    consistencyRatio: ratio,
    missingOperations,
    driftedOperations: driftedOperations.slice(0, 30)
  };
}

async function main() {
  const sourceContent = fs.readFileSync(SPEC_FILE, 'utf8');
  const sourceSpec = JSON.parse(sourceContent);
  const importPayload = {
    project_id: Number(PROJECT_ID),
    source: 'json',
    format: IMPORT_FORMAT,
    syncMode: SYNC_MODE,
    json: JSON.stringify(sourceSpec)
  };
  if (TOKEN) {
    importPayload.token = TOKEN;
  }

  const importUrl = `${BASE_URL}/api/spec/import`;
  const exportQuery = new URLSearchParams({
    project_id: String(PROJECT_ID),
    format: 'openapi3',
    status: 'all'
  });
  if (TOKEN) {
    exportQuery.set('token', TOKEN);
  }
  const exportUrl = `${BASE_URL}/api/spec/export?${exportQuery.toString()}`;

  console.log(`[bench-roundtrip] import=${importUrl}`);
  console.log(`[bench-roundtrip] export=${exportUrl}`);
  console.log(`[bench-roundtrip] spec=${SPEC_FILE}, targetRatio=${TARGET_RATIO}`);

  const importStart = Date.now();
  const importResponse = await axios.post(importUrl, importPayload, { timeout: 10 * 60 * 1000 });
  const importDurationMs = Date.now() - importStart;
  const importErrcode = importResponse && importResponse.data ? importResponse.data.errcode : -1;
  if (importErrcode !== 0) {
    console.log(JSON.stringify({
      title: 'spec.roundtrip',
      targetRatio: TARGET_RATIO,
      ok: false,
      importDurationMs,
      consistencyRatio: 0,
      errcode: importErrcode,
      errmsg: importResponse && importResponse.data ? importResponse.data.errmsg : 'import failed'
    }, null, 2));
    return;
  }

  const exportStart = Date.now();
  const exportResponse = await axios.get(exportUrl, { timeout: 10 * 60 * 1000 });
  const exportDurationMs = Date.now() - exportStart;
  const exportErrcode = exportResponse && exportResponse.data ? exportResponse.data.errcode : -1;
  if (exportErrcode !== 0) {
    console.log(JSON.stringify({
      title: 'spec.roundtrip',
      targetRatio: TARGET_RATIO,
      ok: false,
      importDurationMs,
      exportDurationMs,
      consistencyRatio: 0,
      errcode: exportErrcode,
      errmsg: exportResponse && exportResponse.data ? exportResponse.data.errmsg : 'export failed'
    }, null, 2));
    return;
  }

  const exportedSpec = exportResponse.data && exportResponse.data.data ? exportResponse.data.data : {};
  const comparison = compareSpecs(sourceSpec, exportedSpec);
  const ok = comparison.consistencyRatio >= TARGET_RATIO;

  console.log(JSON.stringify({
    title: 'spec.roundtrip',
    targetRatio: TARGET_RATIO,
    ok,
    importDurationMs,
    exportDurationMs,
    ...comparison
  }, null, 2));
}

main().catch(err => {
  console.error('[bench-roundtrip] failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});

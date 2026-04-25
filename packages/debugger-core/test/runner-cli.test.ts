import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyCollection } from '../../debugger-schema/src/index';
import runnerCli from '../../../scripts/debugger-runner.ts';

const {
  formatFilters,
  parseArgs,
  resolveExecutionOptions,
  resolveReportPaths,
  selectRunPreset
} = runnerCli as Record<string, (...args: any[]) => any>;

test('parseArgs captures preset and configured report export flags', () => {
  const options = parseArgs([
    '--workspace',
    './demo',
    '--collection',
    'smoke-suite',
    '--preset',
    'nightly',
    '--environment',
    'staging',
    '--tag',
    'smoke',
    '--step',
    'login',
    '--report-configured',
    './reports/nightly.json',
    '--fail-fast'
  ]);

  assert.equal(options.workspaceRoot, './demo');
  assert.equal(options.collectionSelector, 'smoke-suite');
  assert.equal(options.presetSelector, 'nightly');
  assert.equal(options.environmentName, 'staging');
  assert.deepEqual(options.filters.tags, ['smoke']);
  assert.deepEqual(options.filters.stepKeys, ['login']);
  assert.equal(options.configuredReportBasePath, './reports/nightly.json');
  assert.equal(options.explicit.environmentName, true);
  assert.equal(options.explicit.tags, true);
  assert.equal(options.explicit.stepKeys, true);
  assert.equal(options.explicit.failFast, true);
});

test('selectRunPreset matches preset by id or name', () => {
  const collection = createEmptyCollection('Smoke Suite');
  collection.runPresets = [
    {
      id: 'preset_nightly',
      name: 'Nightly',
      environmentName: 'staging',
      tags: ['nightly'],
      stepKeys: ['login'],
      failFast: true
    }
  ];

  assert.equal(selectRunPreset(collection, 'preset_nightly')?.name, 'Nightly');
  assert.equal(selectRunPreset(collection, 'Nightly')?.environmentName, 'staging');
  assert.equal(selectRunPreset(collection, 'missing'), undefined);
});

test('resolveExecutionOptions lets presets seed environment and filters', () => {
  const options = parseArgs(['--workspace', './demo', '--preset', 'Nightly']);
  const execution = resolveExecutionOptions(options, { tags: ['rerun'] }, {
    id: 'preset_nightly',
    name: 'Nightly',
    environmentName: 'staging',
    tags: ['nightly'],
    stepKeys: ['login'],
    failFast: true
  });

  assert.equal(execution.environmentName, 'staging');
  assert.equal(execution.failFast, true);
  assert.deepEqual(execution.filters.tags, ['nightly']);
  assert.deepEqual(execution.filters.stepKeys, ['login']);
  assert.deepEqual(execution.filters.requestIds, undefined);
  assert.equal(formatFilters(execution.filters), 'tags=nightly · steps=login');
});

test('resolveExecutionOptions keeps rerun filters unless cli overrides them', () => {
  const options = parseArgs([
    '--workspace',
    './demo',
    '--tag',
    'smoke',
    '--request',
    'req_login'
  ]);
  const execution = resolveExecutionOptions(options, {
    tags: ['rerun'],
    requestIds: ['req_old'],
    caseIds: ['case_old']
  });

  assert.deepEqual(execution.filters.tags, ['smoke']);
  assert.deepEqual(execution.filters.requestIds, ['req_login']);
  assert.deepEqual(execution.filters.caseIds, ['case_old']);
});

test('resolveReportPaths expands configured reporters while letting explicit paths win', () => {
  const reportPaths = resolveReportPaths(
    { junit: './custom/results.xml' },
    './reports/nightly.json',
    ['json', 'html', 'junit']
  );

  assert.deepEqual(reportPaths, {
    json: './reports/nightly.json',
    html: './reports/nightly.html',
    junit: './custom/results.xml'
  });
});

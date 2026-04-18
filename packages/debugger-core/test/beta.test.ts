import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportJourneyState, evaluateSyncGuard } from '../src/beta';

test('evaluateSyncGuard blocks pull when workspace is dirty', () => {
  const guard = evaluateSyncGuard({
    isRepo: true,
    dirty: true,
    ahead: 0,
    behind: 0,
    changedFiles: ['requests/demo.request.yaml']
  });

  assert.equal(guard.canPull, false);
  assert.equal(guard.canPush, true);
  assert.match(guard.pullReason || '', /未提交改动/);
  assert.equal(guard.level, 'danger');
});

test('evaluateSyncGuard blocks push when branch is behind remote', () => {
  const guard = evaluateSyncGuard({
    isRepo: true,
    dirty: false,
    ahead: 0,
    behind: 2,
    changedFiles: []
  });

  assert.equal(guard.canPull, true);
  assert.equal(guard.canPush, false);
  assert.match(guard.pushReason || '', /先执行 Pull/);
  assert.equal(guard.level, 'warning');
});

test('buildImportJourneyState picks the first unfinished onboarding step', () => {
  const journey = buildImportJourneyState({
    hasImportSession: true,
    blockingCount: 0,
    runnableCount: 1,
    savedCaseCount: 0,
    collectionCount: 0
  });

  assert.equal(journey.nextStep, 'case');
  assert.equal(journey.steps.find(step => step.key === 'repair')?.done, true);
  assert.equal(journey.steps.find(step => step.key === 'send')?.done, true);
  assert.equal(journey.progress, 60);
});

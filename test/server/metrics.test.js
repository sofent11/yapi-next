import test from 'ava';

const metrics = require('../../server/utils/metrics');

test.beforeEach(() => {
  metrics.reset();
});

test('metrics should aggregate counter and histogram', t => {
  metrics.incCounter('req_total', { status: 'ok' }, 2);
  metrics.observeHistogram('req_ms', 10, { api: 'a' });
  metrics.observeHistogram('req_ms', 20, { api: 'a' });
  const snap = metrics.snapshot();

  t.is(snap.counters.req_total['status=ok'], 2);
  t.is(snap.histograms.req_ms['api=a'].count, 2);
  t.is(snap.histograms.req_ms['api=a'].p95, 20);
});

test('metrics reset should clear state', t => {
  metrics.incCounter('req_total', { status: 'ok' }, 1);
  metrics.reset();
  const snap = metrics.snapshot();
  t.deepEqual(snap.counters, {});
  t.deepEqual(snap.histograms, {});
});

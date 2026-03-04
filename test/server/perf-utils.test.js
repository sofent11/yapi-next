import test from 'ava';

const { calcStats } = require('../../server/scripts/perf/utils');

test('calcStats should return basic percentiles', t => {
  const stats = calcStats([10, 20, 30, 40, 50]);
  t.is(stats.count, 5);
  t.is(stats.min, 10);
  t.is(stats.max, 50);
  t.is(stats.p50, 30);
  t.is(stats.p95, 50);
  t.is(stats.p99, 50);
});

test('calcStats should handle empty input', t => {
  const stats = calcStats([]);
  t.is(stats.count, 0);
  t.is(stats.p95, 0);
});

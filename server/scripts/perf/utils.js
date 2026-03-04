function percentile(sortedValues, p) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return 0;
  if (p <= 0) return sortedValues[0];
  if (p >= 100) return sortedValues[sortedValues.length - 1];
  const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, idx)];
}

function calcStats(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      p50: 0,
      p95: 0,
      p99: 0
    };
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((acc, cur) => acc + cur, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Number((sum / sorted.length).toFixed(2)),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99)
  };
}

function printResult(title, result, threshold) {
  const ok = threshold == null ? true : result.p95 <= threshold;
  const output = {
    title,
    thresholdP95Ms: threshold == null ? null : threshold,
    ok,
    ...result
  };
  console.log(JSON.stringify(output, null, 2));
}

module.exports = {
  calcStats,
  printResult
};

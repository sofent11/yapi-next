const MAX_SAMPLES = 5000;

const state = {
  counters: Object.create(null),
  histograms: Object.create(null)
};

function normalizeLabels(labels) {
  if (!labels || typeof labels !== 'object') {
    return {};
  }
  const result = {};
  Object.keys(labels)
    .sort()
    .forEach(key => {
      const value = labels[key];
      result[key] = value == null ? '' : String(value);
    });
  return result;
}

function labelKey(labels) {
  const normalized = normalizeLabels(labels);
  const pairs = Object.keys(normalized).map(k => `${k}=${normalized[k]}`);
  return pairs.join(',');
}

function counterBucket(name) {
  if (!state.counters[name]) {
    state.counters[name] = Object.create(null);
  }
  return state.counters[name];
}

function histogramBucket(name) {
  if (!state.histograms[name]) {
    state.histograms[name] = Object.create(null);
  }
  return state.histograms[name];
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function summarizeSamples(samples, sum) {
  if (!samples.length) {
    return {
      count: 0,
      sum: 0,
      avg: 0,
      min: 0,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0
    };
  }
  const sorted = samples.slice().sort((a, b) => a - b);
  return {
    count: sorted.length,
    sum,
    avg: Number((sum / sorted.length).toFixed(2)),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99)
  };
}

function incCounter(name, labels, delta) {
  const bucket = counterBucket(name);
  const key = labelKey(labels);
  const step = typeof delta === 'number' ? delta : 1;
  bucket[key] = (bucket[key] || 0) + step;
}

function observeHistogram(name, value, labels) {
  const bucket = histogramBucket(name);
  const key = labelKey(labels);
  if (!bucket[key]) {
    bucket[key] = {
      samples: [],
      sum: 0
    };
  }
  const target = bucket[key];
  const numeric = Number(value);
  if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
    return;
  }
  target.samples.push(numeric);
  target.sum += numeric;
  if (target.samples.length > MAX_SAMPLES) {
    const removeCount = target.samples.length - MAX_SAMPLES;
    const removed = target.samples.splice(0, removeCount);
    const removedSum = removed.reduce((acc, cur) => acc + cur, 0);
    target.sum -= removedSum;
  }
}

function snapshot() {
  const counters = {};
  const histograms = {};

  Object.keys(state.counters).forEach(name => {
    counters[name] = Object.assign({}, state.counters[name]);
  });

  Object.keys(state.histograms).forEach(name => {
    const bucket = state.histograms[name];
    const summary = {};
    Object.keys(bucket).forEach(key => {
      const item = bucket[key];
      summary[key || ''] = summarizeSamples(item.samples, item.sum);
    });
    histograms[name] = summary;
  });

  return {
    counters,
    histograms,
    sampleLimit: MAX_SAMPLES
  };
}

function reset() {
  state.counters = Object.create(null);
  state.histograms = Object.create(null);
}

module.exports = {
  incCounter,
  observeHistogram,
  snapshot,
  reset
};

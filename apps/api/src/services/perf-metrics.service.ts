import { Injectable } from '@nestjs/common';

const MAX_SAMPLES = 5000;

type MetricLabels = Record<string, string | number | boolean | undefined>;

interface HistogramBucket {
  samples: number[];
  sum: number;
}

@Injectable()
export class PerfMetricsService {
  private counters: Record<string, Record<string, number>> = Object.create(null);
  private histograms: Record<string, Record<string, HistogramBucket>> = Object.create(null);

  incCounter(name: string, labels?: MetricLabels, delta = 1): void {
    if (!this.counters[name]) {
      this.counters[name] = Object.create(null);
    }
    const key = this.labelKey(labels);
    this.counters[name][key] = (this.counters[name][key] || 0) + delta;
  }

  observeHistogram(name: string, value: number, labels?: MetricLabels): void {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    if (!this.histograms[name]) {
      this.histograms[name] = Object.create(null);
    }
    const key = this.labelKey(labels);
    if (!this.histograms[name][key]) {
      this.histograms[name][key] = {
        samples: [],
        sum: 0
      };
    }
    const bucket = this.histograms[name][key];
    bucket.samples.push(numeric);
    bucket.sum += numeric;
    if (bucket.samples.length > MAX_SAMPLES) {
      const removeCount = bucket.samples.length - MAX_SAMPLES;
      const removed = bucket.samples.splice(0, removeCount);
      bucket.sum -= removed.reduce((acc, current) => acc + current, 0);
    }
  }

  snapshot(): {
    counters: Record<string, Record<string, number>>;
    histograms: Record<string, Record<string, Record<string, number>>>;
    sampleLimit: number;
  } {
    const counters: Record<string, Record<string, number>> = {};
    const histograms: Record<string, Record<string, Record<string, number>>> = {};

    for (const name of Object.keys(this.counters)) {
      counters[name] = { ...this.counters[name] };
    }
    for (const name of Object.keys(this.histograms)) {
      histograms[name] = {};
      const labelBuckets = this.histograms[name];
      for (const labelKey of Object.keys(labelBuckets)) {
        const bucket = labelBuckets[labelKey];
        histograms[name][labelKey || ''] = this.summarize(bucket.samples, bucket.sum);
      }
    }

    return {
      counters,
      histograms,
      sampleLimit: MAX_SAMPLES
    };
  }

  reset(): void {
    this.counters = Object.create(null);
    this.histograms = Object.create(null);
  }

  private summarize(samples: number[], sum: number): Record<string, number> {
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

    const sorted = [...samples].sort((a, b) => a - b);
    return {
      count: sorted.length,
      sum,
      avg: Number((sum / sorted.length).toFixed(2)),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99)
    };
  }

  private percentile(sorted: number[], p: number): number {
    if (!sorted.length) return 0;
    if (p <= 0) return sorted[0];
    if (p >= 100) return sorted[sorted.length - 1];
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  private labelKey(labels?: MetricLabels): string {
    if (!labels || typeof labels !== 'object') return '';
    const keys = Object.keys(labels).sort();
    return keys.map(key => `${key}=${labels[key] == null ? '' : String(labels[key])}`).join(',');
  }
}

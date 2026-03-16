/**
 * Unit tests for monitoring (health handler, metrics).
 * Traces to ESH-AC-20, ESH-AC-22.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  metricsRegistry,
  mindkegToolInvocationsTotal,
  mindkegToolDurationSeconds,
  mindkegErrorsTotal,
  mindkegSearchLatencySeconds,
  resetMetrics,
} from '../../src/monitoring/metrics.js';
import { recordToolMetrics } from '../../src/tools/tool-utils.js';

describe('Metrics registry (ESH-AC-22)', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('registry has the expected metric names', async () => {
    const metrics = await metricsRegistry.getMetricsAsJSON();
    const metricNames = metrics.map((m) => m.name);
    expect(metricNames).toContain('mindkeg_tool_invocations_total');
    expect(metricNames).toContain('mindkeg_tool_duration_seconds');
    expect(metricNames).toContain('mindkeg_errors_total');
    expect(metricNames).toContain('mindkeg_uptime_seconds');
    expect(metricNames).toContain('mindkeg_learnings_total');
    expect(metricNames).toContain('mindkeg_search_latency_seconds');
  });

  it('mindkegToolInvocationsTotal increments correctly', async () => {
    mindkegToolInvocationsTotal.inc({ tool: 'store_learning', result: 'success' });
    mindkegToolInvocationsTotal.inc({ tool: 'store_learning', result: 'success' });
    mindkegToolInvocationsTotal.inc({ tool: 'search_learnings', result: 'error' });

    const metrics = await metricsRegistry.getMetricsAsJSON();
    const invocationMetric = metrics.find((m) => m.name === 'mindkeg_tool_invocations_total');
    expect(invocationMetric).toBeDefined();

    const storeSuccessValue = invocationMetric!.values.find(
      (v) => v.labels['tool'] === 'store_learning' && v.labels['result'] === 'success'
    );
    expect(storeSuccessValue?.value).toBe(2);

    const searchErrorValue = invocationMetric!.values.find(
      (v) => v.labels['tool'] === 'search_learnings' && v.labels['result'] === 'error'
    );
    expect(searchErrorValue?.value).toBe(1);
  });

  it('mindkegErrorsTotal increments with error code', async () => {
    mindkegErrorsTotal.inc({ code: 'AUTH_ERROR' });
    mindkegErrorsTotal.inc({ code: 'AUTH_ERROR' });
    mindkegErrorsTotal.inc({ code: 'NOT_FOUND_ERROR' });

    const metrics = await metricsRegistry.getMetricsAsJSON();
    const errorsMetric = metrics.find((m) => m.name === 'mindkeg_errors_total');
    expect(errorsMetric).toBeDefined();

    const authErrors = errorsMetric!.values.find((v) => v.labels['code'] === 'AUTH_ERROR');
    expect(authErrors?.value).toBe(2);
  });

  it('mindkegToolDurationSeconds observes values', async () => {
    mindkegToolDurationSeconds.observe({ tool: 'store_learning' }, 0.05);
    mindkegToolDurationSeconds.observe({ tool: 'store_learning' }, 0.15);

    const metrics = await metricsRegistry.getMetricsAsJSON();
    const durationMetric = metrics.find((m) => m.name === 'mindkeg_tool_duration_seconds');
    expect(durationMetric).toBeDefined();
    // Check that sum includes our observations
    const sumEntry = (durationMetric!.values as Array<{ value: number; labels: Record<string, string>; metricName?: string }>).find(
      (v) => v.metricName === 'mindkeg_tool_duration_seconds_sum' && v.labels['tool'] === 'store_learning'
    );
    expect(sumEntry?.value).toBeCloseTo(0.2, 5);
  });

  it('mindkegSearchLatencySeconds observes search tool durations', async () => {
    mindkegSearchLatencySeconds.observe(0.1);
    mindkegSearchLatencySeconds.observe(0.3);

    const metrics = await metricsRegistry.getMetricsAsJSON();
    const searchMetric = metrics.find((m) => m.name === 'mindkeg_search_latency_seconds');
    expect(searchMetric).toBeDefined();

    const sumEntry = (searchMetric!.values as Array<{ value: number; labels: Record<string, string>; metricName?: string }>).find(
      (v) => v.metricName === 'mindkeg_search_latency_seconds_sum'
    );
    expect(sumEntry?.value).toBeCloseTo(0.4, 5);
  });
});

describe('recordToolMetrics helper (ESH-AC-22)', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('increments invocations counter on success', async () => {
    recordToolMetrics('store_learning', 'success', 50);

    const metrics = await metricsRegistry.getMetricsAsJSON();
    const invocations = metrics.find((m) => m.name === 'mindkeg_tool_invocations_total');
    const value = invocations?.values.find(
      (v) => v.labels['tool'] === 'store_learning' && v.labels['result'] === 'success'
    );
    expect(value?.value).toBe(1);
  });

  it('increments error counter on error with code', async () => {
    recordToolMetrics('delete_learning', 'error', 20, 'AUTH_ERROR');

    const metrics = await metricsRegistry.getMetricsAsJSON();
    const errors = metrics.find((m) => m.name === 'mindkeg_errors_total');
    const authError = errors?.values.find((v) => v.labels['code'] === 'AUTH_ERROR');
    expect(authError?.value).toBe(1);
  });

  it('also records search latency for search_learnings tool', async () => {
    recordToolMetrics('search_learnings', 'success', 200); // 200ms

    const metrics = await metricsRegistry.getMetricsAsJSON();
    const searchLatency = metrics.find((m) => m.name === 'mindkeg_search_latency_seconds');
    const sumEntry = (searchLatency?.values as Array<{ value: number; labels: Record<string, string>; metricName?: string }> | undefined)?.find(
      (v) => v.metricName === 'mindkeg_search_latency_seconds_sum'
    );
    expect(sumEntry?.value).toBeCloseTo(0.2, 5);
  });

  it('does not record search latency for non-search tools', async () => {
    recordToolMetrics('store_learning', 'success', 100);

    const metrics = await metricsRegistry.getMetricsAsJSON();
    const searchLatency = metrics.find((m) => m.name === 'mindkeg_search_latency_seconds');
    const sumEntry = (searchLatency?.values as Array<{ value: number; labels: Record<string, string>; metricName?: string }> | undefined)?.find(
      (v) => v.metricName === 'mindkeg_search_latency_seconds_sum'
    );
    // Either undefined or 0 — no observations for non-search tools
    expect(sumEntry?.value ?? 0).toBe(0);
  });
});

/**
 * Prometheus metrics registry and metric definitions for Mind Keg MCP.
 * Traces to ESH-AC-21, ESH-AC-22.
 *
 * Uses prom-client (de facto standard, zero native dependencies).
 * Metrics are collected via a singleton registry initialized at server startup.
 */
import {
  Registry,
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

// ---------------------------------------------------------------------------
// Registry singleton
// ---------------------------------------------------------------------------

/**
 * Dedicated registry for Mind Keg metrics.
 * Using a non-default registry prevents conflicts when running tests in parallel.
 */
export const metricsRegistry = new Registry();

// ---------------------------------------------------------------------------
// Metrics (ESH-AC-22)
// ---------------------------------------------------------------------------

/**
 * Total count of learnings in the database, labeled by status.
 * Gauge — can go up and down (learnings are deleted, deprecated).
 */
export const mindkegLearningsTotal = new Gauge({
  name: 'mindkeg_learnings_total',
  help: 'Total number of learnings in the database, by status.',
  labelNames: ['status'],
  registers: [metricsRegistry],
});

/**
 * Total MCP tool invocations, labeled by tool name and result.
 * Counter — monotonically increasing.
 */
export const mindkegToolInvocationsTotal = new Counter({
  name: 'mindkeg_tool_invocations_total',
  help: 'Total number of MCP tool invocations, by tool name and result (success/error).',
  labelNames: ['tool', 'result'],
  registers: [metricsRegistry],
});

/**
 * Tool execution duration histogram, labeled by tool name.
 * Histogram with buckets tuned for typical MCP response times.
 */
export const mindkegToolDurationSeconds = new Histogram({
  name: 'mindkeg_tool_duration_seconds',
  help: 'MCP tool handler execution duration in seconds.',
  labelNames: ['tool'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

/**
 * Total errors labeled by error code.
 * Counter — monotonically increasing.
 */
export const mindkegErrorsTotal = new Counter({
  name: 'mindkeg_errors_total',
  help: 'Total number of MCP errors, by error code.',
  labelNames: ['code'],
  registers: [metricsRegistry],
});

/**
 * Server uptime in seconds.
 * Gauge — updated lazily when /metrics is scraped.
 */
export const mindkegUptimeSeconds = new Gauge({
  name: 'mindkeg_uptime_seconds',
  help: 'Server uptime in seconds.',
  registers: [metricsRegistry],
  collect() {
    // process.uptime() returns the server's uptime in seconds
    this.set(process.uptime());
  },
});

/**
 * Search latency histogram (subset of tool_duration for search_learnings).
 * Kept separate for easy Grafana dashboarding (ESH-AC-21).
 */
export const mindkegSearchLatencySeconds = new Histogram({
  name: 'mindkeg_search_latency_seconds',
  help: 'search_learnings tool execution duration in seconds.',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

// ---------------------------------------------------------------------------
// Default process metrics (optional, disabled in tests via collectDefaultMetrics)
// ---------------------------------------------------------------------------

let defaultMetricsCollected = false;

/**
 * Start collecting Node.js default process metrics (heap, CPU, etc.).
 * Should be called once at server startup, not in tests.
 */
export function startDefaultMetricsCollection(): void {
  if (!defaultMetricsCollected) {
    collectDefaultMetrics({ register: metricsRegistry });
    defaultMetricsCollected = true;
  }
}

/**
 * Reset all metrics — used in tests to avoid leakage between test runs.
 */
export function resetMetrics(): void {
  metricsRegistry.resetMetrics();
}

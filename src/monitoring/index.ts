/**
 * Barrel export for the monitoring subsystem.
 * Traces to ESH-AC-20, ESH-AC-21.
 */
export { handleHealthCheck } from './health.js';
export type { HealthResponse } from './health.js';
export {
  metricsRegistry,
  mindkegLearningsTotal,
  mindkegToolInvocationsTotal,
  mindkegToolDurationSeconds,
  mindkegErrorsTotal,
  mindkegUptimeSeconds,
  mindkegSearchLatencySeconds,
  startDefaultMetricsCollection,
  resetMetrics,
} from './metrics.js';

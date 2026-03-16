/**
 * In-memory token bucket rate limiter for HTTP transport.
 * Implements separate read and write buckets per API key prefix.
 * Traces to ESH-AC-28.
 *
 * Design:
 * - Token bucket algorithm: each bucket starts full and tokens are consumed per request
 * - Refill is continuous: tokens accumulate based on elapsed time since last request
 * - Per-API-key-prefix isolation: each key has its own independent buckets
 * - Two bucket types per key: write (lower limit) and read (higher limit)
 * - State is in-memory — resets on server restart (acceptable for v1, see architecture spec)
 * - HTTP transport only: stdio transport is local and does not need rate limiting
 */

/** The tool names that consume from the write bucket. */
export const WRITE_TOOLS = new Set([
  'store_learning',
  'update_learning',
  'delete_learning',
  'deprecate_learning',
  'flag_stale',
]);

/** The tool names that consume from the read bucket. */
export const READ_TOOLS = new Set([
  'search_learnings',
  'get_context',
  'list_repositories',
  'list_workspaces',
]);

/** Classify an MCP tool name as read or write for rate limiting purposes. */
export type BucketType = 'write' | 'read';

export function classifyTool(toolName: string): BucketType {
  if (WRITE_TOOLS.has(toolName)) return 'write';
  return 'read';
}

interface Bucket {
  /** Current token count (0..capacity). */
  tokens: number;
  /** Capacity (max tokens = requests per minute). */
  capacity: number;
  /** Milliseconds between token refills (1000ms / (rpm / 60)). */
  refillRateMs: number;
  /** Timestamp of last token consumption (ms since epoch). */
  lastRefillAt: number;
}

function createBucket(rpm: number): Bucket {
  return {
    tokens: rpm,
    capacity: rpm,
    refillRateMs: 60_000 / rpm,
    lastRefillAt: Date.now(),
  };
}

/**
 * Refill tokens based on elapsed time since last request.
 * Continuous token refill: tokens = min(capacity, tokens + elapsed_ms / refill_rate_ms)
 */
function refillBucket(bucket: Bucket): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefillAt;
  const tokensToAdd = elapsed / bucket.refillRateMs;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
  bucket.lastRefillAt = now;
}

/** Per-key state: two buckets (write and read). */
interface KeyState {
  write: Bucket;
  read: Bucket;
}

/**
 * Token bucket rate limiter for the HTTP MCP transport.
 * One instance per server; shared across all HTTP sessions.
 */
export class RateLimiter {
  private readonly writeRpm: number;
  private readonly readRpm: number;
  private readonly buckets = new Map<string, KeyState>();

  /**
   * @param writeRpm - Maximum write requests per minute per key (ESH-AC-28)
   * @param readRpm - Maximum read requests per minute per key (ESH-AC-28)
   */
  constructor(writeRpm: number, readRpm: number) {
    this.writeRpm = writeRpm;
    this.readRpm = readRpm;
  }

  /**
   * Attempt to consume a token from the appropriate bucket for the given key.
   *
   * @param keyPrefix - First 8 chars of the API key, or "anonymous" for unauthenticated requests
   * @param bucketType - "write" or "read"
   * @returns `{ allowed: true }` if the request is allowed,
   *          `{ allowed: false, retryAfterSeconds: number }` if rate-limited
   */
  consume(
    keyPrefix: string,
    bucketType: BucketType
  ): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    let state = this.buckets.get(keyPrefix);
    if (!state) {
      state = {
        write: createBucket(this.writeRpm),
        read: createBucket(this.readRpm),
      };
      this.buckets.set(keyPrefix, state);
    }

    const bucket = bucketType === 'write' ? state.write : state.read;
    refillBucket(bucket);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true };
    }

    // Calculate time until the next token is available
    const timeUntilNextToken = bucket.refillRateMs * (1 - bucket.tokens);
    const retryAfterSeconds = Math.ceil(timeUntilNextToken / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  /** Clear all bucket state (used in tests). */
  reset(): void {
    this.buckets.clear();
  }
}

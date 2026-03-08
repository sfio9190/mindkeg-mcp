/**
 * Embedding service: abstraction layer for generating text embeddings.
 * Supports FastEmbed (BAAI/bge-small-en-v1.5, 384 dims), OpenAI (text-embedding-3-small, 1536 dims),
 * and "none" (FTS fallback).
 * Traces to AC-9.
 */
import { EmbeddingError } from '../utils/errors.js';
import { getLogger } from '../utils/logger.js';
import type { Config } from '../config.js';

/** The embedding service contract — all providers implement this interface. */
export interface EmbeddingService {
  /** Generate an embedding vector for the given text. Returns null for the "none" provider. */
  generateEmbedding(text: string): Promise<number[] | null>;
  /** The number of dimensions in the embedding vector (e.g., 1536 for text-embedding-3-small). */
  getDimensions(): number;
  /** Human-readable name of the provider (e.g., "openai", "none"). */
  getProviderName(): string;
}

// ---------------------------------------------------------------------------
// OpenAI embedding provider
// ---------------------------------------------------------------------------

/** OpenAI API response shape (minimal subset we need). */
interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  model: string;
}

/**
 * OpenAI embedding provider.
 * Uses `text-embedding-3-small` (1536 dimensions).
 * Retries up to 3 times with exponential backoff on API failures.
 */
export class OpenAIEmbeddingService implements EmbeddingService {
  private readonly apiKey: string;
  private readonly model = 'text-embedding-3-small';
  private readonly dimensions = 1536;
  private readonly maxRetries = 3;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const log = getLogger();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model: this.model, input: text }),
          // F-14: Abort after 10 s to prevent the process from hanging indefinitely
          // on a slow or unresponsive OpenAI endpoint.
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new EmbeddingError(
            `OpenAI API returned ${response.status}: ${errorText}`
          );
        }

        const data = (await response.json()) as OpenAIEmbeddingResponse;
        const embedding = data.data[0]?.embedding;
        if (!embedding || embedding.length !== this.dimensions) {
          throw new EmbeddingError(
            `OpenAI returned unexpected embedding: got ${embedding?.length ?? 0} dimensions, expected ${this.dimensions}`
          );
        }
        return embedding;
      } catch (err) {
        if (err instanceof EmbeddingError) {
          // Don't retry on embedding errors that are our own (already wrapped)
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          const delayMs = Math.pow(2, attempt) * 500; // 1s, 2s backoff
          log.warn(
            { attempt, delayMs, error: lastError.message },
            'OpenAI embedding request failed, retrying...'
          );
          await sleep(delayMs);
        }
      }
    }

    throw new EmbeddingError(
      `OpenAI embedding failed after ${this.maxRetries} attempts: ${lastError?.message ?? 'unknown'}`,
      lastError
    );
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getProviderName(): string {
    return 'openai';
  }
}

// ---------------------------------------------------------------------------
// "None" provider — FTS5 fallback mode
// ---------------------------------------------------------------------------

/**
 * No-op embedding provider.
 * Used when no embedding API key is configured.
 * generateEmbedding() always returns null; the search falls back to FTS5.
 * Traces to AC-9 (FTS fallback) and the spec note about "none" provider.
 */
export class NoneEmbeddingService implements EmbeddingService {
  async generateEmbedding(_text: string): Promise<null> {
    return null;
  }

  getDimensions(): number {
    return 0;
  }

  getProviderName(): string {
    return 'none';
  }
}

// ---------------------------------------------------------------------------
// FastEmbed embedding provider
// ---------------------------------------------------------------------------

/**
 * FastEmbed embedding provider by Qdrant.
 * Uses BAAI/bge-small-en-v1.5 (384 dimensions) via local ONNX inference.
 * No API key required; model files (~50 MB) are downloaded on first use and cached locally.
 * Model initialization is lazy: the ONNX model is loaded on the first generateEmbedding() call.
 * Traces to AC-9.
 */
export class FastEmbedEmbeddingService implements EmbeddingService {
  private readonly dimensions = 384;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private model: any | null = null;

  async generateEmbedding(text: string): Promise<number[]> {
    const log = getLogger();

    try {
      if (!this.model) {
        log.info('Initializing FastEmbed model (BAAI/bge-small-en-v1.5)…');
        const { EmbeddingModel, FlagEmbedding } = await import('fastembed');
        this.model = await FlagEmbedding.init({ model: EmbeddingModel.BGESmallENV15 });
        log.info('FastEmbed model initialized.');
      }

      // model.embed() returns an async generator of batches; each batch is an array of Float32Array.
      const embeddings = this.model.embed([text]);
      for await (const batch of embeddings) {
        const vector = Array.from(batch[0] as Float32Array) as number[];
        if (vector.length !== this.dimensions) {
          throw new EmbeddingError(
            `FastEmbed returned unexpected embedding: got ${vector.length} dimensions, expected ${this.dimensions}`
          );
        }
        return vector;
      }

      throw new EmbeddingError('FastEmbed returned no embeddings for the input text.');
    } catch (err) {
      if (err instanceof EmbeddingError) {
        throw err;
      }
      throw new EmbeddingError(
        `FastEmbed embedding failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err : undefined
      );
    }
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getProviderName(): string {
    return 'fastembed';
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the appropriate embedding service based on configuration.
 * Traces to AC-9.
 */
export function createEmbeddingService(config: Config): EmbeddingService {
  const log = getLogger();

  if (config.embedding.provider === 'fastembed') {
    log.info(
      'Embedding provider is "fastembed"; using local ONNX model BAAI/bge-small-en-v1.5 (384 dims). Model files will be downloaded on first use.'
    );
    return new FastEmbedEmbeddingService();
  }

  if (config.embedding.provider === 'openai') {
    if (!config.embedding.openaiKey) {
      log.warn(
        'Embedding provider is "openai" but OPENAI_API_KEY is not set. Falling back to "none" provider.'
      );
      return new NoneEmbeddingService();
    }
    return new OpenAIEmbeddingService(config.embedding.openaiKey);
  }

  // provider === 'none'
  log.warn(
    'Embedding provider is "none"; search will use FTS5 keyword fallback. Set MINDKEG_EMBEDDING_PROVIDER=fastembed or MINDKEG_EMBEDDING_PROVIDER=openai for semantic search.'
  );
  return new NoneEmbeddingService();
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

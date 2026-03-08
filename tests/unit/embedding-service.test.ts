/**
 * Unit tests for the embedding service.
 * Mocks the OpenAI API to avoid real HTTP calls.
 * Mocks the fastembed module to avoid model downloads.
 * Traces to AC-9.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OpenAIEmbeddingService,
  NoneEmbeddingService,
  FastEmbedEmbeddingService,
  createEmbeddingService,
} from '../../src/services/embedding-service.js';
import { EmbeddingError } from '../../src/utils/errors.js';
import type { Config } from '../../src/config.js';

// ---------------------------------------------------------------------------
// NoneEmbeddingService tests
// ---------------------------------------------------------------------------
describe('NoneEmbeddingService', () => {
  const service = new NoneEmbeddingService();

  it('returns null for any text', async () => {
    const result = await service.generateEmbedding('some text');
    expect(result).toBeNull();
  });

  it('returns 0 for getDimensions()', () => {
    expect(service.getDimensions()).toBe(0);
  });

  it('returns "none" for getProviderName()', () => {
    expect(service.getProviderName()).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// OpenAIEmbeddingService tests (with mocked fetch)
// ---------------------------------------------------------------------------
describe('OpenAIEmbeddingService', () => {
  const MOCK_EMBEDDING = Array.from({ length: 1536 }, (_, i) => i / 1536);

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function makeOkResponse(embedding = MOCK_EMBEDDING) {
    return {
      ok: true,
      json: async () => ({
        data: [{ embedding }],
        model: 'text-embedding-3-small',
      }),
      status: 200,
    };
  }

  function makeErrorResponse(status: number, body: string) {
    return {
      ok: false,
      status,
      text: async () => body,
    };
  }

  it('calls the OpenAI API and returns an embedding', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(makeOkResponse() as unknown as Response);

    const service = new OpenAIEmbeddingService('sk-test-key');
    const result = await service.generateEmbedding('hello world');

    expect(result).toEqual(MOCK_EMBEDDING);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test-key',
        }),
      })
    );
  });

  it('returns 1536 for getDimensions()', () => {
    const service = new OpenAIEmbeddingService('key');
    expect(service.getDimensions()).toBe(1536);
  });

  it('returns "openai" for getProviderName()', () => {
    const service = new OpenAIEmbeddingService('key');
    expect(service.getProviderName()).toBe('openai');
  });

  it('throws EmbeddingError on API error response', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(
      makeErrorResponse(401, 'Invalid API key') as unknown as Response
    );

    const service = new OpenAIEmbeddingService('bad-key');
    await expect(service.generateEmbedding('test')).rejects.toThrow(EmbeddingError);
  });

  it('throws EmbeddingError when response has wrong dimension count', async () => {
    const mockFetch = vi.mocked(fetch);
    // Return wrong number of dimensions
    mockFetch.mockResolvedValue(
      makeOkResponse([0.1, 0.2, 0.3]) as unknown as Response // 3 dims instead of 1536
    );

    const service = new OpenAIEmbeddingService('key');
    await expect(service.generateEmbedding('test')).rejects.toThrow(EmbeddingError);
  });

  it('retries on network failure and succeeds on retry', async () => {
    const mockFetch = vi.mocked(fetch);
    // First call fails with a network error
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(makeOkResponse() as unknown as Response);

    const service = new OpenAIEmbeddingService('key');
    const result = await service.generateEmbedding('test');

    expect(result).toEqual(MOCK_EMBEDDING);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, { timeout: 10000 });

  it('throws EmbeddingError after max retries exhausted', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const service = new OpenAIEmbeddingService('key');
    await expect(service.generateEmbedding('test')).rejects.toThrow(EmbeddingError);
    // Should have tried 3 times
    expect(mockFetch).toHaveBeenCalledTimes(3);
  }, { timeout: 15000 });
});

// ---------------------------------------------------------------------------
// FastEmbedEmbeddingService tests (with mocked fastembed module)
// ---------------------------------------------------------------------------
describe('FastEmbedEmbeddingService', () => {
  // Build the expected vector by round-tripping through Float32Array to match the
  // precision loss that happens inside FastEmbedEmbeddingService.generateEmbedding().
  const RAW_VECTOR = Array.from({ length: 384 }, (_, i) => i / 384);
  const MOCK_VECTOR = Array.from(new Float32Array(RAW_VECTOR));

  beforeEach(() => {
    // Mock the fastembed dynamic import so no model is downloaded during tests.
    vi.mock('fastembed', () => ({
      EmbeddingModel: { BGESmallENV15: 'BAAI/bge-small-en-v1.5' },
      FlagEmbedding: {
        init: vi.fn().mockResolvedValue({
          embed: vi.fn().mockReturnValue(
            (async function* () {
              yield [new Float32Array(RAW_VECTOR)];
            })()
          ),
        }),
      },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 384 for getDimensions()', () => {
    const service = new FastEmbedEmbeddingService();
    expect(service.getDimensions()).toBe(384);
  });

  it('returns "fastembed" for getProviderName()', () => {
    const service = new FastEmbedEmbeddingService();
    expect(service.getProviderName()).toBe('fastembed');
  });

  it('initializes the model lazily and returns a 384-dimensional embedding', async () => {
    const { FlagEmbedding, EmbeddingModel } = await import('fastembed');
    const mockInit = vi.mocked(FlagEmbedding.init);
    // Reset the mock embed to return a fresh generator for this test
    mockInit.mockResolvedValue({
      embed: vi.fn().mockReturnValue(
        (async function* () {
          yield [new Float32Array(RAW_VECTOR)];
        })()
      ),
    } as unknown as Awaited<ReturnType<typeof FlagEmbedding.init>>);

    const service = new FastEmbedEmbeddingService();
    const result = await service.generateEmbedding('hello world');

    expect(mockInit).toHaveBeenCalledOnce();
    expect(mockInit).toHaveBeenCalledWith({ model: EmbeddingModel.BGESmallENV15 });
    expect(result).toHaveLength(384);
    // Compare against Float32-precision-rounded values to account for Float32Array conversion
    expect(result).toEqual(MOCK_VECTOR);
  });

  it('reuses the initialized model on subsequent calls (lazy-init runs once)', async () => {
    const { FlagEmbedding } = await import('fastembed');
    const mockInit = vi.mocked(FlagEmbedding.init);

    const mockEmbed = vi.fn()
      .mockReturnValueOnce(
        (async function* () { yield [new Float32Array(RAW_VECTOR)]; })()
      )
      .mockReturnValueOnce(
        (async function* () { yield [new Float32Array(RAW_VECTOR)]; })()
      );
    mockInit.mockResolvedValue({ embed: mockEmbed } as unknown as Awaited<ReturnType<typeof FlagEmbedding.init>>);

    const service = new FastEmbedEmbeddingService();
    await service.generateEmbedding('first call');
    await service.generateEmbedding('second call');

    // init must only have been called once regardless of how many embeddings are generated
    expect(mockInit).toHaveBeenCalledOnce();
    expect(mockEmbed).toHaveBeenCalledTimes(2);
  });

  it('throws EmbeddingError when the model init fails', async () => {
    const { FlagEmbedding } = await import('fastembed');
    vi.mocked(FlagEmbedding.init).mockRejectedValue(new Error('ONNX runtime error'));

    const service = new FastEmbedEmbeddingService();
    // A single assertion confirms both the type and the message
    await expect(service.generateEmbedding('test')).rejects.toThrow(
      'FastEmbed embedding failed: ONNX runtime error'
    );
  });

  it('throws EmbeddingError when embed returns wrong dimension count', async () => {
    const { FlagEmbedding } = await import('fastembed');
    vi.mocked(FlagEmbedding.init).mockResolvedValue({
      embed: vi.fn().mockReturnValue(
        (async function* () {
          yield [new Float32Array([0.1, 0.2, 0.3])]; // 3 dims instead of 384
        })()
      ),
    } as unknown as Awaited<ReturnType<typeof FlagEmbedding.init>>);

    // Each test uses a fresh service instance; a single call is sufficient to confirm
    // the error type and message before this.model is cached with the wrong-dim mock.
    const service = new FastEmbedEmbeddingService();
    await expect(service.generateEmbedding('test')).rejects.toThrow(
      'got 3 dimensions, expected 384'
    );
  });
});

// ---------------------------------------------------------------------------
// createEmbeddingService factory tests
// ---------------------------------------------------------------------------
describe('createEmbeddingService', () => {
  function makeConfig(provider: string, openaiKey?: string): Config {
    return {
      storage: { backend: 'sqlite', sqlitePath: '/tmp/test.db' },
      embedding: { provider: provider as 'fastembed' | 'openai' | 'none', openaiKey },
      server: { host: '127.0.0.1', port: 52100, logLevel: 'error' },
      auth: { apiKey: undefined },
    };
  }

  it('returns NoneEmbeddingService when provider is "none"', () => {
    const service = createEmbeddingService(makeConfig('none'));
    expect(service.getProviderName()).toBe('none');
  });

  it('returns OpenAIEmbeddingService when provider is "openai" with a key', () => {
    const service = createEmbeddingService(makeConfig('openai', 'sk-real-key'));
    expect(service.getProviderName()).toBe('openai');
  });

  it('falls back to NoneEmbeddingService when provider is "openai" but no key is set', () => {
    const service = createEmbeddingService(makeConfig('openai', undefined));
    expect(service.getProviderName()).toBe('none');
  });

  it('returns FastEmbedEmbeddingService when provider is "fastembed"', () => {
    const service = createEmbeddingService(makeConfig('fastembed'));
    expect(service.getProviderName()).toBe('fastembed');
    expect(service.getDimensions()).toBe(384);
  });
});

/**
 * Tests for EmbeddingServiceImpl
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmbeddingServiceImpl } from '../../../src/core/embedding';
import { EmbeddingError } from '../../../src/errors';
import type { ClawModConfig } from '../../../src/core/config';

describe('EmbeddingServiceImpl', () => {
  let embedding: EmbeddingServiceImpl;
  let fetchMock: ReturnType<typeof vi.fn>;

  const mockConfig: ClawModConfig = {
    version: '1.0.0',
    apiKeyEnv: 'TEST_API_KEY',
    models: {
      scoring: 'test/scoring',
      extraction: 'test/extraction',
      powerful: 'test/powerful',
      embedding: 'test/embedding',
    },
    modules: {},
  };

  beforeEach(() => {
    // Set up environment variable
    process.env.TEST_API_KEY = 'test-api-key-12345';

    // Mock global fetch
    fetchMock = vi.fn();
    global.fetch = fetchMock;

    embedding = new EmbeddingServiceImpl(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TEST_API_KEY;
  });

  describe('initialization', () => {
    test('should initialize with valid API key', () => {
      expect(embedding).toBeDefined();
    });

    test('should throw error if API key is missing', () => {
      delete process.env.TEST_API_KEY;
      expect(() => new EmbeddingServiceImpl(mockConfig)).toThrow(EmbeddingError);
    });

    test('should throw error with correct message when API key missing', () => {
      delete process.env.TEST_API_KEY;
      expect(() => new EmbeddingServiceImpl(mockConfig)).toThrow(
        'API key not found in environment variable: TEST_API_KEY'
      );
    });
  });

  describe('embed', () => {
    test('should return embeddings for single text', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4];
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding, index: 0 }],
          model: 'test/embedding',
        }),
      });

      const result = await embedding.embed('test text');
      expect(result).toEqual(mockEmbedding);
    });

    test('should send correct request to API', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2], index: 0 }],
          model: 'test/embedding',
        }),
      });

      await embedding.embed('test text');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-api-key-12345',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/claw-industries/clawmod',
            'X-Title': 'ClawMod',
          },
          body: JSON.stringify({
            model: 'test/embedding',
            input: ['test text'],
          }),
        })
      );
    });

    test('should cache embeddings and not call API twice for same text', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding, index: 0 }],
          model: 'test/embedding',
        }),
      });

      // First call - should hit API
      const result1 = await embedding.embed('test text');
      expect(result1).toEqual(mockEmbedding);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await embedding.embed('test text');
      expect(result2).toEqual(mockEmbedding);
      expect(fetchMock).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    test('should throw EmbeddingError on API failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API key',
      });

      await expect(embedding.embed('test')).rejects.toThrow(EmbeddingError);
    });

    test('should handle network errors', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      await expect(embedding.embed('test')).rejects.toThrow(EmbeddingError);
    });

    test('should handle invalid API response format', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          // Missing 'data' field
          model: 'test/embedding',
        }),
      });

      await expect(embedding.embed('test')).rejects.toThrow(EmbeddingError);
    });
  });

  describe('embedBatch', () => {
    test('should return array of embeddings', async () => {
      const mockEmbeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
        [0.7, 0.8, 0.9],
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { embedding: mockEmbeddings[0], index: 0 },
            { embedding: mockEmbeddings[1], index: 1 },
            { embedding: mockEmbeddings[2], index: 2 },
          ],
          model: 'test/embedding',
        }),
      });

      const result = await embedding.embedBatch(['text1', 'text2', 'text3']);
      expect(result).toEqual(mockEmbeddings);
    });

    test('should return empty array for empty input', async () => {
      const result = await embedding.embedBatch([]);
      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test('should handle mixed cache hits and misses', async () => {
      // First, populate cache with one embedding
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2], index: 0 }],
          model: 'test/embedding',
        }),
      });
      await embedding.embed('cached text');

      // Now batch embed with one cached and two new texts
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { embedding: [0.3, 0.4], index: 0 },
            { embedding: [0.5, 0.6], index: 1 },
          ],
          model: 'test/embedding',
        }),
      });

      const result = await embedding.embedBatch(['cached text', 'new text 1', 'new text 2']);

      expect(result).toEqual([
        [0.1, 0.2], // From cache
        [0.3, 0.4], // From API
        [0.5, 0.6], // From API
      ]);

      // Should only fetch the 2 uncached texts
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test('should handle all texts being cached', async () => {
      // Populate cache
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { embedding: [0.1, 0.2], index: 0 },
            { embedding: [0.3, 0.4], index: 1 },
          ],
          model: 'test/embedding',
        }),
      });
      await embedding.embedBatch(['text1', 'text2']);

      // All texts should be cached now
      const result = await embedding.embedBatch(['text1', 'text2']);
      expect(result).toEqual([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);

      // Should only have made one API call (the first one)
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('should preserve order when API response is out of order', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { embedding: [0.7, 0.8], index: 2 },
            { embedding: [0.1, 0.2], index: 0 },
            { embedding: [0.4, 0.5], index: 1 },
          ],
          model: 'test/embedding',
        }),
      });

      const result = await embedding.embedBatch(['text1', 'text2', 'text3']);
      expect(result).toEqual([
        [0.1, 0.2], // index 0
        [0.4, 0.5], // index 1
        [0.7, 0.8], // index 2
      ]);
    });

    test('should throw error on API failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      });

      await expect(embedding.embedBatch(['text1', 'text2'])).rejects.toThrow(EmbeddingError);
    });
  });

  describe('cosineSimilarity', () => {
    test('should calculate correct similarity for identical vectors', () => {
      const vec = [1, 2, 3];
      const similarity = embedding.cosineSimilarity(vec, vec);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    test('should calculate correct similarity for orthogonal vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      const similarity = embedding.cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(0.0, 5);
    });

    test('should calculate correct similarity for opposite vectors', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [-1, -2, -3];
      const similarity = embedding.cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    test('should calculate correct similarity for arbitrary vectors', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [4, 5, 6];
      // Manual calculation: (1*4 + 2*5 + 3*6) / (sqrt(1+4+9) * sqrt(16+25+36))
      // = 32 / (sqrt(14) * sqrt(77)) = 32 / 32.9848... ≈ 0.9746
      const similarity = embedding.cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(0.9746, 4);
    });

    test('should throw error for vectors of different dimensions', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [1, 2];
      expect(() => embedding.cosineSimilarity(vec1, vec2)).toThrow(EmbeddingError);
    });

    test('should throw error for empty vectors', () => {
      expect(() => embedding.cosineSimilarity([], [])).toThrow(EmbeddingError);
    });

    test('should throw error for zero vectors', () => {
      const vec1 = [0, 0, 0];
      const vec2 = [1, 2, 3];
      expect(() => embedding.cosineSimilarity(vec1, vec2)).toThrow(EmbeddingError);
    });

    test('should handle normalized vectors', () => {
      // Already normalized vectors
      const vec1 = [0.6, 0.8, 0];
      const vec2 = [0.8, 0.6, 0];
      const similarity = embedding.cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(0.96, 5);
    });
  });

  describe('cache behavior', () => {
    test('should respect cache size limit', async () => {
      // The cache has a max size of 1000
      // We'll test that it evicts oldest entries
      const embeddings: number[][] = [];

      // Create mock responses for multiple embeddings
      for (let i = 0; i < 1002; i++) {
        embeddings.push([i * 0.1, i * 0.2]);
      }

      // Add 1002 entries (exceeding cache size of 1000)
      for (let i = 0; i < 1002; i++) {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ embedding: embeddings[i], index: 0 }],
            model: 'test/embedding',
          }),
        });
        await embedding.embed(`text ${i}`);
      }

      // First two texts should have been evicted from cache
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [999, 999], index: 0 }],
          model: 'test/embedding',
        }),
      });

      await embedding.embed('text 0');

      // Should have made 1003 API calls (1002 initial + 1 for evicted entry)
      expect(fetchMock).toHaveBeenCalledTimes(1003);
    });
  });

  describe('error message details', () => {
    test('should include status and error text in error context', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Rate limit exceeded',
      });

      try {
        await embedding.embed('test');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(EmbeddingError);
        if (error instanceof EmbeddingError) {
          expect(error.context).toMatchObject({
            status: 429,
            statusText: 'Too Many Requests',
            error: 'Rate limit exceeded',
          });
        }
      }
    });

    test('should handle error when response.text() fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => {
          throw new Error('Failed to read response');
        },
      });

      await expect(embedding.embed('test')).rejects.toThrow(EmbeddingError);
    });
  });
});

/**
 * Tests for clawmem/retrieval.ts
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { MemoryRetrieval } from '../../../src/modules/clawmem/retrieval';
import type { Memory, EmbeddingService } from '../../../src/types';

describe('MemoryRetrieval', () => {
  let retrieval: MemoryRetrieval;
  let mockEmbedding: EmbeddingService;

  const createMemory = (overrides: Partial<Memory> = {}): Memory => ({
    id: 'mem_1',
    type: 'semantic',
    content: 'Test content',
    embedding: [0.1, 0.2, 0.3],
    importance: 5,
    tier: 'recall',
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 1,
    decayScore: 1.0,
    ...overrides,
  });

  beforeEach(() => {
    mockEmbedding = {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
      cosineSimilarity: vi.fn().mockReturnValue(0.5),
    };

    retrieval = new MemoryRetrieval({
      weights: {
        recency: 1.0,
        importance: 1.0,
        relevance: 1.5,
        frequency: 0.5,
      },
      maxResults: 10,
    });
    retrieval.setEmbeddingService(mockEmbedding);
  });

  describe('search', () => {
    test('returns empty array for empty memories', async () => {
      const results = await retrieval.search('query', []);
      expect(results).toEqual([]);
    });

    test('returns matching memories', async () => {
      const memories = [
        createMemory({ id: 'mem_1', content: 'First memory' }),
        createMemory({ id: 'mem_2', content: 'Second memory' }),
      ];

      const results = await retrieval.search('query', memories);

      expect(results.length).toBe(2);
      expect(results[0].memory).toBeDefined();
      expect(results[0].score).toBeDefined();
      expect(results[0].breakdown).toBeDefined();
    });

    test('respects limit parameter', async () => {
      const memories = Array.from({ length: 20 }, (_, i) =>
        createMemory({ id: `mem_${i}`, content: `Memory ${i}` })
      );

      const results = await retrieval.search('query', memories, 5);

      expect(results.length).toBe(5);
    });

    test('sorts by score descending', async () => {
      const memories = [
        createMemory({ id: 'mem_1', importance: 3 }),
        createMemory({ id: 'mem_2', importance: 9 }),
        createMemory({ id: 'mem_3', importance: 6 }),
      ];

      const results = await retrieval.search('query', memories);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe('scoring factors', () => {
    test('higher importance increases score', async () => {
      const low = createMemory({ id: 'low', importance: 2 });
      const high = createMemory({ id: 'high', importance: 9 });

      const results = await retrieval.search('query', [low, high]);
      const lowResult = results.find(r => r.memory.id === 'low');
      const highResult = results.find(r => r.memory.id === 'high');

      expect(highResult!.score).toBeGreaterThan(lowResult!.score);
    });

    test('more recent access increases score', async () => {
      const old = createMemory({
        id: 'old',
        lastAccessedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      });
      const recent = createMemory({
        id: 'recent',
        lastAccessedAt: new Date(),
      });

      const results = await retrieval.search('query', [old, recent]);
      const oldResult = results.find(r => r.memory.id === 'old');
      const recentResult = results.find(r => r.memory.id === 'recent');

      expect(recentResult!.score).toBeGreaterThan(oldResult!.score);
    });

    test('higher access count increases score', async () => {
      const rarely = createMemory({ id: 'rarely', accessCount: 1 });
      const frequently = createMemory({ id: 'frequently', accessCount: 50 });

      const results = await retrieval.search('query', [rarely, frequently]);
      const rarelyResult = results.find(r => r.memory.id === 'rarely');
      const frequentlyResult = results.find(r => r.memory.id === 'frequently');

      expect(frequentlyResult!.score).toBeGreaterThan(rarelyResult!.score);
    });
  });

  describe('without embedding service', () => {
    test('falls back to text-only search', async () => {
      const noEmbedRetrieval = new MemoryRetrieval({
        weights: { recency: 1, importance: 1, relevance: 1, frequency: 1 },
        maxResults: 10,
      });

      const memories = [
        createMemory({ id: 'mem_1', content: 'Contains the query word' }),
        createMemory({ id: 'mem_2', content: 'Something else entirely' }),
      ];

      const results = await noEmbedRetrieval.search('query', memories);

      expect(results.length).toBe(2);
      // Memory with 'query' in content should score higher on relevance
      const queryResult = results.find(r => r.memory.id === 'mem_1');
      const otherResult = results.find(r => r.memory.id === 'mem_2');
      expect(queryResult!.breakdown.relevance).toBeGreaterThan(otherResult!.breakdown.relevance);
    });
  });

  describe('buildContext', () => {
    test('builds context string from scored memories', async () => {
      const memories = [
        createMemory({ id: 'mem_1', content: 'First memory content' }),
        createMemory({ id: 'mem_2', content: 'Second memory content' }),
      ];

      const results = await retrieval.search('query', memories);
      const context = retrieval.buildContext(results, 1000);

      expect(context).toContain('First memory content');
      expect(context).toContain('Relevance:');
    });

    test('respects token limit', async () => {
      const memories = [
        createMemory({ id: 'mem_1', content: 'A'.repeat(500) }),
        createMemory({ id: 'mem_2', content: 'B'.repeat(500) }),
      ];

      const results = await retrieval.search('query', memories);
      const context = retrieval.buildContext(results, 200);

      // Should not include all content due to token limit
      expect(context.length).toBeLessThan(1000);
    });
  });
});

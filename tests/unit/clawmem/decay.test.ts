/**
 * Tests for clawmem/decay.ts
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { DecayCalculator } from '../../../src/modules/clawmem/decay';
import type { Memory } from '../../../src/types';

describe('DecayCalculator', () => {
  let decay: DecayCalculator;

  const createMemory = (overrides: Partial<Memory> = {}): Memory => ({
    id: 'mem_1',
    type: 'semantic',
    content: 'Test content',
    embedding: [],
    importance: 5,
    tier: 'recall',
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 1,
    decayScore: 1.0,
    ...overrides,
  });

  beforeEach(() => {
    decay = new DecayCalculator({
      enabled: true,
      halfLifeHours: 168, // 1 week
      minImportanceForNoDecay: 8,
      pruneThreshold: 0.05,
    });
  });

  describe('calculate', () => {
    test('returns 1.0 for just-accessed memory', () => {
      const memory = createMemory({ lastAccessedAt: new Date() });
      const score = decay.calculate(memory);
      expect(score).toBeCloseTo(1.0, 1);
    });

    test('decays over time', () => {
      const oneWeekAgo = new Date(Date.now() - 168 * 60 * 60 * 1000);
      const memory = createMemory({ lastAccessedAt: oneWeekAgo });
      const score = decay.calculate(memory);

      // After one half-life, should be around 0.5 (plus bonuses)
      expect(score).toBeLessThan(1.0);
      expect(score).toBeGreaterThan(0.3);
    });

    test('high importance prevents decay', () => {
      const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
      const highImportance = createMemory({ lastAccessedAt: longAgo, importance: 9 });

      const score = decay.calculate(highImportance);
      expect(score).toBe(1.0); // No decay for importance >= 8
    });

    test('low importance decays more than moderate', () => {
      const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const lowImportance = createMemory({ lastAccessedAt: longAgo, importance: 2 });
      const moderateImportance = createMemory({ lastAccessedAt: longAgo, importance: 6 });

      const lowScore = decay.calculate(lowImportance);
      const moderateScore = decay.calculate(moderateImportance);

      expect(moderateScore).toBeGreaterThan(lowScore);
    });

    test('frequent access slows decay', () => {
      const weekAgo = new Date(Date.now() - 168 * 60 * 60 * 1000);
      const singleAccess = createMemory({ lastAccessedAt: weekAgo, accessCount: 1 });
      const frequentAccess = createMemory({ lastAccessedAt: weekAgo, accessCount: 10 });

      const singleScore = decay.calculate(singleAccess);
      const frequentScore = decay.calculate(frequentAccess);

      expect(frequentScore).toBeGreaterThan(singleScore);
    });
  });

  describe('shouldPrune', () => {
    test('returns true when decay below threshold', () => {
      // Create very old memory with low importance
      const veryOld = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year
      const memory = createMemory({ lastAccessedAt: veryOld, importance: 1, accessCount: 1 });

      expect(decay.shouldPrune(memory)).toBe(true);
    });

    test('returns false when decay above threshold', () => {
      const memory = createMemory({ decayScore: 0.5 });
      expect(decay.shouldPrune(memory)).toBe(false);
    });

    test('respects importance for no-decay', () => {
      const veryOld = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const memory = createMemory({ lastAccessedAt: veryOld, importance: 9 });
      expect(decay.shouldPrune(memory)).toBe(false);
    });
  });

  describe('updateAll', () => {
    test('updates decay scores for all memories', () => {
      const memories = [
        createMemory({ id: 'mem_1' }),
        createMemory({ id: 'mem_2' }),
      ];

      const updated = decay.updateAll(memories);

      expect(updated).toHaveLength(2);
      expect(updated[0].decayScore).toBeDefined();
      expect(updated[1].decayScore).toBeDefined();
    });
  });

  describe('getPruneList', () => {
    test('returns memories that should be pruned', () => {
      const veryOld = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const memories = [
        createMemory({ id: 'old', lastAccessedAt: veryOld, importance: 1 }),
        createMemory({ id: 'recent', lastAccessedAt: new Date() }),
      ];

      const toDelete = decay.getPruneList(memories);

      expect(toDelete.some(m => m.id === 'old')).toBe(true);
      expect(toDelete.some(m => m.id === 'recent')).toBe(false);
    });
  });

  describe('boost', () => {
    test('returns high score after boost', () => {
      const oldMemory = createMemory({
        lastAccessedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });

      const boostedScore = decay.boost(oldMemory);

      expect(boostedScore).toBeCloseTo(1.0, 1);
    });
  });

  describe('disabled decay', () => {
    test('returns 1.0 when decay disabled', () => {
      const disabledDecay = new DecayCalculator({
        enabled: false,
        halfLifeHours: 168,
        minImportanceForNoDecay: 8,
        pruneThreshold: 0.05,
      });

      const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const memory = createMemory({ lastAccessedAt: longAgo });
      const score = disabledDecay.calculate(memory);

      expect(score).toBe(1.0);
    });
  });
});

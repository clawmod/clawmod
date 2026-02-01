/**
 * Tests for clawmem/contradiction.ts
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ContradictionDetector } from '../../../src/modules/clawmem/contradiction';
import type { Memory, TieredLLM } from '../../../src/types';

describe('ContradictionDetector', () => {
  let detector: ContradictionDetector;
  let mockLlm: TieredLLM;

  const createMemory = (content: string, id: string = 'mem_1'): Memory => ({
    id,
    type: 'semantic',
    content,
    embedding: [0.1, 0.2, 0.3],
    importance: 5,
    tier: 'recall',
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 1,
    decayScore: 1.0,
  });

  beforeEach(() => {
    mockLlm = {
      scoring: vi.fn().mockResolvedValue('5'),
      extraction: vi.fn().mockResolvedValue('{"isConflict": false, "type": "none", "resolution": "none", "explanation": "No conflict"}'),
      powerful: vi.fn().mockResolvedValue('response'),
    };

    detector = new ContradictionDetector({
      enabled: true,
      similarityThreshold: 0.8,
      autoResolve: false,
    });
    detector.setLLM(mockLlm);
  });

  describe('detect', () => {
    test('returns no conflict for unrelated content', async () => {
      const existing = createMemory('The sky is blue');
      const result = await detector.detect(existing, 'Grass is green');

      expect(result.isConflict).toBe(false);
    });

    test('detects conflict when LLM identifies one', async () => {
      (mockLlm.extraction as ReturnType<typeof vi.fn>).mockResolvedValue(
        '{"isConflict": true, "type": "contradiction", "resolution": "flag", "explanation": "Conflicting colors"}'
      );

      const existing = createMemory('The sky is blue');
      const result = await detector.detect(existing, 'The sky is green');

      expect(result.isConflict).toBe(true);
      expect(result.type).toBe('contradiction');
    });

    test('includes memory and new content in result', async () => {
      const existing = createMemory('Original content');
      const result = await detector.detect(existing, 'New content');

      expect(result.existingMemory).toBe(existing);
      expect(result.newContent).toBe('New content');
    });

    test('handles malformed LLM response', async () => {
      (mockLlm.extraction as ReturnType<typeof vi.fn>).mockResolvedValue('not valid json');

      const existing = createMemory('Some content');
      const result = await detector.detect(existing, 'Other content');

      expect(result.isConflict).toBe(false);
      expect(result.explanation).toContain('Could not determine');
    });
  });

  describe('findConflicts', () => {
    test('returns empty array when no conflicts', async () => {
      const memories = [
        createMemory('Memory A', 'mem_1'),
        createMemory('Memory B', 'mem_2'),
      ];

      const conflicts = await detector.findConflicts('New content', memories);

      expect(conflicts).toEqual([]);
    });

    test('returns conflicts when found', async () => {
      (mockLlm.extraction as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('{"isConflict": true, "type": "contradiction", "resolution": "flag", "explanation": "Conflict 1"}')
        .mockResolvedValueOnce('{"isConflict": false}');

      const memories = [
        createMemory('Memory A', 'mem_1'),
        createMemory('Memory B', 'mem_2'),
      ];

      const conflicts = await detector.findConflicts('Conflicting content', memories);

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].existingMemory.id).toBe('mem_1');
    });
  });

  describe('resolve', () => {
    test('returns null when no conflict', async () => {
      const result = {
        isConflict: false,
        type: 'none' as const,
        resolution: 'none' as const,
        explanation: '',
        existingMemory: createMemory('content'),
        newContent: 'new',
      };

      const resolved = await detector.resolve(result);
      expect(resolved).toBeNull();
    });

    test('returns null when autoResolve disabled', async () => {
      const result = {
        isConflict: true,
        type: 'contradiction' as const,
        resolution: 'replace' as const,
        explanation: 'conflict',
        existingMemory: createMemory('content'),
        newContent: 'new',
      };

      const resolved = await detector.resolve(result);
      expect(resolved).toBeNull();
    });

    test('replaces content when resolution is replace', async () => {
      const autoResolver = new ContradictionDetector({
        enabled: true,
        similarityThreshold: 0.8,
        autoResolve: true,
      });

      const result = {
        isConflict: true,
        type: 'update' as const,
        resolution: 'replace' as const,
        explanation: 'Update',
        existingMemory: createMemory('old content'),
        newContent: 'new content',
      };

      const resolved = await autoResolver.resolve(result);

      expect(resolved).not.toBeNull();
      expect(resolved!.content).toBe('new content');
    });

    test('merges content when resolution is merge', async () => {
      const autoResolver = new ContradictionDetector({
        enabled: true,
        similarityThreshold: 0.8,
        autoResolve: true,
      });

      const result = {
        isConflict: true,
        type: 'refinement' as const,
        resolution: 'merge' as const,
        explanation: 'Merge needed',
        existingMemory: createMemory('old content'),
        newContent: 'new content',
      };

      const resolved = await autoResolver.resolve(result);

      expect(resolved).not.toBeNull();
      expect(resolved!.content).toContain('old content');
      expect(resolved!.content).toContain('new content');
    });
  });

  describe('disabled detector', () => {
    test('returns no conflict when disabled', async () => {
      const disabledDetector = new ContradictionDetector({
        enabled: false,
        similarityThreshold: 0.8,
        autoResolve: false,
      });

      const existing = createMemory('The sky is blue');
      const result = await disabledDetector.detect(existing, 'The sky is green');

      expect(result.isConflict).toBe(false);
      expect(result.explanation).toContain('disabled');
    });
  });

  describe('without LLM', () => {
    test('returns no conflict when LLM not set', async () => {
      const noLlmDetector = new ContradictionDetector({
        enabled: true,
        similarityThreshold: 0.8,
        autoResolve: false,
      });

      const existing = createMemory('content');
      const result = await noLlmDetector.detect(existing, 'other');

      expect(result.isConflict).toBe(false);
      expect(result.explanation).toContain('No LLM');
    });
  });
});

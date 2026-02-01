/**
 * Tests for MemoryManager
 *
 * Tests the unified API for all memory tiers
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { MemoryManager } from '../../../src/modules/clawmem/manager';
import type { MemoryType } from '../../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('MemoryManager', () => {
  let manager: MemoryManager;
  let testBaseDir: string;

  beforeEach(async () => {
    testBaseDir = path.join(os.tmpdir(), `clawmod-manager-test-${Date.now()}`);
    manager = new MemoryManager({
      coreDir: path.join(testBaseDir, 'core'),
      recallDir: path.join(testBaseDir, 'recall'),
      archivalDir: path.join(testBaseDir, 'archival'),
      core: {
        maxTokens: 2000,
        files: ['persona.md', 'user_profile.md', 'current_goals.md'],
      },
      recall: {
        maxItems: 100,
        embeddingThreshold: 0.7,
      },
      archival: {
        retentionDays: 30,
        compression: true,
      },
    });
    await manager.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  describe('initialization', () => {
    test('initializes all storage tiers', async () => {
      const coreStats = await fs.stat(path.join(testBaseDir, 'core'));
      const recallStats = await fs.stat(path.join(testBaseDir, 'recall'));
      const archivalStats = await fs.stat(path.join(testBaseDir, 'archival'));

      expect(coreStats.isDirectory()).toBe(true);
      expect(recallStats.isDirectory()).toBe(true);
      expect(archivalStats.isDirectory()).toBe(true);
    });

    test('loads existing core files', async () => {
      const content = await manager.getCoreMemory('persona.md');
      expect(content).toBe('');
    });
  });

  describe('core memory operations', () => {
    test('gets core memory file', async () => {
      await manager.setCoreMemory('persona.md', 'Test persona');
      const content = await manager.getCoreMemory('persona.md');
      expect(content).toBe('Test persona');
    });

    test('sets core memory file', async () => {
      await manager.setCoreMemory('user_profile.md', 'User: Bob');
      const content = await manager.getCoreMemory('user_profile.md');
      expect(content).toBe('User: Bob');
    });

    test('returns undefined for non-existent file', async () => {
      const content = await manager.getCoreMemory('nonexistent.md');
      expect(content).toBeUndefined();
    });

    test('builds core context', async () => {
      await manager.setCoreMemory('persona.md', 'I am helpful');
      await manager.setCoreMemory('current_goals.md', 'Build software');

      const context = manager.getCoreContext();
      expect(context).toContain('## persona.md');
      expect(context).toContain('I am helpful');
      expect(context).toContain('## current_goals.md');
      expect(context).toContain('Build software');
    });
  });

  describe('recall memory operations', () => {
    test('stores memory with generated ID', async () => {
      const memory = await manager.store('Important fact', 'semantic', 7);

      expect(memory.id).toMatch(/^mem_[a-f0-9]{24}$/);
      expect(memory.content).toBe('Important fact');
      expect(memory.type).toBe('semantic');
      expect(memory.importance).toBe(7);
      expect(memory.tier).toBe('recall');
    });

    test('sets initial memory properties', async () => {
      const before = Date.now();
      const memory = await manager.store('Test', 'episodic', 5);

      expect(memory.accessCount).toBe(0);
      expect(memory.decayScore).toBe(1.0);
      expect(memory.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(memory.lastAccessedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    test('stores metadata', async () => {
      const metadata = { source: 'test', tags: ['important'] };
      const memory = await manager.store('Test', 'semantic', 5, metadata);

      expect(memory.metadata).toEqual(metadata);
    });

    test('gets memory by ID', async () => {
      const stored = await manager.store('Test', 'semantic', 5);
      const retrieved = await manager.get(stored.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(stored.id);
      expect(retrieved?.content).toBe('Test');
    });

    test('returns undefined for non-existent ID', async () => {
      const retrieved = await manager.get('mem_nonexistent123');
      expect(retrieved).toBeUndefined();
    });

    test('updates memory', async () => {
      const stored = await manager.store('Original', 'semantic', 5);
      await manager.update(stored.id, { importance: 9 });

      const updated = await manager.get(stored.id);
      expect(updated?.importance).toBe(9);
    });

    test('deletes memory', async () => {
      const stored = await manager.store('Test', 'semantic', 5);
      const deleted = await manager.delete(stored.id);

      expect(deleted).toBe(true);
      expect(await manager.get(stored.id)).toBeUndefined();
    });

    test('returns false when deleting non-existent memory', async () => {
      const deleted = await manager.delete('mem_nonexistent123');
      expect(deleted).toBe(false);
    });

    test('gets all recall memories', async () => {
      await manager.store('Memory 1', 'semantic', 5);
      await manager.store('Memory 2', 'episodic', 6);
      await manager.store('Memory 3', 'procedural', 4);

      const memories = manager.getRecallMemories();
      expect(memories).toHaveLength(3);
    });

    test('searches recall memories', async () => {
      await manager.store('The quick brown fox', 'semantic', 5);
      await manager.store('The lazy dog', 'semantic', 5);
      await manager.store('A cat sat', 'semantic', 5);

      const results = await manager.searchRecall('quick');
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain('quick');
    });

    test('searches with limit', async () => {
      for (let i = 0; i < 5; i++) {
        await manager.store(`Memory ${i}`, 'semantic', 5);
      }

      const results = await manager.searchRecall('Memory', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('archival memory operations', () => {
    test('archives session transcript', async () => {
      const now = new Date();
      const transcript = {
        sessionId: 'sess_123',
        startedAt: now,
        endedAt: now,
        messages: [
          { role: 'user' as const, content: 'Hello', timestamp: now },
          { role: 'assistant' as const, content: 'Hi', timestamp: now },
        ],
      };

      const filename = await manager.archiveSession(transcript);
      // Format: YYYY-MM-DD-HH-MM.jsonl.gz
      expect(filename).toMatch(/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.jsonl\.gz/);
    });

    test('searches archival memories', async () => {
      const now = new Date();
      const transcript = {
        sessionId: 'sess_search',
        startedAt: now,
        endedAt: now,
        messages: [{ role: 'user' as const, content: 'unique keyword here', timestamp: now }],
      };

      await manager.archiveSession(transcript);
      const results = await manager.searchArchival('unique');

      expect(results.length).toBeGreaterThan(0);
    });

    test('searches archival with limit', async () => {
      for (let i = 0; i < 3; i++) {
        const timestamp = new Date(`2024-01-0${i + 1}T10:00:00Z`);
        const transcript = {
          sessionId: `sess_${i}`,
          startedAt: timestamp,
          endedAt: timestamp,
          messages: [{ role: 'user' as const, content: 'test message', timestamp }],
        };
        await manager.archiveSession(transcript);
      }

      const results = await manager.searchArchival('test', 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('maintenance', () => {
    test('cleanup removes old archives', async () => {
      const count = await manager.cleanup();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('getStats returns statistics', async () => {
      await manager.setCoreMemory('persona.md', 'x'.repeat(400)); // 100 tokens
      await manager.store('Memory 1', 'semantic', 5);
      await manager.store('Memory 2', 'semantic', 5);

      const stats = manager.getStats();
      expect(stats.coreTokens).toBe(100);
      expect(stats.recallCount).toBe(2);
      expect(stats.archiveCount).toBe(0);
    });
  });

  describe('memory type handling', () => {
    const types: MemoryType[] = ['episodic', 'semantic', 'procedural', 'session_summary'];

    test.each(types)('stores %s type memory', async (type) => {
      const memory = await manager.store('Test content', type, 5);
      expect(memory.type).toBe(type);
    });

    test('persists different types correctly', async () => {
      await manager.store('Episodic memory', 'episodic', 5);
      await manager.store('Semantic memory', 'semantic', 6);
      await manager.store('Procedural memory', 'procedural', 7);
      await manager.store('Summary memory', 'session_summary', 8);

      const memories = manager.getRecallMemories();
      expect(memories.some((m) => m.type === 'episodic')).toBe(true);
      expect(memories.some((m) => m.type === 'semantic')).toBe(true);
      expect(memories.some((m) => m.type === 'procedural')).toBe(true);
      expect(memories.some((m) => m.type === 'session_summary')).toBe(true);
    });
  });

  describe('ID generation', () => {
    test('generates unique IDs', async () => {
      const mem1 = await manager.store('Test 1', 'semantic', 5);
      const mem2 = await manager.store('Test 2', 'semantic', 5);
      const mem3 = await manager.store('Test 3', 'semantic', 5);

      expect(mem1.id).not.toBe(mem2.id);
      expect(mem2.id).not.toBe(mem3.id);
      expect(mem1.id).not.toBe(mem3.id);
    });

    test('IDs have correct format', async () => {
      const memory = await manager.store('Test', 'semantic', 5);
      expect(memory.id).toMatch(/^mem_[a-f0-9]{24}$/);
    });

    test('generates many unique IDs', async () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const memory = await manager.store(`Test ${i}`, 'semantic', 5);
        ids.add(memory.id);
      }
      expect(ids.size).toBe(50);
    });
  });

  describe('persistence', () => {
    test('persists memories across manager instances', async () => {
      await manager.store('Persisted memory', 'semantic', 8);

      const newManager = new MemoryManager({
        coreDir: path.join(testBaseDir, 'core'),
        recallDir: path.join(testBaseDir, 'recall'),
        archivalDir: path.join(testBaseDir, 'archival'),
        core: {
          maxTokens: 2000,
          files: ['persona.md', 'user_profile.md', 'current_goals.md'],
        },
        recall: {
          maxItems: 100,
          embeddingThreshold: 0.7,
        },
        archival: {
          retentionDays: 30,
          compression: true,
        },
      });
      await newManager.initialize();

      const memories = newManager.getRecallMemories();
      expect(memories.some((m) => m.content === 'Persisted memory')).toBe(true);
    });

    test('persists core memory across instances', async () => {
      await manager.setCoreMemory('persona.md', 'Persistent persona');

      const newManager = new MemoryManager({
        coreDir: path.join(testBaseDir, 'core'),
        recallDir: path.join(testBaseDir, 'recall'),
        archivalDir: path.join(testBaseDir, 'archival'),
        core: {
          maxTokens: 2000,
          files: ['persona.md', 'user_profile.md', 'current_goals.md'],
        },
        recall: {
          maxItems: 100,
          embeddingThreshold: 0.7,
        },
        archival: {
          retentionDays: 30,
          compression: true,
        },
      });
      await newManager.initialize();

      const content = await newManager.getCoreMemory('persona.md');
      expect(content).toBe('Persistent persona');
    });
  });

  describe('edge cases', () => {
    test('handles empty content', async () => {
      const memory = await manager.store('', 'semantic', 5);
      expect(memory.content).toBe('');
    });

    test('handles very long content', async () => {
      const longContent = 'x'.repeat(10000);
      const memory = await manager.store(longContent, 'semantic', 5);
      expect(memory.content).toBe(longContent);
    });

    test('handles importance boundaries', async () => {
      const minMemory = await manager.store('Min', 'semantic', 1);
      const maxMemory = await manager.store('Max', 'semantic', 10);

      expect(minMemory.importance).toBe(1);
      expect(maxMemory.importance).toBe(10);
    });

    test('handles special characters in content', async () => {
      const special = 'Test\n\t"quotes"\r\n\\backslash\\';
      const memory = await manager.store(special, 'semantic', 5);
      expect(memory.content).toBe(special);
    });

    test('handles unicode content', async () => {
      const unicode = '🚀 Unicode test 中文 العربية';
      const memory = await manager.store(unicode, 'semantic', 5);
      expect(memory.content).toBe(unicode);
    });
  });
});

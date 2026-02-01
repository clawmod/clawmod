/**
 * Tests for ClawMem Storage Tiers
 *
 * Tests CoreMemoryStorage, RecallMemoryStorage, and ArchivalMemoryStorage
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { CoreMemoryStorage } from '../../../src/modules/clawmem/storage/core';
import { RecallMemoryStorage } from '../../../src/modules/clawmem/storage/recall';
import { ArchivalMemoryStorage } from '../../../src/modules/clawmem/storage/archival';
import type { Memory } from '../../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('CoreMemoryStorage', () => {
  let storage: CoreMemoryStorage;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `clawmod-core-test-${Date.now()}`);
    storage = new CoreMemoryStorage({
      coreDir: testDir,
      maxTokens: 2000,
      files: ['persona.md', 'user_profile.md', 'current_goals.md'],
    });
    await storage.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  describe('initialization', () => {
    test('creates core directory', async () => {
      const stats = await fs.stat(testDir);
      expect(stats.isDirectory()).toBe(true);
    });

    test('loads all core files', () => {
      const files = storage.getAll();
      expect(files).toHaveLength(3);
      expect(files.map((f) => f.name)).toEqual([
        'persona.md',
        'user_profile.md',
        'current_goals.md',
      ]);
    });

    test('initializes empty files if not exist', () => {
      const files = storage.getAll();
      for (const file of files) {
        expect(file.content).toBe('');
        expect(file.tokens).toBe(0);
      }
    });
  });

  describe('get/set', () => {
    test('gets file content', async () => {
      await storage.set('persona.md', '# My Persona\nI am helpful.');
      const content = await storage.get('persona.md');
      expect(content).toBe('# My Persona\nI am helpful.');
    });

    test('returns undefined for non-existent file', async () => {
      const content = await storage.get('nonexistent.md');
      expect(content).toBeUndefined();
    });

    test('sets file content and persists to disk', async () => {
      await storage.set('persona.md', 'Test content');
      const diskContent = await fs.readFile(
        path.join(testDir, 'persona.md'),
        'utf-8'
      );
      expect(diskContent).toBe('Test content');
    });

    test('updates existing file content', async () => {
      await storage.set('persona.md', 'Initial');
      await storage.set('persona.md', 'Updated');
      const content = await storage.get('persona.md');
      expect(content).toBe('Updated');
    });
  });

  describe('token counting', () => {
    test('counts tokens approximately (4 chars = 1 token)', async () => {
      const content = 'a'.repeat(400); // 400 chars = 100 tokens
      await storage.set('persona.md', content);
      const files = storage.getAll();
      const persona = files.find((f) => f.name === 'persona.md');
      expect(persona?.tokens).toBe(100);
    });

    test('getTotalTokens sums all files', async () => {
      await storage.set('persona.md', 'a'.repeat(400)); // 100 tokens
      await storage.set('user_profile.md', 'b'.repeat(800)); // 200 tokens
      await storage.set('current_goals.md', 'c'.repeat(400)); // 100 tokens
      expect(storage.getTotalTokens()).toBe(400);
    });

    test('throws error if maxTokens exceeded', async () => {
      const content = 'x'.repeat(8001); // 2001 tokens
      await expect(storage.set('persona.md', content)).rejects.toThrow(
        /exceed max tokens/
      );
    });

    test('allows update within token limit', async () => {
      await storage.set('persona.md', 'a'.repeat(4000)); // 1000 tokens
      await storage.set('persona.md', 'b'.repeat(8000)); // 2000 tokens (replacing)
      expect(storage.getTotalTokens()).toBe(2000);
    });
  });

  describe('append', () => {
    test('appends to existing content', async () => {
      await storage.set('persona.md', 'Initial\n');
      await storage.append('persona.md', 'Appended');
      const content = await storage.get('persona.md');
      expect(content).toBe('Initial\nAppended');
    });

    test('creates file if not exists', async () => {
      const newStorage = new CoreMemoryStorage({
        coreDir: testDir,
        maxTokens: 2000,
        files: ['new.md'],
      });
      await newStorage.initialize();
      await newStorage.append('new.md', 'Content');
      const content = await newStorage.get('new.md');
      expect(content).toBe('Content');
    });

    test('throws if append exceeds token limit', async () => {
      await storage.set('persona.md', 'a'.repeat(7000)); // 1750 tokens
      await expect(storage.append('persona.md', 'b'.repeat(1100))).rejects.toThrow(
        /exceed max tokens/
      );
    });
  });

  describe('buildContext', () => {
    test('builds formatted context from all files', async () => {
      await storage.set('persona.md', 'I am helpful');
      await storage.set('user_profile.md', 'User: Alice');
      await storage.set('current_goals.md', 'Build ClawMod');

      const context = storage.buildContext();
      expect(context).toContain('## persona.md');
      expect(context).toContain('I am helpful');
      expect(context).toContain('## user_profile.md');
      expect(context).toContain('User: Alice');
      expect(context).toContain('## current_goals.md');
      expect(context).toContain('Build ClawMod');
    });

    test('skips empty files', async () => {
      await storage.set('persona.md', 'Content');
      const context = storage.buildContext();
      expect(context).toContain('## persona.md');
      expect(context).not.toContain('## user_profile.md');
      expect(context).not.toContain('## current_goals.md');
    });

    test('separates files with double newlines', async () => {
      await storage.set('persona.md', 'A');
      await storage.set('user_profile.md', 'B');
      const context = storage.buildContext();
      expect(context).toBe('## persona.md\nA\n\n## user_profile.md\nB');
    });
  });

  describe('getAll', () => {
    test('returns all core memory files', () => {
      const files = storage.getAll();
      expect(files).toHaveLength(3);
      for (const file of files) {
        expect(file).toHaveProperty('name');
        expect(file).toHaveProperty('content');
        expect(file).toHaveProperty('tokens');
      }
    });

    test('includes updated content', async () => {
      await storage.set('persona.md', 'Updated');
      const files = storage.getAll();
      const persona = files.find((f) => f.name === 'persona.md');
      expect(persona?.content).toBe('Updated');
    });
  });
});

describe('RecallMemoryStorage', () => {
  let storage: RecallMemoryStorage;
  let testDir: string;

  const createMemory = (id: string, overrides?: Partial<Memory>): Memory => ({
    id,
    type: 'semantic',
    content: `Test memory ${id}`,
    embedding: [0.1, 0.2, 0.3],
    importance: 5,
    tier: 'recall',
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 0,
    decayScore: 1.0,
    ...overrides,
  });

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `clawmod-recall-test-${Date.now()}`);
    storage = new RecallMemoryStorage({
      recallDir: testDir,
      maxItems: 10,
      embeddingThreshold: 0.7,
    });
    await storage.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  describe('initialization', () => {
    test('creates recall directory', async () => {
      const stats = await fs.stat(testDir);
      expect(stats.isDirectory()).toBe(true);
    });

    test('loads from disk on init', async () => {
      const mem = createMemory('mem_1');
      await storage.store(mem);

      const newStorage = new RecallMemoryStorage({
        recallDir: testDir,
        maxItems: 10,
        embeddingThreshold: 0.7,
      });
      await newStorage.initialize();

      const loaded = await newStorage.get('mem_1');
      expect(loaded).toBeDefined();
      expect(loaded?.content).toBe('Test memory mem_1');
    });

    test('handles missing files gracefully', async () => {
      expect(storage.count()).toBe(0);
    });
  });

  describe('store', () => {
    test('stores memory in map and disk', async () => {
      const mem = createMemory('mem_1');
      await storage.store(mem);

      const retrieved = await storage.get('mem_1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('mem_1');
    });

    test('persists to facts.jsonl for non-summary memories', async () => {
      const mem = createMemory('mem_1', { type: 'semantic' });
      await storage.store(mem);

      const factsFile = await fs.readFile(
        path.join(testDir, 'facts.jsonl'),
        'utf-8'
      );
      expect(factsFile).toContain('mem_1');
    });

    test('persists to summaries.jsonl for session_summary', async () => {
      const mem = createMemory('mem_1', { type: 'session_summary' });
      await storage.store(mem);

      const summariesFile = await fs.readFile(
        path.join(testDir, 'summaries.jsonl'),
        'utf-8'
      );
      expect(summariesFile).toContain('mem_1');
    });

    test('prunes when maxItems reached', async () => {
      // Fill to max
      for (let i = 0; i < 10; i++) {
        await storage.store(createMemory(`mem_${i}`, { importance: i + 1 }));
      }

      // Store one more - should prune lowest importance
      await storage.store(createMemory('mem_10', { importance: 10 }));

      expect(storage.count()).toBe(10);
      expect(await storage.get('mem_0')).toBeUndefined(); // Lowest importance
    });
  });

  describe('get', () => {
    test('retrieves memory by id', async () => {
      const mem = createMemory('mem_1');
      await storage.store(mem);
      const retrieved = await storage.get('mem_1');
      expect(retrieved?.id).toBe('mem_1');
    });

    test('returns undefined for non-existent memory', async () => {
      const retrieved = await storage.get('nonexistent');
      expect(retrieved).toBeUndefined();
    });

    test('increments access count on get', async () => {
      const mem = createMemory('mem_1');
      await storage.store(mem);

      await storage.get('mem_1');
      const retrieved = await storage.get('mem_1');
      expect(retrieved?.accessCount).toBe(2);
    });

    test('updates lastAccessedAt on get', async () => {
      const mem = createMemory('mem_1');
      await storage.store(mem);

      const before = new Date();
      await storage.get('mem_1');
      const retrieved = await storage.get('mem_1');

      expect(retrieved?.lastAccessedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
    });
  });

  describe('update', () => {
    test('updates memory fields', async () => {
      const mem = createMemory('mem_1');
      await storage.store(mem);

      await storage.update('mem_1', { importance: 9 });
      const updated = await storage.get('mem_1');
      expect(updated?.importance).toBe(9);
    });

    test('throws on update of non-existent memory', async () => {
      await expect(
        storage.update('nonexistent', { importance: 5 })
      ).rejects.toThrow(/not found/);
    });

    test('persists update to disk', async () => {
      const mem = createMemory('mem_1');
      await storage.store(mem);
      await storage.update('mem_1', { content: 'Updated content' });

      const newStorage = new RecallMemoryStorage({
        recallDir: testDir,
        maxItems: 10,
        embeddingThreshold: 0.7,
      });
      await newStorage.initialize();

      const loaded = await newStorage.get('mem_1');
      expect(loaded?.content).toBe('Updated content');
    });
  });

  describe('delete', () => {
    test('deletes memory by id', async () => {
      const mem = createMemory('mem_1');
      await storage.store(mem);

      const deleted = await storage.delete('mem_1');
      expect(deleted).toBe(true);
      expect(await storage.get('mem_1')).toBeUndefined();
    });

    test('returns false for non-existent memory', async () => {
      const deleted = await storage.delete('nonexistent');
      expect(deleted).toBe(false);
    });

    test('persists deletion to disk', async () => {
      const mem1 = createMemory('mem_1');
      const mem2 = createMemory('mem_2');
      await storage.store(mem1);
      await storage.store(mem2);
      await storage.delete('mem_1');

      const newStorage = new RecallMemoryStorage({
        recallDir: testDir,
        maxItems: 10,
        embeddingThreshold: 0.7,
      });
      await newStorage.initialize();

      expect(await newStorage.get('mem_1')).toBeUndefined();
      expect(await newStorage.get('mem_2')).toBeDefined();
    });
  });

  describe('getAll', () => {
    test('returns all memories', async () => {
      await storage.store(createMemory('mem_1'));
      await storage.store(createMemory('mem_2'));
      await storage.store(createMemory('mem_3'));

      const all = storage.getAll();
      expect(all).toHaveLength(3);
    });

    test('returns empty array when no memories', () => {
      const all = storage.getAll();
      expect(all).toEqual([]);
    });
  });

  describe('getByType', () => {
    test('filters memories by type', async () => {
      await storage.store(createMemory('mem_1', { type: 'semantic' }));
      await storage.store(createMemory('mem_2', { type: 'episodic' }));
      await storage.store(createMemory('mem_3', { type: 'semantic' }));

      const semantic = storage.getByType('semantic');
      expect(semantic).toHaveLength(2);
      expect(semantic.every((m) => m.type === 'semantic')).toBe(true);
    });

    test('returns empty array for non-existent type', () => {
      const procedural = storage.getByType('procedural');
      expect(procedural).toEqual([]);
    });
  });

  describe('search', () => {
    test('finds memories by text query', async () => {
      await storage.store(createMemory('mem_1', { content: 'The quick brown fox' }));
      await storage.store(createMemory('mem_2', { content: 'The lazy dog' }));
      await storage.store(createMemory('mem_3', { content: 'A cat sat' }));

      const results = await storage.search('quick');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('mem_1');
    });

    test('is case insensitive', async () => {
      await storage.store(createMemory('mem_1', { content: 'UPPERCASE' }));
      const results = await storage.search('uppercase');
      expect(results).toHaveLength(1);
    });

    test('respects limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await storage.store(createMemory(`mem_${i}`, { content: 'test content' }));
      }

      const results = await storage.search('test', 2);
      expect(results).toHaveLength(2);
    });

    test('returns empty array for no matches', async () => {
      await storage.store(createMemory('mem_1', { content: 'Something else' }));
      const results = await storage.search('nonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('count', () => {
    test('returns number of memories', async () => {
      expect(storage.count()).toBe(0);
      await storage.store(createMemory('mem_1'));
      expect(storage.count()).toBe(1);
      await storage.store(createMemory('mem_2'));
      expect(storage.count()).toBe(2);
    });
  });
});

describe('ArchivalMemoryStorage', () => {
  let storage: ArchivalMemoryStorage;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `clawmod-archival-test-${Date.now()}`);
    storage = new ArchivalMemoryStorage({
      archivalDir: testDir,
      retentionDays: 30,
      compression: true,
    });
    await storage.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  describe('initialization', () => {
    test('creates archival directory', async () => {
      const stats = await fs.stat(testDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('archive', () => {
    test('archives session transcript', async () => {
      const transcript = {
        sessionId: 'sess_123',
        startedAt: new Date(),
        endedAt: new Date(),
        messages: [
          { role: 'user' as const, content: 'Hello', timestamp: new Date() },
          { role: 'assistant' as const, content: 'Hi there', timestamp: new Date() },
        ],
      };

      const filename = await storage.archive(transcript);
      // Format: YYYY-MM-DD-HH-MM.jsonl.gz
      expect(filename).toMatch(/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.jsonl\.gz/);
    });

    test('compresses when enabled', async () => {
      const transcript = {
        sessionId: 'sess_123',
        startedAt: new Date(),
        endedAt: new Date(),
        messages: [{ role: 'user' as const, content: 'x'.repeat(1000), timestamp: new Date() }],
      };

      const filename = await storage.archive(transcript);
      const filepath = path.join(testDir, 'transcripts', filename);
      const stats = await fs.stat(filepath);
      const uncompressedSize = JSON.stringify(transcript).length;

      // Compressed size should be less than uncompressed
      expect(stats.size).toBeLessThan(uncompressedSize);
    });

    test('does not compress when disabled', async () => {
      const uncompressedStorage = new ArchivalMemoryStorage({
        archivalDir: testDir,
        retentionDays: 30,
        compression: false,
      });
      await uncompressedStorage.initialize();

      const transcript = {
        sessionId: 'sess_123',
        startedAt: new Date(),
        endedAt: new Date(),
        messages: [{ role: 'user' as const, content: 'Hello', timestamp: new Date() }],
      };

      const filename = await uncompressedStorage.archive(transcript);
      const filepath = path.join(testDir, 'transcripts', filename);
      const content = await fs.readFile(filepath, 'utf-8');

      // Should be readable JSON
      const parsed = JSON.parse(content);
      expect(parsed.sessionId).toBe('sess_123');
    });
  });

  describe('search', () => {
    test('searches archived transcripts', async () => {
      // Use different timestamps so they get different filenames
      const date1 = new Date('2024-01-01T10:00:00Z');
      const date2 = new Date('2024-01-01T11:00:00Z');

      const transcript1 = {
        sessionId: 'sess_1',
        startedAt: date1,
        endedAt: date1,
        messages: [{ role: 'user' as const, content: 'unique keyword', timestamp: date1 }],
      };

      const transcript2 = {
        sessionId: 'sess_2',
        startedAt: date2,
        endedAt: date2,
        messages: [{ role: 'user' as const, content: 'something else', timestamp: date2 }],
      };

      await storage.archive(transcript1);
      await storage.archive(transcript2);

      const results = await storage.search('unique');
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('sess_1');
    });

    test('respects limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        const timestamp = new Date(`2024-01-0${i + 1}T10:00:00Z`);
        const transcript = {
          sessionId: `sess_${i}`,
          startedAt: timestamp,
          endedAt: timestamp,
          messages: [{ role: 'user' as const, content: 'test message', timestamp }],
        };
        await storage.archive(transcript);
      }

      const results = await storage.search('test', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    test('returns empty array for no matches', async () => {
      const results = await storage.search('nonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('cleanup', () => {
    test('deletes old archives beyond retention', async () => {
      const now = Date.now();
      const oldDate = new Date(now - 31 * 24 * 60 * 60 * 1000); // 31 days ago

      const oldTranscript = {
        sessionId: 'sess_old',
        startedAt: oldDate,
        endedAt: oldDate,
        messages: [{ role: 'user' as const, content: 'old', timestamp: oldDate }],
      };

      await storage.archive(oldTranscript);
      const deletedCount = await storage.cleanup();

      expect(deletedCount).toBe(1);
    });

    test('keeps recent archives', async () => {
      const now = new Date();
      const recentTranscript = {
        sessionId: 'sess_recent',
        startedAt: now,
        endedAt: now,
        messages: [{ role: 'user' as const, content: 'recent', timestamp: now }],
      };

      await storage.archive(recentTranscript);
      const deletedCount = await storage.cleanup();

      expect(deletedCount).toBe(0);
    });

    test('returns count of deleted archives', async () => {
      const deletedCount = await storage.cleanup();
      expect(typeof deletedCount).toBe('number');
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });
  });
});

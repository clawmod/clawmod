import * as fs from 'fs/promises';
import * as path from 'path';
import type { Memory, MemoryType } from '../../../types';

interface RecallMemoryConfig {
  maxItems: number;
  embeddingThreshold: number;
  recallDir: string;
}

export class RecallMemoryStorage {
  private config: RecallMemoryConfig;
  private memories: Map<string, Memory> = new Map();

  constructor(config: RecallMemoryConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.config.recallDir, { recursive: true });
    await this.loadFromDisk();
  }

  private async loadFromDisk(): Promise<void> {
    const files = ['facts.jsonl', 'summaries.jsonl'];

    for (const filename of files) {
      const filepath = path.join(this.config.recallDir, filename);
      try {
        const content = await fs.readFile(filepath, 'utf-8');
        for (const line of content.split('\n').filter(Boolean)) {
          const memory = this.parseMemory(JSON.parse(line));
          this.memories.set(memory.id, memory);
        }
      } catch {
        // File doesn't exist yet
      }
    }
  }

  private parseMemory(data: Record<string, unknown>): Memory {
    return {
      ...data,
      createdAt: new Date(data.createdAt as string),
      lastAccessedAt: new Date(data.lastAccessedAt as string),
    } as Memory;
  }

  async store(memory: Memory): Promise<void> {
    if (this.memories.size >= this.config.maxItems) {
      // Remove oldest/lowest importance memory
      await this.prune(1);
    }

    this.memories.set(memory.id, memory);
    await this.persistMemory(memory);
  }

  async get(id: string): Promise<Memory | undefined> {
    const memory = this.memories.get(id);
    if (memory) {
      memory.accessCount++;
      memory.lastAccessedAt = new Date();
    }
    return memory;
  }

  async update(id: string, updates: Partial<Memory>): Promise<void> {
    const memory = this.memories.get(id);
    if (!memory) throw new Error(`Memory not found: ${id}`);

    Object.assign(memory, updates);
    await this.persistAll();
  }

  async delete(id: string): Promise<boolean> {
    const deleted = this.memories.delete(id);
    if (deleted) await this.persistAll();
    return deleted;
  }

  getAll(): Memory[] {
    return Array.from(this.memories.values());
  }

  getByType(type: MemoryType): Memory[] {
    return this.getAll().filter(m => m.type === type);
  }

  async search(query: string, _limit: number = 10): Promise<Memory[]> {
    // Basic text search - vector search would require embedding service
    const results = this.getAll().filter(m =>
      m.content.toLowerCase().includes(query.toLowerCase())
    );
    return results.slice(0, _limit);
  }

  private async prune(count: number): Promise<void> {
    // Remove lowest importance + oldest memories
    const sorted = this.getAll().sort((a, b) => {
      const scoreA = a.importance * a.decayScore;
      const scoreB = b.importance * b.decayScore;
      return scoreA - scoreB;
    });

    for (let i = 0; i < count && sorted[i]; i++) {
      this.memories.delete(sorted[i].id);
    }

    await this.persistAll();
  }

  private async persistMemory(memory: Memory): Promise<void> {
    const filename = memory.type === 'session_summary' ? 'summaries.jsonl' : 'facts.jsonl';
    const filepath = path.join(this.config.recallDir, filename);
    const line = JSON.stringify(memory) + '\n';
    await fs.appendFile(filepath, line, 'utf-8');
  }

  private async persistAll(): Promise<void> {
    const facts = this.getAll().filter(m => m.type !== 'session_summary');
    const summaries = this.getAll().filter(m => m.type === 'session_summary');

    await fs.writeFile(
      path.join(this.config.recallDir, 'facts.jsonl'),
      facts.map(m => JSON.stringify(m)).join('\n') + '\n',
      'utf-8'
    );

    await fs.writeFile(
      path.join(this.config.recallDir, 'summaries.jsonl'),
      summaries.map(m => JSON.stringify(m)).join('\n') + '\n',
      'utf-8'
    );
  }

  count(): number {
    return this.memories.size;
  }
}

/**
 * Database-backed recall memory storage (Tier 2)
 *
 * Uses SQLite for better performance and querying capabilities
 * compared to the JSONL file-based approach.
 */

import type { Memory, MemoryType, StorageAdapter } from '../../../types';
import type Database from 'better-sqlite3';

interface RecallMemoryConfig {
  maxItems: number;
  embeddingThreshold: number;
  storage: StorageAdapter;
}

/**
 * SQLite-backed recall memory storage
 *
 * Features:
 * - Fast queries with indexed columns
 * - ACID compliance for data integrity
 * - Automatic pruning when maxItems exceeded
 * - Access tracking for decay calculation
 */
export class RecallMemoryStorageDB {
  private config: RecallMemoryConfig;
  private db: Database.Database;

  constructor(config: RecallMemoryConfig) {
    this.config = config;
    // Get raw database connection from storage adapter
    this.db = (config.storage as any).getDatabase();
  }

  async initialize(): Promise<void> {
    // Tables are already created by storage adapter
    // Just verify they exist
    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;

    const requiredTables = ['memories', 'memory_embeddings', 'memory_relations'];
    for (const tableName of requiredTables) {
      if (!tables.find(t => t.name === tableName)) {
        throw new Error(`Required table '${tableName}' not found in database`);
      }
    }

    console.log('[ClawMem] Recall storage initialized (database-backed)');
  }

  /**
   * Store a new memory in the database
   */
  async store(memory: Memory): Promise<void> {
    // Check if we need to prune first
    const count = this.count();
    if (count >= this.config.maxItems) {
      await this.prune(1);
    }

    // Insert memory
    const stmt = this.db.prepare(`
      INSERT INTO memories (
        id, type, content, importance, tier,
        created_at, last_accessed_at, access_count, decay_score,
        sources, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      memory.id,
      memory.type,
      memory.content,
      memory.importance,
      memory.tier,
      memory.createdAt.getTime(),
      memory.lastAccessedAt.getTime(),
      memory.accessCount,
      memory.decayScore,
      memory.sources ? JSON.stringify(memory.sources) : null,
      memory.metadata ? JSON.stringify(memory.metadata) : null
    );

    // Store embedding if present
    if (memory.embedding && memory.embedding.length > 0) {
      await this.storeEmbedding(memory.id, memory.embedding);
    }
  }

  /**
   * Store embedding vector for a memory
   */
  private async storeEmbedding(memoryId: string, embedding: number[]): Promise<void> {
    // Convert embedding array to Buffer for efficient storage
    const buffer = Buffer.from(new Float32Array(embedding).buffer);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding, dimension, created_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(memoryId, buffer, embedding.length, Date.now());
  }

  /**
   * Get a memory by ID and update access tracking
   */
  async get(id: string): Promise<Memory | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM memories WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) return undefined;

    // Update access tracking
    const updateStmt = this.db.prepare(`
      UPDATE memories
      SET access_count = access_count + 1,
          last_accessed_at = ?
      WHERE id = ?
    `);
    updateStmt.run(Date.now(), id);

    return this.rowToMemory(row);
  }

  /**
   * Update an existing memory
   */
  async update(id: string, updates: Partial<Memory>): Promise<void> {
    const memory = await this.get(id);
    if (!memory) {
      throw new Error(`Memory not found: ${id}`);
    }

    // Build update query dynamically based on provided fields
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }
    if (updates.importance !== undefined) {
      fields.push('importance = ?');
      values.push(updates.importance);
    }
    if (updates.tier !== undefined) {
      fields.push('tier = ?');
      values.push(updates.tier);
    }
    if (updates.decayScore !== undefined) {
      fields.push('decay_score = ?');
      values.push(updates.decayScore);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }

    if (fields.length === 0) return;

    values.push(id);
    const stmt = this.db.prepare(`
      UPDATE memories SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);

    // Update embedding if provided
    if (updates.embedding && updates.embedding.length > 0) {
      await this.storeEmbedding(id, updates.embedding);
    }
  }

  /**
   * Delete a memory by ID
   */
  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get all memories in recall tier
   */
  getAll(): Memory[] {
    const stmt = this.db.prepare(`
      SELECT * FROM memories WHERE tier = 'recall' ORDER BY last_accessed_at DESC
    `);
    const rows = stmt.all() as any[];
    return rows.map(row => this.rowToMemory(row));
  }

  /**
   * Get memories by type
   */
  getByType(type: MemoryType): Memory[] {
    const stmt = this.db.prepare(`
      SELECT * FROM memories WHERE tier = 'recall' AND type = ? ORDER BY last_accessed_at DESC
    `);
    const rows = stmt.all(type) as any[];
    return rows.map(row => this.rowToMemory(row));
  }

  /**
   * Search memories by text query
   */
  async search(query: string, limit: number = 10): Promise<Memory[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM memories
      WHERE tier = 'recall' AND content LIKE ?
      ORDER BY importance DESC, last_accessed_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(`%${query}%`, limit) as any[];
    return rows.map(row => this.rowToMemory(row));
  }

  /**
   * Prune lowest-value memories
   */
  private async prune(count: number): Promise<void> {
    // Find memories to prune (lowest importance * decay_score)
    const stmt = this.db.prepare(`
      SELECT id FROM memories
      WHERE tier = 'recall'
      ORDER BY (importance * decay_score) ASC, last_accessed_at ASC
      LIMIT ?
    `);
    const rows = stmt.all(count) as Array<{ id: string }>;

    // Delete them
    const deleteStmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    for (const row of rows) {
      deleteStmt.run(row.id);
    }

    console.log(`[ClawMem] Pruned ${rows.length} memories from recall tier`);
  }

  /**
   * Get total count of recall memories
   */
  count(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM memories WHERE tier = 'recall'
    `);
    const row = stmt.get() as { count: number };
    return row.count;
  }

  /**
   * Convert database row to Memory object
   */
  private rowToMemory(row: any): Memory {
    return {
      id: row.id,
      type: row.type,
      content: row.content,
      embedding: [], // Loaded separately if needed
      importance: row.importance,
      tier: row.tier,
      createdAt: new Date(row.created_at),
      lastAccessedAt: new Date(row.last_accessed_at),
      accessCount: row.access_count,
      decayScore: row.decay_score,
      sources: row.sources ? JSON.parse(row.sources) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  /**
   * Get embedding for a memory (loaded separately for performance)
   */
  async getEmbedding(memoryId: string): Promise<number[] | undefined> {
    const stmt = this.db.prepare(`
      SELECT embedding, dimension FROM memory_embeddings WHERE memory_id = ?
    `);
    const row = stmt.get(memoryId) as { embedding: Buffer; dimension: number } | undefined;

    if (!row) return undefined;

    // Convert Buffer back to number array
    const float32Array = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.dimension
    );
    return Array.from(float32Array);
  }

  /**
   * Batch update decay scores for all memories
   */
  async updateDecayScores(scores: Map<string, number>): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE memories SET decay_score = ? WHERE id = ?
    `);

    const transaction = this.db.transaction((entries: Array<[string, number]>) => {
      for (const [id, score] of entries) {
        stmt.run(score, id);
      }
    });

    transaction(Array.from(scores.entries()));
    console.log(`[ClawMem] Updated decay scores for ${scores.size} memories`);
  }
}

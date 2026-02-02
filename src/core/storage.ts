/**
 * Storage service for ClawMod
 * Provides key-value storage with namespace isolation using SQLite
 */

import Database from 'better-sqlite3';
import type { StorageAdapter } from '../types';
import { StorageError } from '../errors';

/**
 * SQLite-backed storage adapter with namespace isolation
 */
export class SQLiteStorageAdapter implements StorageAdapter {
  private db: Database.Database;

  constructor(dbPath: string, private namespace: string = 'default') {
    try {
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.initializeTables();
    } catch (error) {
      throw new StorageError('Failed to initialize database', {
        dbPath,
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Initialize database tables
   */
  private initializeTables(): void {
    try {
      // Key-value store table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS kv_store (
          namespace TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (namespace, key)
        )
      `);

      // Memory storage table (ClawMem)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          importance INTEGER NOT NULL,
          tier TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_accessed_at INTEGER NOT NULL,
          access_count INTEGER NOT NULL DEFAULT 0,
          decay_score REAL NOT NULL DEFAULT 1.0,
          sources TEXT,
          metadata TEXT,
          CHECK (importance >= 1 AND importance <= 10),
          CHECK (tier IN ('core', 'recall', 'archival')),
          CHECK (type IN ('episodic', 'semantic', 'procedural', 'session_summary'))
        )
      `);

      // Create indices for common queries
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(tier);
        CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
        CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
        CREATE INDEX IF NOT EXISTS idx_memories_last_accessed ON memories(last_accessed_at);
      `);

      // Memory embeddings table (for vector search)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memory_embeddings (
          memory_id TEXT PRIMARY KEY,
          embedding BLOB NOT NULL,
          dimension INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
        )
      `);

      // Memory relations table (for knowledge graph)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memory_relations (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          relation_type TEXT NOT NULL,
          strength REAL NOT NULL DEFAULT 1.0,
          created_at INTEGER NOT NULL,
          metadata TEXT,
          FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
          FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE,
          CHECK (strength >= 0.0 AND strength <= 1.0)
        )
      `);

      // Create indices for relation queries
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_relations_source ON memory_relations(source_id);
        CREATE INDEX IF NOT EXISTS idx_relations_target ON memory_relations(target_id);
        CREATE INDEX IF NOT EXISTS idx_relations_type ON memory_relations(relation_type);
      `);

      console.log('[Storage] Database tables initialized successfully');
    } catch (error) {
      throw new StorageError('Failed to create database tables', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get a value from storage
   */
  async get(key: string): Promise<unknown> {
    try {
      const stmt = this.db.prepare(
        'SELECT value FROM kv_store WHERE namespace = ? AND key = ?'
      );
      const row = stmt.get(this.namespace, key) as { value: string } | undefined;

      if (!row) {
        return undefined;
      }

      return JSON.parse(row.value) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new StorageError('Failed to parse stored value', {
          key,
          namespace: this.namespace,
          error: error.message,
        });
      }
      throw new StorageError('Failed to get value from storage', {
        key,
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Set a value in storage
   */
  async set(key: string, value: unknown): Promise<void> {
    try {
      const now = Date.now();
      const stmt = this.db.prepare(`
        INSERT INTO kv_store (namespace, key, value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(namespace, key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `);
      stmt.run(this.namespace, key, JSON.stringify(value), now, now);
    } catch (error) {
      throw new StorageError('Failed to set value in storage', {
        key,
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Delete a value from storage
   */
  async delete(key: string): Promise<void> {
    try {
      const stmt = this.db.prepare('DELETE FROM kv_store WHERE namespace = ? AND key = ?');
      stmt.run(this.namespace, key);
    } catch (error) {
      throw new StorageError('Failed to delete value from storage', {
        key,
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if a key exists in storage
   */
  async exists(key: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare(
        'SELECT 1 FROM kv_store WHERE namespace = ? AND key = ? LIMIT 1'
      );
      return stmt.get(this.namespace, key) !== undefined;
    } catch (error) {
      throw new StorageError('Failed to check key existence', {
        key,
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get all key-value pairs for the current namespace
   */
  async getAll(): Promise<Record<string, unknown>> {
    try {
      const stmt = this.db.prepare('SELECT key, value FROM kv_store WHERE namespace = ?');
      const rows = stmt.all(this.namespace) as Array<{ key: string; value: string }>;

      const result: Record<string, unknown> = {};
      for (const row of rows) {
        try {
          result[row.key] = JSON.parse(row.value) as unknown;
        } catch (error) {
          throw new StorageError('Failed to parse stored value', {
            key: row.key,
            namespace: this.namespace,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return result;
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError('Failed to get all values from storage', {
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clear all entries in the current namespace
   */
  async clear(): Promise<void> {
    try {
      const stmt = this.db.prepare('DELETE FROM kv_store WHERE namespace = ?');
      stmt.run(this.namespace);
    } catch (error) {
      throw new StorageError('Failed to clear storage', {
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Execute multiple operations in a transaction
   */
  async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    try {
      return this.db.transaction(() => {
        // SQLite transactions in better-sqlite3 are synchronous
        // We need to handle the case where fn might return a Promise
        const result = fn();
        if (result instanceof Promise) {
          throw new StorageError('Transaction function must be synchronous', {
            namespace: this.namespace,
          });
        }
        return result;
      })();
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError('Transaction failed', {
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    try {
      this.db.close();
    } catch (error) {
      throw new StorageError('Failed to close database', {
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get raw database connection for advanced operations
   * @internal Used by modules that need direct database access
   */
  getDatabase(): Database.Database {
    return this.db;
  }

  /**
   * Execute a raw SQL query
   * @internal Use with caution - for advanced operations only
   */
  exec(sql: string): void {
    try {
      this.db.exec(sql);
    } catch (error) {
      throw new StorageError('Failed to execute SQL', {
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Prepare a SQL statement
   * @internal Use with caution - for advanced operations only
   */
  prepare<T = unknown>(sql: string): Database.Statement<T[]> {
    try {
      return this.db.prepare<T[]>(sql);
    } catch (error) {
      throw new StorageError('Failed to prepare statement', {
        namespace: this.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Memory Manager for ClawMem
 *
 * Orchestrates all three storage tiers:
 * - Tier 1 (Core): Always-loaded persona/goals
 * - Tier 2 (Recall): Active working memory
 * - Tier 3 (Archival): Long-term session transcripts
 */

import * as crypto from 'crypto';
import { CoreMemoryStorage } from './storage/core';
import { RecallMemoryStorage } from './storage/recall';
import { ArchivalMemoryStorage } from './storage/archival';
import type { Memory, MemoryType } from '../../types';
import type { SessionTranscript } from './storage/archival';

// ═══════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════

export interface MemoryManagerConfig {
  coreDir: string;
  recallDir: string;
  archivalDir: string;
  core: { maxTokens: number; files: string[] };
  recall: { maxItems: number; embeddingThreshold: number };
  archival: { retentionDays: number; compression: boolean };
}

export interface MemoryStats {
  coreTokens: number;
  recallCount: number;
  archiveCount: number;
}

// ═══════════════════════════════════════════════════════════════════
// MEMORY MANAGER
// ═══════════════════════════════════════════════════════════════════

/**
 * Unified API for all memory operations
 *
 * Routes operations to the appropriate tier based on:
 * - Core: Fixed files (persona, goals, user profile)
 * - Recall: Active memories with importance >= 3
 * - Archival: Historical session transcripts
 */
export class MemoryManager {
  private coreStorage: CoreMemoryStorage;
  private recallStorage: RecallMemoryStorage;
  private archivalStorage: ArchivalMemoryStorage;

  constructor(config: MemoryManagerConfig) {
    this.coreStorage = new CoreMemoryStorage({
      ...config.core,
      coreDir: config.coreDir,
    });

    this.recallStorage = new RecallMemoryStorage({
      ...config.recall,
      recallDir: config.recallDir,
    });

    this.archivalStorage = new ArchivalMemoryStorage({
      ...config.archival,
      archivalDir: config.archivalDir,
    });
  }

  /**
   * Initialize all storage tiers
   */
  async initialize(): Promise<void> {
    await Promise.all([
      this.coreStorage.initialize(),
      this.recallStorage.initialize(),
      this.archivalStorage.initialize(),
    ]);
  }

  // ═══════════════════════════════════════════════════════════════════
  // CORE MEMORY (TIER 1)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get content of a core memory file
   */
  async getCoreMemory(filename: string): Promise<string | undefined> {
    return this.coreStorage.get(filename);
  }

  /**
   * Set content of a core memory file
   */
  async setCoreMemory(filename: string, content: string): Promise<void> {
    return this.coreStorage.set(filename, content);
  }

  /**
   * Build formatted context from all core memories
   * Returns markdown ready for system prompt injection
   */
  getCoreContext(): string {
    return this.coreStorage.buildContext();
  }

  // ═══════════════════════════════════════════════════════════════════
  // RECALL MEMORY (TIER 2)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Store new memory in recall tier
   *
   * @param content - The memory content
   * @param type - Memory type (episodic, semantic, procedural, session_summary)
   * @param importance - 1-10 scale, must be >= 3 to persist
   * @param metadata - Optional metadata
   * @returns Created memory object
   */
  async store(
    content: string,
    type: MemoryType,
    importance: number,
    metadata?: Record<string, unknown>
  ): Promise<Memory> {
    const memory: Memory = {
      id: this.generateId(),
      type,
      content,
      embedding: [], // Will be populated by embedding service
      importance,
      tier: 'recall',
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      decayScore: 1.0,
      metadata,
    };

    await this.recallStorage.store(memory);
    return memory;
  }

  /**
   * Get memory by ID from recall tier
   * Updates access tracking
   */
  async get(id: string): Promise<Memory | undefined> {
    return this.recallStorage.get(id);
  }

  /**
   * Update existing memory in recall tier
   */
  async update(id: string, updates: Partial<Memory>): Promise<void> {
    return this.recallStorage.update(id, updates);
  }

  /**
   * Delete memory from recall tier
   * @returns true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    return this.recallStorage.delete(id);
  }

  /**
   * Get all memories in recall tier
   */
  getRecallMemories(): Memory[] {
    return this.recallStorage.getAll();
  }

  /**
   * Search recall memories by text query
   */
  async searchRecall(query: string, limit?: number): Promise<Memory[]> {
    return this.recallStorage.search(query, limit);
  }

  // ═══════════════════════════════════════════════════════════════════
  // ARCHIVAL MEMORY (TIER 3)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Archive a session transcript
   * Compresses if enabled in config
   *
   * @returns Filename of archived transcript
   */
  async archiveSession(transcript: SessionTranscript): Promise<string> {
    return this.archivalStorage.archive(transcript);
  }

  /**
   * Search archived sessions by text query
   */
  async searchArchival(query: string, limit?: number) {
    return this.archivalStorage.search(query, limit);
  }

  // ═══════════════════════════════════════════════════════════════════
  // MAINTENANCE
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Clean up old archives beyond retention period
   * @returns Number of archives deleted
   */
  async cleanup(): Promise<number> {
    return this.archivalStorage.cleanup();
  }

  /**
   * Get statistics across all tiers
   */
  getStats(): MemoryStats {
    return {
      coreTokens: this.coreStorage.getTotalTokens(),
      recallCount: this.recallStorage.count(),
      archiveCount: 0, // Would need async list
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Generate unique memory ID
   * Format: mem_<24 hex chars>
   */
  private generateId(): string {
    return `mem_${crypto.randomBytes(12).toString('hex')}`;
  }
}

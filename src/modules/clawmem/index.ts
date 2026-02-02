/**
 * ClawMem Module - Hierarchical Memory Management
 *
 * Layer 2 module providing:
 * - Tier 1 (Core): Always-loaded persona/goals
 * - Tier 2 (Recall): Active working memory
 * - Tier 3 (Archival): Long-term session transcripts
 *
 * Hook Priority: 20 (runs AFTER ClawShield at priority 10)
 */

import type {
  ClawModModule,
  CoreServices,
  HookRegistration,
  CliCommand,
  SkillDefinition,
  HealthStatus,
} from '../../types';
import { MemoryManager } from './manager';
import { MemoryRetrieval } from './retrieval';
import { ImportanceScorer } from './scoring';
import { DecayCalculator } from './decay';
import { ContradictionDetector } from './contradiction';
import { createClawMemHooks } from './hooks';
import * as path from 'path';
import * as os from 'os';

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

interface ClawMemConfig {
  tiers?: {
    core?: { maxTokens?: number; files?: string[] };
    recall?: { maxItems?: number; embeddingThreshold?: number };
    archival?: { retentionDays?: number; compression?: boolean };
  };
  scoring?: { minImportance?: number; batchSize?: number };
  decay?: {
    enabled?: boolean;
    halfLifeHours?: number;
    minImportanceForNoDecay?: number;
    pruneThreshold?: number;
  };
  contradiction?: {
    enabled?: boolean;
    similarityThreshold?: number;
    autoResolve?: boolean;
  };
  retrieval?: {
    weights?: {
      recency?: number;
      importance?: number;
      relevance?: number;
      frequency?: number;
    };
    maxResults?: number;
  };
}

// ═══════════════════════════════════════════════════════════════════
// MODULE IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════

export class ClawMemModule implements ClawModModule {
  readonly name = 'clawmem';
  readonly version = '0.1.0';
  readonly layer = 2 as const;
  readonly requires: string[] = ['clawshield'];
  readonly optional: string[] = [];

  private manager: MemoryManager | null = null;
  private retrieval: MemoryRetrieval | null = null;
  private scorer: ImportanceScorer | null = null;
  private decay: DecayCalculator | null = null;
  private contradiction: ContradictionDetector | null = null;
  private hooks: HookRegistration[] = [];
  private enabled = true;

  async initialize(core: CoreServices): Promise<void> {
    // Check if required services are available (required for ClawMem)
    if (!core.embedding) {
      throw new Error(
        'ClawMem requires embedding service. Please set API key environment variable to enable ClawMem.'
      );
    }
    if (!core.llm) {
      throw new Error(
        'ClawMem requires LLM service. Please set API key environment variable to enable ClawMem.'
      );
    }

    const config = core.config.getModuleConfig<ClawMemConfig>('clawmem') ?? {};

    const baseDir = path.join(
      os.homedir(),
      '.openclaw',
      'agents',
      'default',
      'workspace',
      'clawmod'
    );

    // Initialize components with database-backed storage
    this.manager = new MemoryManager({
      coreDir: path.join(baseDir, 'core'),
      recallDir: path.join(baseDir, 'recall'),
      archivalDir: path.join(baseDir, 'archival'),
      core: {
        maxTokens: config.tiers?.core?.maxTokens ?? 2000,
        files:
          config.tiers?.core?.files ?? [
            'persona.md',
            'user_profile.md',
            'current_goals.md',
          ],
      },
      recall: {
        maxItems: config.tiers?.recall?.maxItems ?? 1000,
        embeddingThreshold: config.tiers?.recall?.embeddingThreshold ?? 0.7,
      },
      archival: {
        retentionDays: config.tiers?.archival?.retentionDays ?? 365,
        compression: config.tiers?.archival?.compression ?? true,
      },
      storage: core.storage, // Pass storage adapter for database access
      useDatabase: true, // Enable database-backed storage
    });

    this.retrieval = new MemoryRetrieval({
      weights: {
        recency: config.retrieval?.weights?.recency ?? 1.0,
        importance: config.retrieval?.weights?.importance ?? 1.0,
        relevance: config.retrieval?.weights?.relevance ?? 1.5,
        frequency: config.retrieval?.weights?.frequency ?? 0.5,
      },
      maxResults: config.retrieval?.maxResults ?? 10,
    });

    this.scorer = new ImportanceScorer({
      minImportance: config.scoring?.minImportance ?? 3,
      batchSize: config.scoring?.batchSize ?? 10,
    });

    this.decay = new DecayCalculator({
      enabled: config.decay?.enabled ?? true,
      halfLifeHours: config.decay?.halfLifeHours ?? 168,
      minImportanceForNoDecay: config.decay?.minImportanceForNoDecay ?? 8,
      pruneThreshold: config.decay?.pruneThreshold ?? 0.05,
    });

    this.contradiction = new ContradictionDetector({
      enabled: config.contradiction?.enabled ?? true,
      similarityThreshold: config.contradiction?.similarityThreshold ?? 0.8,
      autoResolve: config.contradiction?.autoResolve ?? false,
    });

    // Set LLM and embedding service
    this.scorer.setLLM(core.llm);
    this.contradiction.setLLM(core.llm);
    this.retrieval.setEmbeddingService(core.embedding);

    // Initialize manager
    await this.manager.initialize();

    // Create hooks
    this.hooks = createClawMemHooks({
      manager: this.manager,
      scorer: this.scorer,
      decay: this.decay,
    });
  }

  async shutdown(): Promise<void> {
    this.manager = null;
    this.retrieval = null;
    this.scorer = null;
    this.decay = null;
    this.contradiction = null;
    this.hooks = [];
  }

  async enable(): Promise<void> {
    this.enabled = true;
  }

  async disable(): Promise<void> {
    this.enabled = false;
  }

  getHooks(): HookRegistration[] {
    return this.enabled ? this.hooks : [];
  }

  getCommands(): CliCommand[] {
    return [];
  }

  getSkills(): SkillDefinition[] {
    return [];
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      healthy: this.manager !== null,
      checks: {
        manager: {
          ok: this.manager !== null,
          message: 'Memory manager initialized',
        },
        retrieval: {
          ok: this.retrieval !== null,
          message: 'Retrieval system initialized',
        },
        scorer: {
          ok: this.scorer !== null,
          message: 'Importance scorer initialized',
        },
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Store content in memory with optional importance score
   */
  async store(content: string, importance?: number) {
    if (!this.manager || !this.scorer)
      throw new Error('ClawMem not initialized');
    const score = importance ?? (await this.scorer.score(content));
    return this.manager.store(content, 'semantic', score);
  }

  /**
   * Search memories by query
   */
  async search(query: string, limit?: number) {
    if (!this.manager || !this.retrieval)
      throw new Error('ClawMem not initialized');
    const memories = this.manager.getRecallMemories();
    return this.retrieval.search(query, memories, limit);
  }

  /**
   * Remember content (alias for store)
   */
  async remember(content: string) {
    return this.store(content);
  }

  /**
   * Recall memories (alias for search)
   */
  async recall(query: string, limit?: number) {
    return this.search(query, limit);
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

// Default export: module instance
export default ClawMemModule;

// Named exports: all components for external use
export { MemoryManager } from './manager';
export { MemoryRetrieval } from './retrieval';
export { ImportanceScorer } from './scoring';
export { DecayCalculator } from './decay';
export { ContradictionDetector } from './contradiction';
export { createClawMemHooks } from './hooks';

// Re-export storage components
export { CoreMemoryStorage } from './storage/core';
export { RecallMemoryStorage } from './storage/recall';
export { RecallMemoryStorageDB } from './storage/recall-db';
export { ArchivalMemoryStorage } from './storage/archival';

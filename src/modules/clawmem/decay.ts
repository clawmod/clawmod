/**
 * DecayCalculator - Ebbinghaus-inspired memory decay
 *
 * Implements exponential decay with bonuses for:
 * - Access frequency (retrieval bonus)
 * - Memory importance (importance bonus)
 * - High importance memories (>=8) don't decay
 */

import type { Memory } from '../../types';

export interface DecayConfig {
  enabled: boolean;
  halfLifeHours: number;
  minImportanceForNoDecay: number;
  pruneThreshold: number;
}

export class DecayCalculator {
  private config: DecayConfig;

  constructor(config: DecayConfig) {
    this.config = config;
  }

  /**
   * Calculate decay score for a memory
   * Returns 1.0 for no decay, approaches 0.0 for maximum decay
   */
  calculate(memory: Memory): number {
    if (!this.config.enabled) return 1.0;

    // High importance memories don't decay
    if (memory.importance >= this.config.minImportanceForNoDecay) {
      return 1.0;
    }

    const hoursSinceAccess =
      (Date.now() - new Date(memory.lastAccessedAt).getTime()) / 3600000;

    // Base decay factor (exponential decay based on half-life)
    const decayFactor = Math.pow(
      0.5,
      hoursSinceAccess / this.config.halfLifeHours
    );

    // Retrieval bonus (more accesses = slower decay)
    const retrievalBonus = Math.log2(memory.accessCount + 1) * 0.1;

    // Importance bonus (higher importance = slower decay)
    const importanceBonus = (memory.importance / 10) * 0.2;

    // Final score capped at 1.0
    return Math.min(1.0, decayFactor * (1 + retrievalBonus + importanceBonus));
  }

  /**
   * Determine if a memory should be pruned based on decay threshold
   */
  shouldPrune(memory: Memory): boolean {
    const decay = this.calculate(memory);
    return decay < this.config.pruneThreshold;
  }

  /**
   * Update decay scores for all memories
   */
  updateAll(memories: Memory[]): Memory[] {
    return memories.map((m) => ({
      ...m,
      decayScore: this.calculate(m),
    }));
  }

  /**
   * Get list of memories that should be pruned
   */
  getPruneList(memories: Memory[]): Memory[] {
    return memories.filter((m) => this.shouldPrune(m));
  }

  /**
   * Calculate new decay score after memory access (boosts the memory)
   * Returns the new decay score after updating access stats
   */
  boost(memory: Memory): number {
    // Called when memory is accessed - resets decay
    const updated: Memory = {
      ...memory,
      lastAccessedAt: new Date(),
      accessCount: memory.accessCount + 1,
    };
    return this.calculate(updated);
  }
}

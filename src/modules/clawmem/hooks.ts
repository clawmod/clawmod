/**
 * Hook handlers for ClawMem module
 *
 * CRITICAL: All hooks run at priority 20 (after ClawShield at priority 10)
 * This means message_received handler sees already-sanitized content
 */

import type {
  HookContext,
  HookResult,
  HookRegistration,
  HookEvent,
} from '../../types';
import type { MemoryManager } from './manager';
import type { ImportanceScorer } from './scoring';
import type { DecayCalculator } from './decay';

export interface ClawMemHooksConfig {
  manager: MemoryManager;
  scorer: ImportanceScorer;
  decay: DecayCalculator;
}

/**
 * Create all hook registrations for ClawMem
 *
 * Hooks:
 * - before_agent_start: Inject core memory into system prompt
 * - message_received: Extract and store facts from user messages
 * - message_sending: Store assistant responses if important
 * - session_end: Update decay scores and prune old memories
 * - before_compaction: Boost important memories before context compaction
 */
export function createClawMemHooks(
  config: ClawMemHooksConfig
): HookRegistration[] {
  const { manager, scorer, decay } = config;

  return [
    {
      event: 'before_agent_start' as HookEvent,
      priority: 20, // After ClawShield (10)
      mutatesContext: true,
      handler: async (ctx: HookContext): Promise<HookResult> => {
        // Inject core memory into system prompt
        const coreContext = manager.getCoreContext();

        if (!coreContext) return {};

        const data = ctx.data as { systemPrompt?: string };
        const existingPrompt = data.systemPrompt ?? '';

        return {
          modified: {
            ...data,
            systemPrompt: `${existingPrompt}\n\n## Core Memory\n${coreContext}`,
          },
        };
      },
    },
    {
      event: 'message_received' as HookEvent,
      priority: 20, // After ClawShield (10) - sees sanitized content
      mutatesContext: false,
      handler: async (ctx: HookContext): Promise<HookResult> => {
        // Extract facts from user message (already sanitized by ClawShield)
        const message = ctx.data as { content?: string };
        if (!message?.content) return {};

        // Score the content for importance
        const importance = await scorer.score(message.content);

        if (scorer.shouldStore(importance)) {
          await manager.store(message.content, 'episodic', importance, {
            source: 'user_message',
            sessionId: ctx.metadata.sessionId as string | undefined,
          });
        }

        return {};
      },
    },
    {
      event: 'message_sending' as HookEvent,
      priority: 20, // After ClawShield (10)
      mutatesContext: false,
      handler: async (ctx: HookContext): Promise<HookResult> => {
        // Store assistant response if important
        const response = ctx.data as { content?: string };
        if (!response?.content) return {};

        const importance = await scorer.score(response.content);

        if (scorer.shouldStore(importance)) {
          await manager.store(response.content, 'episodic', importance, {
            source: 'assistant_response',
            sessionId: ctx.metadata.sessionId as string | undefined,
          });
        }

        return {};
      },
    },
    {
      event: 'session_end' as HookEvent,
      priority: 20, // After ClawShield (10)
      mutatesContext: false,
      handler: async (_ctx: HookContext): Promise<HookResult> => {
        // Update decay scores for all memories
        const memories = manager.getRecallMemories();
        const updated = decay.updateAll(memories);

        // Update each memory with new decay score
        for (const memory of updated) {
          await manager.update(memory.id, { decayScore: memory.decayScore });
        }

        // Prune memories below threshold
        const toPrune = decay.getPruneList(updated);
        for (const memory of toPrune) {
          await manager.delete(memory.id);
        }

        return {};
      },
    },
    {
      event: 'before_compaction' as HookEvent,
      priority: 20, // After ClawShield (10)
      mutatesContext: false,
      handler: async (_ctx: HookContext): Promise<HookResult> => {
        // Save important memories before context compaction
        const memories = manager.getRecallMemories();

        // Get high-importance memories
        const critical = memories.filter((m) => m.importance >= 8);

        // Boost their decay scores
        for (const memory of critical) {
          const newScore = decay.boost(memory);
          await manager.update(memory.id, {
            decayScore: newScore,
            lastAccessedAt: new Date(),
          });
        }

        return {};
      },
    },
  ];
}

/**
 * Hook management system for ClawMod
 * Provides priority-based hook execution with error isolation
 */

import type {
  HookEvent,
  HookHandler,
  HookContext,
  HookResult,
  HookRegistration,
  HookManager,
} from '../types';

/**
 * Internal hook registration with metadata
 */
interface RegisteredHook {
  handler: HookHandler;
  priority: number;
  mutatesContext: boolean;
}

/**
 * Implementation of the HookManager interface
 *
 * Key features:
 * - Priority-based execution (lower number = higher priority, runs first)
 * - Serial execution with context passing between hooks
 * - Error isolation - one hook failure doesn't break others
 * - Support for blocked results to stop further processing
 * - Context mutation tracking
 */
export class HookManagerImpl implements HookManager {
  private hooks: Map<HookEvent, RegisteredHook[]> = new Map();

  /**
   * Register a hook handler for an event
   *
   * @param event - The hook event to listen for
   * @param handler - The handler function to execute
   * @param priority - Execution priority (lower runs first). Default: 50
   */
  on(event: HookEvent, handler: HookHandler, priority: number = 50): void {
    const hooks = this.hooks.get(event) || [];
    hooks.push({
      handler,
      priority,
      mutatesContext: false, // Default to non-mutating for simple on() calls
    });
    // Sort by priority (lower number = higher priority = runs first)
    hooks.sort((a, b) => a.priority - b.priority);
    this.hooks.set(event, hooks);
  }

  /**
   * Register a hook with full configuration
   * Use this when you need to specify mutatesContext
   *
   * @param registration - Full hook registration configuration
   */
  register(registration: HookRegistration): void {
    const hooks = this.hooks.get(registration.event) || [];
    hooks.push({
      handler: registration.handler,
      priority: registration.priority,
      mutatesContext: registration.mutatesContext,
    });
    // Sort by priority (lower number = higher priority = runs first)
    hooks.sort((a, b) => a.priority - b.priority);
    this.hooks.set(registration.event, hooks);
  }

  /**
   * Unregister a hook handler
   *
   * @param event - The hook event
   * @param handler - The handler to remove
   */
  off(event: HookEvent, handler: HookHandler): void {
    const hooks = this.hooks.get(event);
    if (!hooks) return;

    const index = hooks.findIndex((h) => h.handler === handler);
    if (index !== -1) {
      hooks.splice(index, 1);
    }
  }

  /**
   * Emit an event and execute all registered hooks
   *
   * Hooks execute serially in priority order:
   * - Lower priority number runs first (ClawShield=10 before ClawMem=20)
   * - Context mutations are passed to subsequent hooks
   * - If any hook returns blocked=true, processing stops immediately
   * - Errors are isolated - one failure doesn't break others
   *
   * @param event - The event to emit
   * @param data - The data to pass to hooks
   * @param metadata - Optional metadata for context
   * @returns The final result (modified data or blocked status)
   */
  async emit(
    event: HookEvent,
    data: unknown,
    metadata: Record<string, unknown> = {}
  ): Promise<HookResult> {
    const hooks = this.hooks.get(event) || [];
    let currentData = data;

    for (const hook of hooks) {
      try {
        const ctx: HookContext = {
          event,
          data: currentData,
          metadata,
          timestamp: new Date(),
        };

        const result = await hook.handler(ctx);

        // If hook blocks, stop all further processing
        if (result.blocked) {
          return result;
        }

        // If hook mutates context and provided modified data, pass it along
        if (hook.mutatesContext && result.modified !== undefined) {
          currentData = result.modified;
        }
      } catch (error) {
        // Error isolation - log but continue to next hook
        // This is CRITICAL for system stability
        console.error(`Hook error on ${event}:`, error);

        // Optionally could emit a 'hook_error' event here for monitoring
        // but be careful not to create infinite loops
      }
    }

    // Return the final modified data (or original if no mutations)
    return { modified: currentData };
  }

  /**
   * Get count of registered hooks for an event (useful for testing/debugging)
   */
  getHookCount(event: HookEvent): number {
    return this.hooks.get(event)?.length || 0;
  }

  /**
   * Clear all hooks for an event (useful for testing)
   */
  clear(event?: HookEvent): void {
    if (event) {
      this.hooks.delete(event);
    } else {
      this.hooks.clear();
    }
  }
}

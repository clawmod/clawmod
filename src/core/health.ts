/**
 * Health checking system for ClawMod core services
 *
 * Provides diagnostic information about configuration, storage, LLM, and embedding services.
 */

import type { HealthStatus, HealthChecker, ConfigManager, StorageAdapter } from '../types';

/**
 * Core services that can be health-checked
 */
interface CoreServices {
  config?: ConfigManager;
  storage?: StorageAdapter;
  llm?: unknown; // TieredLLM interface - keeping as unknown since we just check presence
  embedding?: unknown; // EmbeddingService interface - keeping as unknown since we just check presence
}

/**
 * Implementation of the HealthChecker interface
 *
 * Checks all core services and returns overall health status.
 * Uses Partial<CoreServices> to allow checking only available services.
 */
export class HealthCheckerImpl implements HealthChecker {
  constructor(private services: CoreServices) {}

  /**
   * Perform health checks on all available services
   *
   * @returns HealthStatus with overall health and individual check results
   */
  async check(): Promise<HealthStatus> {
    const checks: HealthStatus['checks'] = {};

    // Check config service
    if (this.services.config) {
      try {
        // Test that config is accessible
        this.services.config.get('modules');
        checks.config = { ok: true, message: 'Configuration loaded and accessible' };
      } catch {
        checks.config = { ok: false, message: 'Configuration error' };
      }
    } else {
      checks.config = { ok: false, message: 'Configuration not initialized' };
    }

    // Check storage service
    if (this.services.storage) {
      try {
        // Test database accessibility with a lightweight check
        await this.services.storage.exists('_health_check');
        checks.storage = { ok: true, message: 'Database accessible' };
      } catch (error) {
        checks.storage = {
          ok: false,
          message: `Database not accessible: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    } else {
      checks.storage = { ok: false, message: 'Storage not initialized' };
    }

    // Check LLM service (non-critical - warn only)
    if (this.services.llm) {
      checks.llm = { ok: true, message: 'LLM service configured' };
    } else {
      // LLM is optional - mark as ok but with informational message
      checks.llm = { ok: true, message: 'LLM service not configured (optional)' };
    }

    // Check embedding service (non-critical - warn only)
    if (this.services.embedding) {
      checks.embedding = { ok: true, message: 'Embedding service configured' };
    } else {
      // Embedding is optional - mark as ok but with informational message
      checks.embedding = { ok: true, message: 'Embedding service not configured (optional)' };
    }

    // Overall healthy only if all critical checks pass (config and storage)
    const healthy = checks.config.ok && checks.storage.ok;

    return { healthy, checks };
  }
}

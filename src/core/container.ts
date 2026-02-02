/**
 * Dependency injection container for ClawMod core services
 *
 * Manages initialization and lifecycle of all core services in correct dependency order.
 */

import { mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { ConfigManagerImpl } from './config';
import { TieredLLMImpl } from './llm/tiered';
import { SQLiteStorageAdapter } from './storage';
import { EmbeddingServiceImpl } from './embedding';
import { HookManagerImpl } from './hooks';
import { HealthCheckerImpl } from './health';
import type { CoreServices } from '../types';
import { ConfigError } from '../errors';

/**
 * Dependency injection container for all core services
 *
 * Initialization order:
 * 1. Config (validates and provides configuration)
 * 2. Storage (depends on config for path)
 * 3. Embedding (depends on config for API settings)
 * 4. LLM (depends on config for model settings)
 * 5. Hooks (no dependencies)
 * 6. Health (depends on all other services)
 */
export class Container {
  private services: Partial<CoreServices> = {};
  private initialized = false;

  /**
   * Initialize all core services
   *
   * @param rawConfig - Raw configuration object to validate
   * @param agentId - Agent identifier for data directory isolation
   * @throws {ConfigError} If configuration is invalid
   * @throws {StorageError} If database initialization fails
   * @throws {EmbeddingError} If embedding service initialization fails
   */
  async initialize(rawConfig: unknown, agentId: string = 'default'): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 1. Initialize config (validates the raw config)
    const validatedConfig = ConfigManagerImpl.validate(rawConfig);
    this.services.config = new ConfigManagerImpl(validatedConfig);

    // 2. Initialize storage (depends on config for path)
    const dataDir = join(
      homedir(),
      '.openclaw',
      'agents',
      agentId,
      'workspace',
      'clawmod'
    );

    // Ensure data directory exists
    await mkdir(dataDir, { recursive: true });

    this.services.storage = new SQLiteStorageAdapter(
      join(dataDir, 'data.sqlite'),
      'core'
    );

    // 3. Initialize embedding (depends on config)
    // Create service but don't validate API key yet (lazy initialization)
    this.services.embedding = new EmbeddingServiceImpl(validatedConfig);

    // 4. Initialize LLM (depends on config)
    this.services.llm = new TieredLLMImpl(validatedConfig);

    // 5. Initialize hooks (no dependencies)
    this.services.hooks = new HookManagerImpl();

    // 6. Initialize health checker (depends on all other services)
    this.services.health = new HealthCheckerImpl({
      config: this.services.config,
      storage: this.services.storage,
      llm: this.services.llm!,        // Assert non-null for now
      embedding: this.services.embedding!,  // Assert non-null for now
    });

    this.initialized = true;
  }

  /**
   * Get a specific core service
   *
   * @param service - Service name to retrieve
   * @returns The requested service instance
   * @throws {ConfigError} If container not initialized or service not available
   */
  get<K extends keyof CoreServices>(service: K): CoreServices[K] {
    if (!this.initialized) {
      throw new ConfigError('Container not initialized', { service });
    }

    const s = this.services[service];
    if (!s) {
      throw new ConfigError(`Service ${service} not available`, { service });
    }

    return s as CoreServices[K];
  }

  /**
   * Get all core services
   *
   * @returns All initialized core services
   * @throws {ConfigError} If container not initialized
   */
  getAll(): CoreServices {
    if (!this.initialized) {
      throw new ConfigError('Container not initialized');
    }

    return this.services as CoreServices;
  }

  /**
   * Shutdown all services and clean up resources
   *
   * Closes database connections and resets initialization state.
   */
  async shutdown(): Promise<void> {
    if (this.services.storage instanceof SQLiteStorageAdapter) {
      this.services.storage.close();
    }

    this.initialized = false;
    this.services = {};
  }
}

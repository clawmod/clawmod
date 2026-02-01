/**
 * Configuration management for ClawMod
 *
 * Provides type-safe configuration with Zod validation and dot-path access.
 */

import { z } from 'zod';
import type { ConfigManager } from '../types';
import { ConfigError } from '../errors';

// ═══════════════════════════════════════════════════════════════════
// ZOD SCHEMAS
// ═══════════════════════════════════════════════════════════════════

/**
 * ClawShield configuration schema
 */
export const ClawShieldConfigSchema = z.object({
  spotlighting: z.object({
    enabled: z.boolean().default(true),
    tokenInterval: z.number().default(5),
  }),

  secretScanning: z.object({
    enabled: z.boolean().default(true),
    patterns: z.array(z.string()).default(['aws', 'github', 'openai', 'generic']),
    entropyThreshold: z.number().default(4.5),
  }),

  piiDetection: z.object({
    enabled: z.boolean().default(true),
    types: z.array(z.string()).default(['email', 'phone', 'ssn', 'creditcard']),
    redactionStyle: z.string().default('[REDACTED]'),
  }),

  audit: z.object({
    enabled: z.boolean().default(true),
    retention: z.number().default(90),
  }),
});

/**
 * ClawMem configuration schema
 */
export const ClawMemConfigSchema = z.object({
  tiers: z.object({
    core: z.object({
      maxTokens: z.number().default(2000),
      files: z.array(z.string()).default(['persona.md', 'user_profile.md', 'current_goals.md']),
    }),

    recall: z.object({
      maxItems: z.number().default(1000),
      embeddingThreshold: z.number().default(0.7),
    }),

    archival: z.object({
      retentionDays: z.number().default(365),
      compression: z.boolean().default(true),
    }),
  }),

  scoring: z.object({
    minImportance: z.number().default(3),
    batchSize: z.number().default(10),
  }),

  decay: z.object({
    enabled: z.boolean().default(true),
    halfLifeHours: z.number().default(168),
    minImportanceForNoDecay: z.number().default(8),
    pruneThreshold: z.number().default(0.05),
    pruneSchedule: z.string().default('0 5 * * 0'),
  }),

  consolidation: z.object({
    enabled: z.boolean().default(true),
    schedule: z.string().default('0 4 * * *'),
    minEpisodes: z.number().default(5),
    maxEpisodes: z.number().default(100),
  }),

  contradiction: z.object({
    enabled: z.boolean().default(true),
    similarityThreshold: z.number().default(0.8),
    autoResolve: z.boolean().default(false),
  }),

  graph: z.object({
    enabled: z.boolean().default(true),
    extractRelations: z.boolean().default(true),
    maxDepth: z.number().default(3),
  }),

  retrieval: z.object({
    weights: z.object({
      recency: z.number().default(1.0),
      importance: z.number().default(1.0),
      relevance: z.number().default(1.5),
      frequency: z.number().default(0.5),
    }),
    maxResults: z.number().default(10),
  }),
});

/**
 * Main ClawMod configuration schema
 */
export const ClawModConfigSchema = z.object({
  modules: z.object({
    clawshield: z.boolean().default(true),
    clawmem: z.boolean().default(true),
    clawsave: z.boolean().default(false),
    clawresearch: z.boolean().default(false),
    clawagent: z.boolean().default(false),
    clawflow: z.boolean().default(false),
  }),

  provider: z.enum(['openrouter', 'anthropic', 'openai', 'ollama']).default('openrouter'),
  apiKeyEnv: z.string().default('OPENROUTER_API_KEY'),

  models: z.object({
    scoring: z.string().default('google/gemini-2.0-flash-lite'),
    embedding: z.string().default('openai/text-embedding-3-small'),
    extraction: z.string().default('openai/gpt-4o-mini'),
    powerful: z.string().default('anthropic/claude-sonnet-4'),
  }),

  fallbacks: z.record(z.string(), z.array(z.string())).optional(),

  updates: z.object({
    mode: z.enum(['auto', 'notify', 'manual', 'disabled']).default('notify'),
    channel: z.enum(['stable', 'beta', 'dev']).default('stable'),
    checkInterval: z.number().default(86400000),
  }),

  clawshield: ClawShieldConfigSchema.optional(),
  clawmem: ClawMemConfigSchema.optional(),
});

/**
 * Inferred TypeScript type from the Zod schema
 */
export type ClawModConfig = z.infer<typeof ClawModConfigSchema>;

// ═══════════════════════════════════════════════════════════════════
// CONFIG MANAGER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Configuration manager with dot-path access and environment variable expansion
 */
export class ConfigManagerImpl implements ConfigManager {
  private config: ClawModConfig;

  constructor(config: unknown) {
    // Validate and parse the configuration
    const result = ClawModConfigSchema.safeParse(config);
    if (!result.success) {
      throw new ConfigError('Invalid configuration', {
        errors: result.error.issues,
      });
    }
    this.config = result.data;
  }

  /**
   * Get a configuration value using dot-path notation
   *
   * @example
   * config.get('modules.clawshield') // true
   * config.get('models.scoring') // 'google/gemini-2.0-flash-lite'
   */
  get<T>(path: string): T {
    const parts = path.split('.');
    let value: unknown = this.config;

    for (const part of parts) {
      if (value === null || value === undefined || typeof value !== 'object') {
        throw new ConfigError(`Configuration path not found: ${path}`, {
          path,
          availableKeys: value ? Object.keys(value) : [],
        });
      }
      value = (value as Record<string, unknown>)[part];
    }

    if (value === undefined) {
      throw new ConfigError(`Configuration path not found: ${path}`, {
        path,
      });
    }

    // Handle environment variable expansion
    if (typeof value === 'string' && path === 'apiKeyEnv') {
      const envValue = process.env[value];
      if (!envValue) {
        throw new ConfigError(`Environment variable not found: ${value}`, {
          variable: value,
        });
      }
      return envValue as T;
    }

    return value as T;
  }

  /**
   * Set a configuration value using dot-path notation
   *
   * @example
   * config.set('modules.clawshield', false)
   */
  set(path: string, value: unknown): void {
    const parts = path.split('.');
    const lastPart = parts.pop();

    if (!lastPart) {
      throw new ConfigError('Invalid configuration path', { path });
    }

    let current: Record<string, unknown> = this.config as unknown as Record<string, unknown>;

    for (const part of parts) {
      if (current[part] === undefined || current[part] === null) {
        current[part] = {};
      }
      if (typeof current[part] !== 'object') {
        throw new ConfigError(`Cannot set nested property on non-object: ${path}`, {
          path,
          part,
        });
      }
      current = current[part] as Record<string, unknown>;
    }

    current[lastPart] = value;
  }

  /**
   * Get module-specific configuration
   *
   * @example
   * config.getModuleConfig('clawshield')
   */
  getModuleConfig<T>(module: string): T | undefined {
    const moduleConfig = (this.config as Record<string, unknown>)[module];
    return moduleConfig as T | undefined;
  }

  /**
   * Check if a module is enabled
   *
   * @example
   * config.isModuleEnabled('clawshield') // true
   */
  isModuleEnabled(module: string): boolean {
    const moduleKey = module as keyof typeof this.config.modules;
    return this.config.modules[moduleKey] ?? false;
  }

  /**
   * Validate configuration against the schema
   *
   * @throws {ConfigError} If validation fails
   */
  static validate(config: unknown): ClawModConfig {
    const result = ClawModConfigSchema.safeParse(config);
    if (!result.success) {
      throw new ConfigError('Configuration validation failed', {
        errors: result.error.issues,
      });
    }
    return result.data;
  }
}

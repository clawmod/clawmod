/**
 * Tests for core/config.ts
 *
 * Tests configuration validation, dot-path access, and module management.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigManagerImpl, ClawModConfigSchema } from '../../../src/core/config';
import { ConfigError } from '../../../src/errors';

describe('ClawModConfigSchema', () => {
  test('validates correct minimal config', () => {
    const config = {
      modules: {},
      models: {},
      updates: {},
    };
    const result = ClawModConfigSchema.parse(config);

    expect(result).toBeDefined();
    expect(result.provider).toBe('openrouter');
    expect(result.modules.clawshield).toBe(true);
    expect(result.modules.clawmem).toBe(true);
  });

  test('validates correct full config', () => {
    const config = {
      modules: {
        clawshield: true,
        clawmem: true,
        clawsave: false,
      },
      provider: 'openrouter',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      models: {
        scoring: 'google/gemini-2.0-flash-lite',
        embedding: 'openai/text-embedding-3-small',
        extraction: 'openai/gpt-4o-mini',
        powerful: 'anthropic/claude-sonnet-4',
      },
      updates: {},
    };

    const result = ClawModConfigSchema.parse(config);
    expect(result).toBeDefined();
    expect(result.modules.clawshield).toBe(true);
    expect(result.models.scoring).toBe('google/gemini-2.0-flash-lite');
  });

  test('applies default values', () => {
    const config = {
      modules: {},
      models: {},
      updates: {},
    };
    const result = ClawModConfigSchema.parse(config);

    // Check module defaults
    expect(result.modules.clawshield).toBe(true);
    expect(result.modules.clawmem).toBe(true);
    expect(result.modules.clawsave).toBe(false);
    expect(result.modules.clawresearch).toBe(false);

    // Check model defaults
    expect(result.models.scoring).toBe('google/gemini-2.0-flash-lite');
    expect(result.models.embedding).toBe('openai/text-embedding-3-small');
    expect(result.models.extraction).toBe('openai/gpt-4o-mini');
    expect(result.models.powerful).toBe('anthropic/claude-sonnet-4');

    // Check other defaults
    expect(result.provider).toBe('openrouter');
    expect(result.apiKeyEnv).toBe('OPENROUTER_API_KEY');
    expect(result.updates.mode).toBe('notify');
    expect(result.updates.channel).toBe('stable');
  });

  test('applies ClawShield config defaults', () => {
    const config = {
      modules: {},
      models: {},
      updates: {},
      clawshield: {
        spotlighting: {},
        secretScanning: {},
        piiDetection: {},
        audit: {},
      },
    };

    const result = ClawModConfigSchema.parse(config);
    expect(result.clawshield).toBeDefined();
    expect(result.clawshield?.spotlighting.enabled).toBe(true);
    expect(result.clawshield?.spotlighting.tokenInterval).toBe(5);
    expect(result.clawshield?.secretScanning.enabled).toBe(true);
    expect(result.clawshield?.secretScanning.entropyThreshold).toBe(4.5);
    expect(result.clawshield?.piiDetection.enabled).toBe(true);
    expect(result.clawshield?.audit.enabled).toBe(true);
  });

  test('applies ClawMem config defaults', () => {
    const config = {
      modules: {},
      models: {},
      updates: {},
      clawmem: {
        tiers: {
          core: {},
          recall: {},
          archival: {},
        },
        scoring: {},
        decay: {},
        consolidation: {},
        contradiction: {},
        graph: {},
        retrieval: {
          weights: {},
        },
      },
    };

    const result = ClawModConfigSchema.parse(config);
    expect(result.clawmem).toBeDefined();
    expect(result.clawmem?.tiers.core.maxTokens).toBe(2000);
    expect(result.clawmem?.scoring.minImportance).toBe(3);
    expect(result.clawmem?.decay.enabled).toBe(true);
    expect(result.clawmem?.decay.halfLifeHours).toBe(168);
    expect(result.clawmem?.decay.minImportanceForNoDecay).toBe(8);
  });

  test('rejects invalid provider', () => {
    const config = {
      modules: {},
      models: {},
      updates: {},
      provider: 'invalid-provider',
    };

    expect(() => ClawModConfigSchema.parse(config)).toThrow();
  });

  test('rejects invalid module key', () => {
    const config = {
      modules: {
        clawshield: 'not-a-boolean',
      },
      models: {},
      updates: {},
    };

    expect(() => ClawModConfigSchema.parse(config)).toThrow();
  });

  test('rejects invalid update mode', () => {
    const config = {
      modules: {},
      models: {},
      updates: {
        mode: 'invalid-mode',
      },
    };

    expect(() => ClawModConfigSchema.parse(config)).toThrow();
  });

  test('accepts valid fallbacks config', () => {
    const config = {
      modules: {},
      models: {},
      updates: {},
      fallbacks: {
        scoring: ['openai/gpt-3.5-turbo', 'anthropic/claude-haiku'],
        powerful: ['anthropic/claude-opus-4'],
      },
    };

    const result = ClawModConfigSchema.parse(config);
    expect(result.fallbacks).toBeDefined();
    expect(result.fallbacks?.scoring).toHaveLength(2);
    expect(result.fallbacks?.powerful).toHaveLength(1);
  });
});

describe('ConfigManagerImpl', () => {
  let config: ConfigManagerImpl;

  beforeEach(() => {
    // Set up a test API key in environment
    process.env.OPENROUTER_API_KEY = 'test-api-key-12345';
    process.env.CUSTOM_API_KEY = 'custom-key-67890';

    config = new ConfigManagerImpl({
      modules: {
        clawshield: true,
        clawmem: false,
      },
      provider: 'openrouter',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      models: {
        scoring: 'google/gemini-flash',
        embedding: 'openai/ada',
        extraction: 'openai/gpt-4o',
        powerful: 'anthropic/claude',
      },
      updates: {},
      clawshield: {
        spotlighting: {
          enabled: true,
          tokenInterval: 10,
        },
        secretScanning: {
          enabled: false,
          patterns: ['aws'],
          entropyThreshold: 5.0,
        },
        piiDetection: {
          enabled: true,
          types: ['email'],
          redactionStyle: '[REMOVED]',
        },
        audit: {
          enabled: true,
          retention: 60,
        },
      },
    });
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.CUSTOM_API_KEY;
  });

  describe('constructor', () => {
    test('validates and accepts valid config', () => {
      expect(config).toBeDefined();
    });

    test('throws ConfigError on invalid config', () => {
      expect(() => {
        new ConfigManagerImpl({
          modules: {},
          models: {},
          updates: {},
          provider: 'invalid-provider',
        });
      }).toThrow(ConfigError);
    });

    test('includes validation errors in ConfigError', () => {
      try {
        new ConfigManagerImpl({
          modules: {
            clawshield: 'not-a-boolean',
          },
          models: {},
          updates: {},
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        expect((error as ConfigError).context).toHaveProperty('errors');
      }
    });
  });

  describe('get()', () => {
    test('gets top-level value', () => {
      expect(config.get<string>('provider')).toBe('openrouter');
    });

    test('gets nested value with dot-path', () => {
      expect(config.get<boolean>('modules.clawshield')).toBe(true);
      expect(config.get<boolean>('modules.clawmem')).toBe(false);
      expect(config.get<string>('models.scoring')).toBe('google/gemini-flash');
    });

    test('gets deeply nested value', () => {
      expect(config.get<boolean>('clawshield.spotlighting.enabled')).toBe(true);
      expect(config.get<number>('clawshield.spotlighting.tokenInterval')).toBe(10);
      expect(config.get<boolean>('clawshield.secretScanning.enabled')).toBe(false);
      expect(config.get<number>('clawshield.secretScanning.entropyThreshold')).toBe(5.0);
    });

    test('throws ConfigError for non-existent path', () => {
      expect(() => config.get('nonexistent')).toThrow(ConfigError);
      expect(() => config.get('modules.nonexistent')).toThrow(ConfigError);
    });

    test('throws ConfigError for invalid nested path', () => {
      expect(() => config.get('provider.nested.path')).toThrow(ConfigError);
    });

    test('expands environment variable for apiKeyEnv', () => {
      const apiKey = config.get<string>('apiKeyEnv');
      expect(apiKey).toBe('test-api-key-12345');
    });

    test('throws ConfigError if environment variable not found', () => {
      const configWithMissingEnv = new ConfigManagerImpl({
        modules: {},
        models: {},
        updates: {},
        apiKeyEnv: 'MISSING_API_KEY',
      });

      expect(() => configWithMissingEnv.get('apiKeyEnv')).toThrow(ConfigError);
      expect(() => configWithMissingEnv.get('apiKeyEnv')).toThrow('Environment variable not found');
    });
  });

  describe('set()', () => {
    test('sets top-level value', () => {
      config.set('provider', 'anthropic');
      expect(config.get<string>('provider')).toBe('anthropic');
    });

    test('sets nested value with dot-path', () => {
      config.set('modules.clawshield', false);
      expect(config.get<boolean>('modules.clawshield')).toBe(false);
    });

    test('sets deeply nested value', () => {
      config.set('clawshield.spotlighting.tokenInterval', 20);
      expect(config.get<number>('clawshield.spotlighting.tokenInterval')).toBe(20);
    });

    test('creates nested path if it does not exist', () => {
      config.set('newSection.newKey', 'newValue');
      expect(config.get<string>('newSection.newKey')).toBe('newValue');
    });

    test('throws ConfigError for empty path', () => {
      expect(() => config.set('', 'value')).toThrow(ConfigError);
    });

    test('throws ConfigError when setting nested property on non-object', () => {
      config.set('provider', 'openrouter');
      expect(() => config.set('provider.nested', 'value')).toThrow(ConfigError);
    });
  });

  describe('getModuleConfig()', () => {
    test('returns module config when it exists', () => {
      const clawshieldConfig = config.getModuleConfig('clawshield');
      expect(clawshieldConfig).toBeDefined();
      expect(clawshieldConfig).toHaveProperty('spotlighting');
      expect(clawshieldConfig).toHaveProperty('secretScanning');
    });

    test('returns undefined when module config does not exist', () => {
      const clawmemConfig = config.getModuleConfig('clawmem');
      expect(clawmemConfig).toBeUndefined();
    });

    test('returns undefined for non-existent module', () => {
      const nonexistentConfig = config.getModuleConfig('nonexistent');
      expect(nonexistentConfig).toBeUndefined();
    });
  });

  describe('isModuleEnabled()', () => {
    test('returns true for enabled module', () => {
      expect(config.isModuleEnabled('clawshield')).toBe(true);
    });

    test('returns false for disabled module', () => {
      expect(config.isModuleEnabled('clawmem')).toBe(false);
    });

    test('returns false for non-existent module', () => {
      expect(config.isModuleEnabled('nonexistent')).toBe(false);
    });

    test('returns default value for modules not explicitly set', () => {
      const minimalConfig = new ConfigManagerImpl({
        modules: {},
        models: {},
        updates: {},
      });
      // clawshield defaults to true
      expect(minimalConfig.isModuleEnabled('clawshield')).toBe(true);
      // clawsave defaults to false
      expect(minimalConfig.isModuleEnabled('clawsave')).toBe(false);
    });
  });

  describe('validate()', () => {
    test('validates and returns parsed config', () => {
      const validConfig = {
        modules: {
          clawshield: true,
        },
        models: {},
        updates: {},
      };

      const result = ConfigManagerImpl.validate(validConfig);
      expect(result).toBeDefined();
      expect(result.modules.clawshield).toBe(true);
    });

    test('throws ConfigError for invalid config', () => {
      const invalidConfig = {
        modules: {},
        models: {},
        updates: {},
        provider: 'invalid-provider',
      };

      expect(() => ConfigManagerImpl.validate(invalidConfig)).toThrow(ConfigError);
    });

    test('applies defaults when validating', () => {
      const result = ConfigManagerImpl.validate({
        modules: {},
        models: {},
        updates: {},
      });
      expect(result.provider).toBe('openrouter');
      expect(result.modules.clawshield).toBe(true);
    });
  });
});

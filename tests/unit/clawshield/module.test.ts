import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { ClawShieldModule } from '../../../src/modules/clawshield';
import type { CoreServices } from '../../../src/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('ClawShieldModule', () => {
  let module: ClawShieldModule;
  let mockCore: CoreServices;
  let testAuditDir: string;

  beforeEach(() => {
    module = new ClawShieldModule();
    testAuditDir = path.join(os.tmpdir(), `clawmod-module-test-${Date.now()}`);

    mockCore = {
      config: {
        getModuleConfig: vi.fn().mockReturnValue({}),
        get: vi.fn(),
        set: vi.fn(),
        isModuleEnabled: vi.fn().mockReturnValue(true)
      },
      llm: {
        scoring: vi.fn(),
        extraction: vi.fn(),
        powerful: vi.fn()
      },
      embedding: {
        embed: vi.fn(),
        embedBatch: vi.fn(),
        cosineSimilarity: vi.fn()
      },
      storage: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        exists: vi.fn()
      },
      hooks: {
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn()
      },
      health: {
        check: vi.fn()
      }
    } as unknown as CoreServices;
  });

  afterEach(async () => {
    if (module) {
      await module.shutdown();
    }
    try {
      await fs.rm(testAuditDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  describe('metadata', () => {
    test('has correct name', () => {
      expect(module.name).toBe('clawshield');
    });

    test('has correct version', () => {
      expect(module.version).toBe('0.1.0');
    });

    test('is layer 1', () => {
      expect(module.layer).toBe(1);
    });

    test('has no required dependencies', () => {
      expect(module.requires).toEqual([]);
    });

    test('has no optional dependencies', () => {
      expect(module.optional).toEqual([]);
    });
  });

  describe('initialize', () => {
    test('initializes successfully with default config', async () => {
      await expect(module.initialize(mockCore)).resolves.not.toThrow();
    });

    test('requests module config', async () => {
      await module.initialize(mockCore);
      expect(mockCore.config.getModuleConfig).toHaveBeenCalledWith('clawshield');
    });

    test('creates hooks after initialization', async () => {
      await module.initialize(mockCore);
      const hooks = module.getHooks();
      expect(hooks.length).toBe(4);
    });

    test('hooks have correct priority', async () => {
      await module.initialize(mockCore);
      const hooks = module.getHooks();
      for (const hook of hooks) {
        expect(hook.priority).toBe(10);
      }
    });

    test('hooks mutate context', async () => {
      await module.initialize(mockCore);
      const hooks = module.getHooks();
      for (const hook of hooks) {
        expect(hook.mutatesContext).toBe(true);
      }
    });

    test('respects spotlighting config', async () => {
      const configWithSpotlight = {
        spotlighting: { enabled: false }
      };
      mockCore.config.getModuleConfig = vi.fn().mockReturnValue(configWithSpotlight);

      await module.initialize(mockCore);
      const hooks = module.getHooks();
      expect(hooks.length).toBe(4);
    });

    test('respects secret scanning config', async () => {
      const configWithSecrets = {
        secretScanning: { enabled: false }
      };
      mockCore.config.getModuleConfig = vi.fn().mockReturnValue(configWithSecrets);

      await module.initialize(mockCore);
      const hooks = module.getHooks();
      expect(hooks.length).toBe(4);
    });

    test('respects PII detection config', async () => {
      const configWithPII = {
        piiDetection: { enabled: false }
      };
      mockCore.config.getModuleConfig = vi.fn().mockReturnValue(configWithPII);

      await module.initialize(mockCore);
      const hooks = module.getHooks();
      expect(hooks.length).toBe(4);
    });

    test('respects audit config', async () => {
      const configWithAudit = {
        audit: { enabled: false, retention: 30 }
      };
      mockCore.config.getModuleConfig = vi.fn().mockReturnValue(configWithAudit);

      await module.initialize(mockCore);
      const hooks = module.getHooks();
      expect(hooks.length).toBe(4);
    });

    test('handles undefined config', async () => {
      mockCore.config.getModuleConfig = vi.fn().mockReturnValue(undefined);
      await expect(module.initialize(mockCore)).resolves.not.toThrow();
    });

    test('handles null config', async () => {
      mockCore.config.getModuleConfig = vi.fn().mockReturnValue(null);
      await expect(module.initialize(mockCore)).resolves.not.toThrow();
    });
  });

  describe('shutdown', () => {
    test('cleans up resources', async () => {
      await module.initialize(mockCore);
      await module.shutdown();

      const hooks = module.getHooks();
      expect(hooks.length).toBe(0);
    });

    test('can shutdown without initialize', async () => {
      await expect(module.shutdown()).resolves.not.toThrow();
    });

    test('can shutdown multiple times', async () => {
      await module.initialize(mockCore);
      await module.shutdown();
      await expect(module.shutdown()).resolves.not.toThrow();
    });
  });

  describe('enable/disable', () => {
    test('starts enabled by default', async () => {
      await module.initialize(mockCore);
      const hooks = module.getHooks();
      expect(hooks.length).toBe(4);
    });

    test('disabling removes hooks', async () => {
      await module.initialize(mockCore);
      await module.disable();
      const hooks = module.getHooks();
      expect(hooks.length).toBe(0);
    });

    test('enabling restores hooks', async () => {
      await module.initialize(mockCore);
      await module.disable();
      await module.enable();
      const hooks = module.getHooks();
      expect(hooks.length).toBe(4);
    });

    test('can disable without initialize', async () => {
      await expect(module.disable()).resolves.not.toThrow();
    });

    test('can enable without initialize', async () => {
      await expect(module.enable()).resolves.not.toThrow();
    });

    test('can toggle multiple times', async () => {
      await module.initialize(mockCore);
      await module.disable();
      await module.enable();
      await module.disable();
      await module.enable();
      const hooks = module.getHooks();
      expect(hooks.length).toBe(4);
    });
  });

  describe('getHooks', () => {
    test('returns empty array before initialization', () => {
      const hooks = module.getHooks();
      expect(hooks).toEqual([]);
    });

    test('returns hooks after initialization', async () => {
      await module.initialize(mockCore);
      const hooks = module.getHooks();
      expect(hooks.length).toBe(4);
    });

    test('includes message_received hook', async () => {
      await module.initialize(mockCore);
      const hooks = module.getHooks();
      expect(hooks.some(h => h.event === 'message_received')).toBe(true);
    });

    test('includes message_sending hook', async () => {
      await module.initialize(mockCore);
      const hooks = module.getHooks();
      expect(hooks.some(h => h.event === 'message_sending')).toBe(true);
    });

    test('includes before_tool_call hook', async () => {
      await module.initialize(mockCore);
      const hooks = module.getHooks();
      expect(hooks.some(h => h.event === 'before_tool_call')).toBe(true);
    });

    test('includes tool_result_persist hook', async () => {
      await module.initialize(mockCore);
      const hooks = module.getHooks();
      expect(hooks.some(h => h.event === 'tool_result_persist')).toBe(true);
    });
  });

  describe('getCommands', () => {
    test('returns empty array', () => {
      const commands = module.getCommands();
      expect(commands).toEqual([]);
    });

    test('returns empty array after initialization', async () => {
      await module.initialize(mockCore);
      const commands = module.getCommands();
      expect(commands).toEqual([]);
    });
  });

  describe('getSkills', () => {
    test('returns empty array', () => {
      const skills = module.getSkills();
      expect(skills).toEqual([]);
    });

    test('returns empty array after initialization', async () => {
      await module.initialize(mockCore);
      const skills = module.getSkills();
      expect(skills).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    test('returns unhealthy before initialization', async () => {
      const health = await module.healthCheck();
      expect(health.healthy).toBe(false);
    });

    test('returns healthy after initialization', async () => {
      await module.initialize(mockCore);
      const health = await module.healthCheck();
      expect(health.healthy).toBe(true);
    });

    test('includes guards check', async () => {
      await module.initialize(mockCore);
      const health = await module.healthCheck();
      expect(health.checks.guards).toBeDefined();
      expect(health.checks.guards.ok).toBe(true);
    });

    test('includes audit check', async () => {
      await module.initialize(mockCore);
      const health = await module.healthCheck();
      expect(health.checks.audit).toBeDefined();
      expect(health.checks.audit.ok).toBe(true);
    });

    test('returns unhealthy after shutdown', async () => {
      await module.initialize(mockCore);
      await module.shutdown();
      const health = await module.healthCheck();
      expect(health.healthy).toBe(false);
    });
  });

  describe('public API', () => {
    beforeEach(async () => {
      await module.initialize(mockCore);
    });

    describe('scanSecrets', () => {
      test('detects secrets', () => {
        const result = module.scanSecrets('key: AKIAIOSFODNN7EXAMPLE');
        expect(result.valid).toBe(false);
        expect(result.blocked).toBe(true);
      });

      test('passes clean content', () => {
        const result = module.scanSecrets('clean content');
        expect(result.valid).toBe(true);
        expect(result.blocked).toBe(false);
      });

      test('returns issues', () => {
        const result = module.scanSecrets('key: AKIAIOSFODNN7EXAMPLE');
        expect(result.issues.length).toBeGreaterThan(0);
      });

      test('works before initialization', () => {
        const uninitModule = new ClawShieldModule();
        const result = uninitModule.scanSecrets('test');
        expect(result.valid).toBe(true);
      });
    });

    describe('redactPII', () => {
      test('redacts PII', () => {
        const result = module.redactPII('email: test@example.com');
        expect(result.content).toContain('[REDACTED]');
        expect(result.content).not.toContain('test@example.com');
      });

      test('returns clean content unchanged', () => {
        const result = module.redactPII('clean content');
        expect(result.content).toBe('clean content');
        expect(result.changes).toHaveLength(0);
      });

      test('lists changes', () => {
        const result = module.redactPII('email: test@example.com');
        expect(result.changes.length).toBeGreaterThan(0);
      });

      test('works before initialization', () => {
        const uninitModule = new ClawShieldModule();
        const result = uninitModule.redactPII('test');
        expect(result.content).toBe('test');
      });
    });
  });

  describe('lifecycle', () => {
    test('full lifecycle: init -> enable -> disable -> shutdown', async () => {
      await module.initialize(mockCore);
      expect(module.getHooks().length).toBe(4);

      await module.enable();
      expect(module.getHooks().length).toBe(4);

      await module.disable();
      expect(module.getHooks().length).toBe(0);

      await module.shutdown();
      expect(module.getHooks().length).toBe(0);
    });

    test('reinitialize after shutdown', async () => {
      await module.initialize(mockCore);
      await module.shutdown();
      await module.initialize(mockCore);

      const health = await module.healthCheck();
      expect(health.healthy).toBe(true);
    });

    test('multiple enable/disable cycles', async () => {
      await module.initialize(mockCore);

      for (let i = 0; i < 5; i++) {
        await module.disable();
        expect(module.getHooks().length).toBe(0);
        await module.enable();
        expect(module.getHooks().length).toBe(4);
      }
    });
  });

  describe('configuration integration', () => {
    test('fully disabled configuration', async () => {
      const fullyDisabled = {
        spotlighting: { enabled: false },
        secretScanning: { enabled: false },
        piiDetection: { enabled: false },
        audit: { enabled: false }
      };
      mockCore.config.getModuleConfig = vi.fn().mockReturnValue(fullyDisabled);

      await module.initialize(mockCore);
      const health = await module.healthCheck();
      expect(health.healthy).toBe(true); // Still healthy, just disabled
    });

    test('partial configuration', async () => {
      const partialConfig = {
        spotlighting: { enabled: true },
        audit: { retention: 60 }
      };
      mockCore.config.getModuleConfig = vi.fn().mockReturnValue(partialConfig);

      await module.initialize(mockCore);
      const health = await module.healthCheck();
      expect(health.healthy).toBe(true);
    });

    test('custom token interval', async () => {
      const customConfig = {
        spotlighting: { enabled: true, tokenInterval: 10 }
      };
      mockCore.config.getModuleConfig = vi.fn().mockReturnValue(customConfig);

      await expect(module.initialize(mockCore)).resolves.not.toThrow();
    });
  });
});

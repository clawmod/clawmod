/**
 * Integration tests - ClawMem with ClawShield
 *
 * Tests the full flow: ClawShield sanitizes content at priority 10,
 * then ClawMem receives sanitized content at priority 20.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ModuleLoader } from '../../src/modules/loader';
import { ClawShieldModule } from '../../src/modules/clawshield';
import { ClawMemModule } from '../../src/modules/clawmem';
import type { CoreServices, HookEvent, HookHandler, HookContext } from '../../src/types';

// ═══════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════

function createMockCoreServices(testDir: string): CoreServices {
  const hooks: Map<HookEvent, { handler: HookHandler; priority: number }[]> = new Map();

  return {
    config: {
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
      getModuleConfig: vi.fn().mockImplementation((name: string) => {
        if (name === 'clawshield') {
          return {
            spotlighting: { enabled: true },
            secretScanning: { enabled: true },
            piiDetection: { enabled: true, redactionStyle: 'mask' },
            audit: { enabled: false }, // Disable for tests
          };
        }
        if (name === 'clawmem') {
          return {
            tiers: {
              core: { maxTokens: 500 },
              recall: { maxItems: 100 },
              archival: { retentionDays: 7, compression: true },
            },
          };
        }
        return undefined;
      }),
      isModuleEnabled: vi.fn().mockReturnValue(true),
    },
    llm: {
      scoring: vi.fn().mockResolvedValue('5'),
      extraction: vi.fn().mockResolvedValue('extracted'),
      powerful: vi.fn().mockResolvedValue('response'),
    },
    embedding: {
      embed: vi.fn().mockResolvedValue(new Array(384).fill(0).map(() => Math.random())),
      embedBatch: vi.fn().mockResolvedValue([]),
      cosineSimilarity: vi.fn().mockReturnValue(0.8),
    },
    storage: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
    },
    hooks: {
      on: vi.fn().mockImplementation((event: HookEvent, handler: HookHandler, priority = 50) => {
        const list = hooks.get(event) ?? [];
        list.push({ handler, priority });
        list.sort((a, b) => a.priority - b.priority); // Lower priority runs first
        hooks.set(event, list);
      }),
      off: vi.fn(),
      emit: vi.fn().mockImplementation(async (event: HookEvent, data: unknown, metadata = {}) => {
        const list = hooks.get(event) ?? [];
        let result = { modified: data };

        for (const { handler } of list) {
          const ctx: HookContext = {
            event,
            data: result.modified,
            metadata,
            timestamp: new Date(),
          };
          const hookResult = await handler(ctx);
          if (hookResult.blocked) {
            return { blocked: true, reason: hookResult.reason };
          }
          if (hookResult.modified !== undefined) {
            result.modified = hookResult.modified;
          }
        }

        return result;
      }),
    },
    health: {
      check: vi.fn().mockResolvedValue({ healthy: true, checks: {} }),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// MODULE LOADER TESTS
// ═══════════════════════════════════════════════════════════════════

describe('ModuleLoader', () => {
  let testDir: string;
  let core: CoreServices;
  let loader: ModuleLoader;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `clawmod-loader-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    core = createMockCoreServices(testDir);
    loader = new ModuleLoader(core);
  });

  afterEach(async () => {
    await loader.unloadAll();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  test('loads modules in dependency order', async () => {
    await loader.loadEnabled({
      clawshield: { enabled: true },
      clawmem: { enabled: true },
    });

    const modules = loader.getLoadedModules();
    expect(modules).toHaveLength(2);

    // ClawShield (layer 1) should be first
    expect(modules[0].name).toBe('clawshield');
    // ClawMem (layer 2) should be second
    expect(modules[1].name).toBe('clawmem');
  });

  test('loads only enabled modules', async () => {
    await loader.loadEnabled({
      clawshield: { enabled: true },
      clawmem: { enabled: false },
    });

    const modules = loader.getLoadedModules();
    expect(modules).toHaveLength(1);
    expect(modules[0].name).toBe('clawshield');
  });

  test('automatically loads dependencies', async () => {
    // ClawMem requires ClawShield
    await loader.load('clawmem');

    expect(loader.isLoaded('clawshield')).toBe(true);
    expect(loader.isLoaded('clawmem')).toBe(true);
  });

  test('getModule returns correct module', async () => {
    await loader.load('clawshield');

    const shield = loader.getModule<ClawShieldModule>('clawshield');
    expect(shield).toBeDefined();
    expect(shield?.name).toBe('clawshield');
  });

  test('unloadAll shuts down all modules', async () => {
    await loader.loadEnabled({
      clawshield: { enabled: true },
      clawmem: { enabled: true },
    });

    expect(loader.getLoadedModules()).toHaveLength(2);

    await loader.unloadAll();

    expect(loader.getLoadedModules()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// INTEGRATION TESTS: ClawShield + ClawMem
// ═══════════════════════════════════════════════════════════════════

describe('ClawShield + ClawMem Integration', () => {
  let testDir: string;
  let core: CoreServices;
  let shield: ClawShieldModule;
  let mem: ClawMemModule;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `clawmod-integration-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    core = createMockCoreServices(testDir);

    shield = new ClawShieldModule();
    mem = new ClawMemModule();

    await shield.initialize(core);
    await mem.initialize(core);

    // Register hooks
    for (const hook of shield.getHooks()) {
      core.hooks.on(hook.event, hook.handler, hook.priority);
    }
    for (const hook of mem.getHooks()) {
      core.hooks.on(hook.event, hook.handler, hook.priority);
    }
  });

  afterEach(async () => {
    await mem.shutdown();
    await shield.shutdown();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  test('hook priority: ClawShield runs before ClawMem', () => {
    const shieldHooks = shield.getHooks();
    const memHooks = mem.getHooks();

    // Get priorities for message_received
    const shieldPriority = shieldHooks.find((h) => h.event === 'message_received')?.priority ?? 999;
    const memPriority = memHooks.find((h) => h.event === 'message_received')?.priority ?? 999;

    // ClawShield priority 10 < ClawMem priority 20
    expect(shieldPriority).toBeLessThan(memPriority);
    expect(shieldPriority).toBe(10);
    expect(memPriority).toBe(20);
  });

  test('ClawShield sanitizes content before ClawMem sees it', async () => {
    // Content with secrets
    const content = 'My API key is AKIAIOSFODNN7EXAMPLE and password is secret123';

    // ClawShield should block or sanitize
    const scanResult = shield.scanSecrets(content);
    expect(scanResult.blocked).toBe(true);
    expect(scanResult.issues.length).toBeGreaterThan(0);
  });

  test('ClawShield PII redaction before ClawMem stores', async () => {
    const content = 'Contact me at user@example.com or 555-123-4567';

    const result = shield.redactPII(content);
    expect(result.content).not.toContain('user@example.com');
    expect(result.content).not.toContain('555-123-4567');
    expect(result.changes.length).toBeGreaterThan(0);
  });

  test('full flow: message with PII is sanitized before storage', async () => {
    const unsafeContent = 'Remember my email: john@example.com';

    // Simulate hook flow
    const result = await core.hooks.emit('message_received', {
      content: unsafeContent,
      role: 'user',
    });

    // Should not be blocked (PII is redacted, not blocked)
    expect(result.blocked).not.toBe(true);
  });

  test('full flow: message with secrets is blocked', async () => {
    const unsafeContent = 'Here is my AWS key: AKIAIOSFODNN7EXAMPLE';

    // Simulate hook flow
    const result = await core.hooks.emit('message_received', {
      content: unsafeContent,
      role: 'user',
    });

    // Should be blocked by ClawShield
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('secrets detected');
  });

  test('module layers are correctly assigned', () => {
    expect(shield.layer).toBe(1);
    expect(mem.layer).toBe(2);
  });

  test('ClawMem depends on ClawShield', () => {
    expect(mem.requires).toContain('clawshield');
    expect(shield.requires).toHaveLength(0);
  });

  test('both modules report healthy status', async () => {
    const shieldHealth = await shield.healthCheck();
    const memHealth = await mem.healthCheck();

    expect(shieldHealth.healthy).toBe(true);
    expect(memHealth.healthy).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// HOOK FLOW TESTS
// ═══════════════════════════════════════════════════════════════════

describe('Hook Priority Flow', () => {
  let testDir: string;
  let core: CoreServices;
  let executionOrder: string[];

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `clawmod-hooks-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    core = createMockCoreServices(testDir);
    executionOrder = [];

    // Replace emit to track execution order
    const originalOn = core.hooks.on as ReturnType<typeof vi.fn>;
    const handlers: { event: HookEvent; handler: HookHandler; priority: number }[] = [];

    originalOn.mockImplementation((event: HookEvent, handler: HookHandler, priority = 50) => {
      handlers.push({ event, handler, priority });
    });

    (core.hooks.emit as ReturnType<typeof vi.fn>).mockImplementation(
      async (event: HookEvent, data: unknown, metadata = {}) => {
        const eventHandlers = handlers
          .filter((h) => h.event === event)
          .sort((a, b) => a.priority - b.priority);

        let result = { modified: data };

        for (const { handler, priority } of eventHandlers) {
          const ctx: HookContext = {
            event,
            data: result.modified,
            metadata,
            timestamp: new Date(),
          };
          executionOrder.push(`priority-${priority}`);
          const hookResult = await handler(ctx);
          if (hookResult.blocked) {
            return { blocked: true, reason: hookResult.reason };
          }
          if (hookResult.modified !== undefined) {
            result.modified = hookResult.modified;
          }
        }

        return result;
      }
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  test('hooks execute in priority order (lower first)', async () => {
    const shield = new ClawShieldModule();
    const mem = new ClawMemModule();

    await shield.initialize(core);
    await mem.initialize(core);

    // Register hooks
    for (const hook of shield.getHooks()) {
      core.hooks.on(hook.event, hook.handler, hook.priority);
    }
    for (const hook of mem.getHooks()) {
      core.hooks.on(hook.event, hook.handler, hook.priority);
    }

    // Trigger message_received
    await core.hooks.emit('message_received', { content: 'test', role: 'user' });

    // Should execute ClawShield (10) before ClawMem (20)
    expect(executionOrder).toEqual(['priority-10', 'priority-20']);

    await mem.shutdown();
    await shield.shutdown();
  });
});

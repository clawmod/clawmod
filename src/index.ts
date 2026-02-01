/**
 * ClawMod - The complete OpenClaw enhancement platform
 *
 * A modular plugin system providing:
 * - ClawShield: Security scanning, PII detection, spotlighting
 * - ClawMem: Hierarchical memory management with decay
 *
 * @packageDocumentation
 */

import { Container } from './core/container';
import { ModuleLoader } from './modules/loader';
import type { ClawModConfig } from './core/config';

// ═══════════════════════════════════════════════════════════════════
// PLUGIN API INTERFACE
// ═══════════════════════════════════════════════════════════════════

interface OpenClawPluginAPI {
  getPluginConfig<T>(name: string): T | undefined;
  registerHook(
    event: string,
    handler: (ctx: unknown) => Promise<unknown>,
    priority?: number
  ): void;
  registerCommand(command: {
    name: string;
    description: string;
    handler: (args: string[]) => Promise<void>;
  }): void;
  registerSkill(skill: {
    name: string;
    description: string;
    handler: (args: unknown) => Promise<unknown>;
  }): void;
}

// ═══════════════════════════════════════════════════════════════════
// PLUGIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

let container: Container | null = null;
let loader: ModuleLoader | null = null;

/**
 * Main plugin registration function
 * Called by OpenClaw when the plugin is loaded
 */
export default async function register(api: OpenClawPluginAPI): Promise<void> {
  // Runtime version check
  const nodeVersion = parseInt(process.version.slice(1).split('.')[0], 10);
  if (nodeVersion < 18) {
    throw new Error(
      `ClawMod requires Node.js 18+. You have ${process.version}. ` +
        `Please upgrade: https://nodejs.org/`
    );
  }

  // Get plugin configuration
  const config = api.getPluginConfig<ClawModConfig>('clawmod') ?? ({} as Partial<ClawModConfig>);

  // Initialize core services
  container = new Container();
  await container.initialize(config);

  // Get core services
  const core = container.getAll();

  // Load enabled modules in dependency order
  loader = new ModuleLoader(core);

  // Convert modules config (boolean) to loader format ({enabled: boolean})
  const modulesConfig: Record<string, { enabled: boolean }> = {};
  if (config.modules) {
    for (const [name, enabled] of Object.entries(config.modules)) {
      if (typeof enabled === 'boolean') {
        modulesConfig[name] = { enabled };
      }
    }
  }
  await loader.loadEnabled(modulesConfig);

  // Register hooks with OpenClaw
  for (const module of loader.getLoadedModules()) {
    for (const hook of module.getHooks()) {
      // Wrap handler to match OpenClaw's expected signature
      api.registerHook(
        hook.event,
        async (ctx: unknown) => hook.handler(ctx as Parameters<typeof hook.handler>[0]),
        hook.priority
      );
    }

    // Register CLI commands
    for (const command of module.getCommands()) {
      api.registerCommand(command);
    }

    // Register skills
    for (const skill of module.getSkills()) {
      api.registerSkill(skill);
    }
  }

  // Log loaded modules
  const loadedNames = loader.getLoadedModules().map((m) => m.name);
  if (loadedNames.length > 0) {
    console.log(`ClawMod loaded: ${loadedNames.join(', ')}`);
  } else {
    console.log('ClawMod loaded (no modules enabled)');
  }
}

/**
 * Cleanup function called when the plugin is unloaded
 */
export async function unregister(): Promise<void> {
  if (loader) {
    await loader.unloadAll();
    loader = null;
  }
  if (container) {
    await container.shutdown();
    container = null;
  }
}

/**
 * Get the container for direct access to core services
 * (mainly for testing)
 */
export function getContainer(): Container | null {
  return container;
}

/**
 * Get the module loader for direct access to loaded modules
 * (mainly for testing)
 */
export function getLoader(): ModuleLoader | null {
  return loader;
}

// ═══════════════════════════════════════════════════════════════════
// RE-EXPORTS
// ═══════════════════════════════════════════════════════════════════

// Types
export * from './types';
export * from './errors';

// Core services
export { Container } from './core/container';
export { ConfigManagerImpl, ClawModConfigSchema } from './core/config';
export { HookManagerImpl } from './core/hooks';
export { EmbeddingServiceImpl } from './core/embedding';
export { SQLiteStorageAdapter } from './core/storage';

// Modules
export { ModuleLoader } from './modules/loader';
export { ClawShieldModule } from './modules/clawshield';
export { ClawMemModule } from './modules/clawmem';

// Module components (for direct use)
export {
  SecretScanner,
  PIIDetector,
  Spotlighter,
  AuditLogger,
  SecurityGuards,
} from './modules/clawshield';

export {
  MemoryManager,
  MemoryRetrieval,
  ImportanceScorer,
  DecayCalculator,
  ContradictionDetector,
  CoreMemoryStorage,
  RecallMemoryStorage,
  ArchivalMemoryStorage,
} from './modules/clawmem';

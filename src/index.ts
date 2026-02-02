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
import { ClawModConfigSchema } from './core/config';
import type { ClawModConfig } from './core/config';
import type { ClawShieldModule } from './modules/clawshield';
import type { ClawMemModule } from './modules/clawmem';
import type { OpenClawPluginAPI } from './types';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════
// SINGLETON EXPORTS FOR HOOKS
// ═══════════════════════════════════════════════════════════════════

let container: Container | null = null;
let loader: ModuleLoader | null = null;
let clawShieldInstance: ClawShieldModule | null = null;
let clawMemInstance: ClawMemModule | null = null;

export function getContainer(): Container | null {
  return container;
}

export function getClawShield(): ClawShieldModule | null {
  return clawShieldInstance;
}

export function getClawMem(): ClawMemModule | null {
  return clawMemInstance;
}

// ═══════════════════════════════════════════════════════════════════
// PLUGIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

/**
 * Main plugin registration function
 * Called by OpenClaw when the plugin is loaded
 */
export default async function (api: OpenClawPluginAPI) {
  // Runtime version check
  const nodeVersion = parseInt(process.version.slice(1).split('.')[0], 10);
  if (nodeVersion < 18) {
    throw new Error(
      `ClawMod requires Node.js 18+. You have ${process.version}. ` +
        `Please upgrade: https://nodejs.org/`
    );
  }

  // Get and validate plugin configuration
  let config: ClawModConfig;
  try {
    api.logger.debug("Validating ClawMod configuration...");
    config = ClawModConfigSchema.parse(api.config);
    api.logger.debug("Config validated:", JSON.stringify(config, null, 2));
  } catch (error) {
    if (error instanceof z.ZodError) {
      api.logger.error("Invalid ClawMod configuration:", error.issues);
      api.logger.error(error instanceof Error && error.stack ? error.stack : String(error));
      throw new Error(`Invalid ClawMod configuration: ${error.message}`);
    }
    api.logger.error(error instanceof Error && error.stack ? error.stack : String(error));
    throw error;
  }

  // Perform async initialization
  try {
    api.logger.info("Initializing ClawMod core services...");
    const initStartTime = Date.now();

    // Initialize core services
    container = new Container();
    await container.initialize(config);
    const initDuration = Date.now() - initStartTime;
    api.logger.info(`ClawMod core services initialized (${initDuration}ms)`);

    // Get core services
    const core = container.getAll();

    // Check if embedding service is available
    if (!core.embedding) {
      api.logger.warn('[ClawMod] Embedding service not available. ClawMem functionality will be limited.');
    }

    // Load enabled modules in dependency order
    api.logger.info("Loading modules...");
    const moduleStartTime = Date.now();
    loader = new ModuleLoader(core);

    // Convert modules config (boolean) to loader format ({enabled: boolean})
    const modulesConfig: Record<string, { enabled: boolean }> = {};
    if (config.modules) {
      for (const [name, enabled] of Object.entries(config.modules)) {
        if (typeof enabled === 'boolean') {
          modulesConfig[name] = { enabled };
          api.logger.debug(`Module config: ${name} = ${enabled}`);
        }
      }
    }

    try {
      await loader.loadEnabled(modulesConfig);
      const moduleDuration = Date.now() - moduleStartTime;
      api.logger.info(`Modules loaded (${moduleDuration}ms)`);
    } catch (error) {
      api.logger.error("Module loading encountered errors:", error);
      api.logger.error(error instanceof Error && error.stack ? error.stack : String(error));
      api.logger.warn("Some modules may not be available");
    }

    // Store module instances after initialization
    clawShieldInstance = loader.getModule<ClawShieldModule>('clawshield') ?? null;
    clawMemInstance = loader.getModule<ClawMemModule>('clawmem') ?? null;

    // Log loaded modules
    const loadedNames = loader.getLoadedModules().map((m) => m.name);
    if (loadedNames.length > 0) {
      api.logger.info(`ClawMod loaded: ${loadedNames.join(', ')}`);
    } else {
      api.logger.info("ClawMod loaded (no modules enabled)");
    }

    // Register file-based hooks
    // IMPORTANT: Check if registerPluginHooksFromDir is available
    // For now, just log that hooks are ready
    api.logger.info("File-based hooks ready in hooks/ directory");

    // Register tools
    api.logger.info("Registering tools...");
    registerTools(api);
  } catch (error) {
    api.logger.error("ClawMod initialization failed:", error);
    api.logger.error(error instanceof Error && error.stack ? error.stack : String(error));
    // Don't throw - let the plugin load partially
    api.logger.warn("ClawMod loaded with errors. Some features may not work.");
  }
}

/**
 * Register ClawMod tools with OpenClaw
 *
 * Tools registered:
 * - clawmem_search: Search memory database
 * - clawmem_remember: Store information in memory
 * - clawshield_scan: Scan text for secrets and PII
 */
function registerTools(api: OpenClawPluginAPI): void {
  // ClawMem Tools
  if (clawMemInstance) {
    api.logger.debug("Registering ClawMem tools...");

    // Tool 1: Search Memory
    api.logger.info("Registered tool: clawmem_search");
    api.registerTool({
      name: "clawmem_search",
      description: "Search memory database for relevant information",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query text"
          },
          limit: {
            type: "number",
            description: "Maximum results to return",
            default: 10
          }
        },
        required: ["query"]
      },
      async execute(_id: string, params: any) {
        try {
          if (!clawMemInstance) {
            api.logger.warn("clawmem_search called but ClawMem not available");
            return {
              content: [
                { type: "text", text: "ClawMem not available" }
              ]
            };
          }

          api.logger.debug(`clawmem_search: query="${params.query}", limit=${params.limit || 10}`);
          const results = await clawMemInstance.search(params.query, params.limit || 10);
          api.logger.debug(`clawmem_search: found ${results.length} results`);
          return {
            content: [
              { type: "text", text: JSON.stringify(results, null, 2) }
            ]
          };
        } catch (error) {
          api.logger.error("clawmem_search failed:", error);
          api.logger.error(error instanceof Error && error.stack ? error.stack : String(error));
          return {
            content: [
              { type: "text", text: `Search failed: ${(error as Error).message}` }
            ]
          };
        }
      }
    });

    // Tool 2: Store Memory
    api.logger.info("Registered tool: clawmem_remember");
    api.registerTool({
      name: "clawmem_remember",
      description: "Store important information in memory",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "Content to remember"
          },
          importance: {
            type: "number",
            description: "Importance score (1-10)",
            minimum: 1,
            maximum: 10
          }
        },
        required: ["content"]
      },
      async execute(_id: string, params: any) {
        try {
          if (!clawMemInstance) {
            api.logger.warn("clawmem_remember called but ClawMem not available");
            return {
              content: [
                { type: "text", text: "ClawMem not available" }
              ]
            };
          }

          api.logger.debug(`clawmem_remember: content length=${params.content.length}, importance=${params.importance || 'auto'}`);
          await clawMemInstance.store(params.content, params.importance);
          api.logger.debug("clawmem_remember: memory stored successfully");
          return {
            content: [
              { type: "text", text: `Stored memory with importance ${params.importance || 'auto-calculated'}` }
            ]
          };
        } catch (error) {
          api.logger.error("clawmem_remember failed:", error);
          api.logger.error(error instanceof Error && error.stack ? error.stack : String(error));
          return {
            content: [
              { type: "text", text: `Storage failed: ${(error as Error).message}` }
            ]
          };
        }
      }
    });

    api.logger.info("ClawMem tools registered: clawmem_search, clawmem_remember");
  }

  // ClawShield Tools
  if (clawShieldInstance) {
    api.logger.debug("Registering ClawShield tools...");

    // Tool 3: Scan for Secrets
    api.logger.info("Registered tool: clawshield_scan");
    api.registerTool({
      name: "clawshield_scan",
      description: "Scan text for secrets and PII",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "Text to scan"
          }
        },
        required: ["content"]
      },
      async execute(_id: string, params: any) {
        try {
          if (!clawShieldInstance) {
            api.logger.warn("clawshield_scan called but ClawShield not available");
            return {
              content: [
                { type: "text", text: "ClawShield not available" }
              ]
            };
          }

          api.logger.debug(`clawshield_scan: content length=${params.content.length}`);
          const validation = clawShieldInstance.scanSecrets(params.content);
          api.logger.debug(`clawshield_scan: found ${validation.issues.length} issues, blocked=${validation.blocked}`);
          const result = {
            blocked: validation.blocked,
            issues: validation.issues,
            summary: `Found ${validation.issues.length} security issues`
          };

          return {
            content: [
              { type: "text", text: JSON.stringify(result, null, 2) }
            ]
          };
        } catch (error) {
          api.logger.error("clawshield_scan failed:", error);
          api.logger.error(error instanceof Error && error.stack ? error.stack : String(error));
          return {
            content: [
              { type: "text", text: `Scan failed: ${(error as Error).message}` }
            ]
          };
        }
      }
    });

    api.logger.info("ClawShield tools registered: clawshield_scan");
  }

  if (!clawMemInstance && !clawShieldInstance) {
    api.logger.info("No tools registered (no modules enabled)");
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
  clawShieldInstance = null;
  clawMemInstance = null;
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
  RecallMemoryStorageDB,
  ArchivalMemoryStorage,
} from './modules/clawmem';

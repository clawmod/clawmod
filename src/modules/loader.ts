/**
 * Module Loader - Dependency-aware module orchestration
 *
 * Loads modules in topological order based on:
 * 1. Layer (lower layer modules load first)
 * 2. Dependencies (requires[] must load before dependents)
 */

import type { ClawModModule, CoreServices } from '../types';
import { ClawShieldModule } from './clawshield';
import { ClawMemModule } from './clawmem';

interface ModulesConfig {
  clawshield?: { enabled?: boolean };
  clawmem?: { enabled?: boolean };
}

interface ModuleEntry {
  name: string;
  factory: () => ClawModModule;
}

export class ModuleLoader {
  private core: CoreServices;
  private loaded: Map<string, ClawModModule> = new Map();
  private registry: Map<string, ModuleEntry> = new Map();

  constructor(core: CoreServices) {
    this.core = core;
    this.registerBuiltins();
  }

  private registerBuiltins(): void {
    this.registry.set('clawshield', {
      name: 'clawshield',
      factory: () => new ClawShieldModule(),
    });
    this.registry.set('clawmem', {
      name: 'clawmem',
      factory: () => new ClawMemModule(),
    });
  }

  /**
   * Register a custom module
   */
  register(name: string, factory: () => ClawModModule): void {
    this.registry.set(name, { name, factory });
  }

  /**
   * Load all enabled modules in dependency order
   */
  async loadEnabled(config: ModulesConfig = {}): Promise<void> {
    const toLoad: string[] = [];

    // Check which modules are enabled
    for (const [name] of this.registry) {
      const moduleConfig = config[name as keyof ModulesConfig];
      const enabled = moduleConfig?.enabled ?? this.core.config.isModuleEnabled(name);
      if (enabled) {
        toLoad.push(name);
      }
    }

    // Sort by dependencies
    const sorted = this.topologicalSort(toLoad);

    // Load in order
    for (const name of sorted) {
      await this.load(name);
    }
  }

  /**
   * Load a single module by name
   */
  async load(name: string): Promise<ClawModModule> {
    // Already loaded?
    const existing = this.loaded.get(name);
    if (existing) return existing;

    // Get factory
    const entry = this.registry.get(name);
    if (!entry) {
      throw new Error(`Unknown module: ${name}`);
    }

    // Create instance
    const module = entry.factory();

    // Check dependencies
    for (const dep of module.requires) {
      if (!this.loaded.has(dep)) {
        // Try to load dependency
        const depEntry = this.registry.get(dep);
        if (!depEntry) {
          throw new Error(`Module '${name}' requires unknown module '${dep}'`);
        }
        await this.load(dep);
      }
    }

    // Initialize
    await module.initialize(this.core);
    this.loaded.set(name, module);

    // Register hooks
    for (const hook of module.getHooks()) {
      this.core.hooks.on(hook.event, hook.handler, hook.priority);
    }

    return module;
  }

  /**
   * Unload all modules in reverse order
   */
  async unloadAll(): Promise<void> {
    const modules = Array.from(this.loaded.values()).reverse();
    for (const module of modules) {
      await module.shutdown();
      this.loaded.delete(module.name);
    }
  }

  /**
   * Get all loaded modules
   */
  getLoadedModules(): ClawModModule[] {
    return Array.from(this.loaded.values());
  }

  /**
   * Get a specific loaded module
   */
  getModule<T extends ClawModModule>(name: string): T | undefined {
    return this.loaded.get(name) as T | undefined;
  }

  /**
   * Check if a module is loaded
   */
  isLoaded(name: string): boolean {
    return this.loaded.has(name);
  }

  /**
   * Topological sort based on layer and dependencies
   */
  private topologicalSort(names: string[]): string[] {
    // Build module info
    const modules: Map<string, { layer: number; requires: string[] }> = new Map();
    for (const name of names) {
      const entry = this.registry.get(name);
      if (!entry) continue;
      const instance = entry.factory();
      modules.set(name, {
        layer: instance.layer,
        requires: instance.requires.filter((r) => names.includes(r)),
      });
    }

    // Sort by layer first, then by dependencies
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected involving '${name}'`);
      }

      visiting.add(name);

      const info = modules.get(name);
      if (info) {
        // Visit dependencies first
        for (const dep of info.requires) {
          visit(dep);
        }
      }

      visiting.delete(name);
      visited.add(name);
      sorted.push(name);
    };

    // Sort by layer, then visit
    const byLayer = [...names].sort((a, b) => {
      const aInfo = modules.get(a);
      const bInfo = modules.get(b);
      return (aInfo?.layer ?? 0) - (bInfo?.layer ?? 0);
    });

    for (const name of byLayer) {
      visit(name);
    }

    return sorted;
  }
}

export default ModuleLoader;

/**
 * Core module exports
 *
 * This module provides the public API for ClawMod's core services:
 * - Configuration management with Zod validation
 * - LLM providers (OpenRouter) with tiered routing
 * - Storage (SQLite) with namespace isolation
 * - Embedding service with LRU caching
 * - Hook system with priority-based execution
 * - Health checking for all services
 * - Dependency injection container
 */

// Configuration
export { ConfigManagerImpl, ClawModConfigSchema } from './config';
export type { ClawModConfig } from './config';

// LLM (exports all types and implementations from llm/index.ts)
export * from './llm';

// Storage
export { SQLiteStorageAdapter } from './storage';

// Embedding
export { EmbeddingServiceImpl } from './embedding';

// Hooks
export { HookManagerImpl } from './hooks';

// Health
export { HealthCheckerImpl } from './health';

// Container (DI)
export { Container } from './container';

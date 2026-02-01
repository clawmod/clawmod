/**
 * Shared type definitions for ClawMod
 */

// ═══════════════════════════════════════════════════════════════════
// HOOK TYPES
// ═══════════════════════════════════════════════════════════════════

export type HookEvent =
  | 'before_agent_start'
  | 'agent_end'
  | 'message_received'
  | 'message_sending'
  | 'message_sent'
  | 'before_tool_call'
  | 'after_tool_call'
  | 'tool_result_persist'
  | 'before_compaction'
  | 'after_compaction'
  | 'session_start'
  | 'session_end'
  | 'gateway_start'
  | 'gateway_stop';

export interface HookContext {
  event: HookEvent;
  data: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface HookResult {
  modified?: unknown;
  blocked?: boolean;
  reason?: string;
}

export type HookHandler = (ctx: HookContext) => Promise<HookResult>;

export interface HookRegistration {
  event: HookEvent;
  priority: number;
  handler: HookHandler;
  mutatesContext: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// MODULE TYPES
// ═══════════════════════════════════════════════════════════════════

export interface CoreServices {
  config: ConfigManager;
  llm: TieredLLM;
  embedding: EmbeddingService;
  storage: StorageAdapter;
  hooks: HookManager;
  health: HealthChecker;
}

export interface ClawModModule {
  readonly name: string;
  readonly version: string;
  readonly layer: 0 | 1 | 2 | 3 | 4;
  readonly requires: string[];
  readonly optional: string[];

  initialize(core: CoreServices): Promise<void>;
  shutdown(): Promise<void>;
  enable(): Promise<void>;
  disable(): Promise<void>;

  getHooks(): HookRegistration[];
  getCommands(): CliCommand[];
  getSkills(): SkillDefinition[];

  healthCheck(): Promise<HealthStatus>;
}

// ═══════════════════════════════════════════════════════════════════
// MEMORY TYPES
// ═══════════════════════════════════════════════════════════════════

export type MemoryType = 'episodic' | 'semantic' | 'procedural' | 'session_summary';
export type MemoryTier = 'core' | 'recall' | 'archival';

export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  embedding: number[];
  importance: number; // 1-10
  tier: MemoryTier;
  createdAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
  decayScore: number; // 0.0-1.0
  sources?: string[];
  metadata?: Record<string, unknown>;
}

export interface MemorySearchResult {
  memory: Memory;
  score: number;
  matchType: 'vector' | 'keyword' | 'hybrid';
}

// ═══════════════════════════════════════════════════════════════════
// SECURITY TYPES
// ═══════════════════════════════════════════════════════════════════

export interface SecretMatch {
  type: string;
  value: string;
  start: number;
  end: number;
}

export interface PIIMatch {
  type: 'email' | 'phone' | 'ssn' | 'creditcard' | 'other';
  value: string;
  start: number;
  end: number;
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  event: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, unknown>;
  sessionId?: string;
  hash: string;
  signature: string;
}

// ═══════════════════════════════════════════════════════════════════
// SERVICE INTERFACES (Placeholders - will be implemented)
// ═══════════════════════════════════════════════════════════════════

export interface ConfigManager {
  get<T>(path: string): T;
  set(path: string, value: unknown): void;
  getModuleConfig<T>(module: string): T | undefined;
  isModuleEnabled(module: string): boolean;
}

export interface TieredLLM {
  scoring(prompt: string): Promise<string>;
  extraction(prompt: string): Promise<string>;
  powerful(prompt: string): Promise<string>;
}

export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  cosineSimilarity(a: number[], b: number[]): number;
}

export interface StorageAdapter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export interface HookManager {
  on(event: HookEvent, handler: HookHandler, priority?: number): void;
  off(event: HookEvent, handler: HookHandler): void;
  emit(event: HookEvent, data: unknown): Promise<HookResult[]>;
}

export interface HealthChecker {
  check(): Promise<HealthStatus>;
}

export interface HealthStatus {
  healthy: boolean;
  checks: Record<string, { ok: boolean; message?: string }>;
}

export interface CliCommand {
  name: string;
  description: string;
  handler: (args: string[]) => Promise<void>;
}

export interface SkillDefinition {
  name: string;
  description: string;
  handler: (args: unknown) => Promise<unknown>;
}

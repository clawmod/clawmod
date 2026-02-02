/**
 * Shared type definitions for ClawMod
 */

// ═══════════════════════════════════════════════════════════════════
// OPENCLAW PLUGIN SDK TYPES (unofficial - based on documentation)
// ═══════════════════════════════════════════════════════════════════

/**
 * OpenClaw Plugin API Logger
 *
 * Logger interface for OpenClaw plugins (2026 API)
 */
export interface OpenClawLogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * OpenClaw Plugin API
 *
 * The API object passed to plugin registration functions.
 * Provides methods to interact with the OpenClaw core system.
 *
 * @see https://docs.openclaw.ai/plugin
 */
export interface OpenClawPluginAPI {
  /** Plugin configuration object (validated against configSchema) */
  config: Record<string, unknown>;

  /**
   * Logger instance for plugin messages
   * @example api.logger.info("Plugin initialized")
   */
  logger: OpenClawLogger;

  /**
   * Register a tool that agents can invoke during LLM interactions
   *
   * @param definition - Tool definition with name, description, parameters, and execute function
   * @param options - Optional configuration (e.g., { optional: true } for allowlist-only tools)
   */
  registerTool(definition: ToolDefinition, options?: ToolOptions): void;
}

/**
 * Tool definition for OpenClaw agent tools
 */
export interface ToolDefinition {
  /** Tool identifier (snake_case recommended) */
  name: string;

  /** What the tool does (shown to LLM to decide when to use it) */
  description: string;

  /** JSON Schema for tool parameters */
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };

  /**
   * Handler function that executes the tool
   *
   * @param id - Unique execution ID (often unused, prefix with _)
   * @param params - Parameters matching the parameters schema
   * @returns Tool result with content array
   */
  execute: (id: string, params: any) => Promise<ToolResult>;
}

/**
 * Tool registration options
 */
export interface ToolOptions {
  /**
   * If true, tool must be explicitly allowed in agent config
   * Default: false (tool is always available)
   */
  optional?: boolean;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'file';
    text?: string;        // For type: "text"
    data?: string;        // For type: "image" (base64)
    mimeType?: string;    // For type: "image" or "file"
    url?: string;         // For type: "file"
  }>;
}

/**
 * Hook event received by hook handlers
 */
export interface OpenClawHookEvent {
  /** Event type (e.g., "message:received", "command:new") */
  type: string;

  /** Optional action identifier */
  action?: string;

  /** Event-specific data */
  data?: any;
}

/**
 * Hook handler result
 */
export interface OpenClawHookResult {
  /** If true, blocks the operation */
  blocked?: boolean;

  /** Reason for blocking (required if blocked is true) */
  reason?: string;

  /** Modified data to pass to next hook */
  modified?: any;

  /** Whether the hook succeeded */
  success?: boolean;

  /** Optional message */
  message?: string;
}

/**
 * Hook handler function signature
 *
 * @param event - The event that triggered this hook
 * @param context - OpenClaw context (agent state, user info, etc.)
 * @param api - Plugin API object
 * @returns Hook result with optional blocking, modifications, etc.
 */
export type OpenClawHookHandler = (
  event: OpenClawHookEvent,
  context: any,
  api: OpenClawPluginAPI
) => Promise<OpenClawHookResult>;

// ═══════════════════════════════════════════════════════════════════
// HOOK TYPES (INTERNAL)
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
  llm?: TieredLLM;           // Optional - may not be available if API key missing
  embedding?: EmbeddingService;  // Optional - may not be available if API key missing
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
  emit(event: HookEvent, data: unknown, metadata?: Record<string, unknown>): Promise<HookResult>;
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

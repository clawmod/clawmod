/**
 * Error classes for ClawMod
 */

export type ErrorSeverity = 'fatal' | 'degraded' | 'silent';

/**
 * Base error class for all ClawMod errors
 */
export class ClawModError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly severity: ErrorSeverity,
    public readonly recoverable: boolean,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ClawModError';
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      recoverable: this.recoverable,
      context: this.context,
    };
  }
}

/**
 * Storage-related errors (SQLite, file system)
 */
export class StorageError extends ClawModError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'STORAGE_ERROR', 'degraded', true, context);
    this.name = 'StorageError';
  }
}

/**
 * LLM API errors (OpenRouter, Anthropic, etc.)
 */
export class LLMError extends ClawModError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'LLM_ERROR', 'degraded', true, context);
    this.name = 'LLMError';
  }
}

/**
 * Configuration errors (invalid config, missing required fields)
 */
export class ConfigError extends ClawModError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', 'fatal', false, context);
    this.name = 'ConfigError';
  }
}

/**
 * Security errors (blocked content, audit failures)
 */
export class SecurityError extends ClawModError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SECURITY_ERROR', 'fatal', false, context);
    this.name = 'SecurityError';
  }
}

/**
 * Embedding service errors
 */
export class EmbeddingError extends ClawModError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'EMBEDDING_ERROR', 'degraded', true, context);
    this.name = 'EmbeddingError';
  }
}

/**
 * Memory operation errors
 */
export class MemoryError extends ClawModError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'MEMORY_ERROR', 'degraded', true, context);
    this.name = 'MemoryError';
  }
}

/**
 * Module loading/initialization errors
 */
export class ModuleError extends ClawModError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'MODULE_ERROR', 'degraded', true, context);
    this.name = 'ModuleError';
  }
}

/**
 * Hook execution errors
 */
export class HookError extends ClawModError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'HOOK_ERROR', 'silent', true, context);
    this.name = 'HookError';
  }
}

/**
 * Validation errors (invalid input, schema violations)
 */
export class ValidationError extends ClawModError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 'degraded', true, context);
    this.name = 'ValidationError';
  }
}

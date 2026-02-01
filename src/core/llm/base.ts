/**
 * Core LLM provider interfaces and types
 *
 * This module defines the base abstractions for LLM providers.
 * Concrete implementations (OpenRouter, Anthropic, Ollama) will implement these interfaces.
 */

/**
 * Token usage statistics for an LLM request
 */
export interface LLMUsage {
  /** Number of tokens in the prompt */
  promptTokens: number;
  /** Number of tokens generated in the completion */
  completionTokens: number;
  /** Total tokens (prompt + completion) */
  totalTokens: number;
}

/**
 * Request parameters for LLM generation
 */
export interface LLMRequest {
  /** The user prompt/message to send to the LLM */
  prompt: string;
  /** Model identifier (e.g., "anthropic/claude-3.5-sonnet") */
  model: string;
  /** Maximum tokens to generate (optional) */
  maxTokens?: number;
  /** Temperature for sampling (0.0-1.0, optional) */
  temperature?: number;
  /** System prompt to set context (optional) */
  systemPrompt?: string;
  /** Stop sequences to halt generation (optional) */
  stopSequences?: string[];
}

/**
 * Response from an LLM generation request
 */
export interface LLMResponse {
  /** Generated text content */
  content: string;
  /** Token usage statistics */
  usage: LLMUsage;
  /** Model that generated the response */
  model: string;
  /** Reason the generation finished (optional) */
  finishReason?: 'stop' | 'length' | 'error';
}

/**
 * Base interface for LLM provider implementations
 *
 * All LLM providers (OpenRouter, Anthropic, Ollama, etc.) must implement this interface.
 */
export interface LLMProvider {
  /** Human-readable provider name (e.g., "OpenRouter", "Anthropic", "Ollama") */
  readonly name: string;

  /**
   * Generate a completion from the LLM
   *
   * @param request - Request parameters including prompt and model
   * @returns Response with generated content and metadata
   * @throws {LLMError} If the generation fails
   */
  generate(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Check if this provider is available and properly configured
   *
   * @returns true if provider is ready to use, false otherwise
   */
  isAvailable(): Promise<boolean>;
}

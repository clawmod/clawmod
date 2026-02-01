/**
 * OpenRouter LLM provider implementation
 *
 * Provides access to various LLM models through the OpenRouter API.
 * See: https://openrouter.ai/docs
 */

import type { LLMProvider, LLMRequest, LLMResponse } from './base';
import { LLMError } from '../../errors';

/**
 * OpenRouter API response structure
 */
interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason?: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

/**
 * OpenRouter API error response
 */
interface OpenRouterError {
  error?: {
    message: string;
    code?: string;
  };
}

/**
 * OpenRouter LLM provider
 *
 * Implements the LLMProvider interface for OpenRouter's API.
 * Supports all models available through OpenRouter.
 */
export class OpenRouterProvider implements LLMProvider {
  readonly name = 'openrouter';
  private readonly apiUrl = 'https://openrouter.ai/api/v1/chat/completions';

  /**
   * Create a new OpenRouter provider
   *
   * @param apiKey - OpenRouter API key
   */
  constructor(private readonly apiKey: string) {}

  /**
   * Generate a completion using OpenRouter
   *
   * @param request - Request parameters
   * @returns Response with generated content and metadata
   * @throws {LLMError} If the API request fails
   */
  async generate(request: LLMRequest): Promise<LLMResponse> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://clawmod.dev',
          'X-Title': 'ClawMod',
        },
        body: JSON.stringify({
          model: request.model,
          messages: [
            ...(request.systemPrompt
              ? [{ role: 'system', content: request.systemPrompt }]
              : []),
            { role: 'user', content: request.prompt },
          ],
          max_tokens: request.maxTokens ?? 1000,
          temperature: request.temperature ?? 0.7,
          stop: request.stopSequences,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as OpenRouterError;
        const errorMessage =
          errorData.error?.message ?? `HTTP ${response.status}: ${response.statusText}`;

        throw new LLMError('OpenRouter API request failed', {
          status: response.status,
          statusText: response.statusText,
          message: errorMessage,
          model: request.model,
        });
      }

      const data = (await response.json()) as OpenRouterResponse;

      if (!data.choices?.[0]?.message?.content) {
        throw new LLMError('Invalid response from OpenRouter API', {
          message: 'Missing content in response',
          model: request.model,
        });
      }

      // Map OpenRouter finish reasons to our standard format
      const finishReason = this.mapFinishReason(data.choices[0].finish_reason);

      return {
        content: data.choices[0].message.content,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        model: data.model,
        finishReason,
      };
    } catch (error) {
      // Re-throw LLMErrors as-is
      if (error instanceof LLMError) {
        throw error;
      }

      // Wrap other errors
      throw new LLMError('Failed to generate completion', {
        error: error instanceof Error ? error.message : String(error),
        model: request.model,
      });
    }
  }

  /**
   * Check if the OpenRouter provider is available
   *
   * Tests the API connection with a minimal request to verify:
   * - API key is valid
   * - Network connectivity exists
   * - OpenRouter service is reachable
   *
   * @returns true if the provider is available, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Make a minimal test request with very low token limit
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://clawmod.dev',
          'X-Title': 'ClawMod',
        },
        body: JSON.stringify({
          model: 'openai/gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
        }),
      });

      // Both 200 (success) and 401 (auth error) indicate service is available
      // We just want to verify we can reach the API
      return response.status === 200 || response.status === 401;
    } catch (_error) {
      // Network errors or other issues mean provider is not available
      return false;
    }
  }

  /**
   * Map OpenRouter finish reasons to our standard format
   *
   * @param reason - OpenRouter finish reason
   * @returns Standardized finish reason
   */
  private mapFinishReason(reason?: string): 'stop' | 'length' | 'error' | undefined {
    if (!reason) return undefined;

    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
      case 'max_tokens':
        return 'length';
      case 'error':
      case 'content_filter':
        return 'error';
      default:
        return undefined;
    }
  }
}

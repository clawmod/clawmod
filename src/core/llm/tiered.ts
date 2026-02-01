/**
 * Tiered LLM implementation with fallback support
 *
 * Routes requests to appropriate models based on task type (scoring, extraction, powerful).
 * Implements fallback chain on failure for resilience.
 */

import type { TieredLLM } from '../../types';
import type { ClawModConfig } from '../config';
import type { LLMProvider } from './base';
import { OpenRouterProvider } from './openrouter';
import { LLMError } from '../../errors';

/**
 * Tiered LLM implementation that routes to different models based on task complexity
 *
 * - scoring: Fast, cheap model for importance scoring
 * - extraction: Capable model for structured data extraction
 * - powerful: Most capable model for complex reasoning
 *
 * Each tier supports fallback models if the primary model fails.
 */
export class TieredLLMImpl implements TieredLLM {
  private provider: LLMProvider;

  /**
   * Create a new TieredLLM instance
   *
   * @param config - ClawMod configuration containing model mappings and fallbacks
   */
  constructor(private config: ClawModConfig) {
    const apiKey = process.env[config.apiKeyEnv] || '';

    // Currently only OpenRouter is implemented
    // Future: support other providers based on config.provider
    this.provider = new OpenRouterProvider(apiKey);
  }

  /**
   * Fast, cheap model for importance scoring
   *
   * @param prompt - Scoring prompt
   * @returns Generated response text
   * @throws {LLMError} If all models (primary + fallbacks) fail
   */
  async scoring(prompt: string): Promise<string> {
    return this.generate(prompt, 'scoring');
  }

  /**
   * Capable model for structured data extraction
   *
   * @param prompt - Extraction prompt
   * @returns Generated response text
   * @throws {LLMError} If all models (primary + fallbacks) fail
   */
  async extraction(prompt: string): Promise<string> {
    return this.generate(prompt, 'extraction');
  }

  /**
   * Most powerful model for complex reasoning
   *
   * @param prompt - Complex reasoning prompt
   * @returns Generated response text
   * @throws {LLMError} If all models (primary + fallbacks) fail
   */
  async powerful(prompt: string): Promise<string> {
    return this.generate(prompt, 'powerful');
  }

  /**
   * Generate completion with fallback support
   *
   * Tries the primary model first, then each fallback in order until one succeeds.
   * If all models fail, throws an LLMError with details about the failures.
   *
   * @param prompt - User prompt to send to the LLM
   * @param task - Task type determining which model tier to use
   * @returns Generated text from the first successful model
   * @throws {LLMError} If all models fail
   */
  private async generate(
    prompt: string,
    task: keyof ClawModConfig['models']
  ): Promise<string> {
    const model = this.config.models[task];
    const fallbacks = this.config.fallbacks?.[task] || [];
    const modelsToTry = [model, ...fallbacks];

    const errors: Array<{ model: string; error: string }> = [];

    for (const modelId of modelsToTry) {
      try {
        const response = await this.provider.generate({
          prompt,
          model: modelId,
        });
        return response.content;
      } catch (error) {
        // Collect error for final error message
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ model: modelId, error: errorMessage });

        // Continue to next fallback
        continue;
      }
    }

    // All models failed
    throw new LLMError('All models failed for task', {
      task,
      primaryModel: model,
      fallbacks,
      errors,
    });
  }
}

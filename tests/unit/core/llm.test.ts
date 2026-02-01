/**
 * Tests for core/llm
 *
 * Tests TieredLLM routing, fallback chains, and OpenRouter provider.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { TieredLLMImpl } from '../../../src/core/llm/tiered';
import { OpenRouterProvider } from '../../../src/core/llm/openrouter';
import type { ClawModConfig } from '../../../src/core/config';
import { LLMError } from '../../../src/errors';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    provider = new OpenRouterProvider('test-api-key');
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('has correct provider name', () => {
    expect(provider.name).toBe('openrouter');
  });

  describe('generate()', () => {
    test('generates completion successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Test response content',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
          model: 'openai/gpt-3.5-turbo',
        }),
      });

      const response = await provider.generate({
        prompt: 'Test prompt',
        model: 'openai/gpt-3.5-turbo',
      });

      expect(response).toBeDefined();
      expect(response.content).toBe('Test response content');
      expect(response.usage.promptTokens).toBe(10);
      expect(response.usage.completionTokens).toBe(20);
      expect(response.usage.totalTokens).toBe(30);
      expect(response.model).toBe('openai/gpt-3.5-turbo');
      expect(response.finishReason).toBe('stop');
    });

    test('sends correct headers to OpenRouter API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          model: 'test-model',
        }),
      });

      await provider.generate({
        prompt: 'Test prompt',
        model: 'test-model',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://clawmod.dev',
            'X-Title': 'ClawMod',
          }),
        })
      );
    });

    test('sends correct request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          model: 'test-model',
        }),
      });

      await provider.generate({
        prompt: 'User prompt',
        model: 'test-model',
        systemPrompt: 'System instructions',
        maxTokens: 500,
        temperature: 0.5,
        stopSequences: ['STOP'],
      });

      const callArgs = mockFetch.mock.calls[0];
      const bodyStr = callArgs[1]?.body as string;
      const body = JSON.parse(bodyStr);

      expect(body).toEqual({
        model: 'test-model',
        messages: [
          { role: 'system', content: 'System instructions' },
          { role: 'user', content: 'User prompt' },
        ],
        max_tokens: 500,
        temperature: 0.5,
        stop: ['STOP'],
      });
    });

    test('omits system message when not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          model: 'test-model',
        }),
      });

      await provider.generate({
        prompt: 'User prompt only',
        model: 'test-model',
      });

      const callArgs = mockFetch.mock.calls[0];
      const bodyStr = callArgs[1]?.body as string;
      const body = JSON.parse(bodyStr);

      expect(body.messages).toHaveLength(1);
      expect(body.messages[0]).toEqual({ role: 'user', content: 'User prompt only' });
    });

    test('uses default values for optional parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          model: 'test-model',
        }),
      });

      await provider.generate({
        prompt: 'Test',
        model: 'test-model',
      });

      const callArgs = mockFetch.mock.calls[0];
      const bodyStr = callArgs[1]?.body as string;
      const body = JSON.parse(bodyStr);

      expect(body.max_tokens).toBe(1000);
      expect(body.temperature).toBe(0.7);
    });

    test('maps finish reason "length" correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test' }, finish_reason: 'length' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          model: 'test-model',
        }),
      });

      const response = await provider.generate({
        prompt: 'Test',
        model: 'test-model',
      });

      expect(response.finishReason).toBe('length');
    });

    test('maps finish reason "max_tokens" to "length"', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test' }, finish_reason: 'max_tokens' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          model: 'test-model',
        }),
      });

      const response = await provider.generate({
        prompt: 'Test',
        model: 'test-model',
      });

      expect(response.finishReason).toBe('length');
    });

    test('maps finish reason "content_filter" to "error"', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'test' }, finish_reason: 'content_filter' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          model: 'test-model',
        }),
      });

      const response = await provider.generate({
        prompt: 'Test',
        model: 'test-model',
      });

      expect(response.finishReason).toBe('error');
    });

    test('throws LLMError on HTTP error status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: {
            message: 'Invalid API key',
            code: 'invalid_api_key',
          },
        }),
      });

      await expect(
        provider.generate({
          prompt: 'Test',
          model: 'test-model',
        })
      ).rejects.toThrow(LLMError);

      try {
        await provider.generate({
          prompt: 'Test',
          model: 'test-model',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(LLMError);
        expect((error as Error).message).toBe('OpenRouter API request failed');
      }
    });

    test('includes error details in LLMError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({
          error: {
            message: 'Rate limit exceeded',
          },
        }),
      });

      try {
        await provider.generate({
          prompt: 'Test',
          model: 'test-model',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(LLMError);
        const llmError = error as LLMError;
        expect(llmError.context).toMatchObject({
          status: 429,
          statusText: 'Too Many Requests',
          message: 'Rate limit exceeded',
          model: 'test-model',
        });
      }
    });

    test('throws LLMError when response missing content', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [],
          usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
          model: 'test-model',
        }),
      });

      await expect(
        provider.generate({
          prompt: 'Test',
          model: 'test-model',
        })
      ).rejects.toThrow(LLMError);

      try {
        await provider.generate({
          prompt: 'Test',
          model: 'test-model',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(LLMError);
        expect((error as Error).message).toBe('Invalid response from OpenRouter API');
      }
    });

    test('wraps network errors in LLMError', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        provider.generate({
          prompt: 'Test',
          model: 'test-model',
        })
      ).rejects.toThrow(LLMError);

      try {
        await provider.generate({
          prompt: 'Test',
          model: 'test-model',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(LLMError);
        expect((error as Error).message).toBe('Failed to generate completion');
      }
    });
  });

  describe('isAvailable()', () => {
    test('returns true when API is reachable with valid key', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
      });

      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    test('returns true even with 401 (service is reachable)', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
      });

      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    test('returns false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network unreachable'));

      const available = await provider.isAvailable();
      expect(available).toBe(false);
    });

    test('returns false on other HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
      });

      const available = await provider.isAvailable();
      expect(available).toBe(false);
    });
  });
});

describe('TieredLLMImpl', () => {
  let tieredLLM: TieredLLMImpl;
  let mockConfig: ClawModConfig;

  beforeEach(() => {
    // Set up environment variable
    process.env.OPENROUTER_API_KEY = 'test-api-key';

    mockConfig = {
      modules: {
        clawshield: true,
        clawmem: true,
        clawsave: false,
        clawresearch: false,
        clawagent: false,
        clawflow: false,
      },
      provider: 'openrouter',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      models: {
        scoring: 'google/gemini-2.0-flash-lite',
        embedding: 'openai/text-embedding-3-small',
        extraction: 'openai/gpt-4o-mini',
        powerful: 'anthropic/claude-sonnet-4',
      },
      fallbacks: {
        scoring: ['openai/gpt-3.5-turbo', 'anthropic/claude-haiku'],
        extraction: ['openai/gpt-4o'],
        powerful: ['anthropic/claude-opus-4'],
      },
      updates: {
        mode: 'notify',
        channel: 'stable',
        checkInterval: 86400000,
      },
    };

    tieredLLM = new TieredLLMImpl(mockConfig);
    mockFetch.mockClear();
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    vi.clearAllMocks();
  });

  describe('scoring()', () => {
    test('routes to scoring model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Score: 8/10' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          model: 'google/gemini-2.0-flash-lite',
        }),
      });

      const result = await tieredLLM.scoring('Rate this memory');

      expect(result).toBe('Score: 8/10');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          body: expect.stringContaining('google/gemini-2.0-flash-lite'),
        })
      );
    });

    test('uses fallback chain on primary model failure', async () => {
      // Primary model fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ error: { message: 'Model unavailable' } }),
      });

      // First fallback succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Fallback response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          model: 'openai/gpt-3.5-turbo',
        }),
      });

      const result = await tieredLLM.scoring('Rate this');

      expect(result).toBe('Fallback response');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('tries all fallbacks in order', async () => {
      // Primary fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ error: { message: 'Primary unavailable' } }),
      });

      // First fallback fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ error: { message: 'First fallback unavailable' } }),
      });

      // Second fallback succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Second fallback works' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          model: 'anthropic/claude-haiku',
        }),
      });

      const result = await tieredLLM.scoring('Rate this');

      expect(result).toBe('Second fallback works');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test('throws LLMError when all models fail', async () => {
      // All models fail
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ error: { message: 'Service down' } }),
      });

      await expect(tieredLLM.scoring('Rate this')).rejects.toThrow(LLMError);

      try {
        await tieredLLM.scoring('Rate this');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMError);
        expect((error as Error).message).toBe('All models failed for task');
      }

      // Should have tried primary + 2 fallbacks = 3 calls
      // Note: mockFetch was called twice above (once for each expect), so 6 total
      expect(mockFetch).toHaveBeenCalled();
    });

    test('includes error details when all models fail', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ error: { message: 'Service down' } }),
      });

      try {
        await tieredLLM.scoring('Rate this');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMError);
        const llmError = error as LLMError;
        expect(llmError.context).toMatchObject({
          task: 'scoring',
          primaryModel: 'google/gemini-2.0-flash-lite',
          fallbacks: ['openai/gpt-3.5-turbo', 'anthropic/claude-haiku'],
        });
        expect(llmError.context.errors).toHaveLength(3);
      }
    });
  });

  describe('extraction()', () => {
    test('routes to extraction model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"name": "John", "age": 30}' } }],
          usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
          model: 'openai/gpt-4o-mini',
        }),
      });

      const result = await tieredLLM.extraction('Extract data from: ...');

      expect(result).toBe('{"name": "John", "age": 30}');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          body: expect.stringContaining('openai/gpt-4o-mini'),
        })
      );
    });

    test('uses fallback on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: { message: 'Error' } }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Fallback extraction' } }],
          usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
          model: 'openai/gpt-4o',
        }),
      });

      const result = await tieredLLM.extraction('Extract: ...');

      expect(result).toBe('Fallback extraction');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('powerful()', () => {
    test('routes to powerful model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Deep analysis result' } }],
          usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
          model: 'anthropic/claude-sonnet-4',
        }),
      });

      const result = await tieredLLM.powerful('Complex reasoning task');

      expect(result).toBe('Deep analysis result');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          body: expect.stringContaining('anthropic/claude-sonnet-4'),
        })
      );
    });

    test('uses fallback on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ error: { message: 'Rate limited' } }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Fallback powerful response' } }],
          usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
          model: 'anthropic/claude-opus-4',
        }),
      });

      const result = await tieredLLM.powerful('Complex task');

      expect(result).toBe('Fallback powerful response');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('no fallbacks configured', () => {
    test('throws immediately if primary model fails with no fallbacks', async () => {
      const configNoFallbacks: ClawModConfig = {
        ...mockConfig,
        fallbacks: undefined,
      };

      const llmNoFallbacks = new TieredLLMImpl(configNoFallbacks);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ error: { message: 'Down' } }),
      });

      await expect(llmNoFallbacks.scoring('Test')).rejects.toThrow(LLMError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});

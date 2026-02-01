/**
 * Embedding service implementation using OpenRouter API
 *
 * Provides text embeddings with LRU caching for efficiency.
 */

import { EmbeddingError } from '../errors';
import type { EmbeddingService } from '../types';
import type { ClawModConfig } from './config';

/**
 * OpenRouter API response structure for embeddings
 */
interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Embedding service with LRU cache and batch support
 */
export class EmbeddingServiceImpl implements EmbeddingService {
  private cache: Map<string, number[]> = new Map();
  private readonly maxCacheSize: number = 1000;
  private readonly apiKey: string;
  private readonly apiEndpoint: string = 'https://openrouter.ai/api/v1/embeddings';

  constructor(private config: ClawModConfig) {
    const apiKeyEnvVar = config.apiKeyEnv;
    this.apiKey = process.env[apiKeyEnvVar] || '';

    if (!this.apiKey) {
      throw new EmbeddingError(`API key not found in environment variable: ${apiKeyEnvVar}`, {
        envVar: apiKeyEnvVar,
      });
    }
  }

  /**
   * Embed a single text string
   *
   * Uses cache if available, otherwise fetches from API
   */
  async embed(text: string): Promise<number[]> {
    // Check cache first
    const cached = this.cache.get(text);
    if (cached) {
      return cached;
    }

    // Fetch single embedding using batch method
    const result = await this.embedBatch([text]);
    return result[0];
  }

  /**
   * Embed multiple text strings in a single API call
   *
   * Efficiently handles cache hits and only fetches uncached texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // Track uncached texts and their original indices
    const uncached: Array<{ index: number; text: string }> = [];
    const results: Array<number[] | null> = texts.map((text, i) => {
      const cached = this.cache.get(text);
      if (cached) {
        return cached;
      }
      uncached.push({ index: i, text });
      return null;
    });

    // Fetch embeddings for uncached texts
    if (uncached.length > 0) {
      const embeddings = await this.fetchEmbeddings(uncached.map(u => u.text));

      // Fill in results and update cache
      uncached.forEach((u, i) => {
        results[u.index] = embeddings[i];
        this.addToCache(u.text, embeddings[i]);
      });
    }

    return results as number[][];
  }

  /**
   * Fetch embeddings from OpenRouter API
   *
   * @private
   */
  private async fetchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/claw-industries/clawmod',
          'X-Title': 'ClawMod',
        },
        body: JSON.stringify({
          model: this.config.models.embedding,
          input: texts,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new EmbeddingError('Embedding API request failed', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
      }

      const data = await response.json() as EmbeddingResponse;

      if (!data.data || !Array.isArray(data.data)) {
        throw new EmbeddingError('Invalid API response format', {
          response: data,
        });
      }

      // Sort by index to ensure correct order
      const sorted = data.data.sort((a, b) => a.index - b.index);
      return sorted.map(d => d.embedding);
    } catch (error) {
      if (error instanceof EmbeddingError) {
        throw error;
      }

      throw new EmbeddingError('Failed to fetch embeddings', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Add embedding to LRU cache
   *
   * Evicts oldest entry if cache is full
   *
   * @private
   */
  private addToCache(text: string, embedding: number[]): void {
    // Evict oldest entry if cache is full (first key in Map)
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(text, embedding);
  }

  /**
   * Calculate cosine similarity between two vectors
   *
   * Returns a value between -1 (opposite) and 1 (identical)
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new EmbeddingError('Vector dimensions must match', {
        aLength: a.length,
        bLength: b.length,
      });
    }

    if (a.length === 0) {
      throw new EmbeddingError('Cannot calculate similarity of empty vectors');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);

    if (denominator === 0) {
      throw new EmbeddingError('Cannot calculate similarity of zero vectors');
    }

    return dotProduct / denominator;
  }
}

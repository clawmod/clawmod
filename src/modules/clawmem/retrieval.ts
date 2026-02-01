import type { Memory, EmbeddingService } from '../../types';

interface RetrievalWeights {
  recency: number;
  importance: number;
  relevance: number;
  frequency: number;
}

interface RetrievalConfig {
  weights: RetrievalWeights;
  maxResults: number;
}

interface ScoredMemory {
  memory: Memory;
  score: number;
  breakdown: {
    recency: number;
    importance: number;
    relevance: number;
    frequency: number;
  };
}

export class MemoryRetrieval {
  private config: RetrievalConfig;
  private embeddingService: EmbeddingService | null = null;

  constructor(config: RetrievalConfig) {
    this.config = config;
  }

  setEmbeddingService(service: EmbeddingService): void {
    this.embeddingService = service;
  }

  async search(
    query: string,
    memories: Memory[],
    limit?: number
  ): Promise<ScoredMemory[]> {
    const maxResults = limit ?? this.config.maxResults;

    // Get query embedding if service available
    let queryEmbedding: number[] | null = null;
    if (this.embeddingService) {
      try {
        queryEmbedding = await this.embeddingService.embed(query);
      } catch {
        // Fall back to text-only search
      }
    }

    // Score all memories
    const scored = memories.map(memory => this.scoreMemory(memory, queryEmbedding, query));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, maxResults);
  }

  private scoreMemory(memory: Memory, queryEmbedding: number[] | null, query: string): ScoredMemory {
    const { weights } = this.config;

    // Calculate recency score (exponential decay)
    const hoursSinceAccess = (Date.now() - new Date(memory.lastAccessedAt).getTime()) / 3600000;
    const recencyScore = Math.exp(-0.693 * hoursSinceAccess / 24);

    // Importance score (0-1)
    const importanceScore = memory.importance / 10;

    // Relevance score (semantic or text-based)
    let relevanceScore = 0;
    if (queryEmbedding && memory.embedding.length > 0) {
      relevanceScore = this.cosineSimilarity(queryEmbedding, memory.embedding);
    } else {
      // Fall back to simple text matching
      relevanceScore = this.textSimilarity(query, memory.content);
    }

    // Frequency score (logarithmic)
    const frequencyScore = Math.log2(memory.accessCount + 1) / 10;

    // Weighted combination
    const weightSum = weights.recency + weights.importance + weights.relevance + weights.frequency;
    const score = (
      weights.recency * recencyScore +
      weights.importance * importanceScore +
      weights.relevance * relevanceScore +
      weights.frequency * frequencyScore
    ) / weightSum;

    return {
      memory,
      score,
      breakdown: {
        recency: recencyScore,
        importance: importanceScore,
        relevance: relevanceScore,
        frequency: frequencyScore
      }
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  private textSimilarity(query: string, content: string): number {
    // Simple overlap-based similarity
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const contentWords = content.toLowerCase().split(/\s+/);

    let matches = 0;
    for (const word of contentWords) {
      if (queryWords.has(word)) matches++;
    }

    return Math.min(1, matches / Math.max(1, queryWords.size));
  }

  buildContext(scoredMemories: ScoredMemory[], maxTokens: number = 1000): string {
    const parts: string[] = [];
    let tokens = 0;

    for (const { memory, score } of scoredMemories) {
      const memoryTokens = Math.ceil(memory.content.length / 4);
      if (tokens + memoryTokens > maxTokens) break;

      parts.push(`[Relevance: ${(score * 100).toFixed(1)}%] ${memory.content}`);
      tokens += memoryTokens;
    }

    return parts.join('\n\n');
  }
}

export type { RetrievalConfig, RetrievalWeights, ScoredMemory };

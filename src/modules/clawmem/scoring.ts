import type { TieredLLM } from '../../types';

interface ScoringConfig {
  minImportance: number;
  batchSize: number;
}

export class ImportanceScorer {
  private config: ScoringConfig;
  private llm: TieredLLM | null = null;
  private cache: Map<string, number> = new Map();

  constructor(config: ScoringConfig) {
    this.config = config;
  }

  setLLM(llm: TieredLLM): void {
    this.llm = llm;
  }

  async score(content: string): Promise<number> {
    // Check cache first
    const cacheKey = this.hashContent(content);
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached;

    if (!this.llm) {
      // Default to middle importance if no LLM
      return 5;
    }

    const prompt = this.buildPrompt(content);
    const response = await this.llm.scoring(prompt);
    const score = this.parseScore(response);

    this.cache.set(cacheKey, score);
    return score;
  }

  async scoreBatch(contents: string[]): Promise<number[]> {
    const results: number[] = [];

    // Process in batches
    for (let i = 0; i < contents.length; i += this.config.batchSize) {
      const batch = contents.slice(i, i + this.config.batchSize);
      const scores = await Promise.all(batch.map(c => this.score(c)));
      results.push(...scores);
    }

    return results;
  }

  shouldStore(importance: number): boolean {
    return importance >= this.config.minImportance;
  }

  private buildPrompt(content: string): string {
    return `On a scale of 1-10, rate the importance of this memory:
1 = mundane (routine tasks, small talk)
5 = moderately significant (project milestone, useful tip)
10 = extremely important (major life event, critical insight)

Memory: "${content}"

Consider: emotional significance, long-term relevance, uniqueness.
Respond with just the number.`;
  }

  private parseScore(response: string): number {
    const match = response.match(/\d+/);
    if (!match) return 5;

    const score = parseInt(match[0], 10);
    return Math.max(1, Math.min(10, score));
  }

  private hashContent(content: string): string {
    // Simple hash for cache key
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export type { ScoringConfig };

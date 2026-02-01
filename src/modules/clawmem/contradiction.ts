import type { Memory, TieredLLM } from '../../types';

interface ContradictionConfig {
  enabled: boolean;
  similarityThreshold: number;
  autoResolve: boolean;
}

interface ContradictionResult {
  isConflict: boolean;
  type: 'update' | 'contradiction' | 'refinement' | 'none';
  resolution: 'replace' | 'merge' | 'version' | 'flag' | 'none';
  explanation: string;
  existingMemory: Memory;
  newContent: string;
}

export class ContradictionDetector {
  private config: ContradictionConfig;
  private llm: TieredLLM | null = null;

  constructor(config: ContradictionConfig) {
    this.config = config;
  }

  setLLM(llm: TieredLLM): void {
    this.llm = llm;
  }

  async detect(existing: Memory, newContent: string): Promise<ContradictionResult> {
    if (!this.config.enabled) {
      return {
        isConflict: false,
        type: 'none',
        resolution: 'none',
        explanation: 'Contradiction detection disabled',
        existingMemory: existing,
        newContent
      };
    }

    if (!this.llm) {
      // Can't detect without LLM
      return {
        isConflict: false,
        type: 'none',
        resolution: 'none',
        explanation: 'No LLM available for detection',
        existingMemory: existing,
        newContent
      };
    }

    const prompt = this.buildPrompt(existing.content, newContent);
    const response = await this.llm.extraction(prompt);

    return this.parseResponse(response, existing, newContent);
  }

  async findConflicts(newContent: string, memories: Memory[]): Promise<ContradictionResult[]> {
    const conflicts: ContradictionResult[] = [];

    for (const memory of memories) {
      const result = await this.detect(memory, newContent);
      if (result.isConflict) {
        conflicts.push(result);
      }
    }

    return conflicts;
  }

  async resolve(result: ContradictionResult): Promise<Memory | null> {
    if (!result.isConflict || !this.config.autoResolve) {
      return null;
    }

    switch (result.resolution) {
      case 'replace':
        return {
          ...result.existingMemory,
          content: result.newContent,
          lastAccessedAt: new Date()
        };
      case 'merge':
        return {
          ...result.existingMemory,
          content: `${result.existingMemory.content}\n\nUpdate: ${result.newContent}`,
          lastAccessedAt: new Date()
        };
      case 'version':
      case 'flag':
      default:
        return null; // Manual resolution required
    }
  }

  private buildPrompt(existing: string, newContent: string): string {
    return `Compare these two memories and determine if they conflict:
Memory A (existing): "${existing}"
Memory B (new): "${newContent}"

Respond with JSON:
{
  "isConflict": true/false,
  "type": "update" | "contradiction" | "refinement",
  "resolution": "replace" | "merge" | "version" | "flag",
  "explanation": "brief reason"
}`;
  }

  private parseResponse(response: string, existing: Memory, newContent: string): ContradictionResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.defaultResult(existing, newContent);
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        isConflict: Boolean(parsed.isConflict),
        type: parsed.type || 'none',
        resolution: parsed.resolution || 'none',
        explanation: parsed.explanation || '',
        existingMemory: existing,
        newContent
      };
    } catch {
      return this.defaultResult(existing, newContent);
    }
  }

  private defaultResult(existing: Memory, newContent: string): ContradictionResult {
    return {
      isConflict: false,
      type: 'none',
      resolution: 'none',
      explanation: 'Could not determine conflict',
      existingMemory: existing,
      newContent
    };
  }
}

export type { ContradictionConfig, ContradictionResult };

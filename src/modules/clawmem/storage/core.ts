/**
 * Core Memory Storage for ClawMem (Tier 1)
 *
 * Manages persona.md, user_profile.md, current_goals.md
 * Always loaded into system prompt
 * Max 2000 tokens
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════

export interface CoreMemoryConfig {
  maxTokens: number;
  files: string[];
  coreDir: string;
}

export interface CoreMemoryFile {
  name: string;
  content: string;
  tokens: number;
}

// ═══════════════════════════════════════════════════════════════════
// CORE MEMORY STORAGE
// ═══════════════════════════════════════════════════════════════════

/**
 * Storage manager for Tier 1 core memory files
 *
 * Features:
 * - Read/write markdown files from core directory
 * - Token counting (approximate: 4 chars = 1 token)
 * - Respect maxTokens limit
 * - Load all core files on init
 */
export class CoreMemoryStorage {
  private config: CoreMemoryConfig;
  private files: Map<string, CoreMemoryFile> = new Map();

  constructor(config: CoreMemoryConfig) {
    this.config = config;
  }

  /**
   * Initialize storage: create directory and load all core files
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.coreDir, { recursive: true });

    for (const filename of this.config.files) {
      await this.loadFile(filename);
    }
  }

  /**
   * Load a single file from disk
   * Creates empty file if it doesn't exist
   */
  private async loadFile(filename: string): Promise<void> {
    const filepath = path.join(this.config.coreDir, filename);
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      this.files.set(filename, {
        name: filename,
        content,
        tokens: this.countTokens(content),
      });
    } catch {
      // File doesn't exist, create empty
      this.files.set(filename, { name: filename, content: '', tokens: 0 });
    }
  }

  /**
   * Get content of a specific file
   */
  async get(filename: string): Promise<string | undefined> {
    return this.files.get(filename)?.content;
  }

  /**
   * Set content of a specific file
   * Throws if total tokens would exceed maxTokens
   */
  async set(filename: string, content: string): Promise<void> {
    const tokens = this.countTokens(content);
    const totalTokens = this.getTotalTokens() - (this.files.get(filename)?.tokens ?? 0) + tokens;

    if (totalTokens > this.config.maxTokens) {
      throw new Error(
        `Core memory would exceed max tokens (${totalTokens} > ${this.config.maxTokens})`
      );
    }

    this.files.set(filename, { name: filename, content, tokens });

    const filepath = path.join(this.config.coreDir, filename);
    await fs.writeFile(filepath, content, 'utf-8');
  }

  /**
   * Append content to a file
   * Throws if total tokens would exceed maxTokens
   */
  async append(filename: string, content: string): Promise<void> {
    const existing = (await this.get(filename)) ?? '';
    await this.set(filename, existing + content);
  }

  /**
   * Get all core memory files
   */
  getAll(): CoreMemoryFile[] {
    return Array.from(this.files.values());
  }

  /**
   * Get total token count across all files
   */
  getTotalTokens(): number {
    let total = 0;
    for (const file of this.files.values()) {
      total += file.tokens;
    }
    return total;
  }

  /**
   * Build system prompt context from core memories
   * Returns formatted markdown with file sections
   */
  buildContext(): string {
    const parts: string[] = [];
    for (const file of this.files.values()) {
      if (file.content) {
        parts.push(`## ${file.name}\n${file.content}`);
      }
    }
    return parts.join('\n\n');
  }

  /**
   * Count tokens in text
   * Approximate: 4 characters = 1 token
   */
  private countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

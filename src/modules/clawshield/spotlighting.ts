/**
 * Spotlighting (Datamarking) Implementation for ClawShield
 *
 * Provides functionality to mark untrusted content with special tokens
 * to help LLMs identify and handle potentially unsafe input.
 */

/**
 * Configuration for the Spotlighter
 */
export interface SpotlightConfig {
  enabled?: boolean;
  tokenInterval?: number;
  startMarker?: string;
  endMarker?: string;
  inlineMarker?: string;
}

/**
 * Spotlighter class for marking untrusted content
 *
 * Inserts special tokens around and within untrusted content to help
 * LLMs identify potentially malicious input and prevent injection attacks.
 */
export class Spotlighter {
  private enabled: boolean;
  private tokenInterval: number;
  private startMarker: string;
  private endMarker: string;
  private inlineMarker: string;

  constructor(config: SpotlightConfig = {}) {
    this.enabled = config.enabled ?? true;
    this.tokenInterval = config.tokenInterval ?? 5;
    this.startMarker = config.startMarker ?? '«UNTRUSTED_START»';
    this.endMarker = config.endMarker ?? '«UNTRUSTED_END»';
    this.inlineMarker = config.inlineMarker ?? '«»';
  }

  /**
   * Apply spotlighting to untrusted content
   *
   * Wraps content with start/end markers and inserts inline markers
   * at regular intervals to break up potential injection attacks.
   *
   * @param content - The untrusted content to mark
   * @returns The content with spotlighting markers applied
   *
   * @example
   * const spotlighter = new Spotlighter();
   * const marked = spotlighter.mark('This is untrusted user input');
   * // Returns: «UNTRUSTED_START»This is untrusted user«»input«UNTRUSTED_END»
   */
  mark(content: string): string {
    if (!this.enabled || !content) return content;

    const words = content.split(/(\s+)/);
    const markedWords: string[] = [];
    let wordCount = 0;

    for (const token of words) {
      // Check if it's a word (not whitespace)
      if (/\S/.test(token)) {
        wordCount++;
        markedWords.push(token);

        // Insert inline marker every N words
        if (wordCount % this.tokenInterval === 0) {
          markedWords.push(this.inlineMarker);
        }
      } else {
        markedWords.push(token);
      }
    }

    return `${this.startMarker}${markedWords.join('')}${this.endMarker}`;
  }

  /**
   * Remove spotlighting markers from content
   *
   * Strips all start, end, and inline markers from the content,
   * returning the original unmarked text.
   *
   * @param content - The content with spotlighting markers
   * @returns The content with all markers removed
   *
   * @example
   * const spotlighter = new Spotlighter();
   * const unmarked = spotlighter.unmark('«UNTRUSTED_START»text«»here«UNTRUSTED_END»');
   * // Returns: 'texthere'
   */
  unmark(content: string): string {
    if (!content) return content;

    return content
      .replace(new RegExp(this.escapeRegex(this.startMarker), 'g'), '')
      .replace(new RegExp(this.escapeRegex(this.endMarker), 'g'), '')
      .replace(new RegExp(this.escapeRegex(this.inlineMarker), 'g'), '');
  }

  /**
   * Check if content contains spotlighting markers
   *
   * @param content - The content to check
   * @returns True if the content contains any spotlighting markers
   *
   * @example
   * const spotlighter = new Spotlighter();
   * spotlighter.isMarked('«UNTRUSTED_START»text«UNTRUSTED_END»'); // true
   * spotlighter.isMarked('normal text'); // false
   */
  isMarked(content: string): boolean {
    return content.includes(this.startMarker) || content.includes(this.endMarker);
  }

  /**
   * Escape special regex characters in a string
   *
   * @param str - The string to escape
   * @returns The escaped string safe for use in a RegExp
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * PII (Personally Identifiable Information) Detection Module
 *
 * Detects and redacts common PII patterns:
 * - Email addresses
 * - Phone numbers (various formats)
 * - Social Security Numbers
 * - Credit card numbers
 */

import type { PIIMatch } from '../../types';

interface PIIDetectorConfig {
  redactionStyle?: string;
  types?: Array<PIIMatch['type']>;
}

interface RedactResult {
  content: string;
  redactions: PIIMatch[];
}

/**
 * PII detection patterns
 * Using global flag for regex to find all matches
 */
const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
  ssn: /\d{3}[-\s]?\d{2}[-\s]?\d{4}/g,
  creditcard: /(?:\d{4}[-\s]?){3}\d{4}|\d{15}/g,
} as const;

export class PIIDetector {
  private readonly patterns: Map<PIIMatch['type'], RegExp>;
  private readonly redactionStyle: string;

  constructor(config: PIIDetectorConfig = {}) {
    this.redactionStyle = config.redactionStyle ?? '[REDACTED]';
    this.patterns = new Map();
    this.initPatterns(config.types);
  }

  /**
   * Initialize detection patterns based on configuration
   */
  private initPatterns(types?: Array<PIIMatch['type']>): void {
    // If types specified, only use those; otherwise use all
    const enabledTypes = types ?? (['email', 'phone', 'ssn', 'creditcard'] as const);

    for (const type of enabledTypes) {
      if (type === 'other') continue; // 'other' is not a detectable pattern
      if (type in PII_PATTERNS) {
        // Create new RegExp instances to avoid shared state
        this.patterns.set(type, new RegExp(PII_PATTERNS[type].source, 'g'));
      }
    }
  }

  /**
   * Detect all PII in the given text
   * Returns an array of PIIMatch objects with type, value, and position
   */
  detect(text: string): PIIMatch[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const matches: PIIMatch[] = [];

    for (const [type, pattern] of this.patterns) {
      // Reset lastIndex to start from beginning
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        matches.push({
          type,
          value: match[0],
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    // Sort by position and remove overlapping matches
    return this.deduplicateAndSort(matches);
  }

  /**
   * Redact all PII in the given text
   * Returns the redacted text and an array of what was redacted
   */
  redact(text: string): RedactResult {
    const matches = this.detect(text);

    if (matches.length === 0) {
      return { content: text, redactions: [] };
    }

    let content = text;

    // Process matches in reverse order to maintain positions
    // This way, we don't need to adjust positions as we replace
    const sortedMatches = [...matches].sort((a, b) => b.start - a.start);

    for (const match of sortedMatches) {
      content =
        content.slice(0, match.start) +
        this.redactionStyle +
        content.slice(match.end);
    }

    return { content, redactions: matches };
  }

  /**
   * Remove overlapping matches and sort by position
   * When matches overlap, keep the longer one
   */
  private deduplicateAndSort(matches: PIIMatch[]): PIIMatch[] {
    if (matches.length === 0) {
      return [];
    }

    // Sort by start position
    matches.sort((a, b) => a.start - b.start);

    // Remove overlapping matches (keep longer ones)
    const result: PIIMatch[] = [];

    for (const match of matches) {
      const last = result[result.length - 1];

      if (!last || match.start >= last.end) {
        // No overlap, add the match
        result.push(match);
      } else if (match.end - match.start > last.end - last.start) {
        // Current match is longer, replace the last one
        result[result.length - 1] = match;
      }
      // Otherwise, skip the current match (last one is longer)
    }

    return result;
  }
}

/**
 * Secret detection using pattern matching and Shannon entropy
 */

import type { SecretMatch } from '../../types';

interface SecretScanOptions {
  entropyThreshold?: number;
  patterns?: string[];
}

interface SecretScannerConfig {
  entropyThreshold?: number;
  patterns?: string[];
}

export class SecretScanner {
  private readonly patterns: Map<string, RegExp>;
  private readonly entropyThreshold: number;

  constructor(config: SecretScannerConfig = {}) {
    this.entropyThreshold = config.entropyThreshold ?? 4.5;
    this.patterns = new Map();
    this.initPatterns(config.patterns);
  }

  private initPatterns(filter?: string[]): void {
    // All patterns with global flag for multiple matches
    const allPatterns: Record<string, RegExp> = {
      aws_access_key: /AKIA[0-9A-Z]{16}/g,
      aws_secret_key: /[0-9a-zA-Z/+]{40}/g,
      github_token: /gh[pousr]_[A-Za-z0-9_]{36,}/g,
      openai_key: /sk-[A-Za-z0-9]{48}/g,
      anthropic_key: /sk-ant-[A-Za-z0-9-]{95}/g,
      generic_api_key: /(?:api[_-]?key|apikey|api_secret)['":\s]*[=:]\s*['"]?([A-Za-z0-9_-]{20,})['"]?/gi,
      jwt: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      private_key: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    };

    for (const [name, regex] of Object.entries(allPatterns)) {
      if (!filter || filter.includes(name)) {
        this.patterns.set(name, regex);
      }
    }
  }

  scan(text: string, options?: SecretScanOptions): SecretMatch[] {
    if (!text || typeof text !== 'string') return [];

    const matches: SecretMatch[] = [];
    const entropyThreshold = options?.entropyThreshold ?? this.entropyThreshold;
    const patternMatches = new Set<string>(); // Track positions matched by patterns

    for (const [type, pattern] of this.patterns) {
      // Reset regex lastIndex for stateless scanning
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(text)) !== null) {
        // For generic_api_key, use capture group if available
        const value = match[1] ?? match[0];
        const start = match[1] ? text.indexOf(match[1], match.index) : match.index;
        const end = start + value.length;

        // Check for false positives
        if (this.isFalsePositive(value, type)) continue;

        matches.push({ type, value, start, end });

        // Track the FULL match range (including original match with dots for JWT)
        // so entropy scanner doesn't duplicate it
        const fullStart = match.index;
        const fullEnd = match.index + match[0].length;
        for (let i = fullStart; i < fullEnd; i++) {
          patternMatches.add(`${i}`);
        }
      }
    }

    // Also check for high-entropy strings (excluding already matched regions)
    matches.push(...this.scanHighEntropy(text, entropyThreshold, patternMatches));

    // Remove duplicates (same position and value)
    const seen = new Set<string>();
    const uniqueMatches = matches.filter(m => {
      const key = `${m.start}-${m.end}-${m.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Remove matches that are fully contained within larger matches
    // (e.g., aws_secret_key matching inside a JWT)
    const filteredMatches = uniqueMatches.filter((m) => {
      for (const other of uniqueMatches) {
        if (m === other) continue;
        // Check if m is contained within other
        if (m.start >= other.start && m.end <= other.end && m.value !== other.value) {
          return false;
        }
      }
      return true;
    });

    // Sort by position
    return filteredMatches.sort((a, b) => a.start - b.start);
  }

  private isFalsePositive(value: string, _type: string): boolean {
    // UUIDs
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return true;
    }

    // Placeholders
    if (/YOUR_|_HERE|<.*>|INSERT_/.test(value)) {
      return true;
    }

    // All X's (placeholder pattern)
    if (/^[Xx]+$/.test(value)) {
      return true;
    }

    return false;
  }

  private calculateEntropy(text: string): number {
    if (text.length === 0) return 0;

    const freq = new Map<string, number>();
    for (const char of text) {
      freq.set(char, (freq.get(char) ?? 0) + 1);
    }

    let entropy = 0;
    for (const count of freq.values()) {
      const p = count / text.length;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  private scanHighEntropy(text: string, entropyThreshold: number, patternMatches: Set<string>): SecretMatch[] {
    const matches: SecretMatch[] = [];
    // Find long sequences that might be secrets (20+ chars)
    // Exclude dots to avoid matching parts of JWTs
    const pattern = /[A-Za-z0-9_\-$#@!%&*]{20,}/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const value = match[0];
      const start = match.index;
      const end = start + value.length;

      // Skip if this range is already matched by a pattern
      let overlapsPattern = false;
      for (let i = start; i < end; i++) {
        if (patternMatches.has(`${i}`)) {
          overlapsPattern = true;
          break;
        }
      }
      if (overlapsPattern) continue;

      // Skip if part of a JWT (contains dots around it)
      const beforeChar = start > 0 ? text[start - 1] : '';
      const afterChar = end < text.length ? text[end] : '';
      if (beforeChar === '.' || afterChar === '.') continue;

      const entropy = this.calculateEntropy(value);

      if (entropy >= entropyThreshold && !this.isFalsePositive(value, 'high_entropy')) {
        matches.push({
          type: 'high_entropy',
          value,
          start,
          end,
        });
      }
    }

    return matches;
  }
}

/**
 * Fuzz tests for SecretScanner using property-based testing
 * Ensures the scanner never crashes on arbitrary input and maintains invariants
 */

import { describe, test, expect } from 'vitest';
import { fc, test as fcTest } from '@fast-check/vitest';
import { SecretScanner } from '../../src/modules/clawshield/secrets';

// Helper to generate hex strings (hexa() arbitrary for fc.string)
const hexa = () => fc.integer({ min: 0, max: 15 }).map((n) => '0123456789abcdef'[n]);
const hexaString = (constraints: { minLength?: number; maxLength?: number } = {}) =>
  fc.string({ ...constraints, unit: hexa() });

describe('SecretScanner Fuzz Tests', () => {
  const scanner = new SecretScanner();

  describe('Crash resistance', () => {
    fcTest.prop([fc.string()])('never crashes on arbitrary input', (input) => {
      expect(() => scanner.scan(input)).not.toThrow();
    });

    fcTest.prop([fc.string({ minLength: 1000, maxLength: 10000 })])(
      'handles long strings',
      (input) => {
        expect(() => scanner.scan(input)).not.toThrow();
      }
    );

    fcTest.prop([fc.string({ unit: 'grapheme' })])('handles Unicode strings', (input) => {
      expect(() => scanner.scan(input)).not.toThrow();
    });

    fcTest.prop([fc.string({ unit: 'binary' })])('handles full Unicode range', (input) => {
      expect(() => scanner.scan(input)).not.toThrow();
    });

    fcTest.prop([fc.string({ unit: 'binary-ascii' })])('handles ASCII strings', (input) => {
      expect(() => scanner.scan(input)).not.toThrow();
    });

    fcTest.prop([hexaString()])(
      'handles hexadecimal strings',
      (input) => {
        expect(() => scanner.scan(input)).not.toThrow();
      }
    );

    fcTest.prop([fc.base64String()])(
      'handles base64 strings',
      (input) => {
        expect(() => scanner.scan(input)).not.toThrow();
      }
    );

    fcTest.prop([
      fc.array(fc.string({ minLength: 1, maxLength: 1 }), { minLength: 0, maxLength: 5000 }),
    ])('handles arrays of characters', (chars) => {
      const input = chars.join('');
      expect(() => scanner.scan(input)).not.toThrow();
    });

    fcTest.prop([
      fc.string({ unit: fc.constantFrom('\n', '\r', '\t', ' ', '\0') }),
    ])('handles whitespace and control characters', (input) => {
      expect(() => scanner.scan(input)).not.toThrow();
    });

    fcTest.prop([
      fc.string({ unit: fc.constantFrom('!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '=', '+', '[', ']', '{', '}', '|', '\\', ';', ':', "'", '"', '<', '>', ',', '.', '/', '?', '`', '~') }),
    ])('handles special characters', (input) => {
      expect(() => scanner.scan(input)).not.toThrow();
    });
  });

  describe('Determinism', () => {
    fcTest.prop([fc.string()])('returns deterministic results', (input) => {
      const result1 = scanner.scan(input);
      const result2 = scanner.scan(input);
      expect(result1).toEqual(result2);
    });

    fcTest.prop([fc.string({ minLength: 100, maxLength: 1000 })])(
      'returns deterministic results on long strings',
      (input) => {
        const result1 = scanner.scan(input);
        const result2 = scanner.scan(input);
        expect(result1).toEqual(result2);
      }
    );

    fcTest.prop([fc.string({ unit: 'grapheme' })])(
      'returns deterministic results on Unicode',
      (input) => {
        const result1 = scanner.scan(input);
        const result2 = scanner.scan(input);
        expect(result1).toEqual(result2);
      }
    );
  });

  describe('Output validity', () => {
    fcTest.prop([fc.string()])('returns valid SecretMatch array', (input) => {
      const result = scanner.scan(input);
      expect(Array.isArray(result)).toBe(true);

      for (const match of result) {
        expect(typeof match.type).toBe('string');
        expect(typeof match.value).toBe('string');
        expect(typeof match.start).toBe('number');
        expect(typeof match.end).toBe('number');
        expect(match.start).toBeGreaterThanOrEqual(0);
        expect(match.end).toBeGreaterThanOrEqual(match.start);
        expect(match.start).toBeLessThanOrEqual(input.length);
        expect(match.end).toBeLessThanOrEqual(input.length);
      }
    });

    fcTest.prop([fc.string()])(
      'matched values exist in original text',
      (input) => {
        const result = scanner.scan(input);

        for (const match of result) {
          const extractedValue = input.substring(match.start, match.end);
          expect(extractedValue).toBe(match.value);
        }
      }
    );

    fcTest.prop([fc.string()])(
      'matches are sorted by position',
      (input) => {
        const result = scanner.scan(input);

        for (let i = 1; i < result.length; i++) {
          expect(result[i].start).toBeGreaterThanOrEqual(result[i - 1].start);
        }
      }
    );

    fcTest.prop([fc.string()])(
      'matches do not overlap',
      (input) => {
        const result = scanner.scan(input);

        for (let i = 1; i < result.length; i++) {
          // Current match starts after or at the end of previous match
          expect(result[i].start).toBeGreaterThanOrEqual(result[i - 1].end);
        }
      }
    );

    fcTest.prop([fc.string()])(
      'no duplicate matches at same position',
      (input) => {
        const result = scanner.scan(input);
        const positions = new Set<string>();

        for (const match of result) {
          const key = `${match.start}-${match.end}`;
          expect(positions.has(key)).toBe(false);
          positions.add(key);
        }
      }
    );
  });

  describe('Edge cases', () => {
    test('handles empty string', () => {
      expect(() => scanner.scan('')).not.toThrow();
      expect(scanner.scan('')).toEqual([]);
    });

    fcTest.prop([fc.nat(10000)])('handles strings of same character', (length) => {
      const input = 'a'.repeat(length);
      expect(() => scanner.scan(input)).not.toThrow();
    });

    fcTest.prop([fc.nat(100)], { timeout: 10000 })(
      'handles repeated patterns',
      (repeatCount) => {
        const pattern = 'AKIAIOSFODNN7EXAMPLE';
        const input = pattern.repeat(repeatCount);
        expect(() => scanner.scan(input)).not.toThrow();
        const result = scanner.scan(input);
        expect(result.length).toBeLessThanOrEqual(repeatCount);
      }
    );

    fcTest.prop([
      fc.array(fc.constantFrom('\n', ' ', '\t'), { minLength: 0, maxLength: 1000 }),
    ])('handles whitespace-only strings', (whitespace) => {
      const input = whitespace.join('');
      expect(() => scanner.scan(input)).not.toThrow();
    });

    fcTest.prop([fc.integer({ min: 0, max: 10000 })], { timeout: 15000 })(
      'handles strings of zeros',
      (length) => {
        const input = '0'.repeat(length);
        expect(() => scanner.scan(input)).not.toThrow();
      }
    );
  });

  describe('Options handling', () => {
    fcTest.prop([fc.string(), fc.double({ min: 0, max: 10 })])(
      'handles different entropy thresholds',
      (input, threshold) => {
        expect(() => scanner.scan(input, { entropyThreshold: threshold })).not.toThrow();
      }
    );

    fcTest.prop([fc.string()])(
      'handles custom pattern filters',
      (input) => {
        expect(() => scanner.scan(input, { patterns: ['aws_access_key'] })).not.toThrow();
      }
    );
  });

  describe('Scanner configuration', () => {
    fcTest.prop([fc.string(), fc.double({ min: 0, max: 10 })])(
      'handles custom entropy threshold in constructor',
      (input, threshold) => {
        const customScanner = new SecretScanner({ entropyThreshold: threshold });
        expect(() => customScanner.scan(input)).not.toThrow();
      }
    );

    fcTest.prop([fc.string()])(
      'handles custom patterns in constructor',
      (input) => {
        const customScanner = new SecretScanner({ patterns: ['github_token', 'openai_key'] });
        expect(() => customScanner.scan(input)).not.toThrow();
      }
    );
  });

  describe('Real-world patterns', () => {
    fcTest.prop([
      fc.array(hexaString({ minLength: 16, maxLength: 64 }), { maxLength: 100 }),
      fc.array(fc.string({ minLength: 0, maxLength: 50 }), { maxLength: 100 }),
    ])('handles mixed hex strings and noise', (hexStrings, noise) => {
      const parts: string[] = [];
      for (let i = 0; i < Math.max(hexStrings.length, noise.length); i++) {
        if (i < hexStrings.length) parts.push(hexStrings[i]);
        if (i < noise.length) parts.push(noise[i]);
      }
      const input = parts.join(' ');
      expect(() => scanner.scan(input)).not.toThrow();
    });

    fcTest.prop([
      fc.array(fc.base64String({ minLength: 20, maxLength: 100 }), { maxLength: 50 }),
    ])('handles multiple base64 strings', (base64Strings) => {
      const input = base64Strings.join('\n');
      expect(() => scanner.scan(input)).not.toThrow();
    });

    fcTest.prop([
      fc.array(fc.constantFrom('AKIA', 'sk-', 'ghp_', 'sk-ant-', 'eyJ'), { minLength: 1, maxLength: 100 }),
      fc.array(fc.string({ unit: 'binary-ascii', minLength: 0, maxLength: 100 }), { minLength: 1, maxLength: 100 }),
    ])('handles potential secret prefixes with random suffixes', (prefixes, suffixes) => {
      const parts: string[] = [];
      for (let i = 0; i < Math.min(prefixes.length, suffixes.length); i++) {
        parts.push(prefixes[i] + suffixes[i]);
      }
      const input = parts.join(' ');
      expect(() => scanner.scan(input)).not.toThrow();
    });
  });
});

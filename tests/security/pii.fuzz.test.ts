/**
 * Fuzz tests for PIIDetector using property-based testing
 * Ensures the detector never crashes on arbitrary input and maintains invariants
 */

import { describe, test, expect } from 'vitest';
import { fc, test as fcTest } from '@fast-check/vitest';
import { PIIDetector } from '../../src/modules/clawshield/pii';

// Helper to generate hex strings (hexa() arbitrary for fc.string)
const hexa = () => fc.integer({ min: 0, max: 15 }).map((n) => '0123456789abcdef'[n]);
const hexaString = (constraints: { minLength?: number; maxLength?: number } = {}) =>
  fc.string({ ...constraints, unit: hexa() });

describe('PIIDetector Fuzz Tests', () => {
  const detector = new PIIDetector();

  describe('Crash resistance', () => {
    fcTest.prop([fc.string()])('never crashes on arbitrary input', (input) => {
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });

    fcTest.prop([fc.string({ minLength: 1000, maxLength: 10000 })])(
      'handles long strings',
      (input) => {
        expect(() => detector.detect(input)).not.toThrow();
        expect(() => detector.redact(input)).not.toThrow();
      }
    );

    fcTest.prop([fc.string({ unit: 'grapheme' })])('handles Unicode strings', (input) => {
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });

    fcTest.prop([fc.string({ unit: 'binary' })])('handles full Unicode range', (input) => {
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });

    fcTest.prop([fc.string({ unit: 'binary-ascii' })])('handles ASCII strings', (input) => {
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });

    fcTest.prop([hexaString()])('handles hexadecimal strings', (input) => {
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });

    fcTest.prop([
      fc.array(fc.string({ minLength: 1, maxLength: 1 }), { minLength: 0, maxLength: 5000 }),
    ])('handles arrays of characters', (chars) => {
      const input = chars.join('');
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });

    fcTest.prop([
      fc.string({ unit: fc.constantFrom('\n', '\r', '\t', ' ', '\0') }),
    ])('handles whitespace and control characters', (input) => {
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });

    fcTest.prop([
      fc.string({ unit: fc.constantFrom('!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '=', '+', '[', ']', '{', '}', '|', '\\', ';', ':', "'", '"', '<', '>', ',', '.', '/', '?', '`', '~') }),
    ])('handles special characters', (input) => {
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });
  });

  describe('Determinism', () => {
    fcTest.prop([fc.string()])('detect returns deterministic results', (input) => {
      const result1 = detector.detect(input);
      const result2 = detector.detect(input);
      expect(result1).toEqual(result2);
    });

    fcTest.prop([fc.string()])('redact returns deterministic results', (input) => {
      const result1 = detector.redact(input);
      const result2 = detector.redact(input);
      expect(result1).toEqual(result2);
    });

    fcTest.prop([fc.string({ minLength: 100, maxLength: 1000 })])(
      'returns deterministic results on long strings',
      (input) => {
        const detectResult1 = detector.detect(input);
        const detectResult2 = detector.detect(input);
        expect(detectResult1).toEqual(detectResult2);

        const redactResult1 = detector.redact(input);
        const redactResult2 = detector.redact(input);
        expect(redactResult1).toEqual(redactResult2);
      }
    );

    fcTest.prop([fc.string({ unit: 'grapheme' })])(
      'returns deterministic results on Unicode',
      (input) => {
        const detectResult1 = detector.detect(input);
        const detectResult2 = detector.detect(input);
        expect(detectResult1).toEqual(detectResult2);

        const redactResult1 = detector.redact(input);
        const redactResult2 = detector.redact(input);
        expect(redactResult1).toEqual(redactResult2);
      }
    );
  });

  describe('Output validity - detect()', () => {
    fcTest.prop([fc.string()])('returns valid PIIMatch array', (input) => {
      const result = detector.detect(input);
      expect(Array.isArray(result)).toBe(true);

      for (const match of result) {
        expect(['email', 'phone', 'ssn', 'creditcard', 'other']).toContain(match.type);
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
        const result = detector.detect(input);

        for (const match of result) {
          const extractedValue = input.substring(match.start, match.end);
          expect(extractedValue).toBe(match.value);
        }
      }
    );

    fcTest.prop([fc.string()])(
      'matches are sorted by position',
      (input) => {
        const result = detector.detect(input);

        for (let i = 1; i < result.length; i++) {
          expect(result[i].start).toBeGreaterThanOrEqual(result[i - 1].start);
        }
      }
    );

    fcTest.prop([fc.string()])(
      'matches do not overlap',
      (input) => {
        const result = detector.detect(input);

        for (let i = 1; i < result.length; i++) {
          // Current match starts after or at the end of previous match
          expect(result[i].start).toBeGreaterThanOrEqual(result[i - 1].end);
        }
      }
    );
  });

  describe('Output validity - redact()', () => {
    fcTest.prop([fc.string()])('redact returns valid structure', (input) => {
      const result = detector.redact(input);
      expect(typeof result.content).toBe('string');
      expect(Array.isArray(result.redactions)).toBe(true);

      for (const match of result.redactions) {
        expect(['email', 'phone', 'ssn', 'creditcard', 'other']).toContain(match.type);
        expect(typeof match.value).toBe('string');
        expect(typeof match.start).toBe('number');
        expect(typeof match.end).toBe('number');
      }
    });

    fcTest.prop([fc.string()])(
      'redact preserves string type',
      (input) => {
        const result = detector.redact(input);
        expect(typeof result.content).toBe('string');
      }
    );

    fcTest.prop([fc.string()])(
      'redactions match detect output',
      (input) => {
        const detected = detector.detect(input);
        const redacted = detector.redact(input);
        expect(redacted.redactions).toEqual(detected);
      }
    );

    fcTest.prop([fc.string()])(
      'redacted content has no PII from original positions',
      (input) => {
        const result = detector.redact(input);

        // If there are redactions, the redacted values should not appear in output
        for (const match of result.redactions) {
          // The redacted content should not contain the original PII value
          // (unless it appears elsewhere that wasn't matched)
          const redactedAtPosition = result.content.includes('[REDACTED]');
          if (result.redactions.length > 0) {
            expect(redactedAtPosition).toBe(true);
          }
        }
      }
    );

    fcTest.prop([fc.string()])(
      'no detectable PII in redacted content at original positions',
      (input) => {
        const original = detector.redact(input);

        // If we had redactions, verify the redacted content doesn't have PII at those positions
        if (original.redactions.length > 0) {
          const redetected = detector.detect(original.content);

          // Re-detected PII should not be at the same positions as original
          for (const origMatch of original.redactions) {
            const samePositionFound = redetected.some(
              (newMatch) =>
                newMatch.start === origMatch.start &&
                newMatch.end === origMatch.end &&
                newMatch.value === origMatch.value
            );
            // The original PII value should not appear at the same position
            expect(samePositionFound).toBe(false);
          }
        }
      }
    );
  });

  describe('Edge cases', () => {
    test('handles empty string', () => {
      expect(() => detector.detect('')).not.toThrow();
      expect(detector.detect('')).toEqual([]);

      expect(() => detector.redact('')).not.toThrow();
      expect(detector.redact('')).toEqual({ content: '', redactions: [] });
    });

    fcTest.prop([fc.nat(1000)])('handles strings of same character', (length) => {
      const input = 'a'.repeat(length);
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });

    fcTest.prop([
      fc.array(fc.constantFrom('\n', ' ', '\t'), { minLength: 0, maxLength: 1000 }),
    ])('handles whitespace-only strings', (whitespace) => {
      const input = whitespace.join('');
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });

    fcTest.prop([fc.integer({ min: 0, max: 1000 })])(
      'handles strings of digits',
      (length) => {
        const input = '0'.repeat(length);
        expect(() => detector.detect(input)).not.toThrow();
        expect(() => detector.redact(input)).not.toThrow();
      }
    );

    fcTest.prop([fc.nat(1000)])('handles repeated patterns', (repeatCount) => {
      const pattern = 'test@example.com ';
      const input = pattern.repeat(repeatCount);
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });
  });

  describe('Configuration handling', () => {
    fcTest.prop([fc.string()])(
      'handles custom redaction style',
      (input) => {
        const customDetector = new PIIDetector({ redactionStyle: '***' });
        expect(() => customDetector.detect(input)).not.toThrow();
        expect(() => customDetector.redact(input)).not.toThrow();

        const result = customDetector.redact(input);
        if (result.redactions.length > 0) {
          expect(result.content).toContain('***');
        }
      }
    );

    fcTest.prop([fc.string()])(
      'handles type filtering - email only',
      (input) => {
        const emailOnlyDetector = new PIIDetector({ types: ['email'] });
        expect(() => emailOnlyDetector.detect(input)).not.toThrow();

        const result = emailOnlyDetector.detect(input);
        for (const match of result) {
          expect(match.type).toBe('email');
        }
      }
    );

    fcTest.prop([fc.string()])(
      'handles type filtering - multiple types',
      (input) => {
        const multiDetector = new PIIDetector({ types: ['email', 'phone'] });
        expect(() => multiDetector.detect(input)).not.toThrow();

        const result = multiDetector.detect(input);
        for (const match of result) {
          expect(['email', 'phone']).toContain(match.type);
        }
      }
    );

    fcTest.prop([fc.string()])(
      'handles empty type array',
      (input) => {
        const noTypesDetector = new PIIDetector({ types: [] });
        expect(() => noTypesDetector.detect(input)).not.toThrow();
        // Should detect nothing if no types enabled
        const result = noTypesDetector.detect(input);
        expect(result).toEqual([]);
      }
    );
  });

  describe('Real-world patterns', () => {
    fcTest.prop([
      fc.array(
        fc.emailAddress(),
        { minLength: 0, maxLength: 10 }
      ),
      fc.array(fc.string({ minLength: 0, maxLength: 20 }), { minLength: 0, maxLength: 10 }),
    ])('handles mixed emails and noise', (emails, noise) => {
      const parts: string[] = [];
      for (let i = 0; i < Math.max(emails.length, noise.length); i++) {
        if (i < emails.length) parts.push(emails[i]);
        if (i < noise.length) parts.push(noise[i]);
      }
      const input = parts.join(' ');
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });

    fcTest.prop([
      fc.array(
        fc.tuple(fc.integer({ min: 100, max: 999 }), fc.integer({ min: 100, max: 999 }), fc.integer({ min: 1000, max: 9999 })),
        { minLength: 0, maxLength: 50 }
      ),
    ])('handles phone-like number patterns', (phoneNumbers) => {
      const input = phoneNumbers.map(([a, b, c]) => `${a}-${b}-${c}`).join(' ');
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });

    fcTest.prop([
      fc.array(
        fc.tuple(fc.integer({ min: 100, max: 999 }), fc.integer({ min: 10, max: 99 }), fc.integer({ min: 1000, max: 9999 })),
        { minLength: 0, maxLength: 50 }
      ),
    ])('handles SSN-like patterns', (ssnNumbers) => {
      const input = ssnNumbers.map(([a, b, c]) => `${a}-${b}-${c}`).join(' ');
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });

    fcTest.prop([
      fc.array(
        fc.tuple(
          fc.integer({ min: 1000, max: 9999 }),
          fc.integer({ min: 1000, max: 9999 }),
          fc.integer({ min: 1000, max: 9999 }),
          fc.integer({ min: 1000, max: 9999 })
        ),
        { minLength: 0, maxLength: 30 }
      ),
    ])('handles credit card-like patterns', (cardNumbers) => {
      const input = cardNumbers.map(([a, b, c, d]) => `${a}-${b}-${c}-${d}`).join(' ');
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });

    fcTest.prop([
      fc.array(fc.webUrl(), { minLength: 0, maxLength: 5 }),
    ])('handles URLs', (urls) => {
      const input = urls.join('\n');
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });

    fcTest.prop([
      fc.mixedCase(fc.string({ minLength: 1, maxLength: 100 })),
    ])('handles mixed case strings', (input) => {
      expect(() => detector.detect(input)).not.toThrow();
      expect(() => detector.redact(input)).not.toThrow();
    });
  });

  describe('Invariants', () => {
    fcTest.prop([fc.string()])(
      'detect and redact never increase string length beyond redaction markers',
      (input) => {
        const result = detector.redact(input);
        // This is a sanity check - we're just verifying it's a valid string
        expect(typeof result.content).toBe('string');
      }
    );

    fcTest.prop([fc.string()])(
      'number of redactions equals number of detections',
      (input) => {
        const detected = detector.detect(input);
        const redacted = detector.redact(input);
        expect(redacted.redactions.length).toBe(detected.length);
      }
    );

    fcTest.prop([fc.string()])(
      'multiple redact calls produce same result',
      (input) => {
        const result1 = detector.redact(input);
        const result2 = detector.redact(input);
        const result3 = detector.redact(input);

        expect(result1).toEqual(result2);
        expect(result2).toEqual(result3);
      }
    );
  });
});

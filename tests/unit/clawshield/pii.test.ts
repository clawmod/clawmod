/**
 * Tests for modules/clawshield/pii.ts (TDD - written before implementation)
 *
 * Tests PII detection patterns including email, phone, SSN, and credit card detection.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import type { PIIMatch } from '../../../src/types';
import samples from '../../fixtures/pii/samples.json';
import contextSamples from '../../fixtures/pii/context-samples.json';

// Import will fail initially - that's expected in TDD
import { PIIDetector } from '../../../src/modules/clawshield/pii';

describe('PIIDetector', () => {
  let detector: PIIDetector;

  beforeEach(() => {
    detector = new PIIDetector();
  });

  // ═══════════════════════════════════════════════════════════════════
  // EMAIL DETECTION
  // ═══════════════════════════════════════════════════════════════════

  describe('email detection', () => {
    test.each(samples.email)(
      'detects email: %s',
      (email) => {
        const result = detector.detect(email);
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('email');
        expect(result[0].value).toBe(email);
      }
    );

    test('detects email with plus addressing', () => {
      const email = 'user+tag@gmail.com';
      const result = detector.detect(email);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('email');
      expect(result[0].value).toBe(email);
    });

    test('detects email with subdomain', () => {
      const email = 'support@sub.domain.co.uk';
      const result = detector.detect(email);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('email');
      expect(result[0].value).toBe(email);
    });

    test('detects email in natural text', () => {
      const text = 'Please contact me at john@example.com for more info';
      const result = detector.detect(text);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('email');
      expect(result[0].value).toBe('john@example.com');
      expect(result[0].start).toBe(21);
      expect(result[0].end).toBe(37);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PHONE NUMBER DETECTION
  // ═══════════════════════════════════════════════════════════════════

  describe('phone number detection', () => {
    test.each(samples.phone)(
      'detects phone number: %s',
      (phone) => {
        const result = detector.detect(phone);
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('phone');
        expect(result[0].value).toBe(phone);
      }
    );

    test('detects phone with dashes', () => {
      const phone = '123-456-7890';
      const result = detector.detect(phone);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('phone');
      expect(result[0].value).toBe(phone);
    });

    test('detects phone with parentheses', () => {
      const phone = '(123) 456-7890';
      const result = detector.detect(phone);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('phone');
      expect(result[0].value).toBe(phone);
    });

    test('detects phone with country code', () => {
      const phone = '+1 123 456 7890';
      const result = detector.detect(phone);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('phone');
      expect(result[0].value).toBe(phone);
    });

    test('detects phone without separators', () => {
      const phone = '1234567890';
      const result = detector.detect(phone);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('phone');
      expect(result[0].value).toBe(phone);
    });

    test('detects phone in natural text', () => {
      const text = 'Call me at (555) 123-4567 tomorrow';
      const result = detector.detect(text);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('phone');
      expect(result[0].value).toBe('(555) 123-4567');
      expect(result[0].start).toBe(11);
      expect(result[0].end).toBe(25);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SSN DETECTION
  // ═══════════════════════════════════════════════════════════════════

  describe('SSN detection', () => {
    test.each(samples.ssn)(
      'detects SSN: %s',
      (ssn) => {
        const result = detector.detect(ssn);
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('ssn');
        expect(result[0].value).toBe(ssn);
      }
    );

    test('detects SSN with dashes', () => {
      const ssn = '123-45-6789';
      const result = detector.detect(ssn);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('ssn');
      expect(result[0].value).toBe(ssn);
      expect(result[0].value).toMatch(/^\d{3}-\d{2}-\d{4}$/);
    });

    test('detects SSN with spaces', () => {
      const ssn = '123 45 6789';
      const result = detector.detect(ssn);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('ssn');
      expect(result[0].value).toBe(ssn);
    });

    test('detects SSN in natural text', () => {
      const text = 'SSN: 123-45-6789';
      const result = detector.detect(text);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('ssn');
      expect(result[0].value).toBe('123-45-6789');
      expect(result[0].start).toBe(5);
      expect(result[0].end).toBe(16);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CREDIT CARD DETECTION
  // ═══════════════════════════════════════════════════════════════════

  describe('credit card detection', () => {
    test.each(samples.creditcard)(
      'detects credit card: %s',
      (card) => {
        const result = detector.detect(card);
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('creditcard');
        expect(result[0].value).toBe(card);
      }
    );

    test('detects Visa card (16 digits starting with 4)', () => {
      const card = '4111111111111111';
      const result = detector.detect(card);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('creditcard');
      expect(result[0].value).toBe(card);
      expect(card[0]).toBe('4');
      expect(card.length).toBe(16);
    });

    test('detects Mastercard (16 digits starting with 5)', () => {
      const card = '5500000000000004';
      const result = detector.detect(card);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('creditcard');
      expect(result[0].value).toBe(card);
      expect(card[0]).toBe('5');
      expect(card.length).toBe(16);
    });

    test('detects American Express (15 digits starting with 3)', () => {
      const card = '378282246310005';
      const result = detector.detect(card);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('creditcard');
      expect(result[0].value).toBe(card);
      expect(card[0]).toBe('3');
      expect(card.length).toBe(15);
    });

    test('detects credit card with dashes', () => {
      const card = '4111-1111-1111-1111';
      const result = detector.detect(card);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('creditcard');
      expect(result[0].value).toBe(card);
    });

    test('detects credit card in natural text', () => {
      const text = 'CC: 4111111111111111';
      const result = detector.detect(text);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('creditcard');
      expect(result[0].value).toBe('4111111111111111');
      expect(result[0].start).toBe(4);
      expect(result[0].end).toBe(20);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // POSITION TRACKING
  // ═══════════════════════════════════════════════════════════════════

  describe('position tracking', () => {
    test('tracks start and end positions correctly', () => {
      const text = 'Email: test@example.com and phone: 123-456-7890';
      const result = detector.detect(text);

      expect(result).toHaveLength(2);

      // Email positions
      expect(result[0].value).toBe('test@example.com');
      expect(text.substring(result[0].start, result[0].end)).toBe('test@example.com');

      // Phone positions
      expect(result[1].value).toBe('123-456-7890');
      expect(text.substring(result[1].start, result[1].end)).toBe('123-456-7890');
    });

    test('handles multiple PII of same type', () => {
      const text = 'Contact john@test.com or jane@test.org';
      const result = detector.detect(text);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('email');
      expect(result[0].value).toBe('john@test.com');
      expect(result[1].type).toBe('email');
      expect(result[1].value).toBe('jane@test.org');
    });

    test('positions are non-overlapping and ordered', () => {
      const text = 'Email: test@test.com Phone: 123-456-7890 SSN: 123-45-6789';
      const result = detector.detect(text);

      // Should be ordered by start position
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].end).toBeLessThanOrEqual(result[i + 1].start);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // MULTIPLE PII TYPES
  // ═══════════════════════════════════════════════════════════════════

  describe('multiple PII types in text', () => {
    test('detects multiple PII types in single text', () => {
      const text = 'My email is test@domain.org and my phone is 555-123-4567';
      const result = detector.detect(text);

      expect(result).toHaveLength(2);

      const emailMatch = result.find(r => r.type === 'email');
      const phoneMatch = result.find(r => r.type === 'phone');

      expect(emailMatch).toBeDefined();
      expect(emailMatch?.value).toBe('test@domain.org');

      expect(phoneMatch).toBeDefined();
      expect(phoneMatch?.value).toBe('555-123-4567');
    });

    test('detects all PII in complex text', () => {
      const text = 'User John Doe, email: john@test.com, SSN: 123-45-6789, CC: 4111111111111111';
      const result = detector.detect(text);

      expect(result).toHaveLength(3);

      const types = result.map(r => r.type).sort();
      expect(types).toEqual(['creditcard', 'email', 'ssn']);
    });

    test.each(contextSamples.multiple_pii)(
      'detects all PII in: %s',
      (text) => {
        const result = detector.detect(text);

        // This text has email, SSN, and credit card
        expect(result.length).toBeGreaterThanOrEqual(3);

        const types = new Set(result.map(r => r.type));
        expect(types.has('email')).toBe(true);
        expect(types.has('ssn')).toBe(true);
        expect(types.has('creditcard')).toBe(true);
      }
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // CONTEXT SAMPLES
  // ═══════════════════════════════════════════════════════════════════

  describe('PII in natural context', () => {
    test.each(contextSamples.email_in_text)(
      'detects email in context: %s',
      (text) => {
        const result = detector.detect(text);
        const emailMatches = result.filter(r => r.type === 'email');

        expect(emailMatches.length).toBeGreaterThanOrEqual(1);
      }
    );

    test.each(contextSamples.phone_in_text)(
      'detects phone in context: %s',
      (text) => {
        const result = detector.detect(text);
        const phoneMatches = result.filter(r => r.type === 'phone');

        expect(phoneMatches.length).toBeGreaterThanOrEqual(1);
      }
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // REDACTION
  // ═══════════════════════════════════════════════════════════════════

  describe('redaction', () => {
    test('redacts PII with default placeholder', () => {
      const text = 'Email: test@example.com';
      const result = detector.redact(text);

      expect(result.content).toBe('Email: [REDACTED]');
      expect(result.redactions).toHaveLength(1);
      expect(result.redactions[0].type).toBe('email');
      expect(result.redactions[0].value).toBe('test@example.com');
    });

    test('redacts multiple PII items', () => {
      const text = 'Email: test@test.com Phone: 123-456-7890';
      const result = detector.redact(text);

      expect(result.content).toBe('Email: [REDACTED] Phone: [REDACTED]');
      expect(result.redactions).toHaveLength(2);
    });

    test('uses custom redaction placeholder', () => {
      const customDetector = new PIIDetector({ redactionStyle: '***' });
      const text = 'Email: test@example.com';
      const result = customDetector.redact(text);

      expect(result.content).toBe('Email: ***');
      expect(result.redactions).toHaveLength(1);
    });

    test('preserves text without PII', () => {
      const text = 'This is clean text without any PII';
      const result = detector.redact(text);

      expect(result.content).toBe(text);
      expect(result.redactions).toHaveLength(0);
    });

    test('redaction maintains text structure', () => {
      const text = 'Line 1: test@test.com\nLine 2: 123-456-7890\nLine 3: clean';
      const result = detector.redact(text);

      expect(result.content).toContain('\n');
      expect(result.content.split('\n')).toHaveLength(3);
      expect(result.redactions).toHaveLength(2);
    });

    test('redacts all instances in complex text', () => {
      const text = 'User John Doe, email: john@test.com, SSN: 123-45-6789, CC: 4111111111111111';
      const result = detector.redact(text);

      expect(result.content).toBe('User John Doe, email: [REDACTED], SSN: [REDACTED], CC: [REDACTED]');
      expect(result.redactions).toHaveLength(3);
    });

    test('returns PIIMatch objects in redactions array', () => {
      const text = 'Email: test@example.com';
      const result = detector.redact(text);

      expect(result.redactions[0]).toMatchObject({
        type: 'email',
        value: 'test@example.com',
        start: expect.any(Number),
        end: expect.any(Number),
      } satisfies PIIMatch);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    test('handles empty string', () => {
      const result = detector.detect('');
      expect(result).toHaveLength(0);
    });

    test('handles text with no PII', () => {
      const result = detector.detect('This is just normal text without any sensitive data');
      expect(result).toHaveLength(0);
    });

    test('handles PII at start of text', () => {
      const text = 'test@example.com is my email';
      const result = detector.detect(text);

      expect(result).toHaveLength(1);
      expect(result[0].start).toBe(0);
    });

    test('handles PII at end of text', () => {
      const text = 'My email is test@example.com';
      const result = detector.detect(text);

      expect(result).toHaveLength(1);
      expect(result[0].end).toBe(text.length);
    });

    test('handles consecutive PII', () => {
      const text = 'test@example.com123-456-7890';
      const result = detector.detect(text);

      expect(result).toHaveLength(2);
    });

    test('detector is reusable', () => {
      const result1 = detector.detect('test@example.com');
      const result2 = detector.detect('123-456-7890');

      expect(result1).toHaveLength(1);
      expect(result1[0].type).toBe('email');

      expect(result2).toHaveLength(1);
      expect(result2[0].type).toBe('phone');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════

  describe('configuration', () => {
    test('accepts configuration options', () => {
      const customDetector = new PIIDetector({
        redactionStyle: '[REMOVED]'
      });

      expect(customDetector).toBeDefined();
    });

    test('different instances have independent configuration', () => {
      const detector1 = new PIIDetector({ redactionStyle: '[A]' });
      const detector2 = new PIIDetector({ redactionStyle: '[B]' });

      const result1 = detector1.redact('test@example.com');
      const result2 = detector2.redact('test@example.com');

      expect(result1.content).toBe('[A]');
      expect(result2.content).toBe('[B]');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // TYPE SAFETY
  // ═══════════════════════════════════════════════════════════════════

  describe('type safety', () => {
    test('detect returns PIIMatch array', () => {
      const result = detector.detect('test@example.com');

      // Type assertion test - will cause TS error if wrong type
      const matches: PIIMatch[] = result;
      expect(matches).toBeDefined();
    });

    test('PIIMatch has all required fields', () => {
      const result = detector.detect('test@example.com');
      const match = result[0];

      expect(match).toHaveProperty('type');
      expect(match).toHaveProperty('value');
      expect(match).toHaveProperty('start');
      expect(match).toHaveProperty('end');

      // Type is one of the allowed values
      expect(['email', 'phone', 'ssn', 'creditcard', 'other']).toContain(match.type);
    });

    test('redact returns correct structure', () => {
      const result = detector.redact('test@example.com');

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('redactions');
      expect(typeof result.content).toBe('string');
      expect(Array.isArray(result.redactions)).toBe(true);
    });
  });
});

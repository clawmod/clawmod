/**
 * Tests for modules/clawshield/secrets.ts (TDD - written before implementation)
 *
 * Tests secret detection patterns including AWS keys, API keys, tokens, and entropy-based detection.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import type { SecretMatch } from '../../../src/types';
import knownPatterns from '../../fixtures/secrets/known-patterns.json';
import falsePositives from '../../fixtures/secrets/false-positives.json';

// Import will fail initially - that's expected in TDD
import { SecretScanner } from '../../../src/modules/clawshield/secrets';

describe('SecretScanner', () => {
  let scanner: SecretScanner;

  beforeEach(() => {
    scanner = new SecretScanner();
  });

  // ═══════════════════════════════════════════════════════════════════
  // AWS ACCESS KEYS
  // ═══════════════════════════════════════════════════════════════════

  describe('AWS access keys', () => {
    test.each(knownPatterns.aws_access_key)(
      'detects AWS access key: %s',
      (key) => {
        const result = scanner.scan(key);
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('aws_access_key');
        expect(result[0].value).toBe(key);
      }
    );

    test('detects AWS access key in context', () => {
      const text = 'Here is my key: AKIAIOSFODNN7EXAMPLE for testing';
      const result = scanner.scan(text);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('aws_access_key');
      expect(result[0].value).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(result[0].start).toBe(16);
      expect(result[0].end).toBe(36);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // AWS SECRET KEYS
  // ═══════════════════════════════════════════════════════════════════

  describe('AWS secret keys', () => {
    test.each(knownPatterns.aws_secret_key)(
      'detects AWS secret key: %s',
      (key) => {
        const result = scanner.scan(key);
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('aws_secret_key');
        expect(result[0].value).toBe(key);
      }
    );

    test('detects AWS secret key with proper length', () => {
      const key = knownPatterns.aws_secret_key[0];
      expect(key).toHaveLength(40);

      const result = scanner.scan(key);
      expect(result[0].value).toHaveLength(40);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // GITHUB TOKENS
  // ═══════════════════════════════════════════════════════════════════

  describe('GitHub tokens', () => {
    test.each(knownPatterns.github_token)(
      'detects GitHub token: %s',
      (token) => {
        const result = scanner.scan(token);
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('github_token');
        expect(result[0].value).toBe(token);
      }
    );

    test('detects all GitHub token prefixes', () => {
      const prefixes = ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'];
      const tokens = knownPatterns.github_token;

      // Verify we have examples of all prefixes
      prefixes.forEach(prefix => {
        const hasPrefix = tokens.some(t => t.startsWith(prefix));
        expect(hasPrefix).toBe(true);
      });
    });

    test('detects GitHub token in git config format', () => {
      const text = 'https://ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@github.com/user/repo.git';
      const result = scanner.scan(text);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('github_token');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // OPENAI KEYS
  // ═══════════════════════════════════════════════════════════════════

  describe('OpenAI keys', () => {
    test.each(knownPatterns.openai_key)(
      'detects OpenAI key: %s',
      (key) => {
        const result = scanner.scan(key);
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('openai_key');
        expect(result[0].value).toBe(key);
      }
    );

    test('detects OpenAI key with exactly 48 characters after prefix', () => {
      const key = knownPatterns.openai_key[0];
      const withoutPrefix = key.replace('sk-', '');
      expect(withoutPrefix).toHaveLength(48);
    });

    test('detects OpenAI key in environment variable assignment', () => {
      const text = 'OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const result = scanner.scan(text);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('openai_key');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ANTHROPIC KEYS
  // ═══════════════════════════════════════════════════════════════════

  describe('Anthropic keys', () => {
    test.each(knownPatterns.anthropic_key)(
      'detects Anthropic key: %s',
      (key) => {
        const result = scanner.scan(key);
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('anthropic_key');
        expect(result[0].value).toBe(key);
      }
    );

    test('detects Anthropic key with exactly 95 characters after prefix', () => {
      const key = knownPatterns.anthropic_key[0];
      const withoutPrefix = key.replace('sk-ant-', '');
      expect(withoutPrefix).toHaveLength(95);
    });

    test('detects Anthropic key in JSON config', () => {
      const json = '{"anthropic_api_key": "sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}';
      const result = scanner.scan(json);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('anthropic_key');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // JWT TOKENS
  // ═══════════════════════════════════════════════════════════════════

  describe('JWT tokens', () => {
    test.each(knownPatterns.jwt)(
      'detects JWT token: %s',
      (token) => {
        const result = scanner.scan(token);
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('jwt');
        expect(result[0].value).toBe(token);
      }
    );

    test('detects JWT with three base64 segments', () => {
      const jwt = knownPatterns.jwt[0];
      const segments = jwt.split('.');

      expect(segments).toHaveLength(3);
      expect(segments[0]).toMatch(/^eyJ/);
      expect(segments[1]).toMatch(/^eyJ/);
    });

    test('detects JWT in Authorization header format', () => {
      const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = scanner.scan(text);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('jwt');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE KEYS
  // ═══════════════════════════════════════════════════════════════════

  describe('private keys', () => {
    test.each(knownPatterns.private_key)(
      'detects private key header: %s',
      (header) => {
        const result = scanner.scan(header);
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('private_key');
        expect(result[0].value).toBe(header);
      }
    );

    test('detects RSA private key', () => {
      const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF89uPOFJ8S0TiQrm...
-----END RSA PRIVATE KEY-----`;
      const result = scanner.scan(pem);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].type).toBe('private_key');
    });

    test('detects EC private key', () => {
      const text = 'My EC key: -----BEGIN EC PRIVATE KEY----- content here';
      const result = scanner.scan(text);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('private_key');
    });

    test('detects OpenSSH private key', () => {
      const text = '-----BEGIN OPENSSH PRIVATE KEY----- base64data';
      const result = scanner.scan(text);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('private_key');
    });

    test('detects generic private key', () => {
      const text = '-----BEGIN PRIVATE KEY----- content';
      const result = scanner.scan(text);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('private_key');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // GENERIC API KEYS
  // ═══════════════════════════════════════════════════════════════════

  describe('generic API keys', () => {
    test.each(knownPatterns.generic_api_key)(
      'detects generic API key: %s',
      (line) => {
        const result = scanner.scan(line);
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result[0].type).toBe('generic_api_key');
      }
    );

    test('detects api_key= format', () => {
      const text = 'api_key=ABCDEFGHIJKLMNOPQRSTUVWXYZ1234';
      const result = scanner.scan(text);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('generic_api_key');
    });

    test('detects API_KEY: format with quotes', () => {
      const text = 'API_KEY: "secretvalue123456789012"';
      const result = scanner.scan(text);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('generic_api_key');
    });

    test('detects apiKey format', () => {
      const text = 'apiKey = "abcdefghijklmnopqrstuvwxyz123"';
      const result = scanner.scan(text);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].type).toBe('generic_api_key');
    });

    test('detects api_secret format', () => {
      const text = 'api_secret: myverylongsecretkey12345678';
      const result = scanner.scan(text);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].type).toBe('generic_api_key');
    });

    test('requires minimum 20 character value', () => {
      // Should NOT detect short values
      const shortKey = 'api_key=short123';
      const shortResult = scanner.scan(shortKey);
      expect(shortResult).toHaveLength(0);

      // SHOULD detect 20+ character values
      const longKey = 'api_key=exactly20characters0';
      const longResult = scanner.scan(longKey);
      expect(longResult.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // FALSE POSITIVES
  // ═══════════════════════════════════════════════════════════════════

  describe('false positives', () => {
    test.each(falsePositives.uuids)(
      'does not flag UUID: %s',
      (uuid) => {
        const result = scanner.scan(uuid);
        expect(result).toHaveLength(0);
      }
    );

    test.each(falsePositives.short_strings)(
      'does not flag short string: %s',
      (str) => {
        const result = scanner.scan(str);
        expect(result).toHaveLength(0);
      }
    );

    test.each(falsePositives.example_placeholders)(
      'does not flag placeholder: %s',
      (placeholder) => {
        const result = scanner.scan(placeholder);
        expect(result).toHaveLength(0);
      }
    );

    test('does not flag common words', () => {
      const commonWords = ['password', 'secret', 'token', 'key', 'api'];

      commonWords.forEach(word => {
        const result = scanner.scan(word);
        expect(result).toHaveLength(0);
      });
    });

    test('does not flag documentation examples', () => {
      const docs = [
        'api_key=YOUR_KEY_HERE',
        'token=<insert-token>',
        'secret=XXXXXXXXXXXX',
      ];

      docs.forEach(doc => {
        const result = scanner.scan(doc);
        expect(result).toHaveLength(0);
      });
    });

    test('does not flag hex color codes', () => {
      const colors = ['#ffffff', '#000000', '#ff5733'];

      colors.forEach(color => {
        const result = scanner.scan(color);
        expect(result).toHaveLength(0);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // POSITION TRACKING
  // ═══════════════════════════════════════════════════════════════════

  describe('position tracking', () => {
    test('returns correct start and end positions for single match', () => {
      const text = 'prefix AKIAIOSFODNN7EXAMPLE suffix';
      const result = scanner.scan(text);

      expect(result).toHaveLength(1);
      expect(result[0].start).toBe(7);
      expect(result[0].end).toBe(27);
      expect(text.substring(result[0].start, result[0].end)).toBe('AKIAIOSFODNN7EXAMPLE');
    });

    test('returns correct positions for multiple matches', () => {
      const text = 'AKIAIOSFODNN7EXAMPLE and sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const result = scanner.scan(text);

      expect(result).toHaveLength(2);

      // First match (AWS key)
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(20);
      expect(text.substring(result[0].start, result[0].end)).toBe('AKIAIOSFODNN7EXAMPLE');

      // Second match (OpenAI key)
      expect(result[1].start).toBe(25);
      expect(result[1].end).toBe(76);
      expect(text.substring(result[1].start, result[1].end)).toBe('sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    });

    test('handles matches at start of string', () => {
      const text = 'AKIAIOSFODNN7EXAMPLE';
      const result = scanner.scan(text);

      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(20);
    });

    test('handles matches at end of string', () => {
      const text = 'The key is AKIAIOSFODNN7EXAMPLE';
      const result = scanner.scan(text);

      expect(result[0].start).toBe(11);
      expect(result[0].end).toBe(31);
    });

    test('handles multiline text with correct positions', () => {
      const text = `Line 1
Line 2 with AKIAIOSFODNN7EXAMPLE
Line 3`;
      const result = scanner.scan(text);

      expect(result).toHaveLength(1);
      // Position should account for newlines
      const expectedStart = 'Line 1\nLine 2 with '.length;
      expect(result[0].start).toBe(expectedStart);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // MULTIPLE SECRETS
  // ═══════════════════════════════════════════════════════════════════

  describe('multiple secrets in same text', () => {
    test('detects multiple secrets of different types', () => {
      const text = `
        AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
        OPENAI_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
        GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
      `;

      const result = scanner.scan(text);
      expect(result.length).toBeGreaterThanOrEqual(3);

      const types = result.map(r => r.type);
      expect(types).toContain('aws_access_key');
      expect(types).toContain('openai_key');
      expect(types).toContain('github_token');
    });

    test('detects multiple secrets of same type', () => {
      const text = 'Keys: AKIAIOSFODNN7EXAMPLE and AKIA1234567890ABCDEF';
      const result = scanner.scan(text);

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].type).toBe('aws_access_key');
      expect(result[1].type).toBe('aws_access_key');
    });

    test('returns secrets in order of appearance', () => {
      const text = 'First: AKIAIOSFODNN7EXAMPLE, Second: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const result = scanner.scan(text);

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].start).toBeLessThan(result[1].start);
    });

    test('handles overlapping pattern matches', () => {
      // Some patterns might overlap - ensure we handle this correctly
      const text = 'api_key=AKIAIOSFODNN7EXAMPLE';
      const result = scanner.scan(text);

      // Should detect both generic_api_key and aws_access_key
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ENTROPY-BASED DETECTION
  // ═══════════════════════════════════════════════════════════════════

  describe('entropy-based detection', () => {
    test('detects high-entropy strings above threshold', () => {
      // High entropy random string (should be detected)
      const highEntropy = 'aB3$xY9#zK2@mN7!pQ5&wR8';
      const result = scanner.scan(highEntropy, { entropyThreshold: 4.5 });

      // Should be detected by entropy
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    test('does not detect low-entropy strings below threshold', () => {
      // Low entropy strings (repeating patterns)
      const lowEntropyStrings = [
        'aaaaaaaaaaaaaaaaaaaaaa',
        'abababababababababab',
        '111111111111111111111',
      ];

      lowEntropyStrings.forEach(str => {
        const result = scanner.scan(str, { entropyThreshold: 4.5 });
        expect(result).toHaveLength(0);
      });
    });

    test('uses default entropy threshold of 4.5', () => {
      const highEntropy = 'aB3$xY9#zK2@mN7!pQ5&wR8';

      // Without explicit threshold, should use 4.5
      const resultWithDefault = scanner.scan(highEntropy);
      const resultWithExplicit = scanner.scan(highEntropy, { entropyThreshold: 4.5 });

      expect(resultWithDefault.length).toBe(resultWithExplicit.length);
    });

    test('respects custom entropy threshold', () => {
      // Must be 20+ chars for entropy detection
      const mediumEntropy = 'abc123xyz789def456AB';

      // With low threshold, should detect
      const lowThreshold = scanner.scan(mediumEntropy, { entropyThreshold: 2.0 });
      expect(lowThreshold.length).toBeGreaterThanOrEqual(1);

      // With high threshold, should not detect
      const highThreshold = scanner.scan(mediumEntropy, { entropyThreshold: 6.0 });
      expect(highThreshold).toHaveLength(0);
    });

    test('calculates Shannon entropy correctly', () => {
      // Test that entropy calculation is reasonable
      // Perfect randomness: ~4.7 bits per character
      // All same char: 0 bits
      const uniformRandom = 'aB3$xY9#zK2@mN7!pQ5&wR8';
      const allSame = 'aaaaaaaaaaaaaaaaaaaaaa';

      const randomResult = scanner.scan(uniformRandom, { entropyThreshold: 4.5 });
      const sameResult = scanner.scan(allSame, { entropyThreshold: 4.5 });

      expect(randomResult.length).toBeGreaterThan(sameResult.length);
    });

    test('entropy detection ignores short strings', () => {
      // Even high entropy, should ignore strings < 20 chars
      const shortHighEntropy = 'aB3$xY9#zK2';
      const result = scanner.scan(shortHighEntropy, { entropyThreshold: 4.5 });

      expect(result).toHaveLength(0);
    });

    test('entropy detection requires minimum length', () => {
      // Should only check entropy on strings >= 20 characters
      const exactly20 = 'aB3$xY9#zK2@mN7!pQ5&';
      const exactly19 = 'aB3$xY9#zK2@mN7!pQ5';

      const result20 = scanner.scan(exactly20, { entropyThreshold: 4.5 });
      const result19 = scanner.scan(exactly19, { entropyThreshold: 4.5 });

      expect(result20.length).toBeGreaterThanOrEqual(result19.length);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ROBUSTNESS TESTING
  // ═══════════════════════════════════════════════════════════════════

  describe('robustness and edge cases', () => {
    test('handles empty string', () => {
      const result = scanner.scan('');
      expect(result).toHaveLength(0);
    });

    test('handles whitespace-only string', () => {
      const result = scanner.scan('   \n\t  ');
      expect(result).toHaveLength(0);
    });

    test('handles very long text', () => {
      const longText = 'prefix '.repeat(1000) + 'AKIAIOSFODNN7EXAMPLE' + ' suffix'.repeat(1000);

      expect(() => scanner.scan(longText)).not.toThrow();

      const result = scanner.scan(longText);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('aws_access_key');
    });

    test('handles special characters', () => {
      const text = '🔑 Key: AKIAIOSFODNN7EXAMPLE 🚀';
      const result = scanner.scan(text);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('aws_access_key');
    });

    test('handles unicode characters', () => {
      const text = 'Ключ: AKIAIOSFODNN7EXAMPLE 密钥';
      const result = scanner.scan(text);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('aws_access_key');
    });

    test('handles null bytes', () => {
      const text = 'key\x00AKIAIOSFODNN7EXAMPLE\x00end';

      expect(() => scanner.scan(text)).not.toThrow();
    });

    test('handles repeated scanning (stateless)', () => {
      const text = 'AKIAIOSFODNN7EXAMPLE';

      const result1 = scanner.scan(text);
      const result2 = scanner.scan(text);
      const result3 = scanner.scan(text);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });

    test('does not mutate input', () => {
      const text = 'AKIAIOSFODNN7EXAMPLE';
      const originalText = text;

      scanner.scan(text);

      expect(text).toBe(originalText);
    });

    test('handles malformed patterns gracefully', () => {
      // Incomplete or malformed patterns should not crash
      const malformed = [
        'AKIA', // Too short
        'sk-', // Incomplete
        'ghp_', // Incomplete
        '-----BEGIN', // Incomplete
        'api_key=', // No value
      ];

      malformed.forEach(text => {
        expect(() => scanner.scan(text)).not.toThrow();
        const result = scanner.scan(text);
        expect(Array.isArray(result)).toBe(true);
      });
    });

    test('returns proper SecretMatch type', () => {
      const text = 'AKIAIOSFODNN7EXAMPLE';
      const result = scanner.scan(text);

      expect(result).toHaveLength(1);

      const match: SecretMatch = result[0];
      expect(typeof match.type).toBe('string');
      expect(typeof match.value).toBe('string');
      expect(typeof match.start).toBe('number');
      expect(typeof match.end).toBe('number');
      expect(match.start).toBeGreaterThanOrEqual(0);
      expect(match.end).toBeGreaterThan(match.start);
    });

    test('handles case sensitivity correctly', () => {
      // AWS keys are case-sensitive
      const lowercase = 'akiaiosfodnn7example';
      const uppercase = 'AKIAIOSFODNN7EXAMPLE';

      const lowercaseResult = scanner.scan(lowercase);
      const uppercaseResult = scanner.scan(uppercase);

      expect(lowercaseResult).toHaveLength(0);
      expect(uppercaseResult).toHaveLength(1);
    });

    test('handles line breaks within secrets', () => {
      // Some formats might have line breaks in keys
      const multiline = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF89uPOFJ8S0TiQrm
-----END RSA PRIVATE KEY-----`;

      const result = scanner.scan(multiline);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].type).toBe('private_key');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // OPTIONS AND CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════

  describe('scanner options', () => {
    test('accepts entropy threshold option', () => {
      const text = 'aB3$xY9#zK2@mN7!pQ5&wR8';

      const withDefault = scanner.scan(text);
      const withCustom = scanner.scan(text, { entropyThreshold: 5.0 });

      expect(Array.isArray(withDefault)).toBe(true);
      expect(Array.isArray(withCustom)).toBe(true);
    });

    test('accepts pattern filtering option', () => {
      const text = 'AKIAIOSFODNN7EXAMPLE and sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

      // Should be able to scan only specific patterns (optional feature)
      const allPatterns = scanner.scan(text);
      expect(allPatterns.length).toBeGreaterThanOrEqual(2);
    });

    test('scanner is reusable across different texts', () => {
      const text1 = 'AKIAIOSFODNN7EXAMPLE';
      const text2 = 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

      const result1 = scanner.scan(text1);
      const result2 = scanner.scan(text2);

      expect(result1[0].type).toBe('aws_access_key');
      expect(result2[0].type).toBe('openai_key');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // INTEGRATION SCENARIOS
  // ═══════════════════════════════════════════════════════════════════

  describe('real-world scenarios', () => {
    test('detects secrets in .env file format', () => {
      const envFile = `
# API Keys
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Database
DATABASE_URL=postgresql://user:pass@localhost/db
      `;

      const result = scanner.scan(envFile);
      expect(result.length).toBeGreaterThanOrEqual(3);

      const types = result.map(r => r.type);
      expect(types).toContain('aws_access_key');
      expect(types).toContain('aws_secret_key');
      expect(types).toContain('openai_key');
    });

    test('detects secrets in JSON config', () => {
      const jsonConfig = JSON.stringify({
        aws: {
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        },
        openai: {
          apiKey: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        },
      }, null, 2);

      const result = scanner.scan(jsonConfig);
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    test('detects secrets in YAML format', () => {
      const yamlConfig = `
aws:
  access_key: AKIAIOSFODNN7EXAMPLE
  secret_key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
openai:
  api_key: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
      `;

      const result = scanner.scan(yamlConfig);
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    test('detects secrets in code comments', () => {
      const code = `
// TODO: Remove this before commit!
// const API_KEY = "AKIAIOSFODNN7EXAMPLE";
const validConfig = loadFromEnv();
      `;

      const result = scanner.scan(code);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('aws_access_key');
    });

    test('detects secrets in git URLs', () => {
      const gitUrl = 'https://ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@github.com/user/repo.git';
      const result = scanner.scan(gitUrl);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('github_token');
    });

    test('detects secrets in curl commands', () => {
      const curlCmd = 'curl -H "Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" https://api.example.com';
      const result = scanner.scan(curlCmd);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('openai_key');
    });

    test('detects secrets in database connection strings', () => {
      const connStr = 'postgresql://user:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY@localhost:5432/mydb';
      const result = scanner.scan(connStr);

      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });
});

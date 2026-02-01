import { describe, test, expect, beforeEach } from 'vitest';
import { SecurityGuards } from '../../../src/modules/clawshield/guards';

describe('SecurityGuards', () => {
  let guards: SecurityGuards;

  beforeEach(() => {
    guards = new SecurityGuards();
  });

  describe('validateInput', () => {
    test('passes clean input', () => {
      const result = guards.validateInput('hello world');
      expect(result.valid).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.issues).toHaveLength(0);
    });

    test('blocks secrets', () => {
      const result = guards.validateInput('key: AKIAIOSFODNN7EXAMPLE');
      expect(result.blocked).toBe(true);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.type === 'secret')).toBe(true);
    });

    test('detects PII', () => {
      const result = guards.validateInput('email: test@example.com');
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(false); // PII doesn't block, just detects
      expect(result.issues.some(i => i.type === 'pii')).toBe(true);
    });

    test('marks secrets as critical severity', () => {
      const result = guards.validateInput('key: AKIAIOSFODNN7EXAMPLE');
      const secretIssue = result.issues.find(i => i.type === 'secret');
      expect(secretIssue?.severity).toBe('critical');
    });

    test('marks PII as medium severity', () => {
      const result = guards.validateInput('email: test@example.com');
      const piiIssue = result.issues.find(i => i.type === 'pii');
      expect(piiIssue?.severity).toBe('medium');
    });

    test('includes position information', () => {
      const result = guards.validateInput('key: AKIAIOSFODNN7EXAMPLE');
      const issue = result.issues[0];
      expect(issue.position).toBeDefined();
      expect(issue.position?.start).toBeGreaterThanOrEqual(0);
      expect(issue.position?.end).toBeGreaterThan(issue.position.start);
    });

    test('includes descriptions', () => {
      const result = guards.validateInput('key: AKIAIOSFODNN7EXAMPLE');
      const issue = result.issues[0];
      expect(issue.description).toBeDefined();
      expect(issue.description).toContain('aws_access_key');
    });

    test('detects multiple issues', () => {
      const result = guards.validateInput(
        'key: AKIAIOSFODNN7EXAMPLE email: test@example.com'
      );
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
      expect(result.issues.some(i => i.type === 'secret')).toBe(true);
      expect(result.issues.some(i => i.type === 'pii')).toBe(true);
    });

    test('does not block when blockSecrets is false', () => {
      const permissiveGuards = new SecurityGuards({ blockSecrets: false });
      const result = permissiveGuards.validateInput('key: AKIAIOSFODNN7EXAMPLE');
      expect(result.blocked).toBe(false);
      expect(result.valid).toBe(false); // Still has issues
      expect(result.issues.length).toBeGreaterThan(0);
    });

    test('handles empty input', () => {
      const result = guards.validateInput('');
      expect(result.valid).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.issues).toHaveLength(0);
    });

    test('handles multiline input', () => {
      const input = `
        Here is some text
        email: test@example.com
        more text here
      `;
      const result = guards.validateInput(input);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.type === 'pii')).toBe(true);
    });
  });

  describe('validateOutput', () => {
    test('validates output same as input', () => {
      const result = guards.validateOutput('clean content');
      expect(result.valid).toBe(true);
      expect(result.blocked).toBe(false);
    });

    test('detects secrets in output', () => {
      const result = guards.validateOutput('key: AKIAIOSFODNN7EXAMPLE');
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.issues.some(i => i.type === 'secret')).toBe(true);
    });

    test('detects PII in output', () => {
      const result = guards.validateOutput('contact: test@example.com');
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.type === 'pii')).toBe(true);
    });

    test('handles empty output', () => {
      const result = guards.validateOutput('');
      expect(result.valid).toBe(true);
    });
  });

  describe('sanitize', () => {
    test('redacts PII when enabled', () => {
      const result = guards.sanitize('contact test@example.com');
      expect(result.content).toContain('[REDACTED]');
      expect(result.content).not.toContain('test@example.com');
      expect(result.changes.length).toBeGreaterThan(0);
    });

    test('returns unchanged for clean content', () => {
      const result = guards.sanitize('clean content');
      expect(result.content).toBe('clean content');
      expect(result.changes).toHaveLength(0);
    });

    test('does not redact when redactPII is false', () => {
      const noRedactGuards = new SecurityGuards({ redactPII: false });
      const result = noRedactGuards.sanitize('email: test@example.com');
      expect(result.content).toBe('email: test@example.com');
      expect(result.changes).toHaveLength(0);
    });

    test('lists changes made', () => {
      const result = guards.sanitize('email: test@example.com');
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.changes[0]).toContain('Redacted');
    });

    test('handles multiple PII items', () => {
      const input = 'email: test@example.com phone: 555-123-4567';
      const result = guards.sanitize(input);
      expect(result.content).toContain('[REDACTED]');
      expect(result.content).not.toContain('test@example.com');
      expect(result.content).not.toContain('555-123-4567');
    });

    test('handles empty content', () => {
      const result = guards.sanitize('');
      expect(result.content).toBe('');
      expect(result.changes).toHaveLength(0);
    });

    test('preserves structure while redacting', () => {
      const input = 'User email is test@example.com and phone is 555-123-4567';
      const result = guards.sanitize(input);
      expect(result.content).toContain('User email is');
      expect(result.content).toContain('and phone is');
    });
  });

  describe('markUntrusted', () => {
    test('adds spotlighting markers', () => {
      const result = guards.markUntrusted('untrusted content');
      expect(result).toContain('«UNTRUSTED_START»');
      expect(result).toContain('«UNTRUSTED_END»');
      expect(result).toContain('untrusted content');
    });

    test('does not mark when disabled', () => {
      const noSpotlight = new SecurityGuards({ spotlightUntrusted: false });
      const result = noSpotlight.markUntrusted('content');
      expect(result).toBe('content');
      expect(result).not.toContain('UNTRUSTED');
    });

    test('handles empty content', () => {
      const result = guards.markUntrusted('');
      expect(result).toBe('');
    });

    test('marks long content', () => {
      const longContent = 'word '.repeat(100);
      const result = guards.markUntrusted(longContent);
      expect(result).toContain('«UNTRUSTED_START»');
      expect(result).toContain('«UNTRUSTED_END»');
    });
  });

  describe('unmarkContent', () => {
    test('removes spotlighting markers', () => {
      const marked = guards.markUntrusted('hello world');
      const unmarked = guards.unmarkContent(marked);
      expect(unmarked).toBe('hello world');
      expect(unmarked).not.toContain('UNTRUSTED');
    });

    test('handles unmarked content', () => {
      const result = guards.unmarkContent('plain text');
      expect(result).toBe('plain text');
    });

    test('handles empty content', () => {
      const result = guards.unmarkContent('');
      expect(result).toBe('');
    });

    test('roundtrip mark/unmark preserves content', () => {
      const original = 'test content with special chars: @#$%';
      const marked = guards.markUntrusted(original);
      const unmarked = guards.unmarkContent(marked);
      expect(unmarked).toBe(original);
    });
  });

  describe('configuration', () => {
    test('defaults to blocking secrets', () => {
      const defaultGuards = new SecurityGuards();
      const result = defaultGuards.validateInput('key: AKIAIOSFODNN7EXAMPLE');
      expect(result.blocked).toBe(true);
    });

    test('defaults to redacting PII', () => {
      const defaultGuards = new SecurityGuards();
      const result = defaultGuards.sanitize('email: test@example.com');
      expect(result.content).toContain('[REDACTED]');
    });

    test('defaults to spotlighting untrusted', () => {
      const defaultGuards = new SecurityGuards();
      const result = defaultGuards.markUntrusted('content');
      expect(result).toContain('UNTRUSTED');
    });

    test('respects custom blockSecrets config', () => {
      const guards = new SecurityGuards({ blockSecrets: false });
      const result = guards.validateInput('key: AKIAIOSFODNN7EXAMPLE');
      expect(result.blocked).toBe(false);
    });

    test('respects custom redactPII config', () => {
      const guards = new SecurityGuards({ redactPII: false });
      const result = guards.sanitize('email: test@example.com');
      expect(result.content).toBe('email: test@example.com');
    });

    test('respects custom spotlightUntrusted config', () => {
      const guards = new SecurityGuards({ spotlightUntrusted: false });
      const result = guards.markUntrusted('content');
      expect(result).toBe('content');
    });

    test('allows mixed configuration', () => {
      const guards = new SecurityGuards({
        blockSecrets: true,
        redactPII: false,
        spotlightUntrusted: true
      });

      expect(guards.validateInput('key: AKIAIOSFODNN7EXAMPLE').blocked).toBe(true);
      expect(guards.sanitize('email: test@example.com').content).toBe('email: test@example.com');
      expect(guards.markUntrusted('test')).toContain('UNTRUSTED');
    });
  });

  describe('edge cases', () => {
    test('handles very long input', () => {
      const longInput = 'a'.repeat(10000);
      const result = guards.validateInput(longInput);
      expect(result).toBeDefined();
    });

    test('handles special characters', () => {
      const input = 'Special: !@#$%^&*()_+-=[]{}|;:,.<>?';
      const result = guards.validateInput(input);
      expect(result.valid).toBe(true);
    });

    test('handles unicode characters', () => {
      const input = 'Unicode: 你好世界 مرحبا العالم';
      const result = guards.validateInput(input);
      expect(result.valid).toBe(true);
    });

    test('handles mixed secrets and PII', () => {
      const input = 'AWS key: AKIAIOSFODNN7EXAMPLE, contact: test@example.com';
      const result = guards.validateInput(input);
      expect(result.blocked).toBe(true);
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
    });

    test('sanitize preserves non-sensitive content', () => {
      const input = 'User name: John, email: john@example.com, role: admin';
      const result = guards.sanitize(input);
      expect(result.content).toContain('User name: John');
      expect(result.content).toContain('role: admin');
      expect(result.content).not.toContain('john@example.com');
    });
  });
});

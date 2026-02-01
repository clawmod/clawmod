/**
 * Security Guards - Unified security validation and sanitization
 *
 * Combines SecretScanner, PIIDetector, and Spotlighter to provide
 * comprehensive input/output validation and content sanitization.
 */

import { SecretScanner } from './secrets';
import { PIIDetector } from './pii';
import { Spotlighter } from './spotlighting';

export interface ValidationResult {
  valid: boolean;
  blocked: boolean;
  issues: SecurityIssue[];
  sanitizedContent?: string;
}

export interface SecurityIssue {
  type: 'secret' | 'pii' | 'injection';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  position?: { start: number; end: number };
}

export interface GuardsConfig {
  blockSecrets?: boolean;
  redactPII?: boolean;
  spotlightUntrusted?: boolean;
}

export class SecurityGuards {
  private secretScanner: SecretScanner;
  private piiDetector: PIIDetector;
  private spotlighter: Spotlighter;
  private config: GuardsConfig;

  constructor(config: GuardsConfig = {}) {
    this.config = {
      blockSecrets: true,
      redactPII: true,
      spotlightUntrusted: true,
      ...config,
    };
    this.secretScanner = new SecretScanner();
    this.piiDetector = new PIIDetector();
    this.spotlighter = new Spotlighter();
  }

  /**
   * Validate incoming content for security threats
   *
   * Checks for secrets and PII. If secrets are found and blockSecrets is enabled,
   * the content will be marked as blocked.
   *
   * @param content - The content to validate
   * @returns Validation result with issues and blocking status
   */
  validateInput(content: string): ValidationResult {
    const issues: SecurityIssue[] = [];

    // Check for secrets (should block)
    const secrets = this.secretScanner.scan(content);
    for (const secret of secrets) {
      issues.push({
        type: 'secret',
        severity: 'critical',
        description: `Detected ${secret.type} in input`,
        position: { start: secret.start, end: secret.end },
      });
    }

    // Check for PII (can redact)
    const pii = this.piiDetector.detect(content);
    for (const match of pii) {
      issues.push({
        type: 'pii',
        severity: 'medium',
        description: `Detected ${match.type} in input`,
        position: { start: match.start, end: match.end },
      });
    }

    const blocked = this.config.blockSecrets === true && secrets.length > 0;

    return {
      valid: issues.length === 0,
      blocked,
      issues,
    };
  }

  /**
   * Validate outgoing content for data leaks
   *
   * Similar to validateInput but for content being sent out.
   * Helps prevent accidental leakage of sensitive information.
   *
   * @param content - The content to validate
   * @returns Validation result with issues and blocking status
   */
  validateOutput(content: string): ValidationResult {
    // Similar to validateInput but for outgoing content
    return this.validateInput(content);
  }

  /**
   * Sanitize content by removing or redacting dangerous items
   *
   * Redacts PII according to configuration. Does not remove secrets
   * (those should be blocked at validation time).
   *
   * @param content - The content to sanitize
   * @returns Sanitized content and list of changes made
   */
  sanitize(content: string): { content: string; changes: string[] } {
    const changes: string[] = [];
    let sanitized = content;

    // Redact PII if enabled
    if (this.config.redactPII === true) {
      const result = this.piiDetector.redact(sanitized);
      if (result.redactions.length > 0) {
        sanitized = result.content;
        changes.push(`Redacted ${result.redactions.length} PII items`);
      }
    }

    return { content: sanitized, changes };
  }

  /**
   * Mark content as untrusted using spotlighting
   *
   * Applies spotlighting markers to help LLMs identify untrusted content
   * and prevent injection attacks.
   *
   * @param content - The content to mark
   * @returns Content with spotlighting markers applied
   */
  markUntrusted(content: string): string {
    if (this.config.spotlightUntrusted !== true) return content;
    return this.spotlighter.mark(content);
  }

  /**
   * Remove spotlighting markers from content
   *
   * @param content - The marked content
   * @returns Content with markers removed
   */
  unmarkContent(content: string): string {
    return this.spotlighter.unmark(content);
  }
}

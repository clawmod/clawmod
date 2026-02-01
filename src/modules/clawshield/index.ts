/**
 * ClawShield Module - Layer 1 Security Module
 *
 * Provides comprehensive security scanning and sanitization:
 * - Secret detection and blocking
 * - PII detection and redaction
 * - Prompt injection prevention (spotlighting)
 * - Tamper-evident audit logging
 *
 * Layer: 1 (Security - runs before all other modules)
 * Dependencies: None (standalone security layer)
 * Priority: 10 (hooks run FIRST, mutate context before ClawMem sees it)
 */

import type {
  ClawModModule,
  CoreServices,
  HookRegistration,
  CliCommand,
  SkillDefinition,
  HealthStatus,
} from '../../types';
import { SecurityGuards } from './guards';
import { AuditLogger } from './audit';
import { createClawShieldHooks } from './hooks';
import * as path from 'path';
import * as os from 'os';

interface ClawShieldConfig {
  spotlighting?: { enabled?: boolean; tokenInterval?: number };
  secretScanning?: { enabled?: boolean; patterns?: string[]; entropyThreshold?: number };
  piiDetection?: { enabled?: boolean; types?: string[]; redactionStyle?: string };
  audit?: { enabled?: boolean; retention?: number };
}

export class ClawShieldModule implements ClawModModule {
  readonly name = 'clawshield';
  readonly version = '0.1.0';
  readonly layer = 1 as const;
  readonly requires: string[] = [];
  readonly optional: string[] = [];

  private guards: SecurityGuards | null = null;
  private audit: AuditLogger | null = null;
  private hooks: HookRegistration[] = [];
  private enabled = true;

  async initialize(core: CoreServices): Promise<void> {
    const config = core.config.getModuleConfig<ClawShieldConfig>('clawshield');

    // Create audit directory
    const auditDir = path.join(
      os.homedir(),
      '.openclaw',
      'agents',
      'default',
      'workspace',
      'clawmod',
      'audit'
    );

    this.guards = new SecurityGuards({
      blockSecrets: config?.secretScanning?.enabled ?? true,
      redactPII: config?.piiDetection?.enabled ?? true,
      spotlightUntrusted: config?.spotlighting?.enabled ?? true,
    });

    this.audit = new AuditLogger({
      enabled: config?.audit?.enabled ?? true,
      retention: config?.audit?.retention ?? 90,
      auditDir,
    });

    this.hooks = createClawShieldHooks({
      guards: this.guards,
      audit: this.audit,
    });
  }

  async shutdown(): Promise<void> {
    // Cleanup resources
    this.guards = null;
    this.audit = null;
    this.hooks = [];
  }

  async enable(): Promise<void> {
    this.enabled = true;
  }

  async disable(): Promise<void> {
    this.enabled = false;
  }

  getHooks(): HookRegistration[] {
    return this.enabled ? this.hooks : [];
  }

  getCommands(): CliCommand[] {
    return []; // To be implemented later
  }

  getSkills(): SkillDefinition[] {
    return []; // To be implemented later
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      healthy: this.guards !== null && this.audit !== null,
      checks: {
        guards: { ok: this.guards !== null, message: 'Security guards initialized' },
        audit: { ok: this.audit !== null, message: 'Audit logger initialized' },
      },
    };
  }

  // Public API for other modules
  scanSecrets(content: string) {
    return this.guards?.validateInput(content) ?? { valid: true, blocked: false, issues: [] };
  }

  redactPII(content: string) {
    return this.guards?.sanitize(content) ?? { content, changes: [] };
  }
}

// Export all ClawShield components for external use
export { ClawShieldModule as default };
export { SecretScanner } from './secrets';
export { PIIDetector } from './pii';
export { Spotlighter } from './spotlighting';
export { AuditLogger } from './audit';
export { SecurityGuards } from './guards';
export { createClawShieldHooks } from './hooks';

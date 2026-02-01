/**
 * Audit logging for ClawShield security module
 *
 * Features:
 * - JSONL format with SHA-256 hash chaining for integrity
 * - HMAC signatures for verification
 * - Log rotation by date (YYYY-MM-DD.jsonl)
 * - Automatic cleanup based on retention policy
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type { AuditEvent } from '../../types';

interface AuditConfig {
  enabled?: boolean;
  retention?: number;  // days
  auditDir: string;    // Full path to audit directory
  hmacSecret?: string; // Secret for HMAC signatures
}

/**
 * AuditLogger provides secure, tamper-evident logging for security events
 *
 * Each log entry includes:
 * - Unique ID and timestamp
 * - Hash chain linking to previous entry
 * - HMAC signature for integrity verification
 *
 * Logs are stored in daily JSONL files: YYYY-MM-DD.jsonl
 */
export class AuditLogger {
  private enabled: boolean;
  private retention: number;
  private auditDir: string;
  private hmacSecret: string;
  private lastHash: string = '';

  constructor(config: AuditConfig) {
    this.enabled = config.enabled ?? true;
    this.retention = config.retention ?? 90;
    this.auditDir = config.auditDir;
    this.hmacSecret = config.hmacSecret ?? 'clawmod-audit-secret';
  }

  /**
   * Log a security event with hash chaining and HMAC signature
   */
  async log(event: Omit<AuditEvent, 'id' | 'timestamp' | 'hash' | 'signature'>): Promise<void> {
    if (!this.enabled) return;

    const entry: AuditEvent = {
      id: this.generateId(),
      timestamp: new Date(),
      ...event,
      hash: '', // Will be set below
      signature: '', // Will be set below
    };

    // Hash chain: include previous hash
    const dataToHash = JSON.stringify({ ...entry, previousHash: this.lastHash });
    entry.hash = this.createHash(dataToHash);
    this.lastHash = entry.hash;

    // HMAC signature
    entry.signature = this.createSignature(JSON.stringify(entry));

    // Write to daily log file
    await this.writeEntry(entry);
  }

  /**
   * Get recent events from today's log file
   * @param limit Maximum number of events to return (default: 100)
   */
  async getRecentEvents(limit: number = 100): Promise<AuditEvent[]> {
    // Read from today's log file
    const filename = this.getLogFilename();
    const filepath = path.join(this.auditDir, filename);

    try {
      const content = await fs.readFile(filepath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      const events = lines.map(line => JSON.parse(line) as AuditEvent);
      return events.slice(-limit);
    } catch {
      return [];
    }
  }

  /**
   * Generate a unique audit event ID
   */
  private generateId(): string {
    return `aud_${crypto.randomBytes(12).toString('hex')}`;
  }

  /**
   * Create SHA-256 hash of data
   */
  private createHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Create HMAC signature for integrity verification
   */
  private createSignature(data: string): string {
    return crypto.createHmac('sha256', this.hmacSecret).update(data).digest('hex');
  }

  /**
   * Get log filename for current date (YYYY-MM-DD.jsonl)
   */
  private getLogFilename(): string {
    const date = new Date().toISOString().split('T')[0];
    return `${date}.jsonl`;
  }

  /**
   * Write audit entry to daily log file
   */
  private async writeEntry(entry: AuditEvent): Promise<void> {
    await fs.mkdir(this.auditDir, { recursive: true });
    const filepath = path.join(this.auditDir, this.getLogFilename());
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(filepath, line, 'utf-8');
  }

  /**
   * Remove logs older than retention period
   */
  async cleanup(): Promise<void> {
    // Remove logs older than retention period
    const cutoff = Date.now() - this.retention * 24 * 60 * 60 * 1000;

    try {
      const files = await fs.readdir(this.auditDir);
      for (const file of files) {
        if (file.endsWith('.jsonl')) {
          const datePart = file.replace('.jsonl', '');
          const fileDate = new Date(datePart).getTime();
          if (fileDate < cutoff) {
            await fs.unlink(path.join(this.auditDir, file));
          }
        }
      }
    } catch {
      // Directory might not exist yet
    }
  }
}

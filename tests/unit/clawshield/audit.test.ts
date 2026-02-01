import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { AuditLogger } from '../../../src/modules/clawshield/audit';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { AuditEvent } from '../../../src/types';

describe('AuditLogger', () => {
  let auditDir: string;
  let logger: AuditLogger;

  beforeEach(async () => {
    auditDir = path.join(os.tmpdir(), `clawmod-audit-test-${Date.now()}`);
    logger = new AuditLogger({ auditDir, enabled: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(auditDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  describe('log', () => {
    test('logs events to JSONL file', async () => {
      await logger.log({
        event: 'test_event',
        severity: 'low',
        details: { test: true }
      });

      const events = await logger.getRecentEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].event).toBe('test_event');
    });

    test('generates unique IDs', async () => {
      await logger.log({ event: 'test1', severity: 'low', details: {} });
      await logger.log({ event: 'test2', severity: 'low', details: {} });

      const events = await logger.getRecentEvents();
      expect(events.length).toBe(2);
      expect(events[0].id).not.toBe(events[1].id);
      expect(events[0].id).toMatch(/^aud_[a-f0-9]{24}$/);
    });

    test('includes timestamp', async () => {
      const before = new Date();
      await logger.log({ event: 'test', severity: 'low', details: {} });
      const after = new Date();

      const events = await logger.getRecentEvents();
      const timestamp = new Date(events[0].timestamp);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test('includes hash', async () => {
      await logger.log({ event: 'test', severity: 'low', details: {} });
      const events = await logger.getRecentEvents();
      expect(events[0].hash).toBeDefined();
      expect(events[0].hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    test('includes signature', async () => {
      await logger.log({ event: 'test', severity: 'low', details: {} });
      const events = await logger.getRecentEvents();
      expect(events[0].signature).toBeDefined();
      expect(events[0].signature).toMatch(/^[a-f0-9]{64}$/); // HMAC SHA-256 hex
    });

    test('creates hash chain', async () => {
      await logger.log({ event: 'test1', severity: 'low', details: {} });
      await logger.log({ event: 'test2', severity: 'low', details: {} });

      const events = await logger.getRecentEvents();
      expect(events[0].hash).not.toBe(events[1].hash);
    });

    test('includes session ID when provided', async () => {
      await logger.log({
        event: 'test',
        severity: 'low',
        details: {},
        sessionId: 'session-123'
      });

      const events = await logger.getRecentEvents();
      expect(events[0].sessionId).toBe('session-123');
    });

    test('handles different severity levels', async () => {
      await logger.log({ event: 'low', severity: 'low', details: {} });
      await logger.log({ event: 'medium', severity: 'medium', details: {} });
      await logger.log({ event: 'high', severity: 'high', details: {} });
      await logger.log({ event: 'critical', severity: 'critical', details: {} });

      const events = await logger.getRecentEvents();
      expect(events.length).toBe(4);
    });

    test('stores complex details', async () => {
      const details = {
        user: 'test@example.com',
        action: 'pii_detected',
        redactions: ['email', 'phone'],
        metadata: { foo: 'bar', nested: { key: 'value' } }
      };

      await logger.log({
        event: 'test',
        severity: 'medium',
        details
      });

      const events = await logger.getRecentEvents();
      expect(events[0].details).toEqual(details);
    });

    test('does not write when disabled', async () => {
      const disabledLogger = new AuditLogger({ auditDir, enabled: false });
      await disabledLogger.log({ event: 'test', severity: 'low', details: {} });

      const events = await logger.getRecentEvents();
      expect(events.length).toBe(0);
    });

    test('creates audit directory if missing', async () => {
      const newDir = path.join(os.tmpdir(), `clawmod-audit-new-${Date.now()}`);
      const newLogger = new AuditLogger({ auditDir: newDir, enabled: true });

      await newLogger.log({ event: 'test', severity: 'low', details: {} });

      const stat = await fs.stat(newDir);
      expect(stat.isDirectory()).toBe(true);

      await fs.rm(newDir, { recursive: true, force: true });
    });
  });

  describe('getRecentEvents', () => {
    test('returns empty array for missing file', async () => {
      const events = await logger.getRecentEvents();
      expect(events).toEqual([]);
    });

    test('returns events from today', async () => {
      await logger.log({ event: 'test1', severity: 'low', details: {} });
      await logger.log({ event: 'test2', severity: 'low', details: {} });
      await logger.log({ event: 'test3', severity: 'low', details: {} });

      const events = await logger.getRecentEvents();
      expect(events.length).toBe(3);
    });

    test('respects limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await logger.log({ event: `test${i}`, severity: 'low', details: {} });
      }

      const events = await logger.getRecentEvents(5);
      expect(events.length).toBe(5);
    });

    test('returns most recent events when limited', async () => {
      await logger.log({ event: 'first', severity: 'low', details: {} });
      await logger.log({ event: 'second', severity: 'low', details: {} });
      await logger.log({ event: 'third', severity: 'low', details: {} });

      const events = await logger.getRecentEvents(2);
      expect(events.length).toBe(2);
      expect(events[0].event).toBe('second');
      expect(events[1].event).toBe('third');
    });

    test('handles default limit', async () => {
      await logger.log({ event: 'test', severity: 'low', details: {} });
      const events = await logger.getRecentEvents();
      expect(events.length).toBe(1);
    });

    test('parses JSONL correctly', async () => {
      await logger.log({ event: 'test', severity: 'low', details: { foo: 'bar' } });
      const events = await logger.getRecentEvents();

      const event = events[0];
      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.event).toBe('test');
      expect(event.severity).toBe('low');
      expect(event.details).toEqual({ foo: 'bar' });
      expect(event.hash).toBeDefined();
      expect(event.signature).toBeDefined();
    });
  });

  describe('cleanup', () => {
    test('removes old log files', async () => {
      await fs.mkdir(auditDir, { recursive: true });

      // Create an old file (100 days ago)
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      const oldFile = `${oldDate.toISOString().split('T')[0]}.jsonl`;
      await fs.writeFile(path.join(auditDir, oldFile), '{"test":true}\n');

      // Create a recent file
      const recentDate = new Date();
      const recentFile = `${recentDate.toISOString().split('T')[0]}.jsonl`;
      await fs.writeFile(path.join(auditDir, recentFile), '{"test":true}\n');

      await logger.cleanup();

      const files = await fs.readdir(auditDir);
      expect(files).not.toContain(oldFile);
      expect(files).toContain(recentFile);
    });

    test('handles missing directory', async () => {
      const newLogger = new AuditLogger({
        auditDir: path.join(os.tmpdir(), 'nonexistent'),
        enabled: true
      });

      await expect(newLogger.cleanup()).resolves.not.toThrow();
    });

    test('respects retention period', async () => {
      const shortRetention = new AuditLogger({
        auditDir,
        enabled: true,
        retention: 30 // 30 days
      });

      await fs.mkdir(auditDir, { recursive: true });

      // Create file 45 days old (should be deleted)
      const old45 = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
      const old45File = `${old45.toISOString().split('T')[0]}.jsonl`;
      await fs.writeFile(path.join(auditDir, old45File), '{"test":true}\n');

      // Create file 20 days old (should be kept)
      const old20 = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
      const old20File = `${old20.toISOString().split('T')[0]}.jsonl`;
      await fs.writeFile(path.join(auditDir, old20File), '{"test":true}\n');

      await shortRetention.cleanup();

      const files = await fs.readdir(auditDir);
      expect(files).not.toContain(old45File);
      expect(files).toContain(old20File);
    });

    test('only removes jsonl files', async () => {
      await fs.mkdir(auditDir, { recursive: true });

      // Create old jsonl file
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      const oldFile = `${oldDate.toISOString().split('T')[0]}.jsonl`;
      await fs.writeFile(path.join(auditDir, oldFile), '{"test":true}\n');

      // Create other file
      await fs.writeFile(path.join(auditDir, 'readme.txt'), 'test');

      await logger.cleanup();

      const files = await fs.readdir(auditDir);
      expect(files).not.toContain(oldFile);
      expect(files).toContain('readme.txt');
    });
  });

  describe('configuration', () => {
    test('uses default retention of 90 days', async () => {
      const defaultLogger = new AuditLogger({ auditDir });
      await fs.mkdir(auditDir, { recursive: true });

      const old100 = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      const old100File = `${old100.toISOString().split('T')[0]}.jsonl`;
      await fs.writeFile(path.join(auditDir, old100File), '{"test":true}\n');

      await defaultLogger.cleanup();

      const files = await fs.readdir(auditDir);
      expect(files).not.toContain(old100File);
    });

    test('defaults to enabled', async () => {
      const defaultLogger = new AuditLogger({ auditDir });
      await defaultLogger.log({ event: 'test', severity: 'low', details: {} });

      const events = await defaultLogger.getRecentEvents();
      expect(events.length).toBe(1);
    });

    test('uses custom HMAC secret', async () => {
      const customLogger = new AuditLogger({
        auditDir,
        enabled: true,
        hmacSecret: 'custom-secret-123'
      });

      await customLogger.log({ event: 'test', severity: 'low', details: {} });
      const events = await customLogger.getRecentEvents();
      expect(events[0].signature).toBeDefined();
    });
  });
});

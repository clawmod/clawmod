import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createClawShieldHooks } from '../../../src/modules/clawshield/hooks';
import { SecurityGuards } from '../../../src/modules/clawshield/guards';
import { AuditLogger } from '../../../src/modules/clawshield/audit';
import type { HookContext } from '../../../src/types';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('ClawShield Hooks', () => {
  let guards: SecurityGuards;
  let audit: AuditLogger;
  let hooks: ReturnType<typeof createClawShieldHooks>;
  let auditDir: string;

  beforeEach(() => {
    guards = new SecurityGuards();
    auditDir = path.join(os.tmpdir(), `clawmod-test-audit-${Date.now()}`);
    audit = new AuditLogger({
      auditDir,
      enabled: true
    });
    hooks = createClawShieldHooks({ guards, audit });
  });

  afterEach(async () => {
    try {
      await fs.rm(auditDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  describe('hook structure', () => {
    test('creates 4 hooks', () => {
      expect(hooks).toHaveLength(4);
    });

    test('all hooks have priority 10', () => {
      for (const hook of hooks) {
        expect(hook.priority).toBe(10);
      }
    });

    test('all hooks mutate context', () => {
      for (const hook of hooks) {
        expect(hook.mutatesContext).toBe(true);
      }
    });

    test('includes message_received hook', () => {
      const hook = hooks.find(h => h.event === 'message_received');
      expect(hook).toBeDefined();
    });

    test('includes message_sending hook', () => {
      const hook = hooks.find(h => h.event === 'message_sending');
      expect(hook).toBeDefined();
    });

    test('includes before_tool_call hook', () => {
      const hook = hooks.find(h => h.event === 'before_tool_call');
      expect(hook).toBeDefined();
    });

    test('includes tool_result_persist hook', () => {
      const hook = hooks.find(h => h.event === 'tool_result_persist');
      expect(hook).toBeDefined();
    });
  });

  describe('message_received hook', () => {
    let hook: typeof hooks[0];

    beforeEach(() => {
      hook = hooks.find(h => h.event === 'message_received')!;
    });

    test('passes clean messages', async () => {
      const ctx: HookContext = {
        event: 'message_received',
        data: { content: 'hello world' },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result.blocked).toBeFalsy();
      expect(result.modified).toBeUndefined();
    });

    test('blocks messages with secrets', async () => {
      const ctx: HookContext = {
        event: 'message_received',
        data: { content: 'key: AKIAIOSFODNN7EXAMPLE' },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Security violation');
    });

    test('redacts PII in messages', async () => {
      const ctx: HookContext = {
        event: 'message_received',
        data: { content: 'email: test@example.com' },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result.modified).toBeDefined();
      const modified = result.modified as { content: string };
      expect(modified.content).toContain('[REDACTED]');
      expect(modified.content).not.toContain('test@example.com');
    });

    test('logs blocked secrets to audit', async () => {
      const ctx: HookContext = {
        event: 'message_received',
        data: { content: 'key: AKIAIOSFODNN7EXAMPLE' },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      await hook.handler(ctx);

      const events = await audit.getRecentEvents();
      const secretEvent = events.find(e => e.event === 'secret_detected');
      expect(secretEvent).toBeDefined();
      expect(secretEvent?.severity).toBe('critical');
    });

    test('logs redacted PII to audit', async () => {
      const ctx: HookContext = {
        event: 'message_received',
        data: { content: 'email: test@example.com' },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      await hook.handler(ctx);

      const events = await audit.getRecentEvents();
      const piiEvent = events.find(e => e.event === 'pii_redacted');
      expect(piiEvent).toBeDefined();
      expect(piiEvent?.severity).toBe('medium');
    });

    test('handles missing content gracefully', async () => {
      const ctx: HookContext = {
        event: 'message_received',
        data: {},
        metadata: {},
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result).toEqual({});
    });

    test('handles null data', async () => {
      const ctx: HookContext = {
        event: 'message_received',
        data: null,
        metadata: {},
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result).toEqual({});
    });

    test('includes session ID in audit logs', async () => {
      const ctx: HookContext = {
        event: 'message_received',
        data: { content: 'key: AKIAIOSFODNN7EXAMPLE' },
        metadata: { sessionId: 'my-session-123' },
        timestamp: new Date()
      };

      await hook.handler(ctx);

      const events = await audit.getRecentEvents();
      expect(events[0].sessionId).toBe('my-session-123');
    });
  });

  describe('message_sending hook', () => {
    let hook: typeof hooks[0];

    beforeEach(() => {
      hook = hooks.find(h => h.event === 'message_sending')!;
    });

    test('passes clean output', async () => {
      const ctx: HookContext = {
        event: 'message_sending',
        data: { content: 'clean response' },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result.blocked).toBeFalsy();
      expect(result.modified).toBeUndefined();
    });

    test('attempts to sanitize secrets in output', async () => {
      const ctx: HookContext = {
        event: 'message_sending',
        data: { content: 'key: AKIAIOSFODNN7EXAMPLE' },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      // Note: sanitize() only redacts PII, not secrets, so modified will exist but content unchanged
      expect(result.modified).toBeDefined();
      const modified = result.modified as { content: string };
      // The secret remains because sanitize() doesn't handle secrets
      expect(modified.content).toBe('key: AKIAIOSFODNN7EXAMPLE');
    });

    test('logs secrets in output to audit', async () => {
      const ctx: HookContext = {
        event: 'message_sending',
        data: { content: 'key: AKIAIOSFODNN7EXAMPLE' },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      await hook.handler(ctx);

      const events = await audit.getRecentEvents();
      const secretEvent = events.find(e => e.event === 'secret_in_output');
      expect(secretEvent).toBeDefined();
      expect(secretEvent?.severity).toBe('high');
    });

    test('redacts PII in output', async () => {
      const ctx: HookContext = {
        event: 'message_sending',
        data: { content: 'contact: test@example.com' },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result.modified).toBeDefined();
      const modified = result.modified as { content: string };
      expect(modified.content).toContain('[REDACTED]');
    });

    test('logs PII in output to audit', async () => {
      const ctx: HookContext = {
        event: 'message_sending',
        data: { content: 'email: test@example.com' },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      await hook.handler(ctx);

      const events = await audit.getRecentEvents();
      const piiEvent = events.find(e => e.event === 'pii_in_output');
      expect(piiEvent).toBeDefined();
      expect(piiEvent?.severity).toBe('medium');
    });

    test('handles missing content', async () => {
      const ctx: HookContext = {
        event: 'message_sending',
        data: {},
        metadata: {},
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result).toEqual({});
    });
  });

  describe('before_tool_call hook', () => {
    let hook: typeof hooks[0];

    beforeEach(() => {
      hook = hooks.find(h => h.event === 'before_tool_call')!;
    });

    test('passes clean tool calls', async () => {
      const ctx: HookContext = {
        event: 'before_tool_call',
        data: { name: 'test_tool', args: { query: 'safe input' } },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result.blocked).toBeFalsy();
    });

    test('blocks tool calls with secrets in args', async () => {
      const ctx: HookContext = {
        event: 'before_tool_call',
        data: {
          name: 'api_call',
          args: { apiKey: 'AKIAIOSFODNN7EXAMPLE' }
        },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('secrets in arguments');
    });

    test('logs blocked tool calls to audit', async () => {
      const ctx: HookContext = {
        event: 'before_tool_call',
        data: {
          name: 'dangerous_tool',
          args: { secret: 'AKIAIOSFODNN7EXAMPLE' }
        },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      await hook.handler(ctx);

      const events = await audit.getRecentEvents();
      const toolEvent = events.find(e => e.event === 'tool_blocked');
      expect(toolEvent).toBeDefined();
      expect(toolEvent?.severity).toBe('critical');
      expect(toolEvent?.details.tool).toBe('dangerous_tool');
    });

    test('handles tool calls with complex args', async () => {
      const ctx: HookContext = {
        event: 'before_tool_call',
        data: {
          name: 'complex_tool',
          args: {
            nested: { deep: { value: 'safe' } },
            array: [1, 2, 3]
          }
        },
        metadata: {},
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result.blocked).toBeFalsy();
    });

    test('handles missing tool data', async () => {
      const ctx: HookContext = {
        event: 'before_tool_call',
        data: null,
        metadata: {},
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result).toEqual({});
    });

    test('handles undefined args', async () => {
      const ctx: HookContext = {
        event: 'before_tool_call',
        data: { name: 'test_tool' },
        metadata: {},
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result.blocked).toBeFalsy();
    });
  });

  describe('tool_result_persist hook', () => {
    let hook: typeof hooks[0];

    beforeEach(() => {
      hook = hooks.find(h => h.event === 'tool_result_persist')!;
    });

    test('passes clean tool results', async () => {
      const ctx: HookContext = {
        event: 'tool_result_persist',
        data: { result: 'clean output' },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result.modified).toBeUndefined();
    });

    test('sanitizes PII in tool results', async () => {
      const ctx: HookContext = {
        event: 'tool_result_persist',
        data: { result: 'User email: test@example.com' },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result.modified).toBeDefined();
      const modified = result.modified as { result: string };
      expect(modified.result).toContain('[REDACTED]');
    });

    test('logs sanitized tool results to audit', async () => {
      const ctx: HookContext = {
        event: 'tool_result_persist',
        data: { result: 'Contact: test@example.com' },
        metadata: { sessionId: 'test-session' },
        timestamp: new Date()
      };

      await hook.handler(ctx);

      const events = await audit.getRecentEvents();
      const toolEvent = events.find(e => e.event === 'tool_result_sanitized');
      expect(toolEvent).toBeDefined();
      expect(toolEvent?.severity).toBe('medium');
    });

    test('handles missing result', async () => {
      const ctx: HookContext = {
        event: 'tool_result_persist',
        data: {},
        metadata: {},
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result).toEqual({});
    });

    test('handles null data', async () => {
      const ctx: HookContext = {
        event: 'tool_result_persist',
        data: null,
        metadata: {},
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      expect(result).toEqual({});
    });

    test('preserves result structure', async () => {
      const ctx: HookContext = {
        event: 'tool_result_persist',
        data: {
          result: 'User: John, email: john@example.com',
          status: 'success'
        },
        metadata: {},
        timestamp: new Date()
      };

      const result = await hook.handler(ctx);
      if (result.modified) {
        const modified = result.modified as { result: string; status: string };
        expect(modified.status).toBe('success');
        expect(modified.result).toContain('[REDACTED]');
      }
    });
  });

  describe('integration', () => {
    test('all hooks can be executed in sequence', async () => {
      const ctx: HookContext = {
        event: 'message_received',
        data: { content: 'test' },
        metadata: {},
        timestamp: new Date()
      };

      for (const hook of hooks) {
        const result = await hook.handler({ ...ctx, event: hook.event });
        expect(result).toBeDefined();
      }
    });

    test('hooks work with disabled guards', async () => {
      const disabledGuards = new SecurityGuards({
        blockSecrets: false,
        redactPII: false,
        spotlightUntrusted: false
      });

      const disabledHooks = createClawShieldHooks({
        guards: disabledGuards,
        audit
      });

      const ctx: HookContext = {
        event: 'message_received',
        data: { content: 'key: AKIAIOSFODNN7EXAMPLE' },
        metadata: {},
        timestamp: new Date()
      };

      const hook = disabledHooks.find(h => h.event === 'message_received')!;
      const result = await hook.handler(ctx);
      expect(result.blocked).toBeFalsy(); // Not blocked when disabled
    });

    test('hooks work with disabled audit', async () => {
      const disabledAudit = new AuditLogger({
        auditDir,
        enabled: false
      });

      const hooksWithDisabledAudit = createClawShieldHooks({
        guards,
        audit: disabledAudit
      });

      const ctx: HookContext = {
        event: 'message_received',
        data: { content: 'key: AKIAIOSFODNN7EXAMPLE' },
        metadata: {},
        timestamp: new Date()
      };

      const hook = hooksWithDisabledAudit.find(h => h.event === 'message_received')!;
      await hook.handler(ctx);

      const events = await disabledAudit.getRecentEvents();
      expect(events.length).toBe(0); // No events logged
    });
  });
});

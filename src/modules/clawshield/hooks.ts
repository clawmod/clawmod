/**
 * ClawShield Hook Registrations
 *
 * CRITICAL:
 * - All hooks use priority 10 (runs FIRST before ClawMem at 20)
 * - All hooks have mutatesContext = true (modifies data before other modules see it)
 * - Provides comprehensive security scanning for all data flows
 */

import type { HookContext, HookResult, HookRegistration, HookEvent } from '../../types';
import { SecurityGuards } from './guards';
import { AuditLogger } from './audit';

interface ClawShieldHooksConfig {
  guards: SecurityGuards;
  audit: AuditLogger;
}

/**
 * Create ClawShield hook registrations
 *
 * These hooks scan and sanitize data at critical lifecycle points:
 * - message_received: Scan/redact incoming messages
 * - message_sending: Scan outgoing responses
 * - before_tool_call: Validate tool parameters
 * - tool_result_persist: Sanitize tool results
 */
export function createClawShieldHooks(config: ClawShieldHooksConfig): HookRegistration[] {
  const { guards, audit } = config;

  return [
    {
      event: 'message_received' as HookEvent,
      priority: 10, // Runs FIRST
      mutatesContext: true,
      handler: async (ctx: HookContext): Promise<HookResult> => {
        const content = ctx.data as { content?: string };
        if (!content?.content) return {};

        const validation = guards.validateInput(content.content);

        if (validation.blocked) {
          await audit.log({
            event: 'secret_detected',
            severity: 'critical',
            details: { issues: validation.issues, action: 'blocked' },
            sessionId: ctx.metadata.sessionId as string | undefined,
          });
          return { blocked: true, reason: 'Security violation: secrets detected' };
        }

        if (validation.issues.some(i => i.type === 'pii')) {
          const sanitized = guards.sanitize(content.content);
          await audit.log({
            event: 'pii_redacted',
            severity: 'medium',
            details: { changes: sanitized.changes },
            sessionId: ctx.metadata.sessionId as string | undefined,
          });
          return { modified: { ...content, content: sanitized.content } };
        }

        return {};
      },
    },
    {
      event: 'message_sending' as HookEvent,
      priority: 10,
      mutatesContext: true,
      handler: async (ctx: HookContext): Promise<HookResult> => {
        const content = ctx.data as { content?: string };
        if (!content?.content) return {};

        const validation = guards.validateOutput(content.content);

        if (validation.issues.some(i => i.type === 'secret')) {
          await audit.log({
            event: 'secret_in_output',
            severity: 'high',
            details: { issues: validation.issues },
            sessionId: ctx.metadata.sessionId as string | undefined,
          });
          // Sanitize secrets in output
          const sanitized = guards.sanitize(content.content);
          return { modified: { ...content, content: sanitized.content } };
        }

        if (validation.issues.some(i => i.type === 'pii')) {
          const sanitized = guards.sanitize(content.content);
          await audit.log({
            event: 'pii_in_output',
            severity: 'medium',
            details: { changes: sanitized.changes },
            sessionId: ctx.metadata.sessionId as string | undefined,
          });
          return { modified: { ...content, content: sanitized.content } };
        }

        return {};
      },
    },
    {
      event: 'before_tool_call' as HookEvent,
      priority: 10,
      mutatesContext: true,
      handler: async (ctx: HookContext): Promise<HookResult> => {
        const toolCall = ctx.data as { name?: string; args?: Record<string, unknown> };
        if (!toolCall) return {};

        // Validate tool arguments for secrets
        const argsString = JSON.stringify(toolCall.args);
        const validation = guards.validateInput(argsString);

        if (validation.blocked) {
          await audit.log({
            event: 'tool_blocked',
            severity: 'critical',
            details: { tool: toolCall.name, reason: 'secrets in args' },
            sessionId: ctx.metadata.sessionId as string | undefined,
          });
          return { blocked: true, reason: 'Tool call blocked: secrets in arguments' };
        }

        return {};
      },
    },
    {
      event: 'tool_result_persist' as HookEvent,
      priority: 10,
      mutatesContext: true,
      handler: async (ctx: HookContext): Promise<HookResult> => {
        const result = ctx.data as { result?: string };
        if (!result?.result) return {};

        const sanitized = guards.sanitize(result.result);
        if (sanitized.changes.length > 0) {
          await audit.log({
            event: 'tool_result_sanitized',
            severity: 'medium',
            details: { changes: sanitized.changes },
            sessionId: ctx.metadata.sessionId as string | undefined,
          });
          return { modified: { ...result, result: sanitized.content } };
        }

        return {};
      },
    },
  ];
}

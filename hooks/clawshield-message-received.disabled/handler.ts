import { getClawShield } from '../../src/index';
import type { OpenClawHookHandler } from '../../src/types';

const handler: OpenClawHookHandler = async (event, context, api) => {
  const clawshield = getClawShield();
  if (!clawshield) {
    api.logger.warn("ClawShield not initialized, skipping hook");
    return {};
  }

  // Extract message content from event
  const data = event.data || context.data;
  const content = data?.content;
  if (!content) return {};

  // Get guards and audit logger from ClawShield
  const guards = (clawshield as any).guards;
  const audit = (clawshield as any).audit;

  if (!guards || !audit) {
    api.logger.error("ClawShield guards/audit not initialized");
    return {};
  }

  // Validate input using SecurityGuards
  const validation = guards.validateInput(content);

  // Block if secrets detected
  if (validation.blocked) {
    await audit.log({
      event: 'secret_detected',
      severity: 'critical',
      details: { issues: validation.issues, action: 'blocked' },
      sessionId: context.metadata?.sessionId,
    });
    api.logger.warn("Message blocked: secrets detected");
    return { blocked: true, reason: 'Security violation: secrets detected' };
  }

  // Redact PII if found
  if (validation.issues.some((i: any) => i.type === 'pii')) {
    const sanitized = guards.sanitize(content);
    await audit.log({
      event: 'pii_redacted',
      severity: 'medium',
      details: { changes: sanitized.changes },
      sessionId: context.metadata?.sessionId,
    });
    api.logger.info(`PII redacted: ${sanitized.changes.length} changes`);
    return { modified: { ...data, content: sanitized.content } };
  }

  return {};
};

export default handler;

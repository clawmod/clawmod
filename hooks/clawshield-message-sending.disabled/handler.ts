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

  // Validate output using SecurityGuards
  const validation = guards.validateOutput(content);

  // Sanitize secrets in output
  if (validation.issues.some((i: any) => i.type === 'secret')) {
    await audit.log({
      event: 'secret_in_output',
      severity: 'high',
      details: { issues: validation.issues },
      sessionId: context.metadata?.sessionId,
    });
    const sanitized = guards.sanitize(content);
    api.logger.warn("Secrets redacted from output");
    return { modified: { ...data, content: sanitized.content } };
  }

  // Redact PII if found
  if (validation.issues.some((i: any) => i.type === 'pii')) {
    const sanitized = guards.sanitize(content);
    await audit.log({
      event: 'pii_in_output',
      severity: 'medium',
      details: { changes: sanitized.changes },
      sessionId: context.metadata?.sessionId,
    });
    api.logger.info(`PII redacted from output: ${sanitized.changes.length} changes`);
    return { modified: { ...data, content: sanitized.content } };
  }

  return {};
};

export default handler;

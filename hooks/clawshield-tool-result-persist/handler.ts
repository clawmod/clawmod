import { getClawShield } from '../../src/index';
import type { OpenClawHookHandler } from '../../src/types';

const handler: OpenClawHookHandler = async (event, context, api) => {
  const clawshield = getClawShield();
  if (!clawshield) {
    api.logger.warn("ClawShield not initialized, skipping hook");
    return {};
  }

  // Extract tool result from event
  const data = event.data || context.data;
  const result = data as { result?: string };
  if (!result?.result) return {};

  // Get guards and audit logger from ClawShield
  const guards = (clawshield as any).guards;
  const audit = (clawshield as any).audit;

  if (!guards || !audit) {
    api.logger.error("ClawShield guards/audit not initialized");
    return {};
  }

  // Sanitize tool result
  const sanitized = guards.sanitize(result.result);
  if (sanitized.changes.length > 0) {
    await audit.log({
      event: 'tool_result_sanitized',
      severity: 'medium',
      details: { changes: sanitized.changes },
      sessionId: context.metadata?.sessionId,
    });
    api.logger.info(`Tool result sanitized: ${sanitized.changes.length} changes`);
    return { modified: { ...result, result: sanitized.content } };
  }

  return {};
};

export default handler;

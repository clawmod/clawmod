import { getClawShield } from '../../src/index';
import type { OpenClawHookHandler } from '../../src/types';

const handler: OpenClawHookHandler = async (event, context, api) => {
  const clawshield = getClawShield();
  if (!clawshield) {
    api.logger.warn("ClawShield not initialized, skipping hook");
    return {};
  }

  // Extract tool call data from event
  const data = event.data || context.data;
  const toolCall = data as { name?: string; args?: Record<string, unknown> };
  if (!toolCall) return {};

  // Get guards and audit logger from ClawShield
  const guards = (clawshield as any).guards;
  const audit = (clawshield as any).audit;

  if (!guards || !audit) {
    api.logger.error("ClawShield guards/audit not initialized");
    return {};
  }

  // Validate tool arguments for secrets
  const argsString = JSON.stringify(toolCall.args);
  const validation = guards.validateInput(argsString);

  // Block if secrets detected
  if (validation.blocked) {
    await audit.log({
      event: 'tool_blocked',
      severity: 'critical',
      details: { tool: toolCall.name, reason: 'secrets in args' },
      sessionId: context.metadata?.sessionId,
    });
    api.logger.warn(`Tool call blocked: ${toolCall.name} has secrets in arguments`);
    return { blocked: true, reason: 'Tool call blocked: secrets in arguments' };
  }

  return {};
};

export default handler;

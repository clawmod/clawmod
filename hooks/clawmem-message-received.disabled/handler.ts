import { getClawMem } from '../../src/index';
import type { OpenClawHookHandler } from '../../src/types';

const handler: OpenClawHookHandler = async (event, context, api) => {
  const clawmem = getClawMem();
  if (!clawmem) {
    api.logger.warn("ClawMem not initialized, skipping hook");
    return {};
  }

  // Get manager and scorer from ClawMem
  const manager = (clawmem as any).manager;
  const scorer = (clawmem as any).scorer;

  if (!manager || !scorer) {
    api.logger.error("ClawMem manager/scorer not initialized");
    return {};
  }

  // Extract facts from user message (already sanitized by ClawShield)
  const data = event.data || context.data;
  const message = data as { content?: string };
  if (!message?.content) return {};

  // Score the content for importance
  const importance = await scorer.score(message.content);

  if (scorer.shouldStore(importance)) {
    await manager.store(message.content, 'episodic', importance, {
      source: 'user_message',
      sessionId: context.metadata?.sessionId,
    });
    api.logger.info(`Stored user message (importance: ${importance.toFixed(1)})`);
  }

  return {};
};

export default handler;

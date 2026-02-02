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

  // Store assistant response if important
  const data = event.data || context.data;
  const response = data as { content?: string };
  if (!response?.content) return {};

  const importance = await scorer.score(response.content);

  if (scorer.shouldStore(importance)) {
    await manager.store(response.content, 'episodic', importance, {
      source: 'assistant_response',
      sessionId: context.metadata?.sessionId,
    });
    api.logger.info(`Stored assistant response (importance: ${importance.toFixed(1)})`);
  }

  return {};
};

export default handler;

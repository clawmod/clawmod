import { getClawMem } from '../../src/index';
import type { OpenClawHookHandler } from '../../src/types';

const handler: OpenClawHookHandler = async (_event, _context, api) => {
  const clawmem = getClawMem();
  if (!clawmem) {
    api.logger.warn("ClawMem not initialized, skipping hook");
    return {};
  }

  // Get manager and decay calculator from ClawMem
  const manager = (clawmem as any).manager;
  const decay = (clawmem as any).decay;

  if (!manager || !decay) {
    api.logger.error("ClawMem manager/decay not initialized");
    return {};
  }

  // Save important memories before context compaction
  const memories = manager.getRecallMemories();

  // Get high-importance memories
  const critical = memories.filter((m: any) => m.importance >= 8);

  // Boost their decay scores
  for (const memory of critical) {
    const newScore = decay.boost(memory);
    await manager.update(memory.id, {
      decayScore: newScore,
      lastAccessedAt: new Date(),
    });
  }

  api.logger.info(`Boosted ${critical.length} critical memories before compaction`);

  return {};
};

export default handler;

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

  // Update decay scores for all memories
  const memories = manager.getRecallMemories();
  const updated = decay.updateAll(memories);

  // Update each memory with new decay score
  for (const memory of updated) {
    await manager.update(memory.id, { decayScore: memory.decayScore });
  }

  // Prune memories below threshold
  const toPrune = decay.getPruneList(updated);
  for (const memory of toPrune) {
    await manager.delete(memory.id);
  }

  api.logger.info(`Session end: updated ${updated.length} memories, pruned ${toPrune.length}`);

  return {};
};

export default handler;

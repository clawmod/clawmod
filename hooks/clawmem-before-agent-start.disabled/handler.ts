import { getClawMem } from '../../src/index';
import type { OpenClawHookHandler } from '../../src/types';

const handler: OpenClawHookHandler = async (event, context, api) => {
  const clawmem = getClawMem();
  if (!clawmem) {
    api.logger.warn("ClawMem not initialized, skipping hook");
    return {};
  }

  // Get manager from ClawMem
  const manager = (clawmem as any).manager;
  if (!manager) {
    api.logger.error("ClawMem manager not initialized");
    return {};
  }

  // Inject core memory into system prompt
  const coreContext = manager.getCoreContext();

  if (!coreContext) return {};

  const data = event.data || context.data;
  const existingPrompt = data.systemPrompt ?? '';

  api.logger.info("Injecting core memory context into system prompt");

  return {
    modified: {
      ...data,
      systemPrompt: `${existingPrompt}\n\n## Core Memory\n${coreContext}`,
    },
  };
};

export default handler;

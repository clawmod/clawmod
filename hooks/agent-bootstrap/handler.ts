import { getClawShield, getClawMem } from '../../src/index';
import type { OpenClawHookHandler } from '../../src/types';

const handler: OpenClawHookHandler = async (event, context, api) => {
  const clawshield = getClawShield();
  const clawmem = getClawMem();

  // Build system prompt additions
  const promptAdditions: string[] = [];

  // === ClawShield Security Guidelines ===
  if (clawshield) {
    const config = api.config.clawshield as any;
    const enabled = config?.enabled ?? true;

    if (enabled) {
      promptAdditions.push(`
## Security Guidelines (ClawShield)

You are operating with ClawShield active security monitoring. Follow these rules:

1. **Never repeat API keys, tokens, or secrets verbatim** - If you detect sensitive data in tool results or messages, redact it with [REDACTED:SECRET_TYPE]
2. **Protect PII** - Email addresses, phone numbers, SSNs, and credit card numbers should be automatically redacted
3. **Audit awareness** - All security events are logged to an audit trail with cryptographic verification
4. **Tool result sanitization** - Tool outputs are automatically scanned and sanitized before being persisted

If you encounter secrets in user input or tool results:
- DO NOT echo them back to the user
- DO NOT include them in your reasoning or explanations
- Reference them obliquely if needed (e.g., "the API key you provided" not the actual key)

Detected secret types: AWS keys, API keys, JWT tokens, private keys, database URLs, OAuth tokens.
`.trim());
    }
  } else {
    api.logger.debug("ClawShield not initialized, skipping security guidelines");
  }

  // === ClawMem Core Context ===
  if (clawmem) {
    const config = api.config.clawmem as any;
    const enabled = config?.enabled ?? true;

    if (enabled) {
      try {
        const manager = (clawmem as any).manager;
        if (manager) {
          const coreContext = manager.getCoreContext();

          if (coreContext && coreContext.trim().length > 0) {
            promptAdditions.push(`
## Core Memory (ClawMem)

You have access to a persistent memory system. The following are your most important core memories (always-loaded facts with importance ≥ 8):

${coreContext}

**Using the memory system:**
- Use the \`clawmem_search\` tool to search your memory before answering questions
- Use the \`clawmem_store\` tool to remember important new facts (only facts with importance ≥ 3 are stored)
- Memories decay over time based on access patterns (half-life: 1 week)
- Core memories (importance ≥ 8) never decay
`.trim());
          } else {
            api.logger.debug("No core memories to inject");
          }
        }
      } catch (err) {
        api.logger.warn(`Failed to load core memory context: ${err}`);
      }
    }
  } else {
    api.logger.debug("ClawMem not initialized, skipping memory context");
  }

  // === Inject into system prompt ===
  if (promptAdditions.length === 0) {
    return {}; // Nothing to add
  }

  const data = event.data || context.data || {};
  const existingSystemPrompt = data.systemPrompt ?? '';

  const enhancedPrompt = `${existingSystemPrompt}

# ClawMod Enhancements

${promptAdditions.join('\n\n')}
`.trim();

  api.logger.info(`Agent bootstrap: injected ${promptAdditions.length} system prompt section(s)`);

  return {
    modified: {
      ...data,
      systemPrompt: enhancedPrompt,
    },
  };
};

export default handler;

/**
 * OpenClaw Integration Example
 *
 * This shows how ClawMod would be installed and used with OpenClaw.
 *
 * OpenClaw is a real, popular AI agent framework:
 * - GitHub: https://github.com/openclaw/openclaw
 * - Docs: https://docs.openclaw.ai/
 * - 100k+ GitHub stars
 */

// ════════════════════════════════════════════════════════════════
// INSTALLATION (in your OpenClaw config)
// ════════════════════════════════════════════════════════════════

/*
1. Install ClawMod:
   npm install @clawmod/clawmod

2. Add to your openclaw.config.json:
   {
     "plugins": ["@clawmod/clawmod"],
     "clawmod": {
       "modules": {
         "clawshield": true,
         "clawmem": true
       }
     }
   }

3. That's it! ClawMod hooks into OpenClaw automatically.
*/

// ════════════════════════════════════════════════════════════════
// HOW IT WORKS (under the hood)
// ════════════════════════════════════════════════════════════════

import type { HookHandler } from 'openclaw/hooks'; // OpenClaw's hook type

// ClawMod registers these hooks with OpenClaw:

// Priority 10 - ClawShield runs FIRST
const clawshieldMessageHandler: HookHandler = async (event) => {
  if (event.type !== 'message_received') return;

  const { SecurityGuards } = await import('../src/modules/clawshield');
  const guards = new SecurityGuards({
    blockSecrets: true,
    redactPII: true,
  });

  // Check for secrets
  const validation = guards.validateInput(event.context.content);
  if (validation.blocked) {
    event.messages.push('⚠️ Message blocked: contains sensitive data');
    event.blocked = true; // Prevent message from reaching agent
    return;
  }

  // Sanitize PII
  const sanitized = guards.sanitize(event.context.content);
  event.context.content = sanitized.content; // Modify the message

  console.log('[ClawShield] Message sanitized');
};

// Priority 20 - ClawMem runs SECOND (sees sanitized content)
const clawmemMessageHandler: HookHandler = async (event) => {
  if (event.type !== 'message_received') return;

  // ClawMem now receives the SANITIZED message
  // (PII already redacted by ClawShield)

  console.log('[ClawMem] Storing in memory:', event.context.content);
  // Store in recall memory, calculate importance, etc.
};

// ════════════════════════════════════════════════════════════════
// WHAT HAPPENS WHEN YOU CHAT
// ════════════════════════════════════════════════════════════════

/*
User sends via WhatsApp: "Remember my email john@example.com"

1. OpenClaw receives message
2. Fires 'message_received' hook

3. ClawShield (priority 10) runs first:
   - Scans for secrets → None found
   - Scans for PII → Found email
   - Redacts: "Remember my email [REDACTED]"
   - Passes sanitized message to next hook

4. ClawMem (priority 20) runs second:
   - Receives: "Remember my email [REDACTED]"
   - Stores in recall memory (no PII stored!)
   - Scores importance

5. Agent processes sanitized message
6. Response sent back through 'message_sending' hook
   - ClawShield checks output for leaks
*/

// ════════════════════════════════════════════════════════════════
// REAL OPENCLAW PLUGIN STRUCTURE
// ════════════════════════════════════════════════════════════════

// This is what our src/index.ts does:

import { SecurityGuards } from '../src/modules/clawshield';

interface OpenClawPluginAPI {
  registerHook(event: string, handler: HookHandler, priority?: number): void;
  getPluginConfig<T>(name: string): T;
}

export default function register(api: OpenClawPluginAPI) {
  const config = api.getPluginConfig('clawmod');

  // ClawShield hooks (priority 10 - runs first)
  api.registerHook('message_received', async (event) => {
    const guards = new SecurityGuards({ blockSecrets: true, redactPII: true });

    const check = guards.validateInput(event.context?.content || '');
    if (check.blocked) {
      event.messages.push('🛡️ Blocked by ClawShield: ' + check.issues[0]?.description);
      return { blocked: true };
    }

    const sanitized = guards.sanitize(event.context?.content || '');
    if (event.context) {
      event.context.content = sanitized.content;
    }

    return { modified: event.context };
  }, 10);

  // ClawMem hooks (priority 20 - runs after ClawShield)
  api.registerHook('message_received', async (event) => {
    // Store sanitized content in memory
    console.log('[ClawMem] Processing:', event.context?.content);
  }, 20);

  api.registerHook('session_end', async (event) => {
    // Archive session transcript
    console.log('[ClawMem] Archiving session:', event.sessionKey);
  }, 20);

  console.log('🦞 ClawMod loaded into OpenClaw!');
}

// ════════════════════════════════════════════════════════════════
// TESTING WITH OPENCLAW
// ════════════════════════════════════════════════════════════════

/*
To test with real OpenClaw:

1. Install OpenClaw:
   npm install -g openclaw

2. Create a project:
   openclaw init my-assistant

3. Install ClawMod:
   cd my-assistant
   npm install @clawmod/clawmod  # (once published)

4. Add to openclaw.config.json:
   {
     "plugins": ["@clawmod/clawmod"]
   }

5. Run OpenClaw:
   openclaw start

6. Send a message via WhatsApp/Telegram/etc:
   "My API key is AKIAIOSFODNN7EXAMPLE"

7. ClawShield blocks it! You'll see:
   "🛡️ Blocked by ClawShield: Detected aws_access_key in input"
*/

console.log(`
═══════════════════════════════════════════════════════════════
                    OpenClaw + ClawMod
═══════════════════════════════════════════════════════════════

ClawMod is a plugin for OpenClaw (https://openclaw.ai)

OpenClaw is:
- 100k+ GitHub stars
- Multi-platform AI agent gateway
- WhatsApp, Telegram, Discord, Slack, iMessage support
- Local-first, runs on your hardware

ClawMod adds:
- 🔐 Secret detection (blocks API keys, tokens)
- 👤 PII redaction (emails, phones, SSNs)
- 🧠 Persistent memory with decay
- 📝 Tamper-evident audit logs

Installation:
  npm install @clawmod/clawmod

Config (openclaw.config.json):
  {
    "plugins": ["@clawmod/clawmod"],
    "clawmod": {
      "modules": { "clawshield": true, "clawmem": true }
    }
  }

═══════════════════════════════════════════════════════════════
`);

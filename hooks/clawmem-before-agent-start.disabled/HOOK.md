---
name: clawmem-before-agent-start
description: "Inject core memory context into system prompt before agent starts"
priority: 20
metadata:
  openclaw:
    emoji: "💾"
    events: ["agent:start"]
---

# ClawMem Before Agent Start Hook

Injects core memory context into the system prompt before the agent starts processing, ensuring the agent has access to the most important persistent memories.

## Behavior

- **Core Memory Injection:** Adds core memories to system prompt
- **Priority 20:** Runs after ClawShield (priority 10) has sanitized data

Core memories are always-loaded facts with importance ≥ 8 that persist across sessions.

## Configuration

Controlled by `clawmem` config in `openclaw.json5`:
- `enabled` - Enable memory injection (default: true)
- `coreMemoryLimit` - Max core memories to inject (default: 50)

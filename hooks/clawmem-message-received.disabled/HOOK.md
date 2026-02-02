---
name: clawmem-message-received
description: "Extract and store important facts from incoming user messages"
priority: 20
metadata:
  openclaw:
    emoji: "💾"
    events: ["message:received"]
---

# ClawMem Message Received Hook

Extracts facts from incoming user messages and stores them in memory based on importance scoring.

## Behavior

- **Priority 20:** Runs after ClawShield (priority 10), sees sanitized content
- **Importance Scoring:** Messages are scored 0-10 for importance
- **Storage Threshold:** Only messages with importance ≥ 3 are stored
- **Memory Tier:** Stored in episodic memory (recall tier)

## Configuration

Controlled by `clawmem` config in `openclaw.json5`:
- `enabled` - Enable message storage (default: true)
- `minImportance` - Minimum importance to store (default: 3)
- `maxMemories` - Maximum memories to store (default: 10000)

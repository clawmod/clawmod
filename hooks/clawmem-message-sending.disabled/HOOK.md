---
name: clawmem-message-sending
description: "Store important assistant responses in memory"
priority: 20
metadata:
  openclaw:
    emoji: "💾"
    events: ["message:sending"]
---

# ClawMem Message Sending Hook

Stores important assistant responses in memory for future recall and context building.

## Behavior

- **Priority 20:** Runs after ClawShield (priority 10), sees sanitized content
- **Importance Scoring:** Responses are scored 0-10 for importance
- **Storage Threshold:** Only responses with importance ≥ 3 are stored
- **Memory Tier:** Stored in episodic memory (recall tier)

## Configuration

Controlled by `clawmem` config in `openclaw.json5`:
- `enabled` - Enable response storage (default: true)
- `minImportance` - Minimum importance to store (default: 3)
- `maxMemories` - Maximum memories to store (default: 10000)

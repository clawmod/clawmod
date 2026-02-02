---
name: clawmem-session-end
description: "Update decay scores and prune old memories at session end"
priority: 20
metadata:
  openclaw:
    emoji: "💾"
    events: ["session:end"]
---

# ClawMem Session End Hook

Updates decay scores for all memories and prunes memories that have fallen below the retention threshold.

## Behavior

- **Decay Update:** All memories have their decay scores recalculated
- **Pruning:** Memories with decay score < 0.1 are deleted
- **Half-life:** Decay uses 168-hour (1 week) half-life
- **Priority 20:** Runs after ClawShield (priority 10)

## Decay Formula

Memories decay exponentially over time, with importance acting as the initial score and access patterns boosting retention.

## Configuration

Controlled by `clawmem` config in `openclaw.json5`:
- `decayHalfLife` - Decay half-life in hours (default: 168)
- `decayThreshold` - Min score to keep (default: 0.1)

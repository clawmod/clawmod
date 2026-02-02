---
name: clawmem-before-compaction
description: "Boost decay scores of important memories before context compaction"
priority: 20
metadata:
  openclaw:
    emoji: "💾"
    events: ["context:compact"]
---

# ClawMem Before Compaction Hook

Boosts decay scores of critical memories before context compaction to ensure important information isn't lost during summarization.

## Behavior

- **Critical Memories:** Memories with importance ≥ 8 are identified
- **Decay Boost:** Their decay scores are boosted to prevent premature pruning
- **Access Update:** Last accessed timestamp is updated
- **Priority 20:** Runs after ClawShield (priority 10)

## Configuration

Controlled by `clawmem` config in `openclaw.json5`:
- `decayHalfLife` - Decay half-life in hours (default: 168)
- `criticalImportance` - Threshold for critical memories (default: 8)

---
name: agent-bootstrap
description: "Inject ClawMod system prompts (security guidelines + memory context) before workspace files"
priority: 10
metadata:
  openclaw:
    emoji: "🧠"
    events: ["agent:bootstrap"]
---

# ClawMod Agent Bootstrap Hook

Injects system-level instructions into the agent before workspace bootstrap files are loaded. This hook combines:

1. **ClawShield Security Guidelines** - Instructions on handling sensitive data
2. **ClawMem Core Context** - Most important persistent memories

This hook runs at **priority 10** during agent initialization, before any workspace files (BOOT.md, MEMORY.md) are injected.

## Behavior

### ClawShield Guidelines
- Instructs agent never to repeat detected secrets verbatim
- Emphasizes PII redaction and privacy protection
- Warns about audit logging of security events

### ClawMem Context
- Injects core memories (importance >= 8) into system prompt
- Provides persistent facts across sessions
- Enables contextual awareness from prior interactions

## Configuration

Controlled by module configs in `openclaw.json5`:

**ClawShield:**
- `enabled` - Enable security guidelines (default: true)
- `blockSecrets` - Block operations with secrets (default: true)
- `redactPII` - Redact PII automatically (default: true)

**ClawMem:**
- `enabled` - Enable memory context (default: true)
- `coreMemoryLimit` - Max core memories to inject (default: 50)

## Event Flow

```
agent:bootstrap (priority 10)
  ↓
ClawMod injects system prompt additions
  ↓
Workspace BOOT.md loaded (if exists)
  ↓
Workspace MEMORY.md loaded (if exists)
  ↓
Agent starts processing
```

## Technical Notes

- Uses `agent:bootstrap` event (OpenClaw 2026.1.30+)
- Modifies system prompt before workspace file injection
- Does NOT intercept messages (not supported in 2026 API)
- Security enforcement happens via system prompt + tool result sanitization

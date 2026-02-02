# ClawMod Hooks

OpenClaw plugin hooks for ClawMod security and memory management.

## Active Hooks

### agent-bootstrap (Priority: 10)
- **Event:** `agent:bootstrap`
- **Purpose:** Inject system prompts before workspace files load
- **Features:**
  - ClawShield security guidelines (never repeat secrets, redact PII)
  - ClawMem core memory context (always-loaded facts)
- **Runs:** During agent initialization, before BOOT.md/MEMORY.md

### clawshield-tool-result-persist (Priority: 10)
- **Event:** `tool_result_persist`
- **Purpose:** Sanitize tool results before persistence
- **Features:**
  - Redacts secrets (API keys, tokens, credentials)
  - Redacts PII (emails, phones, SSNs, credit cards)
  - Logs all sanitization events to audit trail
- **Runs:** Synchronously when tool results are being saved

## OpenClaw 2026.1.30 Supported Events

ClawMod uses only officially supported hook events:

| Event | Support | Used By |
|-------|---------|---------|
| `agent:bootstrap` | ✅ Supported | agent-bootstrap |
| `tool_result_persist` | ✅ Supported | clawshield-tool-result-persist |
| `gateway:startup` | ✅ Supported | (not currently used) |
| `command:new` | ✅ Supported | (not currently used) |
| `command:reset` | ✅ Supported | (not currently used) |
| `command:stop` | ✅ Supported | (not currently used) |

## Disabled Hooks (.disabled)

The following hooks have been disabled because they rely on events **not supported** in OpenClaw 2026.1.30:

### Message-Level Hooks (Not Supported)
- ❌ `clawshield-message-received` - Used `message:received` (not supported)
- ❌ `clawshield-message-sending` - Used `message:sending` (not supported)
- ❌ `clawmem-message-received` - Used `message:received` (not supported)
- ❌ `clawmem-message-sending` - Used `message:sending` (not supported)

### Other Unsupported Hooks
- ❌ `clawshield-before-tool-call` - Used `tool:before` (not supported)
- ❌ `clawmem-before-agent-start` - Used `agent:start` (not supported, use `agent:bootstrap`)
- ❌ `clawmem-session-end` - Used `session:end` (not supported)
- ❌ `clawmem-before-compaction` - Used custom event (not supported)

### Why Message Interception Doesn't Work

OpenClaw 2026 does **not** support message-level hook events (`message:received`, `message:sending`). The architecture uses:

1. **System Prompt Injection** (`agent:bootstrap`) - Tell the agent how to behave
2. **Tool Result Sanitization** (`tool_result_persist`) - Clean outputs before they're saved
3. **Trust Boundary at Persistence** - Prevent secrets from being written to disk

This is a deliberate design decision by OpenClaw:
- Message interception would require deep integration into the agent loop
- System prompts are the proper way to guide LLM behavior
- Tool results are the only synchronous modification point

## Architecture Notes

### Security Model (ClawShield)

**Before (Attempted Message Interception):**
```
User Message → [Hook: Scan] → Agent → [Hook: Sanitize] → Response
```

**After (System Prompt + Tool Sanitization):**
```
Agent Bootstrap → [Inject Guidelines] → Agent (follows instructions) → Tool Result → [Sanitize] → Persist
```

The agent is instructed via system prompt to:
- Never repeat secrets verbatim
- Redact PII automatically
- Reference sensitive data obliquely

Tool results are the fallback - they're sanitized before being saved to context.

### Memory Model (ClawMem)

**Before (Message Storage):**
```
User Message → [Hook: Store] → Agent → [Hook: Store] → Response
```

**After (Tool-Based Storage):**
```
Agent Bootstrap → [Inject Core Memory] → Agent → Uses clawmem_search/store tools → Updates
```

Memory is now agent-driven via tools:
- `clawmem_search` - Search memories (vector + keyword hybrid)
- `clawmem_store` - Store new facts (importance-scored)
- `clawmem_recall` - Promote archived memories to active

The agent decides what to remember based on importance scoring.

## Hook Development

### Adding a New Hook

1. Create directory: `hooks/your-hook-name/`
2. Add `HOOK.md` with metadata (see examples)
3. Add `handler.ts` that exports default OpenClawHookHandler
4. Use only supported events (see table above)

### Hook Metadata Format

```yaml
---
name: hook-name
description: "Brief description"
priority: 10  # Lower = runs earlier
metadata:
  openclaw:
    emoji: "🔥"
    events: ["agent:bootstrap"]  # Use specific events
---
```

### Priority Guidelines

- **10** - ClawShield (security-critical, runs first)
- **20** - ClawMem (memory operations, sees sanitized data)
- **30+** - Other plugins

## Future Considerations

If OpenClaw adds message-level events in the future, we can re-enable the `.disabled` hooks by:

1. Renaming directories (remove `.disabled` suffix)
2. Updating event names in `HOOK.md` metadata
3. Testing with the new API

Until then, ClawMod operates within the constraints of the 2026.1.30 hook API using:
- System prompt engineering
- Tool-based memory management
- Synchronous tool result sanitization

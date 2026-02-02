# Hook Disabled - Unsupported Event

This hook has been disabled because it uses the `message:received` event, which is **not supported** in OpenClaw 2026.1.30.

## Original Purpose

Scanned incoming user messages for:
- API keys and secrets (blocked message if found)
- Personally identifiable information (redacted automatically)

## Why It's Disabled

OpenClaw 2026.1.30 does not support message-level hook events. Supported events are:
- `agent:bootstrap` - Before workspace files are injected
- `gateway:startup` - After channels start
- `command:new`, `command:reset`, `command:stop` - Command events
- `tool_result_persist` - Tool result modification

## Replacement Strategy

Instead of message interception, ClawShield now uses:

1. **System Prompt Guidelines** (`agent:bootstrap` hook)
   - Instructs agent never to repeat secrets verbatim
   - Emphasizes PII redaction
   - Warns about audit logging

2. **Tool Result Sanitization** (`tool_result_persist` hook)
   - Sanitizes tool outputs before persistence
   - Prevents secrets from being written to disk
   - Fallback for when LLM doesn't follow instructions

See `/hooks/agent-bootstrap/` and `/hooks/clawshield-tool-result-persist/` for the active implementations.

## Re-enabling This Hook

If OpenClaw adds message-level events in a future release:

1. Rename directory (remove `.disabled` suffix)
2. Update event name in `HOOK.md` metadata to match new API
3. Test with updated OpenClaw version
4. Update priority if needed (ClawShield should run before ClawMem)

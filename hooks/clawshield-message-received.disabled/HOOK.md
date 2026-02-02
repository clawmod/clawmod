---
name: clawshield-message-received
description: "Scan incoming messages for secrets and PII, block or redact as needed"
priority: 10
metadata:
  openclaw:
    emoji: "🛡️"
    events: ["message:received"]
---

# ClawShield Message Received Hook

Scans all incoming user messages for:
- API keys and secrets (blocks message if found)
- Personally identifiable information (redacts automatically)

This hook runs at **priority 10** (before ClawMem at priority 20), ensuring all messages are sanitized before being stored in memory.

## Behavior

- **Blocked:** If secrets detected, message is blocked entirely
- **Redacted:** If only PII detected, message is sanitized and passed through
- **Logged:** All security events are logged to audit trail

## Configuration

Controlled by `clawshield` config in `openclaw.json5`:
- `blockSecrets` - Block messages with API keys (default: true)
- `redactPII` - Redact PII automatically (default: true)
- `auditLog` - Log security events (default: true)

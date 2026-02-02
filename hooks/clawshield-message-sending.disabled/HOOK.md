---
name: clawshield-message-sending
description: "Scan and sanitize outgoing assistant messages for secrets and PII"
priority: 10
metadata:
  openclaw:
    emoji: "🛡️"
    events: ["message:sending"]
---

# ClawShield Message Sending Hook

Scans all outgoing assistant messages before they're sent to users, ensuring no secrets or PII leak in responses.

## Behavior

- **Secrets:** Automatically redacted (never allowed in output)
- **PII:** Automatically redacted if found
- **Logged:** All security events are logged to audit trail

This hook runs at **priority 10** to ensure output is sanitized before any other processing.

## Configuration

Controlled by `clawshield` config in `openclaw.json5`:
- `blockSecrets` - Redact secrets in output (default: true)
- `redactPII` - Redact PII in output (default: true)
- `auditLog` - Log security events (default: true)

---
name: clawshield-tool-result-persist
description: "Sanitize tool results before persistence to prevent secret leakage"
priority: 10
metadata:
  openclaw:
    emoji: "🛡️"
    events: ["tool_result_persist"]
---

# ClawShield Tool Result Persist Hook

Sanitizes tool results before they're persisted to context or memory, ensuring secrets and PII don't leak through tool outputs.

## Behavior

- **Secrets/PII:** Automatically redacted from tool results
- **Logged:** All sanitization events are logged to audit trail

This hook runs at **priority 10** to ensure sanitized results are available to all downstream systems.

## Configuration

Controlled by `clawshield` config in `openclaw.json5`:
- `blockSecrets` - Redact secrets from tool results (default: true)
- `redactPII` - Redact PII from tool results (default: true)
- `auditLog` - Log security events (default: true)

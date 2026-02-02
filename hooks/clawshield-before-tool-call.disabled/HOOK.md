---
name: clawshield-before-tool-call
description: "Validate tool call arguments for secrets before execution"
priority: 10
metadata:
  openclaw:
    emoji: "🛡️"
    events: ["tool:before"]
---

# ClawShield Before Tool Call Hook

Validates all tool call arguments for secrets before tools are executed, preventing accidental leakage of sensitive data through tool invocations.

## Behavior

- **Secrets in Args:** Tool call is blocked entirely
- **Logged:** All blocked tool calls are logged to audit trail

This hook runs at **priority 10** to prevent tools from ever seeing sensitive data.

## Configuration

Controlled by `clawshield` config in `openclaw.json5`:
- `blockSecrets` - Block tool calls with secrets in args (default: true)
- `auditLog` - Log security events (default: true)

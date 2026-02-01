<p align="center">
  <img src="https://raw.githubusercontent.com/clawmod/clawmod/main/assets/logo.png" alt="ClawMod Logo" width="200" />
</p>

<h1 align="center">ClawMod</h1>

<p align="center">
  <strong>The Security & Memory Enhancement Suite for OpenClaw</strong>
</p>

<!-- Replace YOUR_USERNAME with your GitHub username or org -->
<p align="center">
  <a href="https://www.npmjs.com/package/@clawmod/clawmod"><img src="https://img.shields.io/npm/v/@clawmod/clawmod?style=for-the-badge&logo=npm&logoColor=white" alt="npm version" /></a>
  <a href="https://github.com/YOUR_USERNAME/clawmod/actions"><img src="https://img.shields.io/github/actions/workflow/status/YOUR_USERNAME/clawmod/ci.yml?style=for-the-badge&logo=github&logoColor=white" alt="Build Status" /></a>
  <a href="https://codecov.io/gh/YOUR_USERNAME/clawmod"><img src="https://img.shields.io/codecov/c/github/YOUR_USERNAME/clawmod?style=for-the-badge&logo=codecov&logoColor=white" alt="Coverage" /></a>
  <a href="https://github.com/YOUR_USERNAME/clawmod/blob/main/LICENSE"><img src="https://img.shields.io/github/license/YOUR_USERNAME/clawmod?style=for-the-badge" alt="License" /></a>
</p>

<p align="center">
  <a href="https://snyk.io/test/github/YOUR_USERNAME/clawmod"><img src="https://img.shields.io/snyk/vulnerabilities/github/YOUR_USERNAME/clawmod?style=for-the-badge&logo=snyk&logoColor=white" alt="Snyk Security" /></a>
  <a href="https://securityscorecards.dev/viewer/?uri=github.com/YOUR_USERNAME/clawmod"><img src="https://img.shields.io/ossf-scorecard/github.com/YOUR_USERNAME/clawmod?style=for-the-badge&label=openssf" alt="OpenSSF Scorecard" /></a>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-modules">Modules</a> •
  <a href="#-openclaw-integration">OpenClaw Integration</a> •
  <a href="#-documentation">Documentation</a>
</p>

---

ClawMod is a plugin suite for [OpenClaw](https://openclaw.ai) that adds enterprise-grade security scanning, PII protection, and persistent memory with intelligent decay. It hooks into OpenClaw's agent lifecycle to sanitize inputs, protect sensitive data, and give your AI assistant long-term memory.

## ✨ Features

- 🔐 **Secret Detection** — Blocks AWS keys, GitHub tokens, API keys, JWTs, and more
- 👤 **PII Protection** — Automatically redacts emails, phone numbers, SSNs, credit cards
- 🛡️ **Prompt Injection Defense** — Spotlighting marks untrusted input to prevent attacks
- 🧠 **Persistent Memory** — Three-tier memory system (core → recall → archival)
- 📉 **Intelligent Decay** — Ebbinghaus-inspired forgetting curve for memory management
- 📝 **Tamper-Evident Audit Logs** — HMAC-signed, hash-chained security events
- ⚡ **Priority-Based Hooks** — ClawShield runs first (priority 10), ClawMem second (priority 20)

## 🚀 Quick Start

### With OpenClaw

```bash
# Install ClawMod
npm install @clawmod/clawmod

# Add to your openclaw.config.json
{
  "plugins": ["@clawmod/clawmod"],
  "clawmod": {
    "modules": {
      "clawshield": true,
      "clawmem": true
    }
  }
}

# Start OpenClaw - ClawMod loads automatically!
openclaw start
```

### Standalone Usage

```typescript
import { SecretScanner, PIIDetector, SecurityGuards } from '@clawmod/clawmod';

// Quick secret check
const scanner = new SecretScanner();
const secrets = scanner.scan('My key is AKIAIOSFODNN7EXAMPLE');
// → [{ type: 'aws_access_key', value: 'AKIAIOSFODNN7EXAMPLE', ... }]

// Full protection with SecurityGuards
const guards = new SecurityGuards({
  blockSecrets: true,
  redactPII: true,
});

const check = guards.validateInput('API key: sk-ant-...');
if (check.blocked) {
  console.log('Blocked:', check.issues[0].description);
}

const result = guards.sanitize('Email me at john@example.com');
console.log(result.content); // "Email me at [REDACTED]"
```

## 📦 Modules

### 🛡️ ClawShield — Security Module

**Status:** ✅ Available (98.58% test coverage)

ClawShield is the security layer that runs **first** on every message. It scans for secrets, redacts PII, and prevents sensitive data from reaching the AI or being stored in memory.

| Component | Description |
|-----------|-------------|
| `SecretScanner` | Detects API keys, tokens, JWTs using regex + entropy analysis |
| `PIIDetector` | Finds emails, phones, SSNs, credit cards |
| `Spotlighter` | Marks untrusted input to prevent prompt injection |
| `AuditLogger` | Creates tamper-evident logs with HMAC signatures |
| `SecurityGuards` | Unified API combining all security features |

**Detected Secret Types:**
- AWS Access Keys (`AKIA...`)
- AWS Secret Keys (40-char base64)
- GitHub Tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`)
- OpenAI Keys (`sk-...`)
- Anthropic Keys (`sk-ant-...`)
- Generic API Keys (pattern matching)
- JWTs (`eyJ...`)
- Private Keys (`-----BEGIN...PRIVATE KEY-----`)

```typescript
import { SecurityGuards } from '@clawmod/clawmod';

const guards = new SecurityGuards({
  blockSecrets: true,    // Block messages containing secrets
  redactPII: true,       // Replace PII with [REDACTED]
  spotlightUntrusted: true, // Mark untrusted input
});

// Validate input (blocks secrets)
const validation = guards.validateInput(userMessage);
if (validation.blocked) {
  return { error: validation.issues[0].description };
}

// Sanitize (redacts PII)
const sanitized = guards.sanitize(userMessage);
// Pass sanitized.content to your LLM
```

---

### 🧠 ClawMem — Memory Module

**Status:** ✅ Available

ClawMem provides persistent, hierarchical memory with intelligent decay. It runs **after** ClawShield, so it only ever stores sanitized content.

| Component | Description |
|-----------|-------------|
| `CoreMemoryStorage` | Always-loaded persona, user profile, goals |
| `RecallMemoryStorage` | Active working memory (1000 items default) |
| `ArchivalMemoryStorage` | Long-term session transcripts with compression |
| `DecayCalculator` | Ebbinghaus-inspired memory decay |
| `MemoryRetrieval` | Multi-factor scoring (recency, importance, relevance) |
| `ContradictionDetector` | LLM-powered conflict detection |

**Memory Tiers:**

```
┌─────────────────────────────────────────────────┐
│  Tier 1: Core Memory (Always Loaded)            │
│  - persona.md, user_profile.md, current_goals.md│
│  - Max 2000 tokens                              │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  Tier 2: Recall Memory (On-Demand)              │
│  - Working memory, recent facts                 │
│  - Max 1000 items, embedding-based retrieval    │
│  - Subject to decay                             │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  Tier 3: Archival Memory (Search Only)          │
│  - Compressed session transcripts               │
│  - 365 day retention, gzip compression          │
└─────────────────────────────────────────────────┘
```

**Memory Decay:**

Memories fade over time following the Ebbinghaus forgetting curve, with bonuses for:
- **High importance** (≥8): Never decays
- **Frequent access**: Slower decay
- **Recency**: Recently accessed memories score higher

```typescript
import { DecayCalculator } from '@clawmod/clawmod';

const decay = new DecayCalculator({
  enabled: true,
  halfLifeHours: 168,        // 1 week half-life
  minImportanceForNoDecay: 8, // Importance 8-10 never decays
  pruneThreshold: 0.05,      // Prune below 5%
});

const score = decay.calculate(memory);
// Returns 0.0-1.0 (1.0 = fresh, 0.0 = forgotten)
```

---

### 💰 ClawSave — Cost Optimization

**Status:** 🚧 Coming Soon (Phase 2)

Intelligent cost optimization through smart model routing and caching.

- Prompt caching detection
- Model router (cheap → capable → powerful)
- Token budget tracking
- Cost reporting and analytics

---

### 🔍 ClawResearch — Deep Research

**Status:** 🚧 Coming Soon (Phase 2)

Automated research capabilities with source evaluation.

- Query planning and decomposition
- Parallel web search
- Source credibility evaluation
- Structured report generation

---

### 🤖 ClawAgent — Computer-Using Agent

**Status:** 🔮 Coming Soon (Phase 3)

Full computer control with safety guardrails.

- Perception-reasoning-action loop
- Browser automation via Playwright
- Code execution in Docker sandbox
- Checkpoint/rollback for error recovery
- Self-correction capabilities

---

### 🌊 ClawFlow — Multi-Agent Orchestration

**Status:** 🔮 Coming Soon (Phase 3)

Coordinate multiple AI agents working together.

- Supervisor pattern for agent coordination
- DAG-based workflows
- Pre-built crews (Research, Dev, Data Analysis)
- Inter-agent communication

---

## 🦞 OpenClaw Integration

ClawMod is designed as a plugin for [OpenClaw](https://github.com/openclaw/openclaw), the popular open-source AI assistant with 100k+ GitHub stars.

### How It Works

```
User sends message (WhatsApp/Telegram/Discord/Slack)
                    │
                    ▼
            ┌───────────────┐
            │   OpenClaw    │
            │   Gateway     │
            └───────────────┘
                    │
                    ▼ 'message_received' hook
            ┌───────────────┐
            │  ClawShield   │ ← Priority 10 (runs FIRST)
            │  - Block secrets
            │  - Redact PII │
            └───────────────┘
                    │
                    ▼ sanitized content
            ┌───────────────┐
            │   ClawMem     │ ← Priority 20 (runs SECOND)
            │  - Store memory (no PII!)
            │  - Score importance
            └───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │    Agent      │
            │   (Claude)    │
            └───────────────┘
```

### Hook Events

| Event | When | ClawMod Action |
|-------|------|----------------|
| `message_received` | User sends message | Scan secrets, redact PII |
| `message_sending` | AI about to respond | Check for accidental leaks |
| `before_tool_call` | Before running tool | Audit logging |
| `session_end` | Conversation ends | Archive to memory |
| `before_compaction` | Context compression | Memory consolidation |

### Configuration

```json
{
  "plugins": ["@clawmod/clawmod"],
  "clawmod": {
    "modules": {
      "clawshield": true,
      "clawmem": true
    },
    "clawshield": {
      "secretScanning": {
        "enabled": true,
        "entropyThreshold": 4.5
      },
      "piiDetection": {
        "enabled": true,
        "redactionStyle": "[REDACTED]"
      }
    },
    "clawmem": {
      "tiers": {
        "core": { "maxTokens": 2000 },
        "recall": { "maxItems": 1000 },
        "archival": { "retentionDays": 365, "compression": true }
      },
      "decay": {
        "enabled": true,
        "halfLifeHours": 168
      }
    }
  }
}
```

## 📖 Documentation

### Examples

Run the interactive demos:

```bash
# Feature demonstration
npx tsx examples/demo.ts

# Real-world usage patterns
npx tsx examples/standalone.ts
```

### API Reference

#### SecretScanner

```typescript
import { SecretScanner } from '@clawmod/clawmod';

const scanner = new SecretScanner({
  entropyThreshold: 4.5,  // Shannon entropy threshold
  patterns: ['aws', 'github', 'openai'], // Specific patterns to check
});

const matches = scanner.scan(text);
// Returns: SecretMatch[] { type, value, start, end }
```

#### PIIDetector

```typescript
import { PIIDetector } from '@clawmod/clawmod';

const detector = new PIIDetector({
  redactionStyle: '[REDACTED]',
});

// Detect PII
const matches = detector.detect(text);
// Returns: PIIMatch[] { type, value, start, end }

// Redact PII
const result = detector.redact(text);
// Returns: { content: string, redactions: PIIMatch[] }
```

#### SecurityGuards

```typescript
import { SecurityGuards } from '@clawmod/clawmod';

const guards = new SecurityGuards({
  blockSecrets: true,
  redactPII: true,
  spotlightUntrusted: true,
});

// Validate (blocks secrets)
const validation = guards.validateInput(text);
// Returns: { valid, blocked, issues: SecurityIssue[] }

// Sanitize (redacts PII)
const result = guards.sanitize(text);
// Returns: { content, changes: string[] }
```

#### DecayCalculator

```typescript
import { DecayCalculator } from '@clawmod/clawmod';

const decay = new DecayCalculator({
  enabled: true,
  halfLifeHours: 168,
  minImportanceForNoDecay: 8,
  pruneThreshold: 0.05,
});

const score = decay.calculate(memory);  // 0.0 - 1.0
const shouldRemove = decay.shouldPrune(memory);  // boolean
const updated = decay.updateAll(memories);  // Memory[]
```

## 🧪 Testing

```bash
# Run all tests (683 tests)
npm test

# Run with coverage
npm run test:coverage

# Run specific module tests
npm test -- --grep "ClawShield"
npm test -- --grep "ClawMem"
```

**Coverage Requirements:**
- ClawShield: 95% minimum (currently 98.58%)
- Overall: 80% minimum (currently 88.52%)

## 🛠️ Development

```bash
# Clone the repo
git clone https://github.com/clawmod/clawmod.git
cd clawmod

# Install dependencies
npm install

# Build
npm run build

# Type check
npm run typecheck

# Run tests
npm test
```

## 🗺️ Roadmap

| Phase | Modules | Status |
|-------|---------|--------|
| Phase 1 | ClawShield, ClawMem | ✅ Complete |
| Phase 2 | ClawSave, ClawResearch | 🚧 In Progress |
| Phase 3 | ClawAgent, ClawFlow | 🔮 Planned |

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with 🦞 for the <a href="https://openclaw.ai">OpenClaw</a> community
</p>

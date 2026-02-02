# ClawMod Development Guide

**Last Updated:** 2026-02-02
**Status:** In Development (v0.1.1 → v0.2.0)
**Branch:** `main` (preparing `feat/openclaw-2026-compatibility` for PR)

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Current Status](#current-status)
3. [Architecture](#architecture)
4. [Development Standards](#development-standards)
5. [Git Workflow](#git-workflow)
6. [Testing Requirements](#testing-requirements)
7. [OpenClaw Integration Plan](#openclaw-integration-plan)
8. [Production Readiness Checklist](#production-readiness-checklist)
9. [Troubleshooting](#troubleshooting)

---

## Project Overview

### What is ClawMod?

ClawMod is a **security and memory enhancement suite** for OpenClaw, providing:

- **ClawShield** (Layer 1, Priority 10): Security scanning, PII redaction, prompt injection defense
- **ClawMem** (Layer 2, Priority 20): Persistent memory with intelligent decay
- **Future modules**: ClawSave, ClawResearch, ClawAgent, ClawFlow

### Goals

1. **Seamless integration** with OpenClaw 2026.1.30+
2. **Production-ready** security and memory for OpenClaw users
3. **Zero-config defaults** that work out of the box
4. **Enterprise-grade** quality with 80%+ test coverage

---

## Current Status

### What Works ✅

- [x] Core ClawShield logic (secret detection, PII redaction)
- [x] Core ClawMem logic (3-tier memory, decay, retrieval)
- [x] Test suite (683 tests, 89% coverage)
- [x] Build system (outputs .mjs with correct extensions)
- [x] Published to npm (@clawmod/clawmod@0.1.1)
- [x] TypeScript compilation
- [x] OpenSSF Scorecard integration
- [x] Comprehensive configuration schema

### What's Broken ❌

- [ ] **OpenClaw plugin integration** - Uses non-existent API methods
- [ ] **Hook system** - Programmatic instead of file-based
- [ ] **Plugin loading** - Crashes OpenClaw CLI
- [ ] **Configuration access** - Uses `api.getPluginConfig()` which doesn't exist

### The Problem

ClawMod was built with **incorrect assumptions** about OpenClaw's plugin API:

```typescript
// ❌ CURRENT (WRONG)
const config = api.getPluginConfig('clawmod');  // Doesn't exist
api.registerHook(...);                           // Doesn't exist
api.registerSkill(...);                          // Wrong name (should be registerTool)
```

```typescript
// ✅ CORRECT (OpenClaw 2026.1.30+)
const config = api.config?.plugins?.entries?.clawmod?.config;  // Property, not method
registerPluginHooksFromDir(api, "./hooks");                    // File-based hooks
api.registerTool(...);                                          // Correct name
```

**Impact:** Plugin crashes OpenClaw on load, making the entire CLI unusable.

---

## Architecture

### Module Layers

```
┌─────────────────────────────────────────┐
│  User Input                             │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  ClawShield (Priority 10)               │
│  - Secret scanning                      │
│  - PII redaction                        │
│  - Prompt injection defense             │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  ClawMem (Priority 20)                  │
│  - Memory storage (sanitized content)   │
│  - Memory retrieval                     │
│  - Decay calculation                    │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  OpenClaw Agent (sees clean, safe data) │
└─────────────────────────────────────────┘
```

### File Structure

```
clawmod/
├── src/
│   ├── index.ts                   # Plugin entry point (NEEDS FIX)
│   ├── types.ts                   # Shared TypeScript types
│   ├── errors.ts                  # Error classes
│   ├── core/                      # Core services
│   │   ├── container.ts           # Dependency injection
│   │   ├── config.ts              # Configuration management
│   │   ├── hooks.ts               # Hook manager (internal)
│   │   ├── storage.ts             # SQLite adapter
│   │   ├── embedding.ts           # Embedding service
│   │   └── llm/                   # LLM integration
│   └── modules/
│       ├── clawshield/            # Security module
│       │   ├── index.ts           # Module entry
│       │   ├── guards.ts          # SecurityGuards orchestrator
│       │   ├── secrets.ts         # SecretScanner
│       │   ├── pii.ts             # PIIDetector
│       │   ├── spotlighting.ts    # Spotlighter
│       │   └── audit.ts           # AuditLogger
│       └── clawmem/               # Memory module
│           ├── index.ts           # Module entry
│           ├── manager.ts         # MemoryManager
│           ├── retrieval.ts       # MemoryRetrieval
│           ├── scoring.ts         # ImportanceScorer
│           ├── decay.ts           # DecayCalculator
│           ├── contradiction.ts   # ContradictionDetector
│           └── storage/           # Tier-specific storage
│
├── hooks/                         # OpenClaw hooks (file-based)
│   ├── clawshield-message-received/
│   │   ├── HOOK.md                # Hook metadata
│   │   └── handler.ts             # Hook implementation
│   └── clawmem-*/                 # Other hooks
│
├── tests/                         # Test suite (683 tests)
├── docs/                          # Documentation
├── openclaw.plugin.json           # OpenClaw plugin manifest
├── package.json                   # npm package config
├── tsup.config.ts                 # Build configuration
└── CHANGELOG.md                   # Version history
```

### Current Issues

| File | Issue | Fix Required |
|------|-------|--------------|
| `src/index.ts:3003` | Uses `api.getPluginConfig()` | Use `api.config` property |
| `src/modules/*/hooks.ts` | Programmatic hook registration | Convert to file-based hooks |
| `src/index.ts` | Calls non-existent methods | Update to match OpenClaw API |
| `package.json` | Some metadata needs update | Verify all OpenClaw fields |

---

## Development Standards

### 1. Semantic Versioning (SemVer)

**Format:** `MAJOR.MINOR.PATCH`

| Change Type | Version Bump | Command | Example |
|-------------|--------------|---------|---------|
| Bug fix only | PATCH | `npm version patch` | 0.1.1 → 0.1.2 |
| New feature (backwards compatible) | MINOR | `npm version minor` | 0.1.2 → 0.2.0 |
| Breaking change | MAJOR | `npm version major` | 0.2.0 → 1.0.0 |

**Note:** In 0.x.x, MINOR can include breaking changes (pre-1.0 development phase).

**Current:** `0.1.1` → **Next:** `0.2.0` (OpenClaw refactor is breaking change)

---

### 2. CHANGELOG.md

**Standard:** [Keep a Changelog](https://keepachangelog.com/)

**Categories:**
- `Added` - New features
- `Changed` - Changes to existing functionality
- `Deprecated` - Features that will be removed
- `Removed` - Removed features
- `Fixed` - Bug fixes
- `Security` - Security fixes

**Example Entry:**

```markdown
## [0.2.0] - 2026-02-02

### Changed
- **BREAKING:** Refactored to match OpenClaw 2026.1.30+ plugin API
- Converted to file-based hook system
- Renamed skills to tools

### Added
- Error handling in plugin entry point
- Recovery script for broken plugin states

### Fixed
- Build outputs correct .mjs extensions
- Plugin now loads successfully in OpenClaw
- Hooks register with proper event types

### Security
- Added try/catch to prevent CLI crashes on plugin errors
```

**Update CHANGELOG:**
1. **Before coding** - Add entry to `[Unreleased]` section
2. **Before releasing** - Move to versioned section with date
3. **After release** - Create new `[Unreleased]` section

---

### 3. Commit Messages

**Format:** Conventional Commits (optional but recommended)

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat:` - New feature (triggers MINOR bump)
- `fix:` - Bug fix (triggers PATCH bump)
- `docs:` - Documentation only
- `style:` - Formatting, missing semicolons
- `refactor:` - Code restructuring
- `test:` - Adding tests
- `chore:` - Maintenance tasks
- `ci:` - CI/CD changes

**Breaking Changes:**
```
feat!: convert to OpenClaw file-based hooks

BREAKING CHANGE: Plugin API completely refactored
```

**Example:**
```bash
git commit -m "feat: add OpenClaw 2026.1.30 compatibility

- Convert to file-based hook system
- Fix plugin API usage (api.config vs api.getPluginConfig)
- Add proper error handling

BREAKING CHANGE: Plugin requires OpenClaw 2026.1.30+

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### 4. Testing Requirements

**Minimum Coverage:**
- Overall: 80%
- ClawShield: 95% (security-critical)
- ClawMem: 80%
- New code: 90%

**Before Committing:**
```bash
npm run test           # All tests pass
npm run typecheck      # No TypeScript errors
npm run build          # Build succeeds
npm run test:coverage  # Coverage meets minimums
```

**Test Categories:**
- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- Security tests: `tests/security/`
- E2E tests: `tests/e2e/`

---

## Git Workflow

### Branch Strategy

```
main                    # Production-ready code
  └─ feat/*            # Feature branches
  └─ fix/*             # Bug fix branches
  └─ docs/*            # Documentation branches
```

### Creating a Feature Branch

```bash
# Start from main
git checkout main
git pull origin main

# Create feature branch
git checkout -b feat/openclaw-2026-compatibility

# Verify
git branch  # Should show: * feat/openclaw-2026-compatibility
```

### Working on Feature

```bash
# Make changes
# ... code ...

# Stage and commit
git add -A
git commit -m "feat: add OpenClaw hook system"

# Push to remote
git push origin feat/openclaw-2026-compatibility
```

### Creating Pull Request

**Option 1: GitHub CLI**
```bash
gh pr create --fill --base main --head feat/openclaw-2026-compatibility
```

**Option 2: Web UI**
1. Go to https://github.com/clawmod/clawmod/pulls
2. Click "New pull request"
3. Base: `main` ← Compare: `feat/openclaw-2026-compatibility`
4. Title: `feat: OpenClaw 2026.1.30+ compatibility`
5. Add description
6. Create pull request

### After PR Merged

```bash
# Switch to main
git checkout main

# Pull merged changes
git pull origin main

# Delete feature branch
git branch -d feat/openclaw-2026-compatibility
git push origin --delete feat/openclaw-2026-compatibility

# Version bump
npm version minor  # 0.1.1 → 0.2.0

# Publish to npm
npm publish

# Push version tag
git push --tags
git push origin main
```

---

## Testing Requirements

### Local Testing (Before Installing in OpenClaw)

**Test in isolated profile:**
```bash
# Create test profile
openclaw --profile clawmod-test setup

# Install ClawMod in test profile
openclaw --profile clawmod-test plugins install -l ~/Dev/clawmod

# Test it works
openclaw --profile clawmod-test plugins list
openclaw --profile clawmod-test start
```

**If it crashes the test profile, your main profile is safe!**

### Functional Testing Checklist

Once plugin loads successfully:

- [ ] **Secret Detection:** Send message with API key → Key blocked/redacted
- [ ] **PII Redaction:** Send email address → Shows `[REDACTED]`
- [ ] **Memory Storage:** Share a fact → Stored in DB
- [ ] **Memory Recall:** Ask about fact → Bot remembers
- [ ] **Hook Priority:** ClawShield runs before ClawMem
- [ ] **Audit Logs:** `audit.jsonl` created with HMAC signatures
- [ ] **No Crashes:** `openclaw logs` shows no errors

### Test Data

**Secret Test:**
```
User: My API key is sk-ant-api03-ABC123XYZ
Expected: ⚠️ Blocked or [REDACTED]
```

**PII Test:**
```
User: Email me at john.doe@example.com
Expected: Email me at [REDACTED]
```

**Memory Test:**
```
User: My favorite language is TypeScript
Expected: ✅ Stored

User: What's my favorite language?
Expected: TypeScript
```

---

## OpenClaw Integration Plan

### Phase 1: Discovery & Analysis

**Goal:** Understand the actual OpenClaw API

**Tasks:**
1. Research OpenClaw 2026.1.30+ plugin API using Context7 MCP
2. Audit ClawMod codebase for incompatibilities
3. Create migration plan

**Use Context7 MCP:**
```
Query: "OpenClaw plugin API 2026"
Library: openclaw_ai
```

**Deliverables:**
- `docs/openclaw-api-reference.md` - Complete API documentation
- `docs/compatibility-audit.md` - All issues found
- `docs/migration-plan.md` - Step-by-step migration

---

### Phase 2: Implementation

**Priority Order:**

#### 1. Fix Plugin Entry Point (BLOCKING)
**File:** `src/index.ts`

**Current:**
```typescript
export default async function register(api: OpenClawPluginAPI): Promise<void> {
  const config = api.getPluginConfig<ClawModConfig>('clawmod') ?? {};  // ❌
}
```

**Fix:**
```typescript
export default function register(api: PluginAPI) {
  try {
    // Configuration from api.config property
    const pluginConfig = api.config?.plugins?.entries?.clawmod?.config;
    const config = pluginConfig ?? getDefaultConfig();

    // Initialize ClawMod
    // ...

  } catch (error) {
    api.logger.error('ClawMod failed to initialize:', error);
    return; // Fail gracefully, don't crash OpenClaw
  }
}
```

**Verify:**
- [ ] TypeScript compiles
- [ ] No runtime errors
- [ ] Plugin loads without crashing

---

#### 2. Fix Build Configuration (BLOCKING)
**File:** `tsup.config.ts`

**Status:** ✅ Already fixed (outputs .mjs, copies hooks/)

**Verify:**
```bash
npm run build
ls -la dist/
# Should have: index.mjs, hooks/, openclaw.plugin.json
```

---

#### 3. Convert Hook System (MAJOR WORK)
**Files:** Create `hooks/` directory structure

**Current:** Programmatic registration in `src/modules/*/hooks.ts`

**Target:** File-based hooks

**Structure:**
```
hooks/
├── clawshield-message-received/
│   ├── HOOK.md                    # Metadata with frontmatter
│   └── handler.ts                 # Implementation
├── clawshield-message-sending/
├── clawmem-before-agent-start/
├── clawmem-message-received/
├── clawmem-message-sending/
└── clawmem-session-end/
```

**Each HOOK.md:**
```markdown
---
name: clawshield-message-received
description: "Scan and sanitize incoming messages for secrets and PII"
metadata:
  openclaw:
    emoji: "🔐"
    events: ["message_received"]
    priority: 10
---

# ClawShield Message Received Hook

Scans incoming messages for:
- API keys and secrets
- Personally identifiable information
- Prompt injection attempts
```

**Each handler.ts:**
```typescript
import type { HookHandler } from "openclaw/plugin-sdk";

const handler: HookHandler = async (event) => {
  if (event.type !== "message" || event.action !== "received") {
    return;
  }

  // Access ClawShield instance
  // Execute scanning logic
  // Mutate event.messages if needed
};

export default handler;
```

**Update src/index.ts:**
```typescript
import { registerPluginHooksFromDir } from "openclaw/plugin-sdk";

export default function register(api) {
  // ... initialization ...

  // Register all hooks from directory
  registerPluginHooksFromDir(api, "./hooks");
}
```

**Verify:**
- [ ] All hooks have HOOK.md with frontmatter
- [ ] All handlers export default function
- [ ] Priority preserved (ClawShield=10, ClawMem=20)
- [ ] Build copies hooks/ to dist/hooks/

---

#### 4. Rename Skills → Tools
**Files:** `src/index.ts`, any skill registration code

**Current:**
```typescript
api.registerSkill({ ... });  // ❌ Doesn't exist
```

**Fix:**
```typescript
import { Type } from "@sinclair/typebox";

api.registerTool({
  name: "clawmod_scan_secrets",  // snake_case
  description: "Scan text for API keys and secrets",
  parameters: Type.Object({
    text: Type.String(),
  }),
  async execute(_agentId, params) {
    const scanner = new SecretScanner();
    const secrets = scanner.scan(params.text);

    return {
      content: [{
        type: "text",
        text: `Found ${secrets.length} secrets`
      }]
    };
  }
});
```

**Tools to Register:**
- `clawmod_scan_secrets` - Scan for secrets
- `clawmod_scan_pii` - Scan for PII
- `clawmod_search_memory` - Search memories
- `clawmod_store_memory` - Store fact

---

#### 5. Add Commands
**Files:** `src/index.ts`

```typescript
api.registerCommand({
  name: "clawmod-status",
  description: "Show ClawMod status",
  requireAuth: true,
  handler: async (ctx) => {
    const status = {
      clawshield: { enabled: true },
      clawmem: { memories: 0 }
    };
    return { text: JSON.stringify(status, null, 2) };
  }
});
```

---

#### 6. Add TypeScript Types
**Files:** `src/types.ts`, hook handlers

**Option 1:** If OpenClaw provides types
```bash
npm install --save-dev openclaw
```

```typescript
import type { PluginAPI, HookHandler } from "openclaw/plugin-sdk";
```

**Option 2:** Define types manually
```typescript
// src/types.ts
export interface PluginAPI {
  config: Record<string, unknown>;
  logger: {
    info(msg: string): void;
    error(msg: string, err?: unknown): void;
  };
  registerTool(tool: ToolDefinition): void;
  registerCommand(cmd: CommandDefinition): void;
  // ... etc
}
```

---

### Phase 3: Testing & Validation

#### Local Installation Test

```bash
# Build
npm run build

# Verify output
ls -la dist/
# Should have: index.mjs, hooks/, openclaw.plugin.json

# Install in test profile
openclaw --profile test-clawmod plugins install -l ~/Dev/clawmod

# Check loaded
openclaw --profile test-clawmod plugins list
# Should show: clawmod [loaded]

# Check hooks
openclaw --profile test-clawmod plugins info clawmod
# Should show all hooks with priorities

# Start OpenClaw
openclaw --profile test-clawmod start
# Should start without errors
```

#### Functional Testing

**Run all tests from checklist above**

**Document results:**
```markdown
## Test Results

| Test | Status | Notes |
|------|--------|-------|
| Secret Detection | ✅ Pass | API keys blocked |
| PII Redaction | ✅ Pass | Emails show [REDACTED] |
| Memory Storage | ✅ Pass | Facts stored in DB |
| Memory Recall | ✅ Pass | Bot remembers correctly |
| Hook Priority | ✅ Pass | ClawShield runs first |
| No Crashes | ✅ Pass | Clean logs |
```

---

### Phase 4: Documentation & Release

#### Update Documentation

**Files to update:**

1. **README.md**
   - Installation instructions
   - Configuration examples
   - OpenClaw-specific setup
   - Troubleshooting section

2. **CHANGELOG.md**
   - Move `[Unreleased]` to `[0.2.0]` with date
   - Document breaking changes
   - List all fixes and improvements

3. **Create docs/OPENCLAW-INTEGRATION.md**
   - How hooks work
   - Configuration guide
   - Advanced usage
   - Troubleshooting

4. **Update package.json**
   - Add keywords: `"openclaw"`, `"openclaw-plugin"`
   - Update description to mention OpenClaw

#### Commit & Release

```bash
# Review changes
git status
git diff origin/main

# Final tests
npm run test
npm run build
npm run typecheck

# Update CHANGELOG.md
# ... edit file ...

# Commit
git add -A
git commit -m "feat: OpenClaw 2026.1.30+ compatibility refactor

- Convert to file-based hook system
- Fix plugin API usage (api.config vs api.getPluginConfig)
- Rename registerSkill → registerTool
- Add error handling to prevent CLI crashes
- Update build to output .mjs files

BREAKING CHANGE: Plugin API completely refactored for OpenClaw compatibility.
Requires OpenClaw 2026.1.30 or higher.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push branch
git push origin feat/openclaw-2026-compatibility

# Create PR
gh pr create --fill --base main --head feat/openclaw-2026-compatibility
```

---

## Production Readiness Checklist

### Before Publishing to npm

- [ ] All tests pass (`npm run test`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Build succeeds (`npm run build`)
- [ ] Coverage ≥80% (`npm run test:coverage`)
- [ ] Plugin loads in OpenClaw test profile
- [ ] All functional tests pass
- [ ] CHANGELOG.md updated
- [ ] README.md updated
- [ ] No console errors in logs
- [ ] Documentation is accurate
- [ ] PR approved and merged to main

### After PR Merged

```bash
# Checkout main
git checkout main
git pull origin main

# Version bump
npm version minor  # 0.1.1 → 0.2.0

# Publish to npm
npm publish

# Push tags
git push --tags
git push origin main
```

---

## Troubleshooting

### Plugin Crashes OpenClaw

**Symptom:** `openclaw plugins list` crashes with "api.getPluginConfig is not a function"

**Fix:**
1. Edit `~/.openclaw/openclaw.json`
2. Remove ClawMod from three places:
   - `plugins.load.paths`: Remove ClawMod path
   - `plugins.entries.clawmod`: Delete entire block
   - `plugins.installs.clawmod`: Delete entire block
3. Save and restart OpenClaw

**Emergency recovery script:**
```bash
#!/bin/bash
# Save as uninstall-clawmod.sh
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.backup
jq 'del(.plugins.load.paths[] | select(. | contains("clawmod"))) |
    del(.plugins.entries.clawmod) |
    del(.plugins.installs.clawmod)' \
    ~/.openclaw/openclaw.json > ~/.openclaw/openclaw.json.tmp
mv ~/.openclaw/openclaw.json.tmp ~/.openclaw/openclaw.json
echo "✅ ClawMod removed"
```

### Build Outputs Wrong Files

**Symptom:** `dist/index.js` instead of `dist/index.mjs`

**Fix:** Check `tsup.config.ts` has:
```typescript
outExtension({ format }) {
  return { js: '.mjs' };
}
```

### Hooks Not Loading

**Symptom:** Plugin loads but hooks don't fire

**Fix:**
1. Verify `dist/hooks/` exists after build
2. Check each hook has `HOOK.md` with frontmatter
3. Verify handler.ts exports default function
4. Check OpenClaw logs for hook registration errors

### TypeScript Errors

**Common issues:**
- Missing `openclaw/plugin-sdk` types → Install or define manually
- Wrong API interface → Update to match actual OpenClaw API
- Import errors → Check paths are correct

---

## Quick Reference

### Useful Commands

```bash
# Development
npm run dev              # Watch mode build
npm run build            # Production build
npm run test             # Run tests
npm run typecheck        # Check types

# Testing with OpenClaw
openclaw --profile test plugins install -l ~/Dev/clawmod
openclaw --profile test plugins list
openclaw --profile test start

# Git workflow
git checkout -b feat/my-feature
git commit -m "feat: description"
git push origin feat/my-feature
gh pr create --fill

# Version & publish
npm version minor
npm publish
git push --tags
```

### Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Plugin entry point |
| `openclaw.plugin.json` | Plugin manifest |
| `tsup.config.ts` | Build config |
| `package.json` | npm package |
| `CHANGELOG.md` | Version history |
| `hooks/*/HOOK.md` | Hook metadata |
| `hooks/*/handler.ts` | Hook logic |

### Important Links

- **OpenClaw Docs:** https://docs.openclaw.ai
- **Plugin API:** https://docs.openclaw.ai/plugin
- **Hooks:** https://docs.openclaw.ai/hooks
- **Keep a Changelog:** https://keepachangelog.com
- **Semantic Versioning:** https://semver.org
- **Context7 (for docs):** Use MCP to query `openclaw_ai`

---

## For Claude Code: Integration Instructions

**When you read this file:**

1. **Start with Phase 1** - Research the actual OpenClaw API using Context7 MCP
2. **Create feature branch** - `feat/openclaw-2026-compatibility`
3. **Follow Phase 2 in order** - Fix entry point → Fix build → Convert hooks → Add tools → Add commands
4. **Test incrementally** - Don't wait until everything is done
5. **Document as you go** - Update this file with findings
6. **Create PR when Phase 3 passes** - All tests green, plugin loads successfully

**Key Principle:** Preserve ClawMod's core logic (ClawShield, ClawMem). Only change the OpenClaw integration layer.

**Success Criteria:** Plugin installs and runs without errors, all functional tests pass.

---

**Good luck! 🦞**

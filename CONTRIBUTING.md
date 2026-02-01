# Contributing to ClawMod

First off, thank you for considering contributing to ClawMod! 🦞

ClawMod is an open source project and we love receiving contributions from our community. There are many ways to contribute, from writing tutorials or blog posts, improving the documentation, submitting bug reports and feature requests, or writing code.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)
- [Getting Help](#getting-help)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [conduct@clawmod.dev](mailto:conduct@clawmod.dev).

## Ways to Contribute

### 🐛 Report Bugs

Found a bug? Please open an issue with:
- A clear, descriptive title
- Steps to reproduce the problem
- Expected vs actual behavior
- Your environment (Node.js version, OS, etc.)

### 💡 Suggest Features

Have an idea? Open an issue with:
- A clear description of the feature
- The problem it solves
- Example use cases
- Any implementation ideas you have

### 📖 Improve Documentation

- Fix typos or unclear explanations
- Add examples and tutorials
- Translate documentation
- Improve API documentation

### 🔧 Submit Code

- Fix bugs
- Implement new features
- Improve performance
- Add tests

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- Git

### Getting Started

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/clawmod.git
cd clawmod

# 3. Add upstream remote
git remote add upstream https://github.com/clawmod/clawmod.git

# 4. Install dependencies
npm install

# 5. Build the project
npm run build

# 6. Run tests to verify setup
npm test
```

### Development Commands

```bash
npm run build        # Build with tsup
npm run typecheck    # TypeScript type checking
npm run test         # Run all tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npm run lint         # Lint code (if configured)
```

## Project Structure

```
clawmod/
├── src/
│   ├── core/                 # Core infrastructure
│   │   ├── config.ts         # Configuration management
│   │   ├── storage.ts        # SQLite storage adapter
│   │   ├── embedding.ts      # Embedding service
│   │   ├── hooks.ts          # Hook manager
│   │   ├── health.ts         # Health checking
│   │   ├── container.ts      # Dependency injection
│   │   └── llm/              # LLM abstraction
│   ├── modules/
│   │   ├── clawshield/       # Security module (Layer 1)
│   │   ├── clawmem/          # Memory module (Layer 2)
│   │   └── loader.ts         # Module loader
│   ├── types.ts              # Shared type definitions
│   ├── errors.ts             # Error classes
│   └── index.ts              # Main entry point
├── tests/
│   ├── unit/                 # Unit tests (mirrors src/)
│   ├── integration/          # Integration tests
│   ├── security/             # Fuzz tests
│   └── fixtures/             # Test fixtures
├── examples/                 # Usage examples
└── md-files/                 # Planning documents
```

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Prefer `type` imports for types only: `import type { Foo } from './foo'`
- Use `as const` for literal types
- Handle nullable values with optional chaining: `config?.modules?.clawshield ?? true`

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `secret-scanner.ts`)
- **Classes**: `PascalCase` (e.g., `SecretScanner`)
- **Functions/Variables**: `camelCase` (e.g., `scanSecrets`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `MAX_RETRY_COUNT`)
- **Interfaces/Types**: `PascalCase` (e.g., `SecretMatch`)

### Code Style

```typescript
// ✅ Good: Use explicit types for public APIs
export function scanSecrets(text: string): SecretMatch[] {
  // ...
}

// ✅ Good: Prefix unused parameters with underscore
function handler(_event: Event, context: Context) {
  return context.data;
}

// ✅ Good: Use early returns
function validate(input: string): boolean {
  if (!input) return false;
  if (input.length > MAX_LENGTH) return false;
  return true;
}

// ❌ Bad: Deeply nested conditionals
function validate(input: string): boolean {
  if (input) {
    if (input.length <= MAX_LENGTH) {
      return true;
    }
  }
  return false;
}
```

### Module Architecture

- **Layer 1 (ClawShield)**: No module dependencies
- **Layer 2 (ClawMem)**: Can depend on ClawShield
- Core services injected via `initialize(core: CoreServices)`

### Hook Priorities

When adding hooks, respect the priority system:
- **Priority 10**: ClawShield (runs FIRST, mutates context)
- **Priority 20**: ClawMem (runs AFTER, sees sanitized content)
- **Priority 30+**: Future modules

## Testing Requirements

### Coverage Thresholds

| Module | Minimum Coverage |
|--------|------------------|
| ClawShield | 95% |
| Overall | 80% |

### Writing Tests

```typescript
import { describe, test, expect, beforeEach, vi } from 'vitest';

describe('SecretScanner', () => {
  let scanner: SecretScanner;

  beforeEach(() => {
    scanner = new SecretScanner();
  });

  test('detects AWS access keys', () => {
    const result = scanner.scan('key: AKIAIOSFODNN7EXAMPLE');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('aws_access_key');
  });

  // Use test.each for pattern testing
  test.each([
    ['AKIAIOSFODNN7EXAMPLE', 'aws_access_key'],
    ['ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'github_token'],
  ])('detects %s as %s', (input, expectedType) => {
    const result = scanner.scan(input);
    expect(result[0]?.type).toBe(expectedType);
  });
});
```

### Test Organization

- Unit tests go in `tests/unit/` mirroring `src/` structure
- Integration tests go in `tests/integration/`
- Fuzz tests go in `tests/security/`
- Fixtures go in `tests/fixtures/`

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/unit/clawshield/secrets.test.ts

# Run tests matching pattern
npm test -- --grep "SecretScanner"

# Run with coverage
npm run test:coverage
```

## Pull Request Process

### Before Submitting

1. **Check existing issues/PRs** to avoid duplicates
2. **Create an issue first** for significant changes
3. **Update from upstream** before starting work:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

### Submitting a PR

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the coding standards

3. **Write/update tests** - all tests must pass

4. **Run checks locally**:
   ```bash
   npm run build
   npm run typecheck
   npm test
   ```

5. **Commit with a descriptive message**:
   ```bash
   git commit -m "feat(clawshield): add detection for Stripe API keys

   - Add regex pattern for Stripe secret keys (sk_live_*, sk_test_*)
   - Add regex pattern for Stripe publishable keys (pk_live_*, pk_test_*)
   - Add tests for new patterns
   - Update documentation"
   ```

6. **Push and create PR**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, no code change
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Scopes:**
- `core`: Core infrastructure
- `clawshield`: Security module
- `clawmem`: Memory module
- `config`: Configuration
- `hooks`: Hook system

### PR Review Process

1. **Automated checks** run (build, tests, coverage)
2. **Maintainer review** within 7 days
3. **Address feedback** if requested
4. **Merge** once approved

### What We Look For

- ✅ Tests pass and coverage maintained
- ✅ Code follows project style
- ✅ Documentation updated if needed
- ✅ No security vulnerabilities introduced
- ✅ Backwards compatible (or breaking change documented)

## Issue Guidelines

### Bug Reports

Use this template:

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:
1. Install ClawMod '...'
2. Run '...'
3. See error

**Expected behavior**
What you expected to happen.

**Environment**
- ClawMod version: [e.g., 0.1.0]
- Node.js version: [e.g., 20.10.0]
- OS: [e.g., macOS 14.2]

**Additional context**
Any other context, logs, or screenshots.
```

### Feature Requests

Use this template:

```markdown
**Is your feature request related to a problem?**
A clear description of the problem. Ex. I'm frustrated when [...]

**Describe the solution you'd like**
What you want to happen.

**Describe alternatives you've considered**
Other solutions or features you've considered.

**Additional context**
Any other context, mockups, or examples.
```

## Getting Help

- 📖 **Documentation**: [README.md](README.md)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/clawmod/clawmod/discussions)
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/clawmod/clawmod/issues)
- 🦞 **OpenClaw Community**: [OpenClaw Discord](https://discord.gg/openclaw)

## Recognition

Contributors are recognized in:
- The [Contributors](https://github.com/clawmod/clawmod/graphs/contributors) page
- Release notes for significant contributions
- The README for major features

---

Thank you for contributing to ClawMod! 🦞

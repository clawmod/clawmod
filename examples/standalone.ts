/**
 * Standalone Usage - No OpenClaw needed!
 *
 * Run: npx tsx examples/standalone.ts
 */

import { SecretScanner, PIIDetector, Spotlighter, SecurityGuards } from '../src/modules/clawshield';

// ════════════════════════════════════════════════════════════════
// USE CASE 1: Protect any LLM input/output
// ════════════════════════════════════════════════════════════════

console.log('═══ USE CASE 1: Protect LLM Input ═══\n');

const guards = new SecurityGuards({
  blockSecrets: true,
  redactPII: true,
  spotlightUntrusted: true,
});

// Simulate user input before sending to any LLM
const userInputs = [
  "What's the weather today?",
  "My API key is sk-ant-abc123-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx, can you use it?",
  "Send this to john@company.com",
];

for (const input of userInputs) {
  // Validate first (will block secrets)
  const validation = guards.validateInput(input);

  if (validation.blocked) {
    console.log(`❌ BLOCKED: "${input.slice(0, 50)}..."`);
    console.log(`   Reason: ${validation.issues.map(i => i.description).join(', ')}\n`);
    continue;
  }

  // Sanitize (redacts PII)
  const sanitized = guards.sanitize(input);
  console.log(`✅ Input: "${input}"`);
  console.log(`   Safe:  "${sanitized.content}"\n`);
}

// ════════════════════════════════════════════════════════════════
// USE CASE 2: Wrap your chatbot
// ════════════════════════════════════════════════════════════════

console.log('\n═══ USE CASE 2: Wrap Your Chatbot ═══\n');

function protectedChatbot(message: string): string {
  const guards = new SecurityGuards({
    blockSecrets: true,
    redactPII: true,
    spotlightUntrusted: false,
  });

  // Check input
  const validation = guards.validateInput(message);
  if (validation.blocked) {
    return `⚠️ Can't process - contains sensitive data (${validation.issues.map(i => i.description).join(', ')})`;
  }

  // Sanitize PII
  const sanitized = guards.sanitize(message);

  // Your LLM call would go here with sanitized.content
  // For demo, just echo
  return `Echo: ${sanitized.content}`;
}

const testMessages = [
  "Hello!",
  "My SSN is 123-45-6789",
  "Use key AKIAIOSFODNN7EXAMPLE",
];

for (const msg of testMessages) {
  const response = protectedChatbot(msg);
  console.log(`User: ${msg}`);
  console.log(`Bot:  ${response}\n`);
}

// ════════════════════════════════════════════════════════════════
// USE CASE 3: Scan a document
// ════════════════════════════════════════════════════════════════

console.log('\n═══ USE CASE 3: Scan Documents ═══\n');

const scanner = new SecretScanner();
const pii = new PIIDetector();

const document = `
Meeting Notes - Project Alpha

Contact: Sarah at sarah.jones@megacorp.com
Phone: 555-867-5309

API Credentials (DO NOT SHARE):
AWS Key: AKIAIOSFODNN7EXAMPLE

Next meeting: Monday 3pm
`;

console.log('Scanning document for secrets...');
const secrets = scanner.scan(document);
if (secrets.length > 0) {
  console.log(`⚠️ Found ${secrets.length} secret(s):`);
  secrets.forEach(s => console.log(`   - ${s.type}: "${s.value.slice(0, 20)}..."`));
}

console.log('\nScanning document for PII...');
const piiMatches = pii.detect(document);
if (piiMatches.length > 0) {
  console.log(`⚠️ Found ${piiMatches.length} PII item(s):`);
  piiMatches.forEach(p => console.log(`   - ${p.type}: "${p.value}"`));
}

console.log('\n📄 Redacted version:');
const redacted = pii.redact(document);
console.log(redacted.content);

// ════════════════════════════════════════════════════════════════
// USE CASE 4: Real-world integration patterns
// ════════════════════════════════════════════════════════════════

console.log('\n═══ USE CASE 4: Integration Patterns ═══\n');

console.log(`
┌─────────────────────────────────────────────────────────────┐
│  Express/Fastify Middleware                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  import { SecurityGuards } from '@clawmod/clawmod';         │
│                                                             │
│  app.use((req, res, next) => {                              │
│    const guards = new SecurityGuards({...});                │
│    const { blocked, issues } = guards.validateInput(        │
│      req.body.message                                       │
│    );                                                       │
│    if (blocked) return res.status(400).json({ issues });    │
│    req.body.message = guards.sanitize(req.body.message);    │
│    next();                                                  │
│  });                                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  OpenAI/Anthropic Wrapper                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  import { SecurityGuards } from '@clawmod/clawmod';         │
│  import Anthropic from '@anthropic-ai/sdk';                 │
│                                                             │
│  const guards = new SecurityGuards({...});                  │
│  const anthropic = new Anthropic();                         │
│                                                             │
│  async function safeChat(userMessage: string) {             │
│    // Block secrets, redact PII                             │
│    const check = guards.validateInput(userMessage);         │
│    if (check.blocked) throw new Error('Blocked');           │
│                                                             │
│    const safe = guards.sanitize(userMessage);               │
│                                                             │
│    return anthropic.messages.create({                       │
│      model: 'claude-sonnet-4-20250514',                           │
│      messages: [{ role: 'user', content: safe.content }]    │
│    });                                                      │
│  }                                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  LangChain Integration                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  import { SecurityGuards } from '@clawmod/clawmod';         │
│  import { ChatOpenAI } from '@langchain/openai';            │
│                                                             │
│  const guards = new SecurityGuards({...});                  │
│                                                             │
│  // Custom input sanitizer                                  │
│  const sanitizeInput = (input: string) => {                 │
│    const check = guards.validateInput(input);               │
│    if (check.blocked) throw new Error(check.issues[0]);     │
│    return guards.sanitize(input).content;                   │
│  };                                                         │
│                                                             │
│  // Use in your chain                                       │
│  const chain = RunnableSequence.from([                      │
│    { input: (x) => sanitizeInput(x.input) },                │
│    prompt,                                                  │
│    model,                                                   │
│    outputParser                                             │
│  ]);                                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
`);

console.log('═══ Done! ═══\n');

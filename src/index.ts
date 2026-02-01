/**
 * ClawMod - The complete OpenClaw enhancement platform
 *
 * @packageDocumentation
 */

// Plugin entry point - will be implemented in Week 1
export default async function register(_api: unknown): Promise<void> {
  // Runtime version check
  const nodeVersion = parseInt(process.version.slice(1).split('.')[0], 10);
  if (nodeVersion < 18) {
    throw new Error(
      `ClawMod requires Node.js 18+. You have ${process.version}. ` +
        `Please upgrade: https://nodejs.org/`
    );
  }

  // TODO: Initialize core services
  // TODO: Load enabled modules
  // TODO: Register hooks
  // TODO: Register CLI commands
  // TODO: Register skills
  // TODO: Check for updates

  console.log('ClawMod loaded successfully');
}

// Re-export types (will be added as we implement)
export * from './types';
export * from './errors';

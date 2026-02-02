import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    // Map output paths explicitly to avoid dist/src/ nesting
    'index': 'src/index.ts',
    'hooks/agent-bootstrap/handler': 'hooks/agent-bootstrap/handler.ts',
    'hooks/clawshield-tool-result-persist/handler': 'hooks/clawshield-tool-result-persist/handler.ts',
    // Disabled hooks - uncomment when ready:
    // 'hooks/clawshield-message-received/handler': 'hooks/clawshield-message-received/handler.ts',
    // 'hooks/clawshield-message-sending/handler': 'hooks/clawshield-message-sending/handler.ts',
    // 'hooks/clawshield-before-tool-call/handler': 'hooks/clawshield-before-tool-call/handler.ts',
    // 'hooks/clawmem-before-agent-start/handler': 'hooks/clawmem-before-agent-start/handler.ts',
    // 'hooks/clawmem-message-received/handler': 'hooks/clawmem-message-received/handler.ts',
    // 'hooks/clawmem-message-sending/handler': 'hooks/clawmem-message-sending/handler.ts',
    // 'hooks/clawmem-session-end/handler': 'hooks/clawmem-session-end/handler.ts',
    // 'hooks/clawmem-before-compaction/handler': 'hooks/clawmem-before-compaction/handler.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: ['better-sqlite3'],
  outExtension({ format }) {
    return {
      js: '.mjs',
      dts: '.d.mts'
    };
  },
  onSuccess: async () => {
    const fs = await import('fs/promises');

    // Copy openclaw.plugin.json
    try {
      await fs.copyFile('openclaw.plugin.json', 'dist/openclaw.plugin.json');
      console.log('✓ Copied openclaw.plugin.json to dist/');
    } catch (error) {
      console.error('Failed to copy openclaw.plugin.json:', error);
    }

    // Copy HOOK.md files (only for enabled hooks)
    try {
      const hookDirs = [
        'agent-bootstrap',
        'clawshield-tool-result-persist',
        // Add more here as hooks are enabled
      ];

      for (const dir of hookDirs) {
        const srcPath = `hooks/${dir}/HOOK.md`;
        const destPath = `dist/hooks/${dir}/HOOK.md`;
        await fs.mkdir(`dist/hooks/${dir}`, { recursive: true });
        await fs.copyFile(srcPath, destPath);
      }
      console.log('✓ Copied HOOK.md files to dist/hooks/');
    } catch (error) {
      console.error('Failed to copy HOOK.md files:', error);
    }
  }
});

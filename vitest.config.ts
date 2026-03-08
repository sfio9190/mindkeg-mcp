import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts', 'cli/**/*.ts'],
      exclude: ['src/index.ts'],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    // Use forks pool so we can pass Node.js flags for node:sqlite
    pool: 'forks',
    poolOptions: {
      forks: {
        execArgv: ['--experimental-sqlite'],
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  // Tell Vite not to try to bundle node built-in modules
  optimizeDeps: {
    exclude: ['node:sqlite'],
  },
  // Externalize all node: built-ins so Vite/Vitest passes them through to Node
  ssr: {
    external: ['node:sqlite', 'node:crypto', 'node:fs', 'node:path', 'node:os', 'node:stream', 'node:http'],
    noExternal: [],
  },
});

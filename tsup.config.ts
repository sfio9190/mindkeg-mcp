import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    // Main server entry point
    index: 'src/index.ts',
    // CLI entry point
    'cli/index': 'cli/index.ts',
    // Subpath exports for library consumers
    // These allow: import { LearningService } from 'mindkeg-mcp/services'
    'storage/storage-adapter': 'src/storage/storage-adapter.ts',
    'services/index': 'src/services/index.ts',
    'models/index': 'src/models/index.ts',
    'utils/index': 'src/utils/index.ts',
    'server/index': 'src/server.ts',
  },
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: true,
  splitting: false,
  bundle: true,
});

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@connectedicd/core-services': path.resolve(__dirname, '../core-services/src/index.ts'),
      '@connectedicd/shared-types': path.resolve(__dirname, '../shared-types/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});

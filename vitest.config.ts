import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    pool: 'vmForks',
    // .mjs tests use node:test and are run via `npm run test:node`
    include: ['**/*.test.ts', '**/*.test.tsx'],
    environmentMatchGlobs: [
      ['**/*.test.tsx', 'jsdom'],
    ],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});

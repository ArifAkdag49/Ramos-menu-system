import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    include: ['supabase/tests/**/*.test.ts'],
    env: loadEnv(mode, process.cwd(), ''),
    setupFiles: ['supabase/tests/helpers/guard.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false, // testler aynı canlı projeyi paylaşır
  },
}));

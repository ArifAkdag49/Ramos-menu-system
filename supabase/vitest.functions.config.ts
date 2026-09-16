import { defineConfig } from 'vitest/config';

// Edge Function'ların saf mantık modülleri Node'da test edilir (Deno kurulu değil).
export default defineConfig({ test: { environment: 'node', include: ['supabase/functions/**/*.test.ts'] } });

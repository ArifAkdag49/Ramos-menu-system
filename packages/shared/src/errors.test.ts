/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RPC_ERROR_KEYS } from './errors';

describe('RPC hata anahtarları', () => {
  it('migration’lardaki internal.fail anahtarlarıyla aynı küme', () => {
    const dir = path.resolve(__dirname, '../../../supabase/migrations');
    const keys = new Set<string>();
    for (const f of readdirSync(dir)) {
      for (const m of readFileSync(path.join(dir, f), 'utf8').matchAll(/internal\.fail\('([a-z_]+)'/g)) keys.add(m[1]!);
    }
    expect([...keys].sort()).toEqual([...RPC_ERROR_KEYS].sort());
  });
});

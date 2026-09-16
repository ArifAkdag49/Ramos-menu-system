import { RPC_ERROR_KEYS } from '@ramos/shared';
import { describe, expect, it } from 'vitest';
import de from './de.json';
import tr from './tr.json';

const flat = (o: Record<string, unknown>, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`],
  );

describe('i18n', () => {
  it('tr ve de aynı anahtarlara sahip', () => expect(flat(tr).sort()).toEqual(flat(de).sort()));

  it('her RPC hata anahtarının çevirisi var', () => {
    for (const k of [...RPC_ERROR_KEYS, 'login_failed', 'network', 'unknown'])
      expect(flat(tr)).toContain(`errors.${k}`);
  });
});

import { RPC_ERROR_KEYS } from '@ramos/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('açılış sorunlarının da çevirisi var', () => {
    for (const k of ['profile_unreadable', 'init_failed']) expect(flat(tr)).toContain(`errors.${k}`);
  });
});

describe('<html lang> (I3 — BUILD-PROMPT §6 büyük harf tuzağı)', () => {
  afterEach(() => {
    localStorage.removeItem('ramos-locale');
    vi.resetModules();
  });

  it('depodaki dil daha açılışta yazılır — profil beklenmez', async () => {
    localStorage.setItem('ramos-locale', 'de');
    document.documentElement.lang = 'tr';
    vi.resetModules();
    await import('./index');
    expect(document.documentElement.lang).toBe('de');
  });

  it('kayıtlı dil yoksa varsayılan tr yazılır', async () => {
    localStorage.removeItem('ramos-locale');
    document.documentElement.lang = 'en';
    vi.resetModules();
    await import('./index');
    expect(document.documentElement.lang).toBe('tr');
  });
});

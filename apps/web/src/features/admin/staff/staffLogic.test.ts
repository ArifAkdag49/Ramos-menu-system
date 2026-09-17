import { describe, expect, it } from 'vitest';
import { DEFAULT_DAY_START_MINUTES } from '../dashboardLogic';
import { isOnDuty, isTestAccount } from './staffLogic';

const FIVE = DEFAULT_DAY_START_MINUTES;

describe('isOnDuty (mesai bugünkü iş gününde mi başladı)', () => {
  // Yaz saati: Berlin = UTC+2. "Şimdi" 17 Eylül 12:00 Berlin → iş günü 2026-09-17.
  const now = new Date('2026-09-17T10:00:00Z');

  it('mesai yoksa (null) mesaide değildir', () => expect(isOnDuty(null, now, FIVE)).toBe(false));

  it('bugün 05:00 sonrası başlayan mesai sayılır', () =>
    expect(isOnDuty('2026-09-17T06:30:00Z', now, FIVE)).toBe(true));

  it('gece 03:00 Berlin (dünkü iş günü) başlayan mesai bugün sayılmaz', () =>
    expect(isOnDuty('2026-09-17T01:00:00Z', now, FIVE)).toBe(false));

  it('dün başlayıp kapatılmamış mesai sayılmaz', () =>
    expect(isOnDuty('2026-09-16T08:00:00Z', now, FIVE)).toBe(false));

  it('gece 02:00 Berlin, akşam 20:00 başlayan mesai hâlâ aynı iş günüdür', () =>
    expect(isOnDuty('2026-09-16T18:00:00Z', new Date('2026-09-17T00:00:00Z'), FIVE)).toBe(true));

  // R86: başlangıç ayardan gelir. 04:30 Berlin (02:30 UTC) başlangıç 04:00 ise bugündür.
  it('iş günü başlangıcı 04:00 ise 04:30 Berlin başlayan mesai bugün sayılır', () => {
    expect(isOnDuty('2026-09-17T02:30:00Z', now, 240)).toBe(true);
    expect(isOnDuty('2026-09-17T02:30:00Z', now, FIVE)).toBe(false);
  });

  it('bozuk tarih mesai sayılmaz', () => expect(isOnDuty('dün', now, FIVE)).toBe(false));
});

describe('isTestAccount', () => {
  it.each(['test-admin', 'test-e2e-garson', 'demo-garson', 'demo-mutfak'])(
    '%s → test hesabı',
    (u) => expect(isTestAccount(u)).toBe(true),
  );

  it.each(['ayse', 'testci', 'demo', 'mehmet-test', 'contest-1'])('%s → gerçek hesap', (u) =>
    expect(isTestAccount(u)).toBe(false),
  );
});

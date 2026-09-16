import { describe, expect, it } from 'vitest';
import { localCancelReason, parseCancelReasons } from './cancelReasons';

const reasons = parseCancelReasons([
  { de: 'Gast hat storniert', tr: 'Müşteri vazgeçti' },
  { de: 'Falsch eingegeben', tr: 'Yanlış giriş' },
  { de: 'Nur Deutsch' },
  { de: 'Sonstiges', tr: 'Diğer', freeText: true },
  'bozuk',
  null,
]);

describe('parseCancelReasons', () => {
  it('yalnız geçerli kayıtları alır, bozuk ayar ekranı çökertmez', () => {
    expect(reasons.map((r) => r.de)).toEqual(['Gast hat storniert', 'Falsch eingegeben', 'Nur Deutsch', 'Sonstiges']);
    expect(reasons[3]!.freeText).toBe(true);
  });

  it('dizi olmayan ayar boş listedir', () => {
    expect(parseCancelReasons(undefined)).toEqual([]);
    expect(parseCancelReasons({ de: 'x' })).toEqual([]);
  });
});

/**
 * M3: sunucuya **Almanca** sebep yazılır (STORNO fişi Almanca). Ama TR arayüzde geri okunurken
 * "İptal: Gast hat storniert" görünmemeli — etiket yerel karşılığına eşlenir.
 */
describe('localCancelReason', () => {
  it('TR arayüzde Almanca sebebi yerel etikete geri eşler', () => {
    expect(localCancelReason('Gast hat storniert', reasons, 'tr')).toEqual({
      text: 'Müşteri vazgeçti',
      isGerman: false,
    });
  });

  it('DE arayüzde Almanca kalır', () => {
    expect(localCancelReason('Gast hat storniert', reasons, 'de')).toEqual({
      text: 'Gast hat storniert',
      isGerman: true,
    });
  });

  it('TR karşılığı olmayan sebep Almanca kalır ve Almanca işaretlenir', () => {
    expect(localCancelReason('Nur Deutsch', reasons, 'tr')).toEqual({ text: 'Nur Deutsch', isGerman: true });
  });

  it('serbest metin olduğu gibi kalır (Almanca yazılması beklenir)', () => {
    expect(localCancelReason('Gast war satt', reasons, 'tr')).toEqual({ text: 'Gast war satt', isGerman: true });
  });
});

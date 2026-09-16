import { describe, expect, it } from 'vitest';
import { centsToInput, parseEuroInput } from './money';

describe('para girişi', () => {
  it.each([
    ['7,50', 750],
    ['7', 700],
    ['7.5', 750],
    [' 11,5 ', 1150],
    ['0,70', 70],
  ])('%s → %i', (s, c) => expect(parseEuroInput(s as string)).toBe(c));

  it.each(['', 'abc', '-1', '1,234'])('%s geçersiz', (s) => expect(parseEuroInput(s)).toBeNull());

  it('kuruştan giriş metnine', () => expect(centsToInput(750)).toBe('7,50'));

  // Kayan nokta tuzağı: 7.35 * 100 = 734.9999999999999 — yuvarlama olmadan 734 kuruş yazardı.
  it('kuruş yuvarlaması kayıp vermez', () => expect(parseEuroInput('7,35')).toBe(735));
  it('gidiş-dönüş', () => expect(parseEuroInput(centsToInput(1395))).toBe(1395));
});

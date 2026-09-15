import { describe, expect, it } from 'vitest';
import { formatEuro, formatOrderNo } from './money';

describe('money', () => {
  it('kuruşu Alman euro biçimine çevirir (Intl, € öncesi NBSP)', () => {
    expect(formatEuro(850)).toBe('8,50\u00a0€');
    expect(formatEuro(1150)).toBe('11,50\u00a0€');
    expect(formatEuro(0)).toBe('0,00\u00a0€');
  });
  it('sipariş numarasını 3 haneye tamamlar', () => {
    expect(formatOrderNo(7)).toBe('#007');
    expect(formatOrderNo(47)).toBe('#047');
    expect(formatOrderNo(1234)).toBe('#1234');
  });
});

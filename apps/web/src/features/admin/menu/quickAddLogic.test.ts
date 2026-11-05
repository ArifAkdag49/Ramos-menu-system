import { describe, expect, it } from 'vitest';
import { cleanName, groupShape, nameError, nextSort, priceDeltaCents, QUICK_NAME_MAX } from './quickAddLogic';

describe('quickAddLogic', () => {
  it('grup türü min/max/fiş biçimine çevrilir', () => {
    expect(groupShape('single', 5)).toEqual({ min_select: 1, max_select: 1, ticket_format: 'values_only' });
    expect(groupShape('multi', 3)).toEqual({ min_select: 0, max_select: 3, ticket_format: 'label_values' });
    expect(groupShape('extra', 0)).toEqual({ min_select: 0, max_select: 1, ticket_format: 'plus_each' });
  });

  it('yeni kayıt listenin sonuna gelir', () => {
    expect(nextSort([])).toBe(10);
    expect(nextSort([{ sort: 30 }, { sort: 10 }])).toBe(40);
  });

  it('ad temizlenir; boş, uzun ve aynı ad reddedilir', () => {
    expect(cleanName('  BBQ   Soße ')).toBe('BBQ Soße');
    expect(nameError('   ', [])).toBe('required');
    expect(nameError('x'.repeat(QUICK_NAME_MAX + 1), [])).toBe('too_long');
    expect(nameError(' knoblauch ', ['Knoblauch'])).toBe('taken');
    expect(nameError('Soße', ['SOSSE'])).toBeNull();
    expect(nameError('Gurken', ['Tomaten'])).toBeNull();
  });

  it('fiyat farkı: boş = ücretsiz, hatalı = null', () => {
    expect(priceDeltaCents('')).toBe(0);
    expect(priceDeltaCents('0,50')).toBe(50);
    expect(priceDeltaCents('abc')).toBeNull();
  });
});

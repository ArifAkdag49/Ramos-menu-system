import { describe, expect, it } from 'vitest';
import { localTableName } from './domain';

describe('localTableName', () => {
  it('TR arayüzde "Tisch" önekini "Masa" yapar', () => {
    expect(localTableName('Tisch 12', 'tr')).toBe('Masa 12');
  });

  it('DE arayüzde değişmez (fiş her zaman Almanca, ekran da varsayılan Almanca)', () => {
    expect(localTableName('Tisch 12', 'de')).toBe('Tisch 12');
  });

  it('TR arayüzde "Tisch" ile başlamayan adı değiştirmez', () => {
    expect(localTableName('Bar 1', 'tr')).toBe('Bar 1');
  });
});

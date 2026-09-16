import { describe, expect, it } from 'vitest';
import { normalize, searchProducts } from './menuSearch';

const p = (code: string | null, name: string) => ({ id: name, code, name }) as never;
const menu = [p('05', 'Drehspieß Sandwich'), p('59', 'Kuzu Şiş'), p('71a', 'Köfte Sandwich'), p('M1', 'Drehspieß Sandwich Menü'),
  p(null, 'Cola 0,33 l'), p('20', 'Lahmacun')];

describe('menü arama', () => {
  it('normalize aksanları ve ß’yi açar', () => expect(normalize('Drehspieß ŞİŞ Kräuter')).toBe('drehspiess sis krauter'));
  it('kod önce: "05" ve "71a" ve "m1"', () => {
    expect(searchProducts(menu, '05').map((x: { code: string }) => x.code)).toEqual(['05']);
    expect(searchProducts(menu, '71A')[0]).toMatchObject({ code: '71a' });
    expect(searchProducts(menu, 'm1')[0]).toMatchObject({ code: 'M1' });
  });
  it('ad araması aksansız', () => {
    expect(searchProducts(menu, 'sis').map((x: { name: string }) => x.name)).toEqual(['Kuzu Şiş']);
    expect(searchProducts(menu, 'kofte').map((x: { name: string }) => x.name)).toEqual(['Köfte Sandwich']);
  });
  it('boş sorgu tüm listeyi döndürür', () => expect(searchProducts(menu, '  ')).toHaveLength(6));
});

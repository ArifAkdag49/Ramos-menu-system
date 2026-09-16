import { describe, expect, it } from 'vitest';
import {
  fileNameToCode,
  fitWithin,
  imagePaths,
  matchFilesToProducts,
  validateImageFile,
} from './imageUpload';

describe('görsel yardımcıları', () => {
  it.each([
    ['05.jpg', '05'],
    ['71A.webp', '71a'],
    ['M1.png', 'm1'],
    ['100.jpeg', '100'],
    ['T05.png', 't05'],
    ['pizza.jpg', null],
    ['05-final.jpg', null],
    ['05.gif', null],
  ])('%s → %s', (n, c) => expect(fileNameToCode(n as string)).toBe(c));

  it('yol şablonu', () =>
    expect(imagePaths('p1', 1700)).toEqual({
      full: 'products/p1-1700.webp',
      thumb: 'products/p1-1700-thumb.webp',
    }));

  it('dosyaları ürün numarasıyla eşler', () => {
    const f = (name: string) => new File([new Uint8Array([1])], name);
    const r = matchFilesToProducts(
      [f('05.jpg'), f('M1.png'), f('xyz.png')],
      [
        { id: 'a', code: '05' },
        { id: 'b', code: 'M1' },
        { id: 'c', code: null },
      ],
    );
    expect(r.matched.map((m) => m.productId)).toEqual(['a', 'b']);
    expect(r.unmatched.map((u) => u.name)).toEqual(['xyz.png']);
  });

  // BUILD-PROMPT §6: Türkçe yerelde "I".toLocaleLowerCase() → "ı". Eşleştirme bundan etkilenmemeli.
  it('büyük harfli kod Türkçe yerelden etkilenmez', () => {
    const f = (name: string) => new File([new Uint8Array([1])], name);
    const r = matchFilesToProducts([f('M1.PNG')], [{ id: 'a', code: 'M1' }]);
    expect(r.matched.map((m) => m.productId)).toEqual(['a']);
    expect(fileNameToCode('M1.PNG')).toBe('m1');
  });

  it('en-boy oranı korunur, küçük görsel büyütülmez', () => {
    expect(fitWithin(3000, 2000, 1200)).toEqual({ width: 1200, height: 800 });
    expect(fitWithin(600, 1800, 320)).toEqual({ width: 107, height: 320 });
    expect(fitWithin(800, 600, 1200)).toEqual({ width: 800, height: 600 });
  });

  it('dosya kontrolü tür ve boyuta bakar', () => {
    expect(validateImageFile({ type: 'image/png', size: 1000 })).toBeNull();
    expect(validateImageFile({ type: 'image/gif', size: 1000 })).toBe('bad_type');
    expect(validateImageFile({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).toBe('too_large');
  });
});

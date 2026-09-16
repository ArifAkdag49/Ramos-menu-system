/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, overlay, readTokens } from '../test/contrast';
import { TONE_CLASS } from './tone';

// Dosya diskten okunur. `?raw` içe aktarımı işe yaramıyor: Tailwind eklentisi `.css` modülünü
// vitest içinde de derliyor ve içerik taraması boş kaldığı için tema değişkenleri budanıyor.
// `import.meta.url` de Vite dönüşümünden sonra `file:` şemasında olmadığı için yol cwd'den kurulur
// (vitest kökü `apps/web`).
const tokensCss = readFileSync('src/styles/tokens.css', 'utf8');
const tokens = readTokens(tokensCss);

const token = (name: string): string => {
  const v = tokens[name];
  if (!v) throw new Error(`tokens.css'te --color-${name} yok`);
  return v;
};

/** WCAG AA gövde metni eşiği. */
const AA = 4.5;
/** Çalışma payı: eşiğe yüzdelik farkla dayanan renk kabul edilmez (I6). */
const MARGIN = 5;

/** `"border-x bg-y/15 text-z"` sınıf dizisinden gerçek metin/zemin çiftini çıkarır. */
function measure(classes: string, base: string): { fg: string; bg: string; ratio: number } {
  const bgm = /(?:^|\s)bg-([a-z0-9-]+?)(?:\/(\d+))?(?=\s|$)/.exec(classes);
  const fgm = /(?:^|\s)text-([a-z0-9-]+)(?=\s|$)/.exec(classes);
  if (!bgm?.[1] || !fgm?.[1]) throw new Error(`sınıf dizisi çözülemedi: ${classes}`);
  const alpha = bgm[2] ? Number(bgm[2]) / 100 : 1;
  const bg = alpha === 1 ? token(bgm[1]) : overlay(token(bgm[1]), base, alpha);
  const fg = token(fgm[1]);
  return { fg, bg, ratio: contrastRatio(fg, bg) };
}

describe('TONE_CLASS kontrastı — metin, kendi tint zemini üzerinde okunur', () => {
  const base = token('bg');
  for (const [tone, classes] of Object.entries(TONE_CLASS)) {
    it(`${tone}: metin/zemin oranı ${MARGIN}:1 üstünde`, () => {
      const { ratio } = measure(classes, base);
      expect(ratio).toBeGreaterThanOrEqual(MARGIN);
    });
  }
});

describe('marka renkleri düz koyu yüzeylerde AA geçer (DESIGN.md §2.1)', () => {
  for (const name of ['lime', 'gold', 'danger', 'warning', 'info', 'muted', 'text']) {
    it(`${name} / bg`, () => expect(contrastRatio(token(name), token('bg'))).toBeGreaterThanOrEqual(AA));
  }
});

describe('danger metni her koyu yüzeyde rahat okunur', () => {
  for (const surface of ['bg', 'surface', 'surface-2']) {
    it(`danger-ink / ${surface}`, () =>
      expect(contrastRatio(token('danger-ink'), token(surface))).toBeGreaterThanOrEqual(MARGIN));
  }
});

describe('lime ve gold zemin olduğunda üzerine koyu metin gelir', () => {
  it('lime zemin + bg metin', () =>
    expect(contrastRatio(token('lime'), token('bg'))).toBeGreaterThanOrEqual(AA));
  it('gold zemin + bg metin', () =>
    expect(contrastRatio(token('gold'), token('bg'))).toBeGreaterThanOrEqual(AA));
});

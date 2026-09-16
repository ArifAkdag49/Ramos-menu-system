/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, overlay, readTokens } from '../../test/contrast';
import { TONE_CLASS, TONE_SOLID } from '../../ui/tone';

/**
 * M4 tasarım kapısı — KDS kontrast kapısı. Sayılar `tokens.css`'ten okunup WCAG 2.1 formülüyle
 * HESAPLANIR (göz kararı yok); bir token ya da sınıf değişince test kırılır.
 *
 * Kapatılan bulgular:
 * - Y2: iptal edilmiş kalem blok `opacity-70` altında kalıyordu; İPTAL/STORNO rozeti 3,77:1'e
 *   düşüyordu (axe `color-contrast`, `kitchen` + `ready` ekranları). Opaklık kaldırıldı.
 * - Y6: gecikme artık kart zemininde de görünüyor; o zeminlerin ÜSTÜNDEKİ metin de AA geçmeli.
 * - O2: `--text-display` tokenı ve ham piksel kalmaması.
 */
const tokensCss = readFileSync('src/styles/tokens.css', 'utf8');
const orderCardSrc = readFileSync('src/features/kitchen/OrderCard.tsx', 'utf8');
const tokens = readTokens(tokensCss);

const token = (name: string): string => {
  const v = tokens[name];
  if (!v) throw new Error(`tokens.css'te --color-${name} yok`);
  return v;
};

/** WCAG AA gövde metni eşiği. */
const AA = 4.5;
/** Çalışma payı (tone.test.ts ile aynı): eşiğe yüzdelikle dayanan renk kabul edilmez. */
const MARGIN = 5;

describe('Y2 — iptal edilmiş kalem: blok opaklık yok, rozet ve metin AA üstünde', () => {
  it('OrderCard hiçbir yerde `opacity-*` ile metin söndürmez', () => {
    expect(orderCardSrc).not.toMatch(/\bopacity-\d+\b/);
  });

  for (const surface of ['surface', 'surface-late', 'surface-warn']) {
    it(`İPTAL/STORNO rozeti ${surface} kartının üstünde ${AA}:1 üstünde`, () => {
      // Badge = TONE_CLASS.danger → `bg-danger/15` kartın zemini üzerine biner.
      expect(TONE_CLASS.danger).toBe('border-danger/40 bg-danger/15 text-danger-ink');
      const bg = overlay(token('danger'), token(surface), 0.15);
      expect(contrastRatio(token('danger-ink'), bg)).toBeGreaterThanOrEqual(AA);
    });

    it(`üstü çizili kalem adı (text-muted) ${surface} üzerinde ${AA}:1 üstünde`, () => {
      expect(contrastRatio(token('muted'), token(surface))).toBeGreaterThanOrEqual(AA);
    });
  }
});

describe('Y6 — gecikme kart düzeyinde: yeni zeminlerin üstündeki metin okunur kalır', () => {
  for (const surface of ['surface-late', 'surface-warn']) {
    for (const fg of ['text', 'muted', 'danger-ink']) {
      it(`${fg} / ${surface} ≥ ${AA}:1`, () => {
        expect(contrastRatio(token(fg), token(surface))).toBeGreaterThanOrEqual(AA);
      });
    }
  }

  it('gecikmiş/uyaran kart zemini, normal kart zemininden AYIRT EDİLEBİLİR (1–2 m gözü)', () => {
    expect(contrastRatio(token('surface-late'), token('surface'))).toBeGreaterThan(1.2);
    expect(contrastRatio(token('surface-warn'), token('surface'))).toBeGreaterThan(1.2);
  });

  it('kart kenarlığı metin-dışı kontrast eşiğini (1.4.11 · 3:1) geçer', () => {
    // Zemin farkı koyu temada kaçınılmaz olarak küçük; taşıyıcı sinyal 2 px kenarlık.
    expect(contrastRatio(token('danger'), token('surface-late'))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(token('warning'), token('surface-warn'))).toBeGreaterThanOrEqual(3);
  });

  it('süre kutusu opak `surface-2` üzerinde durur — tonu ne olursa olsun AA+pay geçer', () => {
    for (const tone of ['open', 'warning', 'danger', 'ready'] as const) {
      const classes = TONE_SOLID[tone];
      const fg = /text-([a-z0-9-]+)(?=\s|$)/.exec(classes)?.[1];
      if (!fg) throw new Error(`ton çözülemedi: ${classes}`);
      expect(contrastRatio(token(fg), token('surface-2'))).toBeGreaterThanOrEqual(MARGIN);
    }
  });
});

describe('O2 — tipografi rolleri tokena bağlı, ham piksel yok', () => {
  it('`--text-display` DESIGN.md §3 ile aynı: 40 px / 1.05', () => {
    expect(tokensCss).toMatch(/--text-display:\s*40px;/);
    expect(tokensCss).toMatch(/--text-display--line-height:\s*1\.05;/);
  });

  it('KDS masa adı `text-display`, kalem satırı `text-kds` rolünü kullanır', () => {
    expect(orderCardSrc).toContain('text-display');
    expect(orderCardSrc).toContain('text-kds');
  });

  it('dosyada ham piksel boyutu kalmadı (`text-[22px]` gibi)', () => {
    expect(orderCardSrc).not.toMatch(/text-\[\d+px\]/);
  });
});

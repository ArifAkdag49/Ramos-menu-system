/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, overlay, readTokens } from '../../test/contrast';
import { TONE_CLASS, TONE_SOLID, type Tone } from '../../ui/tone';
import { KDS_BADGE_CLASS } from './KdsBadge';

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

/**
 * Kapı 2. turu R1 — Y6 kart zeminlerini çoğalttı (`surface`, `surface-late`, `surface-warn`),
 * ama rozetler `ui/tone.ts`'in yarı saydam `bg-<renk>/15` tintini kullandığı için tint yeni
 * zeminlerin üzerinde inceldi ve info ("Kuyrukta") ile ready (altın) AA'nın altına düştü.
 *
 * Bu blok, rozet × kart-zemini kombinasyonlarının **tamamını** ölçer. Render testi değil:
 * sınıf dizileri tokenlara çözülür ve oran WCAG 2.1 formülüyle hesaplanır, yani bir kart zemini
 * eklendiğinde ya da bir rozet tinte döndüğünde test kırılır.
 */
describe('R1 — KDS rozetleri HER kart zemininde okunur', () => {
  /** `OrderCard`'ın `CARD_TONE` eşlemesindeki üç zemin (ok/ready → surface, warn, late). */
  const CARD_SURFACES = ['surface', 'surface-late', 'surface-warn'] as const;
  /** KDS kartında gerçekten çizilen rozetler: EK SİPARİŞ, İPTAL, Kuyrukta/Basılamadı, Hazır ✓. */
  const BADGE_TONES: Tone[] = ['info', 'ready', 'danger', 'warning'];

  /** `"border-x/40 bg-y[/15] text-z"` → rozetin verilen kart zemini üzerindeki gerçek oranı. */
  function badgeRatio(classes: string, cardSurface: string): number {
    const bgm = /(?:^|\s)bg-([a-z0-9-]+?)(?:\/(\d+))?(?=\s|$)/.exec(classes);
    const fgm = /(?:^|\s)text-([a-z0-9-]+)(?=\s|$)/.exec(classes);
    if (!bgm?.[1] || !fgm?.[1]) throw new Error(`sınıf dizisi çözülemedi: ${classes}`);
    const alpha = bgm[2] ? Number(bgm[2]) / 100 : 1;
    // Yarı saddam zemin ALTINDAKİ kartın zeminine biner; opak zemin karttan bağımsızdır.
    const bg = alpha === 1 ? token(bgm[1]) : overlay(token(bgm[1]), token(cardSurface), alpha);
    return contrastRatio(token(fgm[1]), bg);
  }

  for (const surface of CARD_SURFACES) {
    for (const tone of BADGE_TONES) {
      it(`${tone} rozeti / ${surface} kartı ≥ ${MARGIN}:1`, () => {
        expect(badgeRatio(KDS_BADGE_CLASS[tone], surface)).toBeGreaterThanOrEqual(MARGIN);
      });
    }
  }

  it('KDS rozetinin zemini kartın tonundan BAĞIMSIZ (opak) — oran her zeminde aynı', () => {
    for (const tone of BADGE_TONES) {
      expect(KDS_BADGE_CLASS[tone]).not.toMatch(/bg-[a-z0-9-]+\/\d+/);
      const ratios = CARD_SURFACES.map((s) => badgeRatio(KDS_BADGE_CLASS[tone], s));
      expect(new Set(ratios).size).toBe(1);
    }
  });

  it('kanıt: yarı saydam tint rozet (ui/tone.ts TONE_CLASS) yeni zeminlerde AA altına düşüyor', () => {
    // Kapının 2. tur ölçümü: info 5,23 → 4,26 (late) / 4,23 (warn); ready 5,46 → 4,34 / 4,36.
    // Bu yüzden KDS `ui/Badge` kullanmıyor. Sayı bir gün düzelirse bu test de düşer ve
    // KdsBadge'in gerekçesi gözden geçirilir.
    for (const surface of ['surface-late', 'surface-warn']) {
      for (const tone of ['info', 'ready'] as const) {
        expect(badgeRatio(TONE_CLASS[tone], surface)).toBeLessThan(AA);
      }
    }
    // Aynı rozetler düz `surface` üzerinde sorunsuzdu — sorun tintin kendisi değil, ZEMİN.
    for (const tone of ['info', 'ready'] as const) {
      expect(badgeRatio(TONE_CLASS[tone], 'surface')).toBeGreaterThanOrEqual(MARGIN);
    }
  });

  it('OrderCard yarı saydam tint rozet kullanmaz — `ui/Badge` yerine `KdsBadge`', () => {
    expect(orderCardSrc).not.toMatch(/from '\.\.\/\.\.\/ui\/Badge'/);
    expect(orderCardSrc).toContain('KdsBadge');
    // Süre kutusu da aynı opak paletten beslenir.
    expect(orderCardSrc).toContain('KDS_BADGE_CLASS[ELAPSED_TONE[tone]]');
  });
});

/**
 * Kapı 3. turu R3 — eylem satırı kart içinde yapışkan (`sticky bottom-0`). Bu bir yerleşim
 * düzeltmesi ama kontrast sonucu var: yapışkan satırın ALTINDAN kalem satırları kayıyor, zemini
 * opak olmazsa metin metnin üstüne biner ve düğmenin etiketi okunmaz olur. Burada ölçülen şey
 * kartın zemin paletinin opak kaldığı (yarı saydam bir zemin geri gelirse test kırılır).
 */
describe('R3 — yapışkan eylem satırı opak kart zemini taşır', () => {
  it('eylem satırı `sticky bottom-0` ve kartın zemin eşlemesini kullanır', () => {
    expect(orderCardSrc).toMatch(/sticky bottom-0[^']*',\s*CARD_SURFACE\[tone\]/);
  });

  it('kart zemin paletinde yarı saydam değer yok — altından metin geçmez', () => {
    const map = /const CARD_SURFACE: Record<KitchenTone, string> = \{([^}]*)\}/.exec(orderCardSrc);
    if (!map?.[1]) throw new Error('CARD_SURFACE eşlemesi bulunamadı');
    expect(map[1]).not.toMatch(/bg-[a-z0-9-]+\/\d+/);
    for (const surface of ['surface', 'surface-late', 'surface-warn']) {
      expect(map[1]).toContain(`bg-${surface}`);
    }
  });
});

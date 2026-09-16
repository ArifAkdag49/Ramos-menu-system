/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, readTokens } from '../../test/contrast';

/**
 * M3 tasarım kapısının (`.superpowers/sdd/2026-09-15-ramos-plan-2-giris-ve-garson/design-gate-m3-m4.md`)
 * garson tarafı bulguları için nöbetçi testler.
 *
 * İki tür iddia var ve ikisi de göz kararı değil:
 *  1. **Kontrast** — sayılar `tokens.css`'ten okunup WCAG 2.1 formülüyle hesaplanır (`tone.test.ts`
 *     kalıbı). Kapının ölçtüğü ihlallerin sebebi renk değil, kapsayıcıya verilen **blok
 *     `opacity`**'ydi: `opacity-60`/`opacity-50` altındaki `--color-danger-ink` ve `--color-muted`
 *     eşiğin altına düşüyordu (3,38:1 ve 2,74:1). Bu yüzden hem oran hesaplanır hem de blok
 *     opaklığın geri gelmediği kaynaktan doğrulanır.
 *  2. **Yapı** — sarma/kesme, yazı rolü ve ARIA kuralları yalnız sınıf/öznitelik düzeyinde
 *     görünür; bunlar kaynak taramasıyla sabitlenir.
 */
const source = (path: string): string => readFileSync(path, 'utf8');

/**
 * Yorumlar taramanın dışında kalır: bu dosyadaki iddiaların hepsi "kaynakta şu SINIF/ÖZNİTELİK
 * var/yok" biçiminde ve düzeltmelerin yanına yazılan gerekçe yorumları ("blok `opacity-60`
 * kaldırıldı") kuralın kendisini yanlışlıkla kırıyordu.
 */
const code = (path: string): string =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const tokens = readTokens(source('src/styles/tokens.css'));

const token = (name: string): string => {
  const v = tokens[name];
  if (!v) throw new Error(`tokens.css'te --color-${name} yok`);
  return v;
};

/** WCAG AA gövde metni eşiği. */
const AA = 4.5;

const orderPage = code('src/features/waiter/OrderPage.tsx');
const tableDetail = code('src/features/waiter/TableDetailPage.tsx');
const itemLines = code('src/features/common/ItemLinesView.tsx');
const stepper = code('src/ui/Stepper.tsx');

/**
 * K1 (KRİTİK): DE arayüzde "Hinzufügen"/"Auswählen" düğmesi satırı yiyordu; ürün adı ~10 karaktere
 * düşüp `05 Drehspie…`, `89 Gemüse …` oluyordu. Menüde altı ayrı `Drehspieß …` ürünü var —
 * hepsi aynı görünüyordu, yanlış ürün ancak mutfak fişi bastıktan sonra fark ediliyordu.
 * DESIGN.md §3 `truncation-strategy`: kısaltma yerine sarma.
 */
describe('K1 — ürün adı kesilmez, sarar', () => {
  it('ürün adında `truncate` yok', () => {
    expect(orderPage).not.toMatch(/truncate[^"']*"\s*>\s*\{product\.name\}/);
    expect(orderPage).toMatch(/line-clamp-2/);
  });

  it('adın genişliğini düğme belirlemez: düğme ad satırının içinde durmaz', () => {
    // Ad kendi satırının tamamını alır; fiyat ve eylem bir alt satırda yan yana durur.
    expect(orderPage).toMatch(/data-testid="product-row-actions"/);
  });
});

/**
 * Y2: iptal edilmiş kalemde blok `opacity-60`, altındaki `--color-danger-ink`'i de söndürüyordu
 * (iptal sebebi 3,38:1). Üstü çizili + soluk gövde kalır, ama sebep satırı tam opaklıktadır.
 */
describe('Y2 — iptal edilmiş kalem AA geçer (garson)', () => {
  it('kalem kapsayıcısında blok opaklık yok', () => {
    expect(tableDetail).not.toMatch(/opacity-\d+/);
  });

  it('iptal sebebi danger-ink ile kart yüzeyinde AA geçer', () => {
    expect(contrastRatio(token('danger-ink'), token('surface'))).toBeGreaterThanOrEqual(AA);
  });

  it('üstü çizili kalem adı muted ile kart yüzeyinde AA geçer', () => {
    expect(contrastRatio(token('muted'), token('surface'))).toBeGreaterThanOrEqual(AA);
  });
});

/**
 * Y3: tükendi satırı `opacity-50` ile 2,74:1'e düşüyordu (axe bu ekranda 15 düğüm işaretledi) ve
 * satırda düğme de kalmadığı için "eksik render" gibi duruyordu. Opaklık yerine belirgin bir
 * durum: muted metin + sağda pasif "Tükendi" rozeti.
 */
describe('Y3 — tükendi ürün satırı AA geçer', () => {
  it('satırda blok opaklık yok', () => {
    expect(orderPage).not.toMatch(/opacity-\d+/);
  });

  it('tükendi metni muted ile sayfa zemininde AA geçer', () => {
    expect(contrastRatio(token('muted'), token('bg'))).toBeGreaterThanOrEqual(AA);
  });

  it('rozetin zemini `surface-2`; muted metin orada da AA geçer', () => {
    expect(contrastRatio(token('muted'), token('surface-2'))).toBeGreaterThanOrEqual(AA);
  });

  it('satırın sağ tarafı boş kalmaz: tükendi rozeti düğmenin yerini alır', () => {
    expect(orderPage).toMatch(/soldOut \?[\s\S]{0,200}Badge/);
  });
});

/**
 * Y7: garson kalem alt satırları (varyant, seçimler, ÇIKAR, not) 14 px'ti — BUILD-PROMPT §10.6
 * "garson gövde ≥ 16 px" ihlali. Ürün adı da 16 px'ti, oysa DESIGN.md `product` rolü 17 px ve
 * `--text-product` tokenı zaten var.
 */
describe('Y7 — garson yazı boyutları §10.6', () => {
  it('kalem alt satırları 14 px değil', () => {
    expect(itemLines).not.toMatch(/text-sm/);
  });

  it('masa detayındaki ürün adı `--text-product` tokenını okur', () => {
    expect(tableDetail).toMatch(/text-product/);
  });

  it('`--text-product` 17 px (DESIGN.md §3)', () => {
    expect(source('src/styles/tokens.css')).toMatch(/--text-product:\s*17px/);
  });
});

/**
 * O7: jenerik öğede (`span`/`div`) `aria-label` ARIA 1.2'de YASAK — ekran okuyucular yok sayar.
 * Adet değişimi bağlamsız duyuruluyordu, kategori şeridinin etiketi hiç duyurulmuyordu.
 */
describe('O7 — jenerik öğede aria-label kalmadı', () => {
  it('Stepper sayısı aria-label taşımaz; duyuru görünmez bir canlı bölgeden gelir', () => {
    expect(stepper).not.toMatch(/aria-label=\{valueLabel\}/);
    expect(stepper).toMatch(/role="status"/);
  });

  it('kategori şeridinin rolü var', () => {
    expect(orderPage).toMatch(/role="group"[\s\S]{0,120}categoriesLabel|categoriesLabel[\s\S]{0,120}role="group"/);
  });
});

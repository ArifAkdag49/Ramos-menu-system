import { unitPriceCents, type MenuProduct, type Selection, type TicketPayload } from '@ramos/shared';

export type GroupErrorKey = 'min_gt_max' | 'min_gt_options' | 'max_gt_options';

/**
 * Seçim grubunun kuralları kendi içinde tutarlı mı? Tutarsız bir grup garson ekranını kilitler:
 * "en az 5 seç" diyen ama 4 seçeneği olan grupta "Sepete ekle" hiçbir zaman açılmaz. Bu yüzden
 * kaydetmeden **önce** burada yakalanır.
 *
 * Sıra önemli: min > max en temel çelişkidir, sonra min, sonra max seçenek sayısıyla karşılaştırılır.
 */
export function validateGroup(
  g: { min_select: number; max_select: number },
  activeOptionCount: number,
): GroupErrorKey | null {
  if (g.min_select > g.max_select) return 'min_gt_max';
  if (g.min_select > activeOptionCount) return 'min_gt_options';
  if (g.max_select > activeOptionCount) return 'max_gt_options';
  return null;
}

/**
 * Sürükle-bırak sonrası yeni `sort` değerleri. `fromId` öğesi `toId`'nin **özgün** yerine taşınır
 * (dnd-kit'in `arrayMove` davranışı), sonra tüm liste 10'un katlarıyla yeniden numaralanır —
 * araya sonradan el ile satır sıkıştırmak gerekirse boşluk kalsın diye.
 *
 * Taşıma yoksa (aynı öğe ya da bulunamayan id) boş dizi döner: çağıran boşuna yazma yapmaz.
 */
export function reorder<T extends { id: string }>(
  list: T[],
  fromId: string,
  toId: string,
): { id: string; sort: number }[] {
  const from = list.findIndex((x) => x.id === fromId);
  const to = list.findIndex((x) => x.id === toId);
  if (from < 0 || to < 0 || from === to) return [];
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (!moved) return [];
  next.splice(to, 0, moved);
  return next.map((x, i) => ({ id: x.id, sort: (i + 1) * 10 }));
}

/**
 * `slug` sütunları `not null unique`; kullanıcı onları hiç görmez, adından üretilir. Türkçe ve
 * Almanca harfler **elle** eşlenir: `ı`, `İ` ve `ß` normal Unicode ayrıştırmayla açılmaz ve
 * `toLocaleLowerCase` Türkçe yerelde "I"yı "ı" yapıp slug'ı bozardı — bu yüzden düz `toLowerCase`.
 */
const SLUG_MAP: Record<string, string> = {
  ß: 'ss', ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ç: 'c', Ç: 'c',
  ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ä: 'a', Ä: 'a',
};

export function slugify(s: string): string {
  return s
    .replace(/[ßıİşŞğĞçÇüÜöÖäÄ]/g, (c) => SLUG_MAP[c] ?? c)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Ad boşsa ya da tümü aksan/işaretse slug boş kalır; benzersizliği korumak için kısa bir ek verilir. */
export const slugWithFallback = (name: string, seed: string): string => slugify(name) || `x-${seed.slice(0, 8)}`;

/** Önizleme fişi gerçek bir siparişe ait değildir; sabit örnek masa/numara ile çizilir. */
const PREVIEW = { table: 'Tisch 12', orderNo: 47, round: 1, waiter: 'Vorschau' } as const;

/**
 * Ürün + seçimden tek kalemli örnek fiş yükü. Fiş **her zaman Almanca**dır (BUILD-PROMPT §5),
 * bu yüzden varyant, malzeme ve seçenek adlarında `localName` değil doğrudan `name_de` kullanılır —
 * TR arayüzde bile mutfağa giden kâğıt aynı kalır.
 */
export function previewPayloadFor(
  product: MenuProduct,
  sel: Selection,
  qty: number,
  isBeverage = false,
): TicketPayload {
  const variant = product.variants.find((v) => v.id === sel.variantId);
  const without = product.ingredients
    .filter((i) => sel.removedIngredientIds.includes(i.id))
    .map((i) => i.name_de);

  const groups = product.groups
    .map((g) => ({
      label: g.name_de,
      format: g.ticket_format,
      values: g.options.filter((o) => sel.optionIds.includes(o.id)).map((o) => o.name_de),
    }))
    .filter((g) => g.values.length > 0);

  return {
    kind: 'order',
    header: "RAMO'S · KÜCHE",
    table: PREVIEW.table,
    orderNo: PREVIEW.orderNo,
    round: PREVIEW.round,
    createdAt: new Date().toISOString(),
    waiter: PREVIEW.waiter,
    items: [
      {
        qty,
        code: product.code,
        name: product.name,
        isBeverage,
        variant: variant ? variant.name_de : null,
        without,
        groups,
        note: null,
        priceCents: unitPriceCents(product, sel) * qty,
      },
    ],
  };
}

export interface AllergenEntry {
  code: string;
  de: string;
  tr: string;
}

/**
 * `settings.allergen_legend` `jsonb`'dir, yani tip sistemi onu `Json` olarak verir. Şekli burada
 * doğrulanır: bozuk bir kayıt ürün editörünü çökertmek yerine yalnız alerjen çiplerini boş bırakır.
 */
export function readAllergenLegend(value: unknown): AllergenEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((x) => {
    if (!x || typeof x !== 'object') return [];
    const e = x as Record<string, unknown>;
    return typeof e.code === 'string'
      ? [{ code: e.code, de: String(e.de ?? e.code), tr: String(e.tr ?? e.de ?? e.code) }]
      : [];
  });
}

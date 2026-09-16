import type { CartLine, MenuProduct } from '@ramos/shared';
import { RpcError, type ErrorKey } from '../../lib/rpc';

export type SubmitSuggestion = 'edit' | 'remove' | 'retry' | null;

/**
 * Herhangi bir hatayı `errors.<key>` ile gösterilebilir bir anahtara indirger. Tanınmayan hata
 * sessizce yutulmaz, "bilinmeyen" olarak kullanıcıya bildirilir (BUILD-PROMPT §10.9).
 */
export const errorKey = (e: unknown): ErrorKey => (e instanceof RpcError ? e.key : 'unknown');

export interface SubmitErrorView {
  /** `errors.<key>` ile gösterilecek anahtar. */
  key: ErrorKey;
  /** Kırmızı işaretlenecek sepet satırlarının `CartLine.key` değerleri. */
  badLineKeys: string[];
  /** O satırlarda önerilecek tek eylem. */
  suggest: SubmitSuggestion;
  /** Menü sorgusu geçersiz kılınmalı mı (ürün tükenmiş/kaldırılmış olabilir). */
  refreshMenu: boolean;
}

/** Detayı ürün kimliği olan hatalar — `submit_order` bunlarda `v_product.id` döndürür. */
const BY_PRODUCT: Partial<Record<ErrorKey, SubmitSuggestion>> = {
  product_sold_out: 'remove',
  product_unavailable: 'remove',
  variant_required: 'edit',
  variant_invalid: 'edit',
  option_invalid: 'edit',
  ingredient_invalid: 'edit',
};

/** Detayı seçim grubu kimliği olan hatalar — `submit_order` bunlarda `v_group.id` döndürür. */
const BY_GROUP: ErrorKey[] = ['option_group_min', 'option_group_max', 'option_exclusive_conflict'];

const REFRESH_MENU: ErrorKey[] = ['product_sold_out', 'product_unavailable', 'product_not_found'];

/**
 * Sunucudan dönen hatayı "hangi satır kırmızı olacak + orada hangi eylem önerilecek" bilgisine
 * çevirir (spec §13, brief Adım 2 `SendConfirm` bölümü).
 *
 * Kuralı yeniden türetmez: `submit_order` hangi kimliği `detail`'de döndürüyorsa (ürün ya da
 * seçim grubu) yalnız onu sepetteki satırla eşler. R40/R41/R42 gereği karar hep sunucunundur.
 */
export function submitErrorView(
  error: unknown,
  lines: CartLine[],
  byId: Map<string, MenuProduct>,
): SubmitErrorView {
  if (!(error instanceof RpcError)) {
    return { key: errorKey(error), badLineKeys: [], suggest: null, refreshMenu: false };
  }
  const { key, detail } = error;
  const refreshMenu = REFRESH_MENU.includes(key);

  if (key === 'network') return { key, badLineKeys: [], suggest: 'retry', refreshMenu };

  const byProduct = BY_PRODUCT[key];
  if (byProduct) {
    const keys = detail ? lines.filter((l) => l.productId === detail).map((l) => l.key) : [];
    return { key, badLineKeys: keys, suggest: byProduct, refreshMenu };
  }

  if (BY_GROUP.includes(key)) {
    const keys = detail
      ? lines.filter((l) => byId.get(l.productId)?.groups.some((g) => g.id === detail)).map((l) => l.key)
      : [];
    return { key, badLineKeys: keys, suggest: 'edit', refreshMenu };
  }

  return { key, badLineKeys: [], suggest: null, refreshMenu };
}

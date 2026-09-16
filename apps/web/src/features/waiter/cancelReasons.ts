import type { Locale } from '@ramos/shared';

export interface CancelReason {
  de: string;
  /** TR karşılığı; yoksa arayüzde de Almanca gösterilir. */
  tr?: string;
  /** Seçilince serbest metin zorunlu olur ("Sonstiges / Diğer"). */
  freeText?: boolean;
}

const isReason = (v: unknown): v is CancelReason =>
  typeof v === 'object' && v !== null && typeof (v as { de?: unknown }).de === 'string';

/**
 * `settings.cancel_reasons` şemada `jsonb`. Biçim tek yerde doğrulanır ki bozuk ya da eksik bir
 * ayar satırı iptal panelini çökertmesin.
 */
export function parseCancelReasons(data: unknown): CancelReason[] {
  return Array.isArray(data) ? data.filter(isReason) : [];
}

/**
 * M3: sebep sunucuya **Almanca** yazılır (doğrudan STORNO fişine giriyor, fiş her zaman Almanca).
 * Geri okunurken TR arayüzde "İptal: Gast hat storniert" görünmemesi için etiket ayarlardaki
 * karşılığına eşlenir. Eşleşme yoksa (serbest metin) olduğu gibi kalır ve `isGerman` ile
 * işaretlenir — çağıran onu `lang="de"` ile sarar (büyük harf "İ" tuzağı, BUILD-PROMPT §6).
 */
export function localCancelReason(
  reason: string,
  reasons: CancelReason[],
  locale: Locale,
): { text: string; isGerman: boolean } {
  const hit = reasons.find((r) => r.de === reason);
  const local = hit && locale === 'tr' ? hit.tr : undefined;
  return local ? { text: local, isGerman: false } : { text: hit?.de ?? reason, isGerman: true };
}

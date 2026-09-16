import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { TONE_SOLID, type Tone } from '../../ui/tone';

/**
 * KDS rozet paleti — **opak**. Renk kaynağı yine tek: `ui/tone.ts`.
 *
 * Kapı 2. turu R1: `ui/Badge` yarı saydam `bg-<renk>/15` tint kullanıyor, yani altındaki zeminin
 * `--color-surface` olduğunu varsayıyor. Y6 ile KDS kartına iki YENİ opak zemin geldi
 * (`--color-surface-late`, `--color-surface-warn`) ve tint onların üzerinde inceldi:
 * "Kuyrukta" (info) 5,23 → 4,26 · hazır (altın) 5,46 → 4,34 — ikisi de AA'nın altı.
 * Bu, kendi `--color-surface-late` kararımda yazdığım "alfa üstüne alfa incelir" tuzağının
 * rozet tarafından tekrarı.
 *
 * Çözüm: KDS'de rozetin zemini her zaman opak `surface-2`. Zemin kartın tonundan bağımsız
 * olduğu için oran da bağımsız — `kitchenContrast.test.ts` rozet × kart-zemini
 * kombinasyonlarının tamamını 5,0 eşiğiyle ölçüyor.
 *
 * Ortak `ui/Badge.tsx` ve `ui/tone.ts` bu görevde DEĞİŞTİRİLMEDİ (garson tarafı tint rozetleri
 * kendi tek renkli `surface` zemininde kullanmaya devam ediyor ve orada 5,2–6,9:1).
 */
export const KDS_BADGE_CLASS: Record<Tone, string> = TONE_SOLID;

/** Geometri `ui/Badge` ile birebir aynıdır; değişen yalnız ton sınıfının opak olması. */
export function KdsBadge({
  tone = 'empty',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
        KDS_BADGE_CLASS[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

import { clsx } from 'clsx';
import { domAnimation, LazyMotion, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import type { ReactNode } from 'react';
import { TONE_SOLID, type Tone } from './tone';
import { toastMotion } from './toastMotion';

/**
 * Kısa onay mesajı. Odağı çalmaz.
 *
 * M5: canlı bölge (`role="status" aria-live="polite"`) mesajla birlikte doğmaz — her zaman
 * monte kalır, mesaj içine yazılır. Birçok ekran okuyucu, bölge duyuru anında yeni oluşursa
 * hiçbir şey seslendirmez. Bu yüzden `<Toast>` ekranda sürekli dururken `children` gelip gider.
 */
// M3 tasarım kapısı, devredilen bulgu (a): R81'de üst konum sayfa başlığının ALTINDAN başlıyordu
// (`--header-h` + 8 px = 80 px). O ofset toast'ın ALT kenarını panelin yuvarlak üst köşesine
// değdiriyordu: 390×844'te panel en fazla 85dvh, yani üst kenarı 126,6 px; toast 80 px'te başlayıp
// ~50 px yükseklikle 130 px'te bitiyordu. Toast panele ait bir öğe gibi görünüyordu.
//
// Başlık ofseti artık gerekmiyor: `top` konumu YALNIZ bir panel açıkken kullanılır (`ToastHost`),
// panelin scrim'i sayfa başlığını zaten karartır ve uygulama kökü `inert`'tir. Toast ekranın en
// üstüne çekildi; panelin üst kenarı en erken 15dvh'de başladığı için her ekran boyunda arada
// boşluk kalır (844 px'te ~69 px, 568 px'lik en küçük telefonda ~27 px). R81'in asıl kazanımı —
// baloncuğun OPAK bir yüzeye oturması (`TONE_SOLID`) — olduğu gibi duruyor.
const POSITION: Record<'bottom' | 'top', string> = {
  bottom: 'bottom-[calc(1rem+env(safe-area-inset-bottom))]',
  top: 'top-[calc(0.5rem+env(safe-area-inset-top))]',
};

export function Toast({
  tone = 'open',
  position = 'bottom',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  /** R73: bir panel açıkken üstte gösterilir, yoksa altta. */
  position?: 'bottom' | 'top';
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-position={position}
      className={clsx('pointer-events-none fixed inset-x-4 z-60', POSITION[position])}
    >
      {children ? (
        // R77: `LazyMotion` + `m.*` (tam `motion.*` değil) — mikro-animasyonun paket maliyetini
        // düşük tutar. `strict` tam sürümün kazara kullanılmasını derlemede değil çalışmada
        // yakalar, böylece ileride biri `motion.div` yazarsa fark edilir.
        <LazyMotion features={domAnimation} strict>
          <m.div
            data-testid="toast-bubble"
            {...toastMotion(!!reduced)}
            className={clsx(
              'flex items-center gap-2 rounded-card border px-4 py-3 text-base shadow-[var(--shadow-overlay)]',
              TONE_SOLID[tone],
              className,
            )}
          >
            {icon}
            {children}
          </m.div>
        </LazyMotion>
      ) : null}
    </div>
  );
}

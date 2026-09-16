import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { TONE_CLASS, type Tone } from './tone';

/**
 * Kısa onay mesajı. Odağı çalmaz.
 *
 * M5: canlı bölge (`role="status" aria-live="polite"`) mesajla birlikte doğmaz — her zaman
 * monte kalır, mesaj içine yazılır. Birçok ekran okuyucu, bölge duyuru anında yeni oluşursa
 * hiçbir şey seslendirmez. Bu yüzden `<Toast>` ekranda sürekli dururken `children` gelip gider.
 */
export function Toast({
  tone = 'open',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-60"
    >
      {children ? (
        <div
          className={clsx(
            'flex items-center gap-2 rounded-card border px-4 py-3 text-base shadow-[var(--shadow-overlay)]',
            TONE_CLASS[tone],
            className,
          )}
        >
          {icon}
          {children}
        </div>
      ) : null}
    </div>
  );
}

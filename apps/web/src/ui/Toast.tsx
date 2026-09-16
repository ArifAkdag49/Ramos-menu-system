import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { TONE_CLASS, type Tone } from './tone';

/** Kısa onay mesajı. Odağı çalmaz; ekran okuyucuya `aria-live="polite"` ile duyurulur. */
export function Toast({
  tone = 'open',
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
    <div
      aria-live="polite"
      className={clsx(
        'pointer-events-none fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-60',
        'flex items-center gap-2 rounded-card border px-4 py-3 text-base shadow-[var(--shadow-overlay)]',
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon}
      {children}
    </div>
  );
}

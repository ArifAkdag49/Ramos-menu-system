import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { TONE_CLASS, type Tone } from './tone';

/** Durum rozeti: renk tek başına anlam taşımaz, yanında ikon + yazı bulunur. */
export function Badge({
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
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

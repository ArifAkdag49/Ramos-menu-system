import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  /** Malzeme çıkarma (OHNE) durumu: üstü çizili, kırmızı. */
  removed?: boolean;
  icon?: ReactNode;
}

export function Chip({
  selected = false,
  removed = false,
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={clsx(
        'inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border px-4 text-base',
        'transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        removed
          ? 'border-danger text-danger-ink line-through'
          : selected
            ? 'border-lime bg-lime/15 text-lime'
            : 'border-border bg-surface-2 text-text',
        className,
      )}
      {...rest}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

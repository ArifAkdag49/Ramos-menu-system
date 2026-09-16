import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Zorunlu: yalnız ikonlu butonun erişilebilir adı. */
  label: string;
  icon: ReactNode;
}

/** Yalnız geri ve kapat gibi eylemlerde kullanılır (BUILD-PROMPT §10.3). */
export function IconButton({ label, icon, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex size-12 cursor-pointer items-center justify-center rounded-xl text-text',
        'transition-colors duration-150 ease-out hover:bg-surface-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}

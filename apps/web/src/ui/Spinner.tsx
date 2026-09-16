import { clsx } from 'clsx';

/** Yükleniyor göstergesi. `prefers-reduced-motion` açıkken dönmez (tokens.css). */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={clsx(
        'inline-block size-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  );
}

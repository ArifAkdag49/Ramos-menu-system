import { clsx } from 'clsx';

/**
 * Yükleniyor göstergesi. `prefers-reduced-motion` açıkken dönmez (tokens.css).
 *
 * M6: `label` verilmezse gösterge tamamen süstür — `role` vermez, `aria-hidden` olur.
 * (Eskiden ikisi birden vardı; `role="status"` ile `aria-hidden` çelişir.)
 * Etiket verilirse durum olarak duyurulur.
 */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  const decorative = !label;
  return (
    <span
      role={decorative ? undefined : 'status'}
      aria-label={label}
      aria-hidden={decorative || undefined}
      className={clsx(
        'inline-block size-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  );
}

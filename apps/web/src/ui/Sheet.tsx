import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './IconButton';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Alttan açılan panel. Odak kapanı vardır, `Esc` ile ve scrim'e dokununca kapanır.
 * Ayrıntı yeni sayfa açmaz; en fazla 2 seviye derinlik (BUILD-PROMPT §10.4).
 */
export function Sheet({
  open,
  onClose,
  title,
  closeLabel,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className="absolute inset-0 z-40 cursor-pointer bg-[var(--scrim)]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-50 max-h-[85dvh] w-full overflow-y-auto rounded-t-[var(--radius-sheet)] border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-overlay)]"
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <IconButton label={closeLabel} icon={<X aria-hidden size={22} />} onClick={onClose} />
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer ? <div className="sticky bottom-0 bg-surface px-4 pb-4">{footer}</div> : null}
      </div>
    </div>
  );
}

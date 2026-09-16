import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useOverlay } from '../lib/overlay';
import { IconButton } from './IconButton';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Görev 21: admin çekmecesi soldan açılır (masaüstünde sol menü olan yapı telefonda çekmeceye
 * iner — `adaptive-navigation`). Odak kapanı, `Esc`, scrim, `inert` ve kaydırma kilidi iki yönde
 * de aynıdır; değişen yalnız panelin yerleşimi.
 */
const SIDE_CONTAINER: Record<'bottom' | 'left', string> = {
  bottom: 'items-end',
  left: 'items-stretch justify-start',
};

const SIDE_PANEL: Record<'bottom' | 'left', string> = {
  bottom: 'max-h-[85dvh] w-full rounded-t-[var(--radius-sheet)] border-t pb-[env(safe-area-inset-bottom)]',
  left: 'h-dvh w-[min(20rem,85vw)] rounded-r-[var(--radius-sheet)] border-r pb-[env(safe-area-inset-bottom)]',
};

/**
 * Alttan açılan panel. Odak kapanı vardır, `Esc` ile ve scrim'e dokununca kapanır.
 * Ayrıntı yeni sayfa açmaz; en fazla 2 seviye derinlik (BUILD-PROMPT §10.4).
 *
 * M4: panel `document.body`'ye portal ile çizilir, açıkken uygulama kökü `inert` olur
 * (`aria-modal` tek başına arka planı ekran okuyucudan gizlemez) ve gövde kaydırması kilitlenir.
 * Scrim bir düğme değil, `aria-hidden` bir katmandır: erişilebilirlik ağacında "Kapat" adlı
 * ikinci bir düğme oluşturmasın diye. Klavyeyle kapatma yolu `Esc` ve başlıktaki kapat düğmesidir.
 */
export function Sheet({
  open,
  onClose,
  title,
  closeLabel,
  children,
  footer,
  busy = false,
  side = 'bottom',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  /** `bottom` alttan açılan panel (varsayılan), `left` soldan açılan çekmece. */
  side?: 'bottom' | 'left';
  /**
   * R74: panel bir işi beklerken (ör. mutfağa gönderim, ağ yeniden denemesiyle saniyelere
   * çıkabilir) üç kapanma yolu da kilitlenir — Esc, scrim ve kapat düğmesi. Yarıda çıkılabilseydi
   * geç gelen başarı, o sırada eklenen kalemleri de sepetten silerdi.
   */
  busy?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // `onClose` çoğu çağrı yerinde satır içi bir kapanış: her ebeveyn render'ında yeni bir
  // referans. Efekt yalnız `open`'a bağlı kalır, güncel kapanışı bu ref'ten okur — aksi
  // hâlde her ebeveyn render'ında `inert` yeniden uygulanır ve odak ilk elemana geri çalınır.
  // Ref, render gövdesinde değil kendi efektinde güncellenir (react-hooks/refs); bu efekt her
  // commit sonrası çalışır ve olay dinleyicisi tetiklenmeden önce ref güncel olur.
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    onCloseRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const appRoot = document.getElementById('root');
    const previousOverflow = document.body.style.overflow;

    appRoot?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    // R73: toast, panelin ana eylemini örtmesin diye açık panel sayısını bilmek zorunda.
    useOverlay.getState().push();
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!busyRef.current) onCloseRef.current();
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
      appRoot?.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      useOverlay.getState().pop();
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={clsx('fixed inset-0 z-50 flex', SIDE_CONTAINER[side])}>
      <div
        aria-hidden="true"
        data-testid="sheet-scrim"
        onClick={busy ? undefined : onClose}
        className="absolute inset-0 z-40 cursor-pointer bg-[var(--scrim)]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'relative z-50 overflow-y-auto border-border bg-surface shadow-[var(--shadow-overlay)]',
          SIDE_PANEL[side],
        )}
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <IconButton label={closeLabel} icon={<X aria-hidden size={22} />} disabled={busy} onClick={onClose} />
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer ? <div className="sticky bottom-0 bg-surface px-4 pb-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

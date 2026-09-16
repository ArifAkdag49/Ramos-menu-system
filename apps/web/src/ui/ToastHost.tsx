import { useOverlay } from '../lib/overlay';
import { useToast } from '../lib/toast';
import { Toast } from './Toast';

/**
 * Genel toast deposunu (`lib/toast.ts`) ekrana bağlar. Garson iskeleti ve sipariş girişi ayrı
 * ağaçlar olduğu için ikisi de bunu monte eder; mesaj depodan geldiğinden sayfa değişse bile
 * ("Mutfağa gönder" → masa detayı) kaybolmaz.
 *
 * `className` toast kartına gider: alt gezinmesi olan ekranlar `mb-*` ile onu sekmelerin
 * üstüne kaldırır (toast kabı ekranın altına sabitlidir, kart yükselince kap büyür).
 *
 * R73: bir `Sheet` açıkken toast **üstte** gösterilir. Toast kabı `z-60`, panel `z-50`; altta
 * kalsaydı panelin tek ana eylemini ("Mutfağa gönder", "Onayla ve gönder") ve masa kapatma
 * engelinin "ne yapmalı" satırını örterdi.
 */
export function ToastHost({ className }: { className?: string }) {
  const message = useToast((s) => s.message);
  const tone = useToast((s) => s.tone);
  const overlayOpen = useOverlay((s) => s.openSheets) > 0;
  return (
    <Toast tone={tone} position={overlayOpen ? 'top' : 'bottom'} className={className}>
      {message}
    </Toast>
  );
}

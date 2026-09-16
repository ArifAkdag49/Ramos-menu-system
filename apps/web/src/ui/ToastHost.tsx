import { useToast } from '../lib/toast';
import { Toast } from './Toast';

/**
 * Genel toast deposunu (`lib/toast.ts`) ekrana bağlar. Garson iskeleti ve sipariş girişi ayrı
 * ağaçlar olduğu için ikisi de bunu monte eder; mesaj depodan geldiğinden sayfa değişse bile
 * ("Mutfağa gönder" → masa detayı) kaybolmaz.
 *
 * `className` toast kartına gider: alt gezinmesi olan ekranlar `mb-*` ile onu sekmelerin
 * üstüne kaldırır (toast kabı ekranın altına sabitlidir, kart yükselince kap büyür).
 */
export function ToastHost({ className }: { className?: string }) {
  const message = useToast((s) => s.message);
  const tone = useToast((s) => s.tone);
  return (
    <Toast tone={tone} className={className}>
      {message}
    </Toast>
  );
}

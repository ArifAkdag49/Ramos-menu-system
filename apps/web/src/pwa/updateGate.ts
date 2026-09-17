import { hasCriticalWork } from '../lib/busy';
import { useOverlay } from '../lib/overlay';
import { queryClient } from '../lib/queryClient';

export interface UpdateGate {
  /** Sürmekte olan yazma isteği sayısı (sipariş gönderme, durum değiştirme…). */
  mutating: number;
  /** Bölünmemesi gereken iş: tablet istasyonunun baskı döngüsü. */
  criticalWork: boolean;
  /** Açık panel (`Sheet`) sayısı. */
  openSheets: number;
  /** Odakta bir yazı alanı var mı. */
  typing: boolean;
  /** Uygulama arka planda mı (sekme gizli, telefonda başka uygulama önde). */
  hidden: boolean;
}

/**
 * Sayfa şu an sessizce yenilenebilir mi? Yenileme veri kaybettirmez (sepet ve oturum cihazda
 * saklanır) ama yarıda kalan bir işi bölebilir — bu yüzden yazma isteği veya baskı sürerken
 * beklenir. Uygulama arka plandayken açık panel/yazı engel sayılmaz: kullanıcı uygulamaya
 * döndüğünde yeni sürüm çoktan yüklüdür, "Yeni sürüm hazır" şeridini görmez.
 */
export function canApplyUpdate(gate: UpdateGate): boolean {
  if (gate.mutating > 0 || gate.criticalWork) return false;
  if (gate.hidden) return true;
  return gate.openSheets === 0 && !gate.typing;
}

/**
 * Odaktaki alan *doluysa* kullanıcı yazıyor demektir. Boş alan engel değildir: giriş ekranı açılır
 * açılmaz PIN alanını odaklar, yoksa o ekranda yeni sürüm hiç devreye giremezdi.
 */
function isTyping(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
    return (el as HTMLInputElement | HTMLTextAreaElement).value !== '';
  return el.isContentEditable === true && (el.textContent ?? '') !== '';
}

export function readGate(): UpdateGate {
  const active = document.activeElement as HTMLElement | null;
  return {
    mutating: queryClient.isMutating(),
    criticalWork: hasCriticalWork(),
    openSheets: useOverlay.getState().openSheets,
    typing: isTyping(active),
    hidden: document.visibilityState === 'hidden',
  };
}

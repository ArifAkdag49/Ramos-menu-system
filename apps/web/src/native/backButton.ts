import { useOverlay } from '../lib/overlay';

/**
 * Android geri tuşu (yerel uygulama). Capacitor çekirdeği geri tuşunu ele almaz (bunu `@capacitor/app`
 * eklentisi yapar, o da kurulu değil); bu yüzden `MainActivity` geri tuşunda önce sayfaya sorar:
 * `window.__ramosBack()` → açık bir panel (`Sheet`) varsa kapatılır ve `true` döner (geri tuşu Esc
 * gibi davranır, altındaki sayfa yerinde kalır); `false` dönerse yerel taraf WebView geçmişinde bir
 * adım geri gider, geçmiş yoksa uygulamayı arka plana alır (kapatmaz — mutfak tabletindeki istasyon
 * ve oturum yerinde kalır).
 *
 * Tarayıcıda hiçbir şey yapmaz: yalnız çağrılmayan bir genel fonksiyon tanımlar.
 */
export const BACK_HANDLER_NAME = '__ramosBack';

export function setupBackButton(
  target: Window = window,
  closeTop: () => boolean = () => useOverlay.getState().closeTop(),
): void {
  (target as Window & { [BACK_HANDLER_NAME]?: () => boolean })[BACK_HANDLER_NAME] = () => {
    try {
      return closeTop() === true;
    } catch {
      // Sayfa tarafı ne olursa olsun yerel taraf kilitlenmesin: "ele alınmadı" → geçmişte geri.
      return false;
    }
  };
}

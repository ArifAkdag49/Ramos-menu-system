import { registerSW } from 'virtual:pwa-register';
import { canApplyUpdate, readGate } from './updateGate';
import { startUpdateScheduler } from './updateScheduler';
import { usePwaUpdate } from './updateStore';

/** Uzun açık kalan ekranlar (mutfak tableti, vardiya boyu garson telefonu) yeni sürümü de görsün. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Service worker kaydı (Görev 25). Yalnız üretim derlemesinde: geliştirme sunucusunda SW yoktur,
 * eski bir önbellek geliştirme sırasında yeni kodu gizlemesin.
 *
 * `registerType: 'prompt'`: yeni sürümü ne zaman devreye alacağımıza biz karar veririz
 * (`updateScheduler`). Ekran boşsa ya da uygulama arka plandaysa sessizce uygulanır; kullanıcı iş
 * başındaysa "Yeni sürüm hazır — Yenile" şeridi (`UpdatePrompt`) çıkar ve iş biter bitmez
 * kendiliğinden uygulanır. Böylece şerit her açılışta yeniden çıkmaz.
 *
 * `navigate`: bildirime dokunulduğunda SW açık pencereye `{ type: 'NAVIGATE', url }` gönderir;
 * sayfa yenilenmeden uygulama içinde o ekrana gidilir.
 */
export function setupServiceWorker(navigate: (path: string) => void): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator))
    return;

  let stopScheduler: (() => void) | null = null;
  const updateSW = registerSW({
    onNeedRefresh() {
      // Bekleme sırasında daha yeni bir sürüm çıkarsa tek zamanlayıcı kalsın.
      stopScheduler?.();
      stopScheduler = startUpdateScheduler({
        apply: () => void updateSW(true),
        safe: () => canApplyUpdate(readGate()),
        showPrompt: (applyNow) => usePwaUpdate.setState({ update: async () => applyNow() }),
      });
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        if (navigator.onLine) void registration.update().catch(() => {});
      }, UPDATE_CHECK_MS);
    },
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as { type?: unknown; url?: unknown } | null;
    if (data?.type !== 'NAVIGATE' || typeof data.url !== 'string') return;
    // Yalnız uygulama içi yol: SW zaten denetliyor, burada bir kez daha.
    if (data.url.startsWith('/') && !data.url.startsWith('//')) navigate(data.url);
  });
}

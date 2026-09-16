import { useEffect } from 'react';

/**
 * Ekranın kararmasını engeller. Tablet zaten elle "hiç uyuma" olarak ayarlanır (kurulum
 * kılavuzu) — bu bir iyileştirmedir, bağımlılık değil. API yoksa ya da izin verilmezse
 * sessizce hiçbir şey yapmaz; hiçbir durumda hata fırlatmaz (mutfak tableti orta hizmette
 * beyaz ekran vermemeli). `visibilitychange`'de yeniden istenir (BUILD-PROMPT §6 — sekme arka
 * plana alınıp geri gelince kilit otomatik düşer).
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        /* izin yok ya da desteklenmiyor — sessizce vazgeç */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, [enabled]);
}

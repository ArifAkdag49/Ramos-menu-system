import { create } from 'zustand';
import { disablePush, enablePush, pushState, type EnablePushResult, type PushState } from './push';

interface PushStore {
  /** `loading`: durum henüz okunmadı (ilk `refresh()` öncesi). */
  state: PushState | 'loading';
  busy: boolean;
  refresh(): Promise<void>;
  /** Yalnız dokunuştan çağır: izin isteği `enablePush()` içinde senkron başlar. */
  enable(): Promise<EnablePushResult>;
  disable(): Promise<void>;
}

/**
 * Bildirim durumu tek yerde: kurulum rehberi (garson iskeleti) ile Profil → Bildirimler aynı
 * anda ekranda olabilir; biri açınca öteki de aynı anda "açık" göstermeli.
 */
export const usePush = create<PushStore>()((set) => ({
  state: 'loading',
  busy: false,

  async refresh() {
    set({ state: await pushState() });
  },

  async enable() {
    // Önce çağır, sonra durumu yaz: izin isteği dokunuşla aynı görevde kalsın (iOS).
    const pending = enablePush();
    set({ busy: true });
    try {
      return await pending;
    } finally {
      set({ busy: false, state: await pushState() });
    }
  },

  async disable() {
    set({ busy: true });
    try {
      await disablePush();
    } finally {
      set({ busy: false, state: await pushState() });
    }
  },
}));

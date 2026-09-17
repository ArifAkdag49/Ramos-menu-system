import { create } from 'zustand';

/** Chromium'un `beforeinstallprompt` olayı (standart DOM tiplerinde yok). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallStore {
  /** Chrome "yüklenebilir" dediğinde saklanan olay; yalnız bir kez `prompt()` edilebilir. */
  event: BeforeInstallPromptEvent | null;
  /** Bu oturumda `appinstalled` görüldü. */
  installed: boolean;
  promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export const useInstallPrompt = create<InstallStore>()((set, get) => ({
  event: null,
  installed: false,

  async promptInstall() {
    const event = get().event;
    if (!event) return 'unavailable';
    set({ event: null });
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') set({ installed: true });
      return outcome;
    } catch {
      return 'unavailable';
    }
  },
}));

let listening = false;

/**
 * Olay sayfa açılır açılmaz gelebilir (garson henüz giriş ekranındayken) — bileşen monte
 * olduğunda kaçırılmasın diye `main.tsx`'te, React'ten önce dinlenir.
 */
export function listenForInstallPrompt(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    // Tarayıcının kendi mini bilgi çubuğu yerine rehberdeki düğme kullanılır.
    e.preventDefault();
    useInstallPrompt.setState({ event: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    useInstallPrompt.setState({ event: null, installed: true });
  });
}

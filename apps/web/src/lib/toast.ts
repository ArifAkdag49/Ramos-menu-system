import { create } from 'zustand';
import type { Tone } from '../ui/tone';

const VISIBLE_MS = 2500;

interface ToastState {
  message: string | null;
  tone: Tone;
  show: (message: string, tone?: Tone) => void;
  dismiss: () => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Uygulama geneli kısa onay mesajı. Ekran bileşenine değil depoya yazılır çünkü mesajı doğuran
 * eylem çoğu zaman **sayfayı değiştirir**: "Mutfağa gönderildi · #047" sipariş girişinde tetiklenir
 * ama masa detayında okunur. Yerel `useState` o anda sökülen ağaçla birlikte kaybolurdu.
 *
 * Zamanlayıcı tek: yeni mesaj öncekini iptal eder, elle kapatma da iptal eder — böylece bekleyen
 * eski bir sayaç yeni mesajı erkenden silemez.
 */
export const useToast = create<ToastState>()((set) => ({
  message: null,
  tone: 'open',

  show: (message, tone = 'open') => {
    clearTimeout(timer);
    set({ message, tone });
    timer = setTimeout(() => set({ message: null }), VISIBLE_MS);
  },

  dismiss: () => {
    clearTimeout(timer);
    set({ message: null });
  },
}));

/** Bileşen dışından (olay işleyicisi, mutasyon geri çağrısı) çağrılan kısayol. */
export const toast = (message: string, tone?: Tone): void => useToast.getState().show(message, tone);

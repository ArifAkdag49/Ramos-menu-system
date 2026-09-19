import { create } from 'zustand';

type Closer = () => void;

interface OverlayState {
  openSheets: number;
  /** Açık panellerin kapatıcıları, açılış sırasıyla (sonuncusu en üstteki panel). */
  closers: Closer[];
  push: (close?: Closer) => void;
  pop: (close?: Closer) => void;
  /**
   * En üstteki paneli kapatır; açık panel varsa `true` (Android geri tuşu: panel açıkken geri tuşu
   * sayfayı değil paneli kapatır — `native/backButton`). Panel meşgulse kapatıcı kendi içinde
   * kapatmayı reddeder ama yine `true` döner: geri tuşu da Esc gibi kilitli kalır (R74).
   */
  closeTop: () => boolean;
}

/**
 * Açık `Sheet` sayısı — tek gerçeklik kaynağı. `Sheet` açılırken artırır, kapanırken azaltır;
 * `ToastHost` buna bakıp toast'ı panelin üstünden kaçırır (R73), `pwa/updateGate` panel açıkken
 * sürüm güncellemesini erteler.
 */
export const useOverlay = create<OverlayState>()((set, get) => ({
  openSheets: 0,
  closers: [],
  push: (close) => {
    const closers = close ? [...get().closers, close] : get().closers;
    set((s) => ({ openSheets: s.openSheets + 1, closers }));
  },
  pop: (close) => {
    const closers = close ? get().closers.filter((c) => c !== close) : get().closers;
    set((s) => ({ openSheets: Math.max(0, s.openSheets - 1), closers }));
  },
  closeTop: () => {
    const top = get().closers.at(-1);
    if (!top) return false;
    top();
    return true;
  },
}));

import { create } from 'zustand';

interface OverlayState {
  openSheets: number;
  push: () => void;
  pop: () => void;
}

/**
 * Açık `Sheet` sayısı — tek gerçeklik kaynağı. `Sheet` açılırken artırır, kapanırken azaltır;
 * `ToastHost` buna bakıp toast'ı panelin üstünden kaçırır (R73).
 */
export const useOverlay = create<OverlayState>()((set) => ({
  openSheets: 0,
  push: () => set((s) => ({ openSheets: s.openSheets + 1 })),
  pop: () => set((s) => ({ openSheets: Math.max(0, s.openSheets - 1) })),
}));

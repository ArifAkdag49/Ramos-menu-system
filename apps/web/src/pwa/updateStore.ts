import { create } from 'zustand';

interface UpdateStore {
  /** Bekleyen yeni sürümü etkinleştirip sayfayı yeniler; `null` = yeni sürüm yok. */
  update: (() => Promise<void>) | null;
  dismiss(): void;
}

/**
 * Ayrı modül: `registerSW.ts` `virtual:pwa-register`'ı içe aktarır ve o sanal modül yalnız Vite
 * derlemesinde vardır. Şerit bileşeni ve testleri yalnız bu depoyu görür.
 */
export const usePwaUpdate = create<UpdateStore>()((set) => ({
  update: null,
  dismiss: () => set({ update: null }),
}));

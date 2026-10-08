import type { QueryKey } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import {
  removeOldestQuery,
  type PersistQueryClientOptions,
} from '@tanstack/react-query-persist-client';
import { PERSIST_MAX_AGE_MS, queryClient } from './queryClient';

/**
 * R94 — son bilinen veriyi anında çizmek. Restoran Wi-Fi'sinde Supabase'e 10 sn'lik zaman
 * aşımları ölçtük; o süre boyunca masa ızgarası ve menü boş iskelet gösteriyordu. Sorgu önbelleği
 * `localStorage`'a yazılır, uygulama yeniden açılınca ekran eski veriyle **hemen** çizilir ve
 * tazeleme arkada çalışır (TanStack'in resmî `persistQueryClient` kuralları).
 */

/** Önbellek anahtarı; `ramos-` öneki uygulamanın diğer depo anahtarlarıyla aynı aileden. */
export const CACHE_STORAGE_KEY = 'ramos-query-cache';

/** Önbelleğin SAHİBİ (`auth.users.id`). Başka bir garson giriş yaparsa önbellek atılır. */
export const OWNER_STORAGE_KEY = 'ramos-query-owner';

/**
 * Diske yazılan sorgular — anahtar ÖN EKİ ile. Yalnız "eskimesi görünür ya da zararsız" olan,
 * nadiren değişen okumalar:
 * - `menu`: kategoriler, ürünler ve yönetim menü listeleri (gün içinde neredeyse hiç değişmez),
 * - `tables`: `table_overview` — garsonun açık masa/sipariş özeti. Eskimesi GÖRÜNÜR:
 *   `TablesPage` tazeleme sürerken "Tazeleniyor" satırını gösterir, `ConnectionBanners` da
 *   bağlantı kopukluğunu zaten söylüyor.
 * - `settings`, `staff/admin`: ayarlar ve personel listesi.
 *
 * Bilinçli olarak DIŞARIDA bırakılanlar:
 * - `orders` (mutfak, hazır, oturum siparişleri): eskimiş bir "HAZIR" listesi garsonu yanlış
 *   masaya yürütür, `useReadyOrdersQuery().isSuccess` ile sürülen uygulama içi uyarı da diskten
 *   gelen veriyle **yanlışlıkla çalardı** (Görev 26).
 * - `printer-status`: eskimiş "yazıcı iyi" bilgisi basılmayan fişi gizler.
 * - `bill`, `report`, `audit`, `public-menu`: para/denetim çıktısı ve müşteri menüsü — ya taze
 *   olmalı ya hiç gösterilmemeli.
 * - `staff` (tek parçalı, `qk.staff`): değeri bir `Map`; JSON'a yazılıp düz nesne olarak geri
 *   gelirse `staffNames.get(...)` çağıran her ekran patlar. Personel listesi `staff/admin`
 *   anahtarından geliyor, o düz dizi.
 */
export const PERSISTED_KEY_PREFIXES: QueryKey[] = [
  ['menu'],
  ['tables'],
  ['settings'],
  ['staff', 'admin'],
];

/** Anahtar, izin verilen ön eklerden birinin altında mı. */
export function isPersistedKey(key: QueryKey): boolean {
  return PERSISTED_KEY_PREFIXES.some((prefix) => prefix.every((part, i) => key[i] === part));
}

const storage = typeof window === 'undefined' ? undefined : window.localStorage;

const read = (key: string): string | null => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const write = (key: string, value: string) => {
  try {
    storage?.setItem(key, value);
  } catch {
    // Özel sekme / dolu depo: kalıcılık bir konfordur, uygulamayı durdurmaz.
  }
};

const forget = (key: string) => {
  try {
    storage?.removeItem(key);
  } catch {
    // Yukarıdaki ile aynı gerekçe.
  }
};

export const persister = createSyncStoragePersister({
  key: CACHE_STORAGE_KEY,
  storage,
  // Ucuz telefonda her önbellek değişiminde JSON üretmek takılmaya yol açıyor; iki saniyede bir yeter.
  throttleTime: 2000,
  // Depo kotası dolduğunda yazım tümden başarısız olmasın: en eski sorgu atılıp yeniden denenir.
  retry: removeOldestQuery,
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: PERSIST_MAX_AGE_MS,
  // Derleme kimliği (`vite.config.ts` → `define`): yeni sürüm eski veri şeklini hiç okumaz.
  buster: __RAMOS_BUILD_ID__,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' && isPersistedKey(query.queryKey),
  },
};

/**
 * Önbelleği hem bellekten hem diskten siler. Çıkışta çağrılır: aynı telefonu kullanan **başka**
 * bir garson, öncekinin masalarını, ayarlarını ya da personel listesini bir an bile görmemeli.
 */
export function clearPersistedQueries(): void {
  queryClient.clear();
  void persister.removeClient();
  forget(OWNER_STORAGE_KEY);
}

/**
 * Önbelleği `userId` adına kaydeder. Diskteki önbellek başka bir kullanıcıya aitse (hesap
 * değişmiş) önce silinir — bu yüzden açılışta, geri yükleme BAŞLAMADAN önce çağrılır
 * (`App` yalnız oturum çözüldükten sonra `PersistQueryClientProvider`'ı çizer).
 */
export function claimPersistedQueries(userId: string | null | undefined): void {
  if (!userId) {
    clearPersistedQueries();
    return;
  }
  if (read(OWNER_STORAGE_KEY) === userId) return;
  clearPersistedQueries();
  write(OWNER_STORAGE_KEY, userId);
}

import { QueryClient } from '@tanstack/react-query';

/**
 * Kalıcı önbelleğin ömrü (`lib/queryPersist.ts` `maxAge`). Bellekteki `gcTime` de buna eşittir:
 * daha kısa olursa ekrandan çıkılan bir sorgu (ör. menü, `OrderPage` kapanınca) beşinci dakikada
 * bellekten düşer, bir sonraki kayıt da onu diskten siler — yani "yeniden açılışta anında çizilsin"
 * amacı sessizce bozulurdu.
 */
export const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: PERSIST_MAX_AGE_MS,
      // R94 — restoran Wi-Fi'si kopuk olduğunda tek deneme + kısa bekleme: `lib/timeoutFetch.ts`
      // isteği 6 sn'de kestiği için en kötü durum ~13 sn ile sınırlı. Daha uzun bekleme ekranı
      // "yükleniyor"da tutar; başarısız tazeleme eldeki veriyi SİLMEZ (TanStack `data`'yı korur),
      // ekran son bilinen hâlini göstermeye devam eder.
      retry: 1,
      retryDelay: 1000,
      refetchOnWindowFocus: true,
    },
    mutations: {
      // Yazmalar otomatik tekrar denenmez: istemci tarafındaki bir kesilme sunucudaki işlemi geri
      // almaz, körlemesine tekrar "iki fiş / iki iptal" demek olabilir. Siparişin tekrarı
      // `features/waiter/submitOrder.ts` içinde, AYNI `order_id` ile (sunucu idempotent, R36).
      retry: 0,
    },
  },
});

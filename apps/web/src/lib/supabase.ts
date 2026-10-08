import type { Database } from '@ramos/shared';
import { createClient } from '@supabase/supabase-js';
import { createTimeoutFetch } from './timeoutFetch';

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ramos-auth' },
    // R94 — her HTTP isteğinin sert zaman aşımı (`lib/timeoutFetch.ts`). Cevapsız asılı kalan bir
    // istek ekranı dakikalarca "yükleniyor"da tutuyordu; artık 6 sn'de ağ hatası olur, eldeki
    // önbellekli veri ekranda kalır. (Realtime WebSocket üzerinden gider, bundan etkilenmez.)
    global: { fetch: createTimeoutFetch() },
    realtime: {
      // jsdom'da `Worker` yok; gerçek tarayıcıda true, testte otomatik false.
      worker: typeof Worker !== 'undefined',
      heartbeatCallback: (status: string) => {
        if (status === 'disconnected') supabase.realtime.connect();
      },
    },
  },
);

// M8: bu dinleyici uygulama ömrü boyunca açık kalır ve sökülmez — istemci tekil, sayfa tek.
// Yaptığı tek iş Realtime'ın jetonunu tazelemek; yetki kararı vermez (o RLS'in işi, spec §12).
supabase.auth.onAuthStateChange((_event, session) => {
  void supabase.realtime.setAuth(session?.access_token ?? null);
});

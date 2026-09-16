import type { Database } from '@ramos/shared';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ramos-auth' },
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

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

supabase.auth.onAuthStateChange((_event, session) => {
  void supabase.realtime.setAuth(session?.access_token ?? null);
});

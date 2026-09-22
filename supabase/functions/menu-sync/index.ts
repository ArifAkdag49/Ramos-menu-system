// menu-sync — ikinci sistemin (arx-panel QR menüsü) Ramo's menüsüyle iki yönlü eşitlendiği uç nokta.
// Çağıran: karşı tarafın sunucusu, başlık `x-sync-token: <anahtar>` (create_menu_sync_client, 0016).
// verify_jwt KAPALI (karşı taraf kullanıcı oturumu taşımaz); kimlik anahtarın sha256 özetiyle doğrulanır.
// Deno çalışma zamanı; kök ESLint yapılandırması supabase/functions/** klasörünü yoksayar.
//
// Yayın: `npm run fn:deploy -- menu-sync --no-verify-jwt`. Sözleşme: logic.ts başı.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleSyncRequest, type PullResult, type PushResult } from './logic.ts';

const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve((req) =>
  handleSyncRequest(req, {
    async pull(tokenHash, since, limit) {
      const { data, error } = await service.rpc('menu_sync_pull', {
        p_token_hash: tokenHash,
        p_since: since,
        p_limit: limit,
      });
      if (error) throw new Error(`menu_sync_pull: ${error.code}`);
      return data as PullResult;
    },
    async push(tokenHash, items) {
      const { data, error } = await service.rpc('menu_sync_push', { p_token_hash: tokenHash, p_items: items });
      if (error) throw new Error(`menu_sync_push: ${error.code}`);
      return data as PushResult;
    },
    async touch(tokenHash, err) {
      const { data, error } = await service.rpc('menu_sync_touch', { p_token_hash: tokenHash, p_error: err });
      if (error) throw new Error(`menu_sync_touch: ${error.code}`);
      return data as string;
    },
    // Anahtar, özeti ve menü içeriği asla loglanmaz; yalnız sayaçlar, kimlikler ve hata kodları.
    log(level, message, data) {
      console[level](message, data ? JSON.stringify(data) : '');
    },
  }),
);

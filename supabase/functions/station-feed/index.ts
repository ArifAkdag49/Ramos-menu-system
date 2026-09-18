// station-feed — yerel Android uygulamasının arka plan yazıcı servisi (uygulama kapalı / ekran kararmışken)
// fişleri buradan çeker: iş sahiplenilir, sunucuda ESC/POS baytlarına çevrilir ve base64 döner.
// Çağıran: cihazdaki ön plan servisi, başlık `x-station-token: <anahtar>` (register_station_device, 0015).
// verify_jwt KAPALI (servis kullanıcı oturumu taşımaz); kimlik anahtarın sha256 özetiyle doğrulanır.
// Deno çalışma zamanı; kök ESLint yapılandırması supabase/functions/** klasörünü yoksayar.
//
// Yayın: `npm run fn:deploy -- station-feed --no-verify-jwt`. Deploy betiği önce scripts/build-epson-sdp.mjs
// ile render.bundle.js'i üretir (fiş kodu epson-sdp ve depodaki ajanla ortak). Sözleşme: logic.ts başı.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleFeedRequest, type ClaimResult } from './logic.ts';
// @ts-types yok: paket esbuild çıktısıdır (epson-sdp/render.ts'in tek dosyalık hâli).
import { renderEscpos } from './render.bundle.js';

const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve((req) =>
  handleFeedRequest(req, {
    async claim(tokenHash) {
      const { data, error } = await service.rpc('station_feed_claim', { p_token_hash: tokenHash });
      if (error) throw new Error(`station_feed_claim: ${error.code}`);
      return data as ClaimResult;
    },
    async complete(tokenHash, jobId, ok, err) {
      const { data, error } = await service.rpc('station_feed_complete', {
        p_token_hash: tokenHash,
        p_job_id: jobId,
        p_ok: ok,
        p_error: err,
      });
      if (error) throw new Error(`station_feed_complete: ${error.code}`);
      return data as string;
    },
    async heartbeat(tokenHash, hb) {
      const { data, error } = await service.rpc('station_feed_heartbeat', {
        p_token_hash: tokenHash,
        p_version: hb.version,
        p_reachable: hb.reachable,
        p_state: hb.state,
        p_error: hb.error,
      });
      if (error) throw new Error(`station_feed_heartbeat: ${error.code}`);
      return data as string;
    },
    render: renderEscpos,
    // Anahtar, özeti ve fiş içeriği asla loglanmaz; yalnız iş kimlikleri ve hata kodları.
    log(level, message, data) {
      console[level](message, data ? JSON.stringify(data) : '');
    },
  }),
);

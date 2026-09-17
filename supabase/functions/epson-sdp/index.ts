// epson-sdp — Epson Server Direct Print uç noktası: yazıcı (ör. TM-m30III) fişleri bilgisayarsız çeker.
// Çağıran: yazıcının kendisi (Web Config → Server Direct Print → URL: …/functions/v1/epson-sdp?t=<anahtar>).
// verify_jwt KAPALI (yazıcı JWT gönderemez); kimlik URL'deki anahtarın sha256 özetiyle doğrulanır.
// Deno çalışma zamanı; kök ESLint yapılandırması supabase/functions/** klasörünü yoksayar.
//
// Yayın: `npm run fn:deploy -- epson-sdp --no-verify-jwt`. Deploy betiği önce scripts/build-epson-sdp.mjs
// ile render.bundle.js'i üretir (fiş kodu depodaki ajanla ortak). Protokol: docs/epson-server-direct-print.md.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleSdpRequest, type ClaimResult } from './logic.ts';
// @ts-types yok: paket esbuild çıktısıdır (render.ts'in tek dosyalık hâli).
import { renderEscpos } from './render.bundle.js';

const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve((req) =>
  handleSdpRequest(req, {
    async claimNext(tokenHash) {
      const { data, error } = await service.rpc('sdp_claim_next', { p_token_hash: tokenHash });
      if (error) throw new Error(`sdp_claim_next: ${error.code} ${error.message}`);
      return data as ClaimResult;
    },
    async complete(tokenHash, jobId, success, err) {
      const { data, error } = await service.rpc('sdp_complete', {
        p_token_hash: tokenHash,
        p_job_id: jobId,
        p_success: success,
        p_error: err,
      });
      if (error) throw new Error(`sdp_complete: ${error.code} ${error.message}`);
      return data as string;
    },
    render: renderEscpos,
    // Anahtar ve fiş içeriği asla loglanmaz; yalnız iş kimlikleri ve hata kodları.
    log(level, message, data) {
      console[level](message, data ? JSON.stringify(data) : '');
    },
  }),
);

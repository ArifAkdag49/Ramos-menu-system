// notify-ready — sipariş "hazır" olunca mesaideki garson/admin telefonlarına Web Push gönderir.
// Çağıran: internal.notify_ready() trigger'ı (pg_net). verify_jwt KAPALI; kimlik x-webhook-secret ile doğrulanır.
// Deno çalışma zamanı; kök ESLint yapılandırması supabase/functions/** klasörünü yoksayar.
//
// Kütüphane: jsr:@negrel/webpush — RFC 8291 (aes128gcm) + RFC 8292 (VAPID), yalnız Web Crypto kullanır.
// Secrets: VAPID_PUBLIC_JWK, VAPID_PRIVATE_JWK, VAPID_SUBJECT, WEBHOOK_SECRET (scripts/setup-push.mjs yazar).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import {
  buildNotification,
  normalizeLocale,
  pushOutcome,
  verifyWebhookSecret,
  type PushTarget,
  type ReadyOrder,
} from './logic.ts';

const TTL_SECONDS = 300; // 5 dk sonra "hazır" bildirimi anlamını yitirir
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// VAPID anahtarları soğuk başlangıçta bir kez içe aktarılır; hata olursa sonraki istek yeniden dener.
let vapidKeys: Promise<CryptoKeyPair> | null = null;
function loadVapidKeys(): Promise<CryptoKeyPair> {
  vapidKeys ??= webpush
    .importVapidKeys({
      publicKey: JSON.parse(Deno.env.get('VAPID_PUBLIC_JWK') ?? ''),
      privateKey: JSON.parse(Deno.env.get('VAPID_PRIVATE_JWK') ?? ''),
    })
    .catch((e) => {
      vapidKeys = null;
      throw e;
    });
  return vapidKeys;
}

type Outcome = { id: string; result: 'ok' | 'gone' | 'failed' };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!verifyWebhookSecret(req.headers.get('x-webhook-secret'), Deno.env.get('WEBHOOK_SECRET'))) {
    return json(401, { error: 'unauthorized' });
  }

  let orderId: unknown;
  try {
    orderId = (await req.json())?.order_id;
  } catch {
    return json(400, { error: 'invalid_request' });
  }
  if (typeof orderId !== 'string' || !UUID.test(orderId)) return json(400, { error: 'invalid_request' });

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data, error } = await service.rpc('ready_push_targets', { p_order_id: orderId });
  if (error) {
    console.error('ready_push_targets', error.code, error.message);
    return json(500, { error: 'targets_failed' });
  }
  const { order, targets } = data as { order: ReadyOrder | null; targets: PushTarget[] };
  if (!order || targets.length === 0) return json(200, { sent: 0, removed: 0 });

  let appServer: webpush.ApplicationServer;
  try {
    appServer = await webpush.ApplicationServer.new({
      contactInformation: Deno.env.get('VAPID_SUBJECT') ?? '',
      vapidKeys: await loadVapidKeys(),
    });
  } catch (e) {
    console.error('vapid_not_configured', e instanceof Error ? e.message : String(e));
    return json(500, { error: 'vapid_not_configured' });
  }

  const outcomes: Outcome[] = await Promise.all(
    targets.map(async (t): Promise<Outcome> => {
      const message = JSON.stringify(buildNotification(order, normalizeLocale(t.locale)));
      try {
        await appServer
          .subscribe({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } })
          .pushTextMessage(message, { ttl: TTL_SECONDS, urgency: webpush.Urgency.High });
        return { id: t.id, result: 'ok' };
      } catch (e) {
        if (e instanceof webpush.PushMessageError) {
          const status = e.response.status;
          await e.response.body?.cancel();
          const result = pushOutcome(status);
          if (result !== 'gone') console.warn('push_failed', t.id, status);
          return { id: t.id, result };
        }
        // Ağ hatası, bozuk anahtar vb.: geçici say, aboneliği silme.
        console.warn('push_error', t.id, e instanceof Error ? e.message : String(e));
        return { id: t.id, result: 'failed' };
      }
    }),
  );

  const okIds = outcomes.filter((o) => o.result === 'ok').map((o) => o.id);
  const goneIds = outcomes.filter((o) => o.result === 'gone').map((o) => o.id);
  if (goneIds.length > 0) {
    const { error: delError } = await service.from('push_subscriptions').delete().in('id', goneIds);
    if (delError) console.error('delete_gone', delError.message);
  }
  if (okIds.length > 0) {
    const { error: updError } = await service
      .from('push_subscriptions')
      .update({ last_success_at: new Date().toISOString() })
      .in('id', okIds);
    if (updError) console.error('last_success_at', updError.message);
  }
  return json(200, { sent: okIds.length, removed: goneIds.length });
});

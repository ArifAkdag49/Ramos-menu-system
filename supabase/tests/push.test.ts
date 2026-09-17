import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupFixtureOrders, ensureFixtures, hideFixtures, type Fixtures } from './helpers/fixtures';
import { sql } from './helpers/sql';
import { anonClient, clientFor, ensureTestUsers, serviceClient } from './helpers/users';

// "Hazır" push hattı (Görev 26): ready_push_targets → notify-ready Edge Function → pg_net trigger.
// Sahte abonelikler yalnız test kullanıcılarına bağlanır ve koşu sonunda silinir.

type Target = { id: string; kind: 'webpush' | 'fcm'; endpoint: string; p256dh: string | null; auth: string | null; locale: string };
type Targets = {
  order: { id: string; order_no: number; table: string; items: { qty: number; code: string | null; name: string }[] } | null;
  targets: Target[];
};

const FAKE = 'https://push.invalid/';
let ids: Awaited<ReturnType<typeof ensureTestUsers>>;
let f: Fixtures;
let waiter: SupabaseClient, kitchen: SupabaseClient;

const fnUrl = () => `${process.env.SUPABASE_URL}/functions/v1/notify-ready`;
const callFn = async (body: unknown, headers: Record<string, string> = {}, method = 'POST') => {
  const res = await fetch(fnUrl(), {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
};
const secretHeader = () => ({ 'x-webhook-secret': process.env.WEBHOOK_SECRET ?? '' });

/** Mesaideki gerçek (test olmayan) personelin aboneliği varsa uçtan uca testler gerçek telefona bildirim atar. */
const realOnDutySubscriptions = async () =>
  (await sql<{ n: number }>(`
    select count(*)::int as n from public.push_subscriptions ps join public.profiles p on p.id = ps.user_id
    where p.username not like 'test-%' and p.is_active and p.role in ('waiter', 'admin')
      and public.is_on_duty(p.on_duty_since)`))[0]!.n;

/** Geçerli biçimde bir tarayıcı aboneliği anahtarı (P-256 public key + 16 bayt auth). */
async function fakeBrowserKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const raw = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
  return { p256dh: raw, auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url') };
}

async function submit(items: Record<string, unknown>[]) {
  const id = crypto.randomUUID();
  const { data, error } = await waiter.rpc('submit_order', { p_order_id: id, p_table_id: f.tableId, p_items: items });
  if (error) throw error;
  return data as { order_id: string; order_no: number };
}

const removeFakeSubscriptions = () =>
  sql(`delete from public.push_subscriptions
       where endpoint like '${FAKE}%' or endpoint like '%/functions/v1/push-test-gone%'`);

beforeAll(async () => {
  ids = await ensureTestUsers();
  f = await ensureFixtures();
  await cleanupFixtureOrders();
  await removeFakeSubscriptions();
  [waiter, kitchen] = await Promise.all([clientFor('waiter'), clientFor('kitchen')]);
});
afterAll(async () => {
  await removeFakeSubscriptions();
  await sql(`update public.profiles set on_duty_since = null where username like 'test-%'`);
  await cleanupFixtureOrders();
  await hideFixtures();
});

describe('ready push hattı', () => {
  it('ready_push_targets yalnız service_role çağırabilir', async () => {
    for (const who of ['waiter', 'admin'] as const) {
      const c = await clientFor(who);
      const { error } = await c.rpc('ready_push_targets', { p_order_id: crypto.randomUUID() });
      expect(error?.code, who).toBe('42501');
    }
    const { error: anonError } = await anonClient().rpc('ready_push_targets', { p_order_id: crypto.randomUUID() });
    expect(anonError?.code).toBe('42501');

    const [priv] = await sql<Record<string, boolean>>(`
      select has_function_privilege('authenticated', 'public.ready_push_targets(uuid)', 'execute') as authenticated,
             has_function_privilege('anon', 'public.ready_push_targets(uuid)', 'execute') as anon,
             has_function_privilege('service_role', 'public.ready_push_targets(uuid)', 'execute') as service_role,
             has_function_privilege('authenticated', 'internal.notify_ready()', 'execute') as trigger_fn`);
    expect(priv).toEqual({ authenticated: false, anon: false, service_role: true, trigger_fn: false });
  });

  it('trigger yalnız ready geçişinde çalışır', async () => {
    const [t] = await sql<{ def: string }>(
      `select pg_get_triggerdef(oid) as def from pg_trigger where tgname = 'orders_notify_ready'`);
    expect(t!.def).toMatch(/AFTER UPDATE OF status ON public\.orders/);
    expect(t!.def).toMatch(/new\.status = 'ready'/);
    expect(t!.def).toMatch(/old\.status IS DISTINCT FROM 'ready'/);
  });

  it('yalnız mesaideki aktif garson/admin abonelikleri hedeflenir', async () => {
    await sql(`
      update public.profiles set on_duty_since = now()
        where id in ('${ids.waiter}', '${ids.admin}', '${ids.kitchen}', '${ids.inactive}');
      update public.profiles set on_duty_since = public.current_business_day_start() - interval '1 minute'
        where id = '${ids.waiter2}';
      update public.profiles set locale = 'de' where id = '${ids.admin}';
      insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
        ('${ids.waiter}',   '${FAKE}waiter',   'k', 'a'),
        ('${ids.admin}',    '${FAKE}admin',    'k', 'a'),
        ('${ids.waiter2}',  '${FAKE}stale',    'k', 'a'),
        ('${ids.kitchen}',  '${FAKE}kitchen',  'k', 'a'),
        ('${ids.inactive}', '${FAKE}inactive', 'k', 'a')
      on conflict (endpoint) do nothing;`);
    try {
      const { data, error } = await serviceClient().rpc('ready_push_targets', { p_order_id: crypto.randomUUID() });
      expect(error).toBeNull();
      const r = data as Targets;
      expect(r.order).toBeNull();
      const mine = r.targets.filter((t) => t.endpoint.startsWith(FAKE));
      expect(mine.map((t) => t.endpoint).sort()).toEqual([`${FAKE}admin`, `${FAKE}waiter`]);
      expect(mine.find((t) => t.endpoint === `${FAKE}admin`))
        .toMatchObject({ kind: 'webpush', p256dh: 'k', auth: 'a', locale: 'de' });
    } finally {
      await sql(`update public.profiles set locale = 'tr' where id = '${ids.admin}'`);
    }
  });

  it('save_fcm_token: FCM jetonu kind=fcm kaydedilir, cihaz el değiştirince yeniden atanır, silinebilir (0013)', async () => {
    const token = `${FAKE}fcm-${crypto.randomUUID()}`;
    expect((await waiter.rpc('save_fcm_token', { p_token: token, p_ua: 'Ramos Android' })).error).toBeNull();
    const row = async () => (await sql<{ user_id: string; kind: string; p256dh: string | null; auth: string | null; user_agent: string }>(
      `select user_id, kind, p256dh, auth, user_agent from public.push_subscriptions where endpoint = '${token}'`))[0];
    expect(await row()).toEqual({ user_id: ids.waiter, kind: 'fcm', p256dh: null, auth: null, user_agent: 'Ramos Android' });

    // Aynı tablette mutfak hesabıyla giriş: jeton ona geçer (tekrar kayıt çakışmaz).
    expect((await kitchen.rpc('save_fcm_token', { p_token: token, p_ua: 'Ramos Android 2' })).error).toBeNull();
    expect(await row()).toMatchObject({ user_id: ids.kitchen, kind: 'fcm' });

    for (const bad of ['', '   ']) {
      expect((await waiter.rpc('save_fcm_token', { p_token: bad, p_ua: null })).error?.message).toBe('fcm_token_invalid');
    }
    const printer = await clientFor('printer');
    expect((await printer.rpc('save_fcm_token', { p_token: `${FAKE}fcm-x`, p_ua: null })).error?.message)
      .toBe('not_authorized');

    // Web Push aboneliği anahtarsız olamaz; FCM satırı olabilir.
    await expect(sql(`insert into public.push_subscriptions (user_id, endpoint) values ('${ids.waiter}', '${FAKE}nokeys')`))
      .rejects.toThrow(/push_subscriptions_webpush_keys_check/);
    await expect(sql(`insert into public.push_subscriptions (user_id, endpoint, kind) values ('${ids.waiter}', '${FAKE}k', 'apns')`))
      .rejects.toThrow(/push_subscriptions_kind_check/);

    expect((await kitchen.rpc('delete_push_subscription', { p_endpoint: token })).error).toBeNull();
    expect(await row()).toBeUndefined();
  });

  it('ready_push_targets FCM hedeflerini kind=fcm ile döner (anahtarlar null)', async () => {
    const token = `${FAKE}fcm-target-${crypto.randomUUID()}`;
    await sql(`update public.profiles set on_duty_since = now() where id = '${ids.waiter}'`);
    expect((await waiter.rpc('save_fcm_token', { p_token: token, p_ua: 'Ramos Android' })).error).toBeNull();
    const { data, error } = await serviceClient().rpc('ready_push_targets', { p_order_id: crypto.randomUUID() });
    expect(error).toBeNull();
    await sql(`delete from public.push_subscriptions where endpoint = '${token}'`);
    expect((data as Targets).targets.find((t) => t.endpoint === token))
      .toMatchObject({ kind: 'fcm', p256dh: null, auth: null, locale: expect.any(String) });
  });

  it('sipariş bilgisi: masa, numara, yalnız aktif kalemler (içecekler sonda)', async () => {
    const o = await submit([{ product_id: f.colaId, quantity: 2 }, { product_id: f.doenerId, variant_id: f.variantH,
      quantity: 1, option_ids: [f.sauceA], removed_ingredient_ids: [] }]);
    const { data } = await serviceClient().rpc('ready_push_targets', { p_order_id: o.order_id });
    expect((data as Targets).order).toEqual({
      id: o.order_id, order_no: o.order_no, table: 'Test-Tisch',
      items: [{ qty: 1, code: 'T05', name: 'Test Drehspieß Sandwich' }, { qty: 2, code: null, name: 'Test Cola 0,33 l' }],
    });
  });

  it('notify-ready: yanlış/eksik sır 401, yalnız POST', async () => {
    expect((await callFn({ order_id: crypto.randomUUID() })).status).toBe(401);
    expect((await callFn({ order_id: crypto.randomUUID() }, { 'x-webhook-secret': 'yanlis' })).status).toBe(401);
    expect((await callFn(null, secretHeader(), 'GET')).status).toBe(405);
    expect(await callFn({ order_id: 'x' }, secretHeader())).toEqual({ status: 400, body: { error: 'invalid_request' } });
    expect(await callFn({ order_id: crypto.randomUUID() }, secretHeader()))
      .toEqual({ status: 200, body: { sent: 0, removed: 0 } });
  });

  it('notify-ready: 404/410 veren abonelik silinir, geçici hata silinmez', async (ctx) => {
    if ((await realOnDutySubscriptions()) > 0) return ctx.skip();
    const keys = await fakeBrowserKeys();
    // Supabase'de olmayan bir fonksiyon adresi HTTPS üzerinden 404 döner → "abonelik ölü" senaryosu.
    const gone = `${process.env.SUPABASE_URL}/functions/v1/push-test-gone?s=${crypto.randomUUID()}`;
    await sql(`
      update public.profiles set on_duty_since = now() where id = '${ids.waiter}';
      insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
        ('${ids.waiter}', '${gone}', '${keys.p256dh}', '${keys.auth}'),
        ('${ids.waiter}', '${FAKE}waiter', 'k', 'a')
      on conflict (endpoint) do nothing;`);
    const o = await submit([{ product_id: f.colaId, quantity: 1 }]);
    const r = await callFn({ order_id: o.order_id }, secretHeader());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sent: 0 });
    expect(r.body!.removed).toBeGreaterThanOrEqual(1);
    const left = await sql<{ endpoint: string }>(
      `select endpoint from public.push_subscriptions where user_id = '${ids.waiter}'`);
    expect(left.map((x) => x.endpoint)).not.toContain(gone);
    expect(left.map((x) => x.endpoint)).toContain(`${FAKE}waiter`);
  });

  it('ready geçişi pg_net ile notify-ready çağırır (200)', { timeout: 60_000 }, async (ctx) => {
    if ((await realOnDutySubscriptions()) > 0) return ctx.skip();
    const [vault] = await sql<{ n: number }>(
      `select count(*)::int as n from vault.secrets where name in ('notify_ready_url', 'notify_ready_webhook_secret')`);
    expect(vault!.n, 'Vault sırları eksik: node --env-file=.env scripts/setup-push.mjs').toBe(2);

    const o = await submit([{ product_id: f.colaId, quantity: 1 }]);
    // pg_net yanıt satırı, istek kuyruğundaki kimliği taşır: bu andan sonraki ilk kimlik bizim isteğimizdir.
    const [maxes] = await sql<{ q: string; r: string }>(
      `select coalesce((select max(id) from net.http_request_queue), 0)::text as q,
              coalesce((select max(id) from net._http_response), 0)::text as r`);
    const before = Math.max(Number(maxes!.q), Number(maxes!.r));

    const { error } = await kitchen.rpc('mark_order_ready', { p_order_id: o.order_id });
    expect(error).toBeNull();

    type Resp = { status_code: number | null; content: string | null; timed_out: boolean | null; error_msg: string | null };
    let rows: Resp[] = [];
    for (let i = 0; i < 40 && rows.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 500));
      rows = await sql<Resp>(`select status_code, content, timed_out, error_msg from net._http_response
                              where id > ${before} order by id limit 1`);
    }
    expect(rows, 'pg_net yanıtı 20 sn içinde gelmedi').toHaveLength(1);
    expect(rows[0]!.error_msg).toBeNull();
    expect(rows[0]!.status_code).toBe(200);
    expect(JSON.parse(rows[0]!.content ?? '{}')).toMatchObject({ sent: expect.any(Number), removed: expect.any(Number) });
  });
});

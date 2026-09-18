import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from './helpers/sql';

// Görev 27 · anon değişmezleri (otomatik tarama). Uygulama yalnız giriş yapmış personelle çalışır;
// anon anahtarı herkese açık pakette durduğu için onunla HİÇBİR RPC çağrılamamalı ve HİÇBİR tablo
// okunamamalıdır. Liste katalogdan gelir: yeni bir migration fonksiyon/tablo eklerse test onu da kapsar.
//
// İki katmanlı ölçüt:
//  1. Katalog: `has_function_privilege('anon', oid, 'execute')` false olmalı (asıl ölçüt; PUBLIC grant'ı da yakalar).
//  2. HTTP (PostgREST):
//     - `{}` gövdesi → 401/403/404. Argümanlı fonksiyonda PostgREST imzayı bulamayıp 404 (PGRST202) döner,
//       yani bu çağrı tek başına yetkiyi SINAMAZ.
//     - Bu yüzden argüman adları `null` değerlerle de gönderilir → imza eşleşir ve Postgres yetki denetimine
//       ulaşılır: 401/403 + 42501 beklenir. Yetki denetimi gövde çalışmadan önce yapıldığı için yan etki yoktur.

// Açık allowlist: anon'un çağırabildiği TEK fonksiyon — müşteri QR menüsü (0011_public_menu.sql).
// Buraya yeni ad eklemek bilinçli bir güvenlik kararıdır; docs/BUILD-DECISIONS.md'ye yazılmalı.
const ANON_ALLOWED_FUNCTIONS = ['public_menu'];
const FORBIDDEN_KEYS = ['slug', 'is_active', 'archived_at', 'ingredients', 'groups', 'printer_host', 'ticket_header'];

type Fn = { oid: number; proname: string; in_args: string[]; anon_exec: boolean };
type Rel = { relname: string; relkind: string; anon_select: boolean };

const url = () => process.env.SUPABASE_URL!;
const headers = () => ({ apikey: process.env.SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' });

let fns: Fn[];
let rels: Rel[];

beforeAll(async () => {
  fns = await sql<Fn>(`
    select p.oid::int as oid, p.proname,
      coalesce(array(
        select a.n from unnest(p.proargnames, p.proargmodes) with ordinality as a(n, m, i)
        where coalesce(a.m, 'i') in ('i', 'b', 'v') and a.n is not null and a.n <> ''
        order by a.i), '{}') as in_args,
      has_function_privilege('anon', p.oid, 'execute') as anon_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
    order by p.proname`);
  rels = await sql<Rel>(`
    select c.relname, c.relkind::text as relkind, has_table_privilege('anon', c.oid, 'select') as anon_select
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
    order by c.relname`);
});

describe('anon erişimi (Görev 27)', () => {
  it('katalog taraması boş değil', () => {
    expect(fns.length).toBeGreaterThan(20);
    expect(rels.length).toBeGreaterThanOrEqual(19);
  });

  it('anon hiçbir public fonksiyonda EXECUTE yetkisine sahip değil (katalog)', () => {
    expect(fns.filter((f) => f.anon_exec && !ANON_ALLOWED_FUNCTIONS.includes(f.proname)).map((f) => f.proname))
      .toEqual([]);
    // Allowlist'teki fonksiyon gerçekten var ve anon'a açık (toplu revoke sonrası grant unutulmadı).
    for (const name of ANON_ALLOWED_FUNCTIONS) {
      expect(fns.find((f) => f.proname === name)?.anon_exec, name).toBe(true);
    }
  });

  it('0013 fonksiyonları var ve anon için kapalı; internal kuyruk yardımcıları personele de kapalı', async () => {
    for (const name of ['station_claim_print_job', 'station_complete_print_job', 'station_heartbeat', 'save_fcm_token']) {
      expect(fns.find((f) => f.proname === name)?.anon_exec, name).toBe(false);
    }
    const internal = await sql<{ fn: string; anon: boolean; authenticated: boolean }>(`
      select p.oid::regprocedure::text as fn,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'internal'
        and p.proname in ('claim_print_jobs', 'complete_print_job', 'write_printer_heartbeat', 'print_route')`);
    expect(internal).toHaveLength(4);
    expect(internal.filter((r) => r.anon || r.authenticated).map((r) => r.fn)).toEqual([]);
  });

  it('0015 fonksiyonları var ve anon için kapalı; station_feed_* personele de kapalı (yalnız service_role)', async () => {
    for (const name of ['register_station_device', 'revoke_station_device']) {
      expect(fns.find((f) => f.proname === name)?.anon_exec, name).toBe(false);
    }
    const feed = await sql<{ fn: string; anon: boolean; authenticated: boolean; service: boolean }>(`
      select p.oid::regprocedure::text as fn,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
             has_function_privilege('service_role', p.oid, 'execute') as service
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('station_feed_claim', 'station_feed_complete', 'station_feed_heartbeat')`);
    expect(feed).toHaveLength(3);
    expect(feed.filter((r) => r.anon || r.authenticated || !r.service).map((r) => r.fn)).toEqual([]);
  });

  it('public şemadaki hiçbir fonksiyon anon tarafından çağrılamaz (PostgREST)', async () => {
    const failures: string[] = [];
    for (const { proname, in_args } of fns) {
      if (ANON_ALLOWED_FUNCTIONS.includes(proname)) continue;
      const empty = await fetch(`${url()}/rest/v1/rpc/${proname}`, { method: 'POST', headers: headers(), body: '{}' });
      await empty.text();
      if (![401, 403, 404].includes(empty.status)) failures.push(`${proname} {} → ${empty.status}`);

      if (in_args.length === 0) {
        // Argümansız fonksiyon `{}` ile zaten imzaya ulaşır: 404 burada yetki denetiminin atlandığını gösterir.
        if (![401, 403].includes(empty.status)) failures.push(`${proname} {} (argümansız) → ${empty.status}`);
        continue;
      }
      const body = JSON.stringify(Object.fromEntries(in_args.map((a) => [a, null])));
      const named = await fetch(`${url()}/rest/v1/rpc/${proname}`, { method: 'POST', headers: headers(), body });
      const text = await named.text();
      const code = (text ? (JSON.parse(text) as { code?: string }) : {}).code;
      if (![401, 403].includes(named.status) || code !== '42501') {
        failures.push(`${proname}(${in_args.join(', ')}) → ${named.status} ${code ?? ''}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('anon hiçbir tablo/görünümde SELECT yetkisine sahip değil ve okuyamaz', async () => {
    expect(rels.filter((r) => r.anon_select).map((r) => r.relname)).toEqual([]);
    const leaks: string[] = [];
    for (const { relname } of rels) {
      const res = await fetch(`${url()}/rest/v1/${relname}?select=*&limit=1`, { headers: headers() });
      const text = await res.text();
      const ok = res.status === 401 || res.status === 403 || (res.status === 200 && text.trim() === '[]');
      if (!ok) leaks.push(`${relname} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it('anon public_menu çağırabilir; yanıtta iç alan yok ve tablolar hâlâ kapalı', async () => {
    const res = await fetch(`${url()}/rest/v1/rpc/public_menu`, { method: 'POST', headers: headers(), body: '{}' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { categories: unknown; products: unknown };
    expect(Array.isArray(body.categories)).toBe(true);
    expect(Array.isArray(body.products)).toBe(true);

    const found: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`));
      else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          if (FORBIDDEN_KEYS.includes(k)) found.push(`${path}.${k}`);
          walk(v, `${path}.${k}`);
        }
      }
    };
    walk(body, '$');
    expect(found).toEqual([]);

    for (const table of ['categories', 'products', 'product_variants', 'settings']) {
      expect(rels.find((r) => r.relname === table)?.anon_select, table).toBe(false);
      const t = await fetch(`${url()}/rest/v1/${table}?select=*&limit=1`, { headers: headers() });
      const text = await t.text();
      expect(t.status === 401 || t.status === 403 || (t.status === 200 && text.trim() === '[]'), `${table} → ${t.status}`)
        .toBe(true);
    }
  });

  it('anon anahtarıyla kayıt (signup) kapalı — hesaplar yalnız admin-staff ile açılır', async () => {
    // Kayıt kapalıyken GoTrue kullanıcı OLUŞTURMADAN 422 signup_disabled döner (.invalid alanı: e-posta gitmez).
    const res = await fetch(`${url()}/auth/v1/signup`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ email: 'anon-probe@signup.invalid', password: 'x-Probe-123456' }),
    });
    const body = (await res.json()) as { error_code?: string };
    expect(res.status).toBe(422);
    expect(body.error_code).toBe('signup_disabled');
  });
});

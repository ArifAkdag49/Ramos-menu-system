// Yayın öncesi temizlik (Görev 27 · çalıştırma Görev 28'de, yayından hemen önce ve KULLANICI ONAYIYLA).
//
// Kullanım: node --env-file=.env scripts/go-live-cleanup.mjs          → DRY-RUN: yalnız sayıları gösterir
//           node --env-file=.env scripts/go-live-cleanup.mjs --yes    → uygular
//
// `--yes` olmadan HİÇBİR yazma yapılmaz: yalnız SELECT sorguları çalışır, auth istemcisi oluşturulmaz.
//
// Kapsam (BUILD-DECISIONS 2026-09-16 "Demo → Görev 27"):
//   Hesaplar   : username `test-%` VEYA `demo-%` (ör. test-admin, test-e2e-garson, demo-garson, demo-mutfak).
//   Oturumlar  : `Test-Tisch%` masalarındaki VEYA bu hesapların açtığı masa oturumları.
//   Siparişler : bu oturumlardaki VEYA bu hesapların (garson olarak) verdiği siparişler + kalemleri.
//   Fiş işleri : bu siparişlere/oturumlara bağlı VEYA bu hesapların oluşturduğu print_jobs.
//   Push       : bu hesapların push abonelikleri.
//   → yukarıdakiler SİLİNİR (FK sırasıyla, tek işlemde).
//   Hesaplar pasif (`is_active = false`, mesai kapalı) + Supabase Auth'ta banlanır (876000 sa ≈ 100 yıl).
//   `test-%` ürün/kategori/malzeme/seçenek grubu ve `Test-Tisch%` masaları pasif (silinmez: "kayıt silme yok").
//   daily_counters: test verisi SİLİNDİKTEN SONRA, yalnız artık hiç siparişi kalmayan iş günlerinin sayacı
//   silinir (gerçek siparişi olan günün sayacına dokunulmaz → `unique(business_date, order_no)` güvende).
//   audit_log'a dokunulmaz (denetim kaydı).
//
// Kimlik kümeleri işlem başında geçici tablolara dondurulur: silme ilerlerken alt sorgular küçülüp
// (ör. sipariş silinince "test garsonunun siparişi olan oturum") kapsam kaymasın.
//
// UYARI: `npm run db:test` / E2E (`ensureTestUsers`) ve `scripts/create-demo-users.mjs` test/demo hesaplarını
// yeniden etkinleştirir ve banı kaldırır. Temizlikten sonra `.env` → DB_TESTS_ALLOWED=0 (Görev 28 Adım 2).
import { createClient } from '@supabase/supabase-js';
import { runSql } from './db.mjs';

const yes = process.argv.includes('--yes');

const STAFF = `select id from public.profiles where username like 'test-%' or username like 'demo-%'`;
const SESSIONS = (staff) => `
  select ts.id from public.table_sessions ts join public.dining_tables t on t.id = ts.table_id
  where t.name like 'Test-Tisch%' or ts.opened_by in (${staff})`;
const ORDERS = (staff, sessions) => `
  select o.id from public.orders o where o.session_id in (${sessions}) or o.waiter_id in (${staff})`;
const JOBS = (staff, sessions, orders) => `
  select j.id from public.print_jobs j
  where j.order_id in (${orders}) or j.session_id in (${sessions}) or j.created_by in (${staff})`;

async function counts() {
  const S = STAFF;
  const T = SESSIONS(S);
  const O = ORDERS(S, T);
  const J = JOBS(S, T, O);
  const [row] = await runSql(`select
    (select count(*) from public.profiles where id in (${S}))::int                                 as test_demo_hesaplar,
    (select count(*) from public.profiles where id in (${S}) and is_active)::int                   as aktif_test_demo_hesaplar,
    (select count(*) from auth.users where id in (${S})
       and (banned_until is null or banned_until < now()))::int                                    as banlanacak_auth_kullanicilari,
    (select count(*) from public.table_sessions where id in (${T}))::int                           as silinecek_oturumlar,
    (select count(*) from public.table_sessions where id in (${T}) and status = 'open')::int       as bunlardan_acik_oturum,
    (select count(*) from public.orders where id in (${O}))::int                                   as silinecek_siparisler,
    (select count(*) from public.orders where id in (${O}) and waiter_id not in (${S}))::int       as bunlardan_gercek_hesap_siparisi,
    (select count(*) from public.order_items where order_id in (${O}))::int                        as silinecek_siparis_kalemleri,
    (select count(*) from public.print_jobs where id in (${J}))::int                               as silinecek_fis_isleri,
    (select count(*) from public.print_jobs where id in (${J}) and status = 'pending')::int        as bunlardan_bekleyen_fis,
    (select count(*) from public.push_subscriptions where user_id in (${S}))::int                  as silinecek_push_abonelikleri,
    (select count(*) from public.products where slug like 'test-%' and is_active)::int             as aktif_test_urunleri,
    (select count(*) from public.categories where slug like 'test-%' and is_active)::int           as aktif_test_kategorileri,
    (select count(*) from public.ingredients where slug like 'test-%' and is_active)::int          as aktif_test_malzemeleri,
    (select count(*) from public.option_groups where slug like 'test-%' and is_active)::int        as aktif_test_secenek_gruplari,
    (select count(*) from public.dining_tables where name like 'Test-Tisch%' and is_active)::int   as aktif_test_masalari,
    (select count(*) from public.orders where id not in (${O}))::int                               as kalacak_gercek_siparisler,
    (select count(*) from public.daily_counters dc where not exists (
       select 1 from public.orders o where o.business_date = dc.business_date and o.id not in (${O})))::int
                                                                                                    as sifirlanacak_gun_sayaclari,
    (select count(*) from public.daily_counters)::int                                              as toplam_gun_sayaclari,
    (select count(*) from public.print_jobs where type = 'test' and id not in (${J}))::int         as bilgi_gercek_hesap_test_fisi`);
  return row;
}

async function outOfPattern() {
  return runSql(`
    select username, role, is_active from public.profiles
    where username not like 'test-%' and username not like 'demo-%'
    order by role, username`);
}

console.log(yes ? '== go-live-cleanup: UYGULAMA (--yes) ==' : '== go-live-cleanup: DRY-RUN (yazma yok) ==');
const before = await counts();
console.table(Object.entries(before).map(([ölçü, sayı]) => ({ ölçü, sayı })));
console.log('Desen DIŞI hesaplar (dokunulmaz — gerçek personel mi, elle doğrula):');
console.table(await outOfPattern());

if (!yes) {
  console.log('Dry-run bitti. Uygulamak için --yes (yalnız kullanıcı onayıyla, Görev 28).');
  process.exit(0);
}

// ---- Buradan sonrası yalnız --yes ile çalışır ----
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('.env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY eksik (auth banı için gerekli). Hiçbir şey yazılmadı.');
  process.exit(1);
}

const staffIds = (await runSql(STAFF)).map((r) => r.id);

await runSql(`
  begin;
  create temp table _gl_staff    on commit drop as ${STAFF};
  create temp table _gl_sessions on commit drop as ${SESSIONS('select id from _gl_staff')};
  create temp table _gl_orders   on commit drop as ${ORDERS('select id from _gl_staff', 'select id from _gl_sessions')};

  delete from public.print_jobs
   where order_id in (select id from _gl_orders)
      or session_id in (select id from _gl_sessions)
      or created_by in (select id from _gl_staff);
  delete from public.order_items where order_id in (select id from _gl_orders);
  delete from public.orders where id in (select id from _gl_orders);
  delete from public.table_sessions where id in (select id from _gl_sessions);
  delete from public.push_subscriptions where user_id in (select id from _gl_staff);

  update public.profiles set is_active = false, on_duty_since = null
   where id in (select id from _gl_staff) and (is_active or on_duty_since is not null);
  update public.products      set is_active = false where slug like 'test-%' and is_active;
  update public.categories    set is_active = false where slug like 'test-%' and is_active;
  update public.ingredients   set is_active = false where slug like 'test-%' and is_active;
  update public.option_groups set is_active = false where slug like 'test-%' and is_active;
  update public.dining_tables set is_active = false where name like 'Test-Tisch%' and is_active;

  -- Test verisi silindikten SONRA: yalnız siparişi kalmamış iş günlerinin sayacı sıfırlanır.
  delete from public.daily_counters dc
   where not exists (select 1 from public.orders o where o.business_date = dc.business_date);
  commit;`);
console.log('Veritabanı temizliği tamam (tek işlem).');

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const banErrors = [];
for (const id of staffIds) {
  const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: '876000h' });
  if (error) banErrors.push(`${id}: ${error.message}`);
}
console.log(`Auth banı: ${staffIds.length - banErrors.length}/${staffIds.length} hesap.`);

console.log('Temizlik SONRASI sayılar:');
console.table(Object.entries(await counts()).map(([ölçü, sayı]) => ({ ölçü, sayı })));
console.log('Sonraki adım: .env → DB_TESTS_ALLOWED=0 (testler test hesaplarını yeniden açar).');

if (banErrors.length) {
  console.error('Banlanamayan hesaplar (Supabase panelinden elle banla):', banErrors);
  process.exit(1);
}

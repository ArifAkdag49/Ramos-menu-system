# Ramo's Sipariş Sistemi — Plan 5: Test, Yayın ve Teslim (M8, Görev 27–30)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistemi uçtan uca doğrulamak, güvenlik denetiminden geçirmek, test verisini temizlemek, web uygulamasını kullanıcının Plesk sunucusunda HTTPS ile yayınlamak, gecelik yedeği kurmak ve işletmeye Türkçe kurulum ve kullanım rehberini teslim etmek.

**Architecture:**
- Web: statik SPA; Plesk'te alt alan adı + Let's Encrypt, SPA yönlendirmesi, doğru önbellek başlıkları.
- Backend: Supabase (değişmez).
- Yazdırma ajanı: restoran PC'si.
- Yedek: Plesk sunucusunda Docker ile `pg_dump` + cron.

**Tech Stack:** Playwright · Supabase advisors · SSH/SCP · Plesk CLI · Apache `.htaccess` / nginx · Docker (`postgres:17-alpine`) · cron

**Spec:** `docs/superpowers/specs/2026-09-15-ramos-siparis-sistemi-design.md` (§12, §13, §16, §17, §19)

## Global Constraints
**Faz B kuralı (her görevde geçerli):**
- Bu plandaki "kullanıcıya sor", "onay al" ve "kullanıcıdan iste" ifadeleri Faz A'da karşılandı (BUILD-PROMPT §3). **Soru sormadan devam et.**
- Gerçek cihaz testleri ve fotoğraflar "Kullanıcıya kalan kontroller" listesine yazılır.
- Son raporda şunları anlat:
  - Ürün görsellerinin nasıl ekleneceği (Admin → Menü → Toplu görsel yükleme; dosya adı = ürün numarası)
  - Kalan kontroller listesi

`docs/BUILD-PROMPT.md` §3 (onay noktaları), §4 (ortam), §5 (kısıtlar) ve §6 (Plesk tuzakları) geçerlidir. Bu planda özellikle:
- **Onay kapsamı:**
  - Sunucu, SSL ve cron işlemleri **yalnızca Faz A'da onaylanan liste** kapsamında yapılır (BUILD-PROMPT §3); Faz B'de tekrar sorulmaz.
  - Liste dışındaki hiçbir şey yapılmaz; her sunucu komutu önce `BUILD-PROGRESS.md`'ye yazılır.
  - Auto mod bir komutu engellerse ilgili adım ⏸ ertelenir ve kalan kontrollere eklenir.
- **Aynı sunucudaki diğer sistemler:** menupanels Supabase stack'ine, tv-display-system'e (`/opt/tv-display-system`, 04:15 yedeği), diğer Plesk sitelerine ve global nginx ayarına **dokunma**.
- **Sırlar:** Hiçbir sır repoya ya da ekrana yazılmaz. Sunucudaki `.env` dosyaları `chmod 600`.
- **Yayın sonrası testler:** DB testleri kapatılır (`DB_TESTS_ALLOWED=0`). E2E testleri yalnızca test masası ve test hesaplarıyla, **ajan kapalıyken** ya da kullanıcı onayıyla çalışır.

---

## Görev 27: Tam doğrulama, güvenlik denetimi ve yayın öncesi temizlik

**Files:**
- Create: `supabase/tests/anon.test.ts`, `scripts/go-live-cleanup.mjs`, `docs/screenshots/README.md`
- Modify: `apps/web/src/app/router.tsx` (admin rotaları `lazy` ile ayrı parça)

**Interfaces:**
- Consumes: tüm testler; `sql()`, `anonClient()`
- Produces:
  - `node --env-file=.env scripts/go-live-cleanup.mjs [--yes]`: `--yes` olmadan yalnızca sayıları gösterir (dry-run).
  - Ekran görüntüsü dizini: `docs/screenshots/README.md`.

- [ ] **Adım 1: anon her RPC'de reddedilir (otomatik tarama)**

`supabase/tests/anon.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { sql } from './helpers/sql';

describe('anon erişimi', () => {
  it('public şemadaki hiçbir fonksiyon anon tarafından çağrılamaz', async () => {
    const fns = await sql<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'
        and p.prorettype <> 'trigger'::regtype`);
    for (const { proname } of fns) {
      const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${proname}`, {
        method: 'POST', headers: { apikey: process.env.SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' }, body: '{}',
      });
      expect([401, 403, 404], `${proname} → ${res.status}`).toContain(res.status);
    }
  });
});
```
Run: `npm run db:test -- anon` → PASS. Bir fonksiyon `200` ya da `400` döndürüyorsa anon'da execute yetkisi kalmış demektir; `revoke` ile düzelt.

- [ ] **Adım 2: Güvenlik ve paket kontrolleri**

1. `get_advisors` (security + performance) → bulgu yok. Tek istisna: `daily_counters` için "RLS enabled no policy" bilgisi (bilinçli).
2. `npm run build -w apps/web` → `Select-String -Path apps/web/dist/assets/*.js -Pattern 'service_role|SUPABASE_SERVICE'` → **boş** olmalı.
3. `git ls-files | Select-String '\.env'` → yalnızca `.env.example` dosyaları görünmeli.
4. Admin kodu ayrı parçada olmalı:
   - `router.tsx`'te admin rotalarını `lazy(() => import('../features/admin/AdminApp'))` ile yükle.
   - Build çıktısında garson giriş parçası admin bileşenlerini içermemeli (`vite build` raporundaki parça listesi).
5. Supabase Auth ayarı (Management API):
   - `GET /v1/projects/{ref}/config/auth` → `disable_signup: true` olmalı.
   - Değilse `PATCH` ile düzelt (kullanıcı onayıyla).

- [ ] **Adım 3: Tam E2E paketi**

Run: `npm run e2e -w apps/web` → tüm projeler (telefon, tablet, masaüstü) ve senaryolar (login, waiter-flow, kitchen, admin-menu, admin-staff, pwa) yeşil olmalı.

Kararsız (flaky) test varsa tahminle bekleme süresi ekleme; `systematic-debugging` uygula. Ekran görüntülerini `docs/screenshots/README.md` içinde ekran adı → dosya olarak listele.

- [ ] **Adım 4: Yayın öncesi temizlik betiği**

`scripts/go-live-cleanup.mjs`:
```js
import { runSql } from './db.mjs';
const yes = process.argv.includes('--yes');
const TEST_SESSIONS = `select ts.id from public.table_sessions ts join public.dining_tables t on t.id = ts.table_id
                       where t.name like 'Test-Tisch%' or ts.opened_by in (select id from public.profiles where username like 'test-%')`;
const counts = await runSql(`select
  (select count(*) from public.orders where session_id in (${TEST_SESSIONS})) as test_orders,
  (select count(*) from public.print_jobs where created_by in (select id from public.profiles where username like 'test-%')) as test_jobs,
  (select count(*) from public.profiles where username like 'test-%' and is_active) as active_test_users,
  (select count(*) from public.products where slug like 'test-%' and is_active) as active_test_products`);
console.table(counts);
if (!yes) { console.log('Dry-run. Uygulamak için --yes (kullanıcı onayıyla).'); process.exit(0); }
await runSql(`
  delete from public.print_jobs where order_id in (select id from public.orders where session_id in (${TEST_SESSIONS}))
     or session_id in (${TEST_SESSIONS}) or created_by in (select id from public.profiles where username like 'test-%');
  delete from public.order_items where order_id in (select id from public.orders where session_id in (${TEST_SESSIONS}));
  delete from public.orders where session_id in (${TEST_SESSIONS});
  delete from public.table_sessions where id in (${TEST_SESSIONS});
  delete from public.push_subscriptions where user_id in (select id from public.profiles where username like 'test-%');
  update public.profiles set is_active = false, on_duty_since = null where username like 'test-%';
  update public.products set is_active = false where slug like 'test-%';
  update public.categories set is_active = false where slug like 'test-%';
  update public.dining_tables set is_active = false where name like 'Test-Tisch%';
  delete from public.daily_counters;`);
console.log('Temizlik tamam. Test auth kullanıcılarını banla: admin-staff set_active=false ya da Supabase panelinden.');
```
Test kullanıcılarının Auth tarafında da banlanması için betiğe `serviceClient().auth.admin.updateUserById(id, { ban_duration: '876000h' })` döngüsünü ekle. İlgili kimlikler `select id from public.profiles where username like 'test-%'` sorgusuyla alınır.

Run: `node --env-file=.env scripts/go-live-cleanup.mjs` (dry-run). Sayıları kaydet. **`--yes` ile çalıştırma Görev 28'de, yayından hemen önce ve kullanıcı onayıyla yapılır.**

- [ ] **Adım 5: Commit**
```bash
git add supabase/tests/anon.test.ts scripts/go-live-cleanup.mjs apps/web/src/app/router.tsx docs/screenshots/README.md
git commit -m "chore(release): anon RPC taraması, güvenlik ve paket kontrolleri, yayın öncesi temizlik betiği"
```

---

## Görev 28: Plesk'e yayın (HTTPS) ve gerçek cihaz testleri

**Files:**
- Create: `apps/web/.env.production` (commit **edilmez**; `.env.production.example` edilir), `deploy/deploy-web.ps1` (UTF-8 BOM)
- Verify: `apps/web/public/.htaccess`, `apps/web/public/assets/.htaccess` (Görev 25'te oluşturuldu)

**Interfaces:**
- Consumes: Görev 25–27 çıktıları; SSH anahtarı (kullanıcı teyitli)
- Produces:
  - Canlı adres: `https://<alt-alan-adı>`
  - `deploy/deploy-web.ps1 -Domain <alan> -WebRoot <yol> -SysUser <kullanıcı>`: build → yükle → sahiplik → duman testi

- [ ] **Adım 1: Faz A girdilerini kontrol et (durma)**

> **Faz B'de:** Aşağıdaki bilgiler Faz A'da toplandı:
> - `.env` → `APP_DOMAIN`, `DEPLOY_SSH_KEY`, `LE_EMAIL`
> - DNS durumu ve ön onaylar (`BUILD-PROGRESS.md`)
>
> Soru sorma. Eksik bilgi varsa ya da DNS henüz yayılmadıysa (`Resolve-DnsName <APP_DOMAIN>` sunucu IP'sini döndürmüyorsa) yayını ⏸ ertele ve diğer görevlere devam et. Tüm görevler bitince yeniden dene.

Sorulacaklar:
1. **Alt alan adı:** öneri `ramos.arxdigitalsevice.com`.
2. **DNS:** Alan adının DNS'i Plesk'te mi, başka bir yerde mi (ör. Cloudflare)? Dışarıdaysa kullanıcı `A` kaydını `87.106.47.17`'ye kendisi ekler.
3. **SSH anahtarı:** `~/.ssh/tvds_deploy` ile root erişimi teyidi.
4. **Let's Encrypt e-posta adresi:** kullanıcının vereceği adres.
5. **Onaylar:** yayına alma ve `go-live-cleanup --yes`.

- [ ] **Adım 2: Üretim ortamı ve temizlik**

`apps/web/.env.production`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STAFF_EMAIL_DOMAIN`, `VITE_VAPID_PUBLIC_KEY`.

Supabase Auth `site_url` = `https://<alan>` (Management API `PATCH /config/auth`). `notify-ready` secret'ı `VAPID_SUBJECT=https://<alan>` olarak güncellenir.

Onay alındıysa sırasıyla:
1. `node --env-file=.env scripts/go-live-cleanup.mjs --yes`
2. `.env` içinde `DB_TESTS_ALLOWED=0`

- [ ] **Adım 3: Plesk'te alt alan adı ve SSL (SSH ile, onaylı)**
```bash
ssh -i ~/.ssh/tvds_deploy root@87.106.47.17 "plesk bin site --list"
ssh -i ~/.ssh/tvds_deploy root@87.106.47.17 "plesk bin subdomain --create ramos -domain arxdigitalsevice.com -www-root /ramos.arxdigitalsevice.com"
ssh -i ~/.ssh/tvds_deploy root@87.106.47.17 "plesk bin extension --exec letsencrypt cli.php -d ramos.arxdigitalsevice.com -m <kullanıcının verdiği e-posta>"
```
- Plesk sürümü alt alan adını "site" olarak yönetiyorsa `plesk bin site --create ramos.arxdigitalsevice.com -webspace-name arxdigitalsevice.com -www-root ramos.arxdigitalsevice.com` kullan.
- Belge kökünü ve sistem kullanıcısını tespit et: `plesk bin site --info ramos.arxdigitalsevice.com` ve `stat -c %U /var/www/vhosts/arxdigitalsevice.com/httpdocs`.

- [ ] **Adım 4: SPA yönlendirmesi ve önbellek başlıkları**

`apps/web/public/.htaccess`:
```apache
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
<IfModule mod_headers.c>
  <FilesMatch "^(index\.html|sw\.js|manifest\.webmanifest|registerSW\.js)$">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
  </FilesMatch>
</IfModule>
```
`apps/web/public/assets/.htaccess` (yalnızca hash'li dosyalar):
```apache
<IfModule mod_headers.c>
  Header set Cache-Control "public, max-age=31536000, immutable"
</IfModule>
```
Alan adında Apache kapalıysa (yalnız nginx), Plesk → Apache & nginx Settings → **Additional nginx directives** alanına şunu yaz. Plesk'in `location /` bloğuyla çakışmamak için **regex kalıbı** kullanılır:
```nginx
location ~ ^/assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; try_files $uri =404; }
location ~ ^/(index\.html|sw\.js|manifest\.webmanifest)$ { add_header Cache-Control "no-cache"; try_files $uri =404; }
location ~ ^/ { try_files $uri $uri/ /index.html; }
```

- [ ] **Adım 5: Yayın betiği ve ilk yayın**

`deploy/deploy-web.ps1` (UTF-8 BOM'a çevir). Parametreler: `-Domain`, `-WebRoot`, `-SysUser`, `-Key "$HOME\.ssh\tvds_deploy"`. Betiğin yaptıkları:
1. `npm run build -w apps/web` (üretim ortamıyla).
2. `scp -i $Key -r apps/web/dist/* apps/web/dist/.htaccess root@87.106.47.17:$WebRoot/`
3. `ssh … "chown -R ${SysUser}:psacln $WebRoot"`
4. Duman testi (`Invoke-WebRequest`):
   - `/` → 200
   - `/waiter` → 200 (SPA)
   - `/sw.js` başlığında `no-cache`
   - `/assets/*.js` başlığında `immutable`
   - `/manifest.webmanifest` → 200

Run (onaylı): `powershell -File deploy/deploy-web.ps1 -Domain ramos.arxdigitalsevice.com -WebRoot <yol> -SysUser <kullanıcı>` → tüm kontroller ✓.

- [ ] **Adım 6: Canlı duman testi (otomatik) + gerçek cihaz testleri (kullanıcıya kalan)**

> **Faz B'de — otomatik kısım:**
> 1. Canlı adreste Playwright ile telefon ve tablet görünümünde şu akışı çalıştır: giriş → sipariş → KDS → HAZIR → Hazır sekmesi.
> 2. Bunun için admin API'siyle **geçici** bir garson hesabı aç (`e2e-canli`); test bitince pasifleştir.
> 3. Siparişleri test masasında değil, ayrı bir geçici masada ver; test sonrası `go-live-cleanup` mantığıyla temizle.
>
> **Kullanıcıya kalan kısım:** Aşağıdaki gerçek cihaz adımları (kilitli ekranda push, tablet kurulumu) beklenmez; `BUILD-PROGRESS.md` → "Kullanıcıya kalan kontroller" listesine adım adım yazılır.

1. **Garson telefonu (Android şart, iPhone varsa):**
   - Adresi aç, uygulamayı yükle / ana ekrana ekle.
   - `test` dışı gerçek bir garson hesabıyla giriş yap. Admin panelinden oluşturulur, PIN'i kullanıcı belirler.
   - Bildirimleri aç, mesaiye başla.
2. **Mutfak tableti:** `/kitchen` → "Mutfak ekranını başlat" → ana ekrana ekle.
3. **Ajan:** Geliştirme PC'sindeki ajan (ya da restoran PC'si) canlı projeye bağlı ve yazıcı ağda olmalı.
4. **Tam akış:**
   1. Garson sipariş verir.
   2. Fiş basılır, KDS'de ≤ 2 sn içinde görünür.
   3. HAZIR'a basılır.
   4. **Ekranı kilitli telefonda push bildirimi gelir.** Bildirime dokununca Hazır sekmesi açılır.
   5. Garson teslim eder ve masayı kapatır.
5. Sonuçları, ekran görüntüleri ve fiş fotoğraflarıyla birlikte rapora ekle.

- [ ] **Adım 7: Commit**
```bash
git add deploy/deploy-web.ps1 apps/web/public/.htaccess apps/web/public/assets/.htaccess apps/web/.env.production.example
git commit -m "chore(deploy): Plesk yayını — SPA yönlendirme, önbellek başlıkları, yayın betiği ve duman testi"
```

---

## Görev 29: Gecelik veritabanı yedeği (Plesk sunucusu)

**Files:**
- Create: `deploy/backup/backup.sh`, `deploy/backup/ramos-backup.cron`, `deploy/backup/RESTORE.md`

**Interfaces:**
- Consumes: Supabase oturum havuzu (session pooler) bağlantı bilgisi ve DB parolası. MCP ile oluşturulan projede parolayı kullanıcı panelden sıfırlar: Settings → Database → Reset password.
- Produces: `/opt/backups/ramos/ramos-YYYY-MM-DD.dump` (30 gün saklanır) + `ramos-auth-YYYY-MM-DD.sql` (personel hesapları)

- [ ] **Adım 1: Bağlantı bilgisi (Faz A onayıyla — durma)**

> **Faz B'de:** Cron onayı Faz A'da alındı. Aşağıdaki "kullanıcıdan al" maddelerini atla:
> - **DB parolası:** `.env` → `SUPABASE_DB_PASSWORD` (Görev 2'de Management API ile üretildi).
> - **Session pooler host'u:** Management API'den al (`GET /v1/projects/{ref}/config/database/pooler`). Alınamazsa yedeği ⏸ ertele ve kalan kontrollere ekle ("Panel → Connect → Session pooler host'u").

Kullanıcıdan şunları al:
1. Cron kurulumu onayı.
2. DB parolası: `.env` içindeki `SUPABASE_DB_PASSWORD` ya da panelden sıfırlanan değer.
3. Session pooler host'u: Supabase panel → Connect → Session pooler, ör. `aws-0-eu-central-1.pooler.supabase.com`, kullanıcı `postgres.<ref>`.

- [ ] **Adım 2: Betik**

`deploy/backup/backup.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
source /opt/backups/ramos/.env          # PGHOST, PGUSER, PGPASSWORD (chmod 600)
d=$(date +%F); out=/opt/backups/ramos
docker run --rm -e PGPASSWORD="$PGPASSWORD" postgres:17-alpine \
  pg_dump -h "$PGHOST" -p 5432 -U "$PGUSER" -d postgres -Fc --no-owner --no-privileges -n public -n internal \
  > "$out/ramos-$d.dump"
docker run --rm -e PGPASSWORD="$PGPASSWORD" postgres:17-alpine \
  pg_dump -h "$PGHOST" -p 5432 -U "$PGUSER" -d postgres --data-only -t auth.users -t auth.identities \
  > "$out/ramos-auth-$d.sql"
find "$out" -name 'ramos-*' -mtime +30 -delete
echo "$(date -Is) ok $(du -h "$out/ramos-$d.dump" | cut -f1)"
```
`deploy/backup/ramos-backup.cron`:
```
30 4 * * * root /opt/backups/ramos/backup.sh >> /var/log/ramos-backup.log 2>&1
```
04:30'u seçmemin sebebi tv-display-system'in 04:15 yedeğiyle çakışmamak.

- [ ] **Adım 3: Sunucuya kur (onaylı) ve doğrula**
```bash
ssh -i ~/.ssh/tvds_deploy root@87.106.47.17 "mkdir -p /opt/backups/ramos && chmod 700 /opt/backups/ramos"
scp -i ~/.ssh/tvds_deploy deploy/backup/backup.sh root@87.106.47.17:/opt/backups/ramos/backup.sh
scp -i ~/.ssh/tvds_deploy deploy/backup/ramos-backup.cron root@87.106.47.17:/etc/cron.d/ramos-backup
ssh -i ~/.ssh/tvds_deploy root@87.106.47.17 "chmod 700 /opt/backups/ramos/backup.sh && chmod 644 /etc/cron.d/ramos-backup"
```
Sunucudaki `/opt/backups/ramos/.env` dosyasını SSH oturumunda oluştur: `PGHOST=…`, `PGUSER=postgres.<ref>`, `PGPASSWORD=…`, izin `chmod 600`. Parolayı komut geçmişine düşürme; `read -s` ile girilir.

Doğrulama:
1. `ssh … "/opt/backups/ramos/backup.sh"` → `ok <boyut>`.
2. `ssh … "docker run --rm -v /opt/backups/ramos:/b postgres:17-alpine pg_restore --list /b/ramos-$(date +%F).dump | grep -c 'TABLE DATA'"` → ≥ 19.

- [ ] **Adım 4: Geri yükleme belgesi**

`deploy/backup/RESTORE.md` (Türkçe) şunları anlatır:
1. Yeni Supabase projesi aç.
2. `npm run db:apply` ile şemayı kur. Sonra `pg_restore --data-only --disable-triggers -d <yeni-url> ramos-<tarih>.dump` ile veriyi yükle; yalnız `public` ve `internal` şemaları.
3. `ramos-auth-<tarih>.sql` dosyasını yükle (personel girişleri).
4. Edge Functions'ı ve Vault/secret'ları yeniden kur (`fn:deploy`, `setup-push`).
5. Web `.env.production` ve ajan `.env` dosyalarında URL/anahtarı güncelle.

- [ ] **Adım 5: Commit**
```bash
git add deploy/backup
git commit -m "chore(ops): gecelik pg_dump yedeği (public+internal+auth), 30 gün saklama, geri yükleme belgesi"
```

---

## Görev 30: Kurulum ve kullanım rehberi, son rapor

**Files:**
- Create: `docs/KURULUM.md` (Türkçe, ekran görüntülü)
- Modify: `README.md` (kısa proje özeti + komutlar + belge bağlantıları)

**Interfaces:**
- Consumes: tüm önceki görevler
- Produces: işletmeye teslim edilecek belge ve kullanıcıya son rapor

- [ ] **Adım 1: `docs/KURULUM.md` dosyasını yaz**

Bölümler (her birinde adım adım talimat ve ekran görüntüsü yolu):
1. **Genel bakış:** Sistem neler yapar, kim neyi kullanır, ödeme kasada.
2. **Yazıcıyı ağa bağlama (XP-Q80A):**
   - Ethernet kablosu, self-test sayfası (FEED + güç).
   - IP'yi modem alt ağına ayarlama (Xprinter aracı, Port: NET) ve modemde DHCP rezervasyonu.
   - Admin → Ayarlar → Yazıcı → IP → Test fişi.
   - Karakter tablosu seçimi (61 / 91 / transliterasyon).
3. **Yazdırma ajanı (restoran PC'si):**
   - Node.js LTS kurulumu.
   - Klasör, `.env` (`scripts/create-printer-user.mjs` çıktısı).
   - `install-agent.ps1`, oturum açılınca otomatik başlama.
   - **PC'nin uyku moduna geçmemesi** (Güç ayarları).
   - Logların yeri (`%LOCALAPPDATA%\RamosPrintAgent\logs`), kaldırma.
   - Raspberry Pi alternatifi (systemd).
4. **Mutfak tableti:**
   - Android Chrome → ana ekrana ekle.
   - Ekran zaman aşımı "hiçbir zaman", sesin açık olması.
   - İsteğe bağlı kiosk: Fully Kiosk Browser. iPad'de Rehberli Erişim (iPadOS 18.4+).
5. **Garson telefonları:**
   - iPhone: Safari → Paylaş → Ana Ekrana Ekle → uygulamayı ana ekrandan aç → Bildirimleri aç.
   - Android: Chrome → Yükle.
   - Giriş, mesai anahtarı.
6. **Admin ilk adımlar:** Personel ekleme (PIN kuralları), masa sayısını ayarlama, menüdeki açık noktaları düzeltme (liste: `docs/menu/ramos-menu-data.md` §6), tükendi, raporlar, CSV.
7. **Günlük akış:** Sipariş → fiş/ekran → HAZIR → bildirim → teslim → kasada ödeme → masayı kapat. İptal ve masa taşıma.
8. **Sorun giderme:**
   - "Yazıcı çevrimdışı" (PC açık mı, kablo, IP)
   - "Kağıt bitti"
   - "Basılamadı → Tekrar dene"
   - İnternet yok
   - Push gelmiyor (iPhone'da ana ekrana eklenmemiş, bildirim izni, mesai kapalı)
   - Güncelleme ("Yeni sürüm hazır → Yenile")
9. **Acil durum:** İnternet ya da Supabase kesintisinde siparişler kağıda alınır; bağlantı gelince girilmez, kasadan yürür.
10. **Tatil notu:** Ajan (PC) 7 günden uzun kapalı kalırsa ücretsiz Supabase projesi uyuyabilir; e-postadaki bağlantıdan ya da panelden "Restore".
11. **Yedekler ve geri yükleme:** `deploy/backup/RESTORE.md` bağlantısı.
12. **TSE / Steuerberater notu** (spec §1.4).
13. **Hesapların ve anahtarların nerede saklandığı:**
    - Kök `.env`
    - `apps/print-agent/.env`
    - Sunucuda `/opt/backups/ramos/.env`
    - Supabase secrets ve Vault
    - **Değerler yazılmaz.**

- [ ] **Adım 2: README ve son kontrol**

`README.md`:
- Tek paragraf özet.
- Komutlar: `npm run check`, `db:apply`, `db:seed`, `db:test` (yayından sonra kapalı), `e2e`, ajan komutları, `fn:deploy`, `deploy-web.ps1`.
- Belge bağlantıları: spec, menü verisi, planlar, KURULUM, RESTORE.

BUILD-PROMPT §9'daki "Tamamlanma tanımı" maddelerini tek tek işaretle. Eksik varsa önce tamamla.

- [ ] **Adım 3: Commit ve son rapor**
```bash
git add docs/KURULUM.md README.md
git commit -m "docs: Türkçe kurulum ve kullanım rehberi, README"
```
Kullanıcıya **son raporu** ver (BUILD-PROMPT §8 biçimi + ek bilgiler):
- Canlı adres
- Admin girişinin nasıl yapılacağı (parola değil)
- Ajanın nasıl kurulacağı
- Açık noktalar (menü belirsizlikleri, TSE teyidi, gerçek masa sayısı)
- v2 önerileri (spec §20)

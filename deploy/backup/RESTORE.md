# Veritabanı yedeği ve geri yükleme

Ramo's sipariş sisteminin veritabanı her gece Plesk sunucusunda yedeklenir. Bu belge yedeğin nerede durduğunu, neyi kapsadığını ve Supabase projesi kaybolursa sistemin **yeni bir Supabase projesine** nasıl geri yükleneceğini anlatır.

## 1. Yedek nerede, ne içerir

| | |
|---|---|
| Sunucu | `root@87.106.47.17` (Plesk), SSH anahtarı `~/.ssh/tvds_deploy` |
| Klasör | `/opt/backups/ramos` (yalnız root, `700`; dosyalar `600`) |
| Zaman | Her gece **04:30 UTC**: Almanya'da yazın 06:30, kışın 05:30 (`/etc/cron.d/ramos-backup`) |
| Günlük | `/var/log/ramos-backup.log`: her gece bir satır. `… ok 228K (tablo_verisi=20, auth=12K)` başarılı demektir, `HATA` satırı başarısız |
| Saklama | **30 gün**. Daha eski yedekleri betik kendisi siler |
| Betik | `/opt/backups/ramos/backup.sh` (repodaki `deploy/backup/backup.sh`), bağlantı bilgisi `/opt/backups/ramos/.env` (`600`) |

Her gece iki dosya oluşur:

- **`ramos-YYYY-MM-DD.dump`:** `public` ve `internal` şemalarının yapısı ve bütün verisi (menü, masalar, siparişler, fiş kuyruğu, ayarlar, raporların dayandığı kayıtlar, personel profilleri). Biçimi `pg_dump -Fc`, `pg_restore` ile okunur.
- **`ramos-auth-YYYY-MM-DD.sql`:** `auth.users` ve `auth.identities` satırları, yani personel girişleri. Parola **hash'lerini** içerir, bu yüzden dosyayı sunucudan dışarı çıkarırken dikkatli ol.

**Yedekte olmayanlar** (geri yüklemede ayrıca kurulur):

- **Storage dosyaları** (`product-images` bucket'ı, ürün görselleri). Veritabanında yalnız dosya yolu (`products.image_path`) saklanır. Görselleri yeniden yüklemek gerekir (adım 7).
- Edge Function kodu (repoda `supabase/functions/`), function secret'ları ve Vault sırları (kök `.env`).
- Supabase proje ayarları (Auth: kayıt kapalı, site URL).

## 2. Yedeği kontrol etme ve elle alma

```bash
ssh -i ~/.ssh/tvds_deploy root@87.106.47.17

tail -5 /var/log/ramos-backup.log            # son gecelerin sonucu
ls -lh /opt/backups/ramos                    # mevcut yedekler
/opt/backups/ramos/backup.sh                 # hemen yedek al (aynı günün dosyasının üzerine yazar)

# Yedeğin içi okunabiliyor mu? (≥ 19 olmalı)
docker run --rm -v /opt/backups/ramos:/b:ro postgres:17-alpine \
  pg_restore --list /b/ramos-$(date +%F).dump | grep -c 'TABLE DATA'
```

Bir yedeği bilgisayara indirmek için (PowerShell ya da Git Bash):

```bash
scp -i ~/.ssh/tvds_deploy root@87.106.47.17:/opt/backups/ramos/ramos-2026-09-17.dump .
```

## 3. Geri yükleme: genel akış

1. Yeni Supabase projesi aç.
2. Şemayı migration'larla kur (`npm run db:apply`).
3. Veriyi yedekten yükle: önce personel girişleri (auth), sonra `public` ve `internal` verisi.
4. Edge Functions'ı, secret'ları ve Vault sırlarını yeniden kur.
5. Auth ayarlarını yap.
6. Web, yazdırma ajanı ve yedek betiğinin ortam dosyalarını yeni projeye çevir.
7. Ürün görsellerini yeniden yükle ve sistemi dene.

> Geri yükleme boyunca yazdırma ajanını **kapalı** tut. Ajan açık olursa yedekten gelen bekleyen fiş işlerini basabilir.

## 4. Adım adım

### Adım 1: Yeni Supabase projesi

1. Supabase panelinde yeni proje aç. Bölge **eu-central-1 (Frankfurt)**, Postgres 17. Proje adını **`ramos-siparis`** koy: `npm run fn:deploy` proje adını bu değerle karşılaştırır. Başka bir ad kullanırsan kök `.env`'ye `SUPABASE_PROJECT_NAME=<ad>` ekle.
2. Güçlü bir veritabanı parolası belirle. Unuttuysan Settings → Database → Reset password.
3. Kök `.env` dosyasını yeni değerlerle güncelle: `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`. `SUPABASE_ACCESS_TOKEN` hesap düzeyindedir, değişmez.
4. **Panelden kullanıcı oluşturma.** Personel hesapları yedekten gelecek; önceden açılan bir hesap çakışma çıkarır.

### Adım 2: Şema

Geliştirme bilgisayarında, proje klasöründe:

```bash
npm run db:apply
```

Bu komut bütün migration'ları uygular. Tablolar, RLS politikaları, fonksiyonlar, Realtime ayarları ve `product-images` bucket'ı kurulur. Ayrıca `settings` ve `printer_status` tablolarına birer başlangıç satırı eklenir; adım 3 bu satırları yedektekilerle değiştirir.

### Adım 3: Veri

En kolay yol, komutları yedeklerin zaten durduğu sunucuda Docker ile çalıştırmaktır.

**Bağlantı bilgisi:** Yeni projenin panelinde Connect → **Session pooler** bölümüne bak. Port `5432`, kullanıcı `postgres.<yeni-ref>`. Host örneği `aws-0-eu-central-1.pooler.supabase.com`, ama panelde yazanı kullan. Direct connection'ı değil pooler'ı seç: sunucu IPv6'ya çıkamayabilir.

```bash
ssh -i ~/.ssh/tvds_deploy root@87.106.47.17

T=2026-09-17                                   # geri yüklenecek yedeğin tarihi (ls /opt/backups/ramos)
export PGHOST=aws-0-eu-central-1.pooler.supabase.com PGPORT=5432 PGDATABASE=postgres
export PGUSER=postgres.<yeni-ref>
read -rs -p 'Yeni proje DB parolası: ' PGPASSWORD; echo; export PGPASSWORD   # geçmişe ve ekrana düşmez

mkdir -m 700 -p /root/ramos-restore && cd /root/ramos-restore
pg() { docker run --rm --network host -v /opt/backups/ramos:/b:ro -v "$PWD":/w -w /w \
  -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE postgres:17-alpine "$@" < /dev/null; }

# 3a. Bağlantı ve şema kontrolü: migration listesi dolu olmalı
pg psql -c 'select count(*) as migrations from internal.migrations'

# 3b. Yüklenecek içerik listesi: internal.migrations verisi hariç (db:apply onu zaten yazdı)
pg pg_restore --list /b/ramos-$T.dump | grep -v ' TABLE DATA internal migrations ' > liste.txt

# 3c. Yedekteki veriyi SQL'e çevir (yalnız veri; public + internal)
pg pg_restore --data-only -L liste.txt -f veri.sql /b/ramos-$T.dump

# 3d. Tek işlemde yükle: tetikleyiciler ve FK kontrolleri kapalı, hata olursa hiçbir şey yazılmaz
pg psql --single-transaction -v ON_ERROR_STOP=1 \
  -c 'SET session_replication_role = replica' \
  -c 'DELETE FROM public.settings; DELETE FROM public.printer_status;' \
  -f /b/ramos-auth-$T.sql \
  -f veri.sql
```

**Neden `pg_restore --disable-triggers` değil?** O seçenek FK sistem tetikleyicilerini kapatmak için süper kullanıcı ister. Supabase'deki `postgres` rolü süper kullanıcı değildir, yükleme hata verir. `session_replication_role = replica` aynı işi Supabase'in izin verdiği yoldan yapar. Bu ayarla trigger'lar da çalışmaz: yükleme sırasında fiş işi, push bildirimi ya da denetim kaydı üretilmez.

**Olası hatalar:**

- **`duplicate key`:** Hedefte önceden satır var. Panelden kullanıcı açılmış ya da `db:seed` çalıştırılmış olabilir. Yeni proje boşken yeniden dene ya da çakışan satırları sil.
- **`auth.users` sütun hatası:** Supabase Auth şeması yedeğin alındığı günden sonra değişmiş olabilir. `ramos-auth-<tarih>.sql` içindeki `COPY auth.users (…)` sütun listesini yeni projedeki tabloyla karşılaştır. Olmayan sütunu hem listeden hem veriden çıkar.

**Kontrol:**

```bash
pg psql -c "select
  (select count(*) from auth.users)          as kullanicilar,
  (select count(*) from public.profiles)     as personel,
  (select count(*) from public.products)     as urunler,
  (select count(*) from public.orders)       as siparisler,
  (select count(*) from public.dining_tables) as masalar"

# Bekleyen fiş işleri: ajan açılınca basılırlar
pg psql -c "select status, count(*) from public.print_jobs group by status"
```

Eski, basılmaması gereken işler varsa ajanı açmadan önce iptal et:

```bash
pg psql -c "update public.print_jobs set status = 'failed', last_error = 'geri yükleme: eski iş' where status in ('pending', 'printing')"
```

Temizlik: `cd / && rm -rf /root/ramos-restore && unset PGPASSWORD`. `veri.sql` bütün verinin açık kopyasıdır, bırakma.

### Adım 4: Edge Functions, secret'lar ve Vault

Geliştirme bilgisayarında, kök `.env` yeni projeye çevrilmişken:

1. **Fonksiyonlar:** `supabase/functions/` altındaki her klasör için bir yayın komutu çalıştır.
   - `npm run fn:deploy -- admin-staff`
   - `npm run fn:deploy -- notify-ready --no-verify-jwt` (webhook'la çağrılır; JWT yerine `x-webhook-secret` doğrular)
2. **Function secret'ları:** `VAPID_PUBLIC_JWK`, `VAPID_PRIVATE_JWK`, `VAPID_SUBJECT`, `WEBHOOK_SECRET`. Değerler kök `.env`'de. İlk kurulumdaki gibi Management API ile yüklenir (`POST /v1/projects/<ref>/secrets`). **Eski VAPID anahtarlarını kullan.** Yeni anahtar üretirsen yedekten gelen push abonelikleri geçersiz olur; herkes bildirimi telefonda yeniden açmak zorunda kalır.
3. **Vault sırları** (`notify_ready_url`, `notify_ready_webhook_secret`): `node --env-file=.env scripts/setup-push.mjs`. Adres yeni projenin fonksiyon URL'sini göstermeli.

### Adım 5: Auth ayarları

Supabase panelinde Authentication bölümünü aç (ya da Management API `PATCH /v1/projects/<ref>/config/auth`):

- **Kayıt kapalı:** `disable_signup: true`
- **Site URL:** `https://ramos.arxdigitalsevice.com`

Personel parolaları yedekten geldiği için **aynı kalır**. Ancak eski oturumlar yeni projede geçersizdir; herkes bir kez yeniden giriş yapar.

### Adım 6: Ortam dosyaları

| Nerede | Dosya | Değiştirilecekler | Sonra |
|---|---|---|---|
| Geliştirme PC'si | kök `.env` | Adım 1'de yapıldı | — |
| Geliştirme PC'si | `apps/web/.env.production` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Web'i yeniden derleyip yayınla: `deploy/deploy-web.ps1` |
| Restoran PC'si | yazdırma ajanının `.env`'si | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Ajan hesabı yedekten geldiği için `AGENT_EMAIL` / `AGENT_PASSWORD` aynı kalır. Adım 3'teki fiş kontrolünden **sonra** ajanı yeniden başlat |
| Plesk sunucusu | `/opt/backups/ramos/.env` | `PGUSER=postgres.<yeni-ref>`, `PGPASSWORD`, gerekirse `PGHOST` | Aşağıdaki komutlarla güncelle ve elle bir yedek al |

Sunucudaki yedek `.env`'sini parolayı komut satırına yazmadan güncellemek için:

```bash
ssh -i ~/.ssh/tvds_deploy root@87.106.47.17
cd /opt/backups/ramos
read -rs -p 'Yeni proje DB parolası: ' P; echo
umask 077
printf 'PGHOST=%s\nPGPORT=5432\nPGUSER=%s\nPGPASSWORD=%s\nPGDATABASE=postgres\n' \
  'aws-0-eu-central-1.pooler.supabase.com' 'postgres.<yeni-ref>' "$P" > .env
unset P; chmod 600 .env
./backup.sh                                    # "ok …" görmelisin
```

`.env` tırnaksız `KEY=value` satırlarından oluşur; betik yalnız bu beş anahtarı okur.

### Adım 7: Görseller ve son kontrol

1. **Ürün görselleri:** Admin → Menü → **Toplu görsel yükleme**. Dosya adı ürün numarasıdır: `05.jpg`, `71a.webp`, `M1.png`.
2. **Garson:** Bir garson hesabıyla gir, test masasında sipariş ver.
3. **Mutfak:** Mutfak ekranında sipariş görünüyor mu, "hazır" olunca garsona bildirim geliyor mu?
4. **Fiş:** Yazıcıdan fiş çıkıyor mu?
5. **Admin:** Raporlarda eski günlerin cirosu görünüyor mu?

## 5. Kurulum özeti (sunucu)

Yedek sistemini sıfırdan kurmak gerekirse (proje klasöründen):

```bash
ssh -i ~/.ssh/tvds_deploy root@87.106.47.17 "mkdir -p /opt/backups/ramos && chmod 700 /opt/backups/ramos"
scp -i ~/.ssh/tvds_deploy deploy/backup/backup.sh root@87.106.47.17:/opt/backups/ramos/backup.sh
scp -i ~/.ssh/tvds_deploy deploy/backup/ramos-backup.cron root@87.106.47.17:/etc/cron.d/ramos-backup
ssh -i ~/.ssh/tvds_deploy root@87.106.47.17 "chmod 700 /opt/backups/ramos/backup.sh && chmod 644 /etc/cron.d/ramos-backup"
```

Ardından `.env`'yi adım 6'daki gibi oluştur ve `./backup.sh` ile dene.

**Dikkat edilecekler:**

- `backup.sh` ve `ramos-backup.cron` **LF** satır sonlu olmalı (repoda `.gitattributes` bunu sağlar).
- Cron dosyası `root` sahipli ve `644` olmalı, dosya sonunda boş satır bulunmalı.
- Aynı sunucudaki diğer projelerin yedeklerine (`/opt/backups/*`, tv-display-system 04:15) dokunma.

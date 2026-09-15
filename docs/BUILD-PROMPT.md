# Ramo's Sipariş Sistemi — BUILD PROMPT (Claude Code terminal oturumu)

> **Nasıl başlatılır:**
> 1. Proje klasöründe (`C:\Users\PC\Desktop\Ramos Menu System`) terminal aç, `claude` ile başlat (normal izin modu).
> 2. İlk mesaj: **"docs/BUILD-PROMPT.md dosyasını baştan sona oku ve talimatlarını uygula."**
> 3. Oturum önce **Faz A**'yı yürütür (yaklaşık 15–20 dk): her şeyi okur, bilgileri ve onayları **tek seferde** ister, kısa bir yürütme özeti sunar.
> 4. Özeti onaylayınca izin modunu **auto**'ya al ve **"başla"** yaz. **Faz B**'de projenin tamamı durmadan yapılır. Süre saatler sürebilir (10 saate kadar), sorun değil.
>
> Önerilen model: Opus 5 · effort: high (UI ve SQL görevlerinde xhigh).

---

## 0. Rolün ve hedefin

Sen bu projenin baş geliştiricisisin. **Ramo's Döner & Grill House (Frankfurt)** için garson sipariş sistemini sıfırdan kuracaksın:

- **Garson PWA'sı:** kendi telefonundan masa seçer, ürün, varyant, çıkarılacak malzeme, sos ve ekstra girer, "Mutfağa gönder"e basar.
- **Mutfak ekranı (KDS):** tablette sipariş kartları, HAZIR butonu, tükendi anahtarları.
- **Almanca mutfak fişi:** Xprinter XP-Q80A'ya ağ üzerinden (TCP 9100) basan Node.js yazdırma ajanı.
- **Admin paneli:** menü (ürün görselleri dahil), personel, masalar, siparişler, raporlar, ayarlar.
- **Backend:** Supabase (Auth, Postgres + RLS + RPC, Realtime Broadcast, Storage, Edge Functions, Web Push).

Tasarım kullanıcıyla bölüm bölüm konuşuldu ve **onaylandı**. Yeniden tasarlama; spec'i eksiksiz, test edilmiş ve yayında hâle getir.

Kullanıcının üç özel isteği var, her kararda gözet:
1. **Sade ve şık** bir ürün: garson, aşçı ve patron ilk bakışta anlamalı (§10).
2. **Kurulu tasarım skill'leri** kullanılacak (§10).
3. **Her ürünün görsel alanı** olacak; görseller şimdilik boş, kullanıcı sonra ekleyecek (§11).

---

## 1. Önce oku (sırayla, atlamadan)

1. `docs/superpowers/specs/2026-09-15-ramos-siparis-sistemi-design.md` — **onaylı spec, tek doğruluk kaynağı**
2. `docs/menu/ramos-menu-data.md` — menü seed verisi (107 ürün, seçim grupları, malzeme setleri, ayarlar)
3. Plan dosyaları (görev görev uygulanacak):
   - `docs/superpowers/plans/2026-09-15-ramos-plan-1-temel-ve-veritabani.md` → M0–M1 (Görev 1–9)
   - `docs/superpowers/plans/2026-09-15-ramos-plan-2-giris-ve-garson.md` → M2–M3 (Görev 10–15)
   - `docs/superpowers/plans/2026-09-15-ramos-plan-3-mutfak-ve-yazdirma.md` → M4–M5 (Görev 16–20)
   - `docs/superpowers/plans/2026-09-15-ramos-plan-4-admin-pwa-bildirim.md` → M6–M7 (Görev 21–26)
   - `docs/superpowers/plans/2026-09-15-ramos-plan-5-test-yayin-teslim.md` → M8 (Görev 27–30)
4. Bu dosyanın tamamı

Menü görselleri gerekirse `docs/menu/source/ramos-menu.pdf` dosyasındadır (git dışı, 8 görsel sayfa). poppler kurulu değil; sayfaları **PyMuPDF** ile render et.

---

## 2. Yürütme modeli ve çalışma yöntemi

### 2.1 Faz A — hazırlık (etkileşimli, tek tur)

1. §1'deki her şeyi oku. Plan dosyalarında en az görev başlıklarını, Interfaces bloklarını ve "Faz A" notlarını oku.
2. Ortamı doğrula ve sonuçları not et:
   - `node -v` ≥ 22
   - `git rev-parse --show-toplevel` = proje klasörü
   - `python -c "import pymupdf"`
   - Supabase MCP var mı (`list_organizations`)
   - Tasarım skill'leri listende var mı (§10)
3. Kök `.env` iskeletini oluştur (değerler boş). Kullanıcıdan **gizli değerleri dosyaya kendisinin yazmasını** iste: `SUPABASE_ACCESS_TOKEN`, `ADMIN_PASSWORD`. Sırlar sohbete yazılmaz.
4. §3'teki soruları **tek turda** sor (AskUserQuestion, en fazla 4'lü gruplar) ve ön onayları al.
5. Kısa bir **yürütme özeti** sun: 9 aşama; sunucuda yapılacak değişikliklerin tam listesi; sona kalacak fiziksel kontroller; beklenen süre.
6. Kullanıcıya şunu söyle:
   > "Onaylıyorsan izin modunu auto'ya al ve **başla** yaz. Bilgisayar fişe takılı kalsın ve uyku moduna geçmesin; terminali kapatma; yazıcı ağda kalsın."
7. "başla" gelince Faz A girdilerini `docs/BUILD-PROGRESS.md` başlığına yaz (sır yok) ve Faz B'ye geç.

### 2.2 Faz B — otonom yapım (kesintisiz)

- **Sıra:** Görev 1'den 30'a sırayla, **beklemeden** ilerle. Milestone sonlarında §8'deki raporu ilerleme dosyasına yaz, sohbete 3–5 satır özet geç, **onay bekleme**. Plan dosyalarındaki "kullanıcıya rapor ver" ifadeleri bu anlama gelir.
- **Soru sorma:** Belirsizlikte spec'e en uygun seçeneği uygula. Kararı `docs/BUILD-DECISIONS.md`'ye yaz: tarih, görev, karar, gerekçe.
- **Engel politikası:** Dış bir sebeple tamamlanamayan adımı `⏸ ertelendi` diye işaretle ve sebebini yaz. Örnekler:
  - yazıcıya ulaşılamıyor
  - DNS yayılmadı
  - auto mod bir komutu engelledi
  - servis kesintisi

  Bağımsız görevlerle **devam et**. Tüm görevler bitince ertelenenleri yeniden dene; hâlâ olmuyorsa §12'deki "Kullanıcıya kalan kontroller" listesine ekle.
- **Hız için asla:**
  - testleri atlama
  - `--no-verify` kullanma
  - "sonra düzeltirim" deme

  Başarısız test için `superpowers:systematic-debugging` uygula. Süre sınırı yok; kalite hızdan önce gelir.
- **Uzun süreçler:** Dev sunucusu, sahte yazıcı ve ajan arka planda çalışır; iş bitince kapatılır. `tsx watch` kullanma.
- **Sunucu güvenliği:** Plesk sunucusunda **yalnızca** §3'te onaylanan işlemler yapılır. Her sunucu komutu çalıştırılmadan önce ilerleme dosyasına yazılır.

### 2.3 Çalışma yöntemi (her görevde zorunlu)

1. **Plan görevlerini uygula.** `superpowers:subagent-driven-development` önerilir: her görev için taze bir alt ajan çalışır, iki aşamalı inceleme yapılır. Alternatif: `superpowers:executing-plans`.
   - Alt ajana görevi verirken şunları da ekle: bu dosyanın §5 (kısıtlar), §6 (tuzaklar), §10 (tasarım), §11 (görseller) bölümleri ve **Faz B kuralları** (durma, soru sorma).
   - Tamamlanan adımlar `- [ ]` → `- [x]` yapılır.
2. **TDD (`superpowers:test-driven-development`):** test yaz → kırmızı gör → en küçük uygulama → yeşil → commit. UI görevlerinde test = Testing Library + Playwright ekran görüntüsü.
3. **Kanıtsız "bitti" yok (`superpowers:verification-before-completion`):** komut çıktısı, test sonucu ve ekran görüntüsü yolu göster.
4. **Supabase işleri:** `supabase` ve `supabase-postgres-best-practices` skill'leri. Her migration'dan sonra `get_advisors` (security + performance) çalışır ve bulgular temizlenir.
5. **Spec ile plan çelişirse spec kazanır.** Spec'te olmayan özellik ekleme (YAGNI).
6. **Commit:** Her görev sonunda commit, **yalnızca bu proje klasöründe**. Son satır: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Push yok.
7. **Bağlam yönetimi:** Bağlam özetlenirse ya da oturum yeniden başlarsa önce `docs/BUILD-PROGRESS.md` ve `docs/BUILD-DECISIONS.md` okunur, ilk tamamlanmamış görevden devam edilir.

---

## 3. Faz A'da toplanacak bilgiler ve ön onaylar

| # | Konu | Ne sorulur / ne yapılır | Nereye yazılır |
|---|---|---|---|
| 1 | Supabase erişimi | Personal Access Token (supabase.com → Account → Access Tokens) | Kullanıcı `.env` → `SUPABASE_ACCESS_TOKEN` |
| 2 | Admin hesabı | Kullanıcı adı + görünen ad (sohbette); parola ≥ 10 karakter | Parola: kullanıcı `.env` → `ADMIN_PASSWORD`. Admin oluşturulunca bu satır silinir |
| 3 | Masa sayısı | Varsayılan 12 | `.env` → `SEED_TABLE_COUNT` |
| 4 | Personel e-posta alanı | Varsayılan `staff.arxdigitalsevice.com` (e-posta gönderilmez) | `.env` → `STAFF_EMAIL_DOMAIN` |
| 5 | Test yazıcısı | Xprinter Ethernet ile modeme bağlı mı? Self-test sayfasındaki IP (yazıcı kapalıyken FEED basılı → aç → 2–3 sn sonra bırak) ve listede 61 = PC857 var mı? | `.env` → `PRINTER_DEV_HOST` |
| 6 | Yayın | Alt alan adı (öneri `ramos.arxdigitalsevice.com`); DNS Plesk'te mi (harici ise kullanıcı `A` kaydını `87.106.47.17`'ye **şimdi** ekler); SSH anahtarıyla root erişimi (`~/.ssh/tvds_deploy`); Let's Encrypt e-postası | `.env` → `APP_DOMAIN`, `DEPLOY_SSH_KEY`, `LE_EMAIL` |
| 7 | Ön onaylar | Aşağıdaki listenin tamamı, tek seferde | `docs/BUILD-PROGRESS.md` → "Onaylananlar" |

**Ön onay listesi (Faz B'de tekrar sorulmaz):**
- **Supabase:**
  - `ramos-siparis` projesini oluşturma (Free, 0 $, Cicekci org, eu-central-1)
  - migration'lar, Storage bucket'ı, Edge Function yayınları, function secret'ları, Vault sırları
  - Auth ayarları (kayıt kapalı, site URL)
- **Plesk sunucusu:**
  - Yalnızca `<APP_DOMAIN>` alt alan adının oluşturulması, SSL, dosya yükleme ve sahiplik ayarı
  - `/opt/backups/ramos` klasörü ve `/etc/cron.d/ramos-backup` cron'u
  - **Başka hiçbir site, servis ya da ayar değiştirilmez.**
- **Veri:** Yayın öncesi test verisi temizliği (`scripts/go-live-cleanup.mjs --yes`).
- **Geliştirme PC'si:** Ajanın Zamanlanmış Görev olarak kurulup kaldırılması denemesi.

Fiziksel kontroller (gerçek fiş fotoğrafı, telefonda push, tablet kurulumu) **yapımı durdurmaz**; sona kalır (§12).

---

## 4. Ortam gerçekleri

- **Makine:** Windows 11 Pro, PowerShell 5.1 + Git Bash. Node **v24.18**, Python 3.12 + PyMuPDF. Supabase CLI ve Deno **kurulu değil**.
- **Repo:**
  - Proje klasörünün kendi git reposu var (commit'ler `7d9a7c9`, `222624a` ve sonrası: spec, menü verisi, plan).
  - Üst dizin `C:/Users/PC` başıboş bir ev dizini reposudur. **Git komutlarını daima proje klasöründe çalıştır.**
- **Supabase:**
  - Org **Cicekci** (`mdsctajrlrckvwhkcfnd`); oradaki **Cicek-web** projesine **DOKUNMA**.
  - Yeni proje `ramos-siparis`, `eu-central-1`, Free. **Management API ile oluşturulur:** `db_pass`'ı sen üretir ve `.env`'e yazarsın; M8'deki yedek bu parolayla kurulur.
  - SQL ve fonksiyon işleri Management API ile yapılır (`/database/query`, `/functions/deploy`, `/secrets`, `/config/auth`).
  - MCP (`get_advisors`, `generate_typescript_types`) kolaylık içindir.
  - Deno yok: fonksiyon mantığını saf TS modüllerine böl, Node'da Vitest ile test et.
- **Yazıcı:** Geliştirme PC'sinde Xprinter var (Windows adı **"XP-80"**, **USB001**). Restoranda **XP-Q80A** (USB + Ethernet). Ajan **yalnızca TCP 9100** kullanır.
- **Plesk sunucusu:** `87.106.47.17`, Ubuntu 24.04 (menu.arxdigitalsevice.com burada). Şunlara **dokunma:**
  - menupanels'in Supabase stack'i
  - tv-display-system Docker'ı (`/opt/tv-display-system`) ve 04:15 yedeği
  - diğer Plesk siteleri
  - global nginx ayarı

---

## 5. Global kısıtlar (her görevin gereksinimlerine dahildir)

- **Yığın:** Node ≥ 22 · TypeScript `strict: true` · React 19 · Vite · Tailwind CSS v4 · @supabase/supabase-js v2 · npm workspaces (`apps/web`, `apps/print-agent`, `packages/shared`)
- **Roller:** `admin | waiter | kitchen | printer`. Kayıt ekranı yok; `signUp` ve `resetPasswordForEmail` **hiç** çağrılmaz.
- **Rotalar:**
  - Giriş: `/login`
  - Garson: `/waiter`, `/waiter/table/:tableId`, `/waiter/table/:tableId/order`, `/waiter/ready`, `/waiter/profile`
  - Mutfak: `/kitchen`
  - Admin: `/admin`, `/admin/menu/*`, `/admin/staff`, `/admin/tables`, `/admin/orders`, `/admin/reports`, `/admin/settings`
- **Para:** Tam sayı **kuruş**; gösterim iki dilde de `8,50 €`.
- **Zaman:** Saat dilimi `Europe/Berlin`, tarih `dd.MM.yyyy HH:mm`. İş günü başlangıcı **05:00**. Sipariş numarası `#047`.
- **Kayıt silme yok:** Sipariş, kalem ve iptaller silinmez; ürünler arşivlenir.
- **Menü adları:**
  - Ürün adları menüdeki gibi tek dildir.
  - Kategori, malzeme ve seçenek adları DE + TR.
  - TR arayüzde masa adı "Tisch 12" → "Masa 12" (`localTableName`).
  - **Fiş her zaman Almanca.**
- **Fiş biçimi:** 80 mm, **48 kolon**, fiyat yok, içecekler en sonda "GETRÄNKE" başlığıyla.
- **Fiş komutları:** `ESC @` + `FS .` + `ESC t 61`; kesim: besleme + `GS V 66 0`.
- **Ajan:**
  - TCP 9100; bağlanma zaman aşımı 3 sn, durum yanıtı 1 sn. İşler tek tek basılır.
  - Kuyruk kontrolü 5 sn, heartbeat 30 sn, boşta yazıcı kontrolü 15 sn; 90 sn sinyal yoksa "çevrimdışı".
  - Yeniden deneme 5/15/30/60/120 sn; 6. denemeden sonra `failed`.
  - Yazıcı sorunluyken iş sahiplenmez.
  - **Printer rolündeki kullanıcıyla** çalışır; `service_role` ajanda yok.
- **Zaman pencereleri:** HAZIR'ı geri alma 30 sn. `claim_print_job`, 60 sn'den uzun süredir `printing` durumunda kalan işi geri alır.
- **Kimlik doğrulama:**
  - Garson ve mutfak PIN'i ≥ 6 hane, admin parolası ≥ 10 karakter.
  - Sentetik e-posta `<username>@<STAFF_EMAIL_DOMAIN>`.
- **Realtime:** Broadcast from Database (private kanallar). Konular: `orders`, `menu`, `print-jobs`, `printer-status`, `settings`. Olay = tazele sinyali; `postgres_changes` kullanılmaz.
- **Push:**
  - Hedef: mesaide olan aktif waiter + admin.
  - Kütüphane: `jsr:@negrel/webpush` ya da `@pushforge/builder`.
  - `notify-ready`: `verify_jwt = false`, `x-webhook-secret` doğrular, sır Vault'ta.
- **Ürün görselleri (§11):**
  - `products.image_path`; Storage `product-images` (herkese açık okuma, yalnızca admin yazar).
  - Görseller **şimdilik boş**, arayüz düzgün bir yer tutucu gösterir.
  - Yükleme WebP (1200 px + 320 px küçük sürüm). Toplu yüklemede dosya adı = ürün numarası.
- **Tasarım (§10):**
  - Tokenlar: `--bg #0A0A0A`, `--surface #141414`, `--surface-2 #1C1C1C`, `--border #2A2A2A`, `--text #F5F5F0`, `--muted #A3A3A3`, `--lime #88B600`, `--gold #C49736`, `--danger #E5484D`, `--warning #F5A524`, `--info #3E9BFF`
  - Yazı tipi: Montserrat. Dokunma hedefleri ≥ 48 px, WCAG AA.
  - Ürün **sade ve herkesin anlayacağı** biçimde; tasarım skill'leri zorunlu.
- **Diller:** `tr` + `de` (react-i18next).
- **Sırlar:** `.env` dosyaları commit edilmez. `service_role` yalnızca `scripts/` ve Edge Functions'ta.

---

## 6. Bilinen tuzaklar — mutlaka uygula

**Xprinter / ESC/POS**
- **Karakter tablosu:** Xprinter'da PC857 = **`ESC t 61`** (Epson'daki 13 değil).
- **Çince modu ve sıfırlama:** Her `ESC @` sonrasında **`FS .` (0x1C 0x2E)** gönderilir, yoksa umlaut'lar Çince karakter olarak basılır. `ESC @` karakter tablosunu da sıfırlar, bu yüzden **her init sonrası `ESC t 61` tekrarlanır**.
- **Kütüphane:** `@point-of-sale/receipt-printer-encoder` 3.x, `printerModel: 'xprinter-xp-t80q'` ile. Mutlaka `codepageMapping: { cp437: 0, cp858: 19, windows1252: 16, cp857: 61 }` verilir.
- **Kesim ve zil:** Yalnızca kısmi kesim var (`GS V 66 0`). Zil yok, sesli uyarıyı KDS verir.
- **Ağ:** Aynı anda tek iş kabul eder; her iş için bir bağlantı açılır. Fabrika IP'si `192.168.123.100`.
- **Yazıldı ≠ basıldı:** TCP'ye yazmanın başarılı olması "basıldı" demek değildir. Gönderimden önce ve sonra `DLE EOT 1/2/4` durum sorgusu yapılır. Yanıt gelmezse durum "bilinmiyor" sayılır, "offline" değil.
- **Yedek:** Türkçe karakter bozuksa önce `ESC t 91` (WPC1254), sonra transliterasyon.

**Supabase**
- **Önce izin, sonra oku:** Bir tabloya insert yapıp aynı istekte `.select()` ile satırı geri istemek, SELECT izni olmayan rolde RLS hatası verir. Yazma işlemleri RPC'dir.
- **RLS rolü:** Politikalar **`authenticated`** rolüne yazılır.
- **`auth.users`'a SQL ile satır ekleme** (GoTrue 500 döner); `auth.admin.createUser` kullan.
- **Broadcast:** Private kanal + `realtime.messages` üzerinde SELECT politikası + `setAuth()`.
- **Free plan:** 7 gün düşük aktivitede proje uyur (ajanın 5 sn'lik sorgusu engeller). Yedek yok, M8'de Plesk'te `pg_dump` kurulur. Storage 1 GB; WebP görseller bunun çok altında kalır.
- **Storage:** `remove()` için **select + delete** politikası gerekir. Dosyaları üzerine yazmak yerine zaman damgalı yeni ad ver: önbellek kendiliğinden tazelenir, `upsert` gerekmez.
- **`security definer`:** Hepsinde `set search_path = ''`. Toplu `grant … to authenticated` bloğundan sonra `ready_push_targets` yeniden daraltılır.

**Web / PWA / Push**
- **iOS push:** Yalnızca ana ekrana eklenmiş PWA'da (16.4+), izin kullanıcı dokunuşuyla. iOS'ta `navigator.vibrate` yok.
- **Güvenli bağlam:** Push yalnızca HTTPS ya da `localhost`'ta çalışır. LAN IP'si güvenli bağlam değildir, gerçek telefon testi yayından sonra yapılır.
- **Wake Lock:** `visibilitychange` olayında yeniden istenir. Ses, kullanıcı etkileşimiyle açılır.
- **Service worker:** vite-plugin-pwa `injectManifest` ile. `sw.js` ve `index.html` asla uzun süre önbelleğe alınmaz.
- **Büyük harf:** CSS `text-transform: uppercase` + `lang="tr"` "i" harfini "İ" yapar. Almanca metin kapsayıcılarına `lang="de"` ver.

**Windows / PowerShell**
- `.ps1` dosyaları **UTF-8 BOM'lu** kaydedilir.
- PowerShell 5.1'de `&&` yoktur.

**Plesk**
- Özel nginx yönergelerinde **`location ~ ^/`** regex kalıbı kullanılır.
- Belge kökü dosyalarının sahipliği aboneliğin sistem kullanıcısına verilir (`chown -R <sysuser>:psacln`).

---

## 7. Milestone akışı

| Aşama | Plan · Görevler | Çıkış ölçütü |
|---|---|---|
| M0 | Plan 1 · Görev 1–2 | Monorepo kuruldu, `npm run check` yeşil, Supabase projesi erişilebilir |
| M1 | Plan 1 · Görev 3–9 | Şema (görsel alanı dahil), RLS, Storage bucket, RPC'ler, broadcast; seed 107 ürün; `npm run db:test` yeşil; advisors temiz |
| M2 | Plan 2 · Görev 10–12 | 4 rolle giriş, rol yönlendirme, TR/DE, veri katmanı + realtime |
| M3 | Plan 2 · Görev 13–15 | Garson akışının tamamı (görsel yer tutucular dahil) + **tasarım kapısı** (§10) |
| M4 | Plan 3 · Görev 16 | KDS canlı (≤ 2 sn), HAZIR/geri al + **tasarım kapısı** |
| M5 | Plan 3 · Görev 17–20 | Ajan sahte yazıcıda yeşil; `PRINTER_DEV_HOST` varsa gerçek fişler basıldı (fotoğraf onayı sona) |
| M6 | Plan 4 · Görev 21–24 | Admin paneli (görsel yükleme + toplu yükleme dahil) + **tasarım kapısı** |
| M7 | Plan 4 · Görev 25–26 | PWA kurulabiliyor; push hattı sunucu tarafında doğrulandı; mesai anahtarı |
| M8 | Plan 5 · Görev 27–30 | E2E yeşil; Plesk'te SSL ile canlı; yedek cron'u; `docs/KURULUM.md`; son rapor + kalan kontroller |

---

## 8. İlerleme dosyası ve rapor biçimi

`docs/BUILD-PROGRESS.md` (commit edilir, sır içermez):
```
# Build ilerlemesi
## Faz A girdileri (sırsız özet) ve onaylananlar
…
## Görevler
- [x] Görev 1 — monorepo iskeleti — a1b2c3d — `npm run check` ✓
- [ ] Görev 2 — …
- ⏸ Görev 20 / Adım 4 — ertelendi: yazıcıya ulaşılamadı (192.168.1.50:9100 timeout)
## Milestone raporları
### M1 tamamlandı — Veritabanı
- Yapılanlar: … · Kanıt: `npm run db:test` ✓ (N test) · Açık: …
## Kullanıcıya kalan kontroller
(§12 şablonu)
```
Sohbete milestone başına 3–5 satırlık özet yazılır; **beklenmez**.

---

## 9. Tamamlanma tanımı (Definition of Done)

- [ ] 30 plan görevinin tamamı `[x]` (ertelenenler gerekçesiyle listede); spec §1.1'deki her madde çalışıyor
- [ ] `npm run check` (lint + typecheck + unit + build) yeşil; `npm run db:test` yayından önce yeşil; Playwright E2E yeşil; ekran görüntüleri `docs/screenshots/`
- [ ] Supabase advisors temiz; anon erişimi sıfır; RLS ve Storage rol testleri yeşil
- [ ] **Ürün görselleri:** her yerde yer tutucu düzgün; admin tek tek ve toplu yükleme çalışıyor (E2E ile doğrulandı); seed görsel alanına dokunmuyor
- [ ] **Tasarım kapıları (M3, M4, M6) geçti:** `design:design-critique` + `design:accessibility-review` kritik bulgusu kalmadı
- [ ] Ajan sahte yazıcıda yeşil; gerçek Xprinter'da TESTDRUCK + sipariş + STORNO + TISCHWECHSEL basıldı (ya da ertelendi ve listede)
- [ ] Web uygulaması Plesk'te SSL ile yayında; SPA yönlendirmesi ve önbellek başlıkları doğru
- [ ] Gecelik yedek cron'u kurulu; bir yedek alındı ve `pg_restore --list` ile doğrulandı
- [ ] `docs/KURULUM.md` (Türkçe) yazıldı; `docs/BUILD-PROGRESS.md` içinde "Kullanıcıya kalan kontroller" listesi eksiksiz
- [ ] Son rapor: canlı adres, hesapların **nerede** saklandığı (değerleri değil), ajanın nasıl kurulacağı, görsellerin nasıl ekleneceği, açık noktalar

---

## 10. Tasarım: zorunlu skill'ler ve sadelik ilkeleri

**Skill'ler.** Oturumdaki skill listesinde nasıl görünüyorsa o adla çağır; bir tanesi yoksa en yakınını kullan ve `BUILD-DECISIONS.md`'ye yaz.

| Skill | Ne zaman |
|---|---|
| `ui-ux-pro-max` | Görev 11'de design system (`--design-system`); her ekranı yazmadan önce ilgili UX kontrol listesi |
| `frontend-design` | Sanat yönü: şablon görünümünden kaçın, marka (kara tahta + lime + altın) sade ve özgün yansısın |
| `ui-styling` | shadcn/Tailwind bileşen kalıpları, erişilebilir primitive'ler (Sheet, Dialog, Tabs …) |
| `design-system` | Token katmanları (temel → anlamsal → bileşen) |
| `motion-framer` | Mikro animasyonlar: sepete ekleme, gönderildi, hazır nabzı; `prefers-reduced-motion` |
| `dataviz` | Admin canlı durum ve rapor ekranları |
| `design:ux-copy` | Tüm TR/DE arayüz metinleri: kısa, günlük dil, hata mesajları |
| `design:accessibility-review` | Tasarım kapılarında WCAG AA denetimi |
| `design:design-critique` | Tasarım kapılarında ekran görüntüleri üzerinden eleştiri ve düzeltme |
| `webapp-testing` | Playwright ekran görüntüleri: 390×844, 1280×800, 1440×900 |

`ui-ux-pro-max` betiği bozuk symlink hatası verirse şu adımlarla düzelt:
1. `github.com/nextlevelbuilder/ui-ux-pro-max-skill` reposunu klonla.
2. `src/ui-ux-pro-max/{scripts,data}` klasörlerini skill klasörüne kopyala.

**Sadelik ilkeleri (her ekranda):**
1. **Tek ana eylem:** Her ekranda bir tane, büyük ve belirgin (ör. "Mutfağa gönder", "HAZIR").
2. **Günlük dil:** "Mutfağa gönder", "Hazır", "Teslim edildi", "Masayı kapat". Teknik terim yok (RPC, sync, session …).
3. **İkon + yazı:** İkon her zaman yazıyla birlikte; yalnız ikonlu buton yok (geri ve kapat hariç).
4. **Sığ yapı:** En fazla 2 seviye derinlik; "geri" hep aynı yerde.
5. **Renk anlamı sabit:** lime = aktif/devam, altın = hazır, kırmızı = çıkar/iptal/hata, gri = boş.
6. **Yazı boyutu:** Garsonda gövde ≥ 16 px, ürün adı ≥ 17 px, fiyat tabular; mutfakta kalem satırı ≥ 22 px; admin gövde ≥ 14 px.
7. **Az şey göster:** Telefonda tablo yok; kart ve liste. Ayrıntı dokununca açılır.
8. **Boş durumlar yol gösterir:** "Bu masada sipariş yok — **Sipariş al**".
9. **Hata mesajları iki şey söyler:** ne oldu ve ne yapılmalı. Örnek: "İnternet yok — sepet saklandı, bağlantı gelince gönder."
10. **Hız hedefi:** Ürün eklemek en fazla 3 dokunuş; yeni bir garson 5 dakikada öğrenebilmeli.
11. **Görselli ve görselsiz aynı düzen:** Görsel yokken yer tutucu şık dursun, görsel gelince düzen kaymasın (sabit en-boy oranı).

**Tasarım kapısı (M3, M4, M6 sonunda, otonom):**
1. İlgili ekranların görüntülerini al.
2. `design:design-critique` ve `design:accessibility-review` çalıştır.
3. **Kritik ve yüksek** bulguları düzelt, görüntüleri yenile.
4. Bulguları ve düzeltmeleri ilerleme dosyasına yaz.

---

## 11. Ürün görselleri

- **Veri:** `products.image_path text null` → Storage `product-images` içindeki yol: `products/<productId>-<zaman>.webp`, küçük sürüm aynı adın `-thumb.webp` hâli. **Seed bu alana dokunmaz**; tüm ürünler görselsiz başlar.
- **Erişim:** Bucket herkese açık okunur (menü görselleri gizli değil). Yükleme, silme ve listeleme yalnızca admin yapar (`storage.objects` politikaları; Görev 4).
- **Garson arayüzü (Görev 14):**
  - Ürün satırında solda 56 px kare küçük görsel, ürün panelinin üstünde 4:3 geniş görsel.
  - Görsel yoksa marka renklerinde yer tutucu (alev işareti + ürün numarası).
  - `loading="lazy"`, sabit boyut. KDS'de görsel yok.
- **Admin (Görev 22):**
  - Ürün editöründe yükle / değiştir / kaldır. Tarayıcıda WebP'ye sıkıştırılır: 1200 px + 320 px, kalite ≈ 0,82. Eski dosya silinir.
  - **Toplu yükleme:** Çok sayıda dosya bırakılır; dosya adı ürün numarasıyla eşleşir (`05.jpg`, `71a.webp`, `M1.png`). Eşleşmeyenler listelenir, yükleme sırayla ve ilerleme çubuğuyla yapılır.
  - Ürün listesinde **"Görseli yok (N)"** filtresi.

---

## 12. "Kullanıcıya kalan kontroller" şablonu (`BUILD-PROGRESS.md` sonuna)

```
## Kullanıcıya kalan kontroller
- [ ] Gerçek fiş fotoğrafları: TESTDRUCK, sipariş, STORNO, TISCHWECHSEL (Görev 20) — Türkçe/Almanca karakterler doğru mu?
- [ ] Telefonda kilitli ekran push testi: Android (ve varsa iPhone, ana ekrana ekleyerek) (Görev 28)
- [ ] Mutfak tableti: ana ekrana ekle, ekran zaman aşımı "hiçbir zaman", ses açık (KURULUM §4)
- [ ] Restoran PC'si: ajan kurulumu + XP-Q80A'nın ağa bağlanıp IP ayarı (KURULUM §2–3)
- [ ] Ürün görselleri: Admin → Menü → Toplu görsel yükleme (dosya adı = ürün numarası)
- [ ] Menüdeki açık noktalar (docs/menu/ramos-menu-data.md §6) ve gerçek masa sayısı
- [ ] TSE / Steuerberater teyidi (spec §1.4)
- [ ] Ertelenen görevler: … (sebep + ne yapılmalı)
```

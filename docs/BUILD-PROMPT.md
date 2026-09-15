# Ramo's Sipariş Sistemi — BUILD PROMPT (Claude Code terminal oturumu)

> **Nasıl başlatılır:** Proje klasöründe (`C:\Users\PC\Desktop\Ramos Menu System`) terminal aç → `claude` → ilk mesaj:
> **"docs/BUILD-PROMPT.md dosyasını baştan sona oku ve talimatlarını uygula."**
> Önerilen model: Opus 5 · effort: high (UI ve SQL görevlerinde xhigh). Uzun oturum; bağlam dolarsa kaldığın plan görevinden devam et.

---

## 0. Rolün ve hedefin

Sen bu projenin baş geliştiricisisin. **Ramo's Döner & Grill House (Frankfurt)** için garson sipariş sistemini sıfırdan kuracaksın:

- **Garson PWA'sı:** kendi telefonundan masa seçer, ürün, varyant, çıkarılacak malzeme, sos ve ekstra girer, "Mutfağa gönder"e basar.
- **Mutfak ekranı (KDS):** tablette sipariş kartları, HAZIR butonu, tükendi anahtarları.
- **Almanca mutfak fişi:** Xprinter XP-Q80A'ya ağ üzerinden (TCP 9100) basan Node.js yazdırma ajanı.
- **Admin paneli:** menü, personel, masalar, siparişler, raporlar, ayarlar.
- **Backend:** Supabase (Auth, Postgres + RLS + RPC, Realtime Broadcast, Edge Functions, Web Push).

Tasarım kullanıcıyla bölüm bölüm konuşuldu ve **onaylandı**. Yeniden tasarlama; spec'i eksiksiz, test edilmiş ve yayında hâle getir.

---

## 1. Önce oku (sırayla, atlamadan)

1. `docs/superpowers/specs/2026-09-15-ramos-siparis-sistemi-design.md` — **onaylı spec, tek doğruluk kaynağı**
2. `docs/menu/ramos-menu-data.md` — menü seed verisi (107 ürün, seçim grupları, malzeme setleri, ayarlar)
3. Plan dosyaları — görev görev uygulanacak:
   - `docs/superpowers/plans/2026-09-15-ramos-plan-1-temel-ve-veritabani.md` → M0–M1 (Görev 1–9)
   - `docs/superpowers/plans/2026-09-15-ramos-plan-2-giris-ve-garson.md` → M2–M3 (Görev 10–15)
   - `docs/superpowers/plans/2026-09-15-ramos-plan-3-mutfak-ve-yazdirma.md` → M4–M5 (Görev 16–20)
   - `docs/superpowers/plans/2026-09-15-ramos-plan-4-admin-pwa-bildirim.md` → M6–M7 (Görev 21–26)
   - `docs/superpowers/plans/2026-09-15-ramos-plan-5-test-yayin-teslim.md` → M8 (Görev 27–30)
4. Bu dosyadaki kurallar (§2), onay noktaları (§3), ortam gerçekleri (§4), global kısıtlar (§5) ve tuzaklar (§6)

Menü görselleri gerekirse `docs/menu/source/ramos-menu.pdf` dosyasındadır (git dışı, 8 görsel sayfa). poppler kurulu değil. Sayfaları **PyMuPDF** ile render et (`python -c "import pymupdf"` çalışıyor).

---

## 2. Çalışma yöntemi (zorunlu)

1. **Plan görevlerini sırayla uygula.** `superpowers:subagent-driven-development` önerilir: her görev için taze bir alt ajan çalışır, iki aşamalı inceleme yapılır. Alternatif `superpowers:executing-plans`. Görevlerdeki `- [ ]` adımlarını takip et, bitince `- [x]` yap.
2. **TDD (`superpowers:test-driven-development`):**
   - Önce test yazılır ve kırmızı olduğu görülür.
   - Sonra en küçük uygulama yazılır ve test yeşile döner.
   - Sonra commit edilir.
   - UI görevlerinde test = Testing Library + Playwright ekran görüntüsü.
3. **Kanıtsız "bitti" yok (`superpowers:verification-before-completion`):** Komut çıktısı, test sonucu ve ekran görüntüsü yolu göster.
4. **Hata çıkarsa `superpowers:systematic-debugging`** kullan. Tahminle yama yapma.
5. **UI işleri:**
   - `ui-ux-pro-max` ile design system kurulur; `frontend-design` ve `ui-styling` (shadcn/Tailwind) kullanılır.
   - Her ekran `webapp-testing` (Playwright) ile ekran görüntüsü alınarak doğrulanır: telefon **390×844**, tablet **1280×800**, masaüstü **1440×900**.
6. **Supabase işleri:** `supabase` ve `supabase-postgres-best-practices` skill'leri kullanılır. Her migration'dan sonra `get_advisors` (security + performance) çalıştırılır; bulgular temizlenir.
7. **Spec ile plan çelişirse spec kazanır.** Spec'te olmayan özellik ekleme (YAGNI). Gerçek bir belirsizlikte kullanıcıya **Türkçe** sor.
8. **Commit disiplini:**
   - Küçük ve sık commit at, **sadece bu proje klasöründe**.
   - Mesaj İngilizce ya da Türkçe olabilir; son satır: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
   - Kullanıcı istemedikçe push yok.
9. **Milestone sonu:**
   - `npm run check` yeşil olmalı, milestone çıkış ölçütü sağlanmalı.
   - Kullanıcıya kısa Türkçe rapor ver (biçim §8).
   - §3'teki onay noktası varsa **dur ve onay bekle**.

---

## 3. Kullanıcıya soracakların ve onay noktaları

| Ne zaman | Ne sorulacak / onaylatılacak |
|---|---|
| M0 · Görev 2 | Supabase projesini oluşturmak için onay (Free, 0 $). Supabase MCP yoksa bir **Personal Access Token** iste; token'ı hiçbir dosyaya yazma, sadece `.env` içinde tut. |
| M2 · Görev 10 | İlk **admin kullanıcı adı + parolası** (≥ 10 karakter). `STAFF_EMAIL_DOMAIN` teyidi (varsayılan `staff.arxdigitalsevice.com`). **Masa sayısı** (varsayılan Tisch 1–12). |
| M5 · Görev 20 | Test Xprinter'ının **Ethernet ile modeme bağlanması** ve self-test sayfasındaki IP. Gerçek fişlerin fotoğrafla onayı (TESTDRUCK, sipariş, STORNO, TISCHWECHSEL). |
| M8 · Görev 28 | Telefonla push testi — **HTTPS yayından sonra** (Android şart, iPhone varsa ana ekrana ekleyerek). LAN IP'si güvenli bağlam olmadığı için push geliştirme ortamında telefonla denenemez. |
| M8 · Görev 28–29 | Uygulamanın **alt alan adı** (öneri `ramos.arxdigitalsevice.com`), Plesk **SSH erişimi** teyidi, yayına alma ve yedek cron'u için onay. |

**Kural:** Dış dünyaya dokunan her işlemden önce onay al. Bunlar: proje oluşturma, Edge Function yayını, sunucuda dosya veya ayar değişikliği, DNS/SSL, cron. Onay tek işlem içindir, sonraki işlemlere genellenmez.

---

## 4. Ortam gerçekleri

- **Makine:** Windows 11 Pro. Kabuk olarak PowerShell 5.1 ve Git Bash var. Node **v24.18**, Python 3.12 + PyMuPDF. Supabase CLI ve Deno **kurulu değil**.
- **Repo:**
  - Proje klasörünün kendi git reposu var (ilk commit `7d9a7c9`: spec + menü verisi + `.gitignore`).
  - Üst dizin `C:/Users/PC` başıboş bir ev dizini reposudur. **Git komutlarını daima proje klasöründe çalıştır, üst repoya asla dokunma.**
- **Supabase:**
  - MCP org **Cicekci** (`mdsctajrlrckvwhkcfnd`) görünüyor. Oradaki tek aktif proje **Cicek-web**'dir — **DOKUNMA**.
  - Yeni proje: ad `ramos-siparis`, bölge `eu-central-1`, Free plan.
  - DB ve function işleri iki yoldan yapılır:
    1. **Tercih edilen — MCP:** `apply_migration`, `execute_sql`, `deploy_edge_function`, `get_advisors`, `generate_typescript_types`.
    2. **MCP yoksa — Management API:** `POST https://api.supabase.com/v1/projects/{ref}/database/query` (SQL), `POST …/functions/deploy?slug=…` (multipart), `POST /v1/projects` (oluşturma). `Authorization: Bearer <PAT>` başlığıyla çağrılır.
  - Edge Function'lar Deno ile yazılır ama yerelde Deno yok: fonksiyonları saf ve test edilebilir TS modüllerine böl, mantığı Vitest ile Node'da test et.
- **Yazıcı:**
  - Geliştirme PC'sinde bir Xprinter bağlı: Windows yazıcı adı **"XP-80"**, port **USB001**.
  - Restoranda **XP-Q80A** (USB + Ethernet) var.
  - Ajan **yalnızca TCP 9100** kullanır.
- **Plesk sunucusu:** `87.106.47.17`, Ubuntu 24.04 (menu.arxdigitalsevice.com burada). SSH anahtarı büyük olasılıkla `~/.ssh/tvds_deploy` — **kullanıcıya teyit ettir**. Sunucuda şunlar çalışıyor, **dokunma**:
  - menupanels'in Supabase stack'i
  - tv-display-system Docker'ı (`/opt/tv-display-system`) ve onun 04:15 yedeği
  - diğer 5 Plesk sitesi
  - global nginx ayarı

---

## 5. Global kısıtlar (her görevin gereksinimlerine dahildir)

- **Yığın:** Node ≥ 22 · TypeScript `strict: true` · React 19 · Vite · Tailwind CSS v4 · @supabase/supabase-js v2 · npm workspaces (`apps/web`, `apps/print-agent`, `packages/shared`)
- **Roller:** `admin | waiter | kitchen | printer`. Kayıt ekranı yok. `signUp` ve `resetPasswordForEmail` **hiç** çağrılmaz.
- **Rotalar:**
  - Giriş: `/login`
  - Garson: `/waiter`, `/waiter/table/:tableId`, `/waiter/table/:tableId/order`, `/waiter/ready`, `/waiter/profile`
  - Mutfak: `/kitchen`
  - Admin: `/admin`, `/admin/menu/*`, `/admin/staff`, `/admin/tables`, `/admin/orders`, `/admin/reports`, `/admin/settings`
- **Para:** Tam sayı **kuruş**. Gösterim: iki dilde de `8,50 €` (`Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`).
- **Zaman:**
  - Saat dilimi `Europe/Berlin`; tarih `dd.MM.yyyy HH:mm`.
  - İş günü başlangıcı **05:00**.
  - Sipariş numarası 3 hanelidir: `#047`.
- **Kayıt silme yok:** Siparişler, kalemler ve iptaller silinmez. Ürünler arşivlenir (`archived_at`).
- **Menü adları:**
  - Ürün adları menüdeki gibi tek dildir.
  - Kategori, malzeme ve seçenek adları `name_de` + `name_tr`; `name_tr` boşsa `name_de` gösterilir.
  - **Fiş her zaman Almanca.**
- **Fiş biçimi:** 80 mm, **48 kolon** (Font A), fiyat yok. İçecekler en sonda "GETRÄNKE" başlığıyla gelir.
- **Fiş komutları:**
  - Init: `ESC @` + `FS .`, sonra `ESC t 61` (PC857).
  - Kesim: besleme + `GS V 66 0` (kısmi).
- **Ajan:**
  - TCP 9100; bağlanma zaman aşımı **3 sn**, durum yanıtı zaman aşımı **1 sn**.
  - İşleri **tek tek** basar.
  - Kuyruk kontrolü **5 sn**, heartbeat **30 sn**, boşta yazıcı kontrolü **15 sn**. **90 sn** sinyal yoksa "çevrimdışı" sayılır.
  - Yeniden deneme **5/15/30/60/120 sn**; 6. denemeden sonra `failed`.
  - Ajan **printer rolündeki kullanıcıyla** giriş yapar; `service_role` anahtarı ajanda **yok**.
- **Zaman pencereleri:** HAZIR'ı geri alma penceresi **30 sn**. `claim_print_job` 60 sn'den uzun süredir `printing` durumunda kalan işi geri alır.
- **Kimlik doğrulama:**
  - Garson ve mutfak PIN'i ≥ 6 hane, admin parolası ≥ 10 karakter.
  - Sentetik e-posta `<username>@<STAFF_EMAIL_DOMAIN>`, varsayılan `staff.arxdigitalsevice.com`. Bu adreslere e-posta **gönderilmez**.
- **Realtime:**
  - Yöntem: **Broadcast from Database**, özel (private) kanallarla.
  - Konular: `orders`, `menu`, `print-jobs`, `printer-status`, `settings`.
  - İstemci: `realtime: { worker: true }`. Olay yalnızca "tazele" sinyalidir, veri REST'ten okunur.
  - `postgres_changes` **kullanılmaz**.
- **Push:**
  - Hedef: mesaide olan aktif `waiter` + `admin` kullanıcıları.
  - Kütüphane: `jsr:@negrel/webpush` ya da `@pushforge/builder`. `npm:web-push` **kullanılmaz**.
  - `notify-ready` fonksiyonu `verify_jwt = false` ile çalışır ve `x-webhook-secret` başlığını doğrular; sır Vault'ta.
- **Tasarım tokenları:**
  - Zemin ve yüzeyler: `--bg #0A0A0A` · `--surface #141414` · `--surface-2 #1C1C1C` · `--border #2A2A2A`
  - Metin: `--text #F5F5F0` · `--muted #A3A3A3`
  - Vurgular: `--lime #88B600` · `--gold #C49736`
  - Durum renkleri: `--danger #E5484D` · `--warning #F5A524` · `--info #3E9BFF`
  - Yazı tipi: Montserrat (yerel, @fontsource).
  - Dokunma hedefleri ≥ 48 px, kontrast WCAG AA.
- **Diller:** `tr` + `de` (react-i18next).
- **Sırlar:** `.env` dosyaları commit edilmez. `service_role` yalnızca `scripts/` ve Edge Functions'ta kullanılır.

---

## 6. Bilinen tuzaklar — mutlaka uygula

**Xprinter / ESC/POS**
- **Karakter tablosu:** Xprinter'da PC857 = **`ESC t 61`** (Epson'daki 13 değil).
- **Çince modu:** Fabrikada açık gelir. Her `ESC @` sonrasında **`FS .` (0x1C 0x2E)** gönderilmezse umlaut'lar Çince karakter olarak basılır. `ESC @` karakter tablosunu da sıfırlar, bu yüzden **her init sonrası `ESC t 61` tekrarlanır**.
- **Kütüphane:** `@point-of-sale/receipt-printer-encoder` 3.x, `printerModel: 'xprinter-xp-t80q'` ile. Yerleşik Xprinter haritasında Türkçe tablo yok; mutlaka şunu ver: `codepageMapping: { cp437: 0, cp858: 19, windows1252: 16, cp857: 61 }`.
- **Kesim ve zil:** Tam kesim yok, sadece `GS V 66 0` (kısmi) kullan. XP-Q80A'da zil yok; sesli uyarıyı KDS verir.
- **Ağ:** Aynı anda tek iş kabul eder, bu yüzden her iş için bir bağlantı açılır ve işler sırayla gönderilir. Fabrika IP'si `192.168.123.100`. Self-test için yazıcı kapalıyken FEED'e basılı tut, aç, 2–3 sn sonra bırak.
- **Yazıldı ≠ basıldı:** TCP'ye yazmanın başarılı olması "basıldı" demek değildir. Gönderimden önce ve sonra `DLE EOT 1/2/4` durum sorgusu yapılır. Yanıt gelmezse durum "bilinmiyor" sayılır, "offline" değil.
- **Yedek:** Test sayfasında Türkçe karakter bozuksa önce `ESC t 91` (WPC1254) denenir, o da olmazsa transliterasyon açılır (ş→s, ğ→g, ı→i, İ→I, Ş→S, Ğ→G).

**Supabase**
- **Önce izin, sonra oku:** Bir tabloya insert yapıp aynı istekte `.select()` ile satırı geri istemek, SELECT izni olmayan rolde RLS hatası verir. Bu projede yazma işlemleri RPC'dir; RPC dışı bir insert gerekirse `.select()` zincirleme.
- **RLS rolü:** Politikalar **`authenticated`** rolüne yazılır (anon değil). Oturum açmış kullanıcı anon politikalarına takılmaz ama anon politikasından da yararlanamaz.
- **`auth.users`'a SQL ile satır ekleme.** Token kolonları NULL kalınca GoTrue giriş sırasında 500 döner. Kullanıcıyı her zaman `auth.admin.createUser` ile oluştur.
- **Broadcast from Database:**
  - Private kanal gerekir, `realtime.messages` üzerinde SELECT politikası tanımlanmalıdır.
  - İstemci abone olmadan önce oturum token'ını Realtime'a iletir (`supabase.realtime.setAuth()`). Trigger `realtime.broadcast_changes(...)` çağırır.
- **Free plan:**
  - 7 gün düşük aktivitede proje uyur; ajanın 5 sn'lik REST sorgusu bunu engeller.
  - Yedek yoktur, M8'de Plesk'te gecelik `pg_dump` kurulur.
- **RPC hataları:** `raise exception using message = '<anahtar>', errcode = 'P0001'` ile döner. İstemci `error.message` alanını i18n anahtarı olarak çevirir.
- **`security definer` fonksiyonlar:** Hepsinde `set search_path = ''` ve tam şema adı (`public.`, `auth.`) kullanılır.

**Web / PWA / Push**
- **iOS push:** Yalnızca ana ekrana eklenmiş PWA'da çalışır (iOS 16.4+). İzin bir kullanıcı dokunuşuyla istenmelidir. iOS'ta `navigator.vibrate` yoktur.
- **Wake Lock:** Sayfa gizlenince bırakılır; `visibilitychange` olayında yeniden istenir. iPadOS'ta ana ekran uygulamasında 18.4+ gerekir.
- **Service worker:** vite-plugin-pwa **`injectManifest`** ile kurulur (push ve notificationclick için özel SW). `sw.js` ve `index.html` asla uzun süre önbelleğe alınmaz.
- **Ses:** Tarayıcılar kullanıcı etkileşimi olmadan ses çaldırmaz. KDS açılışında "Sesi etkinleştir" dokunuşu gerekir.
- **Büyük harf:** CSS `text-transform: uppercase` + `lang="tr"` "i" harfini "İ" yapar. Almanca metinlerin (ürün adları, "TISCH") kapsayıcısına `lang="de"` ver. JS'te `toLocaleUpperCase('de-DE')` kullan.

**Windows / PowerShell**
- `.ps1` dosyaları **UTF-8 BOM'lu** kaydedilmelidir; PowerShell 5.1 BOM'suz UTF-8'i ANSI olarak okur ve dosya bozulur. Write aracı BOM yazmaz; sonradan `[IO.File]::WriteAllText(path, content, [Text.UTF8Encoding]::new($true))` ile çevir.
- PowerShell 5.1'de `&&` yoktur, `;` ve `if ($?)` kullanılır.

**Plesk**
- Özel nginx yönergelerinde Plesk'in kendi `location /` bloğuyla çakışmamak için **`location ~ ^/`** regex kalıbı kullanılır.
- Belge kökü dosyalarının sahipliği aboneliğin sistem kullanıcısına verilir (`chown -R <sysuser>:psacln`).

---

## 7. Milestone akışı

| Aşama | Plan · Görevler | Çıkış ölçütü | Onay |
|---|---|---|---|
| M0 | Plan 1 · Görev 1–2 | Monorepo kuruldu, `npm run check` yeşil, Supabase projesi erişilebilir | Görev 2 |
| M1 | Plan 1 · Görev 3–9 | Şema, RLS, RPC'ler ve broadcast hazır; seed 107 ürün; `npm run db:test` yeşil; advisors temiz | – |
| M2 | Plan 2 · Görev 10–12 | 4 rolle giriş, rol yönlendirme, TR/DE, veri katmanı ve realtime hook'ları | Görev 10 |
| M3 | Plan 2 · Görev 13–15 | Garson akışının tamamı; 390 px ekran görüntüleri | – |
| M4 | Plan 3 · Görev 16 | KDS canlı: garson gönderir, KDS'de ≤ 2 sn içinde görünür; HAZIR ve geri alma | – |
| M5 | Plan 3 · Görev 17–20 | Ajan sahte yazıcıda yeşil; **gerçek Xprinter fişi** onaylandı; otomatik başlatma betikleri | Görev 20 |
| M6 | Plan 4 · Görev 21–24 | Admin paneli tamamı + ekran görüntüleri | – |
| M7 | Plan 4 · Görev 25–26 | PWA kurulabiliyor; push hattı sunucu tarafında doğrulandı (trigger → notify-ready → abonelik temizliği); mesai anahtarı çalışıyor | – |
| M8 | Plan 5 · Görev 27–30 | E2E yeşil; Plesk'te SSL ile canlı; **gerçek telefonda push alındı**; yedek cron'u; `docs/KURULUM.md` | Görev 27–29 |

---

## 8. Milestone raporu biçimi (Türkçe, kısa)

```
## M<n> tamamlandı — <başlık>
- Yapılanlar: …
- Kanıt: `npm run check` ✓ · `npm run db:test` ✓ (N test) · ekran görüntüleri: <yollar>
- Commit'ler: <kısa hash — mesaj> …
- Açık sorunlar / varsayımlar: …
- Sıradaki: M<n+1> — <ilk görev>  (onay gerekiyorsa: "Onayın gerekiyor: …")
```

---

## 9. Tamamlanma tanımı (Definition of Done)

- [ ] 30 plan görevinin tamamı `[x]`; spec'in §1.1 kapsamındaki her madde çalışıyor
- [ ] `npm run check` (lint + typecheck + unit + build) ve `npm run db:test` yeşil; Playwright E2E yeşil; ekran görüntüleri `docs/screenshots/` altında
- [ ] Supabase advisors (security + performance) temiz; anon erişimi sıfır; RLS rol testleri yeşil
- [ ] Gerçek Xprinter'da TESTDRUCK + sipariş + STORNO + TISCHWECHSEL fişleri kullanıcı tarafından onaylandı
- [ ] En az bir Android telefonda "Hazır" push bildirimi alındı
- [ ] Web uygulaması Plesk'te SSL ile yayında; SPA yönlendirmesi ve önbellek başlıkları doğru
- [ ] Gecelik yedek cron'u kurulu, bir yedek alınıp geri yükleme denendi
- [ ] `docs/KURULUM.md` (Türkçe): yazıcıyı ağa bağlama, ajan kurulumu, tablet ayarı, telefonlara kurulum, admin ilk giriş, acil durum, tatil notu
- [ ] Son rapor: canlı adres, hesapların **nerede** saklandığı (değerleri değil), ajanın nasıl başlatılacağı, açık noktalar listesi

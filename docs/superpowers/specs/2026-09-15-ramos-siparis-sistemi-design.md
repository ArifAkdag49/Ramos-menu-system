# Ramo's Sipariş Sistemi — Tasarım Dokümanı (Spec)

| | |
|---|---|
| **Tarih** | 2026-09-15 |
| **Durum** | Brainstorming'de bölüm bölüm onaylandı (1: mimari + veri modeli · 2: ekranlar + fiş · 3: güvenlik, dayanıklılık, test, yayın) |
| **Sonraki adım** | Uygulama planı / build prompt → `docs/BUILD-PROMPT.md` (ayrı bir Claude Code terminal oturumunda çalıştırılır) |
| **Menü verisi** | `docs/menu/ramos-menu-data.md` (seed'in tek kaynağı) · kaynak PDF: `docs/menu/source/ramos-menu.pdf` (8 görsel sayfa, git dışı) |
| **İşletme** | Ramo's Döner & Grill House — Frankfurt, est. 2019 · Google: "Ramo's Döner & Kebab & Pizza Haus Frankfurt", 4,4★ (734 yorum), €10–20, Türk restoranı |

---

## 0. Özet

Ramo's için masa başı garson sipariş sistemi:

1. Garson kendi telefonundaki uygulamada (PWA) masayı seçer.
2. Ürünleri seçer: varyant (Hähnchen/Kalb), zorunlu seçimler (Pommes/Reis), **çıkarılacak malzemeler**, sos, acı, ekstralar, not.
3. "Mutfağa gönder"e basar.
4. Sipariş Supabase'e yazılır ve mutfak tabletinde (KDS) anında belirir.
5. Restoran PC'sinde çalışan **yazdırma ajanı**, Xprinter XP-Q80A yazıcıya ağ üzerinden (TCP 9100) Almanca mutfak fişi basar. Çıkarılan malzemeler fişte `OHNE: Zwiebeln` gibi ayrı ve vurgulu bir satırda görünür.
6. Mutfak **HAZIR**'a basınca mesaideki tüm garsonlara bildirim gider. Garson yemeği teslim eder.
7. Müşteri ödemeyi mevcut kasada yapar, garson masayı kapatır.

Super admin garsonları, menüyü, masaları ve ayarları yönetir.

---

## 1. Kapsam

### 1.1 v1'de olanlar
- **Admin paneli.**
  - Personel hesapları (garson, mutfak).
  - Menü: kategori, ürün, varyant, çıkarılabilir malzeme, seçim grubu, ekstra, **ürün görseli** (tek tek ve toplu yükleme; başlangıçta hepsi boş).
  - Masalar, sipariş geçmişi, basit raporlar, ayarlar, yazıcı/ajan durumu, test fişi.
- **Garson PWA'sı (TR/DE).**
  - Masalar ve masa detayı.
  - Sipariş: giriş, sepet, mutfağa gönderme, ek sipariş.
  - Kalem iptali (sebep zorunlu), hazır listesi, teslim.
  - Hesap özeti, masa taşıma, masa kapatma.
  - Mesai anahtarı, dil seçimi.
- **Mutfak ekranı (KDS, tablet).**
  - Canlı sipariş kartları, HAZIR ve geri alma.
  - "Tükendi" anahtarları, sesli uyarı, yazıcı durumu.
- **Mutfak fişi (Almanca, 80 mm, ESC/POS).** Türleri: sipariş, ek sipariş, STORNO, masa değişikliği, tekrar baskı, test.
- **Yazdırma ajanı (Node.js).** Supabase kuyruğundan Xprinter XP-Q80A'ya (Ethernet) basar. Yeniden dener, yazıcı durumunu okur, "çalışıyorum" sinyali (heartbeat) gönderir.
- **Bildirimler.** Uygulama içi uyarı + Web Push ("Hazır" → mesaideki tüm garsonlar).
- **Operasyon.** Gecelik veritabanı yedeği (Plesk sunucusunda) ve Türkçe kurulum rehberi.

### 1.2 v1'de bilinçli olarak OLMAYANLAR
- **Ödeme, hesap fişi ve kasa fonksiyonu yok.** Ödemeyi mevcut TSE'li kasa alır. Almanya'da ödeme alan sistem "Kassensystem" sayılır ve TSE + KassenSichV zorunluluğu getirir. Bu sistem yalnızca ekranda "hesap özeti" gösterir, müşteriye fiş basmaz.
- Paket (Mitnahme), telefon ve online sipariş yok. Müşteri QR menüsü yok.
- Çoklu restoran yok. Birden fazla yazıcı veya istasyona yönlendirme yok (tek yazıcı).
- Stok/envanter, kasa entegrasyonu, masa birleştirme ve hesap bölme yok.
- Üretimde USB/Windows sürücüsü üzerinden yazdırma yok. Seçilen yol Ethernet/TCP 9100. §10.8'de yalnızca geliştirme için bir yedek not var.

### 1.3 Başarı ölçütleri
1. Tipik 3 kalemlik bir sipariş (içinde bir "OHNE Zwiebeln" olsun) garson tarafından **≤ 30 sn** içinde girilir.
2. "Mutfağa gönder"den sonra sipariş KDS'de **≤ 2 sn** içinde görünür, fiş normal koşulda **≤ 5 sn** içinde basılır.
3. **Sipariş kaybolmaz.** İnternet, yazıcı veya PC kesintisinde iki durumdan biri geçerlidir:
   - Sipariş hiç gönderilmemiştir ve garson bunu açıkça görür.
   - Sipariş veritabanındadır, KDS'de görünür ve fişi kuyrukta bekler.
4. Çıkarılan malzemeler fişte ve KDS'de ayrı, vurgulu bir satırda görünür.
5. Hiçbir sipariş veya iptal kaydı silinmez; tam denetim izi tutulur.

### 1.4 Hukuki not
Sipariş sistemi ile TSE'li kasa arasındaki ilişki (AO §146a, KassenSichV, "andere Vorgänge / Bestellungen") işletmenin **Steuerberater**'ine teyit ettirilmelidir. Sistem bu yüzden üç kurala uyar:
- Kayıt silmez; iptaller dahil tam iz tutar.
- Gün veya tarih aralığı bazında CSV dışa aktarım sunar.
- Ödeme ve hesap fişi üretmez.

---

## 2. Karar kaydı

| # | Konu | Karar | Not |
|---|---|---|---|
| 1 | İşletme | Tek işletme (Ramo's) | Multi-tenant yok |
| 2 | Roller | `admin`, `waiter` (garson), `kitchen` (mutfak), `printer` (yazdırma ajanı) | |
| 3 | Garson cihazı | Garsonun kendi telefonu, PWA | App Store yok |
| 4 | Sipariş tipi | Sadece masa | |
| 5 | Masa paylaşımı | Tüm masalar tüm garsonlara ortak | Kimin girdiği kayıtlı |
| 6 | Dil | Arayüz TR/DE (kullanıcı başına), **mutfak fişi Almanca** | Ürün adları menüdeki gibi tek dil; malzeme, seçenek ve kategori adları DE + TR |
| 7 | Ödeme | Sistemde yok, mevcut kasa alır | "Hesap özeti" ekranı var |
| 8 | Mutfak | Tablet KDS + HAZIR butonu + fiş | İkisi birbirinin yedeği |
| 9 | Yazıcı | Tek Xprinter XP-Q80A (80 mm, 203 dpi, USB + Ethernet) | İçecekler dahil her şey basılır |
| 10 | Yazdırma yolu | **Ethernet + Node.js ajanı** (raw ESC/POS, TCP 9100) | Ajan restoran PC'sinde, ileride Raspberry Pi |
| 11 | İptal | Garson (sebep zorunlu) + admin | STORNO fişi basılır |
| 12 | Hazır bildirimi | **Mesaideki tüm garsonlar** | "Mesaideyim" anahtarı, iş günü sonunda (05:00) kendiliğinden kapanır |
| 13 | Masalar | Tek salon, numaralı; seed: Tisch 1–12 | Gerçek sayı admin panelden ayarlanır |
| 14 | Döner malzeme seti | Salat, Tomaten, Gurken, Zwiebeln, Rotkohl | |
| 15 | Sos | Soße: Knoblauch / Kräuter / Scharfe Soße / ohne Soße (çoklu seçim) + ayrı "scharf (Chili)" | |
| 16 | Grill çiftleri | 57/58, 59/60, 61/62 menüdeki gibi girilir | Aradaki fark sonra netleşecek |
| 17 | Spar Menü M1–M3 | İki fiyat = Hähnchen / Kalb | |
| 18 | Barındırma | Web: kullanıcının **Plesk sunucusu** (alt alan adı). DB: **yeni Supabase Free** projesi (org Cicekci, eu-central-1) | Vercel Hobby ticari kullanıma kapalı |
| 19 | Yedek | Plesk sunucusunda gecelik `pg_dump` (Docker) | Supabase Free'de yedek yok |
| 20 | Test yazıcısı | Geliştirme PC'sinde bir Xprinter var (Windows'ta "XP-80" sürücüsü, USB001) | Ethernet'e bağlanıp gerçek fişle test edilecek |
| 21 | Ürün görselleri | Her üründe görsel alanı; **şimdilik boş**, arayüz yer tutucu gösterir; kullanıcı sonra admin panelden ekler (tek tek ya da toplu, dosya adı = ürün no) | Storage `product-images`, WebP 1200 + 320 px |
| 22 | Tasarım yönü | **Sade, şık, herkesin anlayacağı**; kurulu tasarım skill'leri (`ui-ux-pro-max`, `frontend-design` …) zorunlu | Sadelik ilkeleri: BUILD-PROMPT §10 |
| 23 | Build yürütme | Faz A: bilgiler ve ön onaylar tek seferde → kullanıcı onaylayıp auto moda geçer → Faz B: 30 görev kesintisiz | Fiziksel kontroller sona kalır |

---

## 3. Mimari

### 3.1 Bileşenler

```
┌──────────────────────┐   HTTPS / WSS     ┌───────────────────────────────┐
│ Garson telefonları   │ ────────────────► │ Supabase (Free, eu-central-1) │
│ PWA · /waiter        │ ◄── Web Push ──── │ • Auth (kullanıcı adı + PIN)  │
├──────────────────────┤                   │ • Postgres 17 + RLS + RPC     │
│ Mutfak tableti (KDS) │ ────────────────► │ • Realtime (Broadcast f. DB)  │
│ PWA · /kitchen       │                   │ • Edge Fn: admin-staff,       │
├──────────────────────┤                   │   notify-ready (Web Push)     │
│ Admin paneli         │ ────────────────► │ • pg_net · Vault              │
│ /admin               │                   └───────────────┬───────────────┘
└──────────▲───────────┘                                   │ WSS + REST (5 sn poll)
           │ statik dosyalar (SPA)                         ▼
┌──────────┴───────────┐              ┌────────────────────────────────────┐
│ Plesk sunucusu       │              │ Restoran PC'si: yazdırma ajanı     │
│ nginx/Apache + SSL   │              │ (Node.js)  ── TCP 9100 ──► XP-Q80A  │
│ + gecelik pg_dump    │              └────────────────────────────────────┘
└──────────────────────┘
```

### 3.2 Teknoloji yığını
Sürümler build sırasında en güncel kararlı sürüm olarak kurulur ve sabitlenir.

- **Web (`apps/web`):**
  - Vite + React 19 + TypeScript (strict)
  - Tailwind CSS v4, React Router
  - TanStack Query (sunucu durumu), Zustand + persist (sepet ve UI durumu)
  - react-i18next (TR/DE)
  - vite-plugin-pwa, `injectManifest` stratejisiyle (push için özel service worker)
  - Motion (framer-motion), dnd-kit (admin sıralama), zod, @supabase/supabase-js v2
  - Test: Vitest + Testing Library + Playwright
- **Yazdırma ajanı (`apps/print-agent`):**
  - Node.js ≥ 22 LTS (geliştirme PC'sinde v24 kurulu), TypeScript
  - @supabase/supabase-js
  - `@point-of-sale/receipt-printer-encoder` 3.x (ESC/POS kodlama), `node:net` (TCP)
  - Dosyaya yazan, dönüşümlü (rotating) log
- **Ortak paket (`packages/shared`):**
  - Alan tipleri
  - Fiyat hesabı ve seçim kuralı doğrulaması (arayüzde canlı fiyat için; nihai doğruluk kaynağı sunucudaki RPC'dir)
  - Fiş modeli → biçimli satırlar (hem ajan hem admin önizlemesi kullanır)
- **Supabase:**
  - Postgres 17, RLS, plpgsql RPC'ler
  - Realtime "Broadcast from Database"
  - Edge Functions (Deno): `admin-staff`, `notify-ready`
  - `pg_net` (trigger'dan fonksiyon çağrısı), Vault (webhook sırrı)

### 3.3 Repo yapısı (npm workspaces)
```
Ramos Menu System/
├─ apps/
│  ├─ web/                 # PWA: /login, /waiter, /kitchen, /admin
│  └─ print-agent/         # Node.js yazdırma ajanı (+ Windows/Linux kurulum betikleri)
├─ packages/
│  └─ shared/              # tipler, fiyat/seçim kuralları, fiş modeli + satır render
├─ supabase/
│  ├─ migrations/          # 0001_… SQL — şemanın tek doğruluk kaynağı
│  ├─ functions/           # admin-staff, notify-ready
│  ├─ seed/                # menü seed'i (docs/menu/ramos-menu-data.md'den), masalar, ayarlar
│  └─ tests/               # RLS/RPC doğrulama betikleri
├─ scripts/                # create-admin, create-printer-user, verify-flow, gen-vapid …
├─ deploy/                 # Plesk (SPA fallback + önbellek başlıkları), backup cron
└─ docs/
   ├─ superpowers/specs/   # bu doküman
   ├─ menu/                # menü verisi (+ source/ PDF, git dışı)
   ├─ BUILD-PROMPT.md      # uygulama planı / terminal promptu
   └─ KURULUM.md           # Türkçe kurulum ve kullanım rehberi (M8)
```

### 3.4 Sipariş yaşam döngüsü
1. Garson sepeti hazırlar. Sepet telefonda saklanır (Zustand persist).
2. "Mutfağa gönder" şu çağrıyı yapar: `rpc('submit_order', { p_order_id: <istemcide üretilen uuid>, p_table_id, p_items, p_note })`.
3. RPC tek bir transaction içinde şunları yapar:
   1. Yetkiyi kontrol eder.
   2. Masanın açık oturumunu bulur ya da açar.
   3. Her kalemi doğrular, fiyatı sunucuda hesaplar, adları ve fiyatları siparişe kopyalar (snapshot).
   4. Günlük sipariş numarasını verir.
   5. `orders` + `order_items` + `print_jobs` (payload hazır) kayıtlarını oluşturur.
   6. `audit_log`'a yazar.
4. Trigger'lar Realtime broadcast yayınlar:
   - `orders` konusu → KDS, garsonlar ve admin kendini yeniler.
   - `print-jobs` konusu → ajan yeni işi fark eder.
5. Ajan işi sahiplenir (`claim_print_job`). Önce yazıcı durumunu sorgular, ESC/POS'a çevirir, TCP 9100'e gönderir, sonra `complete_print_job` ile sonucu yazar.
6. KDS'de HAZIR → `mark_order_ready`. Trigger `pg_net` ile `notify-ready` Edge Function'ını çağırır, o da mesaideki garsonlara Web Push gönderir. Uygulaması açık olanlar ayrıca broadcast ile uyarı alır.
7. Garson teslim eder → `mark_order_served`.
8. Ödeme kasada alınır → garson `close_table_session` ile masayı kapatır.

### 3.5 Durum makineleri
- **Masa oturumu:** `open` → `closed`. Bir masada aynı anda tek açık oturum olabilir.
- **Sipariş:**
  - Normal akış: `in_kitchen` → `ready` → `served`.
  - Tüm kalemler iptal edilirse: `in_kitchen` / `ready` → `cancelled` (otomatik).
  - Geri alma: `ready` → `in_kitchen` (en fazla 30 sn içinde).
- **Kalem:** `active` → `cancelled`.
- **Fiş işi:**
  - Normal akış: `pending` → `printing` → `printed`.
  - Başarısız denemede tekrar `pending` olur, `next_attempt_at` ile bir sonraki deneme zamanlanır.
  - Deneme sınırı dolunca `failed` olur.
  - "Tekrar dene" ile `failed` → `pending`.

---

## 4. Roller ve yetki matrisi

| İşlem | admin | waiter | kitchen | printer |
|---|:-:|:-:|:-:|:-:|
| Menü, masa ve ayarları okuma | ✓ | ✓ | ✓ | yalnız ayarlar |
| Menü, masa ve ayar düzenleme | ✓ | – | – | – |
| Ürünü "tükendi" işaretleme | ✓ | – | ✓ | – |
| Sipariş gönderme / ek sipariş | ✓ | ✓ | – | – |
| Kalem iptali (sebep zorunlu) | ✓ | ✓ | – | – |
| HAZIR / geri al | ✓ | – | ✓ | – |
| Teslim edildi | ✓ | ✓ | – | – |
| Masa kapatma / taşıma, hesap özeti | ✓ | ✓ | – | – |
| Fiş tekrar basma / başarısız işi tekrar deneme | ✓ | ✓ | ✓ | – |
| Test fişi | ✓ | – | – | – |
| Siparişleri okuma (açık oturumlar + günün geçmişi) | ✓ | ✓ | ✓ | – |
| Raporlar, tüm geçmiş, denetim kaydı | ✓ | – | – | – |
| Personel yönetimi | ✓ | – | – | – |
| Mesai anahtarı | ✓ | ✓ | – | – |
| Fiş kuyruğu işleme, heartbeat | – | – | – | ✓ |

Pasif (`is_active = false`) hesap hiçbir şey yapamaz. RLS yardımcı fonksiyonları bunu her sorguda kontrol eder, ayrıca Auth tarafında ban uygulanır.

---

## 5. Veri modeli

Tüm tablolarda RLS açıktır. `anon` rolünün hiçbir erişimi yoktur. Para **kuruş (integer)** olarak tutulur. Zamanlar `timestamptz`, gösterim saati `Europe/Berlin`.

### 5.1 Enum'lar
- `staff_role`: `admin | waiter | kitchen | printer`
- `session_status`: `open | closed`
- `order_status`: `in_kitchen | ready | served | cancelled`
- `item_status`: `active | cancelled`
- `print_job_type`: `order | addition | storno | table_move | reprint | test`
- `print_job_status`: `pending | printing | printed | failed`
- `ticket_format`: `label_values | values_only | plus_each`

### 5.2 Tablolar

**`profiles`** — personel (1:1 `auth.users`)
- `id uuid PK → auth.users(id)`
- `username text unique` (küçük harf, `^[a-z0-9._-]{3,32}$`)
- `display_name text`, `role staff_role`, `locale text ('tr'|'de', varsayılan 'tr')`
- `is_active bool default true`
- `on_duty_since timestamptz null` — mesai açıldığında doldurulur
- `created_at`, `updated_at`

**`categories`**
- `id uuid PK`, `name_de text not null`, `name_tr text null`
- `is_beverage bool default false` — fişte içecekler en sona "GETRÄNKE" başlığıyla gruplanır
- `sort int`, `is_active bool`, zaman damgaları

**`products`**
- `id uuid PK`, `category_id → categories`
- `code text null` — menü numarası ("05", "71a", "M1"). Arşivlenmemiş ürünlerde benzersiz (kısmi unique index).
- `name text not null` — menüdeki ad, tek dil
- `description text null`
- `base_price_cents int null` — varyantı olmayan üründe zorunlu. Varyantı olan üründe fiyat varyanttan gelir.
- `allergens text null` — ör. `"a,c,g,4,7"`
- `image_path text null` — Storage `product-images` içindeki yol (`products/<id>-<zaman>.webp`; küçük sürüm `-thumb.webp`). Boşsa arayüz yer tutucu gösterir. Seed bu alana dokunmaz.
- `is_active bool`, `is_sold_out bool default false`, `sort int`
- `archived_at timestamptz null` — ürün silinmez, arşivlenir
- zaman damgaları

**`product_variants`** — fiyatı belirleyen zorunlu tekli seçim
- `id`, `product_id → products (cascade)`, `name_de`, `name_tr`
- `price_cents int ≥ 0`, `is_default bool`, `sort`, `is_active`
- Örnek: 05 Drehspieß Sandwich → Hähnchen 750 (varsayılan) / Kalb 850

**`ingredients`** — çıkarılabilir malzeme kütüphanesi
- `id`, `name_de` (fişe basılan ad), `name_tr`, `is_active`

**`product_ingredients`** — `(product_id, ingredient_id) PK`, `sort`

**`option_groups`** — seçim grupları
- `id`, `admin_label text` (ör. "Soße (Döner)"), `name_de`, `name_tr`
- `min_select int ≥ 0`, `max_select int ≥ 1`, `check (min_select <= max_select)`
- `ticket_format ticket_format default 'label_values'`
- `sort`, `is_active`

**`options`**
- `id`, `group_id → option_groups (cascade)`, `name_de`, `name_tr`
- `price_delta_cents int default 0`
- `is_default bool` — önceden seçili gelir
- `is_exclusive bool` — seçilince gruptaki diğer seçenekleri kaldırır (ör. "ohne Soße")
- `sort`, `is_active`

**`product_option_groups`** — `(product_id, group_id) PK`, `sort`

**`dining_tables`** — `id`, `name text unique` ("Tisch 12"), `sort`, `is_active`, `created_at`

**`table_sessions`**
- `id`, `table_id → dining_tables`, `status session_status`
- `opened_by → profiles`, `opened_at`, `closed_by`, `closed_at`
- `unique (table_id) where status = 'open'`

**`orders`** — bir tur sipariş
- `id uuid PK` — istemcide üretilir, **idempotency anahtarı**
- `session_id → table_sessions`, `waiter_id → profiles`
- `business_date date`, `order_no int` — günlük sıra, `unique (business_date, order_no)`
- `round_no int` — 1 = ilk sipariş, ≥ 2 = NACHBESTELLUNG
- `status order_status default 'in_kitchen'`, `note text`
- `created_at`, `ready_at`, `ready_by`, `served_at`, `served_by`, `cancelled_at`
- İndeksler: `(status, created_at)`, `(session_id)`

**`order_items`** — kalem (snapshot)
- `id`, `order_id → orders`, `product_id → products`
- Kopyalanan bilgiler: `category_sort int`, `is_beverage bool`, `product_code`, `product_name`, `variant_id null`, `variant_name_de`, `variant_name_tr`
- `unit_price_cents int` (varyant/temel fiyat + Σ seçenek farkları), `quantity int check (1..99)`
- `removed_ingredients jsonb default '[]'` → `[{id, name_de, name_tr}]`
- `selected_options jsonb default '[]'` → `[{group_id, group_name_de, group_name_tr, ticket_format, group_sort, option_id, name_de, name_tr, price_delta_cents}]`
- `note text`, `status item_status default 'active'`
- İptal bilgisi: `cancel_reason`, `cancelled_by`, `cancelled_at`
- `sort int`

**`print_jobs`** — fiş kuyruğu
- `id`, `type print_job_type`, `order_id null`, `session_id null`
- `payload jsonb not null` — basılacak fişin tam modeli (bkz. §6.2)
- `status print_job_status default 'pending'`, `attempts int default 0`, `next_attempt_at timestamptz default now()`
- `last_error text`, `claimed_by text`, `claimed_at`, `printed_at`, `created_by`, `created_at`
- İndeks: `(status, next_attempt_at)`

**`printer_status`** — tek satır (`id = 'main'`)
- `agent_id`, `agent_version`, `host`, `last_seen_at`
- `printer_reachable bool`
- `printer_state jsonb` → `{offline, cover_open, paper_end, paper_near_end, error, raw}`
- `last_error`, `last_printed_at`

**`push_subscriptions`**
- `id`, `user_id → profiles (cascade)`, `endpoint text unique`, `p256dh`, `auth`
- `user_agent`, `created_at`, `last_success_at`

**`settings`** — tek satır (`id = 1`)
- Genel: `restaurant_name`, `ticket_header` ("RAMO'S · KÜCHE"), `ticket_footer`, `business_day_start time default '05:00'`
- Yazıcı: `printer_host`, `printer_port int default 9100`, `printer_codepage text default 'cp857'`, `printer_codepage_number int default 61`, `printer_transliterate bool default false`
- Listeler: `quick_notes jsonb` (`[{de,tr}]`), `cancel_reasons jsonb` (`[{de,tr}]`), `allergen_legend jsonb`
- `updated_at`, `updated_by`

**`audit_log`** — `id bigint identity`, `at`, `actor_id`, `action`, `entity`, `entity_id`, `details jsonb`

**`daily_counters`** — `business_date date PK`, `last_order_no int`. Güncelleme atomik yapılır: `insert … on conflict … do update … returning`.

### 5.3 Yardımcı fonksiyonlar
Hepsi `security definer`, `stable` (uygun olanlarda) ve `set search_path = ''`.
- `current_profile()`, `is_active_staff()`, `has_role(variadic staff_role[])`
- `business_date(ts timestamptz) → date` — `Europe/Berlin` saatinden `settings.business_day_start` çıkarılır, sonra tarihe çevrilir
- `is_on_duty(profile) → bool` — `on_duty_since >= mevcut iş gününün başlangıcı`

---

## 6. Sunucu fonksiyonları (RPC)

**Genel kurallar**
- Tüm yazma işlemleri (menü/masa/ayar CRUD hariç) RPC ile yapılır. Sipariş, oturum ve fiş tablolarına istemci doğrudan yazamaz.
- RPC'ler `security definer` ve `set search_path = ''` ile tanımlanır. İlk satırda rol ve aktiflik kontrolü yapılır.
- Hata `raise exception using message = '<hata_anahtari>', errcode = 'P0001'` ile döner. İstemci bu anahtarı TR/DE metne çevirir.
- Her durum değişikliği `audit_log`'a yazılır.
- Menü, masa ve ayar CRUD'u admin için RLS ile doğrudan tablo yazımıdır; denetim trigger'ı log tutar.

| Fonksiyon | Kim | Ne yapar |
|---|---|---|
| `submit_order(p_order_id, p_table_id, p_items, p_note)` | admin, waiter | Siparişi idempotent oluşturur; oturum bulur/açar, doğrular, fiyatlar, snapshot alır, günlük no verir, `print_jobs` (`order` / `addition`) ekler |
| `cancel_order_item(p_item_id, p_reason)` | admin, waiter | Kalemi iptal eder, STORNO işi ekler. Tüm kalemler iptalse sipariş `cancelled` olur |
| `mark_order_ready(p_order_id)` / `undo_order_ready(p_order_id)` | admin, kitchen | `in_kitchen` → `ready` (bildirim tetiklenir) / en fazla 30 sn içinde geri alma |
| `mark_order_served(p_order_id)` | admin, waiter | `ready` → `served` |
| `close_table_session(p_session_id)` | admin, waiter | `ready` olanları otomatik `served` yapar, oturumu `closed` yapar. `in_kitchen` siparişler kapatmayı engellemez ve olduğu gibi mutfakta kalır (0008, 17.09.2026 işletme talebi) |
| `move_table_session(p_session_id, p_target_table_id)` | admin, waiter | Hedef masa aktif ve boş olmalı. TISCHWECHSEL işi ekler |
| `set_product_sold_out(p_product_id, p_sold_out)` | admin, kitchen | Tükendi anahtarı |
| `reprint_order(p_order_id)` | admin, waiter, kitchen | Orijinal payload'ı `reprint` türünde (NACHDRUCK başlıklı) tekrar kuyruğa koyar |
| `retry_print_job(p_job_id)` | admin, waiter, kitchen | `failed` → `pending`, deneme sayacı sıfırlanır |
| `enqueue_test_print()` | admin | TEST fişi |
| `set_on_duty(p_on)` · `set_my_locale(p_locale)` | personel | Mesai anahtarı / dil tercihi |
| `save_push_subscription(p_endpoint, p_p256dh, p_auth, p_ua)` · `delete_push_subscription(p_endpoint)` | personel | Endpoint'e göre upsert / sil |
| `get_session_bill(p_session_id)` | admin, waiter | Hesap özeti: gruplanmış satırlar + toplam |
| `claim_print_job(p_agent_id)` | printer | Sıradaki işi `FOR UPDATE SKIP LOCKED` ile sahiplenir. 60 sn'den uzun süredir `printing` durumunda kalan işleri de geri alır |
| `complete_print_job(p_job_id, p_ok, p_error)` | printer | Başarılıysa `printed`. Başarısızsa 5/15/30/60/120 sn aralıklarla yeniden dener, 6. denemeden sonra `failed` |
| `agent_heartbeat(p_agent_id, p_version, p_host, p_reachable, p_state, p_error)` | printer | `printer_status` kaydını günceller (upsert) |
| `report_range(p_from, p_to)` | admin | Rapor verisi (JSON) |

Personel yönetimi RPC ile değil, **`admin-staff` Edge Function** ile yapılır (bkz. §12). Desteklenen işlemler: `create`, `update`, `reset_pin`, `set_active`. Yazıcı ajanının hesabı seed betiğiyle açılır.

### 6.1 `submit_order` sözleşmesi

**Girdi**
```json
{
  "p_order_id": "b3f1…(istemci crypto.randomUUID())",
  "p_table_id": "…",
  "p_note": "Kinderstuhl",
  "p_items": [
    {
      "product_id": "…",
      "variant_id": "… | null",
      "quantity": 2,
      "option_ids": ["…", "…"],
      "removed_ingredient_ids": ["…"],
      "note": "Soße extra"
    }
  ]
}
```

**Çıktı:** `{ order_id, order_no, round_no, session_id, total_cents }`

**Doğrulamalar ve hata anahtarları**
- **Kimlik ve tekrar:**
  - Aynı `p_order_id` zaten varsa ve aynı garsona aitse, mevcut sonucu döndürür (idempotent).
  - Başka birine aitse `order_id_conflict`.
- **Masa ve sepet:**
  - Masa pasifse `table_inactive`.
  - Sepet boşsa `empty_order`. En fazla 50 kalem kabul edilir.
  - Adet 1–99 dışındaysa `quantity_invalid`.
- **Ürün ve varyant:**
  - Ürün pasif veya arşivliyse `product_unavailable`; tükendiyse `product_sold_out`. Hata detayında ürün kimliği döner.
  - Varyantı olan üründe varyant seçilmemişse `variant_required`. Varyant başka ürüne aitse `variant_invalid`.
- **Seçenekler:**
  - Seçenek ürüne bağlı bir gruba ait değilse `option_invalid`.
  - Grup başına en az / en fazla seçim sayısı tutmuyorsa `option_group_min` / `option_group_max`. Hata detayında grup kimliği döner.
  - Exclusive seçenek başka bir seçenekle birlikte seçilmişse `option_exclusive_conflict`.
- **Malzemeler:** Çıkarılan malzeme ürüne bağlı değilse `ingredient_invalid`.
- **Fiyat:** Birim fiyat = (varyant fiyatı ?? temel fiyat) + Σ seçilen seçeneklerin fiyat farkı. İstemcinin gönderdiği fiyat yok sayılır.
- **Oturum ve numaralar:**
  - Masada açık oturum yoksa açılır (`opened_by` = çağıran kişi).
  - `round_no` = oturumdaki sipariş sayısı + 1.
  - `order_no`, `daily_counters` üzerinden verilir.

### 6.2 Fiş payload'u (`print_jobs.payload`)
Payload RPC içinde, iş oluşturulurken bir kez üretilir. Böylece tekrar baskı birebir aynı olur ve baskı anındaki masa adı korunur.
```json
{
  "kind": "order",
  "header": "RAMO'S · KÜCHE",
  "table": "Tisch 12",
  "orderNo": 47,
  "round": 2,
  "createdAt": "2026-09-15T19:42:10+02:00",
  "waiter": "Ahmet",
  "items": [
    {
      "qty": 2, "code": "05", "name": "Drehspieß Sandwich", "isBeverage": false,
      "variant": "Kalb",
      "without": ["Zwiebeln", "Tomaten"],
      "groups": [
        { "label": "Soße", "format": "label_values", "values": ["Knoblauch", "Kräuter"] },
        { "label": "Schärfe", "format": "values_only", "values": ["scharf (Chili)"] },
        { "label": "Extras", "format": "plus_each", "values": ["Extra Weichkäse"] }
      ],
      "note": "Soße extra"
    }
  ],
  "note": "Kinderstuhl",
  "footer": ""
}
```
Diğer türler aynı modeli ek alanlarla kullanır:
- `storno`: `items` yalnız iptal edilen kalemler, ayrıca `reason` ve `refOrderNo`.
- `table_move`: `fromTable`, `toTable`, `openOrderNos`.
- `reprint`: orijinal payload + `reprintOf`.
- `test`: ayarların özeti ve karakter tablosu örneği.

---

## 7. Menü modeli ve fiyat kuralları

- **Varyant:** Varyantı olan üründe varyant seçimi zorunludur. Varsayılan varyant önceden seçili gelir (Hähnchen, klein).
- **Seçim grubu:**
  - Seçim sayısı `min_select` ile `max_select` arasında olmalıdır.
  - `is_exclusive` bir seçenek ("ohne Soße") seçilince gruptaki diğer seçimler kalkar.
  - `is_default` seçenekler önceden seçili gelir (ör. Beilage: Pommes).
- **Çıkarılabilir malzeme:** Ücretsizdir. Arayüzde dokunulunca üstü çizilir. Fişte ve KDS'de `OHNE:` satırında **Almanca** adıyla görünür.
- **Fişte grup biçimi:**
  - `label_values` → "Soße: Knoblauch + Kräuter", "Getränk: Fanta", "Beläge: Sucuk, Mais, …"
  - `values_only` → "Reis", "scharf (Chili)"
  - `plus_each` → her seçim ayrı satırda: "+ Extra Weichkäse"
- **Tükendi ürün:** Garson listesinde soluk görünür ve seçilemez. Sunucu da reddeder.
- **Arşivleme:** Ürün silinmez, arşivlenir. Geçmiş siparişler snapshot sayesinde bozulmaz.
- **Sepette birleştirme:** Aynı ürün + varyant + seçimler + çıkarılanlar + not tek satırda toplanır ve adet artar. Farklı olan her kombinasyon ayrı satırdır; örneğin 3 döner'den biri soğansızsa 2 + 1 olarak iki satır olur.
- **Seed:** Menü, gruplar, setler ve ürün-grup bağlantıları `docs/menu/ramos-menu-data.md`'dedir.

---

## 8. Ekranlar

### 8.1 Ortak: giriş ve ilk kurulum
- **`/login`:**
  - Kullanıcı adı + 6 haneli PIN girilir. Admin için güçlü parola kullanılır.
  - Tek bir genel hata mesajı gösterilir: "Kullanıcı adı veya PIN hatalı".
  - Oturum telefonda kalıcıdır.
- **Rol yönlendirme:** Girişten sonra waiter → `/waiter`, kitchen → `/kitchen`, admin → `/admin`. Admin garson ekranına da geçebilir.
- **İlk açılış rehberi (garson):**
  1. "Ana ekrana ekle" talimatı (iPhone: Paylaş → Ana Ekrana Ekle; Android: Yükle).
  2. Ana ekrandan açılınca "Bildirimleri aç" butonu. İzin mutlaka kullanıcı dokunuşuyla istenir.
  3. "Mesaiye başla".
  - iPhone'da push bildirimi ancak ana ekrana eklenmiş uygulamada çalışır (iOS 16.4+).

### 8.2 Garson (`/waiter`) — dikey telefon, tek elle kullanım
Alt menüde üç sekme var: **Masalar · Hazır (rozetli) · Profil**.
- **Masalar:**
  - Izgarada her masa rengiyle durum gösterir:
    - Gri: boş.
    - Lime: açık; toplam tutar, masayı açan kişi ve süre görünür.
    - Altın, yanıp sönen: hazır yemek bekliyor.
  - Üstte "Mesai kapalı" uyarı şeridi (gerekirse) ve "Yazıcı sorunu" şeridi (varsa) çıkar.
- **Masa detayı:**
  - Siparişler tur tur listelenir: `#047 · 19:42 · Ahmet · Mutfakta/Hazır/Teslim`, yanında yazdırma rozeti (✓ / ⏳ / ⚠ + "Tekrar bas").
  - Her kalemde varyant, OHNE satırı (kırmızı), seçimler ve not görünür. Aktif kalemde "İptal" (sebep seçtirir), hazır siparişte "Teslim edildi" butonu var.
  - Alt butonlar: **+ Sipariş ekle · Hesap özeti · Masayı taşı · Masayı kapat**.
- **Sipariş girişi:**
  - Üstte arama var: menü numarasıyla ("05", "71a", "M1") ya da isimle aranır.
  - Altında kategori çipleri (yatay kaydırma) ve ürün satırları (no · ad · fiyat) var. Tükenen ürün soluk görünür, "Tükendi" yazar.
  - Seçim gerektirmeyen ürün satırında **+** butonu var, tek dokunuşla sepete gider.
  - Diğer ürünlerde alttan bir panel (bottom sheet) açılır:
    1. Varyant segmenti **[Hähnchen 7,50] [Kalb 8,50]**
    2. Zorunlu gruplar (işaretli, varsayılan önceden seçili)
    3. **Malzeme çipleri** — dokununca üstü çizilir, kırmızı "OHNE"
    4. Soße çoklu seçim + "ohne Soße" (exclusive) + "scharf (Chili)" anahtarı
    5. Ekstralar (+ fiyat)
    6. Not alanı + ayarlardaki hızlı not çipleri
    7. Adet ve canlı satır fiyatı, **Sepete ekle** butonu (zorunlu grup eksikse pasif kalır ve eksik grup vurgulanır)
  - İstenirse: son 7 günün en çok satan 8 ürünü "Hızlı erişim" satırında gösterilir.
  - **Ürün görselleri:** Ürün satırının solunda 56 px kare küçük görsel, ürün panelinin üstünde 4:3 geniş görsel. Görsel yoksa marka renklerinde sade bir yer tutucu (alev işareti + ürün numarası) görünür; düzen görselli ve görselsiz aynı kalır. KDS'de görsel yok.
- **Sepet:**
  - Kalemler özetleriyle görünür: "Kalb · OHNE Zwiebeln · Knoblauch+Kräuter · scharf · +Weichkäse".
  - Her kalem düzenlenebilir, silinebilir, çoğaltılabilir. Siparişe genel not eklenebilir, toplam görünür.
  - **Mutfağa gönder** önce bir onay özeti gösterir, sonra başarı animasyonu çıkar.
  - İnternet yoksa buton kilitlenir ve kırmızı şerit çıkar. Sepet masa bazında cihazda saklanır.
- **Hazır sekmesi:** Hazır bekleyen siparişler listelenir; önce benim girdiklerim, sonra diğerleri. Dokununca teslim edildi olarak işaretlenir.
- **Hazır uyarısı:**
  - Uygulama açıksa: üst banner + ses (ilk etkileşimden sonra) + titreşim (yalnız Android).
  - Arka plandaysa veya ekran kilitliyse: Web Push. Başlık kullanıcının dilinde: "Masa 12 · #047 hazır" / "Tisch 12 · #047 fertig".
- **Hesap özeti:** Aktif kalemler gruplanır (adet × birim = tutar) ve genel toplam gösterilir. Kasaya giriş içindir, fiş basılmaz.
- **Masayı taşı:** Boş masalardan biri seçilir, mutfağa TISCHWECHSEL fişi basılır.
- **Masayı kapat:** Onay istenir. Mutfakta hazırlanan sipariş varsa kapatma engellenmez; pencere siparişin mutfak ekranında kalacağını ve hazır olunca Hazır listesine düşeceğini bilgi olarak gösterir (0008).
- **Profil:** Dil (TR/DE), mesai anahtarı, bildirim durumu / tekrar izin, çıkış.

### 8.3 Mutfak (`/kitchen`) — yatay tablet, 1–2 m'den okunur
- **Kartlar:**
  - `in_kitchen` siparişler zaman sırasıyla kart olarak dizilir.
  - Her kartta büyük **TISCH 12**, `#047`, garson adı ve geçen süre var. Süre rengi: 10 dk'ya kadar yeşil, 10–20 dk sarı, 20 dk'dan sonra kırmızı.
  - Kalemler büyük puntoyla yazılır. **OHNE satırları kırmızı**, seçimler normal, notlar sarı.
  - Ek siparişlerde "NACHBESTELLUNG" etiketi, iptal edilen kalemlerde üstü çizili yazı + "STORNO" görünür.
- **HAZIR ve geri alma:** Kartın altında büyük **HAZIR** butonu var. Basılınca kart sağdaki "Hazır" sütununa geçer ve 30 sn boyunca "Geri al" imkânı olur. Teslim edilen sipariş ekrandan kalkar.
- **Ses:**
  - Yeni sipariş gelince sesli uyarı çalar.
  - Tarayıcı kuralı gereği ses, ilk açılışta "Sesi etkinleştir" dokunuşuyla açılır.
- **Ekranın açık kalması:**
  - Wake Lock kullanılır; sayfa her tekrar görünür olduğunda (`visibilitychange`) yeniden istenir.
  - Öneri: Android tablet + Chrome, ekran zaman aşımı "hiçbir zaman". iPadOS'ta ana ekran uygulamasında Wake Lock 18.4'ten itibaren var.
- **Tükendi paneli:** Yan çekmecede kategorilere göre ürün anahtarları var.
- **Bağlantı ve yazıcı durumu:** Bağlantı koparsa kırmızı şerit çıkar. Yazıcı durumu da şerit olarak gösterilir: "Yazıcı çevrimdışı / kağıt bitti / basılamadı · Tekrar dene".

### 8.4 Admin (`/admin`) — masaüstü ağırlıklı, mobil uyumlu, TR/DE
- **Canlı durum:**
  - Açık masalar, mutfakta ve hazırda bekleyen siparişler.
  - Bugünkü sipariş/kalem sayısı ve liste fiyatıyla toplam.
  - **Yazıcı ajanı kartı:** son sinyal, yazıcıya ulaşılıyor mu, kağıt durumu, son baskı, başarısız işler, **Test fişi** butonu.
- **Menü:**
  - Kategoriler: DE/TR ad, içecek işareti, sürükle-bırak sıralama, aktiflik.
  - Ürünler: numara, ad, açıklama, temel fiyat veya varyantlar, alerjen kodları, aktif, tükendi, malzeme bağlama, seçim grubu bağlama, kopyalama, arşivleme.
  - Malzeme kütüphanesi (DE/TR).
  - Seçim grupları: min/max, fiş biçimi, seçenekler (fiyat farkı, varsayılan, exclusive).
  - **Toplu atama:** bir malzeme setini veya seçim grubunu seçili ürünlere tek seferde bağlama (ör. Döner seti → 12 ürün).
  - **Ürün görselleri:**
    - Ürün editöründe yükle / değiştir / kaldır. Tarayıcıda WebP'ye sıkıştırılır: 1200 px + 320 px küçük sürüm.
    - **Toplu yükleme:** Çok sayıda dosya bırakılır; dosya adı ürün numarasıyla eşleşir (`05.jpg`, `71a.webp`, `M1.png`). Eşleşmeyenler listelenir.
    - Ürün listesinde "Görseli yok" filtresi.
  - **Fiş önizleme:** seçili ürünle örnek fiş, ortak paketin satır render'ıyla gösterilir.
- **Personel:**
  - Garson/mutfak/admin ekleme: ad, kullanıcı adı, rol, PIN, dil.
  - PIN sıfırlama, pasifleştirme/aktifleştirme (silme yok). Mesai durumu görünür.
- **Masalar:** Ekleme, yeniden adlandırma, sıralama, pasifleştirme.
- **Siparişler:**
  - Tarih, masa, garson ve durum filtresi.
  - Detay ve fiş önizleme, tekrar baskı, iptal. Denetim kaydı görünümü.
- **Raporlar:**
  - Gün veya aralık seçilir.
  - Sipariş/kalem sayısı, liste fiyatıyla toplam, iptaller (adet/tutar), garson bazında, en çok satan 10 ürün, saatlik dağılım (tablo).
  - CSV dışa aktarma.
- **Ayarlar:**
  - Restoran adı, fiş başlığı/altlığı, iş günü başlangıcı.
  - **Yazıcı:** IP, port, karakter tablosu no, transliterasyon.
  - Hızlı notlar, iptal sebepleri, alerjen lejantı.

### 8.5 Durum renkleri (tüm yüzeylerde tutarlı)
boş = gri · açık / mutfakta = lime · hazır = altın · hata / OHNE / iptal = kırmızı · uyarı = turuncu · yazdırılıyor / kuyruk = mavi

---

## 9. Mutfak fişi

### 9.1 Genel kurallar
- 80 mm kağıt, 576 nokta, Font A ile satır başına **48 karakter**.
- Dil **Almanca**, fiyat yok.
- Kalemler kategori sırasına göre dizilir. İçecekler (`is_beverage`) en sonda "GETRÄNKE" alt başlığıyla gelir.
- Uzun satırlar 3 boşluk girintiyle kaydırılır.
- Fiş sonunda kağıt ilerletilip kısmi kesim yapılır (`GS V 66 0`).

### 9.2 Satır stilleri
| Öğe | Stil |
|---|---|
| Başlık (`ticket_header`) | ortalı, kalın |
| Tür bandı (NACHBESTELLUNG / \*\*\* STORNO \*\*\* / TISCHWECHSEL / NACHDRUCK / TESTDRUCK) | ortalı, ters renk, kalın, 2× yükseklik |
| Masa ("TISCH 12") | 2×2 boyut, kalın, büyük harf |
| Meta satırları | normal: "Bestellung #047 · Runde 2", "15.09.2026 19:42 · Kellner: Ahmet" |
| Kalem ("2x 05 Drehspieß Sandwich") | 2× yükseklik, kalın |
| Varyant / seçimler / ekstralar | normal, 3 boşluk girinti |
| `OHNE: …` | 3 boşluk girinti, **kalın + ters renk** |
| Kalem notu ("Hinweis: …") | normal, girintili |
| Sipariş notu | ayraçtan sonra kalın |

### 9.3 Örnek (sipariş, 2. tur)
```
                 RAMO'S · KÜCHE
              ░ NACHBESTELLUNG ░
TISCH 12
Bestellung #047 · Runde 2
15.09.2026 19:42 · Kellner: Ahmet
------------------------------------------------
2x 05 Drehspieß Sandwich
   Kalb
   █ OHNE: Zwiebeln, Tomaten █
   Soße: Knoblauch + Kräuter
   scharf (Chili)
   + Extra Weichkäse
   Hinweis: Soße extra
1x 47 Pizza Mix
   Beläge: Sucuk, Mais, Paprika, Oliven, Ei
------------------------------------------------
GETRÄNKE
3x Cola 0,33 l
------------------------------------------------
Hinweis: Kinderstuhl
```

### 9.4 Diğer türler
- **STORNO:** tür bandı, masa, "zu Bestellung #047", iptal edilen kalemler ve "Grund: Gast hat storniert".
- **TISCHWECHSEL:** tür bandı ve "TISCH 3 → TISCH 5", altında "Offene Bestellungen: #047, #052".
- **NACHDRUCK:** orijinal fiş, üstünde tür bandıyla.
- **TESTDRUCK:**
  - Yazıcı ayarları (IP, karakter tablosu).
  - Karakter satırı: `ÄÖÜ äöü ß · Şş Ğğ İı Çç · 0123456789 · #*-+`
  - Örnek bir sipariş ve tarih.

---

## 10. Yazdırma ajanı (`apps/print-agent`)

### 10.1 Sorumluluklar
1. Supabase'e **yazıcı rolündeki kullanıcıyla** giriş yapar. `service_role` anahtarı ajanda **yoktur**.
2. İki yoldan iş alır:
   - Realtime'da `print-jobs` ve `settings` konularını dinler.
   - Yedek olarak **5 sn'de bir** `claim_print_job` ile kuyruğu kontrol eder. Bu periyodik sorgu aynı zamanda ücretsiz projenin uykuya geçmesini de önler.
3. İşleri **tek tek, sırayla** basar. Xprinter ağ üzerinden aynı anda tek iş kabul eder.
4. 30 sn'de bir `agent_heartbeat` gönderir. Boştayken 15 sn'de bir yazıcının durumunu kontrol eder.
5. Ayar değişince (IP, karakter tablosu) kendini yeniden yapılandırır; yeniden başlatmak gerekmez.

### 10.2 Yapılandırma
- **Yerel `.env`** (asla commit edilmez): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AGENT_EMAIL`, `AGENT_PASSWORD`, `AGENT_ID` (ör. "ramos-pc-1"), `LOG_DIR`.
- **Yazıcı ayarları** (IP, port, karakter tablosu no, transliterasyon, başlık) veritabanındaki `settings`'ten okunur ve admin panelden değiştirilir.

### 10.3 İş döngüsü
1. `claim_print_job` ile iş alınır.
2. **Ön kontrol:** Yazıcıya TCP ile bağlanılır (3 sn zaman aşımı) ve `DLE EOT 1/2/4` (`10 04 01 10 04 02 10 04 04`) gönderilir, 1 sn içinde 3 bayt yanıt beklenir.
   - Bağlanılamazsa: `offline`.
   - Yanıttaki bitler:
     - 1. bayt `&0x08` → offline
     - 2. bayt `&0x04` → kapak açık, `&0x20` → kağıt bittiği için durdu
     - 3. bayt `&0x60` → kağıt bitti, `&0x0C` → kağıt azaldı (yalnız uyarı)
   - Yanıt gelmezse durum "bilinmiyor" sayılır ve devam edilir.
   - Hata varsa **gönderilmez**, `complete_print_job(false, 'paper_end' | 'cover_open' | 'offline')` çağrılır ve iş sonra tekrar denenir.
3. Payload, `packages/shared` ile satırlara çevrilir, ardından ESC/POS baytlarına kodlanır ve aynı bağlantı üzerinden yazılıp bağlantı kapatılır.
4. **Son kontrol:** Durum yeniden sorgulanır. Hata görülürse iş yine `printed` sayılır (bayt gönderildi, çift baskı riskine girilmez), ama heartbeat'e uyarı olarak yansır.
5. `complete_print_job(true)` çağrılır. Hata olursa yeniden deneme zamanlamasını sunucu yapar.

Not: TCP'ye yazmanın başarılı olması "kağıda basıldı" demek değildir. Bu yüzden ön ve son durum kontrolü yapılır.

### 10.4 ESC/POS kodlama (Xprinter)
- **Kütüphane:** `@point-of-sale/receipt-printer-encoder` 3.x, ESC/POS modunda.
  - Ayarlar: `printerModel: 'xprinter-xp-t80q'` (XP-Q80A profili yok, en yakını bu), `columns: 48`.
  - **Özel `codepageMapping`:** `{ cp437: 0, cp858: 19, windows1252: 16, cp857: 61 }`. Kütüphanenin yerleşik Xprinter haritasında Türkçe yok.
- **Init:** `initialize()` şu baytları üretir: `ESC @` + `FS .` (Çince modu kapatır; Xprinter'da şart) + `ESC M 0`.
  - Ardından **her init sonrası** `ESC t 61` (PC857) gönderilir, çünkü `ESC @` karakter tablosunu sıfırlar.
- **Karakterler:** Tablo PC857: Almanca `ä ö ü ß` ve Türkçe `ş ğ ı İ ç` karakterlerinin hepsini içerir, € işareti yoktur. Fişte fiyat olmadığı için € gerekmez.
- **Yedek:** Test sayfasında Türkçe karakterler bozuk çıkarsa:
  1. `printer_codepage_number` = 91 (WPC1254) denenir.
  2. O da olmazsa `printer_transliterate = true` yapılır: ş→s, ğ→g, ı→i, İ→I, Ş→S, Ğ→G.
- **Kesim:** Önce kağıt ilerletilir, sonra `GS V 66 0` ile kısmi kesim yapılır. XP-Q80A'da tam kesim yok.
- **Zil:** XP-Q80A'da zil yok gibi görünüyor. Sesli uyarıyı KDS verir.

### 10.5 Komutlar (npm script)
- `agent` — çalıştır
- `agent:dry-run` — işleri yazıcıya göndermeden konsola metin önizlemesi olarak basar
- `agent:test-print` — TESTDRUCK
- `agent:status` — yazıcı durumunu sorgular ve yazdırır
- `agent:fake-printer` — geliştirme için sahte TCP 9100 sunucusu; gelen baytları dosyaya yazar ve durum yanıtı (`0x12`) döner

### 10.6 Otomatik başlatma ve loglar
- **Windows:**
  - `install-agent.ps1` bir **Zamanlanmış Görev** oluşturur: "RamosPrintAgent", oturum açılınca başlar, çökerse yeniden başlatılır.
  - Loglar `%LOCALAPPDATA%\RamosPrintAgent\logs` altına yazılır: 7 gün tutulur, 5 MB'ta dönüşür.
  - `.ps1` dosyaları **UTF-8 BOM'lu** kaydedilmelidir. PowerShell 5.1 BOM'suz UTF-8'i yanlış okur.
- **Raspberry Pi / Linux:** `deploy/ramos-print-agent.service` systemd birimi ve kurulum notu.

### 10.7 Yazıcı ağ kurulumu (restoran)
1. XP-Q80A Ethernet kablosuyla modeme veya switch'e takılır. USB bağlantısı durabilir; iki arayüzün birlikte aktif kaldığı kurulumda test edilir.
2. **Self-test:** Yazıcı kapalıyken FEED'e basılı tutulur, açılır, 2–3 sn sonra bırakılır. Basılan sayfada IP (fabrika: `192.168.123.100`) ve karakter tablosu listesi görünür. **Listede 61 = PC857 var mı** kontrol edilir.
3. IP restoranın alt ağına göre ayarlanır. Yöntemler: Xprinter "Printer Test Tool" (Port: NET, PC aynı alt ağda) ya da USB üzerinden IP komutu. Modemde bu IP için DHCP rezervasyonu yapılması önerilir.
4. Admin → Ayarlar → Yazıcı: IP kaydedilir, **Test fişi** basılır.

### 10.8 Geliştirme testi
- **Otomatik testler:** Ajan ve fiş testleri `agent:fake-printer` ile yapılır. Gelen baytlar doğrulanır: init dizisi, `ESC t 61`, OHNE satırı, kesim komutu.
- **Gerçek yazıcıyla test:** Geliştirme PC'sindeki Xprinter kullanılır (Windows'ta "XP-80", USB001).
  1. Kullanıcıdan yazıcıyı modeme Ethernet ile bağlaması istenir.
  2. Self-test sayfasından IP öğrenilir, gerekirse aynı alt ağa ayarlanır.
  3. TESTDRUCK ve örnek siparişler basılır.
- **Yazıcıda LAN portu yoksa:** Yalnızca geliştirme için, USB spooler'a RAW gönderen geçici bir `windows-raw` taşıma katmanı yazılabilir (winspool `WritePrinter`, datatype `RAW`; XP-80 v3 sürücüsü RAW kabul eder). Üretimde kullanılmaz. Önce kullanıcıya sorulur.

---

## 11. Realtime ve bildirimler

### 11.1 Broadcast from Database (Supabase'in önerdiği yöntem)
- Tablolardaki trigger'lar `realtime.broadcast_changes(...)` ile **özel (private) kanallara** yayın yapar. Konular ve dinleyenleri:

| Konu | Hangi değişiklikler | Dinleyenler |
|---|---|---|
| `orders` | orders, order_items, table_sessions | admin, waiter, kitchen |
| `menu` | categories, products, variants, options, groups, ingredients | admin, waiter, kitchen |
| `print-jobs` | print_jobs | printer, admin |
| `printer-status` | printer_status | tüm aktif personel |
| `settings` | settings | tüm aktif personel + printer |

- `realtime.messages` üzerindeki RLS politikası, rolün hangi konuyu dinleyebileceğini `has_role(...)` ile kontrol eder.

### 11.2 İstemci davranışı
- **Olay = "tazele" sinyali.** İstemci ilgili TanStack Query anahtarlarını geçersiz kılar ve veriyi REST'ten okur; yayın içeriğine güvenmez.
- **Yeniden bağlanma:** `createClient(url, key, { realtime: { worker: true, heartbeatCallback } })` kullanılır. Bağlantı `disconnected` olunca yeniden bağlanılır.
- **Tam tazeleme:** Bağlantı geri geldiğinde ve sayfa tekrar görünür olduğunda tüm veriler tazelenir. KDS'de ayrıca 30 sn'de bir güvenlik tazelemesi yapılır.
- Özel kanallara abone olmadan önce oturum token'ı Realtime'a iletilir (`setAuth`).

### 11.3 Web Push (`notify-ready`)
- **Tetikleme:** `orders.status` `ready` olunca bir trigger `pg_net` ile `POST /functions/v1/notify-ready` çağırır.
  - İstek başlığında `x-webhook-secret` gönderilir; sır Vault'tan okunur.
  - Fonksiyon `verify_jwt = false` ile çalışır, sırrı kendisi doğrular.
- **Hedef:** Aktif ve **mesaide** olan tüm `waiter` + `admin` kullanıcılarının abonelikleri.
  - Bildirim metni alıcının dilindedir, ilk 3 kalemin özetini içerir.
  - `tag` = sipariş kimliği, böylece aynı sipariş için yeni bildirim eskisinin yerine geçer.
  - Bildirime tıklanınca `/waiter/ready` açılır.
- **Kütüphane:** Web Crypto tabanlı `jsr:@negrel/webpush` ya da `@pushforge/builder` kullanılır. `npm:web-push` bakımsız olduğu için kullanılmaz.
- **Temizlik:** 404/410 dönen abonelikler silinir.
- **Platformlar:**
  - iOS/iPadOS 16.4+ yalnızca ana ekrana eklenmiş uygulamada çalışır, izin kullanıcı dokunuşuyla istenir. AB'de de geçerlidir.
  - Android Chrome: HTTPS + service worker + `userVisibleOnly: true`.
  - `navigator.vibrate` iOS'ta yoktur.
- **VAPID anahtarları** betikle üretilir. Public anahtar `VITE_VAPID_PUBLIC_KEY` olarak web uygulamasına, private anahtar Edge Function secret'ı olarak saklanır.

### 11.4 Mesai
- `set_on_duty(true)` → `on_duty_since = now()`.
- `is_on_duty` iş günü başlangıcından (05:00) önce açılmış mesaiyi geçersiz sayar. Böylece mesai her gece kendiliğinden kapanır.
- Mesai kapalı olan garson sipariş girebilir, ama "Hazır" bildirimi almaz. Ekranda uyarı şeridi görür.

---

## 12. Güvenlik

- **Hesaplar:**
  - Kendi kendine kayıt **kapalıdır**: Auth ayarlarında "Allow new users to sign up" kapatılır. Kodda `signUp` ve `resetPasswordForEmail` hiç çağrılmaz.
  - Personeli yalnızca admin açar. Bunu `admin-staff` Edge Function'ı yapar:
    - `verify_jwt = true`; çağıranın aktif admin olduğu fonksiyon içinde kontrol edilir.
    - Kullandığı API'ler: `auth.admin.createUser({ email, password, email_confirm: true })`, `updateUserById` (PIN sıfırlama), ban (`ban_duration: '876000h'`) ve unban (`'none'`).
- **Sentetik e-posta:** `<username>@<STAFF_EMAIL_DOMAIN>`, varsayılan `staff.arxdigitalsevice.com` (kullanıcının kendi alan adı).
  - Bu adreslere hiçbir zaman e-posta gönderilmez.
  - `.local` gibi uzantılar Auth'un e-posta doğrulayıcısına takılabildiği için gerçek bir alt alan adı kullanılır.
- **PIN:**
  - Garson ve mutfak için en az 6 hane; admin için en az 10 karakterli parola.
  - Supabase'in IP bazlı giriş sınırı geçerlidir.
  - Kullanıcı adları arayüzde listelenmez, hata mesajı geneldir.
- **RLS:**
  - Menü: aktif personel okur, yalnızca admin yazar.
  - Siparişler, kalemler, oturumlar: admin, waiter ve kitchen okur. Yazma yalnızca RPC ile.
  - `print_jobs`: printer ve admin okur. `printer_status`: aktif personel okur, printer RPC ile yazar.
  - `push_subscriptions`: yalnızca kendi satırları. Politikalar **`authenticated`** rolü için tanımlanır (anon değil).
  - `settings`: personel ve printer okur, admin yazar.
  - `audit_log`: admin okur.
  - `profiles`: herkes kendi satırını okur, admin tümünü okur. Değişiklikler RPC veya Edge Function ile yapılır.
- **Ürün görselleri (Storage):** `product-images` bucket'ı herkese açık okunur (menü görselleri gizli değil). Yükleme, silme ve listeleme yalnızca admin yapar (`storage.objects` politikaları); izinli türler webp/jpeg/png, en fazla 5 MB.
- **Pasifleştirme:** `is_active = false` + Auth ban uygulanır. RLS yardımcıları her sorguda aktifliği kontrol ettiği için etki anında başlar.
- **Sırlar:**
  - `.env` dosyaları commit edilmez.
  - `service_role` anahtarı yalnızca seed betiklerinde ve Edge Functions'ta kullanılır. Ajan printer rolüyle çalışır.
  - Webhook sırrı Vault'ta tutulur.
- **Denetim:**
  - Supabase advisors (security + performance) temiz olmalıdır.
  - RPC'lerde `search_path` sabitlenir. Dinamik SQL kullanılmaz.
- **Gizlilik (DSGVO):** Müşteri kişisel verisi tutulmaz (masa bazlı sipariş). Personel için yalnızca ad ve kullanıcı adı tutulur.

---

## 13. Hata ve kesinti senaryoları

| Senaryo | Davranış |
|---|---|
| Garsonun telefonunda internet yok | Gönder butonu kilitlenir, kırmızı şerit çıkar. Sepet saklanır, bağlantı gelince veriler tazelenir |
| Gönderirken bağlantı koptu, cevap gelmedi | Aynı `order_id` ile 3 kez otomatik tekrar. Sunucu idempotent olduğu için çift sipariş olmaz. Hâlâ belirsizse "Siparişi kontrol et" durumu, masa detayından doğrulanır |
| Ürün gönderim anında tükenmiş | `product_sold_out` hatası döner, sepetteki ilgili satır işaretlenir |
| Yazıcı kapalı veya ağa bağlı değil | Ön kontrol yakalar, iş kuyrukta bekler ve 5–120 sn aralıklarla tekrar denenir. KDS, garson ve admin "⚠ Yazıcıya ulaşılamıyor" uyarısı görür. Sipariş KDS'de zaten görünür |
| Kağıt bitti / kapak açık | Fiş gönderilmez, "Kağıt bitti" uyarısı çıkar. Sorun giderilince fiş otomatik basılır |
| Ajan veya PC kapalı | 90 sn sinyal gelmezse "Yazıcı ajanı çevrimdışı" uyarısı çıkar. İşler kuyrukta bekler, PC açılınca sırayla basılır |
| 6 deneme başarısız | İş `failed` olur. KDS ve admin'de kırmızı "Basılamadı · Tekrar dene" |
| Mutfak tableti kapalı | Fişler yine basılır. HAZIR admin panelden de işaretlenebilir |
| Realtime koptu | İstemciler yeniden bağlanır ve tüm veriyi tazeler. Ajan 5 sn'lik sorguyla devam eder |
| iPhone arka planda | Uygulama içi uyarı çalışmaz, Web Push devreye girer (ana ekrana eklenmiş olmalı) |
| Supabase kesintisi | Hiçbir yazma yapılamaz, garson açık hata görür. Kurulum rehberinde acil durum notu: "kağıda al" |
| Ücretsiz proje uykuya geçti (7 gün düşük aktivite) | Sahibine e-posta gelir, panelden "Restore" edilir. Ajan açık kaldıkça olmaz. Uzun tatil notu kurulum rehberinde yer alır |

---

## 14. Tasarım sistemi (UI)

- **Kimlik:** Menünün kara tahta + neon lime + altın dili sürdürülür. Tüm yüzeyler koyu temadır.
- **Başlangıç renkleri** (PDF'ten ölçüldü; build'de ui-ux-pro-max ile tamamlanır):
  - Zemin ve yüzeyler: `--bg #0A0A0A` · `--surface #141414` · `--surface-2 #1C1C1C` · `--border #2A2A2A`
  - Metin: `--text #F5F5F0` · `--muted #A3A3A3`
  - Vurgular: **`--lime #88B600`** (#0A0A0A zeminde 8,2:1 kontrast) · **`--gold #C49736`** (7,4:1, hazır durumu)
  - Durum renkleri: `--danger #E5484D` · `--warning #F5A524` · `--info #3E9BFF`
- **Tipografi:** UI için Montserrat (menüdeki ürün adlarıyla uyumlu), @fontsource ile yerel olarak barındırılır. Rakamlarda `tabular-nums` kullanılır.
- **Logo:** PDF 1. sayfasındaki gömülü görselden (1318×1866) "RAMO'S" yazısı ve alev çıkarılır, renkleri **değiştirilmez**. PWA ikonları (192, 512, maskable) siyah zemin üzerine üretilir.
- **Dokunma ve okunurluk:**
  - Dokunma hedefleri ≥ 48 px. Ana eylemler başparmak bölgesinde (alt kısımda) durur.
  - KDS'de kalem satırları 10" tablette ≥ 22 px.
  - Kontrast WCAG AA.
- **Hareket:** Kısa ve anlamlı mikro animasyonlar (sepete ekleme, gönderildi, hazır rozeti nabzı). `prefers-reduced-motion` desteklenir.
- **Tasarım yönü — sade ve şık:** Garson, aşçı ve patron ilk bakışta anlamalı.
  - Her ekranda tek ana eylem; günlük dil; ikon + yazı; en fazla 2 seviye derinlik.
  - Renk anlamı sabit; boş durumlar yol gösterir.
  - Hedef: ürün eklemek en fazla 3 dokunuş.
  - Ayrıntılı ilkeler: BUILD-PROMPT §10.
- **Build'de zorunlu skill'ler:**
  - `ui-ux-pro-max` (design system + UX kontrol listeleri), `frontend-design` (sanat yönü), `ui-styling`, `design-system`, `motion-framer`, `dataviz` (admin), `design:ux-copy` (metinler).
  - Kapılarda `design:accessibility-review` ve `design:design-critique`.
  - Her ekran `webapp-testing` (Playwright) ile ekran görüntüsü alınarak doğrulanır.
  - M3, M4 ve M6 sonunda **tasarım kapısı** var: kritik bulgular düzeltilmeden sonraki aşamaya geçilmez.

---

## 15. i18n ve biçimlendirme
- **Arayüz metinleri:** react-i18next ile `tr.json` / `de.json`. Anahtarlar tipli, eksik anahtar testi var.
- **Dil seçimi:** Varsayılan dil personelin `locale` alanıdır, profil ekranından değiştirilebilir. KDS hesabının dili admin tarafından ayarlanır.
- **Veri adları:** Kategori, malzeme ve seçenek adları kullanıcı diline göre gösterilir; `name_tr` boşsa `name_de` kullanılır. Ürün adı tek dildir (menüdeki gibi). **Fiş her zaman Almanca.**
- **Biçimler:**
  - Para her iki dilde `8,50 €` biçimindedir.
  - Tarih `dd.MM.yyyy HH:mm`, saat dilimi `Europe/Berlin`.
  - Sipariş numarası 3 hanelidir (`#047`).
- **RPC hataları:** Hata anahtarları (§6.1) çeviri dosyalarında karşılığıyla tutulur.

---

## 16. Test stratejisi
- **Birim testleri (Vitest):**
  - Fiyat hesabı
  - Seçim kuralları (min/max, exclusive, varsayılan)
  - Sepette birleştirme
  - Fiş satır render'ı (48 kolon, kaydırma, türler)
  - ESC/POS baytları (init, `FS .`, `ESC t 61`, stiller, kesim)
  - Durum baytı çözümleme
  - i18n anahtar eşitliği
- **Veritabanı testleri (canlı projeye karşı betik):**
  - Her rol yalnız kendi RPC'lerini çalıştırabilir.
  - `anon` hiçbir şey göremez.
  - Pasif garson kilitlenir.
  - `submit_order` doğrulamaları ve idempotency.
  - Günlük numara, iş günü geçişi.
  - `claim_print_job`'da iki ajanın aynı işi alamaması (SKIP LOCKED).
  - Yeniden deneme zamanlaması.
- **Ajan testleri:**
  - Sahte TCP yazıcıyla uçtan uca: kuyruk → bayt → `printed`.
  - Yazıcı kapalıyken yeniden deneme; kağıt bitti yanıtıyla gönderimin engellenmesi.
- **E2E (Playwright, `webapp-testing`):**
  1. Garson girişi.
  2. Masa 12'ye 05 Kalb + OHNE Zwiebeln + Knoblauch/Kräuter + scharf + Extra Weichkäse eklenir, Pizza Mix'e 5 malzeme seçilir, Cola eklenir, gönderilir.
  3. KDS'de sipariş görünür ve HAZIR'a basılır.
  4. Garsonun ekranında hazır rozeti ve banner çıkar.
  5. Garson teslim eder, hesap özetinin toplamı doğrulanır, masa kapatılır.
  - Yan senaryolar: kalem iptali (STORNO işi oluşur), masa taşıma, tükendi ürün.
  - Görünümler: telefon 390×844, tablet 1280×800, masaüstü 1440×900; ekran görüntüleri alınır.
- **Gerçek yazıcı:** TESTDRUCK + 3 örnek fiş (sipariş, STORNO, TISCHWECHSEL) basılır ve fotoğrafla kullanıcı onayına sunulur.

---

## 17. Yayına alma ve operasyon

### 17.1 Supabase
- **Proje:** `ramos-siparis`, org **Cicekci** (`mdsctajrlrckvwhkcfnd`), bölge **eu-central-1**, Free plan (maliyet 0 $).
- **Oluşturma yolu:** Supabase MCP'deki `create_project` (`get_cost` → `confirm_cost`). MCP yoksa kullanıcıdan bir Personal Access Token istenir ve Management API kullanılır.
- **Veritabanı parolası** güçlü üretilir ve yerel `.env`'de tutulur (yedekleme için gerekli).
- **Kurulum adımları:**
  1. Migration'lar uygulanır.
  2. Uzantılar açılır: `pg_net`, `pgcrypto` (gerekirse).
  3. Vault'a webhook sırrı eklenir.
  4. Edge Functions yayınlanır: `admin-staff` (`verify_jwt = true`), `notify-ready` (`verify_jwt = false`).
  5. Function secret'ları girilir: `VAPID_*`, `WEBHOOK_SECRET`, `STAFF_EMAIL_DOMAIN`.
  6. Auth ayarı: kayıt kapalı, Site URL = uygulama adresi.

### 17.2 Web (Plesk sunucusu)
- **Sunucu:** menu.arxdigitalsevice.com'un çalıştığı Plesk sunucusu (Ubuntu 24.04, 87.106.47.17).
  - SSH erişimi kullanıcıya teyit ettirilir (`~/.ssh/tvds_deploy`).
  - **Aynı sunucudaki diğer sitelere, menupanels Supabase stack'ine ve tv-display-system Docker'ına dokunulmaz.**
- **Kurulum:**
  1. Yeni bir alt alan adı açılır (adı kullanıcıya sorulur, öneri: `ramos.arxdigitalsevice.com`) ve Let's Encrypt SSL kurulur.
  2. `apps/web/dist` alt alan adının belge köküne yüklenir; sahiplik doğru sistem kullanıcısına verilir.
- **SPA yönlendirmesi** (bilinmeyen yollar `index.html`'e gider), iki yoldan biriyle:
  - Apache açıksa `.htaccess`.
  - Değilse Plesk "Additional nginx directives". Plesk'in kendi `location /` bloğuyla çakışmamak için **`location ~ ^/` regex kalıbı** kullanılır.
- **Önbellek:**
  - `index.html`, `sw.js`, `manifest.webmanifest` → `no-cache`.
  - `/assets/*` → `max-age=31536000, immutable`.
- **Yayın:** Build → yükleme → duman testi, `deploy/deploy-web.ps1` betiğiyle yapılır.

### 17.3 Ajan (restoran PC'si)
1. Node LTS kurulur, `apps/print-agent` kopyalanır ve `npm ci` çalıştırılır.
2. `.env` doldurulur ve `install-agent.ps1` çalıştırılır.
3. Test fişi basılır.
Adımların tamamı ekran görüntüleriyle `docs/KURULUM.md`'de anlatılır.

### 17.4 Yedekleme
- **Gecelik iş (Plesk sunucusu, 04:30):** `docker run --rm postgres:17-alpine pg_dump "<session pooler URL>" -Fc` → `/opt/backups/ramos/ramos-YYYY-MM-DD.dump`.
- **Saklama:** 30 gün.
- **Kimlik bilgisi:** Bağlantı parolası `/opt/backups/ramos/.env` dosyasında tutulur (chmod 600).
- **Mevcut yedeklerle çakışma yok:** tv-display-system'in 04:15'teki yedeğinden ayrı klasör ve ayrı saat kullanılır.
- **Geri yükleme:** Adımları kurulum rehberinde anlatılır.

### 17.5 Ücretsiz plan notları
- Limitler: 500 MB veritabanı, 5 GB egress, Realtime'da 200 eşzamanlı bağlantı ve ayda 2M mesaj, Edge Function'da ayda 500K çağrı. Tek restoran için fazlasıyla yeterli.
- Uyku ve yedek:
  - 7 gün düşük aktivitede proje uyur; ajanın periyodik sorgusu bunu engeller.
  - Supabase Free'de yedek yoktur, bu yüzden §17.4'teki gecelik yedek kurulur.
- İleride ihtiyaç olursa Pro plana geçilir (ayda 25 $, günlük yedek dahil).

---

## 18. Build aşamaları (özet — ayrıntılar `docs/BUILD-PROMPT.md`'de)

**Yürütme:**
- **Faz A (etkileşimli):** Tüm bilgiler ve ön onaylar tek seferde toplanır.
- **Faz B:** Kullanıcı onaylayıp auto moda geçince 30 görev kesintisiz yapılır.
- **Sona kalanlar:** Fiziksel doğrulamalar (gerçek fiş fotoğrafı, telefonda push) son kontrol listesine yazılır.

| Aşama | İçerik | Çıkış ölçütü |
|---|---|---|
| M0 | Repo iskeleti (npm workspaces), araçlar, Supabase projesi, `.env`'ler, tasarım tokenları | `npm run check` yeşil, proje erişilebilir |
| M1 | Şema + RLS + yardımcılar + RPC'ler + broadcast trigger'ları + seed (menü, masalar, ayarlar) + DB testleri | DB test betiği yeşil, advisors temiz |
| M2 | Auth, `admin-staff` fonksiyonu, admin/ajan hesap betikleri, rol yönlendirme, i18n altyapısı | 4 rolle giriş çalışıyor, RLS doğrulandı |
| M3 | Garson uygulaması (masalar → sipariş → sepet → gönder → masa detayı, iptal, hesap özeti, taşı, kapat) | Birim testleri + telefon ekran görüntüleri |
| M4 | KDS + realtime + HAZIR/geri al + tükendi + ses/wake lock | Garson → KDS canlı akışı ≤ 2 sn |
| M5 | Fiş modeli/render + yazdırma ajanı + sahte yazıcı + gerçek Xprinter testi + otomatik başlatma | Gerçek fiş fotoğrafı onaylandı |
| M6 | Admin paneli (menü CRUD + toplu atama + önizleme, personel, masalar, siparişler, raporlar, ayarlar) | Admin E2E + ekran görüntüleri |
| M7 | PWA (manifest, ikonlar, SW) + Web Push (`notify-ready`) + mesai + ilk açılış rehberi | Android'de ve (varsa) iPhone'da push alındı |
| M8 | Tam E2E, güvenlik denetimi, Plesk yayını, yedek cron'u, `KURULUM.md` | Canlı adres + kontrol listesi tamam |

---

## 19. Açık noktalar ve varsayımlar (Faz A'da tek seferde sorulur; fiziksel doğrulamalar sona kalır)
1. **Masa sayısı:** Varsayılan Tisch 1–12.
2. **Uygulamanın alt alan adı** (öneri `ramos.arxdigitalsevice.com`) ve Plesk SSH erişiminin teyidi (M8).
3. **Hesap bilgileri:** İlk admin kullanıcı adı ve parolası (M2; repoya yazılmaz). Garson adları ve PIN'leri, kullanıcı admin panelden kendisi girer.
4. **`STAFF_EMAIL_DOMAIN` teyidi:** Varsayılan `staff.arxdigitalsevice.com`.
5. **Restoran tarafı:**
   - Restoran PC'sinin işletim sistemi ve açık kalma saatleri.
   - Yazıcının oradaki IP'si.
   - XP-Q80A firmware'inde 61 = PC857 olup olmadığı (self-test sayfası).
6. **Test yazıcısının** Ethernet portu olup olmadığı (M5).
7. **Menü belirsizlikleri** (`docs/menu/ramos-menu-data.md` → "Açık noktalar"):
   - 57/58, 59/60, 61/62 arasındaki fark.
   - Calamari ürünü var mı.
   - Sıcak içecekler.
   - Salata açıklamaları.
   - Pizza Spezial açıklaması.
   - Grill yan malzemeleri.
   - Alerjen lejantının teyidi.
8. **TSE / Steuerberater teyidi** (işletme sahibi).

---

## 20. v2 fikirleri (kapsam dışı)
- Kasa entegrasyonu (kasa yazılımının API'si varsa) ile çift girişi kaldırmak
- Paket (Mitnahme) ve telefon siparişi
- Çoklu istasyon / yazıcı yönlendirmesi (Döner, Pizza, Bar)
- Masa birleştirme, hesap bölme; müşteri QR menüsü
- Grafikli raporlar, stok takibi
- Yazdırma ajanını Raspberry Pi'ye taşımak
- Çok restoranlı (multi-tenant) sürüm

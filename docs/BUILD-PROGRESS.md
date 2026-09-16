# Build ilerlemesi

## Faz A girdileri (sırsız özet) ve onaylananlar
- **Tarih:** 2026-09-15 · **Dal:** `build/ramos-v1` · **Spec:** `docs/superpowers/specs/2026-09-15-ramos-siparis-sistemi-design.md` · **Planlar:** `docs/superpowers/plans/2026-09-15-ramos-plan-1…5-*.md`
- **Admin:** kullanıcı adı `ramo`, görünen ad `Ramo` (parola kök `.env` → `ADMIN_PASSWORD`; admin oluşturulunca satır silinir)
- **Masa sayısı:** 12 (`SEED_TABLE_COUNT=12`) · **Personel e-posta alanı:** `staff.arxdigitalsevice.com`
- **Test yazıcısı:** `192.168.1.250` (`PRINTER_DEV_HOST`); self-test: 61 = PC857 → `cp857 / 61`. Faz A'da TCP 9100 yanıtsızdı (ARP'ta cihaz kaydı var).
- **Yayın:** `ramos.arxdigitalsevice.com` (Cloudflare A → 87.106.47.17, DNS only, doğrulandı) · SSH `root@87.106.47.17`, anahtar `C:/Users/PC/.ssh/tvds_deploy` (kullanıcı teyitli) · Let's Encrypt e-postası `info@menupanels.com`
- **Tasarım skill'leri:** `design:ux-copy`, `design:accessibility-review`, `design:design-critique` kurulu değil → muadiller (bkz. `BUILD-DECISIONS.md`)
- **Supabase MCP:** yetkisiz → advisors, TS tipleri ve loglar Management API (PAT) ile

### Onaylananlar (Faz B'de tekrar sorulmaz)
- **Supabase:** `ramos-siparis` projesini oluşturma (Free, 0 $, Cicekci org, eu-central-1); migration'lar, Storage bucket'ı, Edge Function yayınları, function secret'ları, Vault sırları; Auth ayarları (kayıt kapalı, site URL). `Cicek-web`'e dokunulmaz.
- **Plesk sunucusu:** yalnız `ramos.arxdigitalsevice.com` alt alan adının oluşturulması, SSL, dosya yükleme ve sahiplik ayarı; `/opt/backups/ramos` klasörü ve `/etc/cron.d/ramos-backup` cron'u. Başka hiçbir site, servis ya da ayar değiştirilmez.
- **Veri:** yayın öncesi test verisi temizliği (`scripts/go-live-cleanup.mjs --yes`).
- **Geliştirme PC'si:** ajanın Zamanlanmış Görev olarak kurulup kaldırılması denemesi.

## Ön kontrol ("başla", 2026-09-15 22:00)
- `.env`: Faz A anahtarlarının hepsi dolu; `ADMIN_PASSWORD` ≥ 10 karakter; PAT biçimi doğru; genel ortamda `.env`'yi gölgeleyen değişken yok ✓
- Supabase (PAT, salt-okunur): org **Cicekci** (`mdsctajrlrckvwhkcfnd`) görünüyor, plan **free** → yeni proje 0 $ ✓ · mevcut projeler: yalnız `Cicek-web` (ACTIVE_HEALTHY) → aktif ücretsiz proje 1/2, kota uygun ✓ · `ramos-siparis` yok ✓
- SSH (salt-okunur): `root@87.106.47.17` erişimi ✓ — Plesk Obsidian 18.0.80.7, Ubuntu 24.04; `arxdigitalsevice.com` bu sunucuda site olarak kayıtlı → Görev 28'de `plesk bin subdomain --create ramos -domain arxdigitalsevice.com` yolu kullanılır
- DNS: `ramos.arxdigitalsevice.com` → 87.106.47.17 (1.1.1.1 ve 8.8.8.8 ile doğrulandı) ✓
- Yazıcı: `192.168.1.250:9100` TCP ✓ (ping yanıtsız — yazıcı ICMP'ye cevap vermiyor, sorun değil)
- Dal `build/ramos-v1` açıldı → **Faz B başladı**

## Oluşturulan kaynaklar (sırsız)
- **Supabase projesi** (Görev 2): `ramos-siparis` — ref `ypuzbmjzqbjahfkksgps` — eu-central-1 · Postgres 17.6 · Free (org Cicekci). Anahtarlar: eski JWT `anon` / `service_role` (kök `.env`). Auth: `disable_signup: true`, `site_url: https://ramos.arxdigitalsevice.com`. Advisors: 0 / 0.

## Sunucu komutları günlüğü (Plesk — her komut çalıştırılmadan önce yazılır)
| Zaman | Görev | Komut | Tür | Sonuç |
|---|---|---|---|---|
| 2026-09-15 22:00 | Ön kontrol | `ssh -i C:/Users/PC/.ssh/tvds_deploy -o BatchMode=yes root@87.106.47.17 "plesk version; plesk bin site --list"` | salt-okunur | ✓ Plesk Obsidian 18.0.80.7 · Ubuntu 24.04 · 11 site listelendi |

## Görevler
### M0 — Temel (Plan 1)
- [x] Görev 1 — Monorepo iskeleti ve araç zinciri — `c9232b9` — `npm run check` ✓ (shared 2/2), inceleme temiz
- [x] Görev 2 — Supabase projesi, ortam dosyaları ve DB betiği — `8dddcaf`, `985de66` — db:sql 17.6 ✓, db:apply ✓, `npm run check` ✓, advisors 0/0; inceleme temiz (1 düzeltme turu: migrations/.gitkeep)
### M1 — Veritabanı (Plan 1)
- [x] Görev 3 — Migration 0001: şema — `d9d29c5` — `db:test -- schema` 4/4 ✓, advisors 0 ERROR/WARN (INFO: 19 RLS-politikasız → 0002, 8 kişi FK'sı + 15 kullanılmayan indeks kabul), inceleme temiz
- [x] Görev 4 — Migration 0002: yardımcılar, RLS, test kullanıcıları — `3ae1eba` — `db:test` 15/15 ✓ (rls 9, anon değişmezleri 2), anon: 0 fonksiyon / 0 sequence / 0 tablo yetkisi, 47 politika + 4 storage politikası, advisors 0 ERROR (WARN'lar R34/R35 ile kabul), inceleme temiz
- [x] Görev 5 — Migration 0003: `submit_order` ve fiş payload'u — `fba2744`, `ceace17` — orders 13/13, `db:test` 28/28 ✓; eşzamanlı aynı `order_id` artık hatasız (R36); canlı fonksiyon gövdeleri commit'lerle birebir; inceleme temiz
- [x] Görev 6 — Migration 0004: sipariş yaşam döngüsü, masa, mesai, push, rapor RPC'leri — `3f94a5f` — `db:test` 41/41 ✓, advisors 0 ERROR; inceleme temiz (0004 brief ile birebir). İki düzeltme Görev 7'deki ek migration'da: masa kilidi (R41) ve teslim edilmiş siparişte otomatik iptal koruması (R42); rapor saatlik dağılımı (R39)
- [ ] Görev 7 — Migration 0005: fiş kuyruğu, Realtime broadcast, denetim trigger'ları
- [ ] Görev 8 — Menü seed'i (107 ürün), masalar, ayarlar + TS tipleri
- [x] Görev 9 — Ortak alan mantığı: fiyat, seçim kuralları, sepet, hata anahtarları — `1b99bd0` — 28 paylaşılan test ✓, `npm run check` ✓; 33 hata anahtarı migration'larla birebir; kurallar canlı `submit_order` ile karşılaştırıldı; inceleme temiz (tek sapma: commit imza satırı, R51)
### M2 — Giriş ve altyapı (Plan 2)
- [ ] Görev 10 — `admin-staff` Edge Function ve hesap betikleri
- [ ] Görev 11 — Web iskeleti: tokenlar, giriş, rol yönlendirme, i18n, RPC sarmalayıcı
- [ ] Görev 12 — Veri katmanı ve Realtime tazeleme
### M3 — Garson (Plan 2)
- [ ] Görev 13 — Garson iskeleti: masalar, masa detayı, Hazır, Profil
- [ ] Görev 14 — Sipariş girişi: menü, arama, ürün paneli, sepet deposu, görsel yer tutucular
- [ ] Görev 15 — Sepet, mutfağa gönderme, masa işlemleri + garson E2E · tasarım kapısı
### M4 — Mutfak (Plan 3)
- [ ] Görev 16 — Mutfak ekranı (KDS) · tasarım kapısı
### M5 — Fiş ve yazdırma (Plan 3)
- [x] Görev 17 — Fiş satır modeli (`renderTicket`) — `c54460d`, `fd603f4` — 19/19 paylaşılan test ✓, `npm run check` ✓; inceleme temiz (1 düzeltme turu: meta/kalem ayracı, uzun kelime bölme, çift genişlik bütçesi, TESTDRUCK tarihi, STORNO meta satırı)
- [ ] Görev 18 — Ajan çekirdeği: ESC/POS, TCP, durum, sahte yazıcı
- [ ] Görev 19 — Ajan döngüsü: kuyruk, yazıcı kapısı, heartbeat, ayar yenileme, CLI
- [ ] Görev 20 — Paketleme, otomatik başlatma, gerçek Xprinter testi
### M6 — Admin (Plan 4)
- [ ] Görev 21 — Admin kabuğu ve canlı durum
- [ ] Görev 22 — Menü yönetimi (tek/toplu görsel yükleme dahil)
- [ ] Görev 23 — Personel, masalar, siparişler, denetim kaydı
- [ ] Görev 24 — Raporlar, CSV, Ayarlar · tasarım kapısı
### M7 — PWA ve bildirim (Plan 4)
- [ ] Görev 25 — PWA: marka varlıkları, manifest, SW, kurulum rehberi, bildirim izni
- [ ] Görev 26 — "Hazır" bildirimi: `notify-ready`, pg_net trigger, uygulama içi uyarı
### M8 — Test, yayın, teslim (Plan 5)
- [ ] Görev 27 — Tam doğrulama, güvenlik denetimi, yayın öncesi temizlik
- [ ] Görev 28 — Plesk'e yayın (HTTPS) ve canlı duman testi
- [ ] Görev 29 — Gecelik veritabanı yedeği
- [ ] Görev 30 — Kurulum ve kullanım rehberi, son rapor

## Milestone raporları
_Henüz yok._

## Kullanıcıya kalan kontroller
- [ ] Gerçek fiş fotoğrafları: TESTDRUCK, sipariş, STORNO, TISCHWECHSEL (Görev 20) — Türkçe/Almanca karakterler doğru mu?
- [ ] Telefonda kilitli ekran push testi: Android (ve varsa iPhone, ana ekrana ekleyerek) (Görev 28)
- [ ] Mutfak tableti: ana ekrana ekle, ekran zaman aşımı "hiçbir zaman", ses açık (KURULUM §4)
- [ ] Restoran PC'si: ajan kurulumu + XP-Q80A'nın ağa bağlanıp IP ayarı (KURULUM §2–3)
- [ ] Ürün görselleri: Admin → Menü → Toplu görsel yükleme (dosya adı = ürün numarası)
- [ ] Menüdeki açık noktalar (`docs/menu/ramos-menu-data.md` §6) ve gerçek masa sayısı
- [ ] TSE / Steuerberater teyidi (spec §1.4)
- [ ] Ertelenen görevler: … (sebep + ne yapılmalı)

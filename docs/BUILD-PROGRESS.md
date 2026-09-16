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
- [x] Görev 7 — Migration 0005: fiş kuyruğu, Realtime broadcast, denetim trigger'ları — `2302625`, `f1563c3`, `e23e792` — `db:test` 54/54 ✓, `npm run check` ✓, advisors 0 ERROR; inceleme temiz (1 düzeltme turu: `complete_print_job` artık yalnız sahiplenilmiş `printing` işini kapatıyor — çift fiş yolu kapandı). Ayrıca Görev 6'nın üç düzeltmesi (R39 rapor saati, R41 masa kilidi, R42 teslim edilmiş sipariş) bu görevde uygulandı
- [x] Görev 8 — Menü seed'i (107 ürün), masalar, ayarlar + TS tipleri — `ff4e3bb` — seed 5/5, `db:test` 59/59 ✓, `npm run check` ✓; fiyat sağlamaları birebir (93 ürün / 951,50 €, 28 varyant / 252,50 €); `image_path` hiçbir upsert'te yok (görseller seed'de korunur); menü §6'daki açık noktalar olduğu gibi girildi; inceleme temiz
- [x] Görev 9 — Ortak alan mantığı: fiyat, seçim kuralları, sepet, hata anahtarları — `1b99bd0` — 28 paylaşılan test ✓, `npm run check` ✓; 33 hata anahtarı migration'larla birebir; kurallar canlı `submit_order` ile karşılaştırıldı; inceleme temiz (tek sapma: commit imza satırı, R51)
### M2 — Giriş ve altyapı (Plan 2)
- [x] Görev 10 — `admin-staff` Edge Function ve hesap betikleri — `09dc191`, `01f6d71` — `fn:test` 4/4 ✓, canlı `staff.test` 4/4 ✓, yayın 201 → ACTIVE `verify_jwt=true`; hesaplar `ramo` (admin) ve `drucker` (yazıcı) oluşturuldu, `ADMIN_PASSWORD` satırı `.env`'den silindi; inceleme: admin kontrolü bypass edilemiyor (pasifleştirilen adminin geçerli JWT'si de eleniyor), hata anahtarları birebir, sır sızıntısı yok. 1 düzeltme turu: yayın betiğine gerçek yanlış-proje koruması (rapor da düzeltildi)
- [x] Görev 11 — Web iskeleti: tokenlar, giriş, rol yönlendirme, i18n, RPC sarmalayıcı — `8b7d9fc`, `2e5580b` — 81 birim test (13 dosya) ✓, E2E 8 geçti (rol matrisi: kitchen/admin kendi ekranına, printer ve pasif hesap reddediliyor), typecheck + `eslint .` + build temiz. İnceleme 1 Critical + 6 Important + 8 Minor buldu, 1 düzeltme turunda kapandı, yeniden inceleme "Approve": profil okuması başarısızken oturum korunuyor (Free proje uykusu / Wi-Fi dalgalanması artık garsonu atmıyor), açılış hatasında sonsuz yükleme yerine "Tekrar dene", admin parolası telefonda yazılabiliyor, uyarı metni kontrastı 4,45 → 6,96. Hata anahtarı kapanışı çift yönlü birebir (34); istemci rol kontrolü yetki sınırı değil — 24 RPC sunucuda rol doğruluyor
- [x] Görev 12 — Veri katmanı ve Realtime tazeleme — `689f557` — web 7 dosya / 17 test ✓, kök lint+typecheck temiz, build ✓; 13 RPC adı ve argüman şekli migration dosyalarıyla birebir, para uçtan uca tam sayı kuruş, realtime kanalları unmount'ta temizleniyor, iyimser güncelleme yok; inceleme temiz (0 düzeltme turu). Ajan, üretilen tiplerin aksine `table_overview` left join nullability boşluğunu yakalayıp elle düzeltti
### M3 — Garson (Plan 2)
- [x] Görev 13 — Garson iskeleti: masalar, masa detayı, Hazır, Profil — `d6eb30d` — apps/web 16 dosya / 92 test ✓, shared 31 test ✓, `tsc -b` + eslint temiz, Playwright garson akışı (phone) ✓; inceleme temiz (0 düzeltme turu): veri katmanı hiç çatallanmamış (ekranlarda tek bir Supabase sorgusu ya da önbellek geçersizleştirmesi yok), `printer_reachable === null` "çevrimdışı" gösterilmiyor, Görev 11'in `Sheet` odak hatası regresyon testiyle kapatıldı. Açık/hazır masa ekran görüntüleri M3 kapısına ertelendi (o durumları üretecek sipariş girişi Görev 14'te geliyor)
- [x] Görev 14 — Sipariş girişi: menü, arama, ürün paneli, sepet deposu, görsel yer tutucular — `00fd14b` — 26 dosya / 142 test ✓, `tsc -b` + eslint + `vite build` temiz, Playwright sipariş akışı (phone, gerçek giriş + gerçek 107 ürünlük menü) ✓ + 3 ekran görüntüsü; inceleme temiz (0 düzeltme turu): fiyat ve seçim kuralları hiç çatallanmamış (hepsi `@ramos/shared`'dan), para uçtan uca tam sayı kuruş, Türkçe arama `ı`/`İ` katlaması doğru (`İskender` küçük `i` ile bulunuyor), görseli olmayan ürün normal durum (ağ isteği ve konsol gürültüsü yok), sepet satırları seçeneklere göre doğru anahtarlanıyor
- [x] Görev 15 — Sepet, mutfağa gönderme, masa işlemleri + garson E2E · tasarım kapısı — `e83f7eb`, `2edb1e6`, `856de0a`, `235dea9`, `dcb6796` — 9 adımlı garson E2E (telefon, canlı) ✓, 11 ekran görüntüsü; inceleme 5 Important buldu (toast panelin ana eylemini örtüyordu; gönderim uçarken panelden çıkılınca sepet kalemleri sessizce kayboluyordu; menüden düşmüş ürünlü sepet kurtarılamıyordu; E2E kancaları üç projede birden koşuyordu; boş durum spinner'a dönmüştü), hepsi kapandı. R36 idempotency zinciri uçtan uca doğrulandı (çift sipariş yolu yok), para tam sayı kuruş, hesap tutarları sunucudan. M3 tasarım kapısı GEÇTİ
### M4 — Mutfak (Plan 3)
- [x] Görev 16 — Mutfak ekranı (KDS) · tasarım kapısı — `bba349e`, `6bed015`, `2f4b7ed`, `6afb9b8`, `7309c0b`, `d30a116` — apps/web 27 dosya / 145 test ✓, `tsc -b` + `eslint .` + `vite build` temiz; inceleme 3 Important (çift realtime aboneliği, `Elapsed` bileşeninin yeniden yazılması, mutasyonlarda hata geri bildirimi yok) + 1 minor buldu, düzeltme turu 1 uygulandı, kapsamlı yeniden inceleme sürüyor. M4 tasarım kapısı GEÇTİ: üç KDS ekranında da axe TEMİZ (0 ihlal, 0 incomplete); gecikme artık 30 px süre + kart kenarlığı/zemini + ikon + yazı ile 1–2 m'den okunuyor, İPTAL rozeti 3,77 → 6,81:1, rozetler kart tonundan bağımsız opak zeminde, hazır sütununda süre `ready_at`'ten sayılıyor
### M5 — Fiş ve yazdırma (Plan 3)
- [x] Görev 17 — Fiş satır modeli (`renderTicket`) — `c54460d`, `fd603f4` — 19/19 paylaşılan test ✓, `npm run check` ✓; inceleme temiz (1 düzeltme turu: meta/kalem ayracı, uzun kelime bölme, çift genişlik bütçesi, TESTDRUCK tarihi, STORNO meta satırı)
- [x] Görev 18 — Ajan çekirdeği: ESC/POS, TCP, durum, sahte yazıcı — `e7c5f26`, `12fef1d`, `bb42271` — 22/22 test ✓, typecheck+lint temiz; inceleme 2 Critical (girinti kağıda ulaşmıyordu; `sendBytes` sonsuza kadar asılabiliyordu) + 3 Important buldu, 1 düzeltme turunda kapandı; yeniden inceleme gerçek bayt ve gerçek soketlerle doğruladı: 22/22 satır `linesToText` ile birebir, iş başına tek TCP bağlantısı, `ESC t 91` kurtarma yolu gerçekten doğru Türkçe basıyor, 15/15 karakter doğru kod noktasında
- [x] Görev 19 — Ajan döngüsü: kuyruk, yazıcı kapısı, heartbeat, ayar yenileme, CLI — `3055db2`, `7b4a1bb`, `dfb14cf`, `192cec0`, `a157953` — 8 dosya / 80 test ✓, typecheck + `eslint .` + build temiz; sahte yazıcıyla canlı döngü testi geçti (iş ~30 sn'de `printed`, girinti kağıda ulaştı, CP857 gidiş-dönüş doğru, R55 koşuya özgü kimlik canlı doğrulandı). 4 düzeltme turu: çift fiş yolları (sınırsız onay denemesi R68, gerçek yazıcı mutex'i R69, kapanışta yeni iş sahiplenmeyi durdurma R70), istemci tarafı RPC zaman aşımı (R71) ve onun livelock regresyonu (R78: `complete` 10 sn / diğerleri 25 sn), kapanış log'u (R72), idempotent `stop()`, ikinci Ctrl+C görünürlüğü, takılı onay işareti. Son inceleme (opus) R71'in çift fiş açmadığını bağımsız kanıtladı: zaman aşımına uğrayan `claim`de hiçbir şey basılmıyor, iptal edilen `complete`in ikinci denemesi `job_not_printing`'i yutuyor, `AbortSignal.timeout` her yerde yeniden denenebilir sayılıyor. Gerçek kesinti/SIGINT/livelock doğrulaması Görev 20'de
- [x] Görev 20 — Paketleme, otomatik başlatma, gerçek Xprinter testi — `0eda7f6`, `3b4b887` — 9 dosya / 96 test ✓, typecheck + eslint + build temiz; tek dosya paket (`dist/ramos-agent.mjs`), Windows Zamanlanmış Görevi (BOM'lu `.ps1`), systemd birimi. GERÇEK XPRINTER: 7 fiş basıldı (TESTDRUCK, sipariş, ek sipariş, STORNO, TISCHWECHSEL, kurtarma, kurulu yoldan uçtan uca test) — hepsi `printed`, 0 çift baskı; gecikmeler 0,23–0,28 sn (hedef 5 sn). Kurulum→kaldırma denendi: kurulan ajan makineye özgü kimlikle iş sahiplenip bastı, kaldırma iki süreci öldürdü, öksüz ajan kalmadı. İnceleme 7 Important buldu (R82: kaldırma yolun yazımına duyarlıydı → öksüz ajan fiş basmaya devam edebilirdi, kilit PID'i otoriter yapıldı; R83: kurulum geliştiricinin `AGENT_ID`'sini taşıyordu → iki makine aynı kuyruktan iş kapardı; R84: sessiz sonsuz döngü; R85: Linux'ta kalıcı fail-closed kilit), düzeltme turunda hepsi kapandı — I1 canlı kanıtlandı. ⏸ ertelendi: gerçek yarı-açık TCP ve livelock doğrulaması (üretmenin her yolu bu oturumu keserdi)
### M6 — Admin (Plan 4)
- [x] Görev 21 — Admin kabuğu ve canlı durum — `eea9e17`, `06d91f9` — 30 yeni test, inceleme "Approved"; R79 kapandı (takılı onay işareti artık operatöre görünüyor, ham hata metni gizli). M6 tasarım kapısı GEÇTİ: 5 ekranda 0 axe ihlali; 4 Yüksek bulgu düzeltildi — durum okunmadan yeşil "Çevrimiçi" gösterilmesi, ilk yüklemede yalan boş durum, DE metninin düğmeyle örtüşmesi, ISO tarih. R86 (iş günü başlangıcı) Görev 24'e taşındı · eski not: + R79: `printer_status.last_error` operatöre gösterilecek (`derivePrinterProblem`'e `complete_stuck*` dalı + i18n) — yoksa takılı onay işareti DB'de kalıp kimseye görünmüyor
- [ ] Görev 22 — Menü yönetimi (tek/toplu görsel yükleme dahil)
- [ ] Görev 23 — Personel, masalar, siparişler, denetim kaydı
- [ ] Görev 24 — Raporlar, CSV, Ayarlar · tasarım kapısı · + R86: iş günü başlangıcı Ayarlar'da düzenlenebilir olur olmaz admin panosunun sabit 05:00'i sunucudan sapar → `settings.business_day_start` okunacak ya da `business_date` RPC'si çağrılacak
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
- [ ] Gerçek fiş fotoğrafları: TESTDRUCK (CLI ve kuyruk yoluyla), sipariş, ek sipariş, STORNO, TISCHWECHSEL (Görev 20) — `ÄÖÜ äöü ß · Şş Ğğ İı Çç` satırı doğru mu? Bozuksa `printer_codepage = windows1254` / `91`, o da olmazsa `printer_transliterate = true`
- [ ] Fiş kesimi (`GS V 66 0`) ve 48 kolon taşması kağıtta kontrol edilmeli
- [ ] Fiş içeriği mutfak gözüyle doğru mu (OHNE / Soße / +Extra / GETRÄNKE sırası, STORNO, TISCHWECHSEL)
- [ ] Restorandaki XP-Q80A: Ethernet IP ayarı ve self-test'te `61 = PC857` doğrulaması
- [ ] Oturum kapat/aç ile ajanın otomatik kalkması (bu oturumda eşzamanlı ajanlar yüzünden denenemedi; kurulum/kaldırma ve kurulu yoldan baskı doğrulandı)
- [ ] Telefonda kilitli ekran push testi: Android (ve varsa iPhone, ana ekrana ekleyerek) (Görev 28)
- [ ] Mutfak tableti: ana ekrana ekle, ekran zaman aşımı "hiçbir zaman", ses açık (KURULUM §4)
- [ ] Restoran PC'si: ajan kurulumu + XP-Q80A'nın ağa bağlanıp IP ayarı (KURULUM §2–3)
- [ ] Ürün görselleri: Admin → Menü → Toplu görsel yükleme (dosya adı = ürün numarası)
- [ ] Menüdeki açık noktalar (`docs/menu/ramos-menu-data.md` §6) ve gerçek masa sayısı
- [ ] TSE / Steuerberater teyidi (spec §1.4)
- [ ] Ertelenen görevler: … (sebep + ne yapılmalı)

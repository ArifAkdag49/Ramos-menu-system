# PASAM Sipariş Sistemi: Ramo's sisteminin birebir kopyası (plan)

> Durum: PLAN. Kod yazılmadı. Kullanıcı isteği (5 Eki): Ramo's Sipariş Sistemi'nin birebir aynısı, PASAM için.
> Değişen yalnız üç şey: PASAM logosu ve markası, PASAM'a uygun ayarlar ve PASAM menüsü.

## PASAM hakkında elimizdekiler

| Konu | Kaynak | İçerik |
|---|---|---|
| İşletme | flyer sistemi `isler/pasam-ortak/icerik.json` → `kapak` | Döner, Pizza, Lahmacun, Grill. Adres: Alfred-Brehm-Platz 12, 60316 Frankfurt am Main. Telefon +49 69 95209485. Açılış "Täglich 07:00 …". |
| Menü | aynı dosya → `urunler` | 95 ürün: numara, ad, Almanca ve İngilizce açıklama, alerjen kodları, fiyat, ürün görseli (`kartlar/<no>.webp`). Kategoriler panel düzeninden (`paneller` P1…) ve kapaktaki kategori listesinden çıkarılacak. |
| Ekstralar | `ekstralar` | Ketchup/Mayo 0,30; Extra Soße 1,00; Extra Fleisch 2,00 … Ramo's'taki seçenek/ek yapısına eşlenecek. |
| Spar-Menüs | `spar` + ilgili ürünler | Menü kampanyası; ayrı kategori olacak. |
| Alerjenler | `bilgi.alerjenler` | a…n kodları ve Almanca adları (Ramo's'taki alerjen sözlüğüyle aynı biçim). |
| Logo | `isler/pasam-ortak/logo-yeni-hd.png` (yüksek çözünürlük), `logo-yeni.webp` | Uygulama ikonu, PWA ikonları, giriş ekranı, fiş başlığı ve Android ikonlarına dönüştürülecek. |
| Ürün görselleri | `isler/pasam-ortak/kartlar-urun/`, `kartlar/` | Menü ürün görselleri olarak Supabase Storage'a yüklenecek. |

## Yaklaşım

**Ayrı kopya, ortak kod değil.** Ramo's deposu yeni bir klasöre kopyalanır: `C:\Users\PC\Desktop\Pasam Menu System`, ayrı git deposu. Sonra şunlar değiştirilir:

- marka (ad, logo, renkler);
- ortam bilgileri (Supabase projesi, alan adı, Android paket adı, push anahtarları);
- menü seed'i.

Kod mantığına dokunulmaz: garson, mutfak, yazdırma, yönetim ve raporlar Ramo's ile aynı kalır. İki restoranın verisi, girişleri ve yazıcıları tamamen ayrı olur; birindeki sorun ötekini etkilemez.

> Neden çok müşterili tek sistem değil: istek "birebir aynısı", ve Ramo's canlıda çalışıyor. Ortak koda geçmek Ramo's'u riske atar. Bedeli: Ramo's'a gelen düzeltmeler PASAM'a ayrıca taşınmalı.

## Adımlar

1. **Kopya ve temizlik**
   - Depoyu kopyala. Alınmayacaklar: `node_modules`, `.git` geçmişi, `apps/mobile/android/app/build`, `apps/print-agent/release`, `.env` dosyaları, `.superpowers/`.
   - Yeni git deposu aç, ilk commit at.
   - Ramo's'a özgü belgeler (BUILD-*, eski planlar) PASAM için sadeleştirilir; tasarım belgesi ve kurulum rehberi kalır.
2. **Marka**
   - "Ramo's" geçen bütün kullanıcı metinleri (web, fiş, Android, kurulum sihirbazı, bildirim) "PASAM" olur. Taramada ~350 dosya/yer çıktı, çoğu derleme çıktısı; asıl kaynak ~120 yer.
   - Logo `apps/web/public/brand`, `app-icons`, PWA manifest, favicon ve Android mipmap boyutlarına üretilir.
   - Renkler PASAM logosundan alınır. Ramo's'un tasarım düzeni aynen kalır, yalnız renk değerleri değişir; `docs/design/DESIGN.md` güncellenir.
   - Mutfak fişi başlığı "PASAM" olur. Almanca fiş metinleri aynen kalır.
   - Android paketi `com.arxdigital.pasam`, uygulama adı "PASAM", klasör `java/com/arxdigital/pasam`.
   - Yazıcı kurulum paketi adı "PasamYaziciKurulum".
3. **Menü seed'i**
   - `supabase/seed/menu-source.ts` PASAM verisinden yeniden üretilir: `icerik.json` → kategoriler, ürünler, fiyatlar, açıklamalar, alerjenler, ekstralar ve Spar-Menüs.
   - Dönüştürücü betiğiyle yapılır; elle kopyalanmaz.
   - `docs/menu/pasam-menu-data.md` "açık noktalar" listesiyle yazılır: kategorisi belirsiz ürünler, varyantlar (ör. küçük/büyük), opsiyon grupları.
   - Ürün görselleri seed'den sonra Storage'a yüklenir.
4. **Altyapı** (sahibin onayı ve hesabı gerekenler aşağıda)
   - Yeni Supabase projesi: 20 migration uygulanır, Edge Functions (`admin-staff`, `notify-ready`) yayınlanır, Vault/push sırları kurulur.
   - Alan adı `pasam.arxdigitalsevice.com` (öneri): Plesk'te alt alan adı ve SSL açılır. `deploy/deploy-web.ps1` aynı sunucuya (87.106.47.17) bu alan adıyla çalışır.
   - Yeni VAPID anahtarları (web push).
   - Android için FCM projesi ve `google-services.json` (yeni paket adıyla).
   - Gecelik yedek (`deploy/backup`) PASAM veritabanı için ayrı bir cron satırıyla kurulur.
5. **Hesaplar ve sırlar** (bunları ben oluşturmam)
   - İlk yönetici hesabı `scripts/create-admin.mjs` ile açılır. Şifreyi sahip belirler ve komutu kendisi çalıştırır.
   - Yazıcı hesabı `scripts/create-printer-user.mjs` ile; komutu sahip çalıştırır.
   - Android imza anahtarı (keystore) sahipte durur, depoya girmez.
6. **Doğrulama**
   - `npm run check`: lint, tip kontrolü, birim testleri, derleme.
   - RLS/RPC testleri yalnız yeni proje boşken (`DB_TESTS_ALLOWED=1`), sonra kapatılır.
   - Playwright E2E yeni projeye karşı, yayından önce çalışır.
   - Canlı duman testi: giriş, garson siparişi, mutfakta görünmesi, sahte yazıcıya fiş, "HAZIR" bildirimi.
7. **Teslim**
   - PASAM kurulum rehberi (KURULUM.md'nin PASAM sürümü).
   - Restoran PC'si için yazıcı kurulum paketi.
   - İmzalı APK: `Desktop\Pasam APK\pasam-v<sürüm>.apk`.
   - Test verisi temizliği (`go-live-cleanup.mjs`).

## Sahibin kararı / hesabı gerekenler (açık sorular)

1. **Alan adı:** `pasam.arxdigitalsevice.com` uygun mu?
2. **Supabase projesi:** yeni proje açmak ücretlendirmeyi etkileyebilir. Hangi hesapta açılacak, ve açmamı onaylıyor musunuz? (Ücretsiz planda proje sayısı sınırlı.)
3. **Masalar:** kaç masa var, adları/numaraları ne? Bahçe veya teras ayrı mı?
4. **Personel:** garson ve mutfak kullanıcıları kimler? İlk yöneticiyi kim açacak?
5. **Yazıcı:** PASAM'da hangi fiş yazıcısı var? Ramo's'taki Xprinter XP-Q80A mı, Epson mu? Restoranda yazdırma için PC mi kullanılacak, tablet istasyonu mu?
6. **Android uygulaması:** gerekli mi, yoksa yalnız web (PWA) yeterli mi? Gerekliyse FCM için Firebase projesi.
7. **Menü ayrıntıları:** ürünlerde boy/varyant (pizza boyları) ve opsiyon grupları (soslar, ekstralar) Ramo's'taki gibi mi olacak? `icerik.json`'da yalnız tek fiyat var; varyantlar flyer'da ayrıca yazılıysa bildirin.
8. **Renkler:** logodaki renkler mi kullanılsın, yoksa PASAM'ın belirlediği başka bir renk var mı?

## Kullanıcı kararları (5 Eki)

1. **Alan adı:** `pasam.arxdigitalsevice.com`.
2. **Veritabanı:** Supabase YOK. Kendi PostgreSQL'imiz + yeni bir Node arka ucu. Ayrıntı aşağıda.
3. **Masalar:** şimdilik örnek liste: Masa 1–12 ve Terrasse T1–T4. Müşteriden teyit sonra alınacak; yönetim panelinden değiştirilebilir.
4. **Personel:** şimdilik bir deneme garson ve bir deneme mutfak hesabı; gerçek personel sonra eklenecek. Şifreler canlı sistemde ben girmeden üretilir: betik rastgele şifre üretip bir kez ekrana yazar, betiği sahip çalıştırır.
5. **Yazdırma:** fiş yazıcısı hem restoran bilgisayarından (yazdırma ajanı) hem telefondan/tabletten (Android uygulamasındaki yazıcı istasyonu) çalışacak. Ramo's'taki iki yol da korunur, yeni arka uca bağlanır.
6. **Android uygulaması:** telefondan yazdırma istendiği için gerekli.
7. **Menü:** şimdilik düz liste: kategori, ürün, açıklama, fiyat, alerjen, görsel. Ekstralar ve opsiyonlar sonra konuşulacak.
8. **Tema:** turuncu–siyah, PASAM logosuna uygun.

## Arka uç: Supabase yerine kendi PostgreSQL + Node

Ramo's şu Supabase parçalarını kullanıyor. PASAM'da her biri şöyle karşılanacak:

| Ramo's (Supabase) | PASAM |
|---|---|
| Postgres + 20 migration | Ayrı bir PostgreSQL. Öneri: sunucuda kendi konteyneri, `pasam-db`; arx-panel veritabanıyla karışmaz. Migration'lar düz Postgres'e çevrilir: `auth.*` şeması ve `auth.uid()` çıkar, iş kuralı içeren SQL fonksiyonları (sipariş, fiyat, durum geçişi) korunur. |
| RLS politikaları | Yetki kontrolü arka uçta, rol başına (garson, mutfak, yönetici, yazıcı). Her uçta test; RLS testleri birebir uç testlerine çevrilir. |
| Supabase Auth | Arka uçta kullanıcı adı + şifre girişi. Şifre özeti argon2 ya da bcrypt. Uzun ömürlü oturum çerezi, Android için Bearer. "Oturum 90 gün açık kalır" davranışı korunur. |
| RPC çağrıları (supabase-js `rpc`) | Aynı adlı REST uçları: `/api/rpc/<ad>`. Web ve Android'deki çağrılar küçük bir istemci katmanıyla değişir; bileşen kodu olabildiğince aynı kalır. |
| Realtime Broadcast (mutfağa düşme, durum güncellemesi) | Arka uçta WebSocket kanalı (yedek: SSE). Garson, mutfak ve yazıcı istasyonu aynı olayları alır; bağlantı kopunca yeniden bağlanıp eksikleri çeker. |
| Storage (ürün görselleri) | Sunucuda dosya klasörü; nginx üzerinden önbellekli sunulur. Yükleme yalnız yönetici, tür ve boyut sınırıyla. |
| Edge Functions `admin-staff`, `notify-ready` | Arka uç içinde normal uçlar. |
| Vault (sırlar) | Sunucu `.env` dosyası; depoya girmez. |
| Web Push + FCM | Arka uçta web-push (VAPID) ve FCM (Android). Mantık Ramo's ile aynı. |

**Teknoloji:** Node ≥ 22 ve Hono (arx-panel'in `apps/api`'sindeki gibi), PostgreSQL için `pg` ya da drizzle. Docker konteyneri, aynı sunucu. Plesk'te `pasam.arxdigitalsevice.com` web uygulamasını sunar, `/api` ve WebSocket arka uca vekillenir.

**Kod etkisi:**
- Web: `apps/web` içindeki Supabase istemci çağrıları (auth, rpc, realtime, storage) yeni API istemcisine çevrilir.
- Yazdırma ajanı ve Android yazıcı istasyonu: Supabase Realtime + RPC yerine WebSocket + REST.
- Bileşenler, ekranlar ve `packages/shared` iş kuralları aynen kalır.

**Yedek:** gecelik `pg_dump` (Ramo's'taki `deploy/backup` mantığı) PASAM veritabanı için kurulur.

## Güncellenmiş adımlar

1. **Kopya, temizlik, marka**
   - Turuncu–siyah tema, PASAM logosu, "PASAM" metinleri, Android paketi `com.arxdigital.pasam`.
2. **Arka uç**
   - `apps/api` (Hono): giriş, roller, RPC uçları, WebSocket olayları, dosya yükleme, push.
   - Testler: Ramo's'un RLS/RPC testlerinin karşılığı uç testleri.
3. **Veritabanı**
   - Migration'ların düz Postgres sürümü.
   - Seed: PASAM menüsü (düz), örnek masalar, ayarlar.
4. **İstemciler**
   - Web (garson, mutfak, yönetim), yazdırma ajanı ve Android yazıcı istasyonu yeni arka uca bağlanır.
5. **Yayın**
   - Sunucuda `pasam-db` ve `pasam-api` konteynerleri.
   - Plesk alt alan adı ve SSL.
   - Web derlemesinin yüklenmesi.
   - Push anahtarları.
6. **Hesaplar** (sahip çalıştırır)
   - İlk yönetici, deneme garson, deneme mutfak, yazıcı hesabı.
   - Betik rastgele şifre üretip bir kez gösterir.
7. **Doğrulama**
   - Yerelde uçtan uca: giriş, sipariş, mutfak, sahte yazıcıya fiş, HAZIR bildirimi.
   - Canlıda duman testi.
   - Android APK ile telefondan yazdırma testi.
8. **Teslim**
   - PASAM kurulum rehberi, yazıcı kurulum paketi, imzalı APK.

## Tahmini sıra ve süre

| Adım | İçerik |
|---|---|
| 1 | Kopya, temizlik, marka |
| 2 | Menü dönüştürücü ve seed |
| 3 | Supabase projesi ve yayın (sahip onayından sonra) |
| 4 | Doğrulama ve teslim |

Kod tarafı (1–2 ve 4'ün test kısmı) altyapıdan bağımsız başlayabilir. Altyapı, yukarıdaki sorular cevaplanınca açılır.

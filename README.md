# Ramo's Sipariş Sistemi

Ramo's Döner & Grill House (Frankfurt) için masa başı garson sipariş sistemi. Garson kendi telefonundan (PWA ya da Android uygulaması) masaya sipariş girer. Sipariş mutfak tabletinde (KDS) anında görünür. Restoran PC'sindeki yazdırma ajanı Xprinter XP-Q80A'ya ağ üzerinden (TCP 9100) Almanca mutfak fişi basar. Mutfak **HAZIR**'a basınca mesaideki garsonlara Web Push bildirimi gider. Yönetici panelinde menü (ürün görselleri dahil), personel, masalar, siparişler, raporlar (CSV) ve ayarlar yönetilir. Ödeme sistemde değil, mevcut TSE'li kasada alınır.

- **Canlı adres:** https://ramos.arxdigitalsevice.com
- **Yığın:** React 19 + Vite + Tailwind CSS v4 (TypeScript strict), Supabase (Auth, Postgres + RLS + RPC, Realtime Broadcast, Storage, Edge Functions, Vault), Node.js ≥ 22 yazdırma ajanı, Android TWA
- **Kurulum ve kullanım rehberi (Türkçe):** [docs/KURULUM.md](docs/KURULUM.md)

## Klasör yapısı

| Klasör | İçerik |
|---|---|
| `apps/web` | Web uygulaması: `/login`, garson (`/waiter`), mutfak (`/kitchen`), yönetim (`/admin`); Playwright E2E testleri `apps/web/e2e` |
| `apps/print-agent` | Yazdırma ajanı (ESC/POS, TCP 9100, USB), Windows kurulum sihirbazı (`kurulum/Kurulum.cmd`, `scripts/kurulum.ps1`), paket betiği `scripts/paket-olustur.ps1` |
| `apps/android` | Android uygulaması (Trusted Web Activity, paket `com.arxdigital.ramos`), imzalı APK betiği `build-apk.ps1` |
| `packages/shared` | Ortak alan mantığı: tipler, para, fiyat ve seçim kuralları, sepet, hata anahtarları, fiş satır modeli (`renderTicket`) |
| `supabase` | `migrations/` (şemanın tek kaynağı), `functions/` (`admin-staff`, `notify-ready`), `seed/` (107 ürünlük menü), `tests/` (RLS/RPC testleri) |
| `deploy` | Plesk yayın betiği `deploy-web.ps1`, Linux/Raspberry Pi systemd birimi, `backup/` (gecelik `pg_dump`, cron, geri yükleme belgesi) |
| `scripts` | Veritabanı ve Management API betikleri, hesap oluşturma, VAPID/push kurulumu, yayın öncesi temizlik, marka ikonları |
| `docs` | Spec, planlar, menü verisi, build kayıtları, tasarım notları, ekran görüntüleri, kurulum rehberi |

## Sık kullanılan komutlar

Node.js ≥ 22 gerekir. Kökte `npm install`. Veritabanı ve yayın betikleri kök `.env` dosyasını okur (şablon: `.env.example`; `.env` asla commit edilmez).

**Kalite**

| Komut | Ne yapar |
|---|---|
| `npm run check` | lint + typecheck + birim testleri + build (tümü) |
| `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` | Tek tek |
| `npm run dev -w apps/web` | Web uygulaması geliştirme sunucusu (port 5173) |
| `npm run e2e -w apps/web` | Playwright E2E. Canlı veritabanına karşı çalışır; yayındaki sistemde yalnız bilerek ve yazdırma ajanı kapalıyken |

**Veritabanı ve Edge Functions**

| Komut | Ne yapar |
|---|---|
| `npm run db:apply` | Yeni migration'ları uygular |
| `npm run db:seed` | Menü, masa ve ayar seed'ini üretip yükler (ürün görsellerine dokunmaz) |
| `npm run db:sql -- "select 1"` | SQL çalıştırır (`--file <yol>` da alır) |
| `npm run db:types` | `packages/shared` veritabanı tiplerini üretir |
| `npm run db:test` | RLS/RPC testleri. `.env` → `DB_TESTS_ALLOWED=1` ister. **Yayından sonra kapalı** (`0`): testler canlı restorana test fişi bastırabilir |
| `npm run fn:test` | Edge Function mantık testleri |
| `npm run fn:deploy -- admin-staff` | Edge Function yayını (`notify-ready` için `-- notify-ready --no-verify-jwt`) |

**Yazdırma ajanı**

| Komut | Ne yapar |
|---|---|
| `npm run agent -w apps/print-agent` | Ajanı çalıştırır |
| `npm run agent:status -w apps/print-agent` | Yazıcı durumunu sorgular |
| `npm run agent:test-print -w apps/print-agent` | TESTDRUCK basar |
| `npm run agent:dry-run -w apps/print-agent` | Son fiş işlerini yazıcıya göndermeden metin olarak gösterir |
| `npm run agent:fake-printer -w apps/print-agent` | Geliştirme için sahte TCP 9100 yazıcı |
| `powershell -ExecutionPolicy Bypass -File apps/print-agent/scripts/paket-olustur.ps1` | Restoran PC'si için kurulum paketi (`apps/print-agent/release/`, git dışı; ajan parolasını içerir) |

Restoran PC'sine kurulum her zaman paketteki `Kurulum.cmd`'ye **çift tıklanarak** yapılır (bkz. [KURULUM §3](docs/KURULUM.md#3-yazdırma-programı-restoran-pcsi)).

**Yayın, bildirim, Android, bakım**

| Komut | Ne yapar |
|---|---|
| `powershell -ExecutionPolicy Bypass -File deploy/deploy-web.ps1 -Domain … -WebRoot … -SysUser …` | Web derleme → Plesk'e yükleme → sahiplik → canlı duman testi (tam örnek dosyanın başında) |
| `powershell -ExecutionPolicy Bypass -File apps/android/build-apk.ps1` | İmzalı APK → `Desktop\Ramos APK\ramos-v<sürüm>.apk` (anahtar repoda değil) |
| `node scripts/gen-vapid.mjs` | VAPID anahtarları + webhook sırrı → `.env` dosyaları. `--force` bütün push aboneliklerini geçersiz kılar |
| `node --env-file=.env scripts/setup-push.mjs` | Push için function secret'ları ve Vault sırları |
| `node --env-file=.env scripts/create-admin.mjs <kullanıcı> "<Ad>"` | İlk yönetici hesabı (`ADMIN_PASSWORD` ile) |
| `node --env-file=.env scripts/create-printer-user.mjs` | Yazıcı hesabı + `apps/print-agent/.env` (parolayı yeniler) |
| `node --env-file=.env scripts/go-live-cleanup.mjs` | Test/demo verisi temizliği: varsayılan dry-run, `--yes` uygular |

## Belgeler

- [docs/KURULUM.md](docs/KURULUM.md): Kurulum ve kullanım rehberi (yazıcı, ajan, tablet, telefonlar, Android APK, yönetici, sorun giderme, sırların yeri)
- [deploy/backup/RESTORE.md](deploy/backup/RESTORE.md): Gecelik yedek ve yeni Supabase projesine geri yükleme
- [docs/superpowers/specs/2026-09-15-ramos-siparis-sistemi-design.md](docs/superpowers/specs/2026-09-15-ramos-siparis-sistemi-design.md): Onaylı tasarım dokümanı (spec)
- [docs/menu/ramos-menu-data.md](docs/menu/ramos-menu-data.md): Menü seed verisi ve açık noktalar
- Uygulama planları:
  [1 · temel ve veritabanı](docs/superpowers/plans/2026-09-15-ramos-plan-1-temel-ve-veritabani.md) ·
  [2 · giriş ve garson](docs/superpowers/plans/2026-09-15-ramos-plan-2-giris-ve-garson.md) ·
  [3 · mutfak ve yazdırma](docs/superpowers/plans/2026-09-15-ramos-plan-3-mutfak-ve-yazdirma.md) ·
  [4 · admin, PWA, bildirim](docs/superpowers/plans/2026-09-15-ramos-plan-4-admin-pwa-bildirim.md) ·
  [5 · test, yayın, teslim](docs/superpowers/plans/2026-09-15-ramos-plan-5-test-yayin-teslim.md)
- [docs/BUILD-PROMPT.md](docs/BUILD-PROMPT.md) · [docs/BUILD-PROGRESS.md](docs/BUILD-PROGRESS.md) · [docs/BUILD-DECISIONS.md](docs/BUILD-DECISIONS.md): Yapım talimatı, ilerleme ve karar kayıtları
- [docs/design/DESIGN.md](docs/design/DESIGN.md): Tasarım notları
- [docs/screenshots/README.md](docs/screenshots/README.md): Ekran görüntüleri dizini

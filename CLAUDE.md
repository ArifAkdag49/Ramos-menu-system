# Ramos Sipariş Sistemi

ramos.arxdigitalsevice.com — garson/mutfak/menü web uygulaması (apps/web), Android
uygulaması (apps/mobile), Supabase (supabase/), yazdırma ajanı. Ayrıntılar README.md'de.

## Ekip çalışma düzeni

Projede birden çok kişi çalışıyor. Kod `main`'e yalnız PR ile girer. Sunucuda
dosya DÜZENLENMEZ; her değişiklik git → PR → deploy yolundan gider.

### Kullanıcı ne derse ne yap

| Kullanıcı | Sen |
|---|---|
| "Yeni iş: X" / bir iş tarif ediyor | `git fetch` → `origin/main`'den `<isim>/<kisa-is-adi>` dalı aç (isim: `git config user.name`'in ilk kelimesi, küçük harf, Türkçe karaktersiz). Sonra işe başla. |
| "Bitti" / "PR aç" | Testleri çalıştır, dalı push et, `gh pr create` ile PR aç. Başlık ve açıklama Türkçe. `gh` yoksa GitHub'daki PR açma linkini ver. |
| "X'in işinden devam et" | `git fetch` → ilgili dalı bul (`git branch -r`), o dala geç, son commit'leri özetle, devam et. |
| "Güncel hali çek" | Kendi dalındaysan `git pull --rebase` ve `git rebase origin/main` (çakışma varsa çöz, özetle). `main`'deysen `git pull`. |
| "Deploy et" | Bu projenin deploy yöntemi aşağıdaki "Deploy" bölümünde. Bölüm yoksa kullanıcıya sor. |

### Kurallar

- `main` üzerinde dosya düzenleme. Kullanıcı `main`'deyken iş isterse önce dal aç.
- Her cevabın sonunda `.claude/hooks/oto-push.sh` değişiklikleri kendiliğinden
  commit edip kişinin dalına push eder.
- Oto-push "push reddedildi" derse: `git pull --rebase origin <dal>`, çakışmayı
  çöz, kullanıcıya ne birleştiğini özetle.
- Gizli bilgi (`.env`, anahtar, token) asla commit edilmez.
- Başkasının dalına onun haberi olmadan force-push yapma.

### Deploy

Doğrudan deploy YOK: PR'ın main'e birleşmesi deploy'dur (.github/workflows/deploy.yml).
"Deploy et" denirse kullanıcıya PR'ı birleştirmesini söyle.

1. PR'da ve main'e girişte doğrulama (.github/workflows/ci.yml) çalışır.
2. Kod SSH ile sunucuya (/opt/statik/ramos/kaynak) gönderilir; deploy/sunucu-deploy.sh
   SUNUCUDA Docker'daki Node ile derler (bu sırada canlıya dokunulmaz), çıktıyı
   /opt/statik/ramos/surumler/<kısa-commit>'e kopyalar ve belge köküne yazar, sonra
   HTTPS kontrolü yapar. Tutmazsa önceki sürüm geri yazılır. Son 5 sürüm saklanır.
3. Belge kökünde derlemeye ait olmayan dosyalar silinmez.
4. Geri almak: sunucuda /opt/statik/ramos/kaynak içinden
   `bash deploy/sunucu-deploy.sh --geri-al` (önce kullanıcıya sor; --liste sürümleri gösterir).
5. Sunucu adımı ancak repo değişkeni DEPLOY_ACIK=true iken çalışır.

Bu deploy YALNIZ web arayüzünü (apps/web) kapsar. Veritabanı (npm run db:apply), Edge
Functions (npm run fn:deploy), Android APK ve yazdırma ajanı elle, ayrı yayınlanır; şema
değiştiren bir PR'da açıklamaya hangi komutun ne zaman çalışacağını yaz.
Web derlemesinin üretim değerleri (VITE_*) sunucuda /opt/statik/ramos/.env.production'da.
deploy/deploy-web.ps1 artık yalnız -SmokeOnly ile ya da acil durumda -EskiYontem ile çalışır.

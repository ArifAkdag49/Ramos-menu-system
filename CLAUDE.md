# Ramos Sipariş Sistemi

ramos.arxdigitalsevice.com — garson/mutfak/menü web uygulaması (apps/web), Android
uygulaması (apps/mobile), Supabase (supabase/), yazdırma ajanı. Ayrıntılar README.md'de.

## Ekip çalışma düzeni

Projede birden çok kişi çalışıyor. Kod `main`'e yalnız PR ile girer; testler yeşilse PR'ı Claude kendisi birleştirir. Sunucuda
dosya DÜZENLENMEZ; her değişiklik git → PR → deploy yolundan gider.

### Kullanıcı ne derse ne yap

| Kullanıcı | Sen |
|---|---|
| "Yeni iş: X" / bir iş tarif ediyor | `git fetch` → `origin/main`'den `<isim>/<kisa-is-adi>` dalı aç (isim: `git config user.name`'in ilk kelimesi, küçük harf, Türkçe karaktersiz). Sonra işe başla. |
| "Bitti" / "PR aç" / "canlıya al" | Testleri çalıştır, dalı push et, `gh pr create` ile PR aç (başlık ve açıklama Türkçe: ne değişti, nasıl denendi). Sonra PR'ı KENDİN birleştir, kullanıcı onayı bekleme (ekip kararı, 2026-10-17): "Doğrulama" çalışmasını bekle (`gh run list -w Doğrulama -b <dal> -L 1` → `gh run watch <id> --exit-status`; Vercel gibi başka kontrolleri yok say), yeşilse `gh pr merge --merge --delete-branch`. Ardından "Canlıya çıkar" çalışmasını izle (`gh run watch`) ve canlı adresin açıldığını kontrol et; sonucu kullanıcıya kısaca bildir. Test kırmızıysa BİRLEŞTİRME: hatayı düzelt, tekrar dene. `gh` yoksa PR linkini ver; birleştirmeyi kullanıcı yapar. |
| "X'in işinden devam et" | `git fetch` → ilgili dalı bul (`git branch -r`), o dala geç, son commit'leri özetle, devam et. |
| "Güncel hali çek" | Kendi dalındaysan `git pull --rebase` ve `git rebase origin/main` (çakışma varsa çöz, özetle). `main`'deysen `git pull`. |
| "Deploy et" | Doğrudan sunucuya deploy YOK: "Bitti" satırını uygula — PR aç, test yeşilse kendin birleştir; birleşince GitHub Actions canlıya çıkarır (ayrıntı aşağıdaki "Deploy" bölümünde). |

### Kurallar

- Testler kırmızıyken PR asla birleştirilmez. Birleştirdiğin her şey birkaç dakika içinde
  canlıda olur; birleştirmeden önce PR'ın gerçekten bitmiş iş olduğundan emin ol.
- `main` üzerinde dosya düzenleme. Kullanıcı `main`'deyken iş isterse önce dal aç.
- Her cevabın sonunda `.claude/hooks/oto-push.sh` değişiklikleri kendiliğinden
  commit edip kişinin dalına push eder.
- Oto-push "push reddedildi" derse: `git pull --rebase origin <dal>`, çakışmayı
  çöz, kullanıcıya ne birleştiğini özetle.
- Gizli bilgi (`.env`, anahtar, token) asla commit edilmez.
- Başkasının dalına onun haberi olmadan force-push yapma.

### Deploy

Doğrudan deploy YOK: PR'ın main'e birleşmesi deploy'dur (.github/workflows/deploy.yml).
"Deploy et" denirse PR'ı aç ve testler yeşilse kendin birleştir (yukarıdaki tablo).

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

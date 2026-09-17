<#
.SYNOPSIS
  Ramo's Android uygulaması (Capacitor) — imzalı release APK üretir.

.DESCRIPTION
  1. Desktop\Ramos APK\firebase\google-services.json varsa android\app\ içine kopyalar
     (yoksa uygulama yine derlenir; yalnız FCM bildirim kaydı çalışmaz).
  2. npx cap sync android  (web derlemesi gerekmez: uygulama canlı siteyi açar, www\ yalnız çevrimdışı yedek)
  3. gradlew assembleRelease (JDK 21, ANDROID_HOME)
  4. apksigner ile Desktop\Ramos APK\ramos-release.keystore (alias ramos) imzalar
     → Desktop\Ramos APK\ramos-v<versionName>.apk
  5. İmza sertifikasının SHA-256'sını TWA (v1) anahtarıyla karşılaştırır — aynı değilse durur
     (farklı imza eski kurulumun üzerine güncellenemez).

  Parola anahtarın yanındaki OKU-BENI-anahtar.txt dosyasının "Parola : ..." satırından okunur; ekrana
  yazılmaz, komut satırına da konmaz (apksigner'a ortam değişkeniyle verilir).
  Sürüm: android\app\build.gradle içindeki versionCode / versionName.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File apps/mobile/build-apk.ps1
#>
[CmdletBinding()]
param(
  [string]$KeyDir = "$env:USERPROFILE\Desktop\Ramos APK",
  [string]$SdkDir = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$JavaHome = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot'
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$android = Join-Path $here 'android'
$expectedSha = 'DDD993716BAA17D75952758F8D509505E158FC57446C7F7711FBC086073534F4'

$keystore = Join-Path $KeyDir 'ramos-release.keystore'
$pwFile = Join-Path $KeyDir 'OKU-BENI-anahtar.txt'
if (-not (Test-Path -LiteralPath $keystore)) { throw "Anahtar yok: $keystore" }
$pwMatch = Select-String -LiteralPath $pwFile -Pattern '^Parola\s*:\s*(\S+)' | Select-Object -First 1
if (-not $pwMatch) { throw "Parola okunamadı: $pwFile" }

if (-not (Test-Path -LiteralPath $JavaHome)) { throw "JDK 21 yok: $JavaHome" }
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $SdkDir
$env:Path = "$JavaHome\bin;$env:Path"

# 1) Firebase yapılandırması (repoya girmez; .gitignore'da)
$gs = Join-Path $KeyDir 'firebase\google-services.json'
$gsTarget = Join-Path $android 'app\google-services.json'
if (Test-Path -LiteralPath $gs) {
  Copy-Item -LiteralPath $gs -Destination $gsTarget -Force
  Write-Host 'google-services.json kopyalandı (FCM açık).'
} else {
  Write-Warning "google-services.json yok ($gs) — APK FCM bildirimleri olmadan derleniyor."
}

# 2) Capacitor eşitleme
Push-Location -LiteralPath $here
try {
  & npx cap sync android
  if ($LASTEXITCODE -ne 0) { throw "cap sync başarısız ($LASTEXITCODE)" }
} finally { Pop-Location }

# 3) Gradle release (imzasız)
Push-Location -LiteralPath $android
try {
  & .\gradlew.bat assembleRelease --no-daemon -q
  if ($LASTEXITCODE -ne 0) { throw "gradle başarısız ($LASTEXITCODE)" }
} finally { Pop-Location }

$unsigned = Get-ChildItem -LiteralPath (Join-Path $android 'app\build\outputs\apk\release') -Filter '*.apk' | Select-Object -First 1
if (-not $unsigned) { throw 'release APK bulunamadı' }

# 4) İmzalama
$buildTools = Get-ChildItem -LiteralPath (Join-Path $SdkDir 'build-tools') -Directory |
  Sort-Object { [version]($_.Name -replace '[^0-9.]', '') } | Select-Object -Last 1
$apksigner = Join-Path $buildTools.FullName 'apksigner.bat'
$version = (Select-String -LiteralPath (Join-Path $android 'app\build.gradle') -Pattern 'versionName\s+"([^"]+)"').Matches[0].Groups[1].Value
$out = Join-Path $KeyDir "ramos-v$version.apk"

$env:RAMOS_KS_PW = $pwMatch.Matches[0].Groups[1].Value
try {
  & $apksigner sign --ks $keystore --ks-key-alias ramos --ks-pass env:RAMOS_KS_PW --key-pass env:RAMOS_KS_PW --out $out $unsigned.FullName
  if ($LASTEXITCODE -ne 0) { throw "apksigner sign başarısız ($LASTEXITCODE)" }
} finally {
  Remove-Item Env:\RAMOS_KS_PW -ErrorAction SilentlyContinue
}

# 5) Doğrulama: imza geçerli ve sertifika TWA ile aynı
$certs = & $apksigner verify --print-certs $out
if ($LASTEXITCODE -ne 0) { throw 'imza doğrulanamadı' }
$shaLine = $certs | Where-Object { $_ -match 'certificate SHA-256 digest:\s*([0-9a-fA-F]+)' } | Select-Object -First 1
$sha = if ($shaLine -match 'digest:\s*([0-9a-fA-F]+)') { $Matches[1].ToUpperInvariant() } else { '' }
Remove-Item -LiteralPath "$out.idsig" -ErrorAction SilentlyContinue
if ($sha -ne $expectedSha) {
  Remove-Item -LiteralPath $out -ErrorAction SilentlyContinue
  throw "İmza sertifikası beklenenden farklı ($sha) — APK silindi."
}
$pretty = ($sha -split '(..)' | Where-Object { $_ }) -join ':'
Write-Host "SHA-256: $pretty"
Write-Host "APK hazır: $out" -ForegroundColor Green

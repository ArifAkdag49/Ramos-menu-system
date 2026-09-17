<#
.SYNOPSIS
  Ramo's Android uygulamasi (TWA) - imzali APK uretir.

.DESCRIPTION
  1. gradlew assembleRelease (imzasiz release APK)
  2. apksigner ile Desktop\Ramos APK\ramos-release.keystore anahtariyla imzalar
  3. Ciktiyi Desktop\Ramos APK\ramos-v<surum>.apk olarak kopyalar ve imzayi dogrular

  Parola, anahtarin yanindaki OKU-BENI-anahtar.txt dosyasindan okunur (repoya girmez).
  Surum: twa-manifest.json ve app/build.gradle icindeki versionCode / versionName.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File apps/android/build-apk.ps1
#>
[CmdletBinding()]
param(
  [string]$KeyDir = "$env:USERPROFILE\Desktop\Ramos APK",
  [string]$SdkDir = "$env:LOCALAPPDATA\Android\Sdk"
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$keystore = Join-Path $KeyDir 'ramos-release.keystore'
$pwFile = Join-Path $KeyDir 'OKU-BENI-anahtar.txt'
if (-not (Test-Path -LiteralPath $keystore)) { throw "Anahtar yok: $keystore" }
$pw = (Select-String -LiteralPath $pwFile -Pattern '^Parola\s+:\s+(\S+)').Matches[0].Groups[1].Value
if (-not $pw) { throw "Parola okunamadi: $pwFile" }

$env:ANDROID_HOME = $SdkDir
Push-Location -LiteralPath $here
try {
  & .\gradlew.bat assembleRelease --no-daemon -q
  if ($LASTEXITCODE -ne 0) { throw "gradle basarisiz ($LASTEXITCODE)" }
} finally { Pop-Location }

$unsigned = Get-ChildItem -LiteralPath (Join-Path $here 'app\build\outputs\apk\release') -Filter '*.apk' | Select-Object -First 1
if (-not $unsigned) { throw 'release APK bulunamadi' }

$buildTools = Get-ChildItem -LiteralPath (Join-Path $SdkDir 'build-tools') -Directory | Sort-Object { [version]($_.Name -replace '[^0-9.]', '') } | Select-Object -Last 1
$apksigner = Join-Path $buildTools.FullName 'apksigner.bat'
$version = (Select-String -LiteralPath (Join-Path $here 'app\build.gradle') -Pattern 'versionName\s+"([^"]+)"').Matches[0].Groups[1].Value
$out = Join-Path $KeyDir "ramos-v$version.apk"

& $apksigner sign --ks $keystore --ks-key-alias ramos --ks-pass "pass:$pw" --key-pass "pass:$pw" --out $out $unsigned.FullName
if ($LASTEXITCODE -ne 0) { throw "apksigner sign basarisiz ($LASTEXITCODE)" }
& $apksigner verify --print-certs $out | Select-String 'SHA-256'
if ($LASTEXITCODE -ne 0) { throw 'imza dogrulanamadi' }
Remove-Item -LiteralPath "$out.idsig" -ErrorAction SilentlyContinue
Write-Host "APK hazir: $out" -ForegroundColor Green

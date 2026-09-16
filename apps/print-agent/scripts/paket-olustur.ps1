<#
.SYNOPSIS
    Yazıcı kurulum paketini (RamosYaziciKurulum klasörü + .zip) oluşturur.

.DESCRIPTION
    Geliştirici makinesinde çalışır: ajanı derler, `Kurulum.cmd` / `Kaldir.cmd` / `OKU-BENI.txt`,
    tek dosyalık ajan ve kurulum betiklerini bir klasörde toplar, ajan hesabının bilgilerini
    içeren `.env`'i yazar ve hepsini zip'ler. Zip'i başka bir bilgisayara kopyalayıp
    açtıktan sonra Kurulum.cmd çalıştırılır.

    Paket `.env`'i yalnız şu dört anahtarı taşır: SUPABASE_URL, SUPABASE_ANON_KEY,
    AGENT_EMAIL, AGENT_PASSWORD. AGENT_ID, LOG_DIR ve PRINTER_HOST kurulum sırasında
    her bilgisayar için ayrıca yazılır. service_role anahtarı ASLA pakete girmez.

    Çıktı klasörü (`release/`) .gitignore'dadır: paket ajan parolasını içerir.

.PARAMETER EnvSource
    Hesap bilgilerinin okunacağı .env. Varsayılan: apps/print-agent/.env

.PARAMETER OutDir
    Çıktı klasörü. Varsayılan: apps/print-agent/release
#>
param(
    [string]$EnvSource = (Join-Path $PSScriptRoot '..\.env'),
    [string]$OutDir = (Join-Path $PSScriptRoot '..\release')
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'agent-common.ps1')

$agentRoot = Get-RamosPath (Join-Path $PSScriptRoot '..')
$OutDir = Get-RamosPath $OutDir
$EnvSource = Get-RamosPath $EnvSource
$pkgName = 'RamosYaziciKurulum'
$pkg = Join-Path $OutDir $pkgName
$zip = Join-Path $OutDir "$pkgName.zip"

# --- 1) Hesap bilgileri --------------------------------------------------------------------
if (-not (Test-Path $EnvSource)) {
    Write-Host "Hesap bilgileri bulunamadı: $EnvSource" -ForegroundColor Red
    exit 1
}
$sourceLines = @(Get-Content -Path $EnvSource -Encoding UTF8)
$keys = @('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'AGENT_EMAIL', 'AGENT_PASSWORD')
$envLines = New-Object System.Collections.ArrayList
foreach ($key in $keys) {
    $line = $sourceLines | Where-Object { $_ -match "^\s*$key\s*=\s*\S" } | Select-Object -First 1
    if (-not $line) {
        Write-Host "$EnvSource içinde $key eksik ya da boş." -ForegroundColor Red
        exit 1
    }
    [void]$envLines.Add(($line -replace '^\s*', ''))
}
# Güvenlik: yanlış dosya verilirse (ör. kök .env) service_role anahtarının pakete sızmadığından emin ol.
$anon = ($envLines | Where-Object { $_ -like 'SUPABASE_ANON_KEY=*' }) -replace '^SUPABASE_ANON_KEY=', ''
try {
    $payload = $anon.Split('.')[1].Replace('-', '+').Replace('_', '/')
    while ($payload.Length % 4) { $payload += '=' }
    $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
    if ($claims.role -ne 'anon') {
        Write-Host "SUPABASE_ANON_KEY bir anon anahtarı değil (role=$($claims.role)). Paket oluşturulmadı." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host 'SUPABASE_ANON_KEY çözümlenemedi; paket oluşturulmadı.' -ForegroundColor Red
    exit 1
}

# --- 2) Derleme ------------------------------------------------------------------------------
Write-Host 'Ajan derleniyor...' -ForegroundColor Gray
Push-Location $agentRoot
try {
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & node build.mjs 2>&1 | ForEach-Object { "  $_" }   # esbuild bilgiyi stderr'e yazar; kırmızı hata gibi görünmesin
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
} finally {
    Pop-Location
}
if ($code -ne 0) {
    Write-Host 'Derleme başarısız.' -ForegroundColor Red
    exit 1
}

# --- 3) Klasör -------------------------------------------------------------------------------
New-Item -ItemType Directory -Force $OutDir | Out-Null
if (Test-Path $pkg) {
    # Yalnız kendi çıktı klasörümüzü sileriz; junction ise dokunmayız (hedefi boşaltabilir).
    $item = Get-Item $pkg -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        Write-Host "$pkg bir junction/symlink, silinmedi." -ForegroundColor Red
        exit 1
    }
    Remove-Item -Recurse -Force $pkg
}
New-Item -ItemType Directory -Force (Join-Path $pkg 'dist') | Out-Null
New-Item -ItemType Directory -Force (Join-Path $pkg 'scripts') | Out-Null

Copy-Item (Join-Path $agentRoot 'dist\ramos-agent.mjs') (Join-Path $pkg 'dist')
foreach ($f in @('agent-common.ps1', 'install-agent.ps1', 'uninstall-agent.ps1', 'run-agent.cmd', 'kurulum.ps1', 'ag-kopru.ps1')) {
    Copy-Item (Join-Path $PSScriptRoot $f) (Join-Path $pkg 'scripts')
}
foreach ($f in @('Kurulum.cmd', 'Kaldir.cmd', 'OKU-BENI.txt')) {
    Copy-Item (Join-Path $agentRoot "kurulum\$f") $pkg
}
Set-RamosTextFile -Path (Join-Path $pkg '.env') -Lines $envLines

# --- 4) Zip ----------------------------------------------------------------------------------
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path $pkg -DestinationPath $zip

$size = [Math]::Round((Get-Item $zip).Length / 1KB)
Write-Host ''
Write-Host "Paket hazır: $zip ($size KB)" -ForegroundColor Green
Write-Host "Klasör     : $pkg" -ForegroundColor Gray
Write-Host 'Zip ajan parolasını içerir: yalnız işletmenin bilgisayarlarına kopyalayın.' -ForegroundColor Yellow

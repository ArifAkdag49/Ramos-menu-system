<#
.SYNOPSIS
  Ramos Sipariş Sistemi — web arayüzünü Plesk'e yayınlar ve duman testi yapar.

.DESCRIPTION
  1. apps/web üretim derlemesi (apps/web/.env.production ile)
  2. dist içeriğini (gizli .htaccess dosyaları dahil) belge köküne kopyalar
  3. Dosya sahipliğini aboneliğin sistem kullanıcısına verir (chown -R <sysuser>:psacln)
  4. Canlı duman testi: SPA yönlendirmesi, önbellek başlıkları, HTTPS, HTTP -> HTTPS

.EXAMPLE
  powershell -File deploy/deploy-web.ps1 -Domain ramos.arxdigitalsevice.com -WebRoot /var/www/vhosts/arxdigitalsevice.com/ramos.arxdigitalsevice.com -SysUser arxdigitalsevice.com_s5mrfezwmec
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Domain,
  [Parameter(Mandatory = $true)][string]$WebRoot,
  [Parameter(Mandatory = $true)][string]$SysUser,
  [string]$Key = "$HOME\.ssh\tvds_deploy",
  [string]$Server = '87.106.47.17',
  [switch]$SkipBuild,
  [switch]$SmokeOnly
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepoRoot = Split-Path -Parent $PSScriptRoot
$DistPath = Join-Path $RepoRoot 'apps\web\dist'
$Remote = "root@$Server"
$script:Failures = 0

function Write-Step([string]$Text) { Write-Host ''; Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Fail([string]$Text) { $script:Failures++; Write-Host "  [HATA] $Text" -ForegroundColor Red }

# --- Guvenlik kapisi: belge koku gercekten bu alan adina mi ait? ---
if ($WebRoot -notmatch [regex]::Escape($Domain)) {
  throw "Belge koku ($WebRoot) alan adini ($Domain) icermiyor - yanlis siteye yazmayi onlemek icin durduruldu."
}
if (-not (Test-Path -LiteralPath $Key)) { throw "SSH anahtari bulunamadi: $Key" }

# --- 1) Derleme ---
if (-not $SmokeOnly -and -not $SkipBuild) {
  Write-Step 'Uretim derlemesi (npm run build -w apps/web)'
  $envProd = Join-Path $RepoRoot 'apps\web\.env.production'
  if (-not (Test-Path -LiteralPath $envProd)) {
    throw "apps/web/.env.production yok. Once .env.production.example kopyalanip doldurulmali."
  }
  Push-Location -LiteralPath $RepoRoot
  try {
    & npm run build -w apps/web
    if ($LASTEXITCODE -ne 0) { throw "npm run build basarisiz (cikis kodu $LASTEXITCODE)" }
  } finally { Pop-Location }
  Write-Ok 'Derleme tamam'
}

if (-not $SmokeOnly) {
  if (-not (Test-Path -LiteralPath $DistPath)) { throw "Derleme ciktisi yok: $DistPath" }
  if (-not (Test-Path -LiteralPath (Join-Path $DistPath 'index.html'))) { throw 'dist/index.html yok' }
  if (-not (Test-Path -LiteralPath (Join-Path $DistPath '.htaccess'))) { throw 'dist/.htaccess yok (apps/web/public/.htaccess var mi?)' }

  # --- 2) Eski surumu temizle (yalniz bu belge koku) ---
  Write-Step "Eski surum temizleniyor: $WebRoot"
  $clean = "set -e; test -d '$WebRoot'; rm -rf '$WebRoot/assets'; rm -f '$WebRoot/index.html' '$WebRoot/.htaccess'"
  & ssh -i $Key -o BatchMode=yes $Remote $clean
  if ($LASTEXITCODE -ne 0) { throw "Uzak temizlik basarisiz (cikis kodu $LASTEXITCODE)" }
  Write-Ok 'Belge koku hazir'

  # --- 3) Yukleme (gizli dosyalar dahil) ---
  Write-Step 'Dosyalar yukleniyor (scp)'
  $items = @(Get-ChildItem -LiteralPath $DistPath -Force | ForEach-Object { $_.FullName })
  if ($items.Count -eq 0) { throw 'dist bos' }
  Write-Host ('  Gonderilen ust duzey ogeler: ' + (($items | Split-Path -Leaf) -join ', '))
  & scp -q -r -i $Key $items ('{0}:{1}/' -f $Remote, $WebRoot)
  if ($LASTEXITCODE -ne 0) { throw "scp basarisiz (cikis kodu $LASTEXITCODE)" }
  Write-Ok 'Yukleme tamam'

  # --- 4) Sahiplik ve izinler ---
  # Plesk kurali: belge kokunun KENDISI <sysuser>:psaserv 750 kalir (Apache/nginx bu grupla
  # icine girer), icerik ise <sysuser>:psacln - dizinler 755, dosyalar 644.
  Write-Step "Sahiplik: chown -R ${SysUser}:psacln + Plesk izinleri"
  $own = "set -e; chown -R '${SysUser}:psacln' '$WebRoot'; " +
    "find '$WebRoot' -type d -exec chmod 755 {} +; " +
    "find '$WebRoot' -type f -exec chmod 644 {} +; " +
    "chown '${SysUser}:psaserv' '$WebRoot'; chmod 750 '$WebRoot'; " +
    "ls -la '$WebRoot'"
  & ssh -i $Key -o BatchMode=yes $Remote $own
  if ($LASTEXITCODE -ne 0) { throw "chown basarisiz (cikis kodu $LASTEXITCODE)" }
  Write-Ok 'Sahiplik ve izinler ayarlandi'
}

# --- 5) Duman testi ---
Write-Step "Duman testi: https://$Domain"

function Invoke-Probe {
  param([string]$Url, [switch]$NoRedirect)
  # Invoke-WebRequest PS 5.1'de -MaximumRedirection 0 ile yanit nesnesini yutuyor;
  # yonlendirme kontrolu icin dogrudan HttpWebRequest kullaniyoruz.
  try {
    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.Method = 'GET'
    $req.UserAgent = 'ramos-deploy-smoke'
    $req.Timeout = 30000
    $req.AllowAutoRedirect = -not $NoRedirect
    $resp = $null
    try { $resp = $req.GetResponse() } catch [System.Net.WebException] {
      if ($_.Exception.Response) { $resp = $_.Exception.Response }
      else { return [pscustomobject]@{ Status = 0; Headers = @{}; Content = ''; Error = $_.Exception.Message } }
    }
    $h = @{}
    foreach ($k in $resp.Headers.AllKeys) { $h[$k] = [string]$resp.Headers[$k] }
    $body = ''
    try {
      $sr = New-Object IO.StreamReader($resp.GetResponseStream())
      $body = $sr.ReadToEnd(); $sr.Close()
    } catch { $body = '' }
    $code = [int]$resp.StatusCode
    $resp.Close()
    return [pscustomobject]@{ Status = $code; Headers = $h; Content = $body; Error = $null }
  } catch {
    return [pscustomobject]@{ Status = 0; Headers = @{}; Content = ''; Error = $_.Exception.Message }
  }
}

function Test-Route([string]$Path, [int]$Expect = 200) {
  $r = Invoke-Probe -Url "https://$Domain$Path"
  if ($r.Error) { Write-Fail "$Path -> istek hatasi: $($r.Error)"; return $null }
  if ($r.Status -eq $Expect) { Write-Ok "$Path -> $($r.Status)" } else { Write-Fail "$Path -> $($r.Status) (beklenen $Expect)" }
  return $r
}

$root = Test-Route '/' 200
foreach ($spa in @('/waiter', '/kitchen', '/admin', '/login')) {
  $r = Test-Route $spa 200
  # SPA yedegi gercekten index.html'i mi dondurdu?
  if ($r -and $r.Status -eq 200 -and $r.Content -notmatch '/assets/[A-Za-z0-9._-]+\.js') {
    Write-Fail "$spa -> 200 ama govde SPA index.html degil"
  }
}

# HTTPS sertifikasi: istekler hata vermeden dondu ise TLS zinciri gecerli.
if ($root -and $root.Status -eq 200) { Write-Ok 'HTTPS sertifikasi gecerli (TLS el sikismasi ve zincir dogrulamasi sorunsuz)' }
else { Write-Fail 'HTTPS sertifikasi dogrulanamadi' }

# index.html onbellege alinmamali
if ($root -and $root.Headers['Cache-Control']) {
  $cc = $root.Headers['Cache-Control']
  if ($cc -match 'no-cache|no-store') { Write-Ok "/ Cache-Control: $cc" } else { Write-Fail "/ Cache-Control beklenmedik: $cc" }
} else { Write-Fail '/ Cache-Control basligi yok' }

# assets/*.js -> immutable
if ($root -and $root.Content -match '(/assets/[A-Za-z0-9._-]+\.js)') {
  $src = $Matches[1]
  $a = Invoke-Probe -Url ("https://$Domain" + $src)
  if ($a.Status -eq 200) {
    $cc = $a.Headers['Cache-Control']
    if ($cc -match 'immutable') { Write-Ok "$src -> 200 - Cache-Control: $cc" }
    else { Write-Fail "$src -> Cache-Control '$cc' (immutable bekleniyordu)" }
  } else { Write-Fail "$src -> $($a.Status)" }
} else { Write-Fail 'index.html icinde /assets/*.js bulunamadi' }

# Istege bagli PWA dosyalari (Gorev 25 sonrasi olusur).
# SPA yedegi her yolu index.html'e dusurdugu icin "200 + text/html" = dosya YOK demektir.
foreach ($opt in @('/sw.js', '/manifest.webmanifest')) {
  $o = Invoke-Probe -Url "https://$Domain$opt"
  if ($o.Status -eq 404) { Write-Host "  [ATLANDI] $opt yok (PWA henuz eklenmedi)" -ForegroundColor DarkGray; continue }
  if ($o.Status -eq 200 -and ([string]$o.Headers['Content-Type']) -match 'text/html') {
    Write-Host "  [ATLANDI] $opt yok - SPA yedegi index.html dondu (PWA henuz eklenmedi)" -ForegroundColor DarkGray; continue
  }
  if ($o.Status -ne 200) { Write-Fail "$opt -> $($o.Status)"; continue }
  $cc = $o.Headers['Cache-Control']
  if ($cc -match 'no-cache|no-store') { Write-Ok "$opt -> 200 - Cache-Control: $cc" }
  else { Write-Fail "$opt -> Cache-Control '$cc' (no-cache bekleniyordu)" }
}

# HTTP -> HTTPS yonlendirmesi
$h = Invoke-Probe -Url "http://$Domain/" -NoRedirect
if ($h.Status -ge 300 -and $h.Status -lt 400) {
  $loc = $h.Headers['Location']
  if ($loc -like 'https://*') { Write-Ok "http:// -> $($h.Status) $loc" } else { Write-Fail "http:// -> $($h.Status) ama Location '$loc'" }
} else { Write-Fail "http:// -> $($h.Status) (301/302 bekleniyordu)" }

Write-Host ''
if ($script:Failures -gt 0) {
  Write-Host "SONUC: $script:Failures kontrol BASARISIZ" -ForegroundColor Red
  exit 1
}
Write-Host 'SONUC: tum kontroller gecti' -ForegroundColor Green
exit 0

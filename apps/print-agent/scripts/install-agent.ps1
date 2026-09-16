<#
.SYNOPSIS
    Ramo's yazdırma ajanını bu PC'ye kurar ve "RamosPrintAgent" Zamanlanmış Görevi olarak başlatır.

.DESCRIPTION
    Tek dosyalık paketi (dist\ramos-agent.mjs) ve run-agent.cmd'yi kurulum klasörüne kopyalar,
    yoksa .env dosyasını da taşır, ardından oturum açılışında kendiliğinden başlayan bir
    Zamanlanmış Görev kaydeder. Görev gizli çalışır.

    Önce `npm run build -w apps/print-agent` çalıştırılmış olmalıdır.
    Kaldırmak için: scripts\uninstall-agent.ps1

    Zaten kurulu ve ÇALIŞAN bir ajan varsa önce durdurulur (çalışan node, ramos-agent.mjs
    dosyasını kilitler; durdurmadan kopyalama başarısız olur).

.PARAMETER InstallDir
    Kurulum klasörü. Varsayılan: %LOCALAPPDATA%\RamosPrintAgent

.PARAMETER LogDir
    Ajanın günlük ve kilit klasörü. Varsayılan: %LOCALAPPDATA%\RamosPrintAgent\logs
    DİKKAT: ajan bu yolu .env'deki LOG_DIR'den, o boşsa Windows'ta her zaman
    %LOCALAPPDATA%\RamosPrintAgent\logs olarak hesaplar (config.ts: defaultLogDir).
    Yani -InstallDir ile BAŞKA bir klasöre kurarsanız günlükler yine varsayılan yere yazılır;
    günlükleri de taşımak isterseniz .env içinde LOG_DIR belirtin ve bu betiğe -LogDir verin.
#>
param(
    [string]$InstallDir = "$env:LOCALAPPDATA\RamosPrintAgent",
    [string]$LogDir = "$env:LOCALAPPDATA\RamosPrintAgent\logs"
)

$ErrorActionPreference = 'Stop'

$common = Join-Path $PSScriptRoot 'agent-common.ps1'
if (-not (Test-Path $common)) {
    Write-Host "agent-common.ps1 bulunamadı ($common). Betikleri scripts klasöründen birlikte çalıştırın." -ForegroundColor Red
    exit 1
}
. $common

$InstallDir = Get-RamosPath $InstallDir
$LogDir = Get-RamosPath $LogDir

# --- Node 22+ kontrolü -------------------------------------------------------------------
# `node` hiç kurulu değilse CommandNotFoundException fırlar; onu da "sürüm yok" sayarız.
# M3: nvm/shim sarmalayıcıları birden çok satır yazabilir — yalnız ilk "vNN..." satırı alınır,
# aksi hâlde [int](dizi) dönüşümü anlaşılmaz bir yığın izine düşerdi.
$nodeVersion = $null
try { $nodeVersion = @(& node -v 2>$null) | Where-Object { $_ -match '^v\d+' } | Select-Object -First 1 } catch { $nodeVersion = $null }
$nodeMajor = 0
if ($nodeVersion -match '^v(\d+)') { $nodeMajor = [int]$Matches[1] }
if ($nodeMajor -lt 22) {
    Write-Host 'Node.js 22 veya üstü gerekli: https://nodejs.org (LTS) kurup tekrar çalıştırın.' -ForegroundColor Red
    if ($nodeVersion) { Write-Host "Bulunan sürüm: $nodeVersion" -ForegroundColor Red }
    exit 1
}

# M3: Zamanlanmış Görev, oturumunuzdan FARKLI bir PATH görebilir. node'un tam yolu dosyaya
# yazılır; run-agent.cmd varsa onu kullanır, yoksa PATH'teki `node`a düşer. Aksi hâlde görev
# sessizce "node bulunamadı" döngüsüne girerdi.
$nodeExe = $null
try { $nodeExe = (Get-Command node -ErrorAction Stop).Source } catch { $nodeExe = $null }

$agentFile = Join-Path $PSScriptRoot '..\dist\ramos-agent.mjs'
if (-not (Test-Path $agentFile)) {
    Write-Host "dist\ramos-agent.mjs yok. Önce 'npm run build -w apps/print-agent' çalıştırın." -ForegroundColor Red
    exit 1
}

# --- M1: çalışan kurulumu durdur ----------------------------------------------------------
$existingTask = Get-ScheduledTask -TaskName 'RamosPrintAgent' -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host 'Var olan RamosPrintAgent görevi durduruluyor (yeniden kurulum)...' -ForegroundColor Gray
    try { Stop-ScheduledTask -TaskName 'RamosPrintAgent' -ErrorAction Stop } catch { }
}
$stoppedBefore = Stop-RamosAgent -InstallDir $InstallDir -LogDir $LogDir
if ($stoppedBefore -gt 0) { Start-Sleep -Seconds 1 }   # dosya tutamaklarının kapanması için

# --- Dosyalar -----------------------------------------------------------------------------
New-Item -ItemType Directory -Force $InstallDir | Out-Null
Copy-Item $agentFile $InstallDir -Force
Copy-Item (Join-Path $PSScriptRoot 'run-agent.cmd') $InstallDir -Force
if ($nodeExe) { [IO.File]::WriteAllText((Join-Path $InstallDir 'node-path.txt'), $nodeExe, (New-Object Text.UTF8Encoding $false)) }

# Var olan .env ASLA üzerine yazılmaz: restoran PC'sindeki kurulumun kendi ayarları olur.
$envTarget = Join-Path $InstallDir '.env'
$envIsNew = $false
if (-not (Test-Path $envTarget)) {
    $envSource = Join-Path $PSScriptRoot '..\.env'
    if (Test-Path $envSource) {
        Copy-Item $envSource $envTarget
        $envIsNew = $true
    } else {
        Write-Host ".env bulunamadı. $envTarget dosyasını oluşturun (SUPABASE_URL, SUPABASE_ANON_KEY, AGENT_EMAIL, AGENT_PASSWORD, AGENT_ID)." -ForegroundColor Yellow
    }
}

# --- R83: AGENT_ID makineye özgü olmalı ---------------------------------------------------
# Geliştirici .env'i olduğu gibi kopyalanırsa restoran PC'si de AGENT_ID=ramos-pc-1 ile
# çalışır. `agent_heartbeat` sade AGENT_ID gönderdiği için iki makine tek printer_status
# satırını dönüşümlü ezer VE ikisi de aynı kuyruktan iş kapar → restoranın fişi geliştirme
# PC'sindeki yazıcıdan çıkar. Bu yüzden kopyalanan .env'deki AGENT_ID makine adına bağlanır.
# AGENT_EMAIL/AGENT_PASSWORD paylaşılan `drucker` hesabıdır, dokunulmaz.
if (Test-Path $envTarget) {
    $wantedId = "ramos-$($env:COMPUTERNAME.ToLowerInvariant())"
    $lines = @(Get-Content $envTarget)
    $idLine = $lines | Where-Object { $_ -match '^\s*AGENT_ID\s*=' } | Select-Object -First 1
    $currentId = if ($idLine) { ($idLine -replace '^\s*AGENT_ID\s*=\s*', '').Trim() } else { '' }

    if ($envIsNew) {
        # .env'i BİZ kopyaladık (geliştirici kopyası) → kimlik her hâlükârda makineye bağlanır.
        if ($idLine) {
            $lines = $lines | ForEach-Object { if ($_ -match '^\s*AGENT_ID\s*=') { "AGENT_ID=$wantedId" } else { $_ } }
        } else {
            $lines += "AGENT_ID=$wantedId"
        }
        Set-RamosTextFile -Path $envTarget -Lines $lines
        Write-Host "AGENT_ID bu makineye özgü hâle getirildi: $wantedId (kopyalanan değer: '$currentId')" -ForegroundColor Yellow
    } elseif (-not $currentId.ToLowerInvariant().Contains($env:COMPUTERNAME.ToLowerInvariant())) {
        # Karşılaştırma ORDINAL: `-match`/`-like` büyük-küçük harf eşlemesini GEÇERLİ KÜLTÜRE
        # göre yapar ve tr-TR'de 'I' ile 'i' EŞLEŞMEZ (noktasız ı) — Türkçe Windows'ta bu
        # uyarı her seferinde yanlışlıkla basılıyordu.
        # Kurulum klasöründe zaten bir .env vardı: operatörün kendi dosyası, DEĞİŞTİRİLMEZ.
        # Yine de makine adını içermiyorsa uyarırız — başka bir PC ile çakışma riski.
        Write-Host "UYARI: AGENT_ID='$currentId' makine adını ($env:COMPUTERNAME) içermiyor." -ForegroundColor Yellow
        Write-Host "       Başka bir PC'de aynı kimlik kullanılıyorsa iki ajan aynı kuyruktan iş kapar." -ForegroundColor Yellow
        Write-Host "       Öneri: $envTarget içinde AGENT_ID=$wantedId" -ForegroundColor Yellow
    } else {
        Write-Host "AGENT_ID: $currentId (makineye özgü, değiştirilmedi)" -ForegroundColor Gray
    }
}

# --- Zamanlanmış Görev --------------------------------------------------------------------
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$InstallDir\run-agent.cmd`"" -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
Register-ScheduledTask -TaskName 'RamosPrintAgent' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'RamosPrintAgent'

# --- M2: gerçekten başladı mı? ------------------------------------------------------------
# "Kuruldu ve başlatıldı" demeden önce doğrula: Start-ScheduledTask hata vermeden dönüp
# görev anında başarısız olabilir (yanlış yol, eksik .env, engellenmiş cmd.exe).
$nodePattern = Get-RamosLikePattern (Join-Path $InstallDir 'ramos-agent.mjs')
$running = $null
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 750
    $running = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object { $_.CommandLine -like $nodePattern }) | Select-Object -First 1
    if ($running) { break }
}

$info = Get-ScheduledTaskInfo -TaskName 'RamosPrintAgent'
if ($running) {
    Write-Host "Ramo's yazdırma ajanı kuruldu ve çalışıyor: $InstallDir (node pid $($running.ProcessId))" -ForegroundColor Green
} else {
    Write-Host "Ramo's yazdırma ajanı kuruldu ama 15 sn içinde node süreci görünmedi: $InstallDir" -ForegroundColor Yellow
    Write-Host "Görev durumu: $((Get-ScheduledTask -TaskName 'RamosPrintAgent').State) · son sonuç: $($info.LastTaskResult)" -ForegroundColor Yellow
    Write-Host "Ayrıntı için: $InstallDir\logs\console.log, $InstallDir\logs\FATAL.txt ve $LogDir\agent-*.log" -ForegroundColor Yellow
}
# run-agent.cmd'nin konsol günlüğü her zaman KURULUM klasörünün altındadır (%~dp0logs);
# ajanın kendi JSON günlüğü ise LOG_DIR'dedir. Varsayılan kurulumda ikisi aynı klasördür.
Write-Host "Ajan günlüğü: $LogDir · konsol günlüğü: $InstallDir\logs" -ForegroundColor Gray

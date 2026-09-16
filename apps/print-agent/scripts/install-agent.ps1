<#
.SYNOPSIS
    Ramo's yazdırma ajanını bu PC'ye kurar ve "RamosPrintAgent" Zamanlanmış Görevi olarak başlatır.

.DESCRIPTION
    Tek dosyalık paketi (dist\ramos-agent.mjs) ve run-agent.cmd'yi kurulum klasörüne kopyalar,
    yoksa .env dosyasını da taşır, ardından oturum açılışında kendiliğinden başlayan bir
    Zamanlanmış Görev kaydeder. Görev gizli çalışır; ajanın günlükleri
    %LOCALAPPDATA%\RamosPrintAgent\logs altındadır.

    Önce `npm run build -w apps/print-agent` çalıştırılmış olmalıdır.
    Kaldırmak için: scripts\uninstall-agent.ps1

.PARAMETER InstallDir
    Kurulum klasörü. Varsayılan: %LOCALAPPDATA%\RamosPrintAgent
    (Ajanın günlük klasörü her durumda %LOCALAPPDATA%\RamosPrintAgent\logs'tur; farklı bir
    klasöre kurulursa .env içindeki LOG_DIR ile değiştirilebilir.)
#>
param([string]$InstallDir = "$env:LOCALAPPDATA\RamosPrintAgent")

$ErrorActionPreference = 'Stop'

# Node 22+ şart: paket `node22` hedefiyle derlenir ve process.loadEnvFile gibi yeni API'leri kullanır.
# `node` hiç kurulu değilse CommandNotFoundException fırlar; onu da "sürüm yok" olarak ele alırız.
$nodeVersion = $null
try { $nodeVersion = (& node -v) } catch { $nodeVersion = $null }
if (-not $nodeVersion -or [int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 22) {
    Write-Host 'Node.js 22 veya üstü gerekli: https://nodejs.org (LTS) kurup tekrar çalıştırın.' -ForegroundColor Red
    exit 1
}

$agentFile = Join-Path $PSScriptRoot '..\dist\ramos-agent.mjs'
if (-not (Test-Path $agentFile)) {
    Write-Host "dist\ramos-agent.mjs yok. Önce 'npm run build -w apps/print-agent' çalıştırın." -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force $InstallDir | Out-Null
Copy-Item $agentFile $InstallDir -Force
Copy-Item (Join-Path $PSScriptRoot 'run-agent.cmd') $InstallDir -Force

# Var olan .env ASLA üzerine yazılmaz: restoran PC'sindeki kurulumun kendi ajan parolası olur.
$envTarget = Join-Path $InstallDir '.env'
if (-not (Test-Path $envTarget)) {
    $envSource = Join-Path $PSScriptRoot '..\.env'
    if (Test-Path $envSource) {
        Copy-Item $envSource $envTarget
    } else {
        Write-Host ".env bulunamadı. $envTarget dosyasını oluşturun (SUPABASE_URL, SUPABASE_ANON_KEY, AGENT_EMAIL, AGENT_PASSWORD, AGENT_ID)." -ForegroundColor Yellow
    }
}

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$InstallDir\run-agent.cmd`"" -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
Register-ScheduledTask -TaskName 'RamosPrintAgent' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'RamosPrintAgent'

Write-Host "Ramo's yazdırma ajanı kuruldu ve başlatıldı: $InstallDir" -ForegroundColor Green
Write-Host "Günlükler: $env:LOCALAPPDATA\RamosPrintAgent\logs" -ForegroundColor Gray

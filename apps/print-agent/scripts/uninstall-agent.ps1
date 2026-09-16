<#
.SYNOPSIS
    "RamosPrintAgent" Zamanlanmış Görevini kaldırır ve çalışan ajan süreçlerini durdurur.

.DESCRIPTION
    1) Zamanlanmış Görevi siler, 2) hâlâ çalışan ramos-agent.mjs süreçlerini kapatır,
    3) onay alındıysa kurulum klasörünü siler.

    Kurulum klasörü ajanın .env dosyasını (AGENT_PASSWORD) barındırır; bu yüzden silme
    adımı varsayılan olarak SORULUR. Gözetimsiz kaldırma için -RemoveFiles kullanın,
    klasörü korumak için -KeepFiles.

.PARAMETER InstallDir
    Kurulum klasörü. Varsayılan: %LOCALAPPDATA%\RamosPrintAgent

.PARAMETER RemoveFiles
    Sormadan kurulum klasörünü siler (gözetimsiz kaldırma / betikten çağırma).

.PARAMETER KeepFiles
    Sormadan kurulum klasörünü bırakır.
#>
param(
    [string]$InstallDir = "$env:LOCALAPPDATA\RamosPrintAgent",
    [switch]$RemoveFiles,
    [switch]$KeepFiles
)

$ErrorActionPreference = 'Stop'

if ($RemoveFiles -and $KeepFiles) {
    Write-Host '-RemoveFiles ve -KeepFiles birlikte verilemez.' -ForegroundColor Red
    exit 1
}

# 1) Zamanlanmış Görev
$task = Get-ScheduledTask -TaskName 'RamosPrintAgent' -ErrorAction SilentlyContinue
if ($task) {
    Unregister-ScheduledTask -TaskName 'RamosPrintAgent' -Confirm:$false
    Write-Host 'Zamanlanmış Görev kaldırıldı: RamosPrintAgent' -ForegroundColor Green
} else {
    Write-Host 'Zamanlanmış Görev zaten yok: RamosPrintAgent' -ForegroundColor Gray
}

# 2) Çalışan süreçler — hem `node ramos-agent.mjs run` hem de onu saran run-agent.cmd döngüsü.
# Döngü betiği önce kapatılır, yoksa node öldükten 5 sn sonra ajanı yeniden başlatır.
#
# Desen KURULUM KLASÖRÜNE bağlanır, yalnız dosya adına değil: geniş bir `*ramos-agent.mjs*`
# deseni, depo kopyasından elle çalıştırılan tanı komutlarını (`status`, `dry-run`,
# `fake-printer`) ve başka bir klasöre kurulmuş ikinci bir kurulumu da öldürürdü.
# (Görev 20'de gerçekten oldu: kaldırma, geliştiricinin sahte yazıcısını da kapattı.)
$stopped = 0
foreach ($pattern in @("*$InstallDir\run-agent.cmd*", "*$InstallDir\ramos-agent.mjs*")) {
    # Süreçler önce toplanır: `catch` bloğunda $_ hata kaydına döndüğü için pid'i ayrı bir
    # değişkende tutmak gerekir (boru hattı içinde yazılırsa hata mesajı pid'siz kalırdı).
    $procs = @(Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe' or Name = 'node.exe'" |
        Where-Object { $_.CommandLine -like $pattern })
    foreach ($p in $procs) {
        try {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
            $stopped++
        } catch {
            Write-Host "Süreç durdurulamadı (pid $($p.ProcessId)): $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}
Write-Host "Durdurulan süreç sayısı: $stopped" -ForegroundColor Gray

# Ajan kilit dosyası süreçle birlikte kaybolur; kalmışsa bir sonraki kurulum onu devralır.

# 3) Kurulum klasörü
if (-not (Test-Path $InstallDir)) {
    Write-Host "Kurulum klasörü zaten yok: $InstallDir" -ForegroundColor Gray
    return
}

$delete = $false
if ($RemoveFiles) {
    $delete = $true
} elseif (-not $KeepFiles) {
    Write-Host ''
    Write-Host "Kurulum klasörü: $InstallDir"
    Write-Host 'İçinde ajan parolasını taşıyan .env ve günlükler var.'
    $answer = Read-Host 'Klasör silinsin mi? (e/H)'
    $delete = ($answer -eq 'e' -or $answer -eq 'E')
}

if ($delete) {
    Remove-Item -Recurse -Force $InstallDir
    Write-Host "Klasör silindi: $InstallDir" -ForegroundColor Green
} else {
    Write-Host "Klasör bırakıldı: $InstallDir" -ForegroundColor Gray
}

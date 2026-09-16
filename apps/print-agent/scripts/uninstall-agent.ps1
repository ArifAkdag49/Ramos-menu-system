<#
.SYNOPSIS
    "RamosPrintAgent" Zamanlanmış Görevini kaldırır ve çalışan ajan süreçlerini durdurur.

.DESCRIPTION
    1) Zamanlanmış Görevi siler, 2) bu kuruluma ait çalışan süreçleri kapatır (kilit
    dosyasındaki PID otoriter kaynaktır; komut satırı deseni yedek yoldur), 3) onay alındıysa
    kurulum klasörünü siler.

    Kurulum klasörü ajanın .env dosyasını (AGENT_PASSWORD) barındırır; silinmesi kasıtlıdır,
    ama varsayılan olarak SORULUR. Gözetimsiz kaldırma için -RemoveFiles kullanın, klasörü
    korumak için -KeepFiles.

.PARAMETER InstallDir
    Kurulum klasörü. Varsayılan: %LOCALAPPDATA%\RamosPrintAgent

.PARAMETER LogDir
    Ajanın günlük ve kilit (agent.lock) klasörü. Varsayılan: %LOCALAPPDATA%\RamosPrintAgent\logs
    DİKKAT (M5): ajan bu yolu .env'deki LOG_DIR'den, o boşsa Windows'ta her zaman
    %LOCALAPPDATA%\RamosPrintAgent\logs olarak hesaplar. -InstallDir ile BAŞKA bir klasöre
    kurulduysa günlükler ve agent.lock yine varsayılan yerdedir ve klasör silinse bile orada
    kalır — o durumda -LogDir'i de verin.

.PARAMETER RemoveFiles
    Sormadan kurulum klasörünü siler (gözetimsiz kaldırma / betikten çağırma).
    Güvenlik kapılarını ATLAMAZ: klasör bir ajan kurulumu değilse ya da süreçler
    durdurulamadıysa yine silinmez.

.PARAMETER KeepFiles
    Sormadan kurulum klasörünü bırakır.
#>
param(
    [string]$InstallDir = "$env:LOCALAPPDATA\RamosPrintAgent",
    [string]$LogDir = "$env:LOCALAPPDATA\RamosPrintAgent\logs",
    [switch]$RemoveFiles,
    [switch]$KeepFiles
)

$ErrorActionPreference = 'Stop'

if ($RemoveFiles -and $KeepFiles) {
    Write-Host '-RemoveFiles ve -KeepFiles birlikte verilemez.' -ForegroundColor Red
    exit 1
}

$common = Join-Path $PSScriptRoot 'agent-common.ps1'
if (-not (Test-Path $common)) {
    Write-Host "agent-common.ps1 bulunamadı ($common). Betikleri scripts klasöründen birlikte çalıştırın." -ForegroundColor Red
    exit 1
}
. $common

$InstallDir = Get-RamosPath $InstallDir
$LogDir = Get-RamosPath $LogDir

# --- 1) Zamanlanmış Görev -----------------------------------------------------------------
$task = Get-ScheduledTask -TaskName 'RamosPrintAgent' -ErrorAction SilentlyContinue
$taskWasThere = [bool]$task
$taskWasRunning = $task -and $task.State -eq 'Running'
if ($task) {
    Unregister-ScheduledTask -TaskName 'RamosPrintAgent' -Confirm:$false
    Write-Host 'Zamanlanmış Görev kaldırıldı: RamosPrintAgent' -ForegroundColor Green
} else {
    Write-Host 'Zamanlanmış Görev zaten yok: RamosPrintAgent' -ForegroundColor Gray
}

# --- 2) Süreçler --------------------------------------------------------------------------
$stopped = Stop-RamosAgent -InstallDir $InstallDir -LogDir $LogDir

# I2: "0 süreç durduruldu" sessiz bir başarısızlık olabilir — görev kayıtlıydı/çalışıyordu ama
# hiçbir sürece ulaşamadıysak öksüz bir node kalmış olabilir: dosyaları silersek Supabase
# oturumuyla fiş basmaya devam eder ve teşhis edilemez. Bu yüzden yüksek sesle uyarıp
# dosya silmeyi ayrı bir onaya bağlarız.
$suspicious = $false
if ($stopped -eq 0 -and $taskWasThere) {
    $suspicious = $true
    Write-Host ''
    Write-Host 'UYARI: görev kayıtlıydı ama durdurulacak hiçbir ajan süreci bulunamadı.' -ForegroundColor Yellow
    if ($taskWasRunning) { Write-Host '       Görev durumu "Running" idi — öksüz bir node.exe kalmış olabilir.' -ForegroundColor Yellow }
    Write-Host '       Kontrol edin:' -ForegroundColor Yellow
    Write-Host '         Get-CimInstance Win32_Process -Filter "Name = ''node.exe''" | Select ProcessId, CommandLine' -ForegroundColor Yellow
    Write-Host '       Öksüz bir ajan fiş basmaya devam eder. Dosyalar silinirse iz de kalmaz.' -ForegroundColor Yellow
} else {
    Write-Host "Durdurulan süreç sayısı: $stopped" -ForegroundColor Gray
}

# --- 3) Kurulum klasörü -------------------------------------------------------------------
if (-not (Test-Path $InstallDir)) {
    Write-Host "Kurulum klasörü zaten yok: $InstallDir" -ForegroundColor Gray
    return
}

# I3(c): silme kapıları. `Remove-Item -Recurse` PowerShell 5.1'de bir junction/symlink'in
# HEDEFİNİ boşaltabilir, ve yanlış -InstallDir ile çağrılırsa ilgisiz bir klasörü siler.
# -RemoveFiles bu kapıları ATLAMAZ.
$marker = Join-Path $InstallDir 'ramos-agent.mjs'
if (-not (Test-Path $marker)) {
    Write-Host "Güvenlik: $InstallDir bir ajan kurulumuna benzemiyor (ramos-agent.mjs yok) — SİLİNMEDİ." -ForegroundColor Yellow
    return
}
$item = Get-Item $InstallDir -Force
if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    Write-Host "Güvenlik: $InstallDir bir junction/symlink (reparse point) — SİLİNMEDİ." -ForegroundColor Yellow
    Write-Host '         Hedef klasörün boşaltılmaması için bağlantıyı elle kaldırın.' -ForegroundColor Yellow
    return
}

$delete = $false
if ($suspicious) {
    # Şüpheli durumda -RemoveFiles tek başına yetmez: etkileşimsiz konakta Read-Host boş döner
    # ve klasör (dolayısıyla iz) korunur — güvenli taraf.
    Write-Host ''
    $delete = Read-RamosConfirm "Yine de $InstallDir silinsin mi? Öksüz ajan kalmadığından EMİNSENİZ (e/H)"
} elseif ($RemoveFiles) {
    $delete = $true
} elseif (-not $KeepFiles) {
    Write-Host ''
    Write-Host "Kurulum klasörü: $InstallDir"
    Write-Host 'İçinde ajan parolasını taşıyan .env ve günlükler var.'
    $delete = Read-RamosConfirm 'Klasör silinsin mi? (e/H)'
}

if ($delete) {
    Remove-Item -Recurse -Force $InstallDir
    Write-Host "Klasör silindi: $InstallDir" -ForegroundColor Green
    if (-not $LogDir.StartsWith($InstallDir, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path $LogDir)) {
        Write-Host "Not: günlük klasörü kurulum klasörünün dışında, bırakıldı: $LogDir" -ForegroundColor Gray
    }
} else {
    Write-Host "Klasör bırakıldı: $InstallDir" -ForegroundColor Gray
}

<#
.SYNOPSIS
    Yazıcı kurulum sihirbazının YÖNETİCİ olarak çalıştırdığı USB yardımcısı.

.DESCRIPTION
    -Islem ekle      : Sürücüsü kurulu olmayan USB fiş yazıcısı için, Windows'un kendi
                       "Generic / Text Only" sürücüsüyle bir yazıcı kuyruğu oluşturur (-PortName
                       USB001 gibi). Ajan fişleri RAW gönderdiği için sürücünün ne olduğu önemsizdir.
    -Islem cevrimici : Kuyruğun "Yazıcıyı çevrimdışı kullan" işaretini kaldırır.

    Sonuç çıkış koduyla (0 = başarılı) ve -LogFile dosyasıyla bildirilir; pencere gizli çalışır.
#>
param(
    [Parameter(Mandatory = $true)][ValidateSet('ekle', 'cevrimici')][string]$Islem,
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [string]$PortName,
    [string]$LogFile = "$env:TEMP\ramos-usb-kuyruk.log"
)

$ErrorActionPreference = 'Stop'
$lines = New-Object System.Collections.ArrayList
function Add-Log([string]$text) { [void]$lines.Add($text) }
function Save-Log { try { [IO.File]::WriteAllLines($LogFile, [string[]]$lines, (New-Object Text.UTF8Encoding $false)) } catch { } }

try {
    if ($Islem -eq 'ekle') {
        if (-not $PortName) { throw '-PortName gerekli' }
        if (Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue) {
            Add-Log "yazıcı zaten var: $PrinterName"
        } else {
            $driver = 'Generic / Text Only'
            if (-not (Get-PrinterDriver -Name $driver -ErrorAction SilentlyContinue)) {
                Add-PrinterDriver -Name $driver
                Add-Log "sürücü eklendi: $driver"
            }
            Add-Printer -Name $PrinterName -DriverName $driver -PortName $PortName
            Add-Log "yazıcı eklendi: $PrinterName ($PortName, $driver)"
        }
    } else {
        $printer = Get-CimInstance Win32_Printer -Filter ("Name = '" + $PrinterName.Replace("'", "''") + "'")
        if (-not $printer) { throw "yazıcı bulunamadı: $PrinterName" }
        Set-CimInstance -InputObject $printer -Property @{ WorkOffline = $false }
        Add-Log "çevrimdışı kullan kapatıldı: $PrinterName"
    }
    Save-Log
    exit 0
} catch {
    Add-Log "hata: $($_.Exception.Message)"
    Save-Log
    exit 1
}

<#
.SYNOPSIS
    Yazıcı kurulum sihirbazının YÖNETİCİ olarak çalıştırdığı yardımcı: bir ağ bağdaştırıcısına
    yazıcının ağından ikinci bir IPv4 adresi ekler ya da kaldırır ("köprü").

.DESCRIPTION
    Yazıcı sabit bir adreste (ör. 192.168.1.100) kalmış, bilgisayar ise başka bir ağda
    (ör. Fritz!Box 192.168.178.x) olduğunda, ikisi aynı modeme bağlı olsa da birbirini göremez.
    Bağdaştırıcıya yazıcının ağından bir adres (ör. 192.168.1.249/24) eklenince bilgisayar
    yazıcıya doğrudan ulaşır. Bağdaştırıcının kendi DHCP adresi ve internet bağlantısı yerinde
    kalır: Windows internet trafiği için ağ geçidiyle aynı ağdaki adresi seçer.

    DHCP açık bir bağdaştırıcıya sabit adres eklemek için önce `dhcpstaticipcoexistence`
    açılır. Adres kalıcı (persistent) eklenir: köprü modunda yeniden başlatmadan sonra da gerekir;
    geçici kullanımda sihirbaz iş bitince `kaldir` ile siler.

    Sonuç çıkış koduyla (0 = başarılı) ve -LogFile dosyasıyla bildirilir; bu pencere gizli çalışır.
#>
param(
    [Parameter(Mandatory = $true)][ValidateSet('ekle', 'kaldir')][string]$Islem,
    [Parameter(Mandatory = $true)][int]$InterfaceIndex,
    [Parameter(Mandatory = $true)][string]$Ip,
    [int]$PrefixLength = 24,
    [string]$LogFile = "$env:TEMP\ramos-ag-kopru.log"
)

$ErrorActionPreference = 'Continue'
$lines = New-Object System.Collections.ArrayList

function Add-Log([string]$text) { [void]$lines.Add($text) }
function Save-Log {
    try { [IO.File]::WriteAllLines($LogFile, [string[]]$lines, (New-Object Text.UTF8Encoding $false)) } catch { }
}
function Invoke-Netsh([string[]]$NetshArgs) {
    $out = (& netsh.exe @NetshArgs 2>&1 | Out-String).Trim()
    $code = $LASTEXITCODE
    Add-Log "netsh $($NetshArgs -join ' ') -> $code $out"
    return $code
}
function Test-AddressPresent {
    return (@(Get-NetIPAddress -InterfaceIndex $InterfaceIndex -IPAddress $Ip -AddressFamily IPv4 -ErrorAction SilentlyContinue).Count -gt 0)
}

$maskValue = [uint64]4294967295 - ([uint64][Math]::Pow(2, 32 - $PrefixLength) - 1)
$mask = '{0}.{1}.{2}.{3}' -f (($maskValue -shr 24) -band 255), (($maskValue -shr 16) -band 255), (($maskValue -shr 8) -band 255), ($maskValue -band 255)

if ($Islem -eq 'ekle') {
    if (Test-AddressPresent) {
        Add-Log "adres zaten var: $Ip"
        Save-Log
        exit 0
    }
    [void](Invoke-Netsh @('interface', 'ipv4', 'set', 'interface', "interface=$InterfaceIndex", 'dhcpstaticipcoexistence=enabled'))
    [void](Invoke-Netsh @('interface', 'ipv4', 'add', 'address', "name=$InterfaceIndex", "address=$Ip", "mask=$mask", 'store=persistent'))
    Start-Sleep -Seconds 2
    if (-not (Test-AddressPresent)) {
        # Bazı Windows sürümleri kalıcı kaydı hemen etkinleştirmez.
        [void](Invoke-Netsh @('interface', 'ipv4', 'add', 'address', "name=$InterfaceIndex", "address=$Ip", "mask=$mask", 'store=active'))
        Start-Sleep -Seconds 2
    }
    if (Test-AddressPresent) {
        Add-Log "eklendi: $Ip/$PrefixLength (bağdaştırıcı $InterfaceIndex)"
        Save-Log
        exit 0
    }
    Add-Log 'eklenemedi'
    Save-Log
    exit 1
}

# kaldir
[void](Invoke-Netsh @('interface', 'ipv4', 'delete', 'address', "name=$InterfaceIndex", "address=$Ip", 'store=persistent'))
if (Test-AddressPresent) {
    [void](Invoke-Netsh @('interface', 'ipv4', 'delete', 'address', "name=$InterfaceIndex", "address=$Ip", 'store=active'))
    Start-Sleep -Seconds 1
}
if (Test-AddressPresent) {
    Add-Log 'kaldırılamadı'
    Save-Log
    exit 1
}
Add-Log "kaldırıldı: $Ip"
Save-Log
exit 0

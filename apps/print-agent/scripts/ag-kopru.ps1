<#
.SYNOPSIS
    Yazıcı kurulum sihirbazının YÖNETİCİ olarak çalıştırdığı yardımcı: bir ağ bağdaştırıcısına
    başka ağlardan IPv4 adresleri ekler ya da kaldırır ("köprü").

.DESCRIPTION
    Yazıcı sabit bir adreste (ör. 192.168.1.100) kalmış, bilgisayar ise başka bir ağda
    (ör. Fritz!Box 192.168.178.x) olduğunda, ikisi aynı modeme bağlı olsa da birbirini göremez.
    Bağdaştırıcıya yazıcının ağından bir adres (ör. 192.168.1.249/24) eklenince bilgisayar
    yazıcıya doğrudan ulaşır. Bağdaştırıcının kendi DHCP adresi ve internet bağlantısı yerinde
    kalır: Windows internet trafiği için ağ geçidiyle aynı ağdaki adresi seçer.

    DHCP açık bir bağdaştırıcıya sabit adres eklemek için önce `dhcpstaticipcoexistence` açılır.

    Sıra: -Gecici (yalnız bu oturum; yeniden başlatınca kaybolur) → -Kalici (yeniden başlatmadan
    sonra da kalır) → -Kaldir. Listeler virgülle ayrılır. Hepsi tek bir yönetici izniyle yapılır.
    Sonuç çıkış koduyla (0 = istenen durum sağlandı) ve -LogFile dosyasıyla bildirilir.
#>
param(
    [Parameter(Mandatory = $true)][int]$InterfaceIndex,
    [string]$Gecici = '',
    [string]$Kalici = '',
    [string]$Kaldir = '',
    [int]$PrefixLength = 24,
    [string]$LogFile = "$env:TEMP\ramos-ag-kopru.log"
)

$ErrorActionPreference = 'Continue'
$log = New-Object System.Collections.ArrayList

function Add-Log([string]$text) { [void]$log.Add($text) }
function Save-Log {
    try { [IO.File]::WriteAllLines($LogFile, [string[]]$log, (New-Object Text.UTF8Encoding $false)) } catch { }
}
function Split-List([string]$text) {
    return @($text -split '[,; ]+' | Where-Object { $_ -match '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$' } | Select-Object -Unique)
}
function Invoke-Netsh([string[]]$NetshArgs) {
    $out = ((& netsh.exe @NetshArgs 2>&1 | Out-String) -replace '\s+', ' ').Trim()
    $code = $LASTEXITCODE
    Add-Log "netsh $($NetshArgs -join ' ') -> $code $out"
    return $code
}
function Test-Active([string]$ip) {
    return (@(Get-NetIPAddress -InterfaceIndex $InterfaceIndex -IPAddress $ip -AddressFamily IPv4 -PolicyStore ActiveStore -ErrorAction SilentlyContinue).Count -gt 0)
}
function Test-Persistent([string]$ip) {
    return (@(Get-NetIPAddress -InterfaceIndex $InterfaceIndex -IPAddress $ip -AddressFamily IPv4 -PolicyStore PersistentStore -ErrorAction SilentlyContinue).Count -gt 0)
}

$maskValue = [uint64]4294967295 - ([uint64][Math]::Pow(2, 32 - $PrefixLength) - 1)
$mask = '{0}.{1}.{2}.{3}' -f (($maskValue -shr 24) -band 255), (($maskValue -shr 16) -band 255), (($maskValue -shr 8) -band 255), ($maskValue -band 255)

$geciciList = Split-List $Gecici
$kaliciList = Split-List $Kalici
$kaldirList = Split-List $Kaldir
$ok = $true

if ($geciciList.Count -gt 0 -or $kaliciList.Count -gt 0) {
    [void](Invoke-Netsh @('interface', 'ipv4', 'set', 'interface', "interface=$InterfaceIndex", 'dhcpstaticipcoexistence=enabled'))
}

foreach ($ip in $geciciList) {
    if (-not (Test-Active $ip)) {
        [void](Invoke-Netsh @('interface', 'ipv4', 'add', 'address', "name=$InterfaceIndex", "address=$ip", "mask=$mask", 'store=active'))
    }
}

foreach ($ip in $kaliciList) {
    if (-not (Test-Persistent $ip)) {
        [void](Invoke-Netsh @('interface', 'ipv4', 'add', 'address', "name=$InterfaceIndex", "address=$ip", "mask=$mask", 'store=persistent'))
    }
    if (-not (Test-Persistent $ip)) {
        try {
            New-NetIPAddress -InterfaceIndex $InterfaceIndex -IPAddress $ip -PrefixLength $PrefixLength -PolicyStore PersistentStore -ErrorAction Stop | Out-Null
            Add-Log "New-NetIPAddress PersistentStore $ip -> tamam"
        } catch {
            Add-Log "New-NetIPAddress PersistentStore $ip -> $($_.Exception.Message)"
        }
    }
    if (-not (Test-Active $ip)) {
        [void](Invoke-Netsh @('interface', 'ipv4', 'add', 'address', "name=$InterfaceIndex", "address=$ip", "mask=$mask", 'store=active'))
    }
}

foreach ($ip in $kaldirList) {
    if (Test-Persistent $ip) { [void](Invoke-Netsh @('interface', 'ipv4', 'delete', 'address', "name=$InterfaceIndex", "address=$ip", 'store=persistent')) }
    if (Test-Active $ip) { [void](Invoke-Netsh @('interface', 'ipv4', 'delete', 'address', "name=$InterfaceIndex", "address=$ip", 'store=active')) }
}

# Yeni adresler "yinelenen adres denetimi"nden geçip kullanılabilir olana kadar bekle (en çok 10 sn).
$wanted = @($geciciList + $kaliciList)
$deadline = (Get-Date).AddSeconds(10)
while ($wanted.Count -gt 0 -and (Get-Date) -lt $deadline) {
    $pending = @($wanted | Where-Object {
            $a = Get-NetIPAddress -InterfaceIndex $InterfaceIndex -IPAddress $_ -AddressFamily IPv4 -PolicyStore ActiveStore -ErrorAction SilentlyContinue
            -not $a -or $a.AddressState -ne 'Preferred'
        })
    if ($pending.Count -eq 0) { break }
    Start-Sleep -Milliseconds 500
}

foreach ($ip in $geciciList) {
    if (-not (Test-Active $ip)) { $ok = $false; Add-Log "eklenemedi (geçici): $ip" } else { Add-Log "geçici eklendi: $ip" }
}
foreach ($ip in $kaliciList) {
    if (-not (Test-Active $ip) -or -not (Test-Persistent $ip)) { $ok = $false; Add-Log "kalıcı yapılamadı: $ip" } else { Add-Log "kalıcı: $ip" }
}
foreach ($ip in $kaldirList) {
    if ((Test-Active $ip) -or (Test-Persistent $ip)) { $ok = $false; Add-Log "kaldırılamadı: $ip" } else { Add-Log "kaldırıldı: $ip" }
}

Save-Log
if ($ok) { exit 0 } else { exit 1 }

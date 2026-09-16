<#
.SYNOPSIS
    Ramo's yazıcı kurulum sihirbazı: yazıcıyı bu bilgisayarın ağında bulur, gerekirse USB
    üzerinden yazıcıya bu ağdan bir IP adresi yazar, yazdırma ajanını kurar ve test fişi basar.

.DESCRIPTION
    Paket içinde `Kurulum.cmd` bu betiği çalıştırır. Adımlar:
      1) Node.js 22+ (yoksa winget ile kurulur)
      2) Bu PC'de çalışan eski ajan durdurulur, ajan hesabıyla siteye giriş denenir,
         başka bir bilgisayarda çalışan ajan varsa uyarılır
      3) Ağ taranır (TCP 9100 + ESC/POS durum cevabı)
      4) Bulunamazsa ve yazıcı USB ile bağlıysa ağda boş bir adres seçilip yazıcıya yazılır
      5) Adres bu PC'nin ajan ayarına (.env → PRINTER_HOST) yazılır
      6) Test fişi
      7) Prize takılıyken uyku / hazırda bekletme / kapak kapanınca uyku kapatılır (onayla)
      8) Ajan Zamanlanmış Görev olarak kurulur ve siteye bağlandığı doğrulanır

    Yerel PRINTER_HOST, sitedeki genel yazıcı ayarının önüne geçer: farklı ağlardaki
    bilgisayarlar kendi yazıcılarını kullanır. Aynı anda YALNIZ BİR bilgisayarda ajan açık olmalı.

.PARAMETER PrinterHost
    Taramayı atlar, bu adresi kullanır (ör. 192.168.1.250).

.PARAMETER ForceUsb
    Yazıcı ağda bulunsa bile USB ile IP yazma yolunu kullanır (ileri düzey).

.PARAMETER UsbIp
    USB yolunda otomatik seçim yerine yazıcıya bu adresi yazar (ileri düzey).

.PARAMETER Yes
    Soruları "evet" sayar (gözetimsiz çalıştırma / test).

.PARAMETER DryRun
    Hiçbir şeyi değiştirmez: tarar, ne yapılacağını gösterir; yazıcıya IP yazmaz, .env
    yazmaz, test fişi basmaz, ajanı kurmaz ve durdurmaz.
#>
param(
    [string]$InstallDir = "$env:LOCALAPPDATA\RamosPrintAgent",
    [string]$LogDir = "$env:LOCALAPPDATA\RamosPrintAgent\logs",
    [string]$PrinterHost,
    [switch]$ForceUsb,
    [string]$UsbIp,
    [switch]$SkipTestPrint,
    [switch]$Yes,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$common = Join-Path $PSScriptRoot 'agent-common.ps1'
if (-not (Test-Path $common)) {
    Write-Host "agent-common.ps1 bulunamadı ($common). Paketi eksiksiz açtığınızdan emin olun." -ForegroundColor Red
    exit 1
}
. $common

$InstallDir = Get-RamosPath $InstallDir
$LogDir = Get-RamosPath $LogDir
$PackageRoot = Get-RamosPath (Join-Path $PSScriptRoot '..')
$AgentFile = Join-Path $PackageRoot 'dist\ramos-agent.mjs'
$PackageEnv = Join-Path $PackageRoot '.env'
$TotalSteps = 8
$script:NodeExe = $null
$agentId = "ramos-$($env:COMPUTERNAME.ToLowerInvariant())"
# Paketteki .env bilerek AGENT_ID taşımaz (her bilgisayar kendi kimliğini alır). Sihirbazın
# çağırdığı node komutları için ortamdan verilir; Node'un .env yüklemesi var olan ortam
# değişkenini ezmez. Yalnız bu PowerShell sürecini ve çocuklarını etkiler.
$env:AGENT_ID = $agentId

# ------------------------------------------------------------------------------------------
# Yardımcılar
# ------------------------------------------------------------------------------------------

function Write-Step([int]$n, [string]$text) {
    Write-Host ''
    Write-Host "[$n/$TotalSteps] $text" -ForegroundColor Cyan
}
function Write-Ok([string]$text) { Write-Host "  [tamam] $text" -ForegroundColor Green }
function Write-Info([string]$text) { Write-Host "  $text" -ForegroundColor Gray }
function Write-Warn([string]$text) { Write-Host "  [dikkat] $text" -ForegroundColor Yellow }
function Stop-Wizard([string]$text) {
    Write-Host ''
    Write-Host "KURULUM DURDU: $text" -ForegroundColor Red
    exit 1
}

# Varsayılanı "evet" olan soru (Enter = evet). -Yes verilmişse sormaz; etkileşimsiz
# konakta Read-Host fırlatırsa "hayır" sayılır (güvenli yön).
function Confirm-Yes([string]$prompt) {
    if ($Yes) { Write-Info "$prompt -> evet (-Yes)"; return $true }
    try { $a = Read-Host "  $prompt (E/h)" } catch { return $false }
    return ($a -eq '' -or $a -match '^[eEyY]')
}

# Node'u çalıştırır. PS 5.1'de yerel komutun stderr çıktısı ErrorActionPreference=Stop ile
# istisnaya dönüşmesin diye bu blokta Continue kullanılır. Çıkış kodu ve satırlar döner.
function Invoke-Agent([string[]]$AgentArgs, [string]$WorkDir = $PackageRoot) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location $WorkDir
    try {
        $lines = @(& $script:NodeExe $AgentFile @AgentArgs 2>&1 | ForEach-Object { "$_" })
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
        $ErrorActionPreference = $prev
    }
    return [pscustomobject]@{ Code = $code; Lines = $lines; Text = ($lines -join "`n") }
}

# Ajanın JSON çıktısını okur: `find-printer`/`site-status` tek satır, `status` çok satırlı
# (girintili) yazar. Önce tek satırlık JSON'lar sondan başa denenir, olmazsa ilk `{`/`[` ile
# başlayan satırdan sona kadar olan blok.
function ConvertFrom-AgentJson($result) {
    if (-not $result) { return $null }
    $lines = @($result.Lines)
    for ($i = $lines.Count - 1; $i -ge 0; $i--) {
        if ($lines[$i] -match '^\s*[\{\[].*[\}\]]\s*$') {
            try { return $lines[$i] | ConvertFrom-Json } catch { }
        }
    }
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^\s*[\{\[]\s*$') {
            try { return ($lines[$i..($lines.Count - 1)] -join "`n") | ConvertFrom-Json } catch { return $null }
        }
    }
    return $null
}

function Get-NodeMajor {
    $v = $null
    try { $v = @(& node -v 2>$null) | Where-Object { $_ -match '^v\d+' } | Select-Object -First 1 } catch { $v = $null }
    if ($v -match '^v(\d+)') { return [int]$Matches[1] }
    return 0
}

function Read-EnvLines([string]$path) {
    if (-not (Test-Path $path)) { return @() }
    return @(Get-Content -Path $path -Encoding UTF8)
}

function Get-EnvValue([string[]]$lines, [string]$key) {
    $line = $lines | Where-Object { $_ -match "^\s*$key\s*=" } | Select-Object -First 1
    if (-not $line) { return '' }
    return ($line -replace "^\s*$key\s*=\s*", '').Trim()
}

function ConvertTo-IpInt([string]$ip) {
    $b = ([Net.IPAddress]::Parse($ip)).GetAddressBytes()
    return [uint32](([uint64]$b[0] * 16777216) + ([uint64]$b[1] * 65536) + ([uint64]$b[2] * 256) + [uint64]$b[3])
}
function ConvertFrom-IpInt([uint64]$n) {
    return '{0}.{1}.{2}.{3}' -f (($n -shr 24) -band 255), (($n -shr 16) -band 255), (($n -shr 8) -band 255), ($n -band 255)
}

# Ağdaki bir adres boş mu: ping cevabı yok VE ARP tablosunda canlı bir kaydı yok.
function Test-IpFree([string]$ip) {
    if (Test-Connection -ComputerName $ip -Count 1 -Quiet -ErrorAction SilentlyContinue) { return $false }
    $n = Get-NetNeighbor -IPAddress $ip -ErrorAction SilentlyContinue |
        Where-Object { $_.State -in @('Reachable', 'Stale', 'Delay', 'Probe', 'Permanent') }
    return -not $n
}

# Yazıcı için adres adayları: PC'nin /24'ünde .250'den aşağı (ev/işyeri modemlerinin DHCP
# havuzu genelde bu aralığın altında biter; Fritz!Box varsayılanı .20–.200). Ağ /24'ten
# darsa alt ağın içindeki en yüksek adresler.
function Get-IpCandidates([string]$address, [int]$prefix, [string]$gateway) {
    $effective = [Math]::Max($prefix, 24)
    $self = [uint64](ConvertTo-IpInt $address)
    $size = [uint64][Math]::Pow(2, 32 - $effective)
    $network = $self - ($self % $size)
    $broadcast = $network + $size - 1
    $gw = if ($gateway) { [uint64](ConvertTo-IpInt $gateway) } else { [uint64]0 }
    $top = [Math]::Min($network + 250, $broadcast - 1)
    $out = New-Object System.Collections.ArrayList
    for ($n = [uint64]$top; $n -gt $network -and $out.Count -lt 30; $n--) {
        if ($n -eq $self -or $n -eq $gw) { continue }
        [void]$out.Add((ConvertFrom-IpInt $n))
    }
    return $out
}

function Add-RawPrinterType {
    if ('RamosRawPrinter' -as [type]) { return }
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class RamosRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);
  public static int Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("OpenPrinter hata " + Marshal.GetLastWin32Error());
    try {
      DOCINFO di = new DOCINFO();
      di.pDocName = "Ramos yazici IP"; di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) throw new Exception("StartDocPrinter hata " + Marshal.GetLastWin32Error());
      StartPagePrinter(h);
      int w; bool ok = WritePrinter(h, data, data.Length, out w);
      EndPagePrinter(h); EndDocPrinter(h);
      if (!ok) throw new Exception("WritePrinter hata " + Marshal.GetLastWin32Error());
      return w;
    } finally { ClosePrinter(h); }
  }
}
"@
}

# Xprinter (XP-80 / XP-Q80A) IP ayarlama komutu: 1F 1B 1F 91 00 49 50 + 4 bayt adres.
function Send-PrinterIp([string]$printerName, [string]$ip) {
    Add-RawPrinterType
    $octets = ([Net.IPAddress]::Parse($ip)).GetAddressBytes()
    $bytes = [byte[]](@(0x1F, 0x1B, 0x1F, 0x91, 0x00, 0x49, 0x50) + $octets)
    return [RamosRawPrinter]::Send($printerName, $bytes)
}

# ---- Güç ayarları (powercfg) ----
# Kapak ayarı masaüstü bilgisayarlarda yoktur ve LIDACTION kısa adı her makinede listelenmez;
# bu yüzden tam kimlikler kullanılır.
$SubButtons = '4f971e89-eebd-4455-a8de-9e59040e7347'
$LidAction = '5ca83367-6e45-459f-a27b-476b1d01c936'

function Invoke-PowerCfg([string[]]$PowerArgs) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & powercfg @PowerArgs 2>&1 | Out-Null
        return ($LASTEXITCODE -eq 0)
    } finally {
        $ErrorActionPreference = $prev
    }
}

# Etkin güç planındaki bir ayarın "prize takılı" (AC) değeri; okunamazsa $null.
# `powercfg /query` çıktısı Windows diline göre değişir ama sayılar hep 0x........ biçimindedir
# ve son iki onaltılık değer sırasıyla AC ve DC (pil) değerleridir.
function Get-PowerAcValue([string]$sub, [string]$setting) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = @(& powercfg /query SCHEME_CURRENT $sub $setting 2>&1 | ForEach-Object { "$_" })
        if ($LASTEXITCODE -ne 0) { return $null }
    } finally {
        $ErrorActionPreference = $prev
    }
    $hex = @([regex]::Matches(($out -join "`n"), '0x[0-9a-fA-F]{8}') | ForEach-Object { $_.Value })
    if ($hex.Count -lt 2) { return $null }
    return [Convert]::ToInt64($hex[$hex.Count - 2], 16)
}

function Write-SleepManualHelp {
    Write-Host '   Elle ayarlamak için:'
    Write-Host '   - Ayarlar > Sistem > Güç (ve pil) > Ekran ve uyku > prize takılıyken uyku: Hiçbir zaman'
    Write-Host '   - Dizüstünde: Denetim Masası > Güç Seçenekleri > Kapağı kapatınca > Prize takılı: Hiçbir şey yapma'
}

# Adreste ESC/POS yazıcı cevap veriyor mu (`status --host`, giriş gerektirmez).
function Test-PrinterAt([string]$ip) {
    $r = Invoke-Agent @('status', '--host', $ip)
    if ($r.Code -ne 0) { return $false }
    $state = ConvertFrom-AgentJson $r
    return ($null -ne $state -and $state.known)
}

function Wait-PrinterAt([string]$ip, [int]$seconds) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PrinterAt $ip) { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

# ------------------------------------------------------------------------------------------
Write-Host ''
Write-Host "Ramo's Yazıcı Kurulumu" -ForegroundColor White
$modeNote = if ($DryRun) { '   (DENEME MODU: hiçbir şey değiştirilmeyecek)' } else { '' }
Write-Host "Bilgisayar: $env:COMPUTERNAME$modeNote" -ForegroundColor Gray

if (-not (Test-Path $AgentFile)) { Stop-Wizard "Ajan dosyası yok: $AgentFile. Paketi eksiksiz açın." }
if (-not (Test-Path $PackageEnv)) { Stop-Wizard "Ayar dosyası yok: $PackageEnv. Paketi eksiksiz açın." }

# ------------------------------------------------------------------------------------------
Write-Step 1 'Node.js kontrol ediliyor'
if ((Get-NodeMajor) -lt 22) {
    if ($DryRun) { Stop-Wizard 'Node.js 22+ yok (deneme modunda kurulmaz).' }
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Info 'Node.js bulunamadı, kuruluyor. Windows izin isterse "Evet" deyin...'
        $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        & winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
        $ErrorActionPreference = $prev
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    }
    if ((Get-NodeMajor) -lt 22) {
        Write-Warn 'Node.js otomatik kurulamadı. Açılan sayfadan "LTS" sürümünü indirip kurun, sonra Kurulum.cmd dosyasını tekrar çalıştırın.'
        Start-Process 'https://nodejs.org/tr/download'
        Stop-Wizard 'Node.js gerekli.'
    }
}
$script:NodeExe = (Get-Command node).Source
Write-Ok "Node.js $(& node -v)"

# ------------------------------------------------------------------------------------------
Write-Step 2 'Bu bilgisayardaki eski ajan ve site bağlantısı kontrol ediliyor'

if (-not $DryRun) {
    $task = Get-ScheduledTask -TaskName 'RamosPrintAgent' -ErrorAction SilentlyContinue
    if ($task) {
        try { Stop-ScheduledTask -TaskName 'RamosPrintAgent' -ErrorAction Stop } catch { }
    }
    $stopped = Stop-RamosAgent -InstallDir $InstallDir -LogDir $LogDir
    if ($stopped -gt 0) { Write-Ok "Eski ajan durduruldu ($stopped süreç), yazıcı tarama için serbest."; Start-Sleep -Seconds 1 }
}

# Kurulum klasörü dışında çalışan başka bir ajan (ör. geliştirici kopyası) yazıcıyı ve kilidi tutar.
$installPattern = Get-RamosLikePattern (Join-Path $InstallDir 'ramos-agent.mjs')
$foreign = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { ($_.CommandLine -like '*ramos-agent.mjs*run*' -or $_.CommandLine -like '*print-agent*cli.ts*run*') -and $_.CommandLine -notlike $installPattern })
if ($foreign.Count -gt 0) {
    foreach ($p in $foreign) { Write-Warn "Başka bir klasörden çalışan ajan var (pid $($p.ProcessId)): $($p.CommandLine)" }
    if ($DryRun) {
        Write-Info 'Deneme modu: durdurulmadı.'
    } elseif (Confirm-Yes 'Kurulumdan önce bu ajan durdurulsun mu?') {
        foreach ($p in $foreign) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 1
        Write-Ok 'Durduruldu.'
    } else {
        Write-Warn 'Durdurulmadı: iki ajan aynı yazıcıya bağlanmaya çalışabilir.'
    }
}

$site = Invoke-Agent @('site-status')
$siteInfo = ConvertFrom-AgentJson $site
if ($site.Code -ne 0 -or -not $siteInfo) {
    Write-Host $site.Text -ForegroundColor Red
    Stop-Wizard 'Siteye bağlanılamadı. İnternet bağlantısını kontrol edin; sorun sürerse paketteki ayar dosyası (.env) hatalı olabilir.'
}
Write-Ok 'Siteye yazıcı hesabıyla bağlanıldı.'

$last = $siteInfo.lastAgent
if ($last -and $last.host -and ($last.host -ne $env:COMPUTERNAME) -and ($null -ne $last.seconds_ago) -and ($last.seconds_ago -lt 120)) {
    Write-Warn "Başka bir bilgisayarda ($($last.host)) ajan $($last.seconds_ago) sn önce çalışıyordu."
    Write-Warn 'Aynı anda iki ajan açık olursa siparişler hangisine düşerse orada basılır.'
    Write-Warn 'Önce o bilgisayarda Kaldir.cmd çalıştırın ya da bilgisayarı kapatın.'
    if (-not (Confirm-Yes 'Yine de devam edilsin mi?')) { Stop-Wizard 'Diğer bilgisayardaki ajan kapatılınca tekrar çalıştırın.' }
}

# ------------------------------------------------------------------------------------------
Write-Step 3 'Yazıcı ağda aranıyor (birkaç saniye sürer)'

$existingEnv = Read-EnvLines (Join-Path $InstallDir '.env')
$previousHost = Get-EnvValue $existingEnv 'PRINTER_HOST'
$extra = @($previousHost, $siteInfo.sitePrinterHost) | Where-Object { $_ } | Select-Object -Unique

$chosenHost = $null
if ($PrinterHost) {
    Write-Info "Adres verildi: $PrinterHost"
    if (Test-PrinterAt $PrinterHost) { $chosenHost = $PrinterHost; Write-Ok "Yazıcı $PrinterHost adresinde cevap veriyor." }
    else { Stop-Wizard "$PrinterHost adresinde yazıcı cevap vermiyor." }
}

$scan = Invoke-Agent @('find-printer', '--json', '--extra', (@($extra) -join ','))
$found = ConvertFrom-AgentJson $scan
if ($scan.Code -ne 0 -or -not $found) {
    Write-Host $scan.Text -ForegroundColor Red
    Stop-Wizard 'Ağ taraması çalışmadı.'
}
$networks = @($found.networks)
if ($networks.Count -eq 0) { Stop-Wizard 'Bilgisayar bir yerel ağa (modem) bağlı görünmüyor. Kablo ya da Wi-Fi bağlantısını kontrol edin.' }
Write-Info ('Ağ: ' + (($networks | ForEach-Object { "$($_.name) $($_.address)/$($_.prefix)" }) -join ', '))

if (-not $chosenHost -and -not $ForceUsb) {
    $escpos = @($found.printers | Where-Object { $_.escpos })
    $other = @($found.printers | Where-Object { -not $_.escpos })
    if ($escpos.Count -eq 1) {
        $chosenHost = $escpos[0].host
        Write-Ok "Yazıcı bulundu: $chosenHost"
    } elseif ($escpos.Count -gt 1) {
        Write-Info 'Birden fazla fiş yazıcısı bulundu:'
        for ($i = 0; $i -lt $escpos.Count; $i++) { Write-Host "    $($i + 1)) $($escpos[$i].host)" }
        if ($Yes) {
            $chosenHost = $escpos[0].host
            Write-Info "İlki seçildi: $chosenHost (-Yes)"
        } else {
            $pick = Read-Host '  Mutfak yazıcısının numarası'
            if ($pick -match '^\d+$' -and [int]$pick -ge 1 -and [int]$pick -le $escpos.Count) { $chosenHost = $escpos[[int]$pick - 1].host }
            else { Stop-Wizard 'Geçerli bir numara seçilmedi.' }
        }
        Write-Ok "Seçilen yazıcı: $chosenHost"
    } else {
        Write-Warn 'Ağda fiş yazıcısı bulunamadı.'
        if ($other.Count -gt 0) {
            Write-Info ('Port 9100 açık ama yazıcı cevabı vermeyen cihazlar: ' + (($other | ForEach-Object { $_.host }) -join ', '))
        }
    }
}

# ------------------------------------------------------------------------------------------
Write-Step 4 'Yazıcı adresi bu ağa uygun mu'

if ($chosenHost) {
    Write-Ok "Değişiklik gerekmiyor, yazıcı zaten bu ağda: $chosenHost"
} else {
    $usb = @(Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.PortName -match '^USB' })
    $usbPreferred = @($usb | Where-Object { $_.Name -match 'XP|Xprinter|POS|Receipt|Thermal|80' -or $_.DriverName -match 'XP|Xprinter|POS|Receipt|Thermal|80' })
    if ($usbPreferred.Count -gt 0) { $usb = $usbPreferred }

    if ($usb.Count -eq 0) {
        Write-Warn 'Yazıcı ağda yok ve USB ile bağlı bir yazıcı da görünmüyor.'
        Write-Host ''
        Write-Host '  Şunları kontrol edin:' -ForegroundColor White
        Write-Host '   1) Yazıcı açık mı, ethernet kablosu MODEME takılı mı (ışıkları yanıyor mu)?'
        Write-Host '   2) Yazıcı başka bir ağın adresinde kalmış olabilir. Yazıcıyı USB kablosuyla bu'
        Write-Host '      bilgisayara takın (Windows yazıcıyı tanımalı), sonra Kurulum.cmd dosyasını'
        Write-Host '      tekrar çalıştırın. Sihirbaz yazıcıya bu ağdan bir adres yazacak.'
        Stop-Wizard 'Yazıcıya ulaşılamadı.'
    }

    $usbPrinter = $usb[0]
    if ($usb.Count -gt 1 -and -not $Yes) {
        Write-Info 'USB ile bağlı birden fazla yazıcı var:'
        for ($i = 0; $i -lt $usb.Count; $i++) { Write-Host "    $($i + 1)) $($usb[$i].Name)" }
        $pick = Read-Host '  Fiş yazıcısının numarası'
        if ($pick -match '^\d+$' -and [int]$pick -ge 1 -and [int]$pick -le $usb.Count) { $usbPrinter = $usb[[int]$pick - 1] }
        else { Stop-Wizard 'Geçerli bir numara seçilmedi.' }
    }
    Write-Ok "USB yazıcı: $($usbPrinter.Name) ($($usbPrinter.PortName))"

    # Hangi ağ: varsayılan ağ geçidi (modem) olan arayüz öncelikli.
    $gwConfigs = @(Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' })
    $net = $null
    $gateway = $null
    foreach ($n in $networks) {
        $cfg = $gwConfigs | Where-Object { @($_.IPv4Address.IPAddress) -contains $n.address } | Select-Object -First 1
        if ($cfg) { $net = $n; $gateway = @($cfg.IPv4DefaultGateway.NextHop)[0]; break }
    }
    if (-not $net) { $net = $networks[0] }
    if ($net.prefix -lt 24) {
        Write-Warn "Ağ /$($net.prefix): yazıcının alt ağ maskesi genelde 255.255.255.0 olduğu için yazıcıya yalnız $($net.address) ile aynı /24'teki cihazlar erişebilir."
    }

    $newIp = $null
    if ($UsbIp) {
        $newIp = $UsbIp
        Write-Info "Adres verildi: $newIp"
    } else {
        Write-Info 'Ağda boş bir adres aranıyor...'
        foreach ($candidate in (Get-IpCandidates $net.address $net.prefix $gateway)) {
            if (Test-IpFree $candidate) { $newIp = $candidate; break }
            Write-Info "$candidate kullanımda, sonraki deneniyor"
        }
        if (-not $newIp) { Stop-Wizard 'Ağda yazıcı için boş adres bulunamadı.' }
    }

    $gwNote = if ($gateway) { ", modem $gateway" } else { '' }
    Write-Host ''
    Write-Host "  Yazıcıya şu adres yazılacak: $newIp  (ağ: $($net.address)/$($net.prefix)$gwNote)" -ForegroundColor White
    if ($DryRun) {
        Write-Info 'Deneme modu: yazıcıya gönderilmedi.'
        $chosenHost = $newIp
    } else {
        if (-not (Confirm-Yes 'Devam edilsin mi?')) { Stop-Wizard 'Kullanıcı iptal etti.' }
        try {
            $written = Send-PrinterIp $usbPrinter.Name $newIp
            Write-Ok "Komut USB ile gönderildi ($written bayt). Yazıcı bip sesi verebilir."
        } catch {
            Stop-Wizard "USB ile gönderilemedi: $($_.Exception.Message)"
        }
        Write-Info "Yazıcının yeni adreste cevap vermesi bekleniyor ($newIp)..."
        if (-not (Wait-PrinterAt $newIp 25)) {
            Write-Host ''
            Write-Host '  Yazıcıyı KAPATIP 5 saniye sonra tekrar AÇIN (yeni adres yeniden başlatınca geçerli olur).' -ForegroundColor White
            if (-not $Yes) { try { [void](Read-Host '  Açtıktan sonra Enter tuşuna basın') } catch { } }
            if (-not (Wait-PrinterAt $newIp 60)) {
                Write-Warn 'Yazıcı yeni adreste cevap vermedi.'
                Write-Host '   - Ethernet kablosu modeme takılı mı?'
                Write-Host '   - Yazıcı kapalıyken FEED tuşuna basılı tutup açarak ayar fişi basın; fişteki IP adresi'
                Write-Host "     $newIp mi? Değilse Kurulum.cmd dosyasını tekrar çalıştırın."
                Stop-Wizard 'Yazıcı adresi doğrulanamadı.'
            }
        }
        $chosenHost = $newIp
        Write-Ok "Yazıcı artık bu ağda: $chosenHost"
    }
}

# ------------------------------------------------------------------------------------------
Write-Step 5 'Adres bu bilgisayarın ajan ayarına yazılıyor'

$envTarget = Join-Path $InstallDir '.env'
if ($existingEnv.Count -gt 0) {
    $lines = @($existingEnv | Where-Object { $_ -notmatch '^\s*(PRINTER_HOST|PRINTER_PORT)\s*=' })
    if (-not (Get-EnvValue $lines 'AGENT_ID')) { $lines += "AGENT_ID=$agentId" }
} else {
    $lines = @(Read-EnvLines $PackageEnv | Where-Object { $_ -notmatch '^\s*(AGENT_ID|LOG_DIR|PRINTER_HOST|PRINTER_PORT)\s*=' })
    $lines += "AGENT_ID=$agentId"
}
# Paketteki hesap bilgileri eski kurulumdakinin yerine geçer (ör. parola sonradan değiştiyse).
$packageLines = Read-EnvLines $PackageEnv
foreach ($key in @('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'AGENT_EMAIL', 'AGENT_PASSWORD')) {
    $v = Get-EnvValue $packageLines $key
    if ($v) {
        $lines = @($lines | Where-Object { $_ -notmatch "^\s*$key\s*=" })
        $lines += "$key=$v"
    }
}
$lines += "PRINTER_HOST=$chosenHost"

if ($DryRun) {
    Write-Info "Deneme modu: $envTarget yazılmadı (PRINTER_HOST=$chosenHost, AGENT_ID=$(Get-EnvValue $lines 'AGENT_ID'))."
} else {
    New-Item -ItemType Directory -Force $InstallDir | Out-Null
    Set-RamosTextFile -Path $envTarget -Lines $lines
    Write-Ok "PRINTER_HOST=$chosenHost -> $envTarget"
}

# ------------------------------------------------------------------------------------------
Write-Step 6 'Test fişi'

if ($DryRun -or $SkipTestPrint) {
    Write-Info 'Atlandı.'
} else {
    $tp = Invoke-Agent @('test-print') $InstallDir
    if ($tp.Code -ne 0) {
        Write-Host $tp.Text -ForegroundColor Red
        Write-Warn 'Test fişi gönderilemedi.'
        if (-not (Confirm-Yes 'Yine de kuruluma devam edilsin mi?')) { Stop-Wizard 'Test fişi basılamadı.' }
    } else {
        Write-Ok 'Test fişi gönderildi.'
        if (-not $Yes) {
            if (-not (Confirm-Yes 'Yazıcıdan "TESTDRUCK" fişi çıktı mı ve Türkçe/Almanca harfler düzgün mü?')) {
                Write-Warn 'Fiş boş çıktıysa kağıt ters takılmış olabilir (termal yüz dışa bakmalı). Kapak kapalı mı?'
                if (-not (Confirm-Yes 'Yine de kuruluma devam edilsin mi?')) { Stop-Wizard 'Test fişi sorunu giderilince tekrar çalıştırın.' }
            }
        }
    }
}

# ------------------------------------------------------------------------------------------
Write-Step 7 'Bilgisayarın uyku ayarı'

$hasBattery = [bool](Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue)
$standby = Get-PowerAcValue 'SUB_SLEEP' 'STANDBYIDLE'
$hibernate = Get-PowerAcValue 'SUB_SLEEP' 'HIBERNATEIDLE'
$lid = if ($hasBattery) { Get-PowerAcValue $SubButtons $LidAction } else { $null }

$needs = @()
if ($null -ne $standby -and $standby -ne 0) { $needs += "uyku ($([Math]::Round($standby / 60)) dk sonra)" }
if ($null -ne $hibernate -and $hibernate -ne 0) { $needs += "hazırda bekletme ($([Math]::Round($hibernate / 60)) dk sonra)" }
if ($null -ne $lid -and $lid -ne 0) { $needs += 'kapak kapanınca uyku' }

if ($null -eq $standby) {
    Write-Warn 'Uyku ayarı okunamadı; elle kontrol edin.'
    Write-SleepManualHelp
} elseif ($needs.Count -eq 0) {
    Write-Ok 'Prize takılıyken bilgisayar uykuya geçmiyor, değişiklik gerekmiyor.'
} else {
    Write-Info ('Prize takılıyken açık olanlar: ' + ($needs -join ', '))
    Write-Info 'Bilgisayar uykuya geçerse fişler basılmaz.'
    if ($DryRun) {
        Write-Info 'Deneme modu: değiştirilmedi.'
    } elseif (Confirm-Yes 'Prize takılıyken bunlar kapatılsın mı? (pil ayarlarına ve ekranın kapanmasına dokunulmaz)') {
        $failed = @()
        if ($null -ne $standby -and $standby -ne 0 -and -not (Invoke-PowerCfg @('/change', 'standby-timeout-ac', '0'))) { $failed += 'uyku' }
        if ($null -ne $hibernate -and $hibernate -ne 0 -and -not (Invoke-PowerCfg @('/change', 'hibernate-timeout-ac', '0'))) { $failed += 'hazırda bekletme' }
        if ($null -ne $lid -and $lid -ne 0) {
            $lidOk = (Invoke-PowerCfg @('/setacvalueindex', 'SCHEME_CURRENT', $SubButtons, $LidAction, '0')) -and (Invoke-PowerCfg @('/setactive', 'SCHEME_CURRENT'))
            if (-not $lidOk) { $failed += 'kapak' }
        }
        # Sonucu yeniden okuyarak doğrula: komutun başarı kodu yetmez.
        $stillOn = @()
        if ((Get-PowerAcValue 'SUB_SLEEP' 'STANDBYIDLE') -ne 0) { $stillOn += 'uyku' }
        $h2 = Get-PowerAcValue 'SUB_SLEEP' 'HIBERNATEIDLE'
        if ($null -ne $h2 -and $h2 -ne 0) { $stillOn += 'hazırda bekletme' }
        if ($null -ne $lid) {
            $l2 = Get-PowerAcValue $SubButtons $LidAction
            if ($null -ne $l2 -and $l2 -ne 0) { $stillOn += 'kapak' }
        }
        if ($failed.Count -eq 0 -and $stillOn.Count -eq 0) {
            Write-Ok 'Prize takılıyken uyku kapatıldı.'
        } else {
            Write-Warn ('Değiştirilemedi: ' + ((@($failed) + @($stillOn) | Select-Object -Unique) -join ', ') + ' (yönetici izni gerekebilir).')
            Write-SleepManualHelp
        }
    } else {
        Write-Warn 'Değiştirilmedi. Bilgisayar uykuya geçerse fişler basılmaz.'
        Write-SleepManualHelp
    }
}
if ($hasBattery) {
    Write-Warn 'Bu bir dizüstü bilgisayar: prize takılı kalmalı. Pildeyken uyku ayarına dokunulmadı.'
}

# ------------------------------------------------------------------------------------------
Write-Step 8 'Yazdırma ajanı kuruluyor'

if ($DryRun) {
    Write-Info 'Deneme modu: ajan kurulmadı.'
    Write-Host ''
    Write-Host "DENEME BİTTİ. Yazıcı: $chosenHost" -ForegroundColor Green
    exit 0
}

& (Join-Path $PSScriptRoot 'install-agent.ps1') -InstallDir $InstallDir -LogDir $LogDir
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { Stop-Wizard 'Ajan kurulamadı (yukarıdaki mesaja bakın).' }

Write-Info 'Ajanın siteye bağlanması bekleniyor...'
$connected = $false
$a = $null
$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    $st = ConvertFrom-AgentJson (Invoke-Agent @('site-status') $InstallDir)
    $a = if ($st) { $st.lastAgent } else { $null }
    if ($a -and $a.host -eq $env:COMPUTERNAME -and $null -ne $a.seconds_ago -and $a.seconds_ago -lt 20) {
        $connected = $true
        break
    }
}

Write-Host ''
if ($connected -and $a.printer_reachable) {
    Write-Host '==========================================================' -ForegroundColor Green
    Write-Host ' KURULUM TAMAM' -ForegroundColor Green
    Write-Host "  Yazıcı adresi : $chosenHost" -ForegroundColor Green
    Write-Host "  Bu bilgisayar : $env:COMPUTERNAME (siteye bağlı, yazıcıya erişiyor)" -ForegroundColor Green
    Write-Host '  Bilgisayar açıldığında ajan kendiliğinden başlar.' -ForegroundColor Green
    Write-Host '  Kaldırmak için: Kaldir.cmd' -ForegroundColor Green
    Write-Host '==========================================================' -ForegroundColor Green
} elseif ($connected) {
    Write-Warn "Ajan siteye bağlandı ama yazıcıya erişemediğini bildiriyor ($chosenHost). Yazıcı açık ve kablosu takılı mı?"
    exit 1
} else {
    Write-Warn 'Ajan kuruldu ama 45 sn içinde siteye bağlandığı görülmedi.'
    Write-Info "Günlükler: $LogDir ve $InstallDir\logs"
    exit 1
}

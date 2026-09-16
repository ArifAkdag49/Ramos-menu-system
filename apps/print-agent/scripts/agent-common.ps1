<#
.SYNOPSIS
    install-agent.ps1 ve uninstall-agent.ps1'in ortak yardımcıları (dot-source edilir).

.DESCRIPTION
    "Hangi süreçler bizim ajanımız?" kararı TEK yerde durur: iki betik farklı cevap verirse
    kaldırma öksüz bir ajan bırakabilir (görev ve dosyalar silinmiş ama node hâlâ Supabase
    oturumuyla fiş basıyor ve teşhis edilemiyor).
#>

# Kurulum klasörünü tek bir kanonik yazıma indirger: "C:/Ramos", "C:\Ramos\" ve "C:\ramos"
# aynı dizeye dönüşür. R82(a): `run-agent.cmd` içindeki `%~dp0` Windows tarafından
# normalize edilmiş bir yol üretir; ham parametreyle desen eşleştirmek sessizce ıskalar.
function Get-RamosPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

# `-like` desenlerinde yolun kendisi joker karakter içerebilir: "C:\Ramos [test]" gibi bir
# klasör adı hiçbir şeyle eşleşmezdi (M6).
function Get-RamosLikePattern {
    param([Parameter(Mandatory = $true)][string]$Literal)
    return '*' + [System.Management.Automation.WildcardPattern]::Escape($Literal) + '*'
}

# `.env` gibi Node'un okuyacağı dosyalar BOM'SUZ UTF-8 olmalıdır.
# PowerShell 5.1'de `Set-Content -Encoding utf8` BOM YAZAR; `process.loadEnvFile` BOM'u ilk
# anahtarın parçası sayar ("﻿SUPABASE_URL") ve ajan "Eksik ortam değişkenleri" ile
# açılışta çöker. (Bu gerçekten oldu — Görev 20 inceleme turu 1.)
function Set-RamosTextFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Lines
    )
    [IO.File]::WriteAllLines($Path, $Lines, (New-Object Text.UTF8Encoding $false))
}

# Etkileşimsiz konakta (Zamanlanmış Görev, betikten çağırma, -NonInteractive) `Read-Host`
# fırlatır; onu "hayır" sayarız — yıkıcı adımlar için güvenli yön.
function Read-RamosConfirm {
    param([Parameter(Mandatory = $true)][string]$Prompt)
    try {
        $answer = Read-Host $Prompt
    } catch {
        Write-Host '  (etkileşimsiz oturum — onay alınamadı, "hayır" sayıldı)' -ForegroundColor Gray
        return $false
    }
    return ($answer -eq 'e' -or $answer -eq 'E')
}

function Get-RamosLockPid {
    param([Parameter(Mandatory = $true)][string]$LogDir)
    $lockFile = Join-Path $LogDir 'agent.lock'
    if (-not (Test-Path $lockFile)) { return $null }
    try {
        $info = Get-Content $lockFile -Raw | ConvertFrom-Json
        if ($info.pid -is [int] -or $info.pid -is [long] -or $info.pid -is [double]) { return [int]$info.pid }
    } catch {
        # Kilit dosyası yarım yazılmış ya da bozuk olabilir; desen eşleştirmesi yedek yoldur.
    }
    return $null
}

<#
.SYNOPSIS
    Bu kuruluma ait çalışan ajan süreçlerini durdurur ve durdurulan sayıyı döner.

.DESCRIPTION
    Sıra önemli: önce `run-agent.cmd` döngüsü kapatılır, yoksa node öldükten 5 sn sonra ajanı
    yeniden başlatır. Sonra kilit dosyasındaki PID (otoriter kaynak — `cli.ts` onu yazar) ve
    son olarak yedek yol olarak kurulum klasörüne bağlı komut satırı deseni kullanılır.
#>
function Stop-RamosAgent {
    param(
        [Parameter(Mandatory = $true)][string]$InstallDir,
        [Parameter(Mandatory = $true)][string]$LogDir
    )

    # Adaylar önce toplanır, sonra SIRAYLA öldürülür — sıra önemli olduğu için tek listede
    # birleştirilmez.
    $targets = New-Object System.Collections.ArrayList

    # 1) Döngü betiği (yeniden başlatmayı önce kes)
    $cmdPattern = Get-RamosLikePattern (Join-Path $InstallDir 'run-agent.cmd')
    foreach ($p in @(Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" |
            Where-Object { $_.CommandLine -like $cmdPattern })) {
        [void]$targets.Add(@{ Id = [int]$p.ProcessId; Why = 'run-agent.cmd döngüsü' })
    }

    # 2) Kilit dosyasındaki PID — otoriter kaynak (yol yazımına duyarsız)
    $lockPid = Get-RamosLockPid -LogDir $LogDir
    if ($lockPid) {
        if (Get-Process -Id $lockPid -ErrorAction SilentlyContinue) {
            [void]$targets.Add(@{ Id = $lockPid; Why = "agent.lock (pid $lockPid)" })
        } else {
            Write-Host "  agent.lock'taki pid $lockPid artık çalışmıyor (bayat kilit)" -ForegroundColor Gray
        }
    }

    # 3) Yedek yol: kurulum klasörüne bağlı komut satırı deseni
    $nodePattern = Get-RamosLikePattern (Join-Path $InstallDir 'ramos-agent.mjs')
    foreach ($p in @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
            Where-Object { $_.CommandLine -like $nodePattern })) {
        [void]$targets.Add(@{ Id = [int]$p.ProcessId; Why = 'ramos-agent.mjs (komut satırı deseni)' })
    }

    $stopped = 0
    $seen = @{}
    foreach ($t in $targets) {
        if ($t.Id -eq $PID) { continue }             # kendimizi öldürmeyelim
        if ($seen.ContainsKey($t.Id)) { continue }   # aynı süreç iki yoldan da bulunmuş olabilir
        $seen[$t.Id] = $true
        try {
            Stop-Process -Id $t.Id -Force -ErrorAction Stop
            Write-Host "  durduruldu: pid $($t.Id) ($($t.Why))" -ForegroundColor Gray
            $stopped++
        } catch {
            Write-Host "  durdurulamadı: pid $($t.Id) ($($t.Why)) — $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    # `Stop-Process -Force` süreci TerminateProcess ile öldürür: ajanın kendi temizlik geri
    # çağrısı (kilidi silen `releaseLock`) ÇALIŞMAZ, `agent.lock` diskte kalır (M4). Bir
    # sonraki başlatma bayat kilidi devralabilir ama gereksiz bir uyarı basar — burada
    # temizliyoruz.
    if ($stopped -gt 0) {
        $lockFile = Join-Path $LogDir 'agent.lock'
        if (Test-Path $lockFile) {
            Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
            Write-Host "  kilit dosyası silindi: $lockFile" -ForegroundColor Gray
        }
    }

    return $stopped
}

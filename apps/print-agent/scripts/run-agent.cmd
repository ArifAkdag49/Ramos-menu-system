@echo off
setlocal enabledelayedexpansion
rem Ramo's yazdirma ajanini sonsuz donguede calistirir: surec herhangi bir sebeple sonlanirsa
rem 5 saniye sonra yeniden baslatilir. Zamanlanmis Gorev'in kendi yeniden baslatma sayacina
rem ek bir guvenlik agidir.
rem
rem NOT: cmd.exe toplu is dosyalarini OEM kod sayfasiyla okudugu icin bu dosya bilerek
rem yalnizca ASCII karakter icerir (Turkce harf yok).
rem
rem Dosya kurulum klasorune (varsayilan %LOCALAPPDATA%\RamosPrintAgent) ramos-agent.mjs ile
rem yan yana kopyalanir; tum yollar bu yuzden %~dp0 (betigin klasoru) uzerinden kurulur.
cd /d "%~dp0"
if not exist logs mkdir logs

rem M3: Zamanlanmis Gorev oturumdan FARKLI bir PATH gorebilir. install-agent.ps1
rem (Get-Command node).Source degerini node-path.txt'ye yazar; yoksa PATH'teki node kullanilir.
set "NODE_EXE=node"
if exist "%~dp0node-path.txt" set /p NODE_EXE=<"%~dp0node-path.txt"

rem R84(b): art arda 10 saniyeden kisa omurlu 3 cikis = kurtarilamaz hata (.env eksik/bozuk,
rem kilit reddi, node bulunamadi). Sessizce sonsuza dek denemek yerine gorunur bir iz birakip
rem duruyoruz; gorev hata ile bittigi icin Gorev Zamanlayici "Running" yerine son sonucu
rem gosterir ve kendi yeniden baslatma sayacini (1 dk arayla) isletir.
set "FAST=0"

:loop
if exist "%~dp0logs\console.log" for %%A in ("%~dp0logs\console.log") do if %%~zA GTR 5242880 move /y "%~dp0logs\console.log" "%~dp0logs\console.1.log" > nul

call :now T0
"%NODE_EXE%" "%~dp0ramos-agent.mjs" run >> "%~dp0logs\console.log" 2>&1
set "RC=!ERRORLEVEL!"
call :now T1

rem Saat okunamadiysa (T0/T1 = 0) ya da fark negatifse (2038 tasmasi / saat degisimi) surey
rem BILINMIYOR sayilir ve "uzun" kabul edilir: yanlis yere durmaktansa denemeye devam etmek
rem guvenli yondur. Bu durumda R84(b) korumasi sessizce devre disi kalir.
set "LIVED=999"
if not "!T0!"=="0" if not "!T1!"=="0" set /a LIVED=T1-T0
if !LIVED! LSS 0 set "LIVED=999"

if !LIVED! GEQ 10 (set "FAST=0") else (set /a FAST+=1)
if !FAST! GEQ 3 goto fatal

rem R84(a): bekleme konsoldan BAGIMSIZ olmali. `timeout` konsolsuz baglamda (S4U / "kullanici
rem oturum acmasa da calistir") "Input redirection is not supported" deyip ANINDA doner ve
rem :loop %100 CPU'ya oturur.
ping -n 6 127.0.0.1 > nul
goto loop

:fatal
call :stamp TS
> "%~dp0logs\FATAL.txt" echo [!TS!] Ramos yazdirma ajani art arda 3 kez 10 saniyeden kisa surede kapandi.
>> "%~dp0logs\FATAL.txt" echo Son cikis kodu: !RC!
>> "%~dp0logs\FATAL.txt" echo Muhtemel sebepler: .env eksik/bozuk, tek-ornek kilidi reddi, node bulunamadi.
>> "%~dp0logs\FATAL.txt" echo Ayrinti: logs\console.log ve ajan gunlugu (agent-*.log).
>> "%~dp0logs\FATAL.txt" echo Duzelttikten sonra: Start-ScheduledTask -TaskName RamosPrintAgent
endlocal
exit /b 1

:stamp
rem Yerel ayardan bagimsiz, okunabilir zaman damgasi (%DATE% OEM kod sayfasinda bozuk cikar).
set "%~1=?"
for /f "usebackq delims=" %%S in (`powershell -NoProfile -NonInteractive -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"`) do set "%~1=%%S"
exit /b 0

:now
rem Yerel ayardan bagimsiz UTC saniye. %TIME% bicimi yerel ayara gore degistigi icin
rem kullanilmaz. Yalniz ajan oldugunde calisir, maliyeti onemsizdir.
set "%~1=0"
for /f "usebackq delims=" %%S in (`powershell -NoProfile -NonInteractive -Command "[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()"`) do set "%~1=%%S"
exit /b 0

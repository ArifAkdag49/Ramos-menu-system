@echo off
rem Ramo's yazdirma ajanini sonsuz donguede calistirir: surec herhangi bir sebeple sonlanirsa
rem (cokme, olumcul hata, operatorun pencereyi kapatmasi) 5 saniye sonra yeniden baslatilir.
rem Zamanlanmis Gorev'in kendi yeniden baslatma sayacina ek bir guvenlik agidir.
rem NOT: bu dosya cmd.exe tarafindan OEM kod sayfasiyla okundugu icin bilerek yalnizca ASCII
rem karakter icerir (Turkce harf yok) - aksi halde yorum satirlari bozuk gorunur.
rem Dosya kurulum klasorune (%LOCALAPPDATA%\RamosPrintAgent) ramos-agent.mjs ile yan yana
rem kopyalanir; tum yollar bu yuzden %~dp0 (betigin klasoru) uzerinden kurulur.
cd /d "%~dp0"
if not exist logs mkdir logs
:loop
rem console.log yalniz beklenmeyen cokmelerin yigin izini tasir (ajanin kendi JSON gunlugu
rem LOG_DIR'e yazilir ve orada dondurulur). Kalici bir cokme dongusunde dosya sinirsiz
rem buyuyecegi icin 5 MB'i asinca kenara cekilir.
if exist "%~dp0logs\console.log" for %%A in ("%~dp0logs\console.log") do if %%~zA GTR 5242880 move /y "%~dp0logs\console.log" "%~dp0logs\console.1.log" > nul
node "%~dp0ramos-agent.mjs" run >> "%~dp0logs\console.log" 2>&1
timeout /t 5 /nobreak > nul
goto loop

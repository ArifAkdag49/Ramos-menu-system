@echo off
title Ramo's Yazici Kurulumu
if not exist "%~dp0scripts\kurulum.ps1" goto zipten
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\kurulum.ps1" %*
echo.
pause
exit /b
:zipten
echo.
echo  ZIP DOSYASININ ICINDEN CALISTIRILDI - kurulum boyle calismaz.
echo  1) Once ZIP dosyasina sag tiklayin ve "Tumunu ayikla" secin.
echo  2) Acilan klasordeki RamosYaziciKurulum icinde bu dosyayi tekrar calistirin.
echo.
echo  Direkt aus der ZIP-Datei gestartet - so funktioniert es nicht.
echo  1) Rechtsklick auf die ZIP-Datei und "Alle extrahieren" waehlen.
echo  2) Im entpackten Ordner RamosYaziciKurulum diese Datei erneut starten.
echo.
pause

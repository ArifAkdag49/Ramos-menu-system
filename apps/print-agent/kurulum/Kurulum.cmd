@echo off
title Ramo's Yazici Kurulumu
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\kurulum.ps1" %*
echo.
pause

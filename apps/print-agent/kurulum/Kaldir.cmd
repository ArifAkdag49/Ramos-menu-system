@echo off
title Ramo's Yazici Kaldirma
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall-agent.ps1" %*
echo.
pause

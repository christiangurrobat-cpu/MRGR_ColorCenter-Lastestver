@echo off
title MRGR Color Center Server
cd /d "%~dp0"

:: Ensure MRGR_ColorCenter is mapped to 127.0.0.1 in Windows hosts file
findstr /I "MRGR_ColorCenter" "%SystemRoot%\System32\drivers\etc\hosts" >nul 2>&1
if %errorlevel% neq 0 (
    echo Mapping http://MRGR_ColorCenter to 127.0.0.1 ^(requires Administrator once^)...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c echo.>>\"%SystemRoot%\System32\drivers\etc\hosts\" && echo 127.0.0.1 MRGR_ColorCenter>>\"%SystemRoot%\System32\drivers\etc\hosts\" && ipconfig /flushdns' -Verb RunAs -Wait"
)

:: Stop any existing PHP built-in server instance
taskkill /F /IM php.exe >nul 2>&1

echo Starting MRGR Color Center on http://MRGR_ColorCenter...
start http://MRGR_ColorCenter
php -S 0.0.0.0:80
pause

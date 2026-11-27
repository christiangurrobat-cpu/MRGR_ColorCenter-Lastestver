@echo off
title MRGR Color Center Server
cd /d "%~dp0"

set "PORT=80"
set "HOST_NAME=MRGR_ColorCenter"
set "URL=http://%HOST_NAME%"

:: 1. Locate PHP executable
set "PHP_EXE="
where php >nul 2>&1 && set "PHP_EXE=php"
if not defined PHP_EXE if exist "C:\php\php.exe" set "PHP_EXE=C:\php\php.exe"
if not defined PHP_EXE if exist "C:\xampp\php\php.exe" set "PHP_EXE=C:\xampp\php\php.exe"
if not defined PHP_EXE (
    echo [ERROR] PHP executable not found. Please install PHP or add it to PATH.
    pause
    exit /b 1
)

:: 2. Ensure MRGR_ColorCenter is mapped to 127.0.0.1 in Windows hosts file (only prompts UAC if missing)
findstr /I "%HOST_NAME%" "%SystemRoot%\System32\drivers\etc\hosts" >nul 2>&1
if %errorlevel% neq 0 (
    echo Mapping %URL% to 127.0.0.1 ^(requires Administrator once^)...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c echo.>>\"%SystemRoot%\System32\drivers\etc\hosts\" && echo 127.0.0.1 %HOST_NAME%>>\"%SystemRoot%\System32\drivers\etc\hosts\" && ipconfig /flushdns' -Verb RunAs -Wait"
)

:: 3. Check MariaDB / MySQL service status
powershell -NoProfile -Command "$svc = Get-Service *maria*,*mysql* -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' }; if (-not $svc) { Write-Host '[WARNING] MariaDB/MySQL service does not appear to be running. Please start MariaDB/XAMPP MySQL first.' -ForegroundColor Yellow }"

:: 4. Stop any previous PHP server bound specifically to port 80 and warn if another program holds port 80
powershell -NoProfile -Command "$conns = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; foreach ($c in $conns) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'php') { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } elseif ($p) { Write-Host ('[WARNING] Port %PORT% is currently used by ' + $p.ProcessName + ' (PID ' + $p.Id + '). Stop it if startup fails.') -ForegroundColor Yellow } }"

echo ====================================================
echo Starting MRGR Color Center — Sales ^& Inventory System
echo Primary URL:  %URL%
echo Fallback URL: http://localhost
echo ====================================================

:: 5. Launch browser only after local port 80 responds
start "" /b powershell -NoProfile -Command "for ($i=0; $i -lt 30; $i++) { try { $t = New-Object System.Net.Sockets.TcpClient('127.0.0.1', %PORT%); $t.Close(); Start-Process '%URL%/?login=1'; break } catch { Start-Sleep -Milliseconds 250 } }"

"%PHP_EXE%" -S 0.0.0.0:%PORT% index.php
pause

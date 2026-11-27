@echo off
title Stop MRGR Color Center Server
powershell -NoProfile -Command "$stopped = 0; foreach ($port in @(80, 8080)) { $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; foreach ($c in $conns) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'php') { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; $stopped++ } } }; if ($stopped -gt 0) { Write-Host 'MRGR Color Center server stopped.' } else { Write-Host 'No MRGR Color Center PHP server was running.' }"
timeout /t 2 >nul
